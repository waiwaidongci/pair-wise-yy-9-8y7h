import http from "node:http";
import { loadDb, saveDb } from "./archive.js";
import {
  applyAction,
  applyRecheck,
  correctEnv,
  assertCanSetStatus,
  findStep,
  summarize,
  stages
} from "./rules.js";
import { page } from "./page.js";

const port = Number(process.env.PORT || 3040);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function newId() { return "CN-" + Date.now(); }

function computeStats(items) {
  const stats = Object.fromEntries(stages.map(label => [label, 0]));
  for (const item of items) if (stats[item.status] !== undefined) stats[item.status] += 1;
  return stats;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    const findItem = id => db.items.find(x => x.id === id || x.code === id);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, db.items.map(summarize));
    }
    if (req.method === "GET" && url.pathname === "/api/stats") {
      return send(res, 200, computeStats(db.items));
    }

    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      if (!input.code || !String(input.code).trim()) return send(res, 400, { error: "请填写底片编号" });
      const item = {
        id: newId(),
        ...input,
        status: input.status || "待曝光",
        defect: input.defect || "",
        steps: [],
        archives: [],
        logs: [{ at: new Date().toISOString(), step: "建档", note: "创建底片" }]
      };
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, summarize(item));
    }

    const stepRoute = url.pathname.match(/^\/api\/items\/([^/]+)\/steps\/([^/]+)\/(rechecks|correct)$/);
    if (stepRoute && req.method === "POST") {
      const item = findItem(stepRoute[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const step = findStep(item, stepRoute[2]);
      if (!step) return send(res, 404, { error: "step_not_found" });
      const input = await body(req);
      if (stepRoute[3] === "rechecks") {
        const record = applyRecheck(item, step, input);
        item.logs.push({
          at: new Date().toISOString(),
          step: "复检",
          note: step.step + "复检" + (record.result === "pass" ? "合格" : "不合格") + "，复检人：" + record.recorder
        });
      } else {
        const { affectedNames } = correctEnv(item, step, input);
        item.logs.push({
          at: new Date().toISOString(),
          step: "环境修正",
          note: "修正「" + step.step + "」温湿度，后续步骤退回重判：" + affectedNames.join("、")
        });
      }
      await saveDb(db);
      return send(res, 201, item);
    }

    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const item = findItem(action[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const step = applyAction(item, input);
      item.logs ||= [];
      if (step.env) {
        item.logs.push({
          at: new Date().toISOString(),
          step: input.step,
          note: "登记 " + step.env.temp + "℃ / " + step.env.humidity + "%，记录人：" + step.env.recorder
            + (step.env.flagged ? "；超阈值，安排复检：" + step.env.reasons.join("；") : "")
            + (step.env.blocked ? "；未解除前暂缓入盒" : "")
        });
      } else {
        item.logs.push({
          at: new Date().toISOString(),
          step: input.step || "工艺",
          note: input.note || input.developStatus || "步骤记录"
        });
      }
      await saveDb(db);
      return send(res, 201, summarize(item));
    }

    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = findItem(log[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
      await saveDb(db);
      return send(res, 201, item);
    }

    const single = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (single && req.method === "GET") {
      const item = findItem(single[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      return send(res, 200, item);
    }
    if (single && req.method === "PATCH") {
      const item = findItem(single[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      if (input.status) {
        assertCanSetStatus(item, input.status);
        if (!stages.includes(input.status)) return send(res, 400, { error: "未知状态" });
        item.status = input.status;
        item.logs ||= [];
        item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
      }
      await saveDb(db);
      return send(res, 200, summarize(item));
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    // 规则校验（缺字段、未复检不得入盒等）统一作为 400 返回
    send(res, 400, { error: error.message });
  }
});

server.listen(port, () => console.log("古法蓝晒底片整理室 listening on http://localhost:" + port));
