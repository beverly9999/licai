/* 静态版 API:与 server.js 行为一致,全部在浏览器本地计算 */
(function(){
'use strict';
var D = window.__DATA__;
var byCode = {};
D.products.forEach(function(p){ byCode[p.code] = p; });
function slim(p){ var o={}; for(var k in p){ if(k!=='nav'&&k!=='z'&&k!=='raw') o[k]=p[k]; } return o; }
function round(x,n){ n=n==null?4:n; return Math.round(x*Math.pow(10,n))/Math.pow(10,n); }

// 风险问卷 -> C 等级 (同 server.js assessRisk)
function assessRisk(answers){
  var arr = Array.isArray(answers) ? answers.map(Number).filter(function(x){return x>=1&&x<=4;}) : [];
  var sum = arr.reduce(function(a,b){return a+b;},0);
  var maxSum = D.lifecycle.riskQuiz.length * 4;
  var ratio = maxSum ? sum/maxSum : 0;
  var c = 1;
  if (ratio>=0.85) c=5; else if (ratio>=0.68) c=4;
  else if (ratio>=0.5) c=3; else if (ratio>=0.32) c=2; else c=1;
  var label = {1:'保守型 C1',2:'稳健型 C2',3:'平衡型 C3',4:'成长型 C4',5:'进取型 C5'}[c];
  var allocByC = {1:[85,15,0],2:[75,20,5],3:[55,30,15],4:[50,30,20],5:[35,30,35]};
  return { score:sum, maxScore:maxSum, ratio:Math.round(ratio*100)/100, cLevel:c, label:label, alloc:allocByC[c] };
}

// 分层产品推荐 (同 server.js recommend)
function recommend(q){
  var cLevel = q.cLevel==null?3:q.cLevel;
  var alloc = q.alloc || [55,30,15];
  var topN = q.topN==null?3:q.topN;
  var minInvestMax = q.minInvestMax || null;
  var buckets = ['固定收益类','混合类','权益类'];
  var result = [];
  buckets.forEach(function(cat,i){
    if (alloc[i]===0) return;
    var pool = D.products.filter(function(p){ return p.category===cat && p.cLevel<=cLevel; });
    if (minInvestMax) pool = pool.filter(function(p){ return p.minInvest<=minInvestMax; });
    pool = pool.slice().sort(function(a,b){ return b.sFinal-a.sFinal; }).slice(0,topN);
    result.push({ bucket:cat, weight:alloc[i], products:pool.map(slim), unfilled:pool.length===0 });
  });
  var filled = result.filter(function(b){ return b.products.length; });
  var wsum = filled.reduce(function(a,b){ return a+b.weight; },0) || 1;
  var top1 = filled.map(function(b){ return { w:b.weight/wsum, p:b.products[0] }; });
  function agg(f){ return round(top1.reduce(function(a,x){ return a+x.w*f(x.p); },0),4); }
  var portfolio = {
    expRet: agg(function(p){return p.annRet;}),
    expVol: agg(function(p){return p.annVol;}),
    expMaxDD: agg(function(p){return p.maxDD;}),
    avgSharpe: round(top1.reduce(function(a,x){return a+x.w*x.p.sharpe;},0),3),
    avgFee: agg(function(p){return p.totalFeeRate;}),
    filledWeight: wsum,
  };
  return { buckets:result, portfolio:portfolio };
}

// 条款穿透 (同 lib/scoring.js clausePenalty)
function clausePenalty(p){
  var order = { green:0, yellow:1, orange:2, red:3 };
  var toneName = { 0:'绿灯条款 (安全)', 1:'黄灯条款 (关注)', 2:'橙灯条款 (中高)', 3:'红灯条款 (高危)' };
  var lambdaByTone = { green:1.0, yellow:0.92, orange:0.80, red:0.65 };
  var worst = 'green';
  var hits = [];
  var text = (p.clauses||[]).join(' ');
  var ONT = D.ontology;
  if (ONT && ONT.classes) {
    ONT.classes.forEach(function(cls){
      var matched = cls.keywords.filter(function(kw){ return text.indexOf(kw)>=0; });
      if (matched.length>=2 || (cls.tone==='red' && matched.length>=1)) {
        hits.push({ id:cls.id, name:cls.name, tone:cls.tone, matched:matched, hint:cls.hint });
        if (order[cls.tone] > order[worst]) worst = cls.tone;
      }
    });
  }
  if (hits.length===0 && p.clauseTone) worst = p.clauseTone;
  return { lambda:lambdaByTone[worst], tone:worst, toneLabel:toneName[order[worst]], hits:hits };
}

// ---- API 分发器:app.js 的 api() 调用走这里 ----
window.__STATIC_API__ = function(u, opt){
  var body = {};
  try { body = opt && opt.body ? JSON.parse(opt.body) : {}; } catch(e){}
  var qs = {};
  var qi = u.indexOf('?');
  var pathOnly = u;
  if (qi >= 0) {
    pathOnly = u.slice(0, qi);
    u.slice(qi+1).split('&').forEach(function(kv){
      var p = kv.split('=');
      qs[decodeURIComponent(p[0])] = decodeURIComponent(p[1]||'');
    });
  }
  var out;
  switch (pathOnly) {
    case '/api/products':
      out = { meta:D.meta, weights:D.weights, dimensions:D.dimensions, products:D.products.map(slim) }; break;
    case '/api/product':
      out = byCode[qs.code] || { error:'not found' }; break;
    case '/api/weights':
      out = { weights:D.weights, dimensions:D.dimensions, ahpMatrix:D.ahpMatrix }; break;
    case '/api/lifecycle':
      out = D.lifecycle; break;
    case '/api/ontology':
      out = D.ontology; break;
    case '/api/assess':
      out = assessRisk(body.answers); break;
    case '/api/recommend':
      out = recommend(body); break;
    case '/api/clause':
      out = clausePenalty({ clauses:[String(body.text||'')], clauseTone:null }); break;
    default:
      out = { error:'unknown api: '+u };
  }
  return Promise.resolve(out);
};
})();
