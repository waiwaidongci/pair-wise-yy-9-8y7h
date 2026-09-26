// 规则：涂布、曝光、入盒前的温湿度登记、复检判定与环境修正退回。
export const HUMIDITY_LIMIT = 70; // 湿度超过70%安排复检
export const TEMP_DIFF_LIMIT = 5; // 与上一环节温差超过5℃安排复检
export const ENV_STEPS = ["涂布", "曝光", "入盒"];

export function needsEnv(step) {
  return ENV_STEPS.includes(step);
}

// 对照阈值和上一环节环境记录，返回触发复检的原因列表。
export function evaluateEnv(record, prev) {
  const reasons = [];
  const humidity = Number(record.humidity);
  if (Number.isFinite(humidity) && humidity > HUMIDITY_LIMIT) {
    reasons.push(`湿度${humidity}%超过${HUMIDITY_LIMIT}%`);
  }
  if (prev) {
    const diff = Math.round(Math.abs(Number(record.temperature) - Number(prev.temperature)) * 10) / 10;
    if (Number.isFinite(diff) && diff > TEMP_DIFF_LIMIT) {
      reasons.push(`与上一环节(${prev.step})温差${diff}℃超过${TEMP_DIFF_LIMIT}℃`);
    }
  }
  return reasons;
}

export function hasOpenRecheck(item) {
  return (item.envRecords || []).some(r => r.recheckRequired && r.recheckStatus !== "合格");
}

export function openRechecks(item) {
  return (item.envRecords || []).filter(r => r.recheckRequired && r.recheckStatus !== "合格");
}

const stageOrder = ["待曝光", "冲洗中", "待入盒", "已交付"];
const statusAfterEnvStep = { "涂布": "待曝光", "曝光": "冲洗中", "入盒": "待入盒" };

// 修正环境数据：旧值与旧复检结果留档，沿用该批步骤的后续记录和交付退回重判。
export function correctEnvRecord(item, envId, patch, now) {
  const env = (item.envRecords || []).find(r => r.id === envId);
  if (!env) return null;

  // 旧值留档
  env.revisions ||= [];
  env.revisions.push({
    at: now,
    temperature: env.temperature,
    humidity: env.humidity,
    recorder: env.recorder,
    reason: patch.reason || "未填写"
  });
  if (patch.temperature !== undefined && patch.temperature !== "") env.temperature = Number(patch.temperature);
  if (patch.humidity !== undefined && patch.humidity !== "") env.humidity = Number(patch.humidity);
  if (patch.recorder) env.recorder = patch.recorder;

  const cut = env.at;
  // 沿用该批步骤的后续记录退回重判
  const affectedSteps = (item.steps || []).filter(s => s.at >= cut);
  for (const s of affectedSteps) {
    s.returned = true;
    s.returnReason = "环境数据修正，退回重判";
  }
  const affectedEnv = (item.envRecords || []).filter(r => r.at >= cut);

  // 旧复检结果留档
  const archived = [];
  const keep = [];
  for (const rc of item.rechecks || []) {
    if (affectedEnv.some(r => r.id === rc.envId)) archived.push(rc);
    else keep.push(rc);
  }
  item.rechecks = keep;
  item.recheckArchive ||= [];
  for (const rc of archived) {
    item.recheckArchive.push({ ...rc, archivedAt: now, archiveReason: "环境数据修正，复检结果留档" });
  }

  // 修正记录按新数据重新判定
  const idx = item.envRecords.indexOf(env);
  let prevEnv = null;
  for (let j = idx - 1; j >= 0; j--) {
    if (!item.envRecords[j].blocked) { prevEnv = item.envRecords[j]; break; }
  }
  const reasons = evaluateEnv(env, prevEnv);
  env.recheckReasons = reasons;
  env.recheckRequired = reasons.length > 0;
  env.recheckStatus = reasons.length ? "待复检" : null;

  // 后续环境记录一并退回重判（被拦截的留痕记录不参与温差链）
  for (let i = idx + 1; i < item.envRecords.length; i++) {
    const r = item.envRecords[i];
    if (r.blocked) continue;
    let prev = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!item.envRecords[j].blocked) { prev = item.envRecords[j]; break; }
    }
    const own = evaluateEnv(r, prev);
    r.recheckReasons = [...own, "前序环境数据修正，退回重判"];
    r.recheckRequired = true;
    r.recheckStatus = "待复检";
  }

  // 交付/入盒状态退回（只退不进）
  const returnedStatus = item.status;
  const target = statusAfterEnvStep[env.step] || "待曝光";
  if (stageOrder.indexOf(item.status) > stageOrder.indexOf(target)) {
    item.status = target;
  }

  return { env, affectedSteps, affectedEnv, archived, returnedStatus };
}
