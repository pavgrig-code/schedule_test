// t138_freeze_snapshot.js — Freeze Schedule SNAPSHOT + BASELINE behaviour (spec) and the calendar-cell
// indicator. A frozen (calendar date + school) captures its effective schedule {start,end,cnt per role}
// and resolves from that snapshot instead of the live inherited schedule: upstream changes (Staffing
// Hours, Site Breakdown counts, ...) must NOT penetrate it; calendar overrides sit ON TOP of it; unfreeze
// discards the snapshot + those overrides and resumes normal inheritance immediately; re-freeze replaces
// the snapshot; a school removed from the Site Breakdown takes its frozen state with it (and the
// remaining schools re-index); multi-day freezes capture each date independently; timestamps + user are
// recorded and shown (one day-level line when uniform, per-school lines when they differ). Cell: '❄'
// when every school is frozen, '❄ (n)' for a subset, nothing when none — live-updated.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(opts) {
  opts = opts || {};
  const rows = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }];
  if (opts.three) rows.push({ school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 3, ctkk: 10 });
  const data = {
    status: 'Draft', calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: rows.slice() }, siteRows: rows.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
  };
  if (opts.markers) data.calMarkers = opts.markers;
  if (opts.ov) data.calCellOverrides = opts.ov;
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
  W._pgCurrentUser = 'Paul';
  const pl = () => d.getElementById('planning-panel');
  const cell = dk => pl().querySelector('.cal-day-cell[data-date-key="' + dk + '"]:not(.cal-combined-carrier)');
  const hrs = dk => { const h = cell(dk) && cell(dk).querySelector('.cal-hours'); return h ? parseFloat(h.textContent) : NaN; };
  const ind = dk => { const i = cell(dk) && cell(dk).querySelector('.cal-freeze-ind'); return i ? i.textContent.trim() : ''; };
  const det = () => W._pgGuideDetails()['pg-001'];
  const mk = (dk) => (det().calMarkers || {})['cal_a|' + dk];
  const openMenu = async dk => { $(cell(dk)).trigger('contextmenu'); await flush(250); return d.querySelector('.cal-ctx-menu'); };
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const applyBtn = m => leaves(m).find(e => e.textContent.trim() === 'Apply');
  const fzRow = m => m.querySelector('.cal-ctx-freeze');
  const snows = m => [...m.querySelectorAll('.sch-freeze')];
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(600); const cs = d.getElementById('cal-section-pg-001'); if (cs && cs._updateHours) cs._updateHours(); await flush(400); };
  const freezeAll = async (dk) => { const m = await openMenu(dk); $(fzRow(m)).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500); };

  /* ═══ 1. Freeze captures a snapshot (start/end/cnt per role) + timestamp/user; Extra Shifts excluded ═══ */
  await suite('Freezing captures the effective schedule snapshot per school (Staffing Hours + Site Breakdown count) with timestamp and user', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('baseline: 7/08 shows 18 hrs (6h x (2+1) coaches)', hrs('2026-07-08') === 18, hrs('2026-07-08'));
    await freezeAll('2026-07-08');
    const m = mk('2026-07-08');
    check('both schools are frozen', !!m && !!m.frozen && m.frozen['0'] && m.frozen['1']);
    check('school 0 snapshot = 09:00-15:00 x 2', !!m.frozenSnap && m.frozenSnap['0'].ctkk.start === '09:00' && m.frozenSnap['0'].ctkk.end === '15:00' && m.frozenSnap['0'].ctkk.cnt === 2, JSON.stringify(m.frozenSnap && m.frozenSnap['0']));
    check('school 1 snapshot = 09:00-15:00 x 1', m.frozenSnap['1'].ctkk.cnt === 1 && m.frozenSnap['1'].ctkk.start === '09:00');
    check('a freeze timestamp + user are recorded per school', !!m.frozenMeta && !!m.frozenMeta['0'].at && m.frozenMeta['0'].by === 'Paul', JSON.stringify(m.frozenMeta && m.frozenMeta['0']));
    check('the snapshot carries no Extra Shifts / Allocated Hours fields (only start/end/cnt per role)', Object.keys(m.frozenSnap['0'].ctkk).sort().join(',') === 'cnt,end,start');
    check('the frozen day still reads its snapshot total (18 hrs)', hrs('2026-07-08') === 18, hrs('2026-07-08'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Upstream changes do NOT penetrate the frozen baseline; unfrozen days still update ═══ */
  await suite('After freezing, Staffing Hours + Site Breakdown changes do not alter the frozen day, while an unfrozen day updates', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll('2026-07-08');
    // upstream: Staffing Hours 09-15 -> 10-16 (still 6h) and school 0 count 2 -> 4
    det().staffingHoursSlots.c0.ctkk = mkTimes('10:00', '16:00');
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 4; det().siteRows[0].coaches_ctkk = 4;
    await recalc();
    check('the FROZEN day keeps its snapshot total (18 hrs)', hrs('2026-07-08') === 18, hrs('2026-07-08'));
    check('an UNFROZEN day recalculates from the new upstream (6h x (4+1) = 30)', hrs('2026-07-09') === 30, hrs('2026-07-09'));
    // the snapshot itself is untouched by the upstream edit
    check('the stored snapshot is unchanged (still 09:00-15:00 x 2)', mk('2026-07-08').frozenSnap['0'].ctkk.start === '09:00' && mk('2026-07-08').frozenSnap['0'].ctkk.cnt === 2);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Calendar overrides apply ON TOP of the snapshot and also survive upstream changes ═══ */
  await suite('A calendar override on a frozen school applies on top of the snapshot (Frozen Snapshot -> Overrides) and survives upstream edits', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll('2026-07-08');
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|2026-07-08|1|ctkk'] = { cnt: 5 };
    await recalc();
    check('override cnt=5 on school 1 -> 6h x (2 + 5) = 42 hrs', hrs('2026-07-08') === 42, hrs('2026-07-08'));
    det().siteRowsByCal.cal_a[1].coaches_ctkk = 9; det().siteRows[1].coaches_ctkk = 9;
    await recalc();
    check('an upstream count change still cannot penetrate (still 42)', hrs('2026-07-08') === 42, hrs('2026-07-08'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Unfreeze discards the snapshot AND its overrides, then recalculates immediately ═══ */
  await suite('Removing Freeze Schedule deletes the snapshot and its overrides and immediately resumes normal inheritance', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll('2026-07-08');
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|2026-07-08|1|ctkk'] = { cnt: 5 };
    det().staffingHoursSlots.c0.ctkk = mkTimes('10:00', '16:00');
    det().siteRowsByCal.cal_a[1].coaches_ctkk = 9; det().siteRows[1].coaches_ctkk = 9;
    await recalc();
    check('while frozen (with override): 42 hrs', hrs('2026-07-08') === 42, hrs('2026-07-08'));
    await freezeAll('2026-07-08');   // all frozen -> this click clears all
    await recalc();
    check('the snapshot and marker are gone', !mk('2026-07-08') || (!mk('2026-07-08').frozen && !mk('2026-07-08').frozenSnap));
    check('the override created on the frozen baseline is discarded', !(det().calCellOverrides && det().calCellOverrides['cal_a|2026-07-08|1|ctkk']));
    check('the day immediately recalculates from the CURRENT upstream (6h x (2 + 9) = 66)', hrs('2026-07-08') === 66, hrs('2026-07-08'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Re-freezing replaces the snapshot; timestamps: uniform day-level vs per-school ═══ */
  await suite('Re-freezing a frozen school replaces its snapshot + timestamp; one day-level timestamp when uniform, per-school when they differ', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll('2026-07-08');
    let m = await openMenu('2026-07-08');
    const dayMeta = m.querySelector('.cal-ctx-freeze-meta');
    check('a single day-level timestamp is shown when the same action froze every school', !!dayMeta && /^Latest: \w{3}, \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM) by Paul$/.test(dayMeta.textContent.trim()), dayMeta && dayMeta.textContent);
    check('per-school timestamps are NOT repeated when uniform', m.querySelectorAll('.sch-freeze-meta').length === 0);
    $(leaves(m).find(e => e.textContent.trim() === 'Close')).trigger('click'); await flush(100);
    // upstream change, then re-freeze ONLY school 0 two minutes later
    det().staffingHoursSlots.c0.ctkk = mkTimes('10:00', '16:00'); await recalc();
    const RealDate = W.Date; const base = Date.now() + 2 * 60 * 1000;
    W.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base); } static now() { return base; } };
    m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(50); $(snows(m)[0]).trigger('click'); await flush(50);   // off -> on = explicit re-freeze
    $(applyBtn(m)).trigger('click'); await flush(500);
    W.Date = RealDate;
    const mm = mk('2026-07-08');
    check('school 0 got a NEW snapshot of the schedule effective at re-freeze (10:00-16:00)', mm.frozenSnap['0'].ctkk.start === '10:00' && mm.frozenSnap['0'].ctkk.end === '16:00', JSON.stringify(mm.frozenSnap['0']));
    check('school 1 keeps its ORIGINAL snapshot (09:00-15:00)', mm.frozenSnap['1'].ctkk.start === '09:00');
    check('school 0 has the newer timestamp', mm.frozenMeta['0'].at > mm.frozenMeta['1'].at);
    check('only one active frozen baseline per school (no duplicates)', Object.keys(mm.frozenSnap).length === 2);
    m = await openMenu('2026-07-08');
    check('timestamps now differ -> no day-level line, per-school lines shown next to the snowflakes', !m.querySelector('.cal-ctx-freeze-meta') && m.querySelectorAll('.sch-freeze-meta').length === 2, m.querySelectorAll('.sch-freeze-meta').length);
    check('a per-school line reads like "Latest: Sep 12, 2:14 PM"', [...m.querySelectorAll('.sch-freeze-meta')].every(x => /^Latest: \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/.test(x.textContent.trim())), m.querySelector('.sch-freeze-meta') && m.querySelector('.sch-freeze-meta').textContent);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. School removed from the Site Breakdown: frozen state dropped, remaining schools re-indexed ═══ */
  await suite('Removing a school row from the Site Breakdown drops its frozen state/snapshot/overrides and re-indexes the others', async () => {
    const markers = { 'cal_a|2026-07-08': { schools: {}, frozen: { '0': true, '1': true, '2': true },
      frozenSnap: { '0': { ctkk: { start: '09:00', end: '15:00', cnt: 2 } }, '1': { ctkk: { start: '09:00', end: '15:00', cnt: 1 } }, '2': { ctkk: { start: '09:00', end: '15:00', cnt: 3 } } },
      frozenMeta: { '0': { at: '2026-09-12T10:00:00Z', by: 'U' }, '1': { at: '2026-09-12T10:00:00Z', by: 'U' }, '2': { at: '2026-09-12T10:00:00Z', by: 'U' } } } };
    const ov = { 'cal_a|2026-07-08|1|ctkk': { cnt: 7 }, 'cal_a|2026-07-08|2|ctkk': { cnt: 8 } };
    await importGuide(dom, c, fixture({ three: true, markers: markers, ov: ov })); await flush(800);
    const sbTbl = [...pl().querySelectorAll('table')].find(t => [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del') && t.rows[0] && /School/.test(t.rows[0].textContent));
    const delBtns = [...sbTbl.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Del');
    check('three school rows with Del buttons', delBtns.length === 3, delBtns.length);
    $(delBtns[1]).trigger('click'); await flush(700);   // remove Adams (index 1)
    const m = mk('2026-07-08');
    check('the removed school\'s frozen flag is gone and the third school re-indexed to 1', !!m && !!m.frozen && m.frozen['0'] && m.frozen['1'] && !m.frozen['2'], JSON.stringify(m && m.frozen));
    check('its snapshot is dropped and Roosevelt\'s (cnt 3) now sits at index 1', m.frozenSnap['1'].ctkk.cnt === 3 && !m.frozenSnap['2'], JSON.stringify(m.frozenSnap));
    const ovs = det().calCellOverrides || {};
    check('its override (cnt 7) is deleted and Roosevelt\'s (cnt 8) re-indexed to |1|', !ovs['cal_a|2026-07-08|2|ctkk'] && ovs['cal_a|2026-07-08|1|ctkk'] && ovs['cal_a|2026-07-08|1|ctkk'].cnt === 8, JSON.stringify(ovs));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Multiple selected days: each Date + School gets its own snapshot of THAT date's schedule ═══ */
  await suite('Freezing several selected days snapshots each Date + School independently with its own effective schedule', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    // give 7/09 a different effective schedule via a per-day calendar override before freezing
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|2026-07-09|0|ctkk'] = { start: '08:00', end: '12:00' };
    await recalc();
    const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
    fire(cell('2026-07-08'), 'mousedown', { shiftKey: true }); await flush(40);
    fire(cell('2026-07-09'), 'mousedown', { shiftKey: true }); await flush(80);
    fire(cell('2026-07-08'), 'contextmenu', {}); await flush(250);
    const mmenu = () => [...d.body.children].filter(el => el.classList && el.classList.contains('cal-sd-multi-menu') && el.style.display !== 'none').pop();
    $(fzRow(mmenu())).trigger('click'); await flush(80);
    $([...mmenu().querySelectorAll('button')].find(b => b.textContent.trim() === 'Apply')).trigger('click'); await flush(700);
    const a = mk('2026-07-08'), b = mk('2026-07-09');
    check('both dates are frozen for both schools', a && a.frozen['0'] && a.frozen['1'] && b && b.frozen['0'] && b.frozen['1']);
    check('7/08 school 0 snapshot is its own schedule (09:00-15:00)', a.frozenSnap['0'].ctkk.start === '09:00' && a.frozenSnap['0'].ctkk.end === '15:00');
    check('7/09 school 0 snapshot captured THAT date\'s effective schedule (08:00-12:00, the override baked in)', b.frozenSnap['0'].ctkk.start === '08:00' && b.frozenSnap['0'].ctkk.end === '12:00', JSON.stringify(b.frozenSnap['0']));
    check('the pre-existing override was folded into the baseline (removed as a separate override)', !(det().calCellOverrides && det().calCellOverrides['cal_a|2026-07-09|0|ctkk']));
    check('each snapshot carries its own timestamp/user', !!a.frozenMeta['0'].at && !!b.frozenMeta['0'].at && a.frozenMeta['0'].by === 'Paul');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Cell indicator: '❄' for all, '❄ (n)' for a subset, none when unfrozen; live-updated ═══ */
  await suite('The calendar cell shows a snowflake for a fully frozen day and "❄ (n)" for a subset, updated live', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    check('no indicator before any freeze', ind('2026-07-08') === '');
    let m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    check('one of three frozen -> "❄ (1)"', ind('2026-07-08') === '\u2744 (1)', ind('2026-07-08'));
    m = await openMenu('2026-07-08');
    $(snows(m)[1]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    check('two of three -> "❄ (2)"', ind('2026-07-08') === '\u2744 (2)', ind('2026-07-08'));
    await freezeAll('2026-07-08');
    check('all schools -> a bare "❄"', ind('2026-07-08') === '\u2744', ind('2026-07-08'));
    const kids = [...cell('2026-07-08').children];
    const dI = kids.findIndex(x => x.classList.contains('cal-date-label')), iI = kids.findIndex(x => x.classList.contains('cal-freeze-ind')), hI = kids.findIndex(x => x.classList.contains('cal-hours'));
    check('the indicator sits right next to the date and before the hours (compact, non-interfering)', iI === dI + 1 && iI < hI, dI + '/' + iI + '/' + hI);
    check('the hours are unaffected by the indicator', hrs('2026-07-08') === 36, hrs('2026-07-08'));
    await freezeAll('2026-07-08');   // all frozen -> clears
    check('no indicator once every school is unfrozen', ind('2026-07-08') === '', ind('2026-07-08'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. The snapshot survives export/import (persisted with the guide) ═══ */
  await suite('The frozen snapshot, meta and baseline behaviour survive an export/import round-trip', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll('2026-07-08');
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    const exp = captured && JSON.parse(captured).data.calMarkers['cal_a|2026-07-08'];
    check('the export carries frozen + frozenSnap + frozenMeta', !!exp && !!exp.frozen && !!exp.frozenSnap && !!exp.frozenMeta, JSON.stringify(exp));
    await importGuide(dom, c, captured); await flush(600);
    det().staffingHoursSlots.c0.ctkk = mkTimes('10:00', '17:00'); await recalc();   // 7h upstream
    check('after re-import the frozen day still resolves from its snapshot (18 hrs, not the new 7h x 3 = 21)', hrs('2026-07-08') === 18, hrs('2026-07-08'));
    check('an unfrozen day picks up the new upstream (21)', hrs('2026-07-09') === 21, hrs('2026-07-09'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  // ── popup helpers ──
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const popRows = pop => [...pop.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length >= 5 && !/^Total/.test(tr.textContent.trim())).map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim().replace('\u00d7', '')));
  const popGrand = pop => { const t = [...pop.querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total \(\d+ schools?\)/, '').trim()) : NaN; };
  const rowSum = rows => rows.reduce((a, r) => a + (parseFloat(r[r.length - 1]) || 0), 0);
  const closePop = async () => { $(d.body).trigger('click'); await flush(200); };

  /* ═══ 10. CRITICAL: the hover + pinned popups use the frozen snapshot and reconcile with the cell ═══ */
  await suite('Whole-day freeze: after a big Staffing Hours change, the hover AND pinned popups show the frozen times/counts and reconcile exactly with the cell', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    check('baseline cell = 36 (6h x 6 coaches)', hrs('2026-07-08') === 36, hrs('2026-07-08'));
    await freezeAll('2026-07-08');
    const frozen = hrs('2026-07-08');
    // upstream: 06:30-23:30 = 17h (the reported scenario)
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:30', '23:30'); await recalc();
    check('the frozen cell keeps the snapshot total', hrs('2026-07-08') === frozen && frozen === 36, hrs('2026-07-08'));
    check('an unfrozen day moved to the new upstream (17h x 6 = 102)', hrs('2026-07-09') === 102, hrs('2026-07-09'));
    // HOVER popup
    $(cell('2026-07-08')).trigger('mouseenter'); await flush(500);
    let pop = popup();
    check('the hover popup opens', !!pop);
    let rows = popRows(pop);
    check('hover rows show the FROZEN times (9:00am-3:00pm, 6 hrs), not the live 17h', rows.length > 0 && rows.every(r => r[1] === '9:00am' && r[2] === '3:00pm' && r[3] === '6'), JSON.stringify(rows));
    check('hover grand total reconciles exactly with the cell (36)', popGrand(pop) === hrs('2026-07-08'), popGrand(pop) + ' vs ' + hrs('2026-07-08'));
    check('hover row subtotals sum to the grand total', Math.abs(rowSum(rows) - popGrand(pop)) < 0.01, rowSum(rows));
    $(cell('2026-07-08')).trigger('mouseleave'); await flush(400);
    // PINNED (regular) popup
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    pop = popup(); rows = popRows(pop);
    check('the pinned popup opens', !!pop);
    check('pinned rows show the FROZEN times and 6 hrs', rows.length > 0 && rows.every(r => r[1] === '9:00am' && r[2] === '3:00pm' && r[3] === '6'), JSON.stringify(rows));
    check('pinned grand total reconciles exactly with the cell (36)', popGrand(pop) === hrs('2026-07-08'), popGrand(pop));
    check('pinned row subtotals sum to the grand total', Math.abs(rowSum(rows) - popGrand(pop)) < 0.01);
    check('the popup never shows the live 17h total (102)', popGrand(pop) !== 102);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 11. Subset freeze: frozen schools use snapshots, the rest use live, and the popup combines them ═══ */
  await suite('Subset freeze: the popup shows the frozen school at its snapshot and the others live, combined into the cell total', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    let m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);   // freeze Lincoln only (2 coaches)
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:30', '23:30'); await recalc();
    const expect = 6 * 2 + 17 * (1 + 3);   // frozen 12 + live 68 = 80
    check('the cell = frozen school (6h x 2) + live schools (17h x 4) = 80', hrs('2026-07-08') === expect, hrs('2026-07-08'));
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    const pop = popup(); const rows = popRows(pop);
    check('the popup splits into a frozen group (9:00am-3:00pm 6h x2 = 12) and a live group (6:30am-11:30pm 17h x4 = 68)', rows.some(r => r[1] === '9:00am' && r[3] === '6' && r[4] === '2' && parseFloat(r[5]) === 12) && rows.some(r => r[1] === '6:30am' && r[3] === '17' && r[4] === '4' && parseFloat(r[5]) === 68), JSON.stringify(rows));
    check('the grand total reconciles with the cell (80)', popGrand(pop) === hrs('2026-07-08'), popGrand(pop));
    check('the row subtotals sum to the grand total', Math.abs(rowSum(rows) - popGrand(pop)) < 0.01);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 12. After unfreeze the popups immediately follow the live schedule again (no reopen needed) ═══ */
  await suite('After unfreezing, the popup immediately reflects the live schedule and still reconciles with the cell', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    await freezeAll('2026-07-08');
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:30', '23:30'); await recalc();
    check('while frozen the cell is 36', hrs('2026-07-08') === 36);
    await freezeAll('2026-07-08');   // all frozen -> clears all
    await recalc();
    check('after unfreeze the cell follows live (17h x 6 = 102)', hrs('2026-07-08') === 102, hrs('2026-07-08'));
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    const pop = popup(); const rows = popRows(pop);
    check('the popup now shows the live 6:30am-11:30pm 17h rows', rows.length > 0 && rows.every(r => r[1] === '6:30am' && r[3] === '17'), JSON.stringify(rows));
    check('and its grand total reconciles with the cell (102)', popGrand(pop) === hrs('2026-07-08'), popGrand(pop));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  // ── badge helpers ──
  const badges = pop => [...pop.querySelectorAll('.cal-tip-freeze')].map(b => ({ where: b.closest('.cal-tip-calname') ? 'CAL' : 'SCHOOL', prev: (b.previousSibling && b.previousSibling.textContent || '').trim(), text: b.textContent.replace(/\s+/g, ' ').trim(), ico: b.querySelector('.cal-tip-freeze-ico'), meta: b.querySelector('.cal-tip-freeze-meta') }));
  const isBright = el => el && (/13,\s*110,\s*253/.test(el.style.color) || /0d6efd/i.test(el.style.color));

  /* ═══ 13. Popup freeze status: whole-day uniform -> one bright calendar-level badge after the program name ═══ */
  await suite('Whole-day uniform freeze: the popups show ONE bright snowflake + subtle latest time/user right after the Calendar name, none per school', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    await freezeAll('2026-07-08');
    // hover
    $(cell('2026-07-08')).trigger('mouseenter'); await flush(500);
    let pop = popup(); let b = badges(pop);
    // (superseded) the calendar-level freeze now renders as its OWN line under the name (suite 23); here only verify no per-school badges when uniform
    check('hover: no per-school badges when every school shares one freeze action', b.length === 0, JSON.stringify(b.map(x => x.where)));
    const _fl = popup().querySelector('.cal-tip-freeze-line');
    check('hover: the program-level line reads "❄ Latest: <Dow>, <Mon> <d>, <h:mm AM/PM> by Paul"', !!_fl && /^\u2744\s*Latest: \w{3}, \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM) by Paul$/.test(_fl.textContent.replace(/\s+/g, ' ').trim()), _fl && _fl.textContent);
    check('hover: the snowflake is bright (#0d6efd) and bold', _fl && isBright(_fl.querySelector('.cal-tip-freeze-ico')) && _fl.querySelector('.cal-tip-freeze-ico').style.fontWeight === '700');
    check('hover: the time/user text is subtle grey', _fl && /8a94a0|138,\s*148,\s*160/.test(_fl.querySelector('.cal-tip-freeze-meta').style.color));
    $(cell('2026-07-08')).trigger('mouseleave'); await flush(400);
    // pinned
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    pop = popup(); b = badges(pop);
    check('pinned: the program-level line is present and there are no per-school badges', !!popup().querySelector('.cal-tip-freeze-line') && b.length === 0, JSON.stringify(b.map(x => x.where + ':' + x.prev)));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 14. Subset freeze: no calendar-level badge; a bright badge after EACH frozen school only ═══ */
  await suite('Subset freeze: no calendar-level badge; each frozen school gets its own bright snowflake + latest time/user, unfrozen schools get nothing', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    let m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(40); $(snows(m)[2]).trigger('click'); await flush(40);   // Lincoln + Roosevelt
    $(applyBtn(m)).trigger('click'); await flush(500);
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    const pop = popup(); const b = badges(pop);
    check('no badge inside the name row (the program line lives below the name)', !b.some(x => x.where === 'CAL'));
    check('exactly two school-level badges (the two frozen schools)', b.filter(x => x.where === 'SCHOOL').length === 2, JSON.stringify(b.map(x => x.prev)));
    check('badges follow Lincoln and Roosevelt, and NOT Adams', b.some(x => /Lincoln/.test(x.prev)) && b.some(x => /Roosevelt/.test(x.prev)) && !b.some(x => /Adams/.test(x.prev)), JSON.stringify(b.map(x => x.prev)));
    check('each school badge reads "❄ Latest: ... by Paul" with a bright snowflake', b.every(x => /^\u2744\s*Latest: .* by Paul$/.test(x.text) && isBright(x.ico)), b[0] && b[0].text);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 15. All frozen but at DIFFERENT times -> per-school badges (no calendar-level) ═══ */
  await suite('All schools frozen at different times: no calendar-level badge, per-school badges with each school\'s own time', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    await freezeAll('2026-07-08');
    // re-freeze Lincoln two minutes later so its time differs
    const RealDate = W.Date; const base = Date.now() + 2 * 60 * 1000;
    W.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base); } static now() { return base; } };
    let m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(40); $(snows(m)[0]).trigger('click'); await flush(40);
    $(applyBtn(m)).trigger('click'); await flush(500);
    W.Date = RealDate;
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    const pop = popup(); const b = badges(pop);
    check('differing times -> no badge inside the name row (the program line below carries the latest)', !b.some(x => x.where === 'CAL'), JSON.stringify(b.map(x => x.where)));
    check('every frozen school carries its own badge (3)', b.filter(x => x.where === 'SCHOOL').length === 3, b.length);
    const times = b.map(x => x.text.replace(/^\u2744\s*Latest: /, '').replace(/ by .*$/, ''));
    check('Lincoln shows a later time than the other two', (function () { const li = b.findIndex(x => /Lincoln/.test(x.prev)); const oi = b.findIndex(x => /Adams/.test(x.prev)); return li >= 0 && oi >= 0 && times[li] !== times[oi]; })(), JSON.stringify(times));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 16. The context-menu snowflake icons are bright/vivid ═══ */
  await suite('The right-click / "..." menu Freeze Schedule icon and the active per-school snowflakes are bright and vivid', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    const m = await openMenu('2026-07-08');
    const ico = m.querySelector('.cal-ctx-freeze-icon');
    check('the Freeze Schedule row icon is bright (#0d6efd) and bold', isBright(ico) && ico.style.fontWeight === '700', ico && (ico.style.color + '/' + ico.style.fontWeight));
    $(snows(m)[0]).trigger('click'); await flush(40);
    check('an active per-school snowflake is bright and bold', isBright(snows(m)[0]) && snows(m)[0].style.fontWeight === '700', snows(m)[0].style.color);
    check('an inactive per-school snowflake stays muted', !isBright(snows(m)[1]), snows(m)[1].style.color);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 17. Cell snowflake size + no stale badges after unfreeze + legacy flag-only never shows as frozen ═══ */
  await suite('Cell snowflake is 11px; unfreezing removes a school\'s badge from hover + pinned popups at once; a flag without a snapshot never displays as frozen', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    let m = await openMenu('2026-07-08');
    $(snows(m)[0]).trigger('click'); $(snows(m)[1]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    const ico = cell('2026-07-08').querySelector('.cal-freeze-ind');
    check('the Calendar Day cell snowflake uses font-size 11px', ico && ico.style.fontSize === '11px', ico && ico.style.fontSize);
    // both popups show Lincoln + Adams badges
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    let b = badges(popup());
    check('pinned: badges on Lincoln and Adams', b.length === 2 && b.some(x => /Lincoln/.test(x.prev)) && b.some(x => /Adams/.test(x.prev)), JSON.stringify(b.map(x => x.prev)));
    await closePop();
    // unfreeze Adams
    m = await openMenu('2026-07-08'); $(snows(m)[1]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    check('the marker no longer carries Adams (flag, snapshot, meta all gone)', (function () { const mk = det().calMarkers['cal_a|2026-07-08']; return mk && !mk.frozen['1'] && !(mk.frozenSnap && mk.frozenSnap['1']) && !(mk.frozenMeta && mk.frozenMeta['1']); })());
    $(cell('2026-07-08')).trigger('mouseenter'); await flush(500);
    b = badges(popup());
    check('HOVER popup: Adams\' snowflake/timestamp are gone immediately; only Lincoln remains', b.length === 1 && /Lincoln/.test(b[0].prev), JSON.stringify(b.map(x => x.prev)));
    $(cell('2026-07-08')).trigger('mouseleave'); await flush(300);
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    b = badges(popup());
    check('PINNED popup: Adams\' snowflake/timestamp are gone; only Lincoln remains', b.length === 1 && /Lincoln/.test(b[0].prev), JSON.stringify(b.map(x => x.prev)));
    await closePop();
    check('cell indicator moved to \u2744 (1)', ind('2026-07-08') === '\u2744 (1)', ind('2026-07-08'));
    // LEGACY: a frozen flag with NO snapshot must never display as frozen (no active baseline)
    det().calMarkers['cal_a|2026-07-09'] = { schools: {}, frozen: { '0': true, '1': true }, frozenMeta: { '0': { at: '2026-09-01T10:00:00Z', by: 'Old' } } };
    await recalc();
    check('legacy flag-only day: no cell snowflake', ind('2026-07-09') === '', ind('2026-07-09'));
    $(cell('2026-07-09')).trigger('click'); await flush(500);
    check('legacy flag-only day: no popup badges', badges(popup()).length === 0);
    await closePop();
    m = await openMenu('2026-07-09');
    const fzCntL = (fzRow(m).querySelector('.cal-ctx-freeze-cnt').textContent || '').trim();
    check('legacy flag-only day: menu shows no count and muted snowflakes', fzCntL === '' && snows(m).every(x => x.getAttribute('data-frozen') === '0'), fzCntL);
    $(snows(m)[2]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);   // freeze Roosevelt properly
    const mk9 = det().calMarkers['cal_a|2026-07-09'];
    check('an Apply self-heals: the legacy flags are cleaned, only the properly-frozen school remains (with snapshot + meta)', Object.keys(mk9.frozen).join(',') === '2' && Object.keys(mk9.frozenSnap).join(',') === '2' && Object.keys(mk9.frozenMeta).join(',') === '2', JSON.stringify(mk9.frozen) + '/' + JSON.stringify(Object.keys(mk9.frozenSnap || {})));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 18. Schools with no effective contribution are omitted from both popups (cell/popup share one school set) ═══ */
  await suite('A school contributing 0 hours and 0 count (frozen-at-zero, allocation-off, no times) is omitted from the hover + pinned breakdowns; an Extra-Shift-only school stays', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    const D = '2026-07-08';
    const popText = () => (popup() ? popup().textContent : '');
    const popCount = () => { const t = [...popup().querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); const m = t && /Total \((\d+) school/.exec(t.textContent); return m ? parseInt(m[1], 10) : NaN; };
    // (a) freeze the day while Adams is allocation-OFF on Wednesdays -> its snapshot is captured at count 0
    det().staffAlloc = det().staffAlloc || {}; det().staffAlloc['c0'] = det().staffAlloc['c0'] || { on: true, cells: {} }; det().staffAlloc['c0'].on = true; det().staffAlloc['c0'].cells['1|wed'] = false;
    await recalc();
    check('with Adams excluded on Wednesdays the live cell = 6h x (2+3) = 30', hrs(D) === 30, hrs(D));
    await freezeAll(D);
    check('Adams\' frozen snapshot was captured at count 0', mk(D).frozenSnap['1'].ctkk.cnt === 0, JSON.stringify(mk(D).frozenSnap['1']));
    check('the cell is still 30', hrs(D) === 30, hrs(D));
    $(cell(D)).trigger('mouseenter'); await flush(500);
    check('HOVER: Adams (0 count, 0 hours) is omitted entirely', !/Adams/.test(popText()));
    check('HOVER: Lincoln and Roosevelt remain', /Lincoln/.test(popText()) && /Roosevelt/.test(popText()));
    check('HOVER: the Total counts 2 schools and reconciles with the cell (30)', popCount() === 2 && popGrand(popup()) === 30, popCount() + '/' + popGrand(popup()));
    $(cell(D)).trigger('mouseleave'); await flush(300);
    $(cell(D)).trigger('click'); await flush(500);
    check('PINNED: Adams is omitted; 2 schools; total 30 = cell', !/Adams/.test(popText()) && popCount() === 2 && popGrand(popup()) === 30, popCount() + '/' + popGrand(popup()));
    await closePop();
    // (b) an Extra-Shift-only school must STAY: give Adams a saved Extra Shift on this day
    det().calExtraShifts = det().calExtraShifts || {};
    det().calExtraShifts['cal_a|' + D] = [{ school: 'Adams', rows: [{ role: 'ctkk', start: '16:00', end: '18:00', cnt: 1 }] }];
    await recalc();
    check('the cell now includes the Extra Shift (30 + 2 = 32)', hrs(D) === 32, hrs(D));
    $(cell(D)).trigger('click'); await flush(500);
    check('PINNED: Adams reappears because its Extra Shift contributes', /Adams/.test(popText()));
    check('PINNED: the total still reconciles with the cell (32)', popGrand(popup()) === 32, popGrand(popup()));
    await closePop();
    delete det().calExtraShifts['cal_a|' + D]; await recalc();
    // (c) a LIVE day with Adams allocation-off: Adams absent from the popup too (same rule, unfrozen)
    $(cell('2026-07-15')).trigger('click'); await flush(500);   // another Wednesday, not frozen
    check('LIVE Wednesday: allocation-off Adams is absent and the total reconciles', !/Adams/.test(popText()) && popGrand(popup()) === hrs('2026-07-15'), popGrand(popup()) + ' vs ' + hrs('2026-07-15'));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  // ── editor helpers (pinned popup) ──
  const roleTr = () => [...popup().querySelectorAll('tr')].find(t => /Coaches/.test(t.textContent) && t.querySelectorAll('td').length >= 5);
  const tdOf = i => roleTr().querySelectorAll('td')[i];   // 1=start 2=end 4=count
  const typeIn = async (el, val) => { $(el).trigger('click'); await flush(60); const inp = $(el).find('input'); if (!inp.length) return false; inp.trigger('focus'); await flush(10); inp.val(val).trigger('input'); const ev = $.Event('keydown'); ev.key = 'Enter'; inp.trigger(ev); await flush(80); return true; };
  const saveTip = async () => { $(popup().querySelector('.cal-tip-save')).trigger('click'); await flush(600); };
  const pin = async dk => { $(cell(dk)).trigger('click'); await flush(600); };
  const rowTxt = () => [...roleTr().querySelectorAll('td')].map(td => td.textContent.trim().replace('\u00d7', ''));
  const ovKey = (dk, si) => (det().calCellOverrides || {})['cal_a|' + dk + '|' + si + '|ctkk'];

  /* ═══ 19. Frozen snapshot is the baseline for Calendar edits: count + start/end, parenthetical, highlight, reset ═══ */
  await suite('Once frozen, the Count / Start / End editors use the SNAPSHOT as the baseline (parenthetical, override detection, reset), never the inherited value', async () => {
    // single school so the popup takes the aggregate path; inherited 3 -> frozen at 5 -> upstream 8
    const one = (() => { const b = JSON.parse(fixture()); b.data.siteRowsByCal.cal_a = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 3, ctkk: 30 }]; b.data.siteRows = b.data.siteRowsByCal.cal_a.slice(); return JSON.stringify(b); })();
    await importGuide(dom, c, one); await flush(600);
    const D = '2026-07-08';
    check('inherited count 3 -> 18 hrs', hrs(D) === 18, hrs(D));
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 5; det().siteRows[0].coaches_ctkk = 5; await recalc();
    await freezeAll(D);
    check('frozen baseline captured at 5', mk(D).frozenSnap['0'].ctkk.cnt === 5);
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 8; det().siteRows[0].coaches_ctkk = 8;
    det().staffingHoursSlots.c0.ctkk = mkTimes('07:00', '15:00'); await recalc();   // upstream: count 8, start 07:00
    check('the frozen cell ignores the upstream change (30)', hrs(D) === 30, hrs(D));
    await pin(D);
    check('the editor shows the FROZEN baseline: count 5, start 9:00am, no parenthetical', rowTxt()[4] === '5' && rowTxt()[1] === '9:00am' && !/\(/.test(tdOf(4).textContent) && !/\(/.test(tdOf(1).textContent), JSON.stringify(rowTxt()));
    // COUNT: 7 -> shows relative to 5
    check('count edit accepted', await typeIn(tdOf(4), '7')); await saveTip();
    check('the override is stored', !!ovKey(D, 0) && ovKey(D, 0).cnt === 7, JSON.stringify(ovKey(D, 0)));
    await pin(D);
    check('count shows "7 (5)" - relative to the frozen 5, not the inherited 8 or the original 3', /^7\s*\(5\)$/.test(tdOf(4).textContent.replace(/\s+/g, '')) && !/\(8\)|\(3\)/.test(popup().textContent), tdOf(4).textContent);
    check('the override is highlighted', !!tdOf(4).querySelector('.cal-ov-val'));
    // RESET count to 5 (== frozen) -> override removed, no fallback to 8
    check('count reset accepted', await typeIn(tdOf(4), '5')); await saveTip();
    check('setting the count back to the frozen value REMOVES the override', !ovKey(D, 0) || ovKey(D, 0).cnt == null, JSON.stringify(ovKey(D, 0)));
    check('the effective value stays the snapshot (30 hrs), not the inherited 8 (48)', hrs(D) === 30, hrs(D));
    await pin(D);
    check('no parenthetical and no highlight after the reset', rowTxt()[4] === '5' && !/\(/.test(tdOf(4).textContent) && !tdOf(4).querySelector('.cal-ov-val'), tdOf(4).textContent);
    // START: 10:00am -> relative to the frozen 9:00am (upstream is 07:00)
    check('start edit accepted', await typeIn(tdOf(1), '10:00am')); await saveTip();
    await pin(D);
    check('start shows "10:00am (9:00am)" - the frozen start, never the upstream 7:00am', /10:00am\(9:00am\)/.test(tdOf(1).textContent.replace(/\s+/g, '')) && !/7:00am/.test(popup().textContent), tdOf(1).textContent);
    check('start reset accepted', await typeIn(tdOf(1), '9:00am')); await saveTip();
    check('setting the start back to the frozen value removes the override; cell stays 30', (!ovKey(D, 0) || ovKey(D, 0).start == null) && hrs(D) === 30, JSON.stringify(ovKey(D, 0)) + '/' + hrs(D));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 20. Popup label sizes: Program name, Total label, Combined Total label at 14px ═══ */
  await suite('The Calendar/Program name and the Total labels use font-size 14px in the hover + pinned popups (and the Combined popup)', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    $(cell('2026-07-08')).trigger('mouseenter'); await flush(500);
    const nameSpan = () => [...popup().querySelectorAll('.cal-tip-calname span')].find(x => x.style.fontWeight === '700');
    let nm = nameSpan();
    check('HOVER: the Program name is 14px', nm && nm.style.fontSize === '14px', nm && nm.style.fontSize);
    let tot = [...popup().querySelectorAll('td')].find(td => /^Total \(\d+ schools?\)/.test(td.textContent.trim()));
    check('HOVER: the Total row label is 14px', tot && tot.style.fontSize === '14px', tot && tot.style.fontSize);
    $(cell('2026-07-08')).trigger('mouseleave'); await flush(300);
    $(cell('2026-07-08')).trigger('click'); await flush(500);
    nm = nameSpan(); tot = [...popup().querySelectorAll('td')].find(td => /^Total \(\d+ schools?\)/.test(td.textContent.trim()));
    check('PINNED: Program name + Total label are 14px', nm && nm.style.fontSize === '14px' && tot && tot.style.fontSize === '14px');
    check('the weight/alignment are unchanged (bold, right-aligned total)', nm.style.fontWeight === '700' && tot.style.fontWeight === '700');
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 21. Breakdown UX: styling, page scroll under the popup, hover dismissal, context, count-editor fit ═══ */
  await suite('Breakdown popups: 14px blue date + 14px total; wheel over the popup scrolls the page; hover dismisses when its cell leaves view; context preserved; count editor fits with a sticky Save footer', async () => {
    const many = (() => { const b = JSON.parse(fixture()); const rows = []; for (let i = 0; i < 30; i++) rows.push({ school: 'School ' + (i + 1), schoolId: 's' + i, coaches_ctkk: 2, ctkk: 20 }); b.data.siteRowsByCal.cal_a = rows; b.data.siteRows = rows.slice(); return JSON.stringify(b); })();
    await importGuide(dom, c, many); await flush(800);
    const D = '2026-07-08';
    // styling
    await pin(D);
    const dl = popup().querySelector('.cal-tip-date'), gt = popup().querySelector('.cal-tip-grand');
    check('the date label is 14px and rgb(13, 110, 253)', dl && dl.style.fontSize === '14px' && /13,\s*110,\s*253/.test(dl.style.color), dl && (dl.style.fontSize + '/' + dl.style.color));
    check('the hours total value is 14px with its weight unchanged (700)', gt && gt.style.fontSize === '14px' && gt.style.fontWeight === '700', gt && gt.style.fontSize);
    await closePop();
    // context preservation
    const panel = pl(); panel.scrollTop = 300;
    await pin(D); await closePop();
    check('opening + closing the popup leaves the page scroll position unchanged', panel.scrollTop === 300, panel.scrollTop);
    // wheel over the popup scrolls the page (body is overflow:hidden; the panel is the scroller)
    await pin(D);
    Object.defineProperty(panel, 'scrollHeight', { value: 5000, configurable: true }); Object.defineProperty(panel, 'clientHeight', { value: 800, configurable: true });
    panel.getClientRects = () => [{ top: 0, left: 0, width: 1000, height: 800 }];
    panel.scrollTop = 100;
    const wev = new W.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    (popup().querySelector('.cal-tip-titlerow') || popup()).dispatchEvent(wev); await flush(50);
    check('a wheel over the breakdown scrolls the PAGE (100 -> 220) instead of being trapped', panel.scrollTop === 220 && wev.defaultPrevented, panel.scrollTop + '/' + wev.defaultPrevented);
    await closePop();
    // hover dismissal when the source cell leaves the viewport
    await flush(300); $(cell(D)).trigger('mouseenter'); await flush(600);
    check('the hover popup opens', !!popup());
    const orig = cell(D).getBoundingClientRect;
    cell(D).getBoundingClientRect = () => ({ top: -500, bottom: -450, left: 100, right: 200, width: 100, height: 50 });
    await flush(200);
    check('when its cell scrolls fully out of view the hover popup is dismissed', !popup());
    cell(D).getBoundingClientRect = orig; await flush(100);
    // count editor: 30 schools -> tall card must stay within the viewport with Save outside the scroll area
    await pin(D);
    const cntTd = (() => { const tr = [...popup().querySelectorAll('tr')].find(t => /Coaches/.test(t.textContent) && t.querySelectorAll('td').length >= 5); return tr && tr.querySelectorAll('td')[4]; })();
    Object.defineProperty(W, 'innerHeight', { value: 600, configurable: true });
    $(cntTd.querySelector('[style*="cursor"]') || cntTd).trigger('click'); await flush(400);
    const card = [...d.querySelectorAll('.cal-day-cnt-popup')].pop() || [...d.body.children].filter(el => /Edit (Coach|Staff) Count/.test(el.textContent)).pop();
    check('the count editor opens', !!card);
    if (card) {
      const mh = parseInt(card.style.maxHeight, 10), top = parseInt(card.style.top, 10);
      check('the card is capped to the viewport and placed so it fits (top + maxHeight <= vh - 8)', mh <= 584 && top + mh <= 592, top + '+' + mh);
      const sc = card.querySelector('.sh-cnt-popup-scroll'), sv = card.querySelector('.sh-cnt-popup-save');
      check('the school list is the scroll region and Save sits OUTSIDE it (sticky footer)', !!sc && !!sv && !sc.contains(sv));
      check('the Total row is sticky at the bottom of the scroll region', !![...card.querySelectorAll('td')].find(td => /^Total$/.test(td.textContent.trim()) && td.style.position === 'sticky' && td.style.bottom === '0px'));
      $(card.querySelector('.sh-cnt-x')).trigger('click'); await flush(200);
    }
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 22. School-list styling is standardized; a non-contributing school never forces the grouped layout; no max-count highlight ═══ */
  await suite('School list: a frozen-at-zero school never forces the grouped layout; grouped section lists use the same unstyled 10px-indented typography; the max-count highlight is gone', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    const D = '2026-07-08';
    // (a) Adams allocation-off on Wednesdays, then freeze -> Adams frozen at count 0 with a divergent signature.
    //     It is omitted, so it must NOT push the day into the grouped layout: the list stays outside/above.
    det().staffAlloc = det().staffAlloc || {}; det().staffAlloc['c0'] = det().staffAlloc['c0'] || { on: true, cells: {} }; det().staffAlloc['c0'].on = true; det().staffAlloc['c0'].cells['1|wed'] = false;
    await recalc(); await freezeAll(D);
    await pin(D);
    let list = popup().querySelector('.cal-tip-schoollist'); let hdr = [...popup().querySelectorAll('th,td')].find(x => /^Role$/.test(x.textContent.trim()));
    check('the list renders OUTSIDE the table and ABOVE the header (aggregate layout) despite the omitted divergent school', !!list && !list.closest('table') && !!(list.compareDocumentPosition(hdr) & W.Node.DOCUMENT_POSITION_FOLLOWING));
    check('the list is indented 10px', list.style.marginLeft === '10px', list.style.marginLeft);
    check('only the two contributing schools are listed', list.querySelectorAll('.cal-school-name-wrap, span[style*="ellipsis"]').length === 2);
    await closePop();
    // (b) a GENUINE grouped day (a Special Day on one contributing school): the section-header school list
    //     uses the same normal-weight, unstyled, 10px-indented typography (no table background)
    await freezeAll(D);   // clear the freeze
    det().calMarkers['cal_a|' + D] = { schools: { '0': 'sd1' } }; await recalc();
    await pin(D);
    const secHdr = [...popup().querySelectorAll('table td[colspan]')].find(td => /Lincoln/.test(td.textContent));
    check('a real Special-Day split still renders grouped section rows', !!secHdr);
    if (secHdr) {
      const bl = secHdr.querySelector('div');
      check('section-header school names are normal weight (not bold)', bl && (bl.style.fontWeight === '400'), bl && bl.style.fontWeight);
      check('section-header cell has no gray table background', /fff|white|^$/.test(secHdr.style.background) || secHdr.style.background === 'rgb(255, 255, 255)', secHdr.style.background);
      check('section-header school list is indented 10px', bl && bl.style.marginLeft === '10px', bl && bl.style.marginLeft);
    }
    await closePop();
    // (c) no max-count highlight anywhere in the calendar
    check('no sf-cell-cnt-max elements and no green count backgrounds', pl().querySelectorAll('.sf-cell-cnt-max').length === 0 && ![...pl().querySelectorAll('.sf-cell-cnt')].some(sp => /green/.test(sp.style.background)));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 23. Program-level freeze line below the name (any school frozen, latest action) + 'Override Day Totals' placeholder ═══ */
  await suite('The breakdown shows the program\'s latest Freeze line on its own indented line under the name whenever any school is frozen, plus an inert Override Day Totals placeholder', async () => {
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    const D = '2026-07-08';
    const st = () => { const p = popup(); const line = p.querySelector('.cal-tip-freeze-line'); const under = p.querySelector('.cal-tip-under-name'); const name = p.querySelector('.cal-tip-calname'); return { line: line ? line.textContent.replace(/\s+/g, ' ').trim() : '', indent: under && under.style.marginLeft, below: !!(name && under && (name.compareDocumentPosition(under) & W.Node.DOCUMENT_POSITION_FOLLOWING)), inRow: !!p.querySelector('.cal-tip-calname .cal-tip-freeze'), btn: p.querySelector('.cal-tip-ovr-day-totals') }; };
    await pin(D);
    let s0 = st();
    check('no schools frozen: no snowflake/timestamp line', s0.line === '', s0.line);
    check('the Override Day Totals placeholder is present under the name', !!s0.btn && s0.btn.textContent === 'Override Day Totals' && s0.below && s0.indent === '22px');
    const html0 = popup().outerHTML.length; $(s0.btn).trigger('click'); await flush(150);
    check('clicking the placeholder does nothing (popup unchanged, no errors)', !!popup() && popup().outerHTML.length === html0 && dom.pageErrors.length === 0);
    await closePop();
    await freezeAll(D);
    await pin(D); let s1 = st();
    check('all frozen: the line reads "❄ Latest: <Dow>, <Mon> <d>, <h:mm AM/PM> by Paul" on its own line below the name', /^\u2744\s*Latest: \w{3}, \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM) by Paul$/.test(s1.line) && s1.below && !s1.inRow, s1.line);
    check('the line is indented under the name text (22px)', s1.indent === '22px');
    await closePop();
    $(cell(D)).trigger('mouseenter'); await flush(600); const sh = st();
    check('HOVER popup shows the same line', /^\u2744\s*Latest: .* by Paul$/.test(sh.line) && sh.below, sh.line);
    $(cell(D)).trigger('mouseleave'); await flush(300);
    // subset: still shown (supersedes the old 'no calendar-level indicator for subsets' rule)
    let m = await openMenu(D); $(snows(m)[1]).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    await pin(D); let s2 = st();
    check('SUBSET frozen: the program line is STILL shown', /^\u2744\s*Latest: .* by Paul$/.test(s2.line), s2.line);
    await closePop();
    // differing times: the line shows the LATEST action
    const RealDate = W.Date; const base = Date.now() + 3 * 60 * 1000;
    W.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base); } static now() { return base; } };
    m = await openMenu(D); $(snows(m)[0]).trigger('click'); await flush(40); $(snows(m)[0]).trigger('click'); await flush(40); $(applyBtn(m)).trigger('click'); await flush(500);
    W.Date = RealDate;
    const meta = mk(D).frozenMeta; const latestAt = Object.keys(meta).map(k => meta[k].at).sort().pop();
    const dt = new W.Date(latestAt); let h = dt.getHours(), mm = ('0' + dt.getMinutes()).slice(-2), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; const latestFmt = h + ':' + mm + ' ' + ap;
    await pin(D); let s3 = st();
    check('DIFFERING times: the line shows the most recent freeze action', s3.line.indexOf(latestFmt) >= 0, s3.line + ' vs ' + latestFmt);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 24. Root cause: a first-listed member frozen at count 0 with EMPTY times must not zero the aggregate row ═══ */
  await suite('A school frozen at count 0 with empty snapshot times (listed first) never supplies the aggregate row\'s time: the frozen day still shows its rows and reconciles', async () => {
    // Freeze the day, then hand-edit school 0's snapshot to the failing shape (cnt 0, start/end '') - exactly
    // what Salinas Aug 10 carried for Boronda Meadows.
    await importGuide(dom, c, fixture({ three: true })); await flush(600);
    const D = '2026-07-08';
    await freezeAll(D);
    const m0 = mk(D); m0.frozenSnap['0'] = { ctkk: { start: '', end: '', cnt: 0 } }; await recalc();
    const expect = 6 * (1 + 3);   // Adams 1 + Roosevelt 3 at 6h = 24 ; Lincoln contributes 0
    check('the cell = 24 (the empty-snapshot school contributes 0)', hrs(D) === expect, hrs(D));
    $(cell(D)).trigger('mouseenter'); await flush(500);
    check('HOVER: the frozen day is NOT empty - it shows a Coaches row', popRows(popup()).length >= 1, popRows(popup()).length);
    check('HOVER: total reconciles with the cell (24) and lists 2 schools', popGrand(popup()) === expect && /Total \(2 schools\)/.test(popup().textContent), popGrand(popup()));
    const r = popRows(popup())[0];
    check('HOVER: the row carries the CONTRIBUTING members\' time (9:00am-3:00pm, 6h) and count 4', r && r[1] === '9:00am' && r[2] === '3:00pm' && r[3] === '6' && r[4] === '4', JSON.stringify(r));
    $(cell(D)).trigger('mouseleave'); await flush(300);
    $(cell(D)).trigger('click'); await flush(500);
    check('PINNED: same rows and total', popRows(popup()).length >= 1 && popGrand(popup()) === expect, popGrand(popup()));
    await closePop();
    // survives an upstream change + reopen
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:00', '22:00'); await recalc();
    $(cell(D)).trigger('click'); await flush(500);
    check('after an upstream change the frozen day still shows its rows at the snapshot (24)', popGrand(popup()) === expect && hrs(D) === expect, popGrand(popup()) + '/' + hrs(D));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
