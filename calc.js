// 양돈농장 수익·비용 구조 계산 엔진 — 엑셀 모델(1. 기초입력 → 1-1 → 2 → 2-1 → 2-2 → 3. 종합분석) 수식을 그대로 옮김.
(function (root) {
  'use strict';

  // 엑셀 ROUNDUP/ROUNDDOWN (0에서 멀어지는/가까워지는 방향). toFixed로 부동소수 오차 제거.
  const roundUp = (x, d) => { const f = 10 ** d, v = +(x * f).toFixed(9); return Math.sign(v) * Math.ceil(Math.abs(v)) / f; };
  const roundDown = (x, d) => { const f = 10 ** d, v = +(x * f).toFixed(9); return Math.trunc(v) / f; };
  const n = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const has = v => typeof v === 'number' && isFinite(v);
  const div = (a, b) => (b ? a / b : null);

  const VAR_KEYS = ['feedCost', 'labor', 'breeding', 'semen', 'meds', 'manure', 'util', 'repair', 'vehicle', 'other', 'depr'];

  // 2025 공개 기준값 (엑셀 2-1 시트 H~L열 출처 그대로)
  const BENCH = {
    msy: { v: 18.9, src: '2025 한돈팜스 이용농가 (모돈당 연간 출하두수)' },
    psy: { v: 22.4, src: '2025 한돈팜스 이용농가 (모돈당 연간 이유두수)' },
    kgPerSow: { v: 2192, src: '출하두수 × 116kg (농림축산검역본부 도축실적)' },
    bep: { v: 5062, src: '한돈연구소 추정 손익분기단가' },
    margin: { v: 0.213, src: '2025 통계청 축산물 생산비 (비육돈 소득률)' },
  };

  function monthly(s) {
    const M = s.months, y = n(s.yieldRate);
    const rows = [];
    let cum = 0;
    for (let i = 0; i < 12; i++) {
      const g = k => n(M[k] && M[k][i]);
      const active = has(M.sows && M.sows[i]) && g('sows') > 0;
      const feed = g('feedMain') + g('feedOther');
      const prodCost = VAR_KEYS.reduce((a, k) => a + g(k), 0);
      const genCost = g('ownerLabor') + g('insurance');
      const totalCost = prodCost + genCost;
      const revenue = g('weight') * g('price') * y + g('cullRev');
      const gross = revenue - totalCost;
      const net = gross - g('interest');
      if (active) cum += net;
      const costPerKg = div(totalCost, g('weight'));
      rows.push({
        month: i + 1, active,
        sows: g('sows'), herd: g('sows') + g('gilts') + g('grow'), feed, sold: g('sold'), weight: g('weight'), price: g('price'),
        feedPrice: div(g('feedCost'), feed), feedRatio: div(g('feedCost'), totalCost),
        msy: g('sows') && active ? roundUp(g('sold') * 12 / g('sows'), 1) : null,
        fcr: g('weight') ? roundUp(feed / g('weight'), 2) : null,
        liveWt: div(g('weight'), g('sold')),
        revenue, prodCost, genCost, totalCost, gross, interest: g('interest'), net, cum: active ? cum : null,
        costPerKg, bepPrice: costPerKg != null && y ? costPerKg / y : null,
      });
    }
    return rows;
  }

  const avgOf = (rows, k) => { const v = rows.map(r => r[k]).filter(has); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

  function analyze(s) {
    const rows = monthly(s), act = rows.filter(r => r.active);
    if (!act.length) return { rows, empty: true };
    const M = s.months, idx = act.map(r => r.month - 1);
    const sum = k => idx.reduce((a, i) => a + n(M[k][i]), 0);
    const sold = sum('sold');
    const perSold = k => div(sum(k), sold) || 0;
    const y = n(s.yieldRate);

    // 시트 2. 기준값
    const base = {
      sows: sum('sows') / act.length,
      msy: roundDown(avgOf(act, 'msy'), 1),
      price: roundUp(avgOf(act, 'price'), 0),
      liveWt: div(sum('weight'), sold) || 0,
      yieldRate: y,
      fcr: avgOf(act, 'fcr'),
      feedPrice: avgOf(act, 'feedPrice'),
    };
    // 시트 1-1. 두당 비용
    const ph = {
      feed: base.liveWt * base.fcr * base.feedPrice,
      piglet: 0,
      meds: perSold('meds'),
      util: perSold('util'),
      otherVar: perSold('semen') + perSold('breeding') + perSold('vehicle') + perSold('other') + perSold('manure'),
      labor: perSold('labor') + perSold('ownerLabor'),
      depr: perSold('depr'),
      repair: perSold('repair'),
      interest: perSold('interest'),
      otherFixed: perSold('insurance'),
    };
    ph.varTotal = ph.feed + ph.piglet + ph.meds + ph.util + ph.otherVar;
    ph.fixedTotal = ph.labor + ph.depr + ph.repair + ph.interest + ph.otherFixed;
    const fixedAnnual = ph.fixedTotal * base.sows * base.msy;

    const scenario = (msy, price, o = {}) => {
      // o: 사료 전환 등 가정 변경 (fcr, feedPrice, liveWt)
      const fcr = o.fcr ?? base.fcr, fp = o.feedPrice ?? base.feedPrice, lw = o.liveWt ?? base.liveWt;
      const varPH = ph.varTotal - ph.feed + lw * fcr * fp;
      const heads = base.sows * msy, carcass = lw * y;
      const revPH = price * carcass, revenue = heads * revPH, variable = heads * varPH;
      const total = variable + fixedAnnual, profit = roundDown(revenue - total, 0);
      const bep = div(varPH + div(fixedAnnual, heads), carcass);
      return {
        msy, price, heads, monthlyHeads: heads / 12, carcass, revPH, revenue, variable, fixed: fixedAnnual, total,
        profit, monthlyProfit: profit / 12, profitPH: div(profit, heads), margin: div(profit, revenue),
        bep, headroom: bep == null ? null : price - bep, varPH, feedShare: div(lw * fcr * fp, div(total, heads)),
      };
    };

    const sim = s.sim || {};
    const cur = scenario(base.msy, base.price);
    const tgt = scenario(n(sim.msy) || base.msy, n(sim.price) || base.price);

    // 시트 2-2. 민감도 (7×7)
    const msyAxis = Array.from({ length: 7 }, (_, i) => +(n(sim.msyMin) + i * n(sim.msyStep)).toFixed(2));
    const priceAxis = Array.from({ length: 7 }, (_, i) => n(sim.priceMin) + i * n(sim.priceStep));
    const grid = msyAxis.map(m => priceAxis.map(p => (m * base.sows * (p * base.liveWt * y - ph.varTotal) - fixedAnnual) / 1e6));
    const bepByMsy = msyAxis.map(m => ({ msy: m, bep: (ph.varTotal + fixedAnnual / (base.sows * m)) / (base.liveWt * y), fixedPH: fixedAnnual / (base.sows * m) }));

    // 고도화: 개선 레버 — 목표 시나리오 기준 연간 손익 변화
    const T = tgt;
    const levers = [
      { key: 'msy', label: 'MSY +1두', gain: scenario(T.msy + 1, T.price).profit - T.profit },
      { key: 'fcr', label: 'FCR −0.1', gain: T.heads * base.liveWt * 0.1 * base.feedPrice },
      { key: 'price', label: '돈가 +100원/kg', gain: T.heads * T.carcass * 100 },
      { key: 'yield', label: '지육율 +1%p', gain: T.heads * base.liveWt * 0.01 * T.price },
      { key: 'feedPrice', label: '사료단가 −10원/kg', gain: T.heads * base.liveWt * base.fcr * 10 },
    ].sort((a, b) => b.gain - a.gain);

    return { rows, act, base, ph, fixedAnnual, cur, tgt, msyAxis, priceAxis, grid, bepByMsy, levers, scenario, bench: BENCH };
  }

  // 사료 전환 시뮬레이터: 단가 Δ원/kg, FCR Δ, MSY Δ, 출하체중 Δkg → 연간 손익 변화
  function feedSwitch(A, o) {
    const b = A.base, T = A.tgt;
    const fp = b.feedPrice + n(o.dPrice), fcr = b.fcr + n(o.dFcr), lw = b.liveWt + n(o.dWt), msy = T.msy + n(o.dMsy);
    const after = A.scenario(msy, T.price, { fcr, feedPrice: fp, liveWt: lw });
    // 단가 인상분을 상쇄하는 데 필요한 최소 FCR 개선폭 (다른 조건 동일)
    const fcrNeeded = n(o.dPrice) > 0 ? b.fcr - (b.fcr * b.feedPrice) / fp : 0;
    return {
      before: T, after, delta: after.profit - T.profit, deltaPH: div(after.profit - T.profit, after.heads),
      feedCostBefore: T.heads * b.liveWt * b.fcr * b.feedPrice, feedCostAfter: after.heads * lw * fcr * fp, fcrNeeded,
    };
  }

  // 사료 구간 (시트 1-2)
  function feedStages(st) {
    const rows = (st || []).map(r => ({ ...r, cost: n(r.ton) * 1000 * n(r.price) }));
    const ton = rows.reduce((a, r) => a + n(r.ton), 0), cost = rows.reduce((a, r) => a + r.cost, 0);
    rows.forEach(r => { r.useRatio = ton ? n(r.ton) / ton : 0; r.costRatio = cost ? r.cost / cost : 0; r.gap = r.useRatio - n(r.std); });
    return { rows, ton, cost, avgPrice: ton ? cost / (ton * 1000) : 0 };
  }

  // 월별 경고 — 컨설팅 포인트 자동 추출
  function alerts(A) {
    const out = [];
    const fcrAvg = A.base.fcr;
    for (const r of A.act) {
      if (r.bepPrice != null && r.price && r.bepPrice > r.price) out.push({ lv: 'critical', m: r.month, t: `생산원가(BEP ${fmt(r.bepPrice)}원)가 돈가(${fmt(r.price)}원)를 초과 → 적자` });
      if (r.fcr != null && r.fcr > fcrAvg * 1.3) out.push({ lv: 'serious', m: r.month, t: `FCR ${r.fcr.toFixed(2)} — 연평균(${fcrAvg.toFixed(2)}) 대비 30% 이상 악화 (출하 지연·사료 손실 점검)` });
      if (r.msy != null && r.msy < A.base.msy * 0.7) out.push({ lv: 'serious', m: r.month, t: `MSY ${r.msy} — 연평균 대비 30% 이상 저조 (출하 공백·폐사 점검)` });
    }
    return out.sort((a, b) => a.m - b.m);
  }

  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? '–' : v.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }));

  const api = { analyze, monthly, feedSwitch, feedStages, alerts, roundUp, roundDown, fmt, BENCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
