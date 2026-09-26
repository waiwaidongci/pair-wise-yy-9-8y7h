// 存档：底片建档、工艺记录、环境登记、复检与修正留档的持久化层

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newStepId, recomputeEnv, deriveStatus } from "./rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "cyanotype-negative-room.json");

// 建档与工艺记录的字段继续沿用；温湿度/记录人只在涂布、曝光、入盒前强制登记
export const fields = [
  ["code", "底片编号", "text"],
  ["plateSize", "玻璃板尺寸", "text"],
  ["chemicalBatch", "药液批次", "text"],
  ["exposure", "曝光时间", "text"],
  ["waterSource", "冲洗水源", "text"],
  ["box", "存放盒位", "text"]
];

const seed = {
  "items": [
    {
      "code": "CN-001",
      "plateSize": "18x24cm",
      "chemicalBatch": "B-0620",
      "exposure": "8分钟",
      "waterSource": "井水过滤",
      "box": "蓝盒A-03",
      "status": "待入盒",
      "defect": "边角显影不均",
      "logs": [
        { "at": "2026-06-20", "step": "曝光", "note": "阴天补时2分钟" },
        { "at": "2026-06-21T03:50:30.042Z", "step": "入盒", "note": "放入A盒" }
      ],
      "steps": [
        {
          "id": "ST-seed-001",
          "at": "2026-06-20T02:00:00.000Z",
          "step": "涂布",
          "developStatus": "",
          "defect": "",
          "repair": "",
          "note": "早晨涂布",
          "env": {
            "at": "2026-06-20T02:00:00.000Z",
            "temp": 24,
            "humidity": 62,
            "recorder": "陈师傅",
            "needsRejudge": false,
            "blocked": false,
            "tempDelta": null,
            "flagged": false,
            "reasons": []
          },
          "rechecks": [],
          "archives": [],
          "affected": false
        },
        {
          "id": "ST-seed-002",
          "at": "2026-06-20T03:20:00.000Z",
          "step": "曝光",
          "developStatus": "",
          "defect": "",
          "repair": "",
          "note": "阴天补时2分钟",
          "env": {
            "at": "2026-06-20T03:20:00.000Z",
            "temp": 30,
            "humidity": 76,
            "recorder": "陈师傅",
            "needsRejudge": false,
            "blocked": false,
            "tempDelta": 6,
            "flagged": true,
            "reasons": ["湿度76%超过70%", "温差6℃超过5℃"]
          },
          "rechecks": [],
          "archives": [],
          "affected": false
        },
        {
          "id": "ST-seed-003",
          "at": "2026-06-21T03:50:30.042Z",
          "step": "入盒",
          "developStatus": "稳定",
          "defect": "边角显影不均",
          "repair": "边角重涂",
          "note": "放入A盒",
          "env": {
            "at": "2026-06-21T03:50:30.042Z",
            "temp": 27,
            "humidity": 58,
            "recorder": "陈师傅",
            "needsRejudge": false,
            "blocked": true,
            "tempDelta": -3,
            "flagged": false,
            "reasons": []
          },
          "rechecks": [],
          "archives": [],
          "affected": false
        }
      ],
      "archives": []
    }
  ]
};

// 迁移旧存档：给老步骤补齐复检/留档字段；老 CN-001 数据保留
function migrate(db) {
  for (const item of db.items || []) {
    item.archives ||= [];
    item.steps ||= [];
    for (const step of item.steps) {
      step.id ||= newStepId();
      step.rechecks ||= [];
      step.archives ||= [];
      step.affected = !!step.affected;
      if (step.env) {
        step.env.needsRejudge = !!step.env.needsRejudge;
        step.env.blocked = !!step.env.blocked;
      }
    }
    recomputeEnv(item);
    item.status = deriveStatus(item);
  }
  return db;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return seed;
  }
  const raw = JSON.parse(await readFile(dbPath, "utf8"));
  return migrate(raw);
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}
