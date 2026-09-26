import http from "node:http";
import { loadDb, saveDb } from "./archive.js";
import { needsEnv, evaluateEnv, hasOpenRecheck, openRechecks, correctEnvRecord } from "./rules.js";
import { page, stages } from "./page.js";

const port = Number(process.env.PORT || 3040);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
let seq = 0;
function newId(prefix) {
  seq += 1;
  return prefix + "-" + Date.now().toString(36) + seq.toString(36);
}
const findItem = (db, key) => db.items.find(x => x.id === key || x.code === key);
function computeStats(items) {
  const stats = Object.fromEntries(stages.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  stats["待复检"] = items.filter(hasOpenRecheck).length;
  return stats;
}
function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount, pendingRecheck: hasOpenRecheck(item) };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    if (req.method === "GET" && url.pathname === "/") return html(res, page());
    if (req.method === "GET" && url.pathname === "/api/items") return send(res, 200, db.items.map(summarize));
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = { id: newId("CN"), ...input, logs: [{ at: new Date().toISOString(), step: "建档", note: "创建底片" }] };
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, item);
    }
    const itemPath = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemPath && req.method === "GET") {
      const item = findItem(db, itemPath[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      return send(res, 200, {
        ...item,
        affectedSteps: (item.steps || []).filter(s => s.returned),
        openRechecks: openRechecks(item),
        recheckArchive: item.recheckArchive || []
      });
    }
    if (itemPath && req.method === "PATCH") {
      const item = findItem(db, itemPath[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      if (["待入盒", "已交付"].includes(input.status) && hasOpenRecheck(item)) {
        return send(res, 409, { error: "存在待复检的环境记录，不能直接入盒或交付" });
      }
      Object.assign(item, input);
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
      await saveDb(db);
      return send(res, 200, item);
    }
    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = findItem(db, log[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
      await saveDb(db);
      return send(res, 201, item);
    }
    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const item = findItem(db, action[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const now = new Date().toISOString();
      item.logs ||= [];
      item.steps ||= [];
      item.envRecords ||= [];
      let envRecord = null;
      let warning = null;
      if (needsEnv(input.step)) {
        const { temperature, humidity, recorder } = input;
        if (temperature === undefined || temperature === "" || humidity === undefined || humidity === "" || !recorder) {
          return send(res, 400, { error: "涂布、曝光、入盒前必须登记温度、湿度和记录人" });
        }
        // 被拦截的入盒登记只留痕，不作为后续温差比对的上一环节
        const prev = [...item.envRecords].reverse().find(r => !r.blocked);
        envRecord = { id: newId("ENV"), at: now, step: input.step, temperature: Number(temperature), humidity: Number(humidity), recorder };
        const reasons = evaluateEnv(envRecord, prev);
        if (reasons.length) {
          envRecord.recheckRequired = true;
          envRecord.recheckStatus = "待复检";
          envRecord.recheckReasons = reasons;
        }
        if (input.step === "入盒" && (reasons.length || hasOpenRecheck(item))) {
          envRecord.blocked = true;
          const why = [...reasons, ...(hasOpenRecheck(item) ? ["存在待复检的环境记录"] : [])];
          envRecord.blockedReason = why.join("；");
          item.envRecords.push(envRecord);
          item.logs.push({ at: now, step: "入盒拦截", note: why.join("；") });
          await saveDb(db);
          return send(res, 409, { error: "湿度超过70%或温差超过5℃，已安排复检，不能直接入盒", reasons: why });
        }
        item.envRecords.push(envRecord);
        item.logs.push({ at: now, step: "环境登记", note: `${input.step}前 ${envRecord.temperature}℃ / ${envRecord.humidity}% · 记录人${recorder}` });
        if (reasons.length) {
          warning = "已安排复检：" + reasons.join("；");
          item.logs.push({ at: now, step: "安排复检", note: warning });
        }
      }
      if ((input.step === "入盒" || input.step === "交付") && hasOpenRecheck(item)) {
        return send(res, 409, { error: "存在待复检的环境记录，不能直接入盒或交付" });
      }
      const { temperature, humidity, recorder, ...stepInput } = input;
      item.steps.push({ at: now, ...stepInput, ...(envRecord ? { envId: envRecord.id } : {}) });
      if (input.defect) item.defect = input.defect;
      if (input.step === "冲洗") item.status = "冲洗中";
      else if (input.step === "入盒") item.status = "待入盒";
      else if (input.step === "交付") item.status = "已交付";
      else item.status = "待曝光";
      item.logs.push({ at: now, step: input.step || "工艺", note: input.note || input.developStatus || "步骤记录" });
      await saveDb(db);
      return send(res, 201, { ...item, warning });
    }
    const rechecks = url.pathname.match(/^\/api\/items\/([^/]+)\/rechecks$/);
    if (rechecks && req.method === "POST") {
      const item = findItem(db, rechecks[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const env = (item.envRecords || []).find(r => r.id === input.envId);
      if (!env) return send(res, 404, { error: "env_record_not_found" });
      if (!env.recheckRequired || env.recheckStatus === "合格") return send(res, 409, { error: "该环境记录无需复检" });
      if (!["合格", "不合格"].includes(input.result)) return send(res, 400, { error: "复检结果须为合格或不合格" });
      const now = new Date().toISOString();
      env.recheckStatus = input.result;
      item.rechecks ||= [];
      item.rechecks.push({ id: newId("RC"), at: now, envId: env.id, step: env.step, result: input.result, recorder: input.recorder || "", note: input.note || "" });
      item.logs ||= [];
      item.logs.push({ at: now, step: "复检", note: `${env.step}环境复检${input.result}${input.note ? "：" + input.note : ""}` });
      if (input.result === "不合格") {
        item.status = "待曝光";
        item.logs.push({ at: now, step: "退回", note: "复检不合格，退回重做" });
      }
      await saveDb(db);
      return send(res, 201, item);
    }
    const envPatch = url.pathname.match(/^\/api\/items\/([^/]+)\/env\/([^/]+)$/);
    if (envPatch && req.method === "PATCH") {
      const item = findItem(db, envPatch[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const now = new Date().toISOString();
      const summary = correctEnvRecord(item, envPatch[2], input, now);
      if (!summary) return send(res, 404, { error: "env_record_not_found" });
      item.logs ||= [];
      item.logs.push({ at: now, step: "环境修正", note: `修正${summary.env.step}环境数据，${summary.affectedSteps.length}条后续步骤退回重判，${summary.archived.length}条复检结果留档` });
      if (["待入盒", "已交付"].includes(summary.returnedStatus)) {
        item.logs.push({ at: now, step: "退回重判", note: `状态由${summary.returnedStatus}退回${item.status}` });
      }
      await saveDb(db);
      return send(res, 200, { item, affectedSteps: summary.affectedSteps, archived: summary.archived });
    }
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));
    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});
server.listen(port, () => console.log("古法蓝晒底片整理室 listening on http://localhost:" + port));
