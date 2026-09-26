// 页面：整理室单页界面，含底片建档、工艺记录、环境登记、复检与详情。
export const stages = ["待曝光", "冲洗中", "待入盒", "已交付"];

const fields = [["code","底片编号","text"],["plateSize","玻璃板尺寸","text"],["chemicalBatch","药液批次","text"],["exposure","曝光时间","text"],["waterSource","冲洗水源","text"],["box","存放盒位","text"]];
const extraFields = [["developStatus","显影状态"],["defect","缺陷类型"],["repair","修补记录"],["note","备注"]];
const stepOptions = ["涂布","晾干","曝光","冲洗","复晒","入盒","交付"];

export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古法蓝晒底片整理室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:14px 0 8px; font-size:15px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; margin-top:10px; } button.secondary { background:#69736a; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { border-bottom:1px solid var(--line); padding:6px; text-align:left; vertical-align:top; }
    .cols { display:grid; grid-template-columns:1fr 1fr; gap:14px; } .btnrow { display:flex; gap:8px; } .btnrow button { flex:1; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .cols{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header><div><h1>古法蓝晒底片整理室</h1><div class="meta">底片任务、工艺步骤、温湿度复检和入盒交付</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增底片</h2><div id="fields"></div><label>初始状态</label><select name="status">${stages.map(s => '<option>'+s+'</option>').join('')}</select><button>保存底片</button></form>
      <form id="actionForm" style="margin-top:14px"><h2>记录工艺步骤</h2><label>选择底片</label><select name="id" id="itemSelect"></select><label>步骤</label><select name="step">${stepOptions.map(s => '<option>'+s+'</option>').join('')}</select><div id="extraFields"></div><label>温度℃</label><input name="temperature" type="number" step="0.1" placeholder="涂布/曝光/入盒必填"><label>湿度%</label><input name="humidity" type="number" step="0.1" placeholder="涂布/曝光/入盒必填"><label>记录人</label><input name="recorder" placeholder="涂布/曝光/入盒必填"><button>提交记录</button><div class="meta" style="margin-top:8px">涂布、曝光、入盒前必须登记温湿度和记录人；湿度超过70%或与上一环节温差超过5℃将安排复检，复检合格前不能入盒或交付。</div></form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stages.map(s => '<option>'+s+'</option>').join('')}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel" id="detail" style="display:none;margin-bottom:14px"></div>
      <div class="panel"><h2>创建蓝晒任务后，按涂布、晾干、曝光、冲洗、复晒、入盒记录每一步历史。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const fields = ${JSON.stringify(fields)};
    const stages = ${JSON.stringify(stages)};
    const extraFields = ${JSON.stringify(extraFields)};
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const detailEl = document.querySelector('#detail');
    let items = [];
    let currentDetail = null;
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
    }
    function render() {
      itemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.name || item.shipType || item.source || item.plateSize || '')+'</option>').join('');
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      stats['待复检'] = items.filter(i => i.pendingRecheck).length;
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(item => cardHtml(item)).join('');
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { try { await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); } catch (err) { alert(err.message); await load(); } });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { try { await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } catch (err) { alert(err.message); } } });
      document.querySelectorAll('[data-detail]').forEach(btn => btn.onclick = () => openDetail(btn.dataset.detail).catch(err => alert(err.message)));
    }
    function cardHtml(item) {
      const key = item.id || item.code;
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const tasks = (item.tasks || []).map(t => '<div class="meta">任务 '+t.position+' · '+t.status+' · '+t.tension+'</div>').join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
      const recheck = item.pendingRecheck ? '<span class="pill warn">待复检</span>' : '';
      return '<article class="card"><h3>'+(item.code || item.id)+'</h3><span class="pill">'+item.status+'</span>'+recheck+main+tasks+'<label>状态</label><select data-status="'+key+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><div class="btnrow"><button class="secondary" data-note="'+key+'">追加备注</button><button class="secondary" data-detail="'+key+'">详情</button></div><div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }
    function detailHtml(item) {
      const envs = item.envRecords || [];
      const envRows = envs.map(r => '<tr><td>'+r.step+(r.blocked ? '<div class="warn">入盒拦截留痕</div>' : '')+'</td><td>'+r.at+'</td><td>'+r.temperature+'℃</td><td>'+r.humidity+'%</td><td>'+r.recorder+'</td><td>'+(r.blocked ? '<span class="warn">未入盒</span> '+(r.blockedReason || '') : (r.recheckRequired ? '<span class="warn">'+(r.recheckStatus || '待复检')+'</span> '+((r.recheckReasons || []).join('；')) : '正常'))+((r.revisions && r.revisions.length) ? '<div class="meta">修正'+r.revisions.length+'次，旧值已留档</div>' : '')+'</td></tr>').join('');
      const envTable = envs.length ? '<table><tr><th>环节</th><th>时间</th><th>温度</th><th>湿度</th><th>记录人</th><th>复检</th></tr>'+envRows+'</table>' : '<div class="meta">暂无环境登记</div>';
      const affected = ((item.affectedSteps || []).map(s => '<div class="warn">'+s.step+' · '+s.at+' · '+(s.returnReason || '退回重判')+'</div>').join('')) || '<div class="meta">无受影响步骤</div>';
      const open = (item.openRechecks || []).map(r => '<div class="warn">'+r.step+'环境记录待复检：'+((r.recheckReasons || []).join('；'))+'</div>').join('');
      const rechecks = ((item.rechecks || []).map(rc => '<div>'+rc.at+' · '+rc.step+' · '+rc.result+' · '+rc.recorder+' '+rc.note+'</div>').join('')) || '<div class="meta">暂无复检记录</div>';
      const archive = ((item.recheckArchive || []).map(rc => '<div class="meta">'+rc.at+' · '+rc.step+' · '+rc.result+' · '+rc.recorder+'（留档于'+rc.archivedAt+'：'+rc.archiveReason+'）</div>').join('')) || '<div class="meta">暂无留档</div>';
      const openOptions = envs.filter(r => r.recheckRequired && r.recheckStatus !== '合格').map(r => '<option value="'+r.id+'">'+r.step+' · '+r.at+'</option>').join('');
      const recheckForm = openOptions ? '<form id="recheckForm"><h3>提交复检</h3><label>环境记录</label><select name="envId">'+openOptions+'</select><label>复检结果</label><select name="result"><option>合格</option><option>不合格</option></select><label>复检人</label><input name="recorder" required><label>备注</label><input name="note"><button>提交复检</button></form>' : '<div class="panel meta">当前无需复检的环境记录</div>';
      const envOptions = envs.map(r => '<option value="'+r.id+'">'+r.step+' · '+r.at+'</option>').join('');
      const fixForm = envOptions ? '<form id="envFixForm"><h3>修正环境数据</h3><label>环境记录</label><select name="envId">'+envOptions+'</select><label>温度℃</label><input name="temperature" type="number" step="0.1"><label>湿度%</label><input name="humidity" type="number" step="0.1"><label>修正人</label><input name="recorder"><label>修正原因</label><input name="reason" required><button>提交修正</button><div class="meta" style="margin-top:8px">修正后沿用该批步骤的后续记录和交付将退回重判，旧复检结果留档。</div></form>' : '<div class="panel meta">暂无环境记录可修正</div>';
      return '<div style="display:flex;justify-content:space-between;align-items:center"><h2>底片详情 '+(item.code || item.id)+'</h2><button class="secondary" id="closeDetail">关闭</button></div>'
        + '<h3>环境登记</h3>'+envTable
        + '<h3>受影响步骤（退回重判）</h3>'+affected+open
        + '<h3>复检记录</h3>'+rechecks
        + '<h3>复检留档</h3>'+archive
        + '<div class="cols">'+recheckForm+fixForm+'</div>';
    }
    async function openDetail(key) {
      currentDetail = key;
      const item = await api('/api/items/' + key);
      detailEl.style.display = 'block';
      detailEl.innerHTML = detailHtml(item);
      document.querySelector('#closeDetail').onclick = () => { detailEl.style.display = 'none'; currentDetail = null; };
      const rf = document.querySelector('#recheckForm');
      if (rf) rf.onsubmit = async event => { event.preventDefault(); try { await api('/api/items/'+key+'/rechecks', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(rf).entries())) }); await load(); await openDetail(key); } catch (err) { alert(err.message); } };
      const ff = document.querySelector('#envFixForm');
      if (ff) ff.onsubmit = async event => { event.preventDefault(); try { const res = await api('/api/items/'+key+'/env/'+ff.envId.value, { method:'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(ff).entries())) }); alert('已修正，'+res.affectedSteps.length+'条后续步骤退回重判，'+res.archived.length+'条复检结果留档'); await load(); await openDetail(key); } catch (err) { alert(err.message); } };
    }
    async function load() { items = await api('/api/items'); render(); }
    createForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) }); createForm.reset(); await load(); } catch (err) { alert(err.message); } };
    actionForm.onsubmit = async event => { event.preventDefault(); try { const res = await api('/api/items/'+itemSelect.value+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); if (res.warning) alert(res.warning); actionForm.reset(); await load(); } catch (err) { alert(err.message); } };
    document.querySelector('#statusFilter').onchange = render; document.querySelector('#search').oninput = render; document.querySelector('#reload').onclick = load;
    renderForms(); load();
  </script>
</body>
</html>`;
}
