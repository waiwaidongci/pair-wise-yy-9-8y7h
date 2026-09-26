// 页面：底片建档、工艺步骤登记（含温湿度/记录人）、复检与环境修正重判

import { fields as itemFields } from "./archive.js";
import { ENV_STEPS, PROCESS_STEPS, stages } from "./rules.js";

const extraFields = [["developStatus", "显影状态"], ["defect", "缺陷类型"], ["repair", "修补记录"], ["note", "备注"]];

export function page() {
  const clientFields = JSON.stringify(itemFields);
  const clientStages = JSON.stringify(stages);
  const clientProcess = JSON.stringify(PROCESS_STEPS);
  const clientEnv = JSON.stringify(ENV_STEPS);
  const clientExtra = JSON.stringify(extraFields);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古法蓝晒底片整理室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --alert:#8a6d1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; } h4 { margin:14px 0 6px; font-size:14px; }
    main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:60px; }
    .envbox { border:1px dashed var(--line); border-radius:8px; padding:6px 12px 12px; margin-top:12px; background:#f7f9f5; } .envbox b { font-size:13px; color:var(--accent); }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 12px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.small { padding:5px 9px; font-size:12px; font-weight:400; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .badge { display:inline-block; border-radius:999px; padding:2px 8px; font-size:12px; margin-right:5px; }
    .badge.warn { background:#f7e4df; color:var(--warn); border:1px solid #e0b4a8; }
    .badge.alert { background:#f6efd9; color:var(--alert); border:1px solid #ddc98c; }
    .badge.aff { background:#e6eaf3; color:#3c5a8a; border:1px solid #b9c6df; }
    .banner { border:1px solid #ddc98c; background:#f6efd9; color:#5d4c16; border-radius:8px; padding:10px 12px; margin:10px 0; font-size:13px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:80px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    .detail-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .timeline { display:grid; gap:10px; margin-top:8px; }
    .step { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fcfdfb; }
    .step .row { font-size:13px; margin:3px 0; } .step .envline { background:#eef3ea; border-radius:6px; padding:8px 10px; margin:8px 0; font-size:13px; }
    .mini { display:none; border:1px solid var(--line); border-radius:8px; padding:10px; margin-top:8px; background:#fff; }
    .mini.open { display:block; } .mini .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .rechecks { font-size:12px; color:var(--muted); margin-top:6px; } .rechecks .arch { color:#9aa397; text-decoration:line-through; }
    .archive-item { font-size:12px; color:var(--muted); border-top:1px dashed var(--line); padding:6px 0; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header><div><h1>古法蓝晒底片整理室</h1><div class="meta">涂布、曝光、入盒前登记温湿度与记录人；超湿或大温差安排复检，修正后沿用步骤退回重判</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增底片</h2><div id="fields"></div><label>初始状态</label><select name="status">${stages.map(s => '<option>' + s + '</option>').join('')}</select><div style="margin-top:12px"><button>保存底片</button></div></form>
      <form id="actionForm" style="margin-top:14px">
        <h2>记录工艺步骤</h2>
        <label>选择底片</label><select name="id" id="itemSelect"></select>
        <label>步骤</label><select name="step" id="stepSelect"></select>
        <div id="extraFields"></div>
        <div class="envbox" id="envBox" style="display:none"><b>环境登记（涂布 / 曝光 / 入盒前必填）</b>
          <label>温度（℃）</label><input name="temp" type="number" step="0.1">
          <label>相对湿度（%，超过70%安排复检）</label><input name="humidity" type="number" step="0.1" min="0" max="100">
          <label>记录人</label><input name="recorder">
        </div>
        <div style="margin-top:12px"><button>提交记录</button></div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stages.map(s => '<option>' + s + '</option>').join('')}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div id="detailSlot"></div>
      <div class="panel"><h2>创建蓝晒任务后，按涂布、晾干、曝光、冲洗、复晒、入盒记录每一步历史。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const fields = ${clientFields};
    const stages = ${clientStages};
    const processSteps = ${clientProcess};
    const envSteps = ${clientEnv};
    const extraFields = ${clientExtra};
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const stepSelect = document.querySelector('#stepSelect');
    const envBox = document.querySelector('#envBox');
    const detailSlot = document.querySelector('#detailSlot');
    let items = [];
    let detailId = null;

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    function fmt(at) {
      if (!at) return '';
      const d = new Date(at);
      if (isNaN(d)) return esc(at);
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? Object.assign({}, options, { headers: { 'Content-Type': 'application/json' } }) : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function isPending(s) { return !!s.env && (s.env.needsRejudge || (s.env.flagged && !(s.rechecks || []).some(r => !r.archived && r.result === 'pass'))); }

    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(function(f){ return '<label>' + f[1] + '</label><input name="' + f[0] + '" type="' + f[2] + '"' + (f[0] === 'code' ? ' required' : '') + '>'; }).join('');
      stepSelect.innerHTML = processSteps.map(function(s){ return '<option>' + s + '</option>'; }).join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(function(f){ return '<label>' + f[1] + '</label><input name="' + f[0] + '">'; }).join('');
      toggleEnvBox();
    }
    function toggleEnvBox() { envBox.style.display = envSteps.includes(stepSelect.value) ? 'block' : 'none'; }

    function render() {
      itemSelect.innerHTML = items.map(function(item){ return '<option value="' + esc(item.id || item.code) + '">' + esc(item.code || item.id) + ' · ' + esc(item.plateSize || item.chemicalBatch || '') + '</option>'; }).join('');
      const stats = Object.fromEntries(stages.map(function(s){ return [s, items.filter(function(i){ return i.status === s; }).length]; }));
      statsEl.innerHTML = Object.entries(stats).map(function(kv){ return '<div class="stat"><span>' + kv[0] + '</span><strong>' + kv[1] + '</strong></div>'; }).join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(function(item){
        const hit = !q || JSON.stringify(item).includes(q);
        return (!status || item.status === status) && hit;
      });
      cards.innerHTML = visible.map(cardHtml).join('');
      renderDetail();
    }

    function envLine(item) {
      if (!item.lastEnv) return '<div class="meta">尚无环境登记</div>';
      const e = item.lastEnv;
      return '<div class="meta">末次环境（' + esc(e.step) + '）：' + esc(e.temp) + '℃ / ' + esc(e.humidity) + '%，记录人 ' + esc(e.recorder) + (e.flagged ? ' <span class="warn">异常待复检</span>' : '') + '</div>';
    }
    function cardHtml(item) {
      const main = fields.slice(0, 4).map(function(f){ return '<div><b>' + f[1] + '</b> ' + esc(item[f[0]]) + '</div>'; }).join('');
      const badges = (item.pendingCount ? '<span class="badge warn">待复检 ' + item.pendingCount + '</span>' : '') + (item.affectedCount ? '<span class="badge aff">退回重判 ' + item.affectedCount + '</span>' : '');
      return '<article class="card"><h3>' + esc(item.code || item.id) + '</h3>'
        + '<span class="pill">' + esc(item.status) + '</span>' + badges
        + main + envLine(item)
        + '<label>状态</label><select data-status="' + esc(item.id || item.code) + '">' + stages.map(function(s){ return '<option' + (s === item.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>'
        + '<div><button class="secondary small" data-detail="' + esc(item.id || item.code) + '">底片详情</button> <button class="secondary small" data-note="' + esc(item.id || item.code) + '">追加备注</button></div>'
        + '<div class="logs meta">记录 ' + (item.logCount || 0) + ' 条</div></article>';
    }

    function badgesFor(s) {
      let out = '';
      if (s.env && s.env.flagged) out += '<span class="badge warn">环境异常</span>';
      if (s.env && s.env.blocked) out += '<span class="badge warn">暂缓入盒</span>';
      if (s.affected) out += '<span class="badge aff">受影响·待重判</span>';
      if (isPending(s)) out += '<span class="badge alert">待复检</span>';
      return out;
    }
    function rechecksHtml(s) {
      const list = (s.rechecks || []).map(function(r){
        return '<div class="' + (r.archived ? 'arch' : '') + '">复检 ' + esc(r.result === 'pass' ? '合格' : '不合格') + ' · ' + fmt(r.at) + ' · 复检人 ' + esc(r.recorder) + (r.note ? ' · ' + esc(r.note) : '') + (r.archived ? '（已留档：' + esc(r.archivedReason || '上游数据修正') + '）' : '') + '</div>';
      }).join('');
      return list ? '<div class="rechecks">' + list + '</div>' : '<div class="rechecks">暂无复检</div>';
    }
    function stepHtml(s) {
      const env = s.env ? '<div class="envline">温湿度：<b>' + esc(s.env.temp) + '℃ / ' + esc(s.env.humidity) + '%</b>'
        + (s.env.tempDelta == null ? '' : '（与上步温差 ' + esc(s.env.tempDelta) + '℃）') + '，记录人 ' + esc(s.env.recorder)
        + (s.env.flagged ? '<div class="warn">触发复检：' + esc(s.env.reasons.join('；')) + '</div>' : '') + '</div>' : '<div class="envline">本步骤无环境登记</div>';
      const actions = s.env ? '<div style="margin-top:6px"><button class="small" data-toggle="recheck-' + esc(s.id) + '">登记复检</button> <button class="secondary small" data-toggle="correct-' + esc(s.id) + '">修正环境数据</button></div>' : '';
      const mini = s.env ? '<form class="mini" id="recheck-' + esc(s.id) + '" data-kind="recheck" data-step="' + esc(s.id) + '">'
          + '<label>复检结果</label><select name="result"><option value="pass">合格</option><option value="fail">不合格</option></select>'
          + '<label>复检人</label><input name="recorder">'
          + '<label>说明</label><input name="note">'
          + '<div style="margin-top:8px"><button class="small">提交复检（旧结果留档）</button></div></form>'
        + '<form class="mini" id="correct-' + esc(s.id) + '" data-kind="correct" data-step="' + esc(s.id) + '">'
          + '<div class="row2"><div><label>修正温度（℃）</label><input name="temp" type="number" step="0.1" value="' + esc(s.env.temp) + '"></div>'
          + '<div><label>修正湿度（%）</label><input name="humidity" type="number" step="0.1" min="0" max="100" value="' + esc(s.env.humidity) + '"></div></div>'
          + '<label>修正人</label><input name="by">'
          + '<div style="margin-top:8px"><button class="small">确认修正（本步及后续步骤退回重判）</button></div></form>' : '';
      return '<div class="step"><div class="detail-head"><div><b>' + esc(s.step) + '</b> ' + badgesFor(s) + '</div><span class="meta">' + fmt(s.at) + '</span></div>'
        + env
        + (s.developStatus ? '<div class="row">显影状态：' + esc(s.developStatus) + '</div>' : '')
        + (s.defect ? '<div class="row">缺陷：' + esc(s.defect) + '</div>' : '')
        + (s.repair ? '<div class="row">修补：' + esc(s.repair) + '</div>' : '')
        + (s.note ? '<div class="row">备注：' + esc(s.note) + '</div>' : '')
        + rechecksHtml(s) + actions + mini + '</div>';
    }
    function archivesHtml(item) {
      const rows = (item.archives || []).map(function(a){
        return '<div class="archive-item">' + fmt(a.at) + ' · ' + esc(a.type || '环境数据修正')
          + (a.step ? '（' + esc(a.step) + '）' : '') + ' · 操作人 ' + esc(a.by || '')
          + (a.from ? '：' + esc(a.from.temp) + '℃/' + esc(a.from.humidity) + '% → ' + esc(a.to.temp) + '℃/' + esc(a.to.humidity) + '%' : '')
          + (a.affectedSteps ? '；受影响步骤：' + esc(a.affectedSteps.join('、')) : '') + '</div>';
      }).join('');
      return rows ? '<h4>留档（不可删除）</h4>' + rows : '<div class="meta">暂无修正留档</div>';
    }
    function renderDetail() {
      if (!detailId) { detailSlot.innerHTML = ''; return; }
      const item = items.find(function(i){ return (i.id || i.code) === detailId; });
      if (!item) { detailId = null; detailSlot.innerHTML = ''; return; }
      const pending = (item.steps || []).filter(isPending);
      const affected = (item.steps || []).filter(function(s){ return s.affected; });
      const banner = pending.length ? '<div class="banner">以下步骤待复检，复检合格前不能入盒/交付：' + esc(pending.map(function(s){ return s.step + '(' + fmt(s.at) + ')'; }).join('、')) + '</div>' : '';
      const affectedBlock = affected.length ? '<h4>受影响步骤（退回重判）</h4><div>' + affected.map(function(s){ return '<span class="badge aff">' + esc(s.step) + '</span>'; }).join('') + '</div>' : '';
      detailSlot.innerHTML = '<div class="panel" style="margin-bottom:14px"><div class="detail-head"><h2>' + esc(item.code || item.id) + ' · 底片详情 <span class="pill">' + esc(item.status) + '</span></h2><button class="secondary small" data-close-detail>收起详情</button></div>'
        + banner + affectedBlock
        + '<h4>各步骤温湿度与复检</h4><div class="timeline">' + (item.steps || []).map(stepHtml).join('') + '</div>'
        + '<h4>修正与复检留档</h4>' + archivesHtml(item)
        + '<h4>操作日志</h4><div class="meta">' + (item.logs || []).slice(-8).map(function(l){ return '<div>' + fmt(l.at) + ' ' + esc(l.step) + '：' + esc(l.note) + '</div>'; }).join('') + '</div>'
        + '</div>';
      detailSlot.querySelectorAll('[data-toggle]').forEach(function(btn){
        btn.onclick = function(){ const f = document.getElementById(btn.dataset.toggle); if (f) f.classList.toggle('open'); };
      });
      detailSlot.querySelectorAll('form[data-kind]').forEach(function(f){
        f.onsubmit = async function(ev){
          ev.preventDefault();
          const payload = Object.fromEntries(new FormData(f).entries());
          try {
            if (f.dataset.kind === 'recheck') {
              await api('/api/items/' + encodeURIComponent(detailId) + '/steps/' + encodeURIComponent(f.dataset.step) + '/rechecks', { method: 'POST', body: JSON.stringify(payload) });
            } else {
              await api('/api/items/' + encodeURIComponent(detailId) + '/steps/' + encodeURIComponent(f.dataset.step) + '/correct', { method: 'POST', body: JSON.stringify(payload) });
            }
            await load();
          } catch (e) { alert(e.message); }
        };
      });
      const closeBtn = detailSlot.querySelector('[data-close-detail]');
      if (closeBtn) closeBtn.onclick = function(){ detailId = null; render(); };
    }

    async function load() {
      items = await api('/api/items');
      render();
    }
    createForm.onsubmit = async function(ev) {
      ev.preventDefault();
      await api('/api/items', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
      createForm.reset();
      await load();
    };
    actionForm.onsubmit = async function(ev) {
      ev.preventDefault();
      const payload = Object.fromEntries(new FormData(actionForm).entries());
      try {
        await api('/api/items/' + encodeURIComponent(payload.id) + '/action', { method: 'POST', body: JSON.stringify(payload) });
        actionForm.reset();
        toggleEnvBox();
        await load();
      } catch (e) { alert(e.message); }
    };
    cards.addEventListener('change', async function(ev){
      const sel = ev.target.closest('[data-status]');
      if (!sel) return;
      try { await api('/api/items/' + encodeURIComponent(sel.dataset.status), { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); }
      catch (e) { alert(e.message); await load(); }
    });
    cards.addEventListener('click', async function(ev){
      const detailBtn = ev.target.closest('[data-detail]');
      if (detailBtn) { detailId = detailBtn.dataset.detail; render(); return; }
      const noteBtn = ev.target.closest('[data-note]');
      if (noteBtn) {
        const note = prompt('记录备注');
        if (note) { await api('/api/items/' + encodeURIComponent(noteBtn.dataset.note) + '/logs', { method: 'POST', body: JSON.stringify({ step: '备注', note: note }) }); await load(); }
      }
    });
    document.querySelector('#statusFilter').onchange = render;
    document.querySelector('#search').oninput = render;
    document.querySelector('#reload').onclick = load;
    stepSelect.onchange = toggleEnvBox;
    renderForms();
    load();
  </script>
</body>
</html>`;
}
