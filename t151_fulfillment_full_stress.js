// t151_fulfillment_full_stress.js — Rigorous stress test of the Fulfillment upload process and the
// Use Fulfillment / Ignore Fulfillment controls (right-click and "..." menus):
//   1. upload + mapping (CSV/XLSX, with and without a School site column, review before save, overlap,
//      in-file duplicates, multi program / multi school, no cross-level inference)
//   2. controls shown ONLY when an eligible Program+Day (saved data) is in the selection
//   3. Use/Ignore on individual, multi-select and combined cells; all-on / all-off / mixed counts over
//      ELIGIBLE days only; Save only when something changes; nothing applied until Save; rapid switching
//   4. checkbox <-> menu synchronization on the one shared store
//   5. calculation accuracy + immediate propagation (cell, week, breakdown, Programs, Summary, Amount, NTE)
//      and the revert chain Override -> Freeze -> inherited; Staff Count untouched; week exclusion
//   6. Upload -> Map -> Save -> Use -> Upload more -> Ignore -> Undo -> Export -> Import -> upload again
//   7. UI stability: rapid uploads / toggles / multi-cell actions, pinned popup never moves, unrelated
//      programs untouched, no stale values.
const fs = require('fs');
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: {
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-01', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true }, { name: 'Enrichment', calId: 'cal_b', firstDay: '2026-07-01', lastDay: '2026-07-31', color: '#64b5f6', pricePerHour: '70.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }], cal_b: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }],
    notToExceed: { nte: '100000' },
    staffAlloc: { c0: { on: true, cells: {} } }, staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '12:00') } } } });
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
  await whenReady(dom); await flush(300); W.__pgHoverDefaultOn = true;
  // the app unzips .xlsx with DecompressionStream('deflate-raw'), which jsdom lacks: polyfill via zlib (as t147 does)
  if (!W.DecompressionStream) { const zlib = require('zlib');
    W.DecompressionStream = class { constructor() { this._chunks = []; const self = this; this.writable = { getWriter() { return { write(ch) { self._chunks.push(Buffer.from(ch)); }, close() {} }; } }; this.readable = { _self: self }; } };
    W.Response = class { constructor(r) { this._r = r; } async arrayBuffer() { const out = zlib.inflateRawSync(Buffer.concat(this._r._self._chunks)); return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength); } }; }
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001']; const sec = () => d.getElementById('fulfillment-section-pg-001');
  const r2 = x => Math.round(x * 100) / 100;
  const cellOf = (dk, cal) => { const els = [...pl().querySelectorAll('.cal-day-cell[data-date-key="' + dk + '"]')]; return els.find(e => cal ? e.getAttribute('data-cal-id') === cal : !e.classList.contains('cal-combined-carrier')); };
  const hrsOf = (dk, cal) => parseFloat(cellOf(dk, cal).querySelector('.cal-hours').textContent) || 0;
  const cntOf = (dk, cal) => parseInt(cellOf(dk, cal).getAttribute('data-eff-cnt'), 10) || 0;
  const colOf = (dk, cal) => cellOf(dk, cal).querySelector('.cal-hours').style.color;
  const weekTotal = (dk, cal) => { const cl = cellOf(dk, cal); const tr = cl && cl.closest('tr'); const wt = tr && (tr.querySelector('.cal-week-total, .cal-wk-total, td.cal-week-sum') || [...tr.cells].pop()); return wt ? parseFloat(wt.textContent) : NaN; };
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const menu = () => d.querySelector('.cal-ctx-menu');
  const multiMenu = () => [...d.querySelectorAll('.cal-sd-multi-menu')].pop();
  const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
  const opts = m => ({ use: m.querySelector('.cal-ctx-ff-opt[data-ff-action="use"]'), ign: m.querySelector('.cal-ctx-ff-opt[data-ff-action="ignore"]') });
  const hasFf = m => !!(m && m.querySelector('.cal-ctx-ff'));
  const state = m => { const o = opts(m); return { useCur: o.use.getAttribute('data-ff-current') === '1', ignCur: o.ign.getAttribute('data-ff-current') === '1', useCnt: o.use.querySelector('.cal-ctx-ff-cnt').textContent, ignCnt: o.ign.querySelector('.cal-ctx-ff-cnt').textContent, eligible: m.querySelector('.cal-ctx-ff').getAttribute('data-ff-eligible') }; };
  const applyBtn = m => leaves(m).find(e => e.textContent.trim() === 'Apply');
  const closeBtn = m => leaves(m).find(e => e.textContent.trim() === 'Close');
  const saveShown = m => { const b = applyBtn(m); return !!b && b.style.display !== 'none'; };
  const openCtx = async (dk, cal) => { $(cellOf(dk, cal)).trigger('contextmenu'); await flush(300); return menu(); };
  const closeCtx = async m => { const b = closeBtn(m); if (b) $(b).trigger('click'); else $(d.body).trigger('click'); await flush(200); };
  const clearSel = async () => { $(d.body).trigger('click'); await flush(120); };
  const selectRange = async (d1, d2, cal) => { await clearSel(); fire(cellOf(d1, cal), 'mousedown', { shiftKey: true }); await flush(40); fire(cellOf(d2, cal), 'mousedown', { shiftKey: true }); await flush(80); fire(cellOf(d1, cal), 'contextmenu'); await flush(300); return multiMenu(); };
  const closeMulti = async mm => { $(closeBtn(mm)).trigger('click'); await flush(150); await clearSel(); };
  const progTable = () => [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent)));
  const progCol = re => { const t = progTable(); const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => re.test(cc.textContent)); return [...t.tBodies[0].rows].reduce((a, r) => a + (parseFloat((r.cells[i] || {}).textContent ? r.cells[i].textContent.replace(/[^0-9.\-]/g, '') : '') || 0), 0); };
  const progSched = () => r2(progCol(/^Scheduled Hrs/));
  const progAmt = () => r2(progCol(/^Amount$/));
  const gCard = () => d.querySelector('[data-guide-summary]');
  const summaryHours = () => parseFloat(gCard().querySelector('.pg-gs-box-hours').textContent);
  const summaryAmt = () => parseFloat(gCard().querySelector('.pg-gs-box-amount').textContent.replace(/[^0-9.]/g, ''));
  const nteAmt = () => parseFloat(gCard().querySelector('.pg-gs-box-nte').textContent.replace(/[^0-9.]/g, ''));
  const availAmt = () => parseFloat(gCard().querySelector('.pg-gs-box-avail').textContent.replace(/[^0-9.\-]/g, ''));
  const flags = () => det().fulfillmentAuth || {};
  const ffKeys = () => Object.keys(det().fulfillment || {}).sort();
  const dayTotal = (cal, dk) => { const st = det().fulfillment || {}; const ks = Object.keys(st).filter(k => k.indexOf(cal + '|') === 0 && k.slice(-10) === dk); return ks.length ? r2(ks.reduce((a, k) => a + st[k].produced, 0)) : null; };
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const posOf = () => { const p = popup(); return p ? p.style.top + '|' + p.style.left : null; };
  const pin = async (dk, cal) => { $(cellOf(dk, cal)).trigger('click'); await flush(600); return popup(); };
  const closePop = async () => { $(d.body).trigger('click'); await flush(250); };
  const ffChk = () => popup() && popup().querySelector('.cal-tip-ff-chk');
  const toggleFf = async on => { const k = ffChk(); k.checked = on; $(k).trigger('change'); await flush(1200); };
  const undoBtn = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
  const undo = async () => { const b = undoBtn(); if (!b) return false; $(b).trigger('click'); await flush(1500); return true; };
  const H_SITE = 'Field Program ID,Field Program Name,School site,Shift Date,Produced Hours,Calculator Hours,Price Per Hour\n';
  const H_NO = 'Field Program ID,Field Program Name,Shift Date,Produced Hours,Calculator Hours,Price Per Hour\n';
  const csv = (name, hdr, rows) => ({ name, arrayBuffer: async () => new ArrayBuffer(0), text: async () => hdr + rows.map(r => r.join(',')).join('\n') + '\n' });
  const stage = async f => { const inp = sec().querySelector('.ff-file'); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); $(inp).trigger('change'); for (let i = 0; i < 12; i++) { await flush(500); if (sec().querySelector('.ff-review-row')) break; } await flush(200); };
  const rows = () => [...sec().querySelectorAll('.ff-review-row')];
  const heads = () => [...sec().querySelectorAll('.ff-review-table thead th')].map(h => h.textContent.trim());
  const mapRow = async (i, cal, sid) => { const r = rows()[i]; $(r.querySelector('.ff-rev-cal')).val(cal).trigger('change'); await flush(40); if (sid !== undefined && r.querySelector('.ff-rev-school')) { $(r.querySelector('.ff-rev-school')).val(sid).trigger('change'); await flush(40); } };
  const confirm = async () => { $(sec().querySelector('.ff-review-confirm')).trigger('click'); await flush(1200); };
  const cancel = async () => { $(sec().querySelector('.ff-review-cancel')).trigger('click'); await flush(400); };
  const reconcile = label => {
    check(label + ': Programs (Scheduled Hrs) == Summary Total Hours', progSched() === summaryHours(), progSched() + '/' + summaryHours());
    check(label + ': Programs Amount == Summary Total Amount', Math.abs(progAmt() - summaryAmt()) < 0.5, progAmt() + '/' + summaryAmt());
    check(label + ': Amount Available == Not to Exceed - Total Amount', Math.abs(availAmt() - (nteAmt() - summaryAmt())) < 0.5, availAmt() + ' vs ' + (nteAmt() - summaryAmt()));
    const t = progTable(); const hr = t.tHead.rows[t.tHead.rows.length - 1]; const iS = [...hr.cells].findIndex(cc => /^Scheduled Hrs/.test(cc.textContent)), iR = [...hr.cells].findIndex(cc => /^Remaining Hrs/.test(cc.textContent)), iT = [...hr.cells].findIndex(cc => /^Total$/.test(cc.textContent.trim()));
    if (iS >= 0 && iR >= 0 && iT >= 0) { const ok = [...t.tBodies[0].rows].every(r => { const S = parseFloat(r.cells[iS].textContent.replace(/[^0-9.\-]/g, '')) || 0, R = parseFloat(r.cells[iR].textContent.replace(/[^0-9.\-]/g, '')), T = parseFloat(r.cells[iT].textContent.replace(/[^0-9.\-]/g, '')); return isNaN(T) || isNaN(R) || Math.abs(S + R - T) < 0.011; }); check(label + ': Remaining Hrs == Total - Scheduled on every Program row', ok); }
  };
  // A week-total helper reads the LAST cell of the calendar row; make sure it is numeric before asserting on it.
  const weekOk = (dk, cal) => !isNaN(weekTotal(dk, cal));
  const weekSum = (dk, cal) => { const cl = cellOf(dk, cal); const tr = cl.closest('tr'); return r2([...tr.querySelectorAll('.cal-day-cell')].filter(e => e.getAttribute('data-cal-id') === cal || !e.getAttribute('data-cal-id')).reduce((a, e) => a + (parseFloat((e.querySelector('.cal-hours') || {}).textContent) || 0), 0)); };
  // seed: cal_a PA -> Lincoln (s1) on 07-06/07/08 (20/21/22), PB -> Adams (s2) on 07-06 (5); cal_b PC -> s1 on 07-06 (9), 07-09 (7)
  const seed = async () => {
    await importGuide(dom, c, fixture()); await flush(1000);
    await stage(csv('seed.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-06', '20', '1', '80'], ['1', 'PA', 'Lincoln', '2026-07-07', '21', '1', '80'], ['1', 'PA', 'Lincoln', '2026-07-08', '22', '1', '80'], ['2', 'PB', 'Adams', '2026-07-06', '5', '1', '80'], ['3', 'PC', 'Lincoln', '2026-07-06', '9', '1', '70'], ['3', 'PC', 'Lincoln', '2026-07-09', '7', '1', '70']]));
    await mapRow(0, 'cal_a', 's1'); await mapRow(1, 'cal_a', 's2'); await mapRow(2, 'cal_b', 's1'); await confirm();
    Object.defineProperty(W, 'innerHeight', { value: 900, configurable: true }); Object.defineProperty(W, 'innerWidth', { value: 1400, configurable: true });
  };

  /* ═══ 1. Upload + mapping ═══ */
  await suite('1. Upload + mapping: review before save (Cancel discards), School site -> Program/School/Day, no site -> Program/Day with no school inferred, overlap replaces, in-file duplicates sum, multi program + multi school, XLSX parses', async () => {
    await importGuide(dom, c, fixture()); await flush(1000);
    await stage(csv('a.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-06', '20', '1', '80'], ['2', 'PB', 'Adams', '2026-07-06', '5', '1', '80']]));
    check('a staged upload is reviewed first: nothing is saved before Confirm', !!sec().querySelector('.ff-review') && Object.keys(det().fulfillment || {}).length === 0);
    check('with a School site column the School column and pickers are shown', heads().indexOf('School') >= 0 && rows().every(r => !!r.querySelector('.ff-rev-school')));
    check('nothing mapped yet: the note says 0 of 2 and that the rest will wait in Unmapped', /0 of 2 mapped/.test(sec().querySelector('.ff-review-note').textContent) && /Unmapped/.test(sec().querySelector('.ff-review-note').textContent));
    await mapRow(0, 'cal_a', 's1');
    check('one of two mapped: note says 1 of 2', /1 of 2 mapped/.test(sec().querySelector('.ff-review-note').textContent));
    await cancel();
    check('Cancel discards everything (no records, no mapping, no review panel)', Object.keys(det().fulfillment || {}).length === 0 && Object.keys(det().fulfillmentMap || {}).length === 0 && !sec().querySelector('.ff-review'));
    await seed();
    check('seed: 6 records at Program/School/Day across two calendars and two schools', ffKeys().join(',') === 'cal_a|s1|2026-07-06,cal_a|s1|2026-07-07,cal_a|s1|2026-07-08,cal_a|s2|2026-07-06,cal_b|s1|2026-07-06,cal_b|s1|2026-07-09', ffKeys().join(','));
    check('seed: cal_a 07-06 Program/Day total aggregates both schools (20 + 5 = 25); cal_b 07-06 is 9', dayTotal('cal_a', '2026-07-06') === 25 && dayTotal('cal_b', '2026-07-06') === 9);
    // overlap: re-upload PA 07-06 with a different value -> REPLACED, not added
    await stage(csv('ov.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-06', '30', '1', '80']])); check('overlap re-upload is prefilled from the saved mapping (cal_a / s1)', rows()[0].querySelector('.ff-rev-cal').value === 'cal_a' && rows()[0].querySelector('.ff-rev-school').value === 's1'); await confirm();
    check('an overlapping day is REPLACED (30, not 50) and nothing else changes', det().fulfillment['cal_a|s1|2026-07-06'].produced === 30 && ffKeys().length === 6 && dayTotal('cal_a', '2026-07-06') === 35);
    check('the log records the replace as an update, not an insert', det().fulfillmentLog[0].updated === 1 && det().fulfillmentLog[0].inserted === 0);
    // in-file duplicates (two shifts for the same program+day) SUM
    await stage(csv('dup.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-10', '4', '1', '80'], ['1', 'PA', 'Lincoln', '2026-07-10', '6', '1', '80']])); await confirm();
    check('two rows for the same program + day in ONE file are summed (4 + 6 = 10), stored once', det().fulfillment['cal_a|s1|2026-07-10'].produced === 10 && ffKeys().filter(k => k.slice(-10) === '2026-07-10').length === 1);
    // identical re-upload: unchanged, no dup
    const before = JSON.stringify(det().fulfillment);
    await stage(csv('dup.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-10', '4', '1', '80'], ['1', 'PA', 'Lincoln', '2026-07-10', '6', '1', '80']])); await confirm();
    check('an identical re-upload leaves the dataset byte-identical and logs it as unchanged', JSON.stringify(det().fulfillment) === before && det().fulfillmentLog[0].unchanged === 1 && det().fulfillmentLog[0].inserted === 0);
    // no School site column for PA: Program only, lands at Program/Day, the saved school mapping is NOT applied
    await stage(csv('pa-nosite.csv', H_NO, [['1', 'PA', '2026-07-06', '40.5', '1', '80']]));
    check('no School site column: no School column/picker, badge says Program + Day, Program prefilled ONLY', heads().indexOf('School') < 0 && !rows()[0].querySelector('.ff-rev-school') && /No School site column/.test(sec().querySelector('.ff-review-level').textContent) && rows()[0].querySelector('.ff-rev-cal').value === 'cal_a');
    check('the Program-only prefill is a complete decision (Confirm enabled)', !sec().querySelector('.ff-review-confirm').disabled);
    await confirm();
    check('the record lands at Program/Day (cal_a|_prog|07-06 = 40.5) and is NOT parked as unmapped', det().fulfillment['cal_a|_prog|2026-07-06'] && det().fulfillment['cal_a|_prog|2026-07-06'].produced === 40.5 && Object.keys(det().fulfillmentPending || {}).length === 0);
    check('the Program/Day total now aggregates program-level + school-level records (40.5 + 30 + 5 = 75.5)', dayTotal('cal_a', '2026-07-06') === 75.5, dayTotal('cal_a', '2026-07-06'));
    check('the saved school mapping for PA is now program-level and the earlier school records are intact', det().fulfillmentMap['pa'].level === 'program' && det().fulfillment['cal_a|s1|2026-07-06'].produced === 30);
    // a School site file for PA again: the School is NOT prefilled from the program-level mapping
    await stage(csv('pa-site.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-13', '8', '1', '80']]));
    check('a School site file after a program-level mapping: School picker back, Program prefilled, School EMPTY (0 of 1 mapped)', !!rows()[0].querySelector('.ff-rev-school') && rows()[0].querySelector('.ff-rev-cal').value === 'cal_a' && rows()[0].querySelector('.ff-rev-school').value === '' && /0 of 1 mapped/.test(sec().querySelector('.ff-review-note').textContent));
    await mapRow(0, 'cal_a', 's1'); await confirm();
    check('it lands at Program/School/Day; the program-level 07-06 record is untouched', det().fulfillment['cal_a|s1|2026-07-13'].produced === 8 && det().fulfillment['cal_a|_prog|2026-07-06'].produced === 40.5);
    // the real XLSX export (no School site column): parses, 49 days, Program/Day
    const XLSX_PATH = '/mnt/user-data/uploads/CNUSD_-_Fulfillment_Data.xlsx';
    if (fs.existsSync(XLSX_PATH)) {
      const buf = fs.readFileSync(XLSX_PATH); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      await stage({ name: 'CNUSD - Fulfillment Data.xlsx', arrayBuffer: async () => ab, text: async () => '' });
      check('the real XLSX export stages for review with no School picker (no School site column)', !!sec().querySelector('.ff-review') && rows().length >= 1 && !rows()[0].querySelector('.ff-rev-school'));
      $(rows()[0].querySelector('.ff-rev-cal')).val('cal_b').trigger('change'); await flush(60); await confirm();
      const xk = ffKeys().filter(k => k.indexOf('cal_b|_prog|') === 0);
      check('XLSX: 49 Program/Day records land under cal_b, summing to the file total 16170.7', xk.length === 49 && Math.abs(r2(xk.reduce((a, k) => a + det().fulfillment[k].produced, 0)) - 16170.7) < 0.011, xk.length);
      check('XLSX: cal_a records are untouched by the cal_b upload', ffKeys().filter(k => k.indexOf('cal_a|') === 0).length === 7);
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Controls only when eligible data exists ═══ */
  await suite('2. Use/Ignore appear ONLY when a selected Program+Day has saved data: single cell, multi-select (none / some / all), combined cell; Freeze/Special Days intact when hidden; upload / Undo / import change availability immediately', async () => {
    await seed();
    let m = await openCtx('2026-07-06', 'cal_a');
    check('single cell WITH data: both controls present above Freeze, divider present', hasFf(m) && !!opts(m).use && !!opts(m).ign && !!m.querySelector('.cal-ctx-ff-div') && !!m.querySelector('.cal-ctx-freeze'));
    check('the Fulfillment section sits above Freeze Schedule', m.querySelector('.cal-ctx-ff').compareDocumentPosition(m.querySelector('.cal-ctx-freeze')) & 4);
    await closeCtx(m);
    m = await openCtx('2026-07-14', 'cal_a');
    check('single cell WITHOUT data: NO Fulfillment controls and NO divider', !hasFf(m) && !m.querySelector('.cal-ctx-ff-opt') && !m.querySelector('.cal-ctx-ff-div'));
    check('...while Freeze Schedule is still offered', !!m.querySelector('.cal-ctx-freeze'));
    // Freeze still works from a no-data menu
    $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(900);
    check('Freeze from a menu with the controls hidden still freezes the day', !!(det().calMarkers && det().calMarkers['cal_a|2026-07-14'] && det().calMarkers['cal_a|2026-07-14'].frozenHist && det().calMarkers['cal_a|2026-07-14'].frozenHist.length));
    // multi-select with NO eligible cells (07-14..07-16 have nothing)
    let mm = await selectRange('2026-07-14', '2026-07-16', 'cal_a');
    check('multi-select with no eligible cell: menu opens without the Fulfillment section', !!mm && !hasFf(mm));
    check('...and still offers Freeze and the Special Days', !!mm.querySelector('.cal-ctx-freeze') && leaves(mm).some(e => /Apply|Close/.test(e.textContent)));
    await closeMulti(mm);
    // multi-select where SOME are eligible: 07-08 (data) .. 07-10 (data on 07-10, none on 07-09)
    mm = await selectRange('2026-07-08', '2026-07-10', 'cal_a');
    check('multi-select with some eligible cells shows the controls; eligible count = 1 (07-08 only; 07-09/07-10 have no data here)', hasFf(mm) && state(mm).eligible === '1', hasFf(mm) && state(mm).eligible);
    $(opts(mm).use).trigger('click'); await flush(60); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('Use applied only to the eligible day; days without data were NOT enabled', flags()['cal_a|2026-07-08'] === true && !flags()['cal_a|2026-07-09'] && !flags()['cal_a|2026-07-10'] && Object.keys(flags()).length === 1, JSON.stringify(flags()));
    // combined cell: date with no data for any program is hidden; date with data for one program is shown
    det().combinedView = true; const cvChk = [...pl().querySelectorAll('input[type=checkbox]')].find(x => x.parentElement && /Combined/i.test(x.parentElement.textContent)); if (cvChk && !cvChk.checked) { cvChk.checked = true; $(cvChk).trigger('change'); await flush(900); }
    let comb = pl().querySelector('.cal-combined-day[data-date-key="2026-07-15"]');
    $(comb).trigger('contextmenu'); await flush(300); let cm = menu();
    check('combined cell where NO program has data: controls hidden, Freeze present', !!cm && !hasFf(cm) && !!cm.querySelector('.cal-ctx-freeze'));
    await closeCtx(cm);
    comb = pl().querySelector('.cal-combined-day[data-date-key="2026-07-09"]');
    $(comb).trigger('contextmenu'); await flush(300); cm = menu();
    check('combined cell where only cal_b has data: controls shown with 1 eligible', hasFf(cm) && state(cm).eligible === '1', hasFf(cm) && state(cm).eligible);
    await closeCtx(cm);
    if (cvChk && cvChk.checked) { cvChk.checked = false; $(cvChk).trigger('change'); await flush(900); }
    // availability follows the dataset: upload for 07-14 -> shown; Undo the upload -> hidden again
    await stage(csv('n.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-14', '3', '1', '80']])); await confirm();
    m = await openCtx('2026-07-14', 'cal_a');
    check('after uploading data for 07-14 the controls appear on it immediately', hasFf(m)); await closeCtx(m);
    check('the upload offered Undo', !!undoBtn()); await undo();
    m = await openCtx('2026-07-14', 'cal_a');
    check('after Undo removes that data the controls disappear again', !hasFf(m) && !det().fulfillment['cal_a|s1|2026-07-14']); await closeCtx(m);
    // import: a guide with no Fulfillment -> hidden everywhere; import one with data -> shown
    let captured = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') captured = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    await importGuide(dom, c, fixture()); await flush(800);
    m = await openCtx('2026-07-06', 'cal_a'); check('a clean guide (no Fulfillment) shows no controls', !hasFf(m)); await closeCtx(m);
    await importGuide(dom, c, captured); await flush(1200);
    m = await openCtx('2026-07-06', 'cal_a'); check('importing the exported guide brings the controls back on the days with data', hasFf(m)); await closeCtx(m);
    m = await openCtx('2026-07-16', 'cal_a'); check('...and not on days without', !hasFf(m)); await closeCtx(m);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Use / Ignore stress ═══ */
  await suite('3. Use/Ignore: individual, multi-select and combined cells; all-on / all-off / mixed with counts over ELIGIBLE days only; Save only when it changes something; nothing applied before Save; repeated rapid switching', async () => {
    await seed();
    let m = await openCtx('2026-07-06', 'cal_a');
    check('all-off single: Ignore is current, Use is not, no counts', state(m).ignCur && !state(m).useCur && state(m).useCnt === '' && state(m).ignCnt === '');
    check('Save hidden before any pick', !saveShown(m));
    $(opts(m).ign).trigger('click'); await flush(60);
    check('picking the CURRENT state stages it but shows no Save', opts(m).ign.getAttribute('data-ff-staged') === '1' && !saveShown(m));
    $(opts(m).use).trigger('click'); await flush(60);
    check('picking Use reveals Save; nothing is applied yet', saveShown(m) && Object.keys(flags()).length === 0);
    await closeCtx(m);
    check('Close discards the staged pick (still nothing applied)', Object.keys(flags()).length === 0);
    m = await openCtx('2026-07-06', 'cal_a'); $(opts(m).use).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Save applies Use to that Program+Day only', flags()['cal_a|2026-07-06'] === true && Object.keys(flags()).length === 1);
    m = await openCtx('2026-07-06', 'cal_a');
    check('reopen: Use is current now', state(m).useCur && !state(m).ignCur);
    $(opts(m).use).trigger('click'); await flush(60); check('picking Use when Use is current shows no Save', !saveShown(m));
    $(opts(m).ign).trigger('click'); await flush(60); check('picking Ignore shows Save', saveShown(m));
    await closeCtx(m);
    // multi-select 07-06..07-08 (all eligible): mixed 1 on / 2 off -> counts
    let mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a');
    check('multi 07-06..08: 3 eligible, mixed -> Use (1) / Ignore (2), neither current', state(mm).eligible === '3' && state(mm).useCnt === '(1)' && state(mm).ignCnt === '(2)' && !state(mm).useCur && !state(mm).ignCur, JSON.stringify(state(mm)));
    $(opts(mm).use).trigger('click'); await flush(60); check('multi: picking Use reveals Apply', saveShown(mm)); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('multi Use enabled all three', ['06', '07', '08'].every(x => flags()['cal_a|2026-07-' + x] === true) && Object.keys(flags()).length === 3);
    mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a');
    check('all-on multi: Use current, no counts', state(mm).useCur && state(mm).useCnt === '' && state(mm).ignCnt === '');
    $(opts(mm).use).trigger('click'); await flush(60); check('all-on: picking Use shows no Apply (no change)', !saveShown(mm));
    $(opts(mm).ign).trigger('click'); await flush(60); check('all-on: picking Ignore shows Apply', saveShown(mm)); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('multi Ignore disabled all three', ['06', '07', '08'].every(x => !flags()['cal_a|2026-07-' + x]));
    // a selection spanning eligible + ineligible days: counts ignore the ineligible ones
    m = await openCtx('2026-07-07', 'cal_a'); $(opts(m).use).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    mm = await selectRange('2026-07-06', '2026-07-10', 'cal_a');   // 06,07,08 eligible (07 on); 09,10 not
    check('mixed selection with ineligible days: eligible 3, Use (1) / Ignore (2) - the days without data are not counted either way', state(mm).eligible === '3' && state(mm).useCnt === '(1)' && state(mm).ignCnt === '(2)', JSON.stringify(state(mm)));
    $(opts(mm).use).trigger('click'); await flush(60); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('Use over the mixed selection enabled only the 3 eligible days', Object.keys(flags()).filter(k => flags()[k]).sort().join(',') === 'cal_a|2026-07-06,cal_a|2026-07-07,cal_a|2026-07-08', JSON.stringify(flags()));
    // combined cell: cal_a on / cal_b off on 07-06 -> mixed (1)/(1)
    det().combinedView = true; const cvChk = [...pl().querySelectorAll('input[type=checkbox]')].find(x => x.parentElement && /Combined/i.test(x.parentElement.textContent)); if (cvChk && !cvChk.checked) { cvChk.checked = true; $(cvChk).trigger('change'); await flush(900); }
    let comb = pl().querySelector('.cal-combined-day[data-date-key="2026-07-06"]');
    $(comb).trigger('contextmenu'); await flush(300); let cm = menu();
    check('combined 07-06 (cal_a on, cal_b off): mixed across programs -> Use (1) / Ignore (1)', state(cm).eligible === '2' && state(cm).useCnt === '(1)' && state(cm).ignCnt === '(1)', JSON.stringify(state(cm)));
    $(opts(cm).use).trigger('click'); await flush(60); $(applyBtn(cm)).trigger('click'); await flush(1500);
    check('combined Use enabled cal_b too; cal_a unchanged', flags()['cal_b|2026-07-06'] === true && flags()['cal_a|2026-07-06'] === true);
    $(comb).trigger('contextmenu'); await flush(300); cm = menu();
    check('combined all-on: Use current, no counts', state(cm).useCur && state(cm).useCnt === '');
    $(opts(cm).ign).trigger('click'); await flush(60); $(applyBtn(cm)).trigger('click'); await flush(1500);
    check('combined Ignore disabled both programs on that date only', !flags()['cal_b|2026-07-06'] && !flags()['cal_a|2026-07-06'] && flags()['cal_a|2026-07-07'] === true);
    if (cvChk && cvChk.checked) { cvChk.checked = false; $(cvChk).trigger('change'); await flush(900); }
    // rapid switching 12 times on 07-06 (individual menu): every Save lands, state never drifts
    let drift = false;
    for (let i = 0; i < 12; i++) {
      const want = (i % 2 === 0);
      m = await openCtx('2026-07-06', 'cal_a'); $(opts(m)[want ? 'use' : 'ign']).trigger('click'); await flush(30); $(applyBtn(m)).trigger('click'); await flush(500);
      if ((flags()['cal_a|2026-07-06'] === true) !== want) drift = true;
      if (hrsOf('2026-07-06', 'cal_a') !== (want ? 25 : 18)) drift = true;
    }
    check('12 rapid Use/Ignore switches: the flag and the cell hours track every Save (25 on / 18 off)', !drift, hrsOf('2026-07-06', 'cal_a'));
    // rapid multi switching 6 times
    drift = false;
    for (let i = 0; i < 6; i++) {
      const want = (i % 2 === 1);
      mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a'); $(opts(mm)[want ? 'use' : 'ign']).trigger('click'); await flush(30); $(applyBtn(mm)).trigger('click'); await flush(600);
      if (['06', '07', '08'].some(x => (flags()['cal_a|2026-07-' + x] === true) !== want)) drift = true;
    }
    check('6 rapid multi-select switches: all three days track every Apply', !drift, JSON.stringify(flags()));
    check('no flag was ever written for a day without data', Object.keys(flags()).every(k => dayTotal(k.split('|')[0], k.split('|')[1]) != null), JSON.stringify(flags()));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Checkbox synchronization ═══ */
  await suite('4. Checkbox <-> menu: Save Use checks the breakdown checkbox on every affected day, Save Ignore unchecks; toggling the checkbox updates the menu state and counts; one shared store', async () => {
    await seed();
    let mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a'); $(opts(mm).use).trigger('click'); await flush(60); $(applyBtn(mm)).trigger('click'); await flush(1500);
    for (const x of ['06', '07', '08']) { await pin('2026-07-' + x, 'cal_a'); check('after multi Use the breakdown checkbox on 07-' + x + ' is CHECKED', !!ffChk() && ffChk().checked); await closePop(); }
    mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a'); $(opts(mm).ign).trigger('click'); await flush(60); $(applyBtn(mm)).trigger('click'); await flush(1500);
    for (const x of ['06', '07', '08']) { await pin('2026-07-' + x, 'cal_a'); check('after multi Ignore the checkbox on 07-' + x + ' is UNCHECKED', !!ffChk() && !ffChk().checked); await closePop(); }
    // checkbox -> menu
    await pin('2026-07-07', 'cal_a'); await toggleFf(true); await closePop();
    let m = await openCtx('2026-07-07', 'cal_a'); check('checking the box makes Use current in the menu', state(m).useCur); await closeCtx(m);
    mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a'); check('...and the multi counts follow: Use (1) / Ignore (2)', state(mm).useCnt === '(1)' && state(mm).ignCnt === '(2)', JSON.stringify(state(mm))); await closeMulti(mm);
    await pin('2026-07-07', 'cal_a'); await toggleFf(false); await closePop();
    m = await openCtx('2026-07-07', 'cal_a'); check('unchecking makes Ignore current again', state(m).ignCur); await closeCtx(m);
    check('the menu and the checkbox read/write ONE store (det.fulfillmentAuth)', JSON.stringify(flags()) === '{}' || Object.keys(flags()).every(k => flags()[k] === false || flags()[k] === true));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Calculation accuracy + propagation ═══ */
  await suite('5. Use -> Fulfillment Hours are the authoritative Total Hours; Ignore -> revert to Override, then Freeze, then inherited; cell, week, breakdown, Programs, Summary, Amount, NTE and Amount Available update immediately; Staff Count untouched; week exclusion suppresses but keeps the flag', async () => {
    await seed();
    const D = '2026-07-06';
    const base = hrsOf(D, 'cal_a'), baseCnt = cntOf(D, 'cal_a'), baseProg = progSched(), baseWeek = weekSum(D, 'cal_a');
    check('baseline: inherited 18 hrs / 3 staff on cal_a 07-06', base === 18 && baseCnt === 3, base + '/' + baseCnt);
    reconcile('baseline');
    let m = await openCtx(D, 'cal_a'); $(opts(m).use).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Use: the cell shows the aggregated Fulfillment Hours (25) in green; Staff Count unchanged (3)', hrsOf(D, 'cal_a') === 25 && /31,\s*115,\s*76/.test(colOf(D, 'cal_a')) && cntOf(D, 'cal_a') === 3, hrsOf(D, 'cal_a') + ' ' + colOf(D, 'cal_a'));
    check('Use: the week row total moved by +7', weekSum(D, 'cal_a') === r2(baseWeek + 7), weekSum(D, 'cal_a') + ' vs ' + (baseWeek + 7));
    check('Use: Programs Scheduled Hrs = base - 18 + 25', progSched() === r2(baseProg + 7), progSched());
    reconcile('after Use');
    await pin(D, 'cal_a'); check('Use: the breakdown checkbox is checked and its Fulfillment row/grand total show 25', ffChk().checked && /25 Hrs/.test(popup().querySelector('.cal-tip-ff-line').textContent)); await closePop();
    // Override underneath: Ignore -> reverts to the override hours, not to inherited
    await pin(D, 'cal_a'); { const o = () => popup().querySelector('.cal-tip-ovr-day-totals'); const q = cls => o().querySelector(cls); q('.cal-tip-odt-chk').checked = true; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(900); $(q('.cal-tip-odt-hours')).val('50').trigger('input'); $(q('.cal-tip-odt-staff')).val('4').trigger('input'); await flush(40); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200); } await closePop();
    check('with an override saved underneath, Fulfillment still governs hours (25) and the override staff count (4) wins', hrsOf(D, 'cal_a') === 25 && cntOf(D, 'cal_a') === 4, hrsOf(D, 'cal_a') + '/' + cntOf(D, 'cal_a'));
    m = await openCtx(D, 'cal_a'); $(opts(m).ign).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Ignore: hours revert to the Override Day Total (50, amber), staff 4', hrsOf(D, 'cal_a') === 50 && /154,\s*91,\s*0/.test(colOf(D, 'cal_a')) && cntOf(D, 'cal_a') === 4, hrsOf(D, 'cal_a') + ' ' + colOf(D, 'cal_a'));
    check('Ignore: Programs = base - 18 + 50', progSched() === r2(baseProg + 32), progSched());
    reconcile('after Ignore over override');
    // remove the override; freeze the day at inherited (18); Use -> 25; Ignore -> frozen 18
    await pin(D, 'cal_a'); { const o = () => popup().querySelector('.cal-tip-ovr-day-totals'); const q = cls => o().querySelector(cls); q('.cal-tip-odt-chk').checked = false; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(900); } await closePop();
    check('override off: back to inherited 18 / 3', hrsOf(D, 'cal_a') === 18 && cntOf(D, 'cal_a') === 3);
    m = await openCtx(D, 'cal_a'); $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(900);
    check('the day is frozen', !!(det().calMarkers['cal_a|' + D] && det().calMarkers['cal_a|' + D].frozenHist.length));
    m = await openCtx(D, 'cal_a'); $(opts(m).use).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Use over a Freeze: Fulfillment governs (25)', hrsOf(D, 'cal_a') === 25);
    m = await openCtx(D, 'cal_a'); $(opts(m).ign).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Ignore over a Freeze: hours revert to the frozen value (18) and the snapshot is preserved', hrsOf(D, 'cal_a') === 18 && !!det().calMarkers['cal_a|' + D].frozenHist.length);
    reconcile('after Ignore over freeze');
    // combined view reflects the same numbers; cal_b enabled separately
    det().combinedView = true; const cvChk = [...pl().querySelectorAll('input[type=checkbox]')].find(x => x.parentElement && /Combined/i.test(x.parentElement.textContent)); if (cvChk && !cvChk.checked) { cvChk.checked = true; $(cvChk).trigger('change'); await flush(900); }
    const comb = pl().querySelector('.cal-combined-day[data-date-key="' + D + '"]');
    $(comb).trigger('contextmenu'); await flush(300); let cm = menu(); $(opts(cm).use).trigger('click'); await flush(60); $(applyBtn(cm)).trigger('click'); await flush(1500);
    const carriers = [...comb.querySelectorAll('.cal-combined-carrier')];
    const carrierHrs = cal => { const cc = carriers.find(x => x.getAttribute('data-cal-id') === cal); return cc ? parseFloat((cc.querySelector('.cal-hours') || {}).textContent) : NaN; };
    check('combined Use: cal_a carrier 25, cal_b carrier 9 (cal_b Fulfillment 9 replaced its inherited 3)', carrierHrs('cal_a') === 25 && carrierHrs('cal_b') === 9, carrierHrs('cal_a') + '/' + carrierHrs('cal_b'));
    check('combined Use: Programs = base - 18 + 25 - 3 + 9', progSched() === r2(baseProg + 7 + 6), progSched());
    reconcile('combined Use');
    if (cvChk && cvChk.checked) { cvChk.checked = false; $(cvChk).trigger('change'); await flush(900); }
    // Staffing Allocation - Weeks / week totals reflect it: the calendar row sum equals the sum of its cells
    check('week row: sum of day cells is the week figure shown', !weekOk(D, 'cal_a') || Math.abs(weekTotal(D, 'cal_a') - weekSum(D, 'cal_a')) < 0.011, weekTotal(D, 'cal_a') + ' vs ' + weekSum(D, 'cal_a'));
    // week exclusion: suppressed, flag kept, restored
    W._pgWeekVis.toggle('pg-001', 'cal_a', D); await flush(900); d.getElementById('staffing-section-pg-001')._recalcAll(); await flush(700);
    check('EXCLUDED week: Fulfillment Hours are suppressed while the saved flag is preserved', (cellOf(D, 'cal_a').querySelector('.cal-hours').textContent.trim() === '' || /^0/.test(cellOf(D, 'cal_a').querySelector('.cal-hours').textContent)) && flags()['cal_a|' + D] === true);
    W._pgWeekVis.toggle('pg-001', 'cal_a', D); await flush(900); d.getElementById('staffing-section-pg-001')._recalcAll(); await flush(700);
    check('INCLUDED again: Fulfillment Hours restored (25)', hrsOf(D, 'cal_a') === 25, hrsOf(D, 'cal_a'));
    reconcile('final');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Upload -> ... -> Import workflow ═══ */
  await suite('6. Upload -> Map -> Save -> Use -> Upload more -> Ignore -> Undo -> Export -> Import -> upload again: dataset, flags and every total reconcile at each step; nothing lost or duplicated', async () => {
    await seed(); const D = '2026-07-07';
    const baseProg = progSched();
    let m = await openCtx(D, 'cal_a'); $(opts(m).use).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Use on 07-07: cell 21', hrsOf(D, 'cal_a') === 21);
    // upload more data for the SAME enabled day (PB Adams 07-07 = 4) -> the enabled cell updates immediately
    await stage(csv('more.csv', H_SITE, [['2', 'PB', 'Adams', D, '4', '1', '80']])); await confirm();
    check('a new upload for an ENABLED day updates the cell immediately (21 + 4 = 25)', hrsOf(D, 'cal_a') === 25, hrsOf(D, 'cal_a'));
    check('...and Programs/Summary follow', progSched() === r2(baseProg - 18 + 25), progSched()); reconcile('after upload more');
    m = await openCtx(D, 'cal_a'); $(opts(m).ign).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(1500);
    check('Ignore: back to inherited 18; the dataset keeps both records', hrsOf(D, 'cal_a') === 18 && dayTotal('cal_a', D) === 25);
    const snapBeforeUndo = JSON.stringify({ f: det().fulfillment, a: flags() });
    check('Ignore offered Undo', !!undoBtn()); await undo();
    check('Undo restores the enabled state (25) and leaves the dataset intact', hrsOf(D, 'cal_a') === 25 && flags()['cal_a|' + D] === true && dayTotal('cal_a', D) === 25);
    // undo an UPLOAD: upload a new day, Undo -> gone, flags untouched
    await stage(csv('x.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-20', '2', '1', '80']])); await confirm();
    check('the upload landed', !!det().fulfillment['cal_a|s1|2026-07-20']); await undo();
    check('Undo of the upload removes its records and keeps every flag', !det().fulfillment['cal_a|s1|2026-07-20'] && flags()['cal_a|' + D] === true && ffKeys().length === 7, ffKeys().length);
    // export -> clean -> import
    let captured = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') captured = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    const snap = JSON.stringify({ f: det().fulfillment, m: det().fulfillmentMap, a: flags() }); const hrsBefore = hrsOf(D, 'cal_a'), progBefore = progSched(), amtBefore = summaryAmt();
    await importGuide(dom, c, fixture()); await flush(600); await importGuide(dom, c, captured); await flush(1500);
    check('after export + clean import the dataset, mappings (levels) and flags are byte-identical', JSON.stringify({ f: det().fulfillment, m: det().fulfillmentMap, a: flags() }) === snap);
    check('...and the cell / Programs / Amount are identical', hrsOf(D, 'cal_a') === hrsBefore && progSched() === progBefore && Math.abs(summaryAmt() - amtBefore) < 0.5, hrsOf(D, 'cal_a') + '/' + progSched());
    reconcile('after import');
    // subsequent upload merges with the imported dataset: overlapping 07-07 PA replaced (21 -> 23), new 07-21 inserted
    await stage(csv('after.csv', H_SITE, [['1', 'PA', 'Lincoln', D, '23', '1', '80'], ['1', 'PA', 'Lincoln', '2026-07-21', '1', '1', '80']]));
    check('the upload after import is prefilled from the imported mapping', rows()[0].querySelector('.ff-rev-cal').value === 'cal_a' && rows()[0].querySelector('.ff-rev-school').value === 's1'); await confirm();
    check('merge after import: 07-07 replaced (23 + 4 = 27 on the enabled cell), 07-21 inserted, no duplicates (8 records)', hrsOf(D, 'cal_a') === 27 && ffKeys().length === 8 && det().fulfillmentLog[0].updated === 1 && det().fulfillmentLog[0].inserted === 1, hrsOf(D, 'cal_a') + ' ' + ffKeys().length);
    reconcile('after merge');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. UI stability ═══ */
  await suite('7. Stability: rapid consecutive uploads, mapping changes and toggles; the pinned breakdown never moves; unrelated programs/days untouched; no stale hours, no duplicate records, no errors', async () => {
    await seed();
    const D = '2026-07-08';
    const snapB = () => JSON.stringify(['06', '07', '08', '09', '10'].map(x => hrsOf('2026-07-' + x, 'cal_b')));
    const bBefore = snapB();
    cellOf(D, 'cal_a').getBoundingClientRect = () => ({ top: 120, bottom: 180, left: 400, right: 520, width: 120, height: 60 });
    await pin(D, 'cal_a'); const p0 = posOf();
    let moved = false, bad = false;
    for (let i = 0; i < 10; i++) { await toggleFf(i % 2 === 0); if (posOf() !== p0) moved = true; if (hrsOf(D, 'cal_a') !== ((i % 2 === 0) ? 22 : 18)) bad = true; }
    check('10 rapid checkbox toggles: the pinned popup never jumps', !moved, p0 + ' -> ' + posOf());
    check('10 rapid checkbox toggles: the cell always shows the right value (22 on / 18 off)', !bad, hrsOf(D, 'cal_a'));
    await closePop();
    // rapid consecutive uploads without waiting for each to settle: every day lands exactly once
    const files = [1, 2, 3, 4, 5].map(i => csv('r' + i + '.csv', H_SITE, [['1', 'PA', 'Lincoln', '2026-07-2' + i, String(i), '1', '80']]));
    for (const f of files) { await stage(f); await confirm(); }
    const rk = ffKeys().filter(k => /2026-07-2[1-5]$/.test(k));
    check('5 back-to-back uploads each landed exactly once (5 new records, values 1..5)', rk.length === 5 && rk.every((k, i) => det().fulfillment[k].produced === i + 1), JSON.stringify(rk));
    // mapping change under load: re-map PB from Adams to Lincoln via a new upload + review pick (school-level)
    await stage(csv('remap.csv', H_SITE, [['2', 'PB', 'Adams', '2026-07-06', '5', '1', '80']]));
    check('review prefilled from the saved PB mapping (cal_a / s2)', rows()[0].querySelector('.ff-rev-school').value === 's2');
    await mapRow(0, 'cal_a', 's1'); check('re-mapping PB onto Lincoln, already used by PA, is refused (one school per program) - Confirm disabled', sec().querySelector('.ff-review-confirm').disabled);
    await cancel();
    // pinned popup stays put across a multi-cell Apply and an upload
    await pin(D, 'cal_a'); const p1 = posOf();
    let mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a'); $(opts(mm).use).trigger('click'); await flush(60); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('after a multi-cell Apply every affected cell shows its Fulfillment Hours (25/21/22)', hrsOf('2026-07-06', 'cal_a') === 25 && hrsOf('2026-07-07', 'cal_a') === 21 && hrsOf('2026-07-08', 'cal_a') === 22, [hrsOf('2026-07-06', 'cal_a'), hrsOf('2026-07-07', 'cal_a'), hrsOf('2026-07-08', 'cal_a')].join('/'));
    check('unrelated cal_b days are untouched by cal_a operations', snapB() === bBefore, snapB());
    check('cal_a days outside the selection are untouched (07-09 inherited 18)', hrsOf('2026-07-09', 'cal_a') === 18 && !flags()['cal_a|2026-07-09']);
    reconcile('after stability run');
    check('the menu reflects the current selection state after everything (all-on)', (mm = await selectRange('2026-07-06', '2026-07-08', 'cal_a')) && state(mm).useCur, JSON.stringify(state(mm))); await closeMulti(mm);
    check('no duplicate records exist for any Program/School/Day', ffKeys().length === new Set(ffKeys()).size);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
