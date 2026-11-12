/* 양돈 경영분석 — 화면 로직. 계산은 calc.js(엑셀 수식 이식)에서. */
(() => {
'use strict';
const { analyze, feedSwitch, feedStages, alerts, fmt } = window.Calc;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
const mil = v => fmt(v / 1e6, 1);
const KEY = 'pigfarm-v1';

const GROUPS = [
  ['두수 현황', [['sows', '번식돈(상시모돈)', '두'], ['gilts', '후보돈·웅돈 등', '두'], ['grow', '자돈·비육돈', '두']]],
  ['사료', [['feedMain', '주력 사료량', 'kg'], ['feedOther', '기타 사료량', 'kg'], ['feedCost', '사료 순매입액', '원']]],
  ['판매', [['sold', '비육돈 판매두수', '두'], ['weight', '총 판매 생체중', 'kg'], ['price', '평균 돈가(지육)', '원/kg'], ['cullSold', '도태돈·자돈·후보돈 판매', '두'], ['cullRev', '도태돈 등 판매대금', '원']]],
  ['생산관리비', [['labor', '직원 인건비', '원'], ['breeding', '종돈 입식비', '원'], ['semen', '정액 비용', '원'], ['meds', '방역·약품', '원'], ['manure', '분뇨처리', '원'], ['util', '수도광열·유류비', '원'], ['repair', '시설·수선비', '원'], ['vehicle', '차량경비(운반비)', '원'], ['other', '기타', '원'], ['depr', '감가상각비', '원']]],
  ['일반관리비·이자', [['ownerLabor', '자가 인건비', '원'], ['insurance', '보험료', '원'], ['interest', '대출이자(담보+신용)', '원']]],
];
const FIELDS = GROUPS.flatMap(g => g[1]);

// ---------- 저장소 ----------
const blankFarm = name => ({
  id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  farm: name || '새 농장', year: new Date().getFullYear(), yieldRate: 0.77, consultant: '',
  months: Object.fromEntries(FIELDS.map(f => [f[0], Array(12).fill(null)])),
  sim: { msy: null, price: null, msyMin: 22, msyStep: 1, priceMin: 5500, priceStep: 100 },
  feedStages: window.SAMPLE.feedStages.map(s => ({ ...s, ton: 0, price: 0, product: '' })),
  sw: { dPrice: 20, dFcr: -0.15, dMsy: 0, dWt: 0 },
});
const normalize = f => {
  const b = blankFarm(f.farm);
  const out = { ...b, ...f, sim: { ...b.sim, ...f.sim }, sw: { ...b.sw, ...f.sw }, months: { ...b.months } };
  for (const [k] of FIELDS) out.months[k] = Array.from({ length: 12 }, (_, i) => num(f.months?.[k]?.[i]));
  if (!Array.isArray(f.feedStages) || !f.feedStages.length) out.feedStages = b.feedStages;
  return out;
};
let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
if (!db || !Array.isArray(db.farms) || !db.farms.length) {
  const s = normalize({ ...window.SAMPLE, farm: window.SAMPLE.farm + ' (예시)' });
  db = { farms: [s], cur: s.id };
} else db.farms = db.farms.map(normalize);
let farm = db.farms.find(f => f.id === db.cur) || db.farms[0];
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { db.cur = farm.id; localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('⚠ 저장 실패 — 백업 저장을 눌러 파일로 보관하세요'); } }, 250); };
const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2200); };

// ---------- 상태 ----------
let A = null, month = 0, tab = 'input';
const recompute = () => { A = analyze(farm); };

// ---------- 농장 선택 ----------
function renderFarmSel() {
  $('#farmSel').innerHTML = db.farms.map(f => `<option value="${f.id}" ${f.id === farm.id ? 'selected' : ''}>${esc(f.farm)}</option>`).join('');
}
const switchFarm = id => { farm = db.farms.find(f => f.id === id) || db.farms[0]; save(); renderAll(); };
$('#farmSel').onchange = e => switchFarm(e.target.value);
$('#farmNew').onclick = () => { const n = prompt('새 농장 이름', ''); if (n == null) return; const f = blankFarm(n.trim() || '새 농장'); db.farms.push(f); switchFarm(f.id); go('input'); };
$('#farmDel').onclick = () => {
  if (!confirm(`「${farm.farm}」 농장 데이터를 삭제할까요? 되돌릴 수 없습니다. (필요하면 먼저 백업 저장)`)) return;
  db.farms = db.farms.filter(f => f !== farm);
  if (!db.farms.length) db.farms.push(blankFarm());
  switchFarm(db.farms[0].id);
};

// ---------- 탭 ----------
function go(t) {
  tab = t;
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  $$('.panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  renderVisible(); window.scrollTo(0, 0);
}
$$('nav.tabs button').forEach(b => (b.onclick = () => go(b.dataset.tab)));
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

// ---------- ① 입력 ----------
function renderInfo() {
  $$('[data-k]').forEach(el => { const k = el.dataset.k; el.value = k === 'yieldPct' ? +(farm.yieldRate * 100).toFixed(2) : farm[k] ?? ''; });
}
const filled = i => farm.months.sows[i] != null;
function renderChips() {
  $('#chips').innerHTML = Array.from({ length: 12 }, (_, i) =>
    `<button type="button" class="chip ${i === month ? 'on' : ''} ${filled(i) ? 'filled' : ''}" data-m="${i}" aria-pressed="${i === month}">${i + 1}월</button>`).join('');
  const r = A.rows[month];
  $('#monthQuick').textContent = r.active ? `${month + 1}월 → MSY ${fmt(r.msy, 1)} · FCR ${fmt(r.fcr, 2)} · 순손익 ${mil(r.net)}백만원` : '';
}
function renderMonth() {
  renderChips();
  $('#monthFields').innerHTML = GROUPS.map(([g, fs]) => `<fieldset><legend>${g}</legend><div class="grid">${fs.map(([k, l, u]) =>
    `<label class="f">${l} <span class="unit">(${u})</span><input class="in" type="number" inputmode="${u === '원' || u === '두' ? 'numeric' : 'decimal'}" data-mk="${k}" data-mi="${month}" value="${farm.months[k][month] ?? ''}"></label>`).join('')}</div></fieldset>`).join('');
}
function renderTable() {
  const head = '<tr><th>항목</th>' + Array.from({ length: 12 }, (_, i) => `<th>${i + 1}월</th>`).join('') + '<th>합계</th></tr>';
  const body = GROUPS.map(([g, fs]) => `<tr><td colspan="14" class="l" style="background:var(--surface-2);font-weight:600">${g}</td></tr>` + fs.map(([k, l, u]) => {
    const vals = farm.months[k];
    return `<tr><td class="l">${l} <span class="unit">${u}</span></td>` + vals.map((v, i) => `<td><input class="in" type="number" data-mk="${k}" data-mi="${i}" value="${v ?? ''}" aria-label="${i + 1}월 ${l}"></td>`).join('') +
      `<td data-sum="${k}">${k === 'price' ? '' : fmt(vals.reduce((a, b) => a + (b || 0), 0))}</td></tr>`;
  }).join('')).join('');
  $('#tableView').innerHTML = `<table class="edit">${head}${body}</table>`;
}
$('#chips').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { month = +b.dataset.m; renderMonth(); } };
$('#copyPrev').onclick = () => {
  if (month === 0) return toast('1월은 전월이 없습니다');
  for (const [k] of FIELDS) farm.months[k][month] = farm.months[k][month - 1];
  save(); recompute(); renderMonth(); toast(`${month}월 값을 ${month + 1}월에 복사했습니다`);
};
const setView = table => {
  $('#monthView').hidden = table; $('#tableView').hidden = !table;
  $('#viewMonth').classList.toggle('ghost', table); $('#viewTable').classList.toggle('ghost', !table);
  table ? renderTable() : renderMonth();
};
$('#viewMonth').onclick = () => setView(false);
$('#viewTable').onclick = () => setView(true);

// 모든 입력은 한 곳에서 처리
document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.k) { if (d.k === 'yieldPct') farm.yieldRate = (num(el.value) ?? 0) / 100; else farm[d.k] = d.k === 'year' ? num(el.value) : el.value; if (d.k === 'farm') renderFarmSel(); }
  else if (d.mk) {
    farm.months[d.mk][+d.mi] = num(el.value);
    const s = $(`[data-sum="${d.mk}"]`); if (s && d.mk !== 'price') s.textContent = fmt(farm.months[d.mk].reduce((a, b) => a + (b || 0), 0));
  }
  else if (d.s) { farm.sim[d.s] = num(el.value); $$(`[data-s="${d.s}"]`).forEach(o => o !== el && (o.value = el.value)); }
  else if (d.w) farm.sw[d.w] = num(el.value) ?? 0;
  else if (d.st) { const [i, k] = d.st.split('.'); farm.feedStages[+i][k] = k === 'product' ? el.value : (k === 'std' ? (num(el.value) ?? 0) / 100 : num(el.value) ?? 0); }
  else return;
  save(); recompute();
  if (tab === 'input') renderChips(); else renderVisible(el);
});

// ---------- ② 목표 ----------
const kpi = (k, v, d = '', unit = '') => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}${unit ? ` <small>${unit}</small>` : ''}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const delta = (a, b, d = 0, unit = '', better = 1) => {
  const x = b - a; if (!isFinite(x) || Math.abs(x) < 10 ** -(d + 1)) return '변화 없음';
  const good = x * better > 0;
  return `<span class="${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${x > 0 ? '+' : ''}${fmt(x, d)}${unit}</span>`;
};
function renderTarget(active) {
  const emptyMsg = '<p class="sub">① 농장 입력에서 월별 실적(최소 상시모돈·판매두수·판매체중·돈가·사료)을 먼저 입력하세요.</p>';
  if (A.empty) { $('#baseKpis').innerHTML = emptyMsg; $('#quickKpis').innerHTML = ''; return; }
  const b = A.base;
  $('#baseKpis').innerHTML = [
    kpi('상시 모돈수', fmt(b.sows, 1), '', '두'), kpi('MSY', fmt(b.msy, 1), '', '두/모돈/년'), kpi('평균 돈가', fmt(b.price), '', '원/kg'),
    kpi('출하 생체중', fmt(b.liveWt, 1), '', 'kg/두'), kpi('지육율', fmt(b.yieldRate * 100, 1), '', '%'), kpi('FCR', fmt(b.fcr, 2)),
    kpi('평균 사료단가', fmt(b.feedPrice), '', '원/kg'), kpi('분석 개월수', A.act.length, '', '개월'),
  ].join('');
  // 목표 입력칸: 비어 있으면 현재값 표시
  $$('[data-s]').forEach(el => { if (el === active) return; const k = el.dataset.s; const v = farm.sim[k] ?? (k === 'msy' ? b.msy : k === 'price' ? b.price : ''); el.value = v; });
  const c = A.cur, t = A.tgt;
  $('#quickKpis').innerHTML = [
    kpi('연간 추정손익', `${mil(c.profit)} → ${mil(t.profit)}`, delta(c.profit / 1e6, t.profit / 1e6, 1, '백만원'), '백만원'),
    kpi('월평균 손익', `${mil(c.monthlyProfit)} → ${mil(t.monthlyProfit)}`, delta(c.monthlyProfit / 1e6, t.monthlyProfit / 1e6, 1, '백만원'), '백만원'),
    kpi('두당 손익', `${fmt(c.profitPH)} → ${fmt(t.profitPH)}`, delta(c.profitPH, t.profitPH, 0, '원'), '원'),
    kpi('손익분기 돈가', `${fmt(c.bep)} → ${fmt(t.bep)}`, delta(c.bep, t.bep, 0, '원', -1), '원/kg'),
  ].join('');
}

// ---------- 차트 ----------
const charts = {};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  charts[id]?.destroy();
  Chart.defaults.color = css('--ink-2'); Chart.defaults.borderColor = css('--line');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  cfg.options = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, ...cfg.options };
  charts[id] = new Chart(el, cfg);
}

// ---------- ③ 결과 ----------
function diagItems() {
  const B = A.bench, c = A.cur, b = A.base;
  const st = (v, ref, higherBetter) => {
    const r = higherBetter ? v / ref : ref / v;
    return r >= 1 ? ['good', '✔', '우수'] : r >= 0.9 ? ['serious', '▲', '보통 이하'] : ['critical', '✖', '개선 필요'];
  };
  const it = (t, v, ref, hb, fv, fr, src) => { const [lv, ic, lab] = st(v, ref, hb); return { t, lv, ic, lab, m: `농장 ${fv} / 기준 ${fr}`, src }; };
  return [
    it('MSY (모돈당 연간 출하두수)', b.msy, B.msy.v, true, fmt(b.msy, 1) + '두', B.msy.v + '두', B.msy.src),
    it('모돈당 연간 출하중량', b.msy * b.liveWt, B.kgPerSow.v, true, fmt(b.msy * b.liveWt) + 'kg', fmt(B.kgPerSow.v) + 'kg', B.kgPerSow.src),
    it('손익분기 돈가 (BEP)', c.bep, B.bep.v, false, fmt(c.bep) + '원', fmt(B.bep.v) + '원', B.bep.src),
    it('손익률', c.margin, B.margin.v, true, fmt(c.margin * 100, 1) + '%', fmt(B.margin.v * 100, 1) + '%', B.margin.src),
  ];
}
function renderResult() {
  const R = $('#resultBody');
  if (A.empty) { R.innerHTML = '<section class="card"><p class="sub">① 농장 입력에서 월별 실적을 먼저 입력하세요.</p></section>'; return; }
  const c = A.cur, t = A.tgt, b = A.base, ph = A.ph;
  $('#prTitle').textContent = `${farm.farm} 경영분석 보고서`;
  $('#prSub').textContent = `${farm.year ?? ''}년 실적 기준 · 작성일 ${new Date().toLocaleDateString('ko-KR')}${farm.consultant ? ' · 담당 ' + farm.consultant : ''}`;
  const best = A.levers[0];
  const al = alerts(A);
  const lossMonths = A.act.filter(r => r.net < 0).map(r => r.month + '월');
  const pvRow = (l, u, a, b2, d = 0, better = 1) => `<tr><td class="l">${l}</td><td class="l unit">${u}</td><td>${fmt(a, d)}</td><td>${fmt(b2, d)}</td><td>${delta(a, b2, d, '', better)}</td><td>${a ? fmt((b2 / a - 1) * 100, 1) + '%' : '–'}</td></tr>`;
  const maxAbs = Math.max(...A.grid.flat().map(Math.abs)) || 1;
  const heatCell = (v, mi, pi) => {
    const pct = Math.round(Math.min(1, Math.abs(v) / maxAbs) * 70);
    const tg = Math.abs(A.msyAxis[mi] - t.msy) < 1e-9 && A.priceAxis[pi] === t.price;
    return `<td class="${tg ? 'tg' : ''}" style="background:color-mix(in oklab, var(${v < 0 ? '--neg' : '--pos'}) ${pct}%, var(--mid))">${fmt(v, 0)}</td>`;
  };
  const costRows = [['사료비', ph.feed, '변동'], ['약품·방역비', ph.meds, '변동'], ['수도광열·유류비', ph.util, '변동'], ['기타 변동비 (종돈·정액·분뇨·차량·기타)', ph.otherVar, '변동'],
    ['인건비 (직원+자가)', ph.labor, '고정'], ['감가상각비', ph.depr, '고정'], ['수선비', ph.repair, '고정'], ['이자비용', ph.interest, '고정'], ['기타 고정비 (보험료)', ph.otherFixed, '고정']];
  const totPH = ph.varTotal + ph.fixedTotal;

  R.innerHTML = `
  <section class="card">
    <h2>종합 요약 <span class="unit">현재 → 목표 (MSY ${fmt(t.msy, 1)}두, 돈가 ${fmt(t.price)}원)</span></h2>
    <div class="kpis" style="margin-top:10px">
      ${kpi('MSY', `${fmt(c.msy, 1)} → ${fmt(t.msy, 1)}`, delta(c.msy, t.msy, 1, '두'), '두')}
      ${kpi('돈가', `${fmt(c.price)} → ${fmt(t.price)}`, delta(c.price, t.price, 0, '원'), '원/kg')}
      ${kpi('연간 손익', `${mil(c.profit)} → ${mil(t.profit)}`, delta(c.profit / 1e6, t.profit / 1e6, 1, '백만원'), '백만원')}
      ${kpi('월평균 손익', `${mil(c.monthlyProfit)} → ${mil(t.monthlyProfit)}`, delta(c.monthlyProfit / 1e6, t.monthlyProfit / 1e6, 1, '백만원'), '백만원')}
      ${kpi('두당 손익', `${fmt(c.profitPH)} → ${fmt(t.profitPH)}`, delta(c.profitPH, t.profitPH, 0, '원'), '원')}
      ${kpi('연간 출하두수', `${fmt(c.heads)} → ${fmt(t.heads)}`, delta(c.heads, t.heads, 0, '두'), '두')}
      ${kpi('연간 매출', `${fmt(c.revenue / 1e6)} → ${fmt(t.revenue / 1e6)}`, delta(c.revenue / 1e6, t.revenue / 1e6, 1, '백만원'), '백만원')}
      ${kpi('연간 총비용', `${fmt(c.total / 1e6)} → ${fmt(t.total / 1e6)}`, delta(c.total / 1e6, t.total / 1e6, 1, '백만원', -1), '백만원')}
      ${kpi('손익분기 돈가', `${fmt(c.bep)} → ${fmt(t.bep)}`, delta(c.bep, t.bep, 0, '원', -1), '원/kg')}
      ${kpi('돈가 여유 (돈가−BEP)', `${fmt(t.headroom)}`, t.headroom >= 0 ? '<span class="up">흑자 구간</span>' : '<span class="down">적자 구간</span>', '원/kg')}
    </div>
  </section>

  <section class="card">
    <h2>농장 진단 — 전국 기준 대비</h2>
    <p class="sub">현재 실적을 2025년 공개 통계와 비교했습니다.</p>
    <div class="diag">${diagItems().map(d => `<div class="dg" style="--st:var(--${d.lv})"><div class="t"><span class="ico" aria-hidden="true">${d.ic}</span>${d.t} <span class="unit">· ${d.lab}</span></div><div class="m">${d.m}</div><div class="src">출처: ${d.src}</div></div>`).join('')}</div>
  </section>

  <section class="card">
    <h2>무엇을 개선하면 가장 효과가 큰가</h2>
    <p class="sub">목표 시나리오에서 각 지표를 한 단계 개선할 때 늘어나는 <b>연간 손익(백만원)</b>. 가장 큰 효과: <b>${best.label}</b> → 연 ${mil(best.gain)}백만원</p>
    <div class="chart short"><canvas id="cLever" role="img" aria-label="개선 항목별 연간 손익 증가액 막대 차트"></canvas></div>
    <div class="scroll"><table style="margin-top:8px"><tr><th class="l">개선 항목</th><th>연간 손익 증가</th><th>월평균</th><th>두당</th></tr>
      ${A.levers.map(l => `<tr><td class="l">${l.label}</td><td>${mil(l.gain)}백만원</td><td>${mil(l.gain / 12)}백만원</td><td>${fmt(l.gain / t.heads)}원</td></tr>`).join('')}</table></div>
  </section>

  <section class="card">
    <h2>현재 vs 목표 비교</h2>
    <div class="scroll"><table>
      <tr><th class="l">지표</th><th class="l">단위</th><th>현재</th><th>목표</th><th>증감</th><th>증감률</th></tr>
      ${pvRow('MSY', '두/모돈/년', c.msy, t.msy, 1)}${pvRow('돈가', '원/kg', c.price, t.price)}
      ${pvRow('연간 출하두수', '두', c.heads, t.heads)}${pvRow('월평균 출하두수', '두/월', c.monthlyHeads, t.monthlyHeads, 1)}
      ${pvRow('지육중량', 'kg/두', c.carcass, t.carcass, 1)}${pvRow('두당 매출', '원/두', c.revPH, t.revPH)}
      ${pvRow('연간 매출', '백만원', c.revenue / 1e6, t.revenue / 1e6, 1)}${pvRow('연간 변동비', '백만원', c.variable / 1e6, t.variable / 1e6, 1, -1)}
      ${pvRow('연간 고정비', '백만원', c.fixed / 1e6, t.fixed / 1e6, 1, -1)}${pvRow('연간 총비용', '백만원', c.total / 1e6, t.total / 1e6, 1, -1)}
      ${pvRow('연간 추정손익', '백만원', c.profit / 1e6, t.profit / 1e6, 1)}${pvRow('월평균 추정손익', '백만원', c.monthlyProfit / 1e6, t.monthlyProfit / 1e6, 1)}
      ${pvRow('두당 추정손익', '원/두', c.profitPH, t.profitPH)}${pvRow('매출이익률', '%', c.margin * 100, t.margin * 100, 1)}
      ${pvRow('손익분기 돈가', '원/kg', c.bep, t.bep, 0, -1)}${pvRow('현재 돈가 대비 여유', '원/kg', c.headroom, t.headroom)}
    </table></div>
  </section>

  <section class="card">
    <h2>두당 생산비 구조 <span class="unit">(현재 기준, 원/두)</span></h2>
    <p class="sub">총 생산비 ${fmt(totPH)}원/두 · 사료비 비중 ${fmt(ph.feed / totPH * 100, 1)}% · 변동비 ${fmt(ph.varTotal)}원 / 고정비 ${fmt(ph.fixedTotal)}원</p>
    <div class="chart"><canvas id="cCost" role="img" aria-label="두당 생산비 항목별 막대 차트"></canvas></div>
    <div class="scroll"><table style="margin-top:8px"><tr><th class="l">항목</th><th class="l">구분</th><th>원/두</th><th>연간(백만원)</th><th>구성비</th></tr>
      ${costRows.map(([l, v, g]) => `<tr><td class="l">${l}</td><td class="l">${g}</td><td>${fmt(v)}</td><td>${mil(v * c.heads)}</td><td>${fmt(v / totPH * 100, 1)}%</td></tr>`).join('')}
      <tr><th class="l">합계</th><th></th><th>${fmt(totPH)}</th><th>${mil(totPH * c.heads)}</th><th>100%</th></tr></table></div>
  </section>

  <section class="card">
    <h2>월별 추이</h2>
    <p class="sub">${lossMonths.length ? `적자 월: <b class="neg">${lossMonths.join(', ')}</b>` : '모든 달 흑자'} · 연간 누적 순손익 ${mil(A.act.at(-1).cum)}백만원</p>
    <div class="two">
      <div><h3>돈가 vs 생산원가(BEP) <span class="unit">원/kg</span></h3><div class="chart short"><canvas id="cBep" role="img" aria-label="월별 돈가와 손익분기 생산원가 꺾은선 차트"></canvas></div></div>
      <div><h3>월 순손익 <span class="unit">백만원</span></h3><div class="chart short"><canvas id="cNet" role="img" aria-label="월별 순손익 막대 차트"></canvas></div></div>
      <div><h3>MSY <span class="unit">두/모돈/년</span></h3><div class="chart short"><canvas id="cMsy" role="img" aria-label="월별 MSY 막대 차트"></canvas></div></div>
      <div><h3>FCR <span class="unit">kg/kg</span></h3><div class="chart short"><canvas id="cFcr" role="img" aria-label="월별 FCR 꺾은선 차트"></canvas></div></div>
    </div>
    <div class="scroll"><table style="margin-top:10px">
      <tr><th>월</th><th>모돈</th><th>출하</th><th>MSY</th><th>FCR</th><th>사료단가</th><th>사료비 비중</th><th>돈가</th><th>BEP 돈가</th><th>매출(백만)</th><th>비용(백만)</th><th>순손익(백만)</th><th>누적(백만)</th></tr>
      ${A.act.map(r => `<tr><td>${r.month}월</td><td>${fmt(r.sows)}</td><td>${fmt(r.sold)}</td><td>${fmt(r.msy, 1)}</td><td>${fmt(r.fcr, 2)}</td><td>${fmt(r.feedPrice)}</td><td>${r.feedRatio == null ? '–' : fmt(r.feedRatio * 100, 1) + '%'}</td><td>${fmt(r.price)}</td><td class="${r.bepPrice > r.price ? 'neg' : ''}">${fmt(r.bepPrice)}</td><td>${mil(r.revenue)}</td><td>${mil(r.totalCost + r.interest)}</td><td class="${r.net < 0 ? 'neg' : ''}">${mil(r.net)}</td><td>${mil(r.cum)}</td></tr>`).join('')}
    </table></div>
  </section>

  <section class="card">
    <h2>점검이 필요한 달</h2>
    ${al.length ? `<ul class="alerts">${al.map(a => `<li style="--st:var(--${a.lv})"><span class="tag">${a.m}월 ${a.lv === 'critical' ? '✖ 적자' : '▲ 주의'}</span><span>${esc(a.t)}</span></li>`).join('')}</ul>` : '<p class="sub">✔ 특이 사항 없음</p>'}
  </section>

  <section class="card">
    <h2>MSY × 돈가 민감도 <span class="unit">연간 추정손익, 백만원</span></h2>
    <p class="sub">적색 = 손실, 회색 = 손익분기 부근, 청색 = 이익. 굵은 테두리 = 목표 시나리오. 고정비는 현재 출하량 기준으로 고정.</p>
    <div class="scroll"><table class="heat"><tr><th>MSY \\ 돈가</th>${A.priceAxis.map(p => `<th>${fmt(p)}</th>`).join('')}</tr>
      ${A.grid.map((row, mi) => `<tr><th>${fmt(A.msyAxis[mi], 1)}</th>${row.map((v, pi) => heatCell(v, mi, pi)).join('')}</tr>`).join('')}</table></div>
    <h3>MSY별 손익분기 돈가</h3>
    <div class="scroll"><table><tr><th class="l">MSY</th>${A.bepByMsy.map(r => `<th>${fmt(r.msy, 1)}</th>`).join('')}</tr>
      <tr><td class="l">BEP 돈가 (원/kg)</td>${A.bepByMsy.map(r => `<td>${fmt(r.bep)}</td>`).join('')}</tr>
      <tr><td class="l">두당 고정비 (원)</td>${A.bepByMsy.map(r => `<td>${fmt(r.fixedPH)}</td>`).join('')}</tr></table></div>
  </section>
  <p class="note">※ 본 모델은 입력 가정에 따른 세전 경영 시뮬레이션입니다. 재고 증감, 폐사·출하 지연, 부가세, 보조금, 일회성 비용, 금융 원금상환 등은 별도 반영이 필요합니다. 의사결정 전 실제 회계자료와 확인하세요.</p>`;

  const s1 = css('--s1'), s2 = css('--s2'), pos = css('--pos'), neg = css('--neg');
  const labels = A.act.map(r => r.month + '월');
  const bar = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28 };
  chart('cLever', { type: 'bar', data: { labels: A.levers.map(l => l.label), datasets: [{ label: '연간 손익 증가(백만원)', data: A.levers.map(l => +(l.gain / 1e6).toFixed(1)), backgroundColor: s1, ...bar }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: css('--line') } }, y: { grid: { display: false } } } } });
  chart('cCost', { type: 'bar', data: { labels: costRows.map(r => r[0].replace(/ \(.+\)/, '')), datasets: [{ label: '원/두', data: costRows.map(r => Math.round(r[1])), backgroundColor: s1, ...bar }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } } } } });
  chart('cBep', { type: 'line', data: { labels, datasets: [
    { label: '돈가', data: A.act.map(r => r.price), borderColor: s1, backgroundColor: s1, borderWidth: 2, pointRadius: 4 },
    { label: '생산원가(BEP)', data: A.act.map(r => Math.round(r.bepPrice)), borderColor: s2, backgroundColor: s2, borderWidth: 2, pointRadius: 4 }] },
    options: { plugins: { legend: { position: 'bottom' } } } });
  chart('cNet', { type: 'bar', data: { labels, datasets: [{ label: '순손익(백만원)', data: A.act.map(r => +(r.net / 1e6).toFixed(1)), backgroundColor: A.act.map(r => (r.net < 0 ? neg : pos)), ...bar, borderSkipped: false }] },
    options: { plugins: { legend: { display: false } } } });
  chart('cMsy', { type: 'bar', data: { labels, datasets: [{ label: 'MSY', data: A.act.map(r => r.msy), backgroundColor: s1, ...bar }] }, options: { plugins: { legend: { display: false } } } });
  chart('cFcr', { type: 'line', data: { labels, datasets: [{ label: 'FCR', data: A.act.map(r => r.fcr), borderColor: s1, backgroundColor: s1, borderWidth: 2, pointRadius: 4 }] }, options: { plugins: { legend: { display: false } } } });
}

// ---------- ④ 사료 컨설팅 ----------
function renderFeed(active) {
  $$('[data-w]').forEach(el => { if (el !== active) el.value = farm.sw[el.dataset.w] ?? 0; });
  const out = $('#switchOut');
  if (A.empty) out.innerHTML = '<p class="sub">① 농장 입력에서 월별 실적을 먼저 입력하세요.</p>';
  else {
    const S = feedSwitch(A, farm.sw), w = farm.sw, b = A.base;
    const sign = v => (v > 0 ? '+' : '') + v;
    const pitch = S.delta >= 0
      ? `사료단가가 kg당 ${sign(w.dPrice)}원 변하더라도, FCR ${sign(w.dFcr)}${w.dMsy ? ` · MSY ${sign(w.dMsy)}두` : ''}${w.dWt ? ` · 출하체중 ${sign(w.dWt)}kg` : ''} 개선 시 <b class="up">연간 ${mil(S.delta)}백만원 (두당 ${fmt(S.deltaPH)}원) 이익 증가</b>가 예상됩니다.`
      : `현재 가정으로는 <b class="down">연간 ${mil(S.delta)}백만원 손실</b>입니다. 단가 인상분을 상쇄하려면 FCR을 최소 ${fmt(S.fcrNeeded, 3)} 이상 개선해야 합니다.`;
    out.innerHTML = `
      <p style="font-size:1rem;margin:0 0 12px">${pitch}</p>
      <div class="kpis">
        ${kpi('연간 손익 변화', `<span class="${S.delta < 0 ? 'neg' : ''}">${mil(S.delta)}</span>`, '', '백만원')}
        ${kpi('두당 손익 변화', fmt(S.deltaPH), '', '원')}
        ${kpi('연간 사료비', `${mil(S.feedCostBefore)} → ${mil(S.feedCostAfter)}`, delta(S.feedCostBefore / 1e6, S.feedCostAfter / 1e6, 1, '백만원', -1), '백만원')}
        ${kpi('단가 상쇄 필요 FCR 개선', w.dPrice > 0 ? '−' + fmt(S.fcrNeeded, 3) : '–', w.dPrice > 0 ? `FCR ${fmt(b.fcr, 2)} → ${fmt(b.fcr - S.fcrNeeded, 2)} 이하면 이익` : '단가 인상 없음')}
      </div>
      <div class="scroll"><table style="margin-top:10px"><tr><th class="l">항목</th><th>현재(목표 시나리오)</th><th>전환 후</th></tr>
        <tr><td class="l">사료단가 (원/kg)</td><td>${fmt(b.feedPrice)}</td><td>${fmt(b.feedPrice + (w.dPrice || 0))}</td></tr>
        <tr><td class="l">FCR</td><td>${fmt(b.fcr, 2)}</td><td>${fmt(b.fcr + (w.dFcr || 0), 2)}</td></tr>
        <tr><td class="l">MSY</td><td>${fmt(S.before.msy, 1)}</td><td>${fmt(S.after.msy, 1)}</td></tr>
        <tr><td class="l">두당 사료비 (원)</td><td>${fmt(S.feedCostBefore / S.before.heads)}</td><td>${fmt(S.feedCostAfter / S.after.heads)}</td></tr>
        <tr><td class="l">손익분기 돈가 (원/kg)</td><td>${fmt(S.before.bep)}</td><td>${fmt(S.after.bep)}</td></tr>
        <tr><td class="l">연간 추정손익 (백만원)</td><td>${mil(S.before.profit)}</td><td>${mil(S.after.profit)}</td></tr></table></div>`;
  }
  // 구간별 사료
  const F = feedStages(farm.feedStages);
  if (!active || !active.dataset.st) {
    $('#stageTable').innerHTML = `<table class="edit"><tr><th class="l">구간</th><th class="l">급여일령</th><th>사용량(톤)</th><th>단가(원/kg)</th><th>사료비(백만원)</th><th>사용비율</th><th>사료비 비율</th><th>표준비율(%)</th><th>차이</th><th class="l">사료 제품</th></tr>
      ${F.rows.map((r, i) => `<tr><td class="l">${esc(r.group ? r.group + ' · ' : '')}${esc(r.name)}</td><td class="l">${esc(r.days)}</td>
        <td><input class="in" type="number" inputmode="decimal" data-st="${i}.ton" value="${r.ton || ''}" aria-label="${esc(r.name)} 사용량"></td>
        <td><input class="in" type="number" inputmode="numeric" data-st="${i}.price" value="${r.price || ''}" aria-label="${esc(r.name)} 단가"></td>
        <td data-c="cost${i}"></td><td data-c="use${i}"></td><td data-c="cr${i}"></td>
        <td><input class="in" type="number" inputmode="decimal" step="0.5" data-st="${i}.std" value="${+(r.std * 100).toFixed(2) || ''}" aria-label="${esc(r.name)} 표준비율"></td>
        <td data-c="gap${i}"></td>
        <td><input class="in" style="text-align:left;min-width:150px" data-st="${i}.product" value="${esc(r.product)}" aria-label="${esc(r.name)} 사료 제품"></td></tr>`).join('')}
      <tr><th class="l">합계 / 가중평균</th><th></th><th data-c="ton"></th><th data-c="avg"></th><th data-c="cost"></th><th>100%</th><th>100%</th><th data-c="std"></th><th></th><th></th></tr></table>`;
  }
  F.rows.forEach((r, i) => {
    $(`[data-c="cost${i}"]`).textContent = mil(r.cost);
    $(`[data-c="use${i}"]`).textContent = fmt(r.useRatio * 100, 1) + '%';
    $(`[data-c="cr${i}"]`).textContent = fmt(r.costRatio * 100, 1) + '%';
    const g = $(`[data-c="gap${i}"]`); g.textContent = r.std ? (r.gap > 0 ? '+' : '') + fmt(r.gap * 100, 1) + '%p' : '–'; g.className = r.std && Math.abs(r.gap) >= 0.05 ? 'neg' : '';
  });
  $('[data-c="ton"]').textContent = fmt(F.ton, 2); $('[data-c="avg"]').textContent = fmt(F.avgPrice);
  $('[data-c="cost"]').textContent = mil(F.cost); $('[data-c="std"]').textContent = fmt(F.rows.reduce((a, r) => a + r.std, 0) * 100, 1) + '%';
  chart('cStage', { type: 'bar', data: { labels: F.rows.map(r => r.name), datasets: [
    { label: '농장 사용비율(%)', data: F.rows.map(r => +(r.useRatio * 100).toFixed(1)), backgroundColor: css('--s1'), borderRadius: 4, maxBarThickness: 22 },
    { label: '표준비율(%)', data: F.rows.map(r => +(r.std * 100).toFixed(1)), backgroundColor: css('--s2'), borderRadius: 4, maxBarThickness: 22 }] },
    options: { plugins: { legend: { position: 'bottom' } } } });
}

// ---------- 렌더 ----------
function renderVisible(active) {
  if (tab === 'target') renderTarget(active);
  else if (tab === 'result') renderResult();
  else if (tab === 'feed') renderFeed(active);
}
function renderAll() {
  recompute(); renderFarmSel(); renderInfo();
  $('#tableView').hidden ? renderMonth() : renderTable();
  renderVisible();
}

// ---------- 인쇄 ----------
$('#printBtn').onclick = () => { renderResult(); renderFeed(); setTimeout(() => window.print(), 300); };
window.addEventListener('beforeprint', () => { $$('.panel').forEach(p => p.classList.add('on')); Object.values(charts).forEach(c => c.resize()); });
window.addEventListener('afterprint', () => go(tab));

// ---------- 예시 / 백업 ----------
$('#loadSample').onclick = () => {
  if (!confirm(`현재 농장(「${farm.farm}」)의 입력값을 예시 데이터로 덮어쓸까요?`)) return;
  const keep = { id: farm.id, farm: farm.farm };
  Object.assign(farm, normalize({ ...structuredClone(window.SAMPLE), ...keep }));
  save(); renderAll(); toast('예시 데이터를 채웠습니다');
};
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
$('#expJson').onclick = () => download(`양돈경영분석_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'pigfarm', v: 1, farms: db.farms }, null, 1));
$('#impJson').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.farms) || !d.farms.every(f => f && typeof f.months === 'object')) throw 0;
    const added = d.farms.map(f => ({ ...normalize(f), id: blankFarm().id }));
    db.farms.push(...added); switchFarm(added[0].id); toast(`${added.length}개 농장을 추가했습니다`);
  } catch { alert('올바른 백업 파일이 아닙니다.'); }
};

// ---------- 엑셀 불러오기 ----------
const loadScript = src => new Promise((ok, no) => { if (window.XLSX) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
const XL_ROWS = { sows: 6, gilts: 7, grow: 8, feedMain: 10, feedOther: 11, sold: 15, cullSold: 16, weight: 17, price: 19, cullRev: 24, feedCost: 27, labor: 28, breeding: 29, semen: 30, meds: 31, manure: 32, util: 33, repair: 34, vehicle: 35, other: 36, depr: 37, ownerLabor: 39, insurance: 40, interest: 45 };
$('#xlsx').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer());
    const sh = p => { const n = wb.SheetNames.find(x => x.replace(/\s/g, '').startsWith(p)); return n && wb.Sheets[n]; };
    const b = sh('1.기초입력'), s = sh('2.농장'), f = sh('1-2.');
    if (!b) throw new Error('「1. 기초입력」 시트를 찾을 수 없습니다.');
    const v = (ws, a) => ws?.[a]?.v;
    const nv = (ws, a) => { const x = v(ws, a); return typeof x === 'number' && isFinite(x) ? x : null; };
    const COLS = 'EFGHIJKLMNOP';
    const farmNew = blankFarm(String(v(b, 'C4') || file.name.replace(/\.\w+$/, '')));
    for (const [k, r] of Object.entries(XL_ROWS)) farmNew.months[k] = [...COLS].map(c => nv(b, c + r));
    farmNew.yieldRate = nv(b, 'C18') ?? 0.77;
    if (s) Object.assign(farmNew.sim, { msy: nv(s, 'C9'), price: nv(s, 'C11'), msyMin: nv(s, 'C18') ?? 22, msyStep: nv(s, 'C19') ?? 1, priceMin: nv(s, 'C20') ?? 5500, priceStep: nv(s, 'C21') ?? 100 });
    if (f) farmNew.feedStages = Array.from({ length: 9 }, (_, i) => { const r = i + 6; return { group: v(f, 'A' + r) || '', name: v(f, 'B' + r) || '', days: String(v(f, 'C' + r) || '').trim(), ton: nv(f, 'D' + r) || 0, price: nv(f, 'E' + r) || 0, std: nv(f, 'I' + r) || 0, product: v(f, 'J' + r) || '' }; });
    if (!farmNew.months.sows.some(x => x != null)) throw new Error('상시모돈 값이 비어 있습니다.');
    db.farms.push(farmNew); switchFarm(farmNew.id); toast(`「${farmNew.farm}」 엑셀 데이터를 불러왔습니다`);
  } catch (err) { alert('엑셀을 읽지 못했습니다: ' + (err.message || '양식을 확인하세요')); }
};

// ---------- 시작 ----------
if (matchMedia('(min-width: 761px)').matches) setView(true);
renderAll();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => renderVisible());
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
