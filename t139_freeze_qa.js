// t139_freeze_qa.js — RIGOROUS Freeze Schedule regression. Treats the frozen snapshot as a protected
// baseline layer and attacks it from every upstream source, in whole-day / one-school / subset /
// multi-day forms, with overrides, Extra Shifts, trash/delete, unfreeze, school removal + re-add,
// re-freeze, indicators, Combined vs Individual, import/export, and rapid sequences. After EVERY
// action the cell, hover popup, pinned popup, week total, Programs table and Summary must reconcile.
// Any mismatch is a critical defect.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
// 4 schools: A=2 coaches, B=1, C=3, D=1 ; SH 09:00-15:00 (6h) -> day = 6*(2+1+3+1) = 42
function fixture(opts) {
  opts = opts || {};
  const rows = [
    { school: 'Alpha', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
    { school: 'Bravo', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 },
    { school: 'Charlie', schoolId: 's3', coaches_ctkk: 3, ctkk: 10 },
    { school: 'Delta', schoolId: 's4', coaches_ctkk: 1, ctkk: 10 }];
  const cals = [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }];
  if (opts.twoCals) cals.push({ name: 'CalB', calId: 'cal_b', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#64b5f6', pricePerHour: '90.00', billable: true });
  const data = {
    status: 'Draft', calendarRows: cals,
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    specialDays: [{ id: 'sd1', name: 'Half Day', color: '#ffd54f' }, { id: 'sdNo', name: 'No School', color: '#ef9a9a', noHours: true }],
    siteRowsByCal: { cal_a: rows.slice(), cal_b: [{ school: 'Echo', schoolId: 's5', coaches_ctkk: 2, ctkk: 10 }] },
    siteRows: rows.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') } }
  };
  if (opts.markers) data.calMarkers = opts.markers;
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data });
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
  await whenReady(dom); await flush(400);
  W._pgCurrentUser = 'QA';
  const pl = () => d.getElementById('planning-panel');
  const secId = () => d.querySelector('[id^="cal-section-"]');
  const cell = (dk, calSel) => secId().querySelector('.cal-day-cell[data-date-key="' + dk + '"]' + (calSel || '[data-cal-id="cal_a"]') + ':not(.cal-combined-carrier)');
  const hrs = (dk, calSel) => { const cl = cell(dk, calSel); const h = cl && cl.querySelector('.cal-hours'); return h ? parseFloat(h.textContent) : NaN; };
  const ind = dk => { const i = cell(dk) && cell(dk).querySelector('.cal-freeze-ind'); return i ? i.textContent.trim() : ''; };
  const det = () => W._pgGuideDetails()['pg-001'];
  const mk = (dk, calId) => (det().calMarkers || {})[(calId || 'cal_a') + '|' + dk];
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const openMenu = async dk => { $(cell(dk)).trigger('contextmenu'); await flush(250); return d.querySelector('.cal-ctx-menu'); };
  const applyBtn = m => leaves(m).find(e => e.textContent.trim() === 'Apply');
  const fzRow = m => m.querySelector('.cal-ctx-freeze');
  const fzCnt = m => (fzRow(m).querySelector('.cal-ctx-freeze-cnt').textContent || '').trim();
  const snows = m => [...m.querySelectorAll('.sch-freeze')];
  const closeMenu = async m => { const b = leaves(m).find(e => e.textContent.trim() === 'Close'); if (b) { $(b).trigger('click'); await flush(120); } };
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(600); const cs = d.getElementById('cal-section-pg-001'); if (cs && cs._updateHours) cs._updateHours(); await flush(400); };
  const freezeAll = async dk => { const m = await openMenu(dk); $(fzRow(m)).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500); };
  const freezeSchools = async (dk, idxs) => { const m = await openMenu(dk); idxs.forEach(i => $(snows(m)[i]).trigger('click')); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500); };
  const toggleSchool = async (dk, i) => { const m = await openMenu(dk); $(snows(m)[i]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500); };
  // popups
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const popGrand = pop => { const t = [...pop.querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total \(\d+ schools?\)/, '').trim()) : NaN; };
  const popRows = pop => [...pop.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length >= 5 && !/^Total/.test(tr.textContent.trim())).map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim().replace('\u00d7', '')));
  const rowSum = rows => rows.reduce((a, r) => a + (parseFloat(r[r.length - 1]) || 0), 0);
  const hover = async dk => { $(cell(dk)).trigger('mouseenter'); await flush(450); const p = popup(); const g = p ? popGrand(p) : NaN; const rs = p ? rowSum(popRows(p)) : NaN; $(cell(dk)).trigger('mouseleave'); await flush(300); return { grand: g, rows: rs }; };
  const pinned = async dk => { $(cell(dk)).trigger('click'); await flush(450); const p = popup(); const g = p ? popGrand(p) : NaN; const rs = p ? rowSum(popRows(p)) : NaN; const r = p ? popRows(p) : []; $(d.body).trigger('click'); await flush(250); return { grand: g, rows: rs, raw: r }; };
  // RECONCILE: cell == hover grand == pinned grand == sum of pinned rows
  async function reconcile(label, dk, expect) {
    const cellV = hrs(dk); const hv = await hover(dk); const pn = await pinned(dk);
    const ok = cellV === expect && hv.grand === expect && pn.grand === expect && Math.abs(pn.rows - expect) < 0.01 && Math.abs(hv.rows - expect) < 0.01;
    check(label + ' \u2014 cell/hover/pinned/rows all = ' + expect, ok, 'cell=' + cellV + ' hover=' + hv.grand + '/' + hv.rows + ' pinned=' + pn.grand + '/' + pn.rows);
    return ok;
  }
  // dependents
  const weekTotal = dk => { const cl = cell(dk); const tr = cl && cl.closest('tr'); const wt = tr && (tr.querySelector('.cal-week-total, .cal-wk-total, td.cal-week-sum') || [...tr.cells].pop()); return wt ? parseFloat(wt.textContent) : NaN; };
  const progSched = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Meal Breaks/.test(cc.textContent))); if (!t) return NaN; const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); const r = t.tBodies[0].rows[0]; return r ? parseFloat(r.cells[i].textContent) : NaN; };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  const setSH = async (s, e) => { det().staffingHoursSlots.c0.ctkk = mkTimes(s, e); await recalc(); };
  const setSB = async (i, n) => { det().siteRowsByCal.cal_a[i].coaches_ctkk = n; det().siteRows[i].coaches_ctkk = n; await recalc(); };
  const setOv = async (dk, si, ov) => { det().calCellOverrides = det().calCellOverrides || {}; if (ov === null) delete det().calCellOverrides['cal_a|' + dk + '|' + si + '|ctkk']; else det().calCellOverrides['cal_a|' + dk + '|' + si + '|ctkk'] = ov; await recalc(); };
  const allocOff = async (si, dayKey) => { det().staffAlloc = det().staffAlloc || {}; det().staffAlloc['c0'] = det().staffAlloc['c0'] || { on: true, cells: {} }; det().staffAlloc['c0'].on = true; det().staffAlloc['c0'].cells[si + '|' + dayKey] = false; await recalc(); };
  const D = '2026-07-08';   // a Wednesday
  const D2 = '2026-07-09', D3 = '2026-07-10';

  /* ═══ 1. Baseline capture: all / one / subset / multi-day, exact values, no XS/alloc ═══ */
  await suite('1. Baseline capture is exact for all / one / subset / multi-day, and excludes Extra Shifts', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('day = 42 (6h x 7 coaches)', hrs(D) === 42, hrs(D));
    await freezeAll(D);
    const m1 = mk(D);
    check('all four snapshots captured 09:00-15:00 with the right counts (2,1,3,1)', ['0','1','2','3'].every(k => m1.frozenSnap[k].ctkk.start === '09:00' && m1.frozenSnap[k].ctkk.end === '15:00') && m1.frozenSnap['0'].ctkk.cnt === 2 && m1.frozenSnap['1'].ctkk.cnt === 1 && m1.frozenSnap['2'].ctkk.cnt === 3 && m1.frozenSnap['3'].ctkk.cnt === 1, JSON.stringify(m1.frozenSnap));
    check('every snapshot has a timestamp + user QA', ['0','1','2','3'].every(k => m1.frozenMeta[k].at && m1.frozenMeta[k].by === 'QA'));
    check('snapshot fields are exactly start/end/cnt (no Extra Shift / Allocated Hours fields)', Object.keys(m1.frozenSnap['0'].ctkk).sort().join(',') === 'cnt,end,start');
    // one school on D2
    await freezeSchools(D2, [2]);
    check('one school (Charlie) frozen on D2 with cnt 3', mk(D2).frozen && Object.keys(mk(D2).frozen).join(',') === '2' && mk(D2).frozenSnap['2'].ctkk.cnt === 3, JSON.stringify(mk(D2).frozen));
    // subset (A,B) on D3
    await freezeSchools(D3, [0, 1]);
    check('subset (Alpha, Bravo) frozen on D3', Object.keys(mk(D3).frozen).sort().join(',') === '0,1' && !mk(D3).frozenSnap['2']);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Every upstream source is blocked for the frozen day and still moves the live day ═══ */
  await suite('2. Upstream immunity: SH times, SH counts, SB counts, role count, allocation-off, Special Day (incl. no-hours) all blocked; live day moves', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D);
    const live = D2;
    // (a) SH start/end
    await setSH('07:00', '19:00');   // 12h
    check('(a) SH time change: frozen stays 42, live = 12x7 = 84', hrs(D) === 42 && hrs(live) === 84, hrs(D) + '/' + hrs(live));
    await reconcile('(a) reconcile', D, 42);
    // (b) SB counts (A 2->5, D 1->4)
    await setSB(0, 5); await setSB(3, 4);
    check('(b) SB count change: frozen stays 42, live = 12x(5+1+3+4) = 156', hrs(D) === 42 && hrs(live) === 156, hrs(D) + '/' + hrs(live));
    await reconcile('(b) reconcile', D, 42);
    // (c) allocation OFF for Alpha on Wednesdays (the frozen day) — must NOT drop the frozen school
    await allocOff(0, 'wed');
    check('(c) allocation off (Alpha/Wed): frozen still 42 (snapshot cnt kept)', hrs(D) === 42, hrs(D));
    await reconcile('(c) reconcile (popups must not drop the frozen school)', D, 42);
    // live Wednesday (7/15) loses Alpha: 12 x (1+3+4) = 96
    check('(c) a LIVE Wednesday drops Alpha: 12x8 = 96', hrs('2026-07-15') === 96, hrs('2026-07-15'));
    // (d) a no-hours Special Day applied to the frozen day must not zero it
    det().calMarkers['cal_a|' + D].schools = { '0': 'sdNo', '1': 'sdNo', '2': 'sdNo', '3': 'sdNo' }; await recalc();
    check('(d) no-hours Special Day on the frozen day: still 42', hrs(D) === 42, hrs(D));
    await reconcile('(d) reconcile', D, 42);
    det().calMarkers['cal_a|' + D].schools = {}; await recalc();
    // (e) a calendar override on ANOTHER date does not leak
    await setOv(live, 0, { cnt: 9 });
    check('(e) override on the live day only: frozen 42, live changed', hrs(D) === 42 && hrs(live) !== 156, hrs(D) + '/' + hrs(live));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Partial day: A,B frozen; C,D live — upstream moves only C,D; totals combine ═══ */
  await suite('3. Partial day (A,B frozen / C,D live): upstream changes move only C,D and every total combines both groups', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeSchools(D, [0, 1]);   // Alpha 2, Bravo 1 frozen at 6h -> 18 frozen
    await setSH('08:00', '16:00');    // 8h live
    await setSB(2, 5);                // Charlie 3->5
    const expect = 6 * (2 + 1) + 8 * (5 + 1);   // 18 + 48 = 66
    check('cell = frozen 18 + live 48 = 66', hrs(D) === expect, hrs(D));
    await reconcile('partial-day reconcile', D, expect);
    const pn = await pinned(D);
    check('pinned rows show a 9:00am/6h group and an 8:00am/8h group', pn.raw.some(r => r[1] === '9:00am' && r[3] === '6') && pn.raw.some(r => r[1] === '8:00am' && r[3] === '8'), JSON.stringify(pn.raw));
    // freeze count in the menu
    const m = await openMenu(D);
    check('menu count says (2)', fzCnt(m) === '(2)', fzCnt(m)); await closeMenu(m);
    check('cell indicator says \u2744 (2)', ind(D) === '\u2744 (2)', ind(D));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4+5. Overrides on top of the frozen baseline + dependents ═══ */
  await suite('4/5. Overrides on a frozen school apply to the snapshot (start, end, count, delete, restore, multiple) and every dependent follows', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D);
    await setSH('06:00', '22:00');   // 16h upstream, must be irrelevant
    // count override on Alpha: 2 -> 4  => 6*(4+1+3+1) = 54
    await setOv(D, 0, { cnt: 4 });
    check('count override: 6x(4+1+3+1) = 54', hrs(D) === 54, hrs(D)); await reconcile('count ov', D, 54);
    // start override on Alpha: 10:00 (snapshot end 15:00) -> 5h x4 = 20 ; others 6x5=30 -> 50
    await setOv(D, 0, { cnt: 4, start: '10:00' });
    check('start override applies to the SNAPSHOT end (15:00), not the live 22:00: 5x4 + 30 = 50', hrs(D) === 50, hrs(D)); await reconcile('start ov', D, 50);
    // end override too: 10:00-12:00 -> 2h x4 = 8 -> 38
    await setOv(D, 0, { cnt: 4, start: '10:00', end: '12:00' });
    check('start+end override: 2x4 + 30 = 38', hrs(D) === 38, hrs(D)); await reconcile('start+end ov', D, 38);
    // delete Alpha's hours (trash) -> 30 ; must NOT expose the live 16h
    await setOv(D, 0, { del: true });
    check('deleted hours: 0 + 30 = 30 (no fallback to live 16h)', hrs(D) === 30, hrs(D)); await reconcile('delete', D, 30);
    // restore (remove the override) -> back to the SNAPSHOT 6x2 = 12 -> 42, still not live
    await setOv(D, 0, null);
    check('restored: back to the snapshot 42 (not the live 16h x 7 = 112)', hrs(D) === 42, hrs(D)); await reconcile('restore', D, 42);
    // dependents: Programs Scheduled Hrs + Summary Total Hours follow the frozen day
    const sched = progSched(), sum = summaryHours();
    check('Programs Scheduled Hrs + Summary are numbers that include the frozen day (both reflect the same engine)', isFinite(sched) && isFinite(sum) && Math.abs(sched - sum) < 0.01, sched + '/' + sum);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Immediate rerender (no reopen) after every freeze-related action ═══ */
  await suite('6. Immediate rerender: cell hours/indicator + menu count update after each action without any reopen', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await setSH('06:00', '22:00'); // 16h live baseline: 112
    check('live 112', hrs(D) === 112, hrs(D));
    await setSH('09:00', '15:00'); // back to 6h so the snapshot is 42
    await freezeAll(D);
    await setSH('06:00', '22:00');
    check('after freeze + upstream: cell shows 42 immediately', hrs(D) === 42, hrs(D));
    check('indicator shows \u2744 immediately', ind(D) === '\u2744', ind(D));
    await toggleSchool(D, 3);   // unfreeze Delta -> Delta becomes live 16x1 = 16 ; others 6x6 = 36 -> 52
    check('after unfreezing one school the cell updates immediately (36 + 16 = 52)', hrs(D) === 52, hrs(D));
    check('indicator updates to \u2744 (3) immediately', ind(D) === '\u2744 (3)', ind(D));
    await reconcile('rerender reconcile', D, 52);
    await setOv(D, 0, { cnt: 5 });   // Alpha 2->5 on the snapshot: 6x(5+1+3) + 16 = 70
    check('override on a frozen school rerenders the cell at once (54 + 16 = 70)', hrs(D) === 70, hrs(D));
    await setOv(D, 0, null);
    await freezeAll(D);   // not all frozen (3/4) -> this freezes all (re-applies) -> Delta snapshot now 16h x1
    check('global freeze on a partial day freezes the rest; cell = 36 + 16 = 52', hrs(D) === 52, hrs(D));
    check('indicator \u2744 (all)', ind(D) === '\u2744', ind(D));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Extra Shifts are additive and never absorbed into the snapshot ═══ */
  await suite('8. Extra Shifts before/after a freeze stay separate and additive (cell + popups reconcile)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    // add an Extra Shift BEFORE freezing via the day popup's Add Extra Shift flow is heavy; use the store shape the app reads
    const xsKey = 'cal_a|' + D;
    det().calExtraShifts = det().calExtraShifts || {};
    det().calExtraShifts[xsKey] = [{ school: 'Alpha', rows: [{ role: 'ctkk', start: '16:00', end: '18:00', cnt: 1 }] }];   // 2h x 1 = +2
    await recalc();
    const withXs = hrs(D);
    check('an Extra Shift adds on top of the live day (42 + 2 = 44)', withXs === 44, withXs);
    await freezeAll(D);
    const snapCnt = mk(D).frozenSnap['0'].ctkk;
    check('the snapshot did NOT absorb the Extra Shift (Alpha still 09:00-15:00 x2)', snapCnt.start === '09:00' && snapCnt.end === '15:00' && snapCnt.cnt === 2, JSON.stringify(snapCnt));
    check('the cell keeps snapshot + Extra Shift', hrs(D) === withXs, hrs(D));
    await setSH('06:00', '22:00');
    check('after an upstream change the cell still = snapshot + Extra Shift (unchanged)', hrs(D) === withXs, hrs(D));
    const hv = await hover(D); const pn = await pinned(D);
    check('popups reconcile with the cell including the Extra Shift', hv.grand === hrs(D) && pn.grand === hrs(D), hv.grand + '/' + pn.grand + ' vs ' + hrs(D));
    // remove the Extra Shift after freezing -> back to the pure snapshot 42
    delete det().calExtraShifts[xsKey]; await recalc();
    check('removing the Extra Shift returns the frozen day to its snapshot (42), never the live 112', hrs(D) === 42, hrs(D));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 10. Unfreeze one / all / multi-day -> current upstream, edits discarded ═══ */
  await suite('10. Unfreeze (one school, all, multiple days) restores CURRENT upstream immediately and drops the frozen-layer edits', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D); await freezeAll(D2);
    await setOv(D, 0, { cnt: 9 });            // frozen-layer edit
    await setSH('06:00', '22:00');            // 16h upstream now
    check('while frozen with an edit: D = 6x(9+1+3+1) = 84', hrs(D) === 84, hrs(D));
    await toggleSchool(D, 0);                 // unfreeze Alpha only
    check('unfreezing Alpha drops its edit and it follows the CURRENT 16h (16x2 = 32) + 6x5 = 62', hrs(D) === 62, hrs(D));
    check('Alpha\'s frozen-layer override is gone', !(det().calCellOverrides && det().calCellOverrides['cal_a|' + D + '|0|ctkk']));
    await reconcile('after one-school unfreeze', D, 62);
    await freezeAll(D);                        // 3/4 frozen -> global freezes all (re-apply). Alpha now 16h snapshot
    await freezeAll(D);                        // all frozen -> clears all
    check('unfreeze all: D fully live = 16x7 = 112', hrs(D) === 112, hrs(D));
    check('no marker left for D', !mk(D));
    // multi-day unfreeze via multi-select
    const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
    check('D2 still frozen at 42', hrs(D2) === 42, hrs(D2));
    fire(cell(D2), 'mousedown', { shiftKey: true }); await flush(40); fire(cell(D3), 'mousedown', { shiftKey: true }); await flush(80);
    fire(cell(D2), 'contextmenu', {}); await flush(250);
    const mm = () => [...d.body.children].filter(el => el.classList && el.classList.contains('cal-sd-multi-menu') && el.style.display !== 'none').pop();
    $(fzRow(mm())).trigger('click'); await flush(60);   // stage freeze (D3 unfrozen so 'all' not true -> freeze)
    $([...mm().querySelectorAll('button')].find(b => b.textContent.trim() === 'Apply')).trigger('click'); await flush(700);
    check('multi-day freeze re-froze D2 (replacing at the current 16h) and froze D3', mk(D2) && mk(D2).frozen && mk(D3) && mk(D3).frozen && mk(D3).frozenSnap['0'].ctkk.start === '06:00');
    fire(cell(D2), 'mousedown', { shiftKey: true }); await flush(40); fire(cell(D3), 'mousedown', { shiftKey: true }); await flush(80);
    fire(cell(D2), 'contextmenu', {}); await flush(250);
    $(fzRow(mm())).trigger('click'); await flush(60);   // all frozen -> stage unfreeze
    $([...mm().querySelectorAll('button')].find(b => b.textContent.trim() === 'Apply')).trigger('click'); await flush(700);
    check('multi-day unfreeze cleared both days', !mk(D2) && !mk(D3));
    check('both days live at 112', hrs(D2) === 112 && hrs(D3) === 112, hrs(D2) + '/' + hrs(D3));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 11. School removal + re-add ═══ */
  await suite('11. Removing a frozen school from the Site Breakdown drops it everywhere; re-adding returns it as a normal inherited school', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D);
    await setOv(D, 1, { cnt: 7 });   // frozen-layer edit on Bravo
    await setSH('06:00', '22:00');
    check('before: 6x(2+7+3+1) = 78', hrs(D) === 78, hrs(D));
    const sbTbl = [...pl().querySelectorAll('table')].find(t => [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del') && t.rows[0] && /School/.test(t.rows[0].textContent));
    const delBtns = () => [...sbTbl.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Del');
    $(delBtns()[1]).trigger('click'); await flush(800);   // remove Bravo (idx 1)
    check('Bravo gone: 6x(2+3+1) = 36 (Charlie/Delta re-indexed and still frozen)', hrs(D) === 36, hrs(D));
    const m = mk(D);
    check('frozen state re-indexed to {0,1,2} with Charlie(3) at idx 1', m && m.frozen['0'] && m.frozen['1'] && m.frozen['2'] && !m.frozen['3'] && m.frozenSnap['1'].ctkk.cnt === 3, JSON.stringify(m && m.frozen));
    check('Bravo\'s frozen-layer override is gone', !(det().calCellOverrides && det().calCellOverrides['cal_a|' + D + '|1|ctkk'] && det().calCellOverrides['cal_a|' + D + '|1|ctkk'].cnt === 7));
    await reconcile('after removal', D, 36);
    check('indicator now \u2744 (all 3)', ind(D) === '\u2744', ind(D));
    // re-add a school named Bravo (via data, mirroring Add School's end-append) -> live, no snapshot
    // re-add through the REAL '+ Add School' flow (blank row appended), then give it a count of 1
    const addBtn = [...pl().querySelectorAll('button')].find(b => b.textContent.trim() === '+ Add School');
    $(addBtn).trigger('click'); await flush(700);
    // the new blank row is the last Site Breakdown row; set its Coaches count to 1 (a blank-name row still counts)
    const sbTbl2 = [...pl().querySelectorAll('table')].find(t => [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del') && t.rows[0] && /School/.test(t.rows[0].textContent));
    const dataRows = [...sbTbl2.tBodies[0].rows].filter(r => [...r.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del'));
    const lastRow = dataRows[dataRows.length - 1];   // the newly added (blank) school row, not the totals row
    // '# of Coaches' is DERIVED (readonly) from '# of Students' / students-per-coach (10): the user enters
    // Students. 10 students -> 1 coach on the re-added row.
    const hdrCells = [...sbTbl2.rows[0].cells].map(cc => cc.textContent.trim());
    const sIdx = hdrCells.findIndex(t => /# of Students/.test(t));
    const stuInp = sIdx >= 0 ? lastRow.cells[sIdx].querySelector('input') : null;
    check('the new row has a # of Students input', !!stuInp, 'hdr=' + JSON.stringify(hdrCells));
    if (stuInp) { $(stuInp).val('10').trigger('input').trigger('change'); await flush(500); }
    await recalc();
    // the re-added school is index 3 and LIVE: 16h x1 = 16 -> 36 + 16 = 52
    check('re-added Bravo is a normal inherited school (live 16h): 36 + 16 = 52', hrs(D) === 52, hrs(D));
    check('it did NOT regain a frozen snapshot', !(mk(D).frozen && mk(D).frozen['3']) && !(mk(D).frozenSnap && mk(D).frozenSnap['3']));
    check('indicator now \u2744 (3) (subset)', ind(D) === '\u2744 (3)', ind(D));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 12. Re-freeze after edits replaces the snapshot (one baseline) ═══ */
  await suite('12. Re-freezing after several edits bakes the current effective schedule into ONE new snapshot and drops the old edits', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D);
    await setOv(D, 0, { cnt: 4, start: '10:00' });   // Alpha 10-15 x4 = 20 ; +30 = 50
    await setOv(D, 2, { end: '13:00' });             // Charlie 09-13 x3 = 12 ; Alpha 20 + Bravo 6 + Charlie 12 + Delta 6 = 44
    check('edited frozen day = 44', hrs(D) === 44, hrs(D));
    await setSH('06:00', '22:00');
    check('upstream change still blocked (44)', hrs(D) === 44, hrs(D));
    // re-freeze Alpha only (off -> on)
    await toggleSchool(D, 0); await toggleSchool(D, 0);
    const a = mk(D).frozenSnap['0'].ctkk;
    check('Alpha re-frozen: its snapshot is now the CURRENT live 06:00-22:00 x2 (its old edit is gone)', a.start === '06:00' && a.end === '22:00' && a.cnt === 2, JSON.stringify(a));
    check('Charlie keeps its edited frozen layer (end 13:00) and its original snapshot', mk(D).frozenSnap['2'].ctkk.start === '09:00' && det().calCellOverrides['cal_a|' + D + '|2|ctkk'].end === '13:00');
    check('exactly one snapshot per school', Object.keys(mk(D).frozenSnap).length === 4);
    const expect = 16 * 2 + 6 * 1 + 4 * 3 + 6 * 1;   // 32 + 6 + 12 + 6 = 56
    check('cell = 56 from the new baselines', hrs(D) === expect, hrs(D));
    await reconcile('after re-freeze', D, expect);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 13. Indicators + timestamps stay in sync with the actual frozen state ═══ */
  await suite('13. Snowflake indicators, counts and timestamps track the real frozen state through every transition', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('no indicator when nothing is frozen', ind(D) === '');
    await freezeSchools(D, [0]);
    check('\u2744 (1) after one school', ind(D) === '\u2744 (1)', ind(D));
    let m = await openMenu(D); check('menu (1) + one vivid snowflake', fzCnt(m) === '(1)' && snows(m).filter(s => s.getAttribute('data-frozen') === '1').length === 1); await closeMenu(m);
    await freezeAll(D);
    check('\u2744 after all', ind(D) === '\u2744', ind(D));
    m = await openMenu(D); check('menu (4), day-level timestamp shown, no per-school timestamps', fzCnt(m) === '(4)' && !!m.querySelector('.cal-ctx-freeze-meta') && m.querySelectorAll('.sch-freeze-meta').length === 0); await closeMenu(m);
    await toggleSchool(D, 2);
    check('\u2744 (3) after unfreezing one', ind(D) === '\u2744 (3)', ind(D));
    await freezeAll(D); await freezeAll(D);   // all -> clear
    check('no indicator after clearing all', ind(D) === '', ind(D));
    m = await openMenu(D); check('menu count empty, no timestamps, no vivid snowflakes', fzCnt(m) === '' && !m.querySelector('.cal-ctx-freeze-meta') && snows(m).every(s => s.getAttribute('data-frozen') === '0')); await closeMenu(m);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 14. Combined vs Individual share one freeze state ═══ */
  await suite('14. Freezing in the Combined Calendar and in the Individual Calendar act on the same Date+School state and reconcile in both views', async () => {
    await importGuide(dom, c, fixture({ twoCals: true })); await flush(800);
    const cv = () => [...secId().querySelectorAll('input[type=checkbox]')].find(cb => { const l = cb.closest('label'); return l && /Combined View/.test(l.textContent); });
    check('two calendars: Combined toggle available', !!cv());
    // freeze cal_a Alpha in the INDIVIDUAL view
    await freezeSchools(D, [0]);
    check('individual: cal_a D indicator \u2744 (1)', ind(D) === '\u2744 (1)', ind(D));
    // switch to Combined and freeze everything via the combined menu
    cv().checked = true; $(cv()).trigger('change'); await flush(900);
    const comb = secId().querySelector('.cal-combined-day[data-date-key="' + D + '"]');
    check('combined cell renders', !!comb);
    const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
    fire(comb, 'contextmenu', {}); await flush(300);
    let m = d.querySelector('.cal-ctx-menu');
    check('combined menu shows the freeze already applied to Alpha (count 1)', fzCnt(m) === '(1)', fzCnt(m));
    $(fzRow(m)).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(700);
    check('combined global freeze froze cal_a (4) AND cal_b (1)', mk(D).frozen && Object.keys(mk(D).frozen).length === 4 && mk(D, 'cal_b') && mk(D, 'cal_b').frozen['0']);
    // upstream change on both calendars
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:00', '22:00'); det().staffingHoursSlots.c1.ctkk = mkTimes('06:00', '22:00'); await recalc();
    const combSum = () => parseFloat((secId().querySelector('.cal-combined-day[data-date-key="' + D + '"] .cal-combined-sum') || {}).textContent);
    check('combined sum stays at the snapshots (42 + 12 = 54) after the upstream change', combSum() === 54, combSum());
    // back to Individual: both calendars frozen and protected
    cv().checked = false; $(cv()).trigger('change'); await flush(900);
    check('individual cal_a D = 42 (frozen) and cal_b D = 12 (frozen)', hrs(D) === 42 && hrs(D, '[data-cal-id="cal_b"]') === 12, hrs(D) + '/' + hrs(D, '[data-cal-id="cal_b"]'));
    check('individual indicators: cal_a \u2744, cal_b \u2744', ind(D) === '\u2744' && (cell(D, '[data-cal-id="cal_b"]').querySelector('.cal-freeze-ind') || {}).textContent === '\u2744');
    await reconcile('individual cal_a reconcile', D, 42);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 15. Import/export + collapse/expand keep the frozen layer ═══ */
  await suite('15. Export/import and calendar collapse/expand preserve snapshots, edits, meta; reload never recaptures from upstream', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D);
    await setOv(D, 0, { cnt: 5 });   // 6x(5+1+3+1) = 60
    await setSH('06:00', '22:00');
    check('before export: 60', hrs(D) === 60, hrs(D));
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    const exp = JSON.parse(captured).data;
    check('export carries frozen/frozenSnap/frozenMeta AND the frozen-layer override', exp.calMarkers['cal_a|' + D].frozenSnap['0'].ctkk.start === '09:00' && exp.calMarkers['cal_a|' + D].frozenMeta['0'].by === 'QA' && exp.calCellOverrides['cal_a|' + D + '|0|ctkk'].cnt === 5);
    await importGuide(dom, c, captured); await flush(700);
    check('after re-import the frozen day is still 60 (snapshot + edit), not the live 112', hrs(D) === 60, hrs(D));
    await reconcile('after re-import', D, 60);
    // collapse + expand the calendar area
    const calHd = secId().querySelector('.pg-sec-toggle'); if (calHd) { $(calHd).trigger('click'); await flush(300); $(calHd).trigger('click'); await flush(400); }
    check('after collapse/expand: still 60', hrs(D) === 60, hrs(D));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 16. Rapid sequences: no stale values, duplicates, or fallback ═══ */
  await suite('16. Rapid sequences (freeze→edit→edit→unfreeze, subset→global, freeze→remove school) leave no stale state', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(D); await setOv(D, 0, { cnt: 3 }); await setOv(D, 0, { cnt: 6 }); await freezeAll(D);
    check('freeze→edit→edit→unfreeze: back to live 42 with no override left', hrs(D) === 42 && !(det().calCellOverrides && det().calCellOverrides['cal_a|' + D + '|0|ctkk']) && !mk(D), hrs(D));
    await freezeSchools(D, [1, 2]); await freezeAll(D);
    check('subset→global: all four frozen, single snapshot each', Object.keys(mk(D).frozen).length === 4 && Object.keys(mk(D).frozenSnap).length === 4);
    await setSH('06:00', '22:00');
    check('cell 42 protected', hrs(D) === 42, hrs(D));
    await freezeAll(D);
    check('global on an all-frozen day clears', !mk(D) && hrs(D) === 112, hrs(D));
    await freezeAll(D); await freezeAll(D2);
    await setSB(2, 9);   // Charlie 3->9 live
    check('two frozen days both protected after an SB change', hrs(D) === 112 && hrs(D2) === 112, hrs(D) + '/' + hrs(D2));
    check('live D3 moved: 16x(2+1+9+1) = 208', hrs(D3) === 208, hrs(D3));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
