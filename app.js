/* app.js —— 前端逻辑（零依赖，canvas 手绘雷达图） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = (u, opt) => window.__STATIC_API__(u, opt);
const fmtPct = (x) => (x * 100).toFixed(2) + '%';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toneColor = { green: '#52c41a', yellow: '#faad14', orange: '#fa8c16', red: '#f5222d' };
const toneLabel = { green: '🟢 绿灯 (安全)', yellow: '🟡 黄灯 (关注)', orange: '🟠 橙灯 (中高)', red: '🔴 红灯 (高危)' };

let STATE = { products: [], weights: null, dims: [], lifecycle: null, ontology: null,
  cLevel: null, alloc: null, compare: [], sort: { key: 'sFinal100', dir: -1 }, cols: new Set(), preset: null };

/* ---------- ③ 排行页：可展示 / 可排序维度 ---------- */
// 理财网产品详情页路径（以站点实测为准；真实数据接入时在此处一次性校准即可）
const CW_DETAIL = 'https://www.chinawealth.com.cn/zzlc/jsp/lccpinfodetail.jsp?code=';
const productUrl = (p) => CW_DETAIL + encodeURIComponent(p.code);
const fmtP1 = (x) => (x * 100).toFixed(1) + '%';
const fmtRet = (x) => x == null ? '—' : `<span class="${x > 0 ? 'ret-up' : x < 0 ? 'ret-down' : ''}">${fmtP1(x)}</span>`;
const fmtNavCorr = (r) => r == null ? '—' : (r >= 0 ? '+' : '') + (r * 100).toFixed(0) + '%';
const fmtMoney = (x) => '¥' + (x >= 10000 ? (x / 10000).toFixed(1) + '万' : x.toLocaleString());
const fmtDays = (x) => (x ? x + '天' : '开放式');
const numCell = (c) => (c.num ? 'num' : '');

// get: 取值；fmt: 展示(值, 产品)；dir: 默认排序方向；default: 默认展示；num: 右对齐
const DIM_NAMES = ['收益水平', '风险水平', '期限流动性', '费率成本', '发行机构信用', '业绩稳定性', '投资门槛', '条款友好度'];
const COLUMNS = [
  { key: 'sFinal100', label: '综合分', num: true, dir: -1, default: true,
    get: (p) => p.sFinal100, fmt: (x) => '<span class="score-pill ' + (x >= 85 ? 'shi' : x >= 70 ? 'smid' : 'slo') + '">' + x + '</span>' },
  { key: 'name', label: '产品名称', default: true, get: (p) => p.name, fmt: (x) => x },
  { key: 'issuer', label: '机构', default: true, get: (p) => p.issuer, fmt: (x) => x },
  { key: 'category', label: '分类', default: true, get: (p) => p.category, fmt: (x) => '<span class="cat-chip">' + esc(x) + '</span>' },
  { key: 'pr', label: '风险', num: true, dir: 1, default: true, get: (p) => p.pr, fmt: (x) => '<span class="pr-badge r' + x + '">PR' + x + '</span>' },
  { key: 'r1m', label: '近1月收益', num: true, dir: -1, default: true, get: (p) => p.r1m, fmt: fmtRet },
  { key: 'annRet', label: '年化收益', num: true, dir: -1, default: true, get: (p) => p.annRet, fmt: fmtRet },
  { key: 'maxDD', label: '最大回撤', num: true, dir: 1, default: true, get: (p) => p.maxDD, fmt: fmtP1 },
  { key: 'totalFeeRate', label: '综合费率', num: true, dir: 1, default: true, get: (p) => p.totalFeeRate, fmt: fmtP1 },
  { key: 'lambda', label: '条款', num: true, dir: 1, default: true, get: (p) => p.lambda,
    fmt: (x, p) => '<span class="dot ' + p.clause.tone + '"></span>' + x.toFixed(2) },
  { key: 'r3m', label: '近3月收益', num: true, dir: -1, get: (p) => p.r3m, fmt: fmtRet },
  { key: 'r6m', label: '近6月收益', num: true, dir: -1, get: (p) => p.r6m, fmt: fmtRet },
  { key: 'r1y', label: '近1年收益', num: true, dir: -1, get: (p) => p.r1y, fmt: fmtRet },
  { key: 'benchMid', label: '业绩基准', num: true, dir: -1, get: (p) => p.benchMid, fmt: fmtP1 },
  { key: 'annVol', label: '年化波动', num: true, dir: 1, get: (p) => p.annVol, fmt: fmtP1 },
  { key: 'sharpe', label: '夏普比率', num: true, dir: -1, get: (p) => p.sharpe, fmt: (x) => x.toFixed(2) },
  { key: 'posMonthRatio', label: '正收益月占比', num: true, dir: -1, get: (p) => p.posMonthRatio, fmt: fmtP1 },
  { key: 'minInvest', label: '起购金额', num: true, dir: 1, get: (p) => p.minInvest, fmt: fmtMoney },
  { key: 'redeemT', label: '赎回到账', num: true, dir: 1, get: (p) => p.redeemT, fmt: (x) => 'T+' + x },
  { key: 'closedDays', label: '封闭期', num: true, dir: 1, get: (p) => p.closedDays, fmt: fmtDays },
  ...DIM_NAMES.map((nm, i) => ({
    key: 'D' + (i + 1), label: '维度·' + nm, num: true, dir: -1,
    get: (p) => p.z['D' + (i + 1)], fmt: (x) => x.toFixed(2),
  })),
];

/* 客户自选维度视角：一键切换要展示/排序的指标组合（综合分 + 产品名始终保留） */
const PRESETS = {
  return: ['sFinal100', 'name', 'r1m', 'r3m', 'r6m', 'r1y', 'annRet', 'benchMid', 'sharpe'],
  risk:   ['sFinal100', 'name', 'pr', 'annVol', 'maxDD', 'sharpe', 'posMonthRatio', 'lambda'],
  cost:   ['sFinal100', 'name', 'totalFeeRate', 'minInvest', 'closedDays', 'redeemT', 'lambda'],
};

/* ---------- 相似产品（聚类：特征马氏距离 + 净值协方差/相关系数） ---------- */
const dimLabel = (dk) => (STATE.dims.find((d) => d.key === dk) || {}).name || dk;
function mahalanobisSim(a, b) {
  // 用预计算的马氏逆协方差；缺失时退化为欧氏距离
  const sim = STATE.similarity, keys = sim && sim.keys ? sim.keys : Object.keys(a);
  const inv = sim && sim.invFeatureCov;
  if (!inv) {
    let s = 0; for (const k of keys) s += (a[k] - b[k]) ** 2;
    return 1 / (1 + Math.sqrt(s));
  }
  const d = keys.map((k) => a[k] - b[k]);
  let q = 0;
  for (let i = 0; i < d.length; i++) for (let j = 0; j < d.length; j++) q += d[i] * inv[i][j] * d[j];
  return 1 / (1 + Math.sqrt(Math.max(0, q)));
}
// 从锯齿上三角相关系数数组取 corr(i,j)
function corrAt(navCorr, i, j) {
  if (!navCorr) return null;
  if (i === j) return 1;
  return i < j ? navCorr[i][j - i - 1] : navCorr[j][i - j - 1];
}
function similarProducts(code, k = 5) {
  const p = STATE.products.find((x) => x.code === code);
  if (!p) return [];
  const idx = STATE.products.indexOf(p);
  const dkeys = STATE.dims.map((d) => d.key);
  const navCorr = STATE.similarity ? STATE.similarity.navCorr : null;
  return STATE.products.filter((x) => x.code !== code).map((x) => {
    const mSim = mahalanobisSim(p.z, x.z);                       // 特征马氏相似度 ∈ (0,1]
    const jx = STATE.products.indexOf(x);
    const r = corrAt(navCorr, idx, jx);                          // 净值相关系数 ∈ [-1,1]，缺省 null
    const navSim = r == null ? null : (r + 1) / 2;               // 归一化联动相似 ∈ [0,1]
    const sim = Math.round(((navSim == null ? mSim : 0.5 * mSim + 0.5 * navSim)) * 1000) / 1000;
    const close = dkeys
      .map((dk) => ({ dk, diff: Math.abs(p.z[dk] - x.z[dk]) }))
      .sort((a, b) => a.diff - b.diff).slice(0, 3);
    return { p: x, sim, mSim, navCorr: r, close };
  }).sort((a, b) => b.sim - a.sim).slice(0, k);
}

/* ---------- 主题切换（浅色/深色，canvas 配色跟随） ---------- */
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// 安全存储：file:// 直接双击打开时 localStorage 可能不可用，读写都容错，避免整页白屏
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let palette = [];
function refreshPalette() { palette = ['--r1', '--r2', '--r3', '--r4'].map(cssVar); }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set('licai-theme', t);
  const btn = $('#themeBtn'); if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  refreshPalette();
  if ($('#compare').classList.contains('active')) drawCompare();
}
applyTheme(store.get('licai-theme') || 'light');

/* ---------- 长辈模式（大字版）：放大字体，方便老人阅读 ---------- */
function applyElder(on) {
  if (on) document.documentElement.dataset.elder = 'true';
  else delete document.documentElement.dataset.elder;
  store.set('licai-elder', on ? '1' : '0');
  const btn = $('#elderBtn'); if (btn) btn.classList.toggle('on', on);
}
applyElder(store.get('licai-elder') === '1');
document.addEventListener('DOMContentLoaded', () => {
  $('#themeBtn').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#elderBtn').addEventListener('click', () =>
    applyElder(document.documentElement.dataset.elder !== 'true'));
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
  STATE.similarity = prod.similarity || null;
  STATE.lifecycle = life;
  STATE.ontology = ont;
  $('#footMeta').textContent = `已加载 ${prod.products.length} 条产品 · α*=${prod.weights.alpha} · AHP CR=${prod.weights.ahpCheck.CR}（一致性${prod.weights.ahpCheck.consistent ? '通过' : '未过'}）`;
  const src = (prod.meta && prod.meta.source) ? prod.meta.source : '中国理财网';
  $('#footSource').textContent = `数据来源：${src} · 非销售用途`;
  $('#heroStats').innerHTML = [
    `已收录 ${prod.products.length} 款产品`, '八维定量评价', '组合赋权 + 条款穿透', '相似产品推荐', '数据持续扩充中',
  ].map((t) => `<span class="hero-chip">${t}</span>`).join('');
  buildQuiz(); buildStages(); buildRank(); buildOntology(); buildMethod(); buildResearch();
}

/* ---------- ① 风险测评 ---------- */
const LEVEL_INFO = {
  1: { name: '保守型', icon: '🛡️', desc: '极度重视本金安全，几乎不能承受波动，适合低风险产品（PR1，如现金管理类、纯固收类）。', pr: 'PR1', prText: '低风险' },
  2: { name: '稳健型', icon: '🌿', desc: '追求稳健回报，可承受较小波动，适合中低风险产品（PR1–PR2，固收类为主）。', pr: 'PR1–PR2', prText: '中低风险' },
  3: { name: '平衡型', icon: '⚖️', desc: '风险与收益兼顾，可承受一定波动，适合中等风险产品（PR1–PR3，固收+少量混合）。', pr: 'PR1–PR3', prText: '中等风险' },
  4: { name: '成长型', icon: '🚀', desc: '追求较高收益，能承受较大波动，适合中高风险产品（PR1–PR4，可配置混合/权益类）。', pr: 'PR1–PR4', prText: '中高风险' },
  5: { name: '进取型', icon: '🔥', desc: '追求高收益，能承受大幅波动，适合全部风险等级产品（PR1–PR5，含权益/商品衍生）。', pr: 'PR1–PR5', prText: '高风险' },
};
const LEVEL_COLORS = ['#52c41a', '#52c41a', '#a0d911', '#faad14', '#fa8c16', '#f5222d'];

function updateQuizProgress() {
  const total = STATE.lifecycle.riskQuiz.length;
  let answered = 0;
  for (let i = 0; i < total; i++) if ($(`input[name="q${i}"]:checked`)) answered++;
  $('#quizProgressText').textContent = `已答 ${answered} / ${total}`;
  $('#quizProgressFill').style.width = (answered / total * 100) + '%';
}

function buildQuiz() {
  const box = $('#quiz');
  box.innerHTML = STATE.lifecycle.riskQuiz.map((q, i) => `
    <div class="qcard" data-q="${i}">
      <div class="qt"><span class="qnum">${i + 1}</span>${esc(q.q)}</div>
      <div class="qopts">
        ${q.opts.map(([label, val]) => `
          <label class="qopt"><input type="radio" name="q${i}" value="${val}">${esc(label)}</label>
        `).join('')}
      </div>
    </div>`).join('');
  $$('.qopt input', box).forEach((inp) => inp.addEventListener('change', (e) => {
    const card = e.target.closest('.qcard');
    $$('.qopt', card).forEach((o) => o.classList.remove('sel'));
    e.target.closest('.qopt').classList.add('sel');
    updateQuizProgress();
  }));
  updateQuizProgress();
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
  const L = LEVEL_INFO[r.cLevel] || {};
  const c = LEVEL_COLORS[r.cLevel];
  const box = $('#quizResult'); box.classList.remove('hidden');
  box.innerHTML = `
    <div class="assess-result">
      <div class="ar-level">
        <div class="ar-icon">${L.icon || '📊'}</div>
        <div class="hint">您的风险承受等级</div>
        <div class="big" style="color:${c}">${r.label}</div>
        <span class="ar-badge" style="background:${c}22;color:${c};border:1px solid ${c}">${L.prText} · 适合 ${L.pr}</span>
      </div>
      <div class="ar-body">
        <div class="ar-score">测评得分 <b>${r.score}</b> / ${r.maxScore}　·　得分率 ${fmtPct(r.ratio)}</div>
        <p class="ar-desc">${L.desc || ''}</p>
        <div class="hint" style="margin-top:10px">系统建议基础配比（固收 : 混合 : 权益）</div>
        ${allocBar(r.alloc)}
      </div>
    </div>
    <div class="hint" style="margin-top:12px">该等级将作为「生命周期配置」与「产品推荐」的风险硬约束：系统只推荐风险等级 ≤ ${L.pr} 的产品。</div>
    <button class="btn ghost" style="margin-top:14px" onclick="gotoPlan()">下一步：结合生命周期生成配置 →</button>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
const STAGE_ICONS = { single: '🎯', newlywed: '💑', parenting: '👶', growth: '🌱', empty: '🕊️', retire: '🌅' };
function riskBadge(riskLevel) {
  const m = (riskLevel || '').match(/C([1-5])/);
  const cls = m ? ' r' + m[1] : '';
  return `<span class="risk-badge${cls}">${esc(riskLevel || '')}</span>`;
}
function buildStages() {
  const box = $('#stages');
  box.innerHTML = STATE.lifecycle.stages.map((s) => `
    <div class="stage" data-id="${s.id}">
      <div class="stage-head">
        <span class="stage-icon">${STAGE_ICONS[s.id] || '🏦'}</span>
        <div class="stage-titles">
          <div class="sname">${esc(s.name)}</div>
          <div class="srisk">${riskBadge(s.riskLevel)}</div>
        </div>
      </div>
      <div class="sgoal">${esc(s.goal)}</div>
      ${allocBar(s.alloc)}
      <div class="stage-cta">点击生成配置方案 →</div>
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
  $('#colBtn').addEventListener('click', () => $('#colPicker').classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.col-sel')) $('#colPicker').classList.add('hidden');
  });
  $$('.view-presets .chip').forEach((c) => c.addEventListener('click', () => {
    STATE.preset = c.dataset.preset === 'all' ? null : c.dataset.preset;
    renderPresets();
    renderRank();
  }));
  buildColPicker();
  renderPresets();
  renderRank();
}
function renderPresets() {
  $$('.view-presets .chip').forEach((c) => {
    const on = c.dataset.preset === 'all' ? !STATE.preset : STATE.preset === c.dataset.preset;
    c.classList.toggle('on', on);
  });
}
function buildColPicker() {
  const opts = COLUMNS.filter((c) => !c.default);
  $('#colPicker').innerHTML = '<div class="cp-title">选择展示维度</div>' +
    opts.map((c) => `<label class="cp-opt"><input type="checkbox" value="${c.key}" ${STATE.cols.has(c.key) ? 'checked' : ''}> ${c.label}</label>`).join('');
  $$('#colPicker input').forEach((inp) => inp.addEventListener('change', () => {
    inp.checked ? STATE.cols.add(inp.value) : STATE.cols.delete(inp.value);
    renderRank();
  }));
}
function visibleCols() {
  if (STATE.preset && PRESETS[STATE.preset]) {
    const keys = PRESETS[STATE.preset];
    return COLUMNS.filter((c) => keys.includes(c.key));
  }
  return COLUMNS.filter((c) => c.default || STATE.cols.has(c.key));
}
function currentFiltered() {
  const cat = $('#fCat').value, pr = +$('#fPr').value, tone = $('#fTone').value;
  const list = STATE.products.filter(
    (p) => (!cat || p.category === cat) && p.pr <= pr && (!tone || p.clause.tone === tone));
  const c = COLUMNS.find((x) => x.key === STATE.sort.key);
  if (!c) return list;
  return list.slice().sort((a, b) => {
    const va = c.get(a), vb = c.get(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * STATE.sort.dir;
  });
}
function sortBy(key) {
  if (STATE.sort.key === key) STATE.sort.dir *= -1;
  else { const c = COLUMNS.find((x) => x.key === key); STATE.sort = { key, dir: c && c.dir ? c.dir : -1 }; }
  renderRank();
}
function renderRank() {
  const list = currentFiltered();
  $('#rankCount').textContent = `共 ${list.length} 款`;
  const cols = visibleCols();
  $('#rankTable thead').innerHTML = '<tr><th>#</th>' + cols.map((c) => {
    const active = STATE.sort.key === c.key;
    const arrow = active ? (STATE.sort.dir === -1 ? ' <span class="sa">▾</span>' : ' <span class="sa">▴</span>') : '';
    return `<th class="sortable ${active ? 'active-sort' : ''}" data-key="${c.key}" title="点击按「${c.label}」排序">${c.label}${arrow}</th>`;
  }).join('') + '<th class="no-sort"></th></tr>';
  $$('#rankTable thead .sortable').forEach((th) => th.addEventListener('click', () => sortBy(th.dataset.key)));
  $('#rankTable tbody').innerHTML = list.map((p, i) => `
    <tr onclick="openProduct('${p.code}')">
      <td class="num">${i + 1}</td>
      ${cols.map((c) => `<td class="${numCell(c)}">${c.fmt(c.get(p), p)}</td>`).join('')}
      <td style="white-space:nowrap">
        <button class="cmp-add" onclick="event.stopPropagation();openSimilar('${p.code}')" title="点此查看与本品相似的产品（简单聚类）">🔍 找相似</button>
        <button class="cmp-add ${STATE.compare.includes(p.code) ? 'on' : ''}"
          onclick="event.stopPropagation();toggleCompare('${p.code}',this)">${STATE.compare.includes(p.code) ? '✓已选' : '+对比'}</button>
        <a class="cw-link" href="${productUrl(p)}" target="_blank" rel="noopener noreferrer"
          onclick="event.stopPropagation()" title="点此进入理财网产品介绍页面（合规核验）">理财网核验 ↗</a>
      </td>
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
  const sims = similarProducts(code, 5);
  const clauseHits = p.clause.hits.length
    ? p.clause.hits.map((h) => `<li><b>${h.name}</b>：命中「${h.matched.join('、')}」— ${h.hint}</li>`).join('')
    : '<li>未命中显性风险条款本体，判定为内置参考等级。</li>';
  const html = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" id="modalBg">
      <div style="background:var(--card);border:1px solid var(--line);border-radius:16px;max-width:640px;width:100%;max-height:88vh;overflow:auto;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><h2>${p.name}</h2><div class="hint">${p.issuer} · ${p.issuerType} · ${p.category} · ${p.opMode}</div><div class="hint" style="margin-top:3px">登记编码：<span class="mono">${esc(p.code)}</span></div><a class="cw-big-btn" href="${productUrl(p)}" target="_blank" rel="noopener noreferrer">🔗 点此进入理财网产品介绍页面（核验登记编码）</a></div>
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
        <div class="mcard" style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">
            <b>相似产品推荐（聚类）</b>
            <span class="hint">特征马氏距离 + 净值协方差（相关系数）</span>
          </div>
          <div class="sim-list">
            ${sims.map((s) => `
              <div class="sim-item" onclick="openProduct('${s.p.code}')">
                <div class="sim-row">
                  <span class="sim-name">${s.p.name}</span>
                  <span class="sim-pct">${Math.round(s.sim * 100)}% 相似</span>
                </div>
                <div class="hint">${s.p.issuer} · PR${s.p.pr} · ${s.p.category}</div>
                <div class="sim-metrics">净值联动 ${fmtNavCorr(s.navCorr)} · 特征相似 ${Math.round(s.mSim * 100)}% · 接近维度：${s.close.map((c) => dimLabel(c.dk)).join('、')}</div>
              </div>`).join('')}
          </div>
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

/* ---------- 找相似（简单聚类：八维余弦相似度） ---------- */
function openSimilar(code) {
  const p = STATE.products.find((x) => x.code === code);
  if (!p) return;
  const sims = similarProducts(code, 8);
  const list = sims.length ? sims.map((s) => `
    <div class="sim-item" onclick="openProduct('${s.p.code}')">
      <div class="sim-row">
        <span class="sim-name">${esc(s.p.name)}</span>
        <span class="sim-pct">${Math.round(s.sim * 100)}% 相似</span>
      </div>
      <div class="hint">${esc(s.p.issuer)} · PR${s.p.pr} · ${esc(s.p.category)} · 综合分 ${s.p.sFinal100}</div>
      <div class="sim-metrics">净值联动 ${fmtNavCorr(s.navCorr)} · 特征相似 ${Math.round(s.mSim * 100)}% · 接近维度：${s.close.map((c) => dimLabel(c.dk)).join('、')}</div>
    </div>`).join('') : '<div class="hint">暂无足够相似的产品。</div>';
  const html = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" id="modalBg">
      <div style="background:var(--card);border:1px solid var(--line);border-radius:16px;max-width:640px;width:100%;max-height:88vh;overflow:auto;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <h2>🔍 相似产品推荐</h2>
            <div class="hint" style="margin-top:4px">焦点产品：<b>${esc(p.name)}</b>（${esc(p.issuer)} · PR${p.pr} · ${esc(p.category)}）</div>
            <div class="hint">方法：特征马氏距离 + 净值协方差（相关系数）聚类，仅作选品参考，非销售建议。</div>
          </div>
          <button class="btn ghost" onclick="document.getElementById('modalBg').remove()">关闭</button>
        </div>
        <div class="sim-list" style="margin-top:14px">${list}</div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#modalBg').addEventListener('click', (e) => { if (e.target.id === 'modalBg') e.target.remove(); });
}
window.openSimilar = openSimilar;

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
  ctx.strokeStyle = nav[nav.length - 1] >= nav[0] ? '#f5222d' : '#52c41a';
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
    <span class="sw" style="background:${palette[i]}"></span>
    <span class="cmp-name">${esc(p.name)}</span><span class="x" onclick="removeCompare('${p.code}')">×</span></div>`).join('') +
    '<button class="cmp-clear" onclick="clearCompare()">清空</button>';
  drawRadar(items);
  // 指标对比表（高亮每行最优值；dir -1=越大越好，1=越小越好）
  const rows = [
    ['综合评分', (p) => p.sFinal100, 'num', -1, (v) => String(v)],
    ['风险等级', (p) => p.pr, '', 1, (v) => 'PR' + v],
    ['近1年年化', (p) => p.annRet, 'num', -1, (v) => fmtPct(v)],
    ['年化波动', (p) => p.annVol, 'num', 1, (v) => fmtPct(v)],
    ['最大回撤', (p) => p.maxDD, 'num', 1, (v) => fmtPct(v)],
    ['夏普比率', (p) => p.sharpe, 'num', -1, (v) => String(v)],
    ['综合费率', (p) => p.totalFeeRate, 'num', 1, (v) => fmtPct(v)],
    ['起购金额', (p) => p.minInvest, 'num', 1, (v) => '¥' + v.toLocaleString()],
    ['条款/λ', (p) => p.lambda, 'num', -1, (v) => v.toFixed(2)],
  ];
  $('#compareTable').innerHTML = `<table><thead><tr><th>指标</th>${items.map((p, i) => `<th><span class="dot" style="background:${palette[i]}"></span>${esc(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([k, get, cls, dir, fmt]) => {
      const vals = items.map(get);
      const best = dir === -1 ? Math.max(...vals) : Math.min(...vals);
      return `<tr><td>${k}</td>${items.map((p) => {
        const v = get(p);
        return `<td class="${cls} ${v === best ? 'best' : ''}">${fmt(v)}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>`;
}
function removeCompare(code) { STATE.compare = STATE.compare.filter((c) => c !== code); drawCompare(); renderRank(); }
window.removeCompare = removeCompare;
function clearCompare() { STATE.compare = []; drawCompare(); renderRank(); }
window.clearCompare = clearCompare;

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
  const rankMap = {};
  [...w.final].sort((a, b) => b.w - a.w).forEach((x, i) => { rankMap[x.key] = i + 1; });
  const bars = (arr, cls) => arr.map((x) => {
    const r = rankMap[x.key];
    return `
    <div class="wbar">
      <span class="w-rank${r <= 3 ? ' top' + r : ''}">${r}</span>
      <span class="w-name">${x.name}</span>
      <div class="track"><div class="fill ${cls}" style="width:${(x.w / maxW * 100).toFixed(1)}%"></div></div>
      <span class="w-pct">${(x.w * 100).toFixed(1)}%</span>
    </div>`;
  }).join('');
  const alphaPct = (w.alpha * 100).toFixed(1);
  const entPct = (100 - w.alpha * 100).toFixed(1);
  $('#methodBox').innerHTML = `
    <div class="alpha-strip">
      <div class="alpha-head"><b>组合赋权结构</b><span class="hint">主观 AHP 与客观熵值法的博弈论最优融合（α*=${w.alpha}）</span></div>
      <div class="alpha-bar">
        <span class="seg-ahp" style="width:${alphaPct}%">AHP 主观 ${alphaPct}%</span>
        <span class="seg-ent" style="width:${entPct}%">熵值 客观 ${entPct}%</span>
      </div>
    </div>
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
        <div class="kv"><span>主观(AHP)占比</span><b>${alphaPct}%</b></div>
        <div class="kv"><span>客观(熵值)占比</span><b>${entPct}%</b></div>
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
      <div class="hwem-flow">
        <span class="hf-node">八维指标 Z</span><span class="hf-arrow">→</span>
        <span class="hf-node">组合加权 Σ wₖ·Zₖ</span><span class="hf-arrow">→</span>
        <span class="hf-node warn">条款 λ 惩罚 ×</span><span class="hf-arrow">→</span>
        <span class="hf-node out">S_final</span>
      </div>
      <div class="formula">S_final = ( Σₖ₌₁⁷ wₖ · Zₖ ) × λ_LLM　（λ ∈ {红0.65, 橙0.80, 黄0.92, 绿1.00}）</div>
      <div class="hint">前 7 维客观定量指标组合加权，第 8 维「条款友好度」经规则/语义穿透转 λ，乘法实施「一票降权」。</div>
    </div>`;
}

/* ---------- ⑦ 研究路线 ---------- */
function buildResearch() {
  const P = STATE.products;
  const n = P.length;
  const cats = new Set(P.map((p) => p.category)).size;
  const prMin = Math.min(...P.map((p) => p.pr));
  const prMax = Math.max(...P.map((p) => p.pr));
  const withCode = P.filter((p) => p.code && p.code.length >= 10).length;
  $('#researchBox').innerHTML = `
    <div class="data-strip">
      <div class="ds-item"><span class="ds-num">${n}</span><span class="ds-label">真实产品</span></div>
      <div class="ds-item"><span class="ds-num">${cats}</span><span class="ds-label">监管分类</span></div>
      <div class="ds-item"><span class="ds-num">R${prMin}–R${prMax}</span><span class="ds-label">风险等级</span></div>
      <div class="ds-item"><span class="ds-num">${withCode}</span><span class="ds-label">登记编码可核验</span></div>
    </div>

    <div class="research-grid">
      <div class="mcard rc-card">
        <div class="rc-head">
          <span class="rc-badge q1">问题一 · 离散金融</span>
          <h3>传统数理金融如何真正落地到「有限类」理财</h3>
          <p class="rc-sub">理财是离散监管分类 + 离散风险等级 + 离散流动性锁定，难点是把离散约束嵌入连续金融框架。</p>
        </div>
        <div class="rc-steps">
          <div class="rc-step"><span class="rc-num">1</span><div><b>嵌入层</b><p>离散类别 → 连续因子坐标（μ、σ、MDD、β），由净值序列估计</p></div></div>
          <div class="rc-flow">↓</div>
          <div class="rc-step"><span class="rc-num">2</span><div><b>优化层</b><p>均值-方差 / 风险预算，把 PR≤C、封闭期、持有期错配写进约束集</p></div></div>
          <div class="rc-flow">↓</div>
          <div class="rc-step"><span class="rc-num">3</span><div><b>整数层</b><p>混合整数规划 → 可落地清单 + 金额 + 再平衡日历</p></div></div>
        </div>
        <div class="formula">min wᵀΣw　s.t. wᵀμ ≥ μ₀, Σw=1, xᵢ∈{0,1}, wᵢ≤M·xᵢ, cLevel≤C</div>
        <div class="hint rc-link">本工具的「八维标准化 + 相似聚类（马氏距离 + 净值协方差）」即嵌入层最小版本</div>
      </div>

      <div class="mcard rc-card">
        <div class="rc-head">
          <span class="rc-badge q2">问题二 · 文本因子</span>
          <h3>说明书/描述能否预测风险与收益</h3>
          <p class="rc-sub">对应股票研究的「多因子 / 文本因子」主线，迁移到研究更少、语料更强的理财资产。</p>
        </div>
        <div class="rc-steps">
          <div class="rc-step"><span class="rc-num">1</span><div><b>结构化因子</b><p>费率、流动性、机构信用 → 横截面回归</p></div></div>
          <div class="rc-flow">↓</div>
          <div class="rc-step"><span class="rc-num">2</span><div><b>规则文本因子</b><p>条款风险 λ（本工具已落地）→ 升级语义 λ</p></div></div>
          <div class="rc-flow">↓</div>
          <div class="rc-step"><span class="rc-num">3</span><div><b>语义文本因子</b><p>FinGPT 风险语义嵌入，检验对收益/回撤的预测力</p></div></div>
        </div>
        <div class="formula">rᵢ = α + Σ βₖ·Fᵢₖ + εᵢ</div>
        <div class="hint rc-link">两条主线共用同一套数据底座（结构化字段 + 说明书文本语料）</div>
      </div>
    </div>

    <div class="mcard why-card">
      <h3>为什么把研究放在「理财」而不是股票</h3>
      <div class="why-grid">
        <div class="why-item"><span class="why-icon">📊</span><b>规模更大</b><span>银行理财存续规模超过股票流通市值</span></div>
        <div class="why-item"><span class="why-icon">👥</span><b>人群更广</b><span>覆盖更多普通投资者，社会意义更大</span></div>
        <div class="why-item"><span class="why-icon">🔍</span><b>有特殊性</b><span>离散分类、封闭期、条款 λ 是理财独有</span></div>
        <div class="why-item"><span class="why-icon">🧩</span><b>研究更少</b><span>理财说明书文本因子研究基本空白</span></div>
        <div class="why-item"><span class="why-icon">💼</span><b>业务更近</b><span>资管公司大量业务是理财代销/管理</span></div>
      </div>
    </div>

    <div class="mcard" style="margin-top:16px">
      <h3>里程碑路线</h3>
      <div class="milestone">
        <div class="ms-item done"><span class="ms-dot"></span><div><b>M0 · 数据底座</b><p>结构化字段 + 说明书文本语料（本工具已落地）</p></div></div>
        <div class="ms-item done"><span class="ms-dot"></span><div><b>M1 · 横截面实证</b><p>结构化因子 × 收益/风险回归（scripts/m1_factor_regression.py）</p></div></div>
        <div class="ms-item"><span class="ms-dot"></span><div><b>M2 · 规则文本因子</b><p>条款 λ 本体库扩充 + 分组检验</p></div></div>
        <div class="ms-item"><span class="ms-dot"></span><div><b>M3 · 离散约束优化</b><p>均值-方差 + 整数规划组合模型</p></div></div>
        <div class="ms-item"><span class="ms-dot"></span><div><b>M4 · 语义风险因子</b><p>FinGPT 风险语义嵌入 + 预测模型</p></div></div>
        <div class="ms-item"><span class="ms-dot"></span><div><b>M5 · 论文/报告</b><p>1 篇方法 + 1 篇实证</p></div></div>
      </div>
      <div class="hint" style="margin-top:10px">完整研究路线与数据采集计划见项目 docs/（research-plan.md / data-collection-plan.md）。</div>
    </div>`;
}

init();
