/* app.js —— 前端逻辑（零依赖，canvas 手绘雷达图） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = (u, opt) => window.__STATIC_API__(u, opt);
const fmtPct = (x) => (x * 100).toFixed(2) + '%';
const toneColor = { green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444' };
const toneLabel = { green: '🟢 绿灯 (安全)', yellow: '🟡 黄灯 (关注)', orange: '🟠 橙灯 (中高)', red: '🔴 红灯 (高危)' };

let STATE = { products: [], weights: null, dims: [], lifecycle: null, ontology: null,
  cLevel: null, alloc: null, compare: [] };

/* ---------- 主题切换（浅色/深色，canvas 配色跟随） ---------- */
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let palette = [];
function refreshPalette() { palette = ['--r1', '--r2', '--r3', '--r4'].map(cssVar); }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('licai-theme', t);
  const btn = $('#themeBtn'); if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  refreshPalette();
  if ($('#compare').classList.contains('active')) drawCompare();
}
applyTheme(localStorage.getItem('licai-theme') || 'light');
document.addEventListener('DOMContentLoaded', () => {
  $('#themeBtn').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
});

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 1800);
}

/* ---------- Tabs ---------- */
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.remove('active'));
  $$('.panel').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  $('#' + b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'compare') drawCompare();
}));

/* ---------- 初始化 ---------- */
async function init() {
  const [prod, life, ont] = await Promise.all([
    api('/api/products'), api('/api/lifecycle'), api('/api/ontology'),
  ]);
  STATE.products = prod.products;
  STATE.weights = prod.weights;
  STATE.dims = prod.dimensions;
  STATE.lifecycle = life;
  STATE.ontology = ont;
  $('#footMeta').textContent = `已加载 ${prod.products.length} 条产品 · α*=${prod.weights.alpha} · AHP CR=${prod.weights.ahpCheck.CR}（一致性${prod.weights.ahpCheck.consistent ? '通过' : '未过'}）`;
  buildQuiz(); buildStages(); buildRank(); buildOntology(); buildMethod();
}

/* ---------- ① 风险测评 ---------- */
function buildQuiz() {
  const box = $('#quiz');
  box.innerHTML = STATE.lifecycle.riskQuiz.map((q, i) => `
    <div class="qcard" data-q="${i}">
      <div class="qt">${i + 1}. ${q.q}</div>
      <div class="qopts">
        ${q.opts.map(([label, val]) => `
          <label class="qopt"><input type="radio" name="q${i}" value="${val}">${label}</label>
        `).join('')}
      </div>
    </div>`).join('');
  $$('.qopt input', box).forEach((inp) => inp.addEventListener('change', (e) => {
    const card = e.target.closest('.qcard');
    $$('.qopt', card).forEach((o) => o.classList.remove('sel'));
    e.target.closest('.qopt').classList.add('sel');
  }));
}
$('#quizSubmit').addEventListener('click', async () => {
  const answers = [];
  for (let i = 0; i < STATE.lifecycle.riskQuiz.length; i++) {
    const sel = $(`input[name="q${i}"]:checked`);
    if (!sel) { toast(`请完成第 ${i + 1} 题`); return; }
    answers.push(Number(sel.value));
  }
  const r = await api('/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
  STATE.cLevel = r.cLevel; STATE.alloc = r.alloc;
  const box = $('#quizResult'); box.classList.remove('hidden');
  const colors = ['#22c55e', '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
  box.innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
      <div>
        <div class="hint">您的风险承受等级</div>
        <div class="big" style="color:${colors[r.cLevel]}">${r.label}</div>
        <div class="hint">测评得分 ${r.score}/${r.maxScore}（${fmtPct(r.ratio)}）</div>
      </div>
      <div style="flex:1;min-width:240px">
        <div class="hint">系统建议基础配比（固收 : 混合 : 权益）</div>
        ${allocBar(r.alloc)}
      </div>
    </div>
    <button class="btn ghost" style="margin-top:14px" onclick="gotoPlan()">下一步：结合生命周期生成配置 →</button>`;
  toast('测评完成，风险等级 ' + r.label);
});
function gotoPlan() { $('.tab[data-tab="plan"]').click(); }
window.gotoPlan = gotoPlan;

function allocBar(a) {
  const [f, m, e] = a;
  return `<div class="allocbar">
    ${f ? `<span class="seg-fix" style="width:${f}%">固收 ${f}%</span>` : ''}
    ${m ? `<span class="seg-mix" style="width:${m}%">混合 ${m}%</span>` : ''}
    ${e ? `<span class="seg-eq" style="width:${e}%">权益 ${e}%</span>` : ''}
  </div>`;
}

/* ---------- ② 生命周期配置 ---------- */
function buildStages() {
  const box = $('#stages');
  box.innerHTML = STATE.lifecycle.stages.map((s) => `
    <div class="stage" data-id="${s.id}">
      <div class="sname">${s.name}</div>
      <div class="sgoal">${s.goal}</div>
      <div class="salloc">风险偏好：${s.riskLevel}</div>
      ${allocBar(s.alloc)}
    </div>`).join('');
  $$('.stage', box).forEach((el) => el.addEventListener('click', () => {
    $$('.stage', box).forEach((x) => x.classList.remove('sel'));
    el.classList.add('sel');
    const st = STATE.lifecycle.stages.find((s) => s.id === el.dataset.id);
    genPlan(st);
  }));
}
async function genPlan(stage) {
  // 若已测评，取测评 C 与阶段 C 的较小值作为硬约束；否则用阶段 C
  const cLevel = STATE.cLevel ? Math.min(STATE.cLevel, stage.cLevel) : stage.cLevel;
  const alloc = STATE.alloc && STATE.cLevel ? mergeAlloc(STATE.alloc, stage.alloc) : stage.alloc;
  const rec = await api('/api/recommend', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cLevel, alloc, topN: 3 }),
  });
  const box = $('#planResult'); box.classList.remove('hidden');
  const P = rec.portfolio;
  box.innerHTML = `
    <h3 style="margin-bottom:6px">${stage.name} · 建议组合（风险硬约束 ≤ C${cLevel}）</h3>
    <div class="hint">目标：${stage.goal}</div>
    ${allocBar(alloc)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:14px 0">
      ${metric('组合预期年化', fmtPct(P.expRet))}
      ${metric('预期波动率', fmtPct(P.expVol))}
      ${metric('预期最大回撤', fmtPct(P.expMaxDD))}
      ${metric('加权夏普', P.avgSharpe)}
      ${metric('加权综合费率', fmtPct(P.avgFee))}
    </div>
    ${rec.buckets.map((b) => `
      <div style="margin-top:12px">
        <b>${b.bucket}</b> <span class="hint">配比 ${b.weight}% · ${b.unfilled ? '⚠️ 该类无符合 C' + cLevel + ' 风险约束的产品，此比例需转投更低风险品类' : '精选 ' + b.products.length + ' 款'}</span>
        ${b.unfilled ? '' : `<div class="table-wrap" style="margin-top:6px">
          <table><thead><tr><th>产品</th><th>机构</th><th>风险</th><th>年化</th><th>回撤</th><th>条款</th><th>综合分</th></tr></thead>
          <tbody>${b.products.map((p) => `<tr onclick="openProduct('${p.code}')">
            <td>${p.name}</td><td>${p.issuer}</td><td>PR${p.pr}</td>
            <td class="num">${fmtPct(p.annRet)}</td><td class="num">${fmtPct(p.maxDD)}</td>
            <td><span class="dot ${p.clause.tone}"></span>${p.lambda}</td>
            <td class="num"><span class="score-pill">${p.sFinal100}</span></td>
          </tr>`).join('')}</tbody></table>
        </div>`}
      </div>`).join('')}`;
  toast('已生成 ' + stage.name + ' 配置方案');
}
function mergeAlloc(a, b) {
  const r = a.map((v, i) => Math.round((v + b[i]) / 2));
  const diff = 100 - r.reduce((x, y) => x + y, 0); r[0] += diff; return r;
}
function metric(label, val) {
  return `<div class="mcard" style="text-align:center;padding:12px">
    <div class="hint">${label}</div><div style="font-size:20px;font-weight:700;color:var(--accent)">${val}</div></div>`;
}

/* ---------- ③ 产品评价排行 ---------- */
function buildRank() {
  ['fCat', 'fPr', 'fTone'].forEach((id) => $('#' + id).addEventListener('change', renderRank));
  renderRank();
}
function currentFiltered() {
  const cat = $('#fCat').value, pr = +$('#fPr').value, tone = $('#fTone').value;
  return STATE.products
    .filter((p) => (!cat || p.category === cat) && p.pr <= pr && (!tone || p.clause.tone === tone))
    .sort((a, b) => b.sFinal - a.sFinal);
}
function renderRank() {
  const list = currentFiltered();
  $('#rankCount').textContent = `共 ${list.length} 款`;
  $('#rankTable tbody').innerHTML = list.map((p, i) => `
    <tr onclick="openProduct('${p.code}')">
      <td>${i + 1}</td>
      <td>${p.name}</td><td>${p.issuer}</td><td>${p.category}</td><td>PR${p.pr}</td>
      <td class="num">${fmtPct(p.annRet)}</td><td class="num">${fmtPct(p.maxDD)}</td>
      <td class="num">${fmtPct(p.totalFeeRate)}</td>
      <td><span class="dot ${p.clause.tone}"></span>${p.lambda}</td>
      <td class="num"><span class="score-pill">${p.sFinal100}</span></td>
      <td><button class="cmp-add ${STATE.compare.includes(p.code) ? 'on' : ''}"
        onclick="event.stopPropagation();toggleCompare('${p.code}',this)">${STATE.compare.includes(p.code) ? '✓已选' : '+对比'}</button></td>
    </tr>`).join('');
}

function toggleCompare(code, btn) {
  const idx = STATE.compare.indexOf(code);
  if (idx >= 0) { STATE.compare.splice(idx, 1); btn.classList.remove('on'); btn.textContent = '+对比'; }
  else {
    if (STATE.compare.length >= 4) { toast('最多对比 4 个产品'); return; }
    STATE.compare.push(code); btn.classList.add('on'); btn.textContent = '✓已选';
  }
  toast(`对比栏 ${STATE.compare.length}/4`);
}
window.toggleCompare = toggleCompare;

/* ---------- 产品详情弹层（简易） ---------- */
async function openProduct(code) {
  const p = await api('/api/product?code=' + encodeURIComponent(code));
  const dims = STATE.dims;
  const rows = dims.map((d) => `<div class="kv"><span>${d.key} ${d.name}${d.positive ? '' : '（负向）'}</span><span>标准化 ${(p.z[d.key]).toFixed(3)}</span></div>`).join('');
  const clauseHits = p.clause.hits.length
    ? p.clause.hits.map((h) => `<li><b>${h.name}</b>：命中「${h.matched.join('、')}」— ${h.hint}</li>`).join('')
    : '<li>未命中显性风险条款本体，判定为内置参考等级。</li>';
  const html = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" id="modalBg">
      <div style="background:var(--card);border:1px solid var(--line);border-radius:16px;max-width:640px;width:100%;max-height:88vh;overflow:auto;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><h2>${p.name}</h2><div class="hint">${p.issuer} · ${p.issuerType} · ${p.category} · ${p.opMode}</div></div>
          <button class="btn ghost" onclick="document.getElementById('modalBg').remove()">关闭</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0">
          ${metric('综合评分 S_final', p.sFinal100)}
          ${metric('风险 / 适当性', 'PR' + p.pr + ' / C' + p.cLevel)}
          ${metric('近1年年化', fmtPct(p.annRet))}
          ${metric('最大回撤', fmtPct(p.maxDD))}
          ${metric('夏普比率', p.sharpe)}
          ${metric('综合费率', fmtPct(p.totalFeeRate))}
          ${metric('起购金额', '¥' + p.minInvest.toLocaleString())}
          ${metric('赎回到账', 'T+' + p.redeemT)}
        </div>
        <div class="mcard" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>条款穿透</b>
            <span class="badge" style="background:${toneColor[p.clause.tone]}22;color:${toneColor[p.clause.tone]};border:1px solid ${toneColor[p.clause.tone]}">
              ${toneLabel[p.clause.tone]} · λ=${p.lambda}</span>
          </div>
          <ul style="margin:8px 0 0 18px;font-size:13px;color:var(--muted)">${clauseHits}</ul>
          <div style="margin-top:8px;font-size:12px;color:var(--sub)">原文摘录：${(p.clauses || []).join(' / ')}</div>
        </div>
        <canvas id="miniNav" width="580" height="140" style="width:100%;background:var(--panel2);border-radius:8px"></canvas>
        <div class="hint" style="margin-top:4px">近1年单位净值走势</div>
        <details style="margin-top:12px"><summary style="cursor:pointer">八维标准化得分明细</summary>${rows}</details>
        <button class="btn primary" style="margin-top:14px" onclick="addToCompareFromModal('${p.code}')">加入雷达图对比</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#modalBg').addEventListener('click', (e) => { if (e.target.id === 'modalBg') e.target.remove(); });
  drawNav($('#miniNav'), p.nav);
}
window.openProduct = openProduct;
function addToCompareFromModal(code) {
  if (!STATE.compare.includes(code)) {
    if (STATE.compare.length >= 4) { toast('最多对比 4 个'); return; }
    STATE.compare.push(code);
  }
  $('#modalBg')?.remove(); renderRank(); toast(`对比栏 ${STATE.compare.length}/4`);
}
window.addToCompareFromModal = addToCompareFromModal;

/* ---------- 净值折线 ---------- */
function drawNav(cv, nav) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 10;
  ctx.clearRect(0, 0, W, H);
  const min = Math.min(...nav), max = Math.max(...nav), span = max - min || 1;
  ctx.beginPath();
  nav.forEach((v, i) => {
    const x = pad + (W - 2 * pad) * i / (nav.length - 1);
    const y = H - pad - (H - 2 * pad) * (v - min) / span;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = nav[nav.length - 1] >= nav[0] ? '#22c55e' : '#ef4444';
  ctx.lineWidth = 2; ctx.stroke();
}

/* ---------- ④ 雷达图对比 ---------- */
function drawCompare() {
  const bar = $('#compareBar');
  if (!STATE.compare.length) {
    bar.innerHTML = '<span class="hint">还没有勾选产品。请到「产品评价排行」页点击「+对比」加入（最多 4 个）。</span>';
    const cv = $('#radar');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    $('#radarLegend').innerHTML = ''; $('#compareTable').innerHTML = ''; return;
  }
  const items = STATE.compare.map((c) => STATE.products.find((p) => p.code === c)).filter(Boolean);
  bar.innerHTML = items.map((p, i) => `<div class="cmp-tag">
    <span class="sw" style="width:12px;height:12px;border-radius:3px;background:${palette[i]}"></span>
    ${p.name}<span class="x" onclick="removeCompare('${p.code}')">×</span></div>`).join('');
  drawRadar(items);
  // 指标对比表
  const rows = [
    ['综合评分', (p) => p.sFinal100],
    ['风险等级', (p) => 'PR' + p.pr],
    ['近1年年化', (p) => fmtPct(p.annRet)],
    ['年化波动', (p) => fmtPct(p.annVol)],
    ['最大回撤', (p) => fmtPct(p.maxDD)],
    ['夏普比率', (p) => p.sharpe],
    ['综合费率', (p) => fmtPct(p.totalFeeRate)],
    ['起购金额', (p) => '¥' + p.minInvest.toLocaleString()],
    ['条款/λ', (p) => toneLabel[p.clause.tone] + ' ' + p.lambda],
  ];
  $('#compareTable').innerHTML = `<table><thead><tr><th>指标</th>${items.map((p, i) => `<th><span class="dot" style="background:${palette[i]}"></span>${p.name}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([k, f]) => `<tr><td>${k}</td>${items.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function removeCompare(code) { STATE.compare = STATE.compare.filter((c) => c !== code); drawCompare(); renderRank(); }
window.removeCompare = removeCompare;

function drawRadar(items) {
  const cv = $('#radar'), ctx = cv.getContext('2d');
  // Retina 清晰化：物理分辨率 = CSS 尺寸 × dpr
  const dpr = window.devicePixelRatio || 1;
  const SIZE = Math.min(520, Math.max(300, (cv.parentElement.clientWidth || 540) - 20));
  cv.style.width = SIZE + 'px'; cv.style.height = SIZE + 'px';
  cv.width = SIZE * dpr; cv.height = SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = SIZE, H = SIZE, cx = W / 2, cy = H / 2, R = SIZE * 0.365;
  const dims = STATE.dims, n = dims.length;
  const gridCol = cssVar('--gridLine'), axisCol = cssVar('--axisText'), dimCol = cssVar('--dimText');
  ctx.clearRect(0, 0, W, H);
  // 网格
  for (let g = 1; g <= 4; g++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      const r = R * g / 4;
      const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = gridCol; ctx.lineWidth = 1; ctx.stroke();
  }
  // 轴 + 标签
  ctx.font = '12px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.strokeStyle = gridCol; ctx.stroke();
    const lx = cx + (R + 30) * Math.cos(ang), ly = cy + (R + 20) * Math.sin(ang);
    ctx.fillStyle = dimCol; ctx.fillText(dims[i].name, lx, ly);
  }
  // 刻度提示（25/50/75/100）
  ctx.fillStyle = axisCol; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  for (let g = 1; g <= 4; g++) ctx.fillText(String(g * 25), cx + 4, cy - R * g / 4 - 2);
  // 数据多边形
  items.forEach((p, idx) => {
    ctx.beginPath();
    dims.forEach((d, i) => {
      const val = Math.max(0, Math.min(1, p.z[d.key]));
      const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      const r = R * val;
      const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = palette[idx] + '2e'; ctx.fill();
    ctx.strokeStyle = palette[idx]; ctx.lineWidth = 2.2; ctx.stroke();
    // 顶点小圆点
    dims.forEach((d, i) => {
      const val = Math.max(0, Math.min(1, p.z[d.key]));
      const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      const x = cx + R * val * Math.cos(ang), y = cy + R * val * Math.sin(ang);
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = palette[idx]; ctx.fill();
    });
  });
  ctx.textAlign = 'center';
  $('#radarLegend').innerHTML = items.map((p, i) =>
    `<div class="li"><span class="sw" style="background:${palette[i]}"></span>${p.name}<br><span class="hint" style="margin-left:27px">综合分 ${p.sFinal100}</span></div>`).join('');
}

/* ---------- ⑤ 条款穿透 ---------- */
const SAMPLES = {
  red: '发生巨额赎回时，管理人有权无限期推迟或暂停支付赎回款项；因管理人重大过失导致的投资损失，管理人免除赔偿责任。',
  orange: '超过业绩比较基准之上部分，管理人计提50%作为超额业绩报酬；管理人可单方面变更投资范围与估值方法。',
  yellow: '本产品采用摊余成本法与市值法混用估值，极端情形赎回到账时间可能延长；管理人对超额收益计提20%业绩报酬。',
  green: '产品条款清晰、费率透明，开放日固定、赎回到账及时(T+1)，信息披露完整规范，未设置隐性限制。',
};
$$('.chip').forEach((c) => c.addEventListener('click', () => { $('#clauseInput').value = SAMPLES[c.dataset.s]; }));
$('#clauseRun').addEventListener('click', async () => {
  const text = $('#clauseInput').value.trim();
  if (!text) { toast('请输入条款文本'); return; }
  const r = await api('/api/clause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  const box = $('#clauseResult'); box.classList.remove('hidden');
  const hits = r.hits.length ? r.hits.map((h) => `<li><b>${h.name}</b>（权重${STATE.ontology.classes.find(c=>c.id===h.id)?.weight||''}）：命中关键词「${h.matched.join('、')}」— ${h.hint}</li>`).join('') : '<li>未命中显性风险条款，判定为绿灯（安全）。</li>';
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span class="badge big" style="background:${toneColor[r.tone]}22;color:${toneColor[r.tone]};border:1px solid ${toneColor[r.tone]}">${toneLabel[r.tone]}</span>
      <div><div class="hint">语义风险惩罚系数</div><div class="big" style="color:${toneColor[r.tone]}">λ = ${r.lambda}</div></div>
      <div class="hint" style="flex:1;min-width:200px">该系数将以乘法形式作用于产品综合得分：<br>S_final = (Σ wₖ·Zₖ) × λ</div>
    </div>
    <ul style="margin:14px 0 0 18px;font-size:13px;color:var(--muted)">${hits}</ul>`;
  toast('穿透完成：' + toneLabel[r.tone]);
});
function buildOntology() {
  $('#ontologyBox').innerHTML = `<h3 style="grid-column:1/-1">风险条款本体库（5 大类）</h3>` +
    STATE.ontology.classes.map((c) => `
    <div class="ont-card">
      <h4><span class="dot ${c.tone}"></span>${c.name}
        <span class="${c.weight === '高' ? 'w-high' : 'w-mid'}" style="font-size:12px">［权重${c.weight}］</span></h4>
      <div class="hint">${c.hint}</div>
      <div style="margin-top:6px;font-size:12px;color:var(--sub)">关键词：${c.keywords.join('、')}</div>
    </div>`).join('');
}

/* ---------- ⑥ 方法论 ---------- */
function buildMethod() {
  const w = STATE.weights;
  const maxW = Math.max(...w.final.map((x) => x.w));
  const bars = (arr, cls) => arr.map((x) => `
    <div class="wbar"><span style="width:120px">${x.key} ${x.name}</span>
      <div class="track"><div class="fill ${cls}" style="width:${(x.w / maxW * 100).toFixed(1)}%"></div></div>
      <span style="width:52px;text-align:right">${(x.w * 100).toFixed(1)}%</span></div>`).join('');
  $('#methodBox').innerHTML = `
    <div class="method-grid">
      <div class="mcard">
        <h3>最终组合权重 W_final</h3>
        <div class="hint">W_final = α·W_AHP + (1−α)·W_entropy</div>
        ${bars(w.final, '')}
      </div>
      <div class="mcard">
        <h3>博弈论组合系数</h3>
        <div class="formula">α* = (E·Eᵀ − A·Eᵀ) / (A·Aᵀ + E·Eᵀ − 2·A·Eᵀ)</div>
        <div class="kv"><span>最优组合系数 α*</span><b>${w.alpha}</b></div>
        <div class="kv"><span>主观(AHP)占比</span><b>${(w.alpha * 100).toFixed(1)}%</b></div>
        <div class="kv"><span>客观(熵值)占比</span><b>${((1 - w.alpha) * 100).toFixed(1)}%</b></div>
        <h3 style="margin-top:14px">AHP 一致性检验</h3>
        <div class="kv"><span>λ_max</span><b>${w.ahpCheck.lambdaMax}</b></div>
        <div class="kv"><span>CI</span><b>${w.ahpCheck.CI}</b></div>
        <div class="kv"><span>CR = CI/RI</span><b>${w.ahpCheck.CR} ${w.ahpCheck.consistent ? '<span class="ok">✓ &lt;0.1 通过</span>' : '✗ 未通过'}</b></div>
      </div>
      <div class="mcard">
        <h3>主观权重 W_AHP（层次分析法）</h3>
        <div class="hint">8×8 判断矩阵 · 1–9 标度 · 几何平均法求特征向量</div>
        ${bars(w.ahp, 'ahp')}
      </div>
      <div class="mcard">
        <h3>客观权重 W_entropy（熵值法）</h3>
        <div class="hint">基于标准化矩阵信息熵 e_j，偏差度 d_j=1−e_j</div>
        ${bars(w.entropy, 'ent')}
      </div>
    </div>
    <div class="mcard" style="margin-top:16px">
      <h3>混合评价模型 HWEM 计分链</h3>
      <div class="formula">S_final = ( Σₖ₌₁⁷ wₖ · Zₖ ) × λ_LLM　（λ ∈ {红0.65, 橙0.80, 黄0.92, 绿1.00}）</div>
      <div class="hint">前 7 维为客观定量指标的组合加权得分，第 8 维「条款友好度」经 LLM/规则穿透转化为语义风险惩罚系数 λ，以乘法形式对最终得分实施「一票降权」。</div>
    </div>`;
}

init();
