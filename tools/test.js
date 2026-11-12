// node tools/test.js — 계산 엔진이 원본 엑셀(260922 시뮬레이션)의 결과값과 일치하는지 검증
const fs = require('fs'), path = require('path'), assert = require('assert');
globalThis.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'sample.js'), 'utf8'));
const C = require('../calc.js');
// (1) 노란 셀만 입력 → 나머지는 기본값으로 계산 (엑셀 2번 시트 구조)
const S = window.SAMPLE;
const yellowOnly = { sim: S.sim };
const A = C.analyze({ ...yellowOnly, months: S.months, yieldRate: S.yieldRate });
// (2) 월별 실적으로 산출한 기준값 = 엑셀 회색 셀 = 기본값
const D = C.fromMonths(S);
for (const k in C.DEFAULT_BASE) assert(Math.abs(D.base[k] - C.DEFAULT_BASE[k]) < 1e-9, 'fromMonths base.' + k);
for (const k in C.DEFAULT_COST) assert(Math.abs(D.cost[k] - C.DEFAULT_COST[k]) < 1e-6, 'fromMonths cost.' + k);
const A2 = C.analyze({ ...S, ...D });
assert.strictEqual(A2.tgt.profit, A.tgt.profit, 'monthly-derived == defaults');
assert(C.analyze({ sim: S.sim }).tgt.profit === A.tgt.profit, 'no months at all');
const near = (got, want, label) => { assert(Math.abs(got - want) <= Math.max(1e-6, Math.abs(want) * 1e-9), `${label}: ${got} != ${want}`); };
const expect = {
  'base.sows': 275.25, 'base.msy': 25.9, 'base.price': 5741, 'base.liveWt': 116.23782114277691, 'base.fcr': 3.2108333333333334,
  'base.feedPrice': 605.7890694402279, 'ph.feed': 226092.7604952542, 'ph.meds': 12393.009967710233, 'ph.util': 20877.962936964763,
  'ph.otherVar': 63037.65913238804, 'ph.varTotal': 322401.3925323172, 'ph.labor': 34907.75712480696, 'ph.interest': 12178.021760494174,
  'ph.otherFixed': 4006.340025270251, 'ph.fixedTotal': 51092.11891057138, fixedAnnual: 364234438.4104906,
  'cur.heads': 7128.974999999999, 'cur.revenue': 3663134156.9544287, 'cur.total': 2662625905.7385664, 'cur.profit': 1000508251,
  'cur.profitPH': 140343.91353595714, 'cur.bep': 4172.966282390863, 'cur.margin': 0.27312902234294195,
  'tgt.heads': 7707, 'tgt.revenue': 3960145034.5453286, 'tgt.total': 2848981970.657059, 'tgt.profit': 1111163063,
  'tgt.bep': 4130.153151176202, 'tgt.headroom': 1610.8468488237977, 'tgt.feedShare': 0.6116208958440873,
  'grid.0.0': 664.3877924239747, 'grid.6.6': 1358.8014661529924, 'grid.3.2': 927.8331323028035,
  'bepByMsy.0.bep': 4274.160956170971, 'bepByMsy.0.fixedPH': 60149.35817199085, 'bepByMsy.6.bep': 4130.153151176202,
  'rows.0.gross': -4485893.159999996, 'rows.0.net': -6515331.159999996, 'rows.11.cum': 1124089369.6299999,
  'rows.0.bepPrice': 5157.748873897118, 'rows.1.msy': 37, 'rows.0.fcr': 3.97, 'rows.3.msy': 31.4, 'rows.5.fcr': 6.98,
  'rows.10.feedPrice': 489.6615226337449, 'rows.0.feedRatio': 0.6054179070874984,
};
for (const [k, want] of Object.entries(expect)) near(k.split('.').reduce((o, p) => o[p], A), want, k);
// 사료 구간 (1-2 시트)
const F = C.feedStages(window.SAMPLE.feedStages);
near(F.ton, 2368.69, 'feed.ton'); near(F.avgPrice, 712.378065513005, 'feed.avgPrice'); near(F.rows[8].costRatio, 0.4093924698951549, 'feed.cost ratio');
// 사료 전환: 변화 없음 → 손익 변화 0, 단가 +20원 상쇄 FCR
const z = C.feedSwitch(A, {}); assert.strictEqual(z.delta, 0, 'feedSwitch zero');
const s = C.feedSwitch(A, { dPrice: 20, dFcr: -C.feedSwitch(A, { dPrice: 20 }).fcrNeeded });
assert(Math.abs(s.delta) <= 1, 'feedSwitch break-even FCR offsets price: ' + s.delta);
// 빈 데이터
assert(C.analyze({ base: { sows: 0 }, sim: {} }).empty, 'empty');
assert(C.fromMonths({ months: { sows: [] } }) === null, 'no months');
console.log('OK —', Object.keys(expect).length + 6, 'checks match the Excel model');
