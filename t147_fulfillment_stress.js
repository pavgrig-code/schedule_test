// t147_fulfillment_stress.js — Fulfillment stress + persistence QA. One invariant after EVERY action:
//   dataset (guide detail) == table (all pages, all schools) == card subheader Days & Produced Hrs
// Scenarios: new / overlapping / repeated / partially-overlapping / disjoint uploads, multiple programs
// and schools, in-file duplicate rows, blank rows, the same file N times; Undo after every upload restores
// the exact prior state; export -> import reconstructs everything with no re-upload; uploads after import
// merge with the imported baseline and Undo restores it; repeated export/import/upload cycles are stable.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
const fs = require('fs');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: {
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-01', lastDay: '2026-08-31', color: '#e57373', pricePerHour: '80.00', billable: true }, { name: 'Enrichment', calId: 'cal_b', firstDay: '2026-07-01', lastDay: '2026-08-31', color: '#64b5f6', pricePerHour: '70.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }, { school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 1, ctkk: 10 }], cal_b: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }, { school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 1, ctkk: 10 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '12:00') } } } });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(3000); d.createElement = ocr;
}
(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(300);
  if (!W.DecompressionStream) { const zlib = require('zlib');
    W.DecompressionStream = class { constructor() { this._chunks = []; const self = this; this.writable = { getWriter() { return { write(ch) { self._chunks.push(Buffer.from(ch)); }, close() {} }; } }; this.readable = { _self: self }; } };
    W.Response = class { constructor(r) { this._r = r; } async arrayBuffer() { const out = zlib.inflateRawSync(Buffer.concat(this._r._self._chunks)); return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength); } }; }
  const pl = () => d.getElementById('planning-panel');
  const ff = W._pgFf;
  const det = () => W._pgGuideDetails()['pg-001'];
  const sec = () => d.getElementById('fulfillment-section-pg-001');
  const card = calId => sec() && sec().querySelector('.ff-card[data-ff-cal="' + calId + '"]');
  const rows = calId => card(calId) ? [...card(calId).querySelectorAll('tr.ff-row')] : [];
  const HDR = 'Field Program ID,Field Program Name,Shift Date,Week Day,Fulfillment %,Produced Hours,Calculator Hours,Price Per Hour\n';
  const csvText = rws => HDR + rws.map(r => r.join(',')).join('\n') + '\nTotal,,,,0.9,100,110,\n';
  const csvFile = (name, text) => ({ name, arrayBuffer: async () => new ArrayBuffer(0), text: async () => text });
  const upload = async file => { const inp = sec().querySelector('.ff-file'); Object.defineProperty(inp, 'files', { value: [file], configurable: true }); $(inp).trigger('change'); await flush(1400); };
  const mapPending = async (calId, schoolId) => { const row = sec().querySelector('.ff-unmapped-row'); if (!row) return; $(row.querySelector('.ff-map-cal')).val(calId).trigger('change'); await flush(50); $(row.querySelector('.ff-map-school')).val(schoolId).trigger('change'); await flush(50); $(row.querySelector('.ff-map-btn')).trigger('click'); await flush(1200); };
  const snackUndo = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
  const undo = async () => { const b = snackUndo(); if (b) { $(b).trigger('click'); await flush(1500); return true; } return false; };
  const days = (from, n) => { const out = []; const dt = new Date(from + 'T00:00:00'); while (out.length < n) { if (dt.getDay() !== 0 && dt.getDay() !== 6) out.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')); dt.setDate(dt.getDate() + 1); } return out; };
  const r2 = n => Math.round(n * 100) / 100;
  // dataset view of a program: records + produced sum + day count (from the guide detail, the source of truth)
  const dsOf = calId => { const st = det().fulfillment || {}; const recs = Object.keys(st).filter(k => k.indexOf(calId + '|') === 0).map(k => ({ key: k, produced: st[k].produced })); return { n: recs.length, sum: r2(recs.reduce((a, b) => a + b.produced, 0)), keys: recs.map(x => x.key).sort() }; };
  const dsSnapshot = () => JSON.stringify({ f: det().fulfillment || {}, m: det().fulfillmentMap || {}, p: det().fulfillmentPending || {} });
  // walk EVERY page of a program's table (no school filter) and sum Produced Hrs
  const tableWalk = async calId => {
    if (!card(calId)) return { n: 0, sum: 0 };
    const sf = card(calId).querySelector('.ff-school-filter'); if (sf && sf.value) { $(sf).val('').trigger('change'); await flush(300); }
    let n = 0, sum = 0, guard = 0;
    while (card(calId).querySelector('.ff-prev') && !card(calId).querySelector('.ff-prev').disabled && guard++ < 50) { $(card(calId).querySelector('.ff-prev')).trigger('click'); await flush(150); }
    guard = 0;
    while (guard++ < 100) {
      rows(calId).forEach(r => { n++; sum += parseFloat(r.querySelector('.ff-produced').textContent) || 0; });
      const nx = card(calId).querySelector('.ff-next'); if (!nx || nx.disabled) break; $(nx).trigger('click'); await flush(150);
    }
    return { n, sum: r2(sum) };
  };
  const metaOf = calId => { const m = card(calId) && card(calId).querySelector('.ff-card-meta'); if (!m) return null; const mm = m.textContent.match(/^(\d+) days \u2022 ([\d.]+) Produced Hrs$/); return mm ? { n: +mm[1], sum: +mm[2] } : null; };
  async function reconcile(label, calId) {
    const ds = dsOf(calId), tw = await tableWalk(calId), me = metaOf(calId);
    if (!ds.n) { check(label + ' [' + calId + ']: no records -> no card', !card(calId)); return ds; }
    check(label + ' [' + calId + ']: table rows (all pages) == dataset records (' + ds.n + ')', tw.n === ds.n, tw.n + ' vs ' + ds.n);
    check(label + ' [' + calId + ']: table Produced Hrs sum == dataset sum (' + ds.sum + ')', Math.abs(tw.sum - ds.sum) < 0.011, tw.sum + ' vs ' + ds.sum);
    check(label + ' [' + calId + ']: subheader Days == dataset (' + ds.n + ')', !!me && me.n === ds.n, me && me.n);
    check(label + ' [' + calId + ']: subheader Produced Hrs == dataset (' + ds.sum + ')', !!me && Math.abs(me.sum - ds.sum) < 0.011, me && me.sum);
    const pg = card(calId).querySelector('.ff-page-lbl').textContent.match(/(\d+) rows/);
    check(label + ' [' + calId + ']: pager row count == dataset', !!pg && +pg[1] === ds.n, pg && pg[1]);
    return ds;
  }
  const exportJson = async () => {
    let captured = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') captured = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc; return captured;
  };
  // seed: two programs mapped (After School: 'DX After School' -> s2 ; Enrichment: 'DX Enrichment' -> cal_b/s1)
  const seed = async () => {
    await importGuide(dom, c, fixture()); await flush(1200);
    await upload(csvFile('seed.csv', csvText([['100', 'DX After School', '2026-07-01', 'Wed', '1', '10', '12', '90'], ['200', 'DX Enrichment', '2026-07-01', 'Wed', '1', '4', '3', '70']])));
    await mapPending('cal_a', 's2'); await mapPending('cal_b', 's1');
  };

  /* ═══ 1. Upload accuracy + repeated uploads never duplicate ═══ */
  await suite('Upload accuracy: new, overlapping, repeated, partially overlapping and disjoint ranges across programs and schools; the same file N times never duplicates; every step reconciles', async () => {
    await seed();
    await reconcile('after seed', 'cal_a'); await reconcile('after seed', 'cal_b');
    // File A: Jul 1-31 (23 weekdays) for After School
    const A = days('2026-07-01', 23).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(10 + i), '12', '90']);
    await upload(csvFile('A.csv', csvText(A)));
    const dsA = await reconcile('after A (Jul)', 'cal_a');
    check('A: 23 records (seed day overwritten, not duplicated)', dsA.n === 23 && det().fulfillment['cal_a|s2|2026-07-01'].produced === 10, dsA.n);
    // same file 3x -> identical dataset
    const snapA = dsSnapshot();
    for (let i = 0; i < 3; i++) await upload(csvFile('A.csv', csvText(A)));
    check('uploading File A three more times leaves the dataset byte-identical', dsSnapshot() === snapA);
    await reconcile('after A x4', 'cal_a');
    // File B: Jul 15 - Aug 15 (overlaps A) with DIFFERENT values on the overlap
    const B = days('2026-07-15', 24).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(50 + i), '12', '90']);
    await upload(csvFile('B.csv', csvText(B)));
    const dsB = await reconcile('after B (Jul15-Aug15)', 'cal_a');
    const unionAB = new Set(A.map(r => r[2]).concat(B.map(r => r[2])));
    check('B: dataset = union of A and B dates, overlap REPLACED by B (no dup, no inflation)', dsB.n === unionAB.size && det().fulfillment['cal_a|s2|2026-07-15'].produced === 50 && det().fulfillment['cal_a|s2|2026-07-01'].produced === 10, dsB.n + ' vs ' + unionAB.size);
    // File C: Aug 1-31 (overlaps B's tail, extends past it)
    const C = days('2026-08-03', 21).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(90 + i), '12', '90']);
    await upload(csvFile('C.csv', csvText(C)));
    const dsC = await reconcile('after C (Aug)', 'cal_a');
    const unionABC = new Set([...unionAB].concat(C.map(r => r[2])));
    const expectSum = r2([...unionABC].reduce((acc, dk) => { const c_ = C.find(r => r[2] === dk), b_ = B.find(r => r[2] === dk), a_ = A.find(r => r[2] === dk); return acc + (+(c_ ? c_[5] : b_ ? b_[5] : a_[5])); }, 0));
    check('C: final dataset = A ∪ B ∪ C with latest-wins on overlaps; Produced Hrs sum matches the expected merge exactly', dsC.n === unionABC.size && Math.abs(dsC.sum - expectSum) < 0.011, dsC.n + '/' + dsC.sum + ' vs ' + unionABC.size + '/' + expectSum);
    check('Enrichment untouched by the After School uploads', dsOf('cal_b').n === 1 && dsOf('cal_b').sum === 4);
    // multiple programs + schools in ONE file (a new school for After School)
    const M = [['300', 'DX After School - Lincoln', '2026-07-06', 'x', '1', '7', '5', '90'], ['300', 'DX After School - Lincoln', '2026-07-07', 'x', '1', '8', '5', '90'], ['200', 'DX Enrichment', '2026-07-02', 'x', '1', '5', '3', '70']];
    await upload(csvFile('M.csv', csvText(M)));
    check('a known program in the same file merged directly; the new one waits in Unmapped', dsOf('cal_b').n === 2 && !!sec().querySelector('.ff-unmapped'));
    await mapPending('cal_a', 's1');
    const dsM = await reconcile('after multi-school file', 'cal_a');
    check('multiple schools coexist under one program (Lincoln 2 + Adams ' + unionABC.size + ')', dsM.n === unionABC.size + 2);
    await reconcile('after multi-school file', 'cal_b');
    // in-file duplicate rows (two shifts on the same day) are summed, not doubled on re-upload
    const D = [['100', 'DX After School', '2026-07-01', 'x', '1', '3', '1', '90'], ['100', 'DX After School', '2026-07-01', 'x', '1', '4', '1', '90']];
    await upload(csvFile('D.csv', csvText(D)));
    check('two rows for the same program+date in one file are summed (3+4=7) and land as ONE record', det().fulfillment['cal_a|s2|2026-07-01'].produced === 7 && dsOf('cal_a').n === dsM.n);
    await upload(csvFile('D.csv', csvText(D)));
    check('re-uploading that file does not double it (still 7)', det().fulfillment['cal_a|s2|2026-07-01'].produced === 7);
    // blank rows / missing values are skipped, not stored
    const nBefore = dsOf('cal_a').n;
    await upload(csvFile('blank.csv', csvText([['100', '', '2026-07-08', 'x', '1', '9', '1', '90'], ['100', 'DX After School', '', 'x', '1', '9', '1', '90'], ['100', 'DX After School', '2026-07-09', 'x', '1', '', '1', '90']])));
    check('rows with a blank name, date or Produced are skipped (dataset unchanged)', dsOf('cal_a').n === nBefore);
    await reconcile('final', 'cal_a');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Undo restores the exact prior state after every upload ═══ */
  await suite('Undo after each upload restores the exact Fulfillment state that existed immediately before it (dataset, mappings, pending, table, subheader)', async () => {
    await seed();
    // The app's Undo is a one-step snackbar offer, so each upload is undone immediately after it lands.
    const files = [
      days('2026-07-01', 5).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(20 + i), '1', '90']),   // overlaps the seed day
      days('2026-07-03', 5).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(60 + i), '1', '90']),
      [['400', 'Brand New Prog', '2026-07-01', 'x', '1', '1', '1', '90']]                                              // lands in Unmapped
    ];
    for (let i = 0; i < files.length; i++) {
      const before = dsSnapshot();
      await upload(csvFile('u' + i + '.csv', csvText(files[i])));
      check('upload ' + (i + 1) + ' changed the state and offered Undo', dsSnapshot() !== before && !!snackUndo());
      const ok = await undo();
      check('Undo ' + (i + 1) + ' applied', ok);
      check('Undo ' + (i + 1) + ': dataset/mappings/pending restored byte-for-byte', dsSnapshot() === before, 'mismatch');
      await reconcile('after undo ' + (i + 1), 'cal_a');
    }
    check('after each undo the section shows the seeded state only (no Unmapped bucket, 1 After School day)', !sec().querySelector('.ff-unmapped') && dsOf('cal_a').n === 1 && dsOf('cal_a').sum === 10);
    // an identical re-upload is a true no-op: dataset untouched and NO Undo offered
    await upload(csvFile('same.csv', csvText([['100', 'DX After School', '2026-07-01', 'Wed', '1', '10', '12', '90']])));
    check('re-uploading identical data changes nothing and offers no Undo (nothing to undo)', dsOf('cal_a').n === 1 && !snackUndo());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Export -> clean import reconstructs everything; continue uploading; Undo keeps the imported baseline ═══ */
  await suite('Export JSON carries the whole Fulfillment dataset; importing into a clean state reproduces it exactly (Before Export == After Import); uploads after import merge with the imported baseline and Undo restores it', async () => {
    await seed();
    const A = days('2026-07-01', 15).map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(10 + i), '1', '90']);
    await upload(csvFile('A.csv', csvText(A)));
    await upload(csvFile('L.csv', csvText([['300', 'DX After School - Lincoln', '2026-07-06', 'x', '1', '7', '1', '90']]))); await mapPending('cal_a', 's1');
    await upload(csvFile('P.csv', csvText([['500', 'Pending Prog', '2026-07-06', 'x', '1', '2', '1', '90']])));   // stays pending
    const before = { snap: dsSnapshot(), a: dsOf('cal_a'), b: dsOf('cal_b'), meta_a: metaOf('cal_a'), meta_b: metaOf('cal_b'), logN: (det().fulfillmentLog || []).length, pending: Object.keys(det().fulfillmentPending || {}).length };
    const json = await exportJson(); const pd = JSON.parse(json).data;
    check('export contains the saved dataset (records, mappings, pending, log)', Object.keys(pd.fulfillment).length === before.a.n + before.b.n && Object.keys(pd.fulfillmentMap).length === 3 && Object.keys(pd.fulfillmentPending).length === 1 && pd.fulfillmentLog.length === before.logN);
    check('export records carry program, school, date, Produced Hrs and matching metadata', Object.keys(pd.fulfillment).every(k => /^cal_[ab]\|s\d\|\d{4}-\d{2}-\d{2}$/.test(k) && typeof pd.fulfillment[k].produced === 'number' && 'src' in pd.fulfillment[k] && 'at' in pd.fulfillment[k]));
    // CLEAN state: import a bare fixture first (no fulfillment), then the exported JSON
    await importGuide(dom, c, fixture()); await flush(800);
    check('clean state has no fulfillment', !det().fulfillment && !sec().querySelector('.ff-card'));
    await importGuide(dom, c, json); await flush(1200);
    check('After Import == Before Export: dataset/mappings/pending byte-identical', dsSnapshot() === before.snap);
    check('After Import: same Days/Produced Hrs per program in the subheaders', JSON.stringify(metaOf('cal_a')) === JSON.stringify(before.meta_a) && JSON.stringify(metaOf('cal_b')) === JSON.stringify(before.meta_b), JSON.stringify([metaOf('cal_a'), before.meta_a]));
    check('After Import: the Unmapped bucket and upload log are restored (no re-upload needed)', !!sec().querySelector('.ff-unmapped') && (det().fulfillmentLog || []).length === before.logN && !!sec().querySelector('.ff-log'));
    await reconcile('after import', 'cal_a'); await reconcile('after import', 'cal_b');
    // continue uploading after import: a known name merges; Undo restores the imported baseline
    const base = dsSnapshot();
    await upload(csvFile('after-import.csv', csvText([['100', 'dx after school', '2026-07-01', 'x', '1', '999', '1', '90'], ['100', 'dx after school', '2026-08-03', 'x', '1', '5', '1', '90']])));
    check('a post-import upload merges with the IMPORTED dataset (1 updated, 1 new; mapping remembered across import)', det().fulfillment['cal_a|s2|2026-07-01'].produced === 999 && det().fulfillment['cal_a|s2|2026-08-03'].produced === 5 && dsOf('cal_a').n === before.a.n + 1);
    await reconcile('after post-import upload', 'cal_a');
    check('Undo restores the imported baseline exactly', (await undo()) && dsSnapshot() === base);
    await reconcile('after undo of post-import upload', 'cal_a');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Repeated export/import/upload cycles are stable ═══ */
  await suite('Upload -> Export -> Import -> Upload more -> Export -> Import, three cycles: records never multiply, Produced Hrs never drifts, Days stay exact, nothing is lost', async () => {
    await seed();
    let expectedN = 1, expectedSum = 10;   // After School dataset after seed
    for (let cycle = 1; cycle <= 3; cycle++) {
      const dks = days('2026-07-0' + cycle, 4);   // each cycle: 4 days starting a day later (overlaps the previous cycle by 3)
      const rws = dks.map((dk, i) => ['100', 'DX After School', dk, 'x', '1', String(cycle * 100 + i), '1', '90']);
      const beforeKeys = new Set(dsOf('cal_a').keys);
      await upload(csvFile('cycle' + cycle + '.csv', csvText(rws)));
      // expected: overlaps replaced, new added
      const after = dsOf('cal_a'); const newKeys = dks.map(dk => 'cal_a|s2|' + dk).filter(k => !beforeKeys.has(k));
      expectedN += newKeys.length;
      check('cycle ' + cycle + ': Days == ' + expectedN + ' (no multiplication)', after.n === expectedN, after.n);
      check('cycle ' + cycle + ': latest values win on the overlap', dks.every(dk => det().fulfillment['cal_a|s2|' + dk].produced === cycle * 100 + dks.indexOf(dk)));
      const snap = dsSnapshot();
      const json = await exportJson();
      await importGuide(dom, c, fixture()); await flush(600);
      await importGuide(dom, c, json); await flush(1200);
      check('cycle ' + cycle + ': import reproduces the pre-export dataset byte-for-byte', dsSnapshot() === snap);
      await reconcile('cycle ' + cycle + ' after import', 'cal_a');
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. The real vendor export, uploaded repeatedly, stays exact ═══ */
  await suite('The real CNUSD export uploaded three times yields exactly 49 records with the file\'s Produced Hrs total, reconciled across dataset, table and subheader', async () => {
    const XLSX_PATH = '/mnt/user-data/uploads/CNUSD_-_Fulfillment_Data.xlsx';
    if (!fs.existsSync(XLSX_PATH)) { check('(sample xlsx not present; skipped)', true); return; }
    await seed();
    const buf = fs.readFileSync(XLSX_PATH); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const xf = () => ({ name: 'CNUSD - Fulfillment Data.xlsx', arrayBuffer: async () => ab, text: async () => '' });
    await upload(xf()); await mapPending('cal_a', 's3');
    for (let i = 0; i < 2; i++) await upload(xf());
    const ds = dsOf('cal_a');
    const roos = Object.keys(det().fulfillment).filter(k => k.indexOf('cal_a|s3|') === 0);
    check('Roosevelt holds exactly 49 records after three uploads (no duplication)', roos.length === 49, roos.length);
    const sumR = r2(roos.reduce((a, k) => a + det().fulfillment[k].produced, 0));
    check('Roosevelt Produced Hrs equals the file total 16170.7 (no inflation)', Math.abs(sumR - 16170.7) < 0.011, sumR);
    await reconcile('real file x3', 'cal_a');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Calendar Hourly Breakdown shows the Program+Day Fulfillment total from the SAME dataset, live ═══ */
  await suite('The breakdown shows "∘ Fulfillment: N Hrs" directly under the program name (all schools summed), only when data exists, live-updating a pinned popup on upload/replace/unmap, restored by Undo and import, reconciling exactly with the dataset', async () => {
    W.__pgHoverDefaultOn = true;
    await importGuide(dom, c, fixture()); await flush(1200);
    const D = '2026-07-06', D2 = '2026-07-07', D3 = '2026-07-08';
    const cellOf = dk => pl().querySelector('.cal-day-cell[data-date-key="' + dk + '"]:not(.cal-combined-carrier)');
    const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
    const ffLine = () => popup() && popup().querySelector('.cal-tip-ff-line');
    const lineTxt = () => ffLine() ? ffLine().textContent.replace(/\s+/g, ' ').replace(/^\u2218\s*/, '').trim() : null;
    const dsDay = (calId, dk) => { const st = det().fulfillment || {}; return r2(Object.keys(st).filter(k => k.indexOf(calId + '|') === 0 && k.slice(-11) === '|' + dk).reduce((a, k) => a + st[k].produced, 0)); };
    $(cellOf(D)).trigger('click'); await flush(600);
    check('no Fulfillment data -> no Fulfillment line', !!popup() && !ffLine());
    // three schools on D (10 + 12.5 + 18), one on D2; the popup stays PINNED throughout
    await upload(csvFile('a.csv', csvText([['1', 'Prog A', D, 'x', '1', '10', '1', '80'], ['1', 'Prog A', D2, 'x', '1', '3', '1', '80']]))); await mapPending('cal_a', 's1');
    await upload(csvFile('b.csv', csvText([['2', 'Prog B', D, 'x', '1', '12.5', '1', '80']]))); await mapPending('cal_a', 's2');
    await upload(csvFile('c.csv', csvText([['3', 'Prog C', D, 'x', '1', '18', '1', '80']]))); await mapPending('cal_a', 's3');
    check('the PINNED popup live-updated to the summed value of three schools (40.5 Hrs) with no reopen', !!popup() && lineTxt() === 'Fulfillment: 40.5 Hrs', lineTxt());
    check('the line is prefixed with the ∘ bullet', ffLine().textContent.trim().charAt(0) === '\u2218', ffLine().textContent.trim().charAt(0));
    check('the line sits directly under the program name (first item of the under-name block)', popup().querySelector('.cal-tip-under-name').firstElementChild === ffLine());
    check('the line reconciles with the dataset sum for that Program+Day', ffLine().getAttribute('data-ff-hrs') === String(dsDay('cal_a', D)), ffLine().getAttribute('data-ff-hrs') + ' vs ' + dsDay('cal_a', D));
    await upload(csvFile('c2.csv', csvText([['3', 'Prog C', D, 'x', '1', '20', '1', '80']])));   // replace 18 -> 20
    check('replacing a matching record live-updates the pinned popup (42.5 Hrs)', lineTxt() === 'Fulfillment: 42.5 Hrs' && dsDay('cal_a', D) === 42.5, lineTxt());
    $(d.body).trigger('click'); await flush(200);
    $(cellOf(D2)).trigger('click'); await flush(600);
    check('a day with one school shows that school\'s hours (3 Hrs)', lineTxt() === 'Fulfillment: 3 Hrs', lineTxt());
    $(d.body).trigger('click'); await flush(200);
    $(cellOf(D3)).trigger('click'); await flush(600);
    check('a day with no matching data shows no line', !!popup() && !ffLine());
    $(d.body).trigger('click'); await flush(200);
    // unmap Prog C while pinned -> its rows leave the dataset -> 22.5
    $(cellOf(D)).trigger('click'); await flush(600);
    const chip = [...sec().querySelectorAll('.ff-map-chip')].find(ch => /Prog C/.test(ch.getAttribute('title'))); $(chip.querySelector('.ff-unmap')).trigger('click'); await flush(1000);
    check('unmapping a program live-updates the pinned popup (22.5 Hrs)', lineTxt() === 'Fulfillment: 22.5 Hrs' && dsDay('cal_a', D) === 22.5, lineTxt());
    // Undo the unmap -> 42.5 again (undo does a full re-render; reopen to read)
    check('Undo applied', await undo());
    $(cellOf(D)).trigger('click'); await flush(600);
    check('after Undo the line reflects the restored dataset (42.5 Hrs)', lineTxt() === 'Fulfillment: 42.5 Hrs' && dsDay('cal_a', D) === 42.5, lineTxt());
    $(d.body).trigger('click'); await flush(200);
    // export -> clean import -> same line
    const json = await exportJson();
    await importGuide(dom, c, fixture()); await flush(600); await importGuide(dom, c, json); await flush(1200);
    $(cellOf(D)).trigger('click'); await flush(600);
    check('after a clean import the line is rebuilt from the imported dataset (42.5 Hrs)', lineTxt() === 'Fulfillment: 42.5 Hrs' && ffLine().getAttribute('data-ff-hrs') === String(dsDay('cal_a', D)), lineTxt());
    $(d.body).trigger('click'); await flush(200);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
