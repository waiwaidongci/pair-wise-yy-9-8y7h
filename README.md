# 古法蓝晒底片整理室

运行：

```bash
npm start
```

访问 `http://localhost:3040`。数据保存在 `data/cyanotype-negative-room.json`。

## 业务文件

- `rules.js` — 环境登记与复检规则：涂布/曝光/入盒前必须登记温度、湿度、记录人；湿度超过 70% 或与上一步温差超过 5℃ 安排复检；复检合格前暂缓入盒、禁止交付；环境数据修正后本步及沿用该批步骤的后续记录、交付全部退回重判，旧复检结果留档不删。
- `archive.js` — 存档层：底片建档、工艺步骤、环境登记、复检结果、修正留档的读写与旧数据迁移。
- `page.js` — 页面：建档、工艺记录、底片详情（受影响步骤、复检与留档时间线）。
- `server.js` — 路由编排，建档（`POST /api/items`）与工艺记录（`POST /api/items/:id/action`）保持原有用法。

## 新增接口

- `POST /api/items/:id/steps/:stepId/rechecks` — 登记复检结果（合格/不合格、复检人、说明）。
- `POST /api/items/:id/steps/:stepId/correct` — 修正某步温湿度（修正温度、修正湿度、修正人），自动级联退回重判并留档。
