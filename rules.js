// 业务规则：涂布/曝光/入盒前的温湿度登记、复检阈值、环境数据修正后的重判级联

export const HUMIDITY_LIMIT = 70; // 相对湿度 %，超过即安排复检
export const TEMP_DELTA_LIMIT = 5; // 与上一次登记的温差 ℃，超过即安排复检
export const ENV_STEPS = ["涂布", "曝光", "入盒"]; // 必须登记温湿度与记录人的步骤
export const PROCESS_STEPS = ["涂布", "晾干", "曝光", "冲洗", "复晒", "入盒", "交付"];
export const stages = ["待曝光", "冲洗中", "待复检", "待入盒", "已交付"];

const round1 = n => Math.round(n * 10) / 10;
const now = () => new Date().toISOString();
const clone = v => JSON.parse(JSON.stringify(v ?? null));

export const newStepId = () => "ST-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const newRecheckId = () => "RC-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const isEnvStep = step => ENV_STEPS.includes(step);

// 判定一次环境登记是否异常：湿度超限，或与上一登记步骤温差超限
export function evaluateEnv(prevTemp, temp, humidity) {
  const tempDelta = prevTemp == null ? null : round1(Number(temp) - Number(prevTemp));
  const reasons = [];
  if (Number(humidity) > HUMIDITY_LIMIT) reasons.push("湿度" + humidity + "%超过" + HUMIDITY_LIMIT + "%");
  if (tempDelta != null && Math.abs(tempDelta) > TEMP_DELTA_LIMIT) {
    reasons.push("温差" + tempDelta + "℃超过" + TEMP_DELTA_LIMIT + "℃");
  }
  return { tempDelta, flagged: reasons.length > 0, reasons };
}

export function lastEnvTemp(item) {
  const registered = (item.steps || []).filter(s => s.env);
  return registered.length ? registered[registered.length - 1].env.temp : null;
}

// 按步骤顺序重算整条温差链与异常标记（修正历史数据后使用）
export function recomputeEnv(item) {
  let prev = null;
  for (const step of item.steps || []) {
    if (!step.env) continue;
    Object.assign(step.env, evaluateEnv(prev, step.env.temp, step.env.humidity));
    prev = step.env.temp;
  }
}

export function hasPassingRecheck(step) {
  return (step.rechecks || []).some(r => !r.archived && r.result === "pass");
}

// 待处理：异常未通过复检，或被上游修正牵连、需要重新判定
export function isPending(step) {
  return !!step.env && (step.env.needsRejudge || (step.env.flagged && !hasPassingRecheck(step)));
}
export function pendingSteps(item) {
  return (item.steps || []).filter(isPending);
}
export function affectedSteps(item) {
  return (item.steps || []).filter(s => s.affected);
}

export function deriveStatus(item) {
  if (pendingSteps(item).length) return "待复检";
  const names = (item.steps || []).map(s => s.step);
  if (names.includes("交付")) return "已交付";
  if (names.includes("入盒")) return "待入盒";
  if (names.includes("冲洗") || names.includes("复晒")) return "冲洗中";
  return "待曝光";
}

export function findStep(item, stepId) {
  return (item.steps || []).find(s => s.id === stepId) || null;
}

function readEnv(input, at, item) {
  const temp = Number(input.temp);
  const humidity = Number(input.humidity);
  const recorder = String(input.recorder || "").trim();
  if (!Number.isFinite(temp)) throw new Error("请登记环境温度（℃）");
  if (!Number.isFinite(humidity)) throw new Error("请登记环境湿度（%）");
  if (humidity < 0 || humidity > 100) throw new Error("湿度应在 0-100% 之间");
  if (!recorder) throw new Error("请登记记录人");
  return {
    at,
    temp: round1(temp),
    humidity: round1(humidity),
    recorder,
    needsRejudge: false,
    blocked: false,
    ...evaluateEnv(lastEnvTemp(item), temp, humidity)
  };
}

// 登记一条工艺步骤（建档之外的日常工艺记录继续走这里）
export function applyAction(item, input) {
  const name = String(input.step || "").trim();
  if (!PROCESS_STEPS.includes(name)) throw new Error("步骤必须是：" + PROCESS_STEPS.join("、"));
  const at = now();
  const step = {
    id: newStepId(),
    at,
    step: name,
    developStatus: input.developStatus || "",
    defect: input.defect || "",
    repair: input.repair || "",
    note: input.note || "",
    env: null,
    rechecks: [],
    archives: [],
    affected: false
  };
  if (isEnvStep(name)) step.env = readEnv(input, at, item);
  item.steps ||= [];
  item.steps.push(step);
  if (step.defect) item.defect = step.defect;
  recomputeEnv(item);
  // 异常未解除时入盒只登记、暂缓，不进入待入盒
  if (name === "入盒" && step.env && pendingSteps(item).length) step.env.blocked = true;
  item.status = deriveStatus(item);
  return step;
}

// 登记复检结果；历史结果永不物理删除
export function applyRecheck(item, step, input) {
  if (!step.env) throw new Error("该步骤没有环境登记记录，无需复检");
  const result = input.result === "pass" || input.result === "fail" ? input.result : "";
  if (!result) throw new Error("请选择复检结果");
  const recorder = String(input.recorder || "").trim();
  if (!recorder) throw new Error("请登记复检人");
  const record = {
    id: newRecheckId(),
    at: now(),
    result,
    recorder,
    note: input.note || "",
    archived: false
  };
  step.rechecks ||= [];
  step.rechecks.push(record);
  if (result === "pass") step.env.needsRejudge = false;
  item.status = deriveStatus(item);
  return record;
}

// 修正某一步的温湿度：旧数据与旧复检结果留档，本步及沿用该批步骤的后续记录/交付全部退回重判
export function correctEnv(item, step, input) {
  if (!step.env) throw new Error("该步骤没有环境登记记录，无法修正");
  const temp = Number(input.temp);
  const humidity = Number(input.humidity);
  const by = String(input.by || input.recorder || "").trim();
  if (!Number.isFinite(temp)) throw new Error("请填写修正后的温度（℃）");
  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    throw new Error("请填写 0-100% 之间的修正湿度");
  }
  if (!by) throw new Error("请登记修正人");

  const at = now();
  const from = clone(step.env);
  // 旧复检结果随旧环境数据一起留档，不再作为判定依据
  step.archives.push({ at, type: "环境数据修正", by, from, rechecks: clone(step.rechecks) });
  for (const r of step.rechecks || []) {
    if (!r.archived) { r.archived = true; r.archivedReason = "本步环境数据已修正"; }
  }

  step.env.temp = round1(temp);
  step.env.humidity = round1(humidity);
  step.env.needsRejudge = true;
  step.env.blocked = false;
  step.affected = true;

  const idx = (item.steps || []).indexOf(step);
  const affectedNames = [step.step];
  for (let i = idx + 1; i < item.steps.length; i++) {
    const later = item.steps[i];
    later.affected = true;
    affectedNames.push(later.step);
    if (later.env) {
      later.env.needsRejudge = true;
      later.env.blocked = false;
      for (const r of later.rechecks || []) {
        if (!r.archived) { r.archived = true; r.archivedReason = "上游「" + step.step + "」环境数据修正"; }
      }
    }
  }

  recomputeEnv(item);
  item.archives ||= [];
  item.archives.push({
    at,
    by,
    step: step.step,
    stepId: step.id,
    from: { temp: from.temp, humidity: from.humidity },
    to: { temp: step.env.temp, humidity: step.env.humidity },
    affectedSteps: affectedNames
  });
  item.status = deriveStatus(item);
  return { step, affectedNames };
}

// 手动改状态时兜底：异常/重判未解除，不允许直接入盒或交付
export function assertCanSetStatus(item, status) {
  if ((status === "待入盒" || status === "已交付") && pendingSteps(item).length) {
    throw new Error("尚有环境异常或待重判步骤未完成复检，不能直接" + (status === "已交付" ? "交付" : "入盒"));
  }
}

export function summarize(item) {
  const envRegistered = (item.steps || []).filter(s => s.env);
  const lastEnvStep = envRegistered.length ? envRegistered[envRegistered.length - 1] : null;
  return {
    ...item,
    logCount: (item.logs || []).length,
    pendingCount: pendingSteps(item).length,
    affectedCount: affectedSteps(item).length,
    lastEnv: lastEnvStep ? {
      step: lastEnvStep.step,
      temp: lastEnvStep.env.temp,
      humidity: lastEnvStep.env.humidity,
      recorder: lastEnvStep.env.recorder,
      flagged: lastEnvStep.env.flagged
    } : null
  };
}
