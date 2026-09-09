// t128_combined_wkexcl.js — TWENTIETH SPEC. In the Combined Calendar (a guide with multiple
// calendars), the Week/Dates right-click menu offers "Exclude Week in All Calendars" and/or
// "Include Week in All Calendars" based on the LIVE state across every underlying calendar that
// covers the week: mixed -> both; excluded everywhere -> Include-All only; included everywhere ->
// Exclude-All only. Picking an action applies the SAME per-calendar operation the single-calendar
// toggle uses to every covering calendar, inside ONE Undo/History transaction, recalculating and
// rerendering every dependent immediately. A calendar that does not cover the week is untouched.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
// A guide with two calendars. Both share the same Monday-aligned grid starting 2026-07-06.
// cal_a spans weeks 1..4 (07-06 .. 08-02); cal_b spans weeks 2..3 (07-13 .. 07-26) by default so
// weeks 1 and 4 are covered by cal_a ONLY. Each calendar gets its own slot (c0 / c1) so both carry
// real hours: 60h/week each (5 days x 6h x ... — Coaches only, spc drives count via siteRows).
function fixture(extra) {
  extra = extra || {};
  const calB = extra.calB || { firstDay: '2026-07-13', lastDay: '2026-07-26' };
  const data = {
    status: 'Draft', combinedView: true,
    calendarRows: [
      { name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-02', color: '#e57373', pricePerHour: '80.00', billable: true },
      { name: 'CalB', calId: 'cal_b', firstDay: calB.firstDay, lastDay: calB.lastDay, color: '#64b5f6', pricePerHour: '90.00', billable: true }
    ],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: {
      cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
      cal_b: [{ school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }]
    },
    staffingOptsByCal: { cal_a: { bySchool: false, byPods: false, alternateWeeks: false }, cal_b: { bySchool: false, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') } },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }]
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'CC', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(2000); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const EX = () => W._pgWeekVis;
  const excluded = (cal, iso) => EX().excluded('pg-001', cal, iso);
  const setExcl = (cal, iso, on) => EX().set('pg-001', cal, iso, on);
  const det = () => W._pgGuideDetails()['pg-001'];
  const combinedCell = (iso) => [...pl().querySelectorAll('td[data-wk-cal="__combined__"][data-wk-iso="' + iso + '"]')][0];
  const menuFor = (iso) => { const cell = combinedCell(iso); if (!cell) return null; cell.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); const m = d.querySelector('.pg-wkvis-ctx'); const r = m ? [...m.querySelectorAll('.pg-wkvis-ctx-item')].map(x => x.textContent.trim()) : null; if (m) m.remove(); return r; };
  const pick = async (iso, label) => { const cell = combinedCell(iso); cell.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); const m = d.querySelector('.pg-wkvis-ctx'); const it = [...m.querySelectorAll('.pg-wkvis-ctx-item')].find(x => x.textContent.trim() === label); if (!it) throw new Error('no menu item "' + label + '"'); $(it).trigger('click'); await flush(700); };
  // PC Scheduled Hrs for a calendar, read by the row's name
  const pcSched = (name) => { const t = [...pl().querySelectorAll('table')].find(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /Meal Breaks/.test(c2.textContent))); if (!t) return null; const hs = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim()); const idx = hs.indexOf('Scheduled Hrs'); const rows = [...t.querySelectorAll('tbody tr')]; const r = rows.find(rr => { const inp = rr.children[hs.indexOf('Name')] && rr.children[hs.indexOf('Name')].querySelector('input'); return inp && inp.value === name; }); return r ? parseFloat(r.children[idx].textContent) : null; };
  const W1 = '2026-07-06', W2 = '2026-07-13', W3 = '2026-07-20', W4 = '2026-07-27';

  /* ═══ 1. Menu state rules (mixed / all-excluded / all-included) ═══ */
  await suite('The combined menu offers options by the live cross-calendar state', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    check('a fully-included week (both calendars) offers ONLY Exclude-All', JSON.stringify(menuFor(W2)) === JSON.stringify(['Exclude Week in All Calendars']), JSON.stringify(menuFor(W2)));
    setExcl('cal_a', W2, true); await flush(200);
    check('a mixed week (excluded in cal_a, included in cal_b) offers BOTH', JSON.stringify(menuFor(W2)) === JSON.stringify(['Exclude Week in All Calendars', 'Include Week in All Calendars']), JSON.stringify(menuFor(W2)));
    setExcl('cal_b', W2, true); await flush(200);
    check('a week excluded in EVERY calendar offers ONLY Include-All', JSON.stringify(menuFor(W2)) === JSON.stringify(['Include Week in All Calendars']), JSON.stringify(menuFor(W2)));
    setExcl('cal_a', W2, false); setExcl('cal_b', W2, false); await flush(200);
    check('back to fully-included offers ONLY Exclude-All again', JSON.stringify(menuFor(W2)) === JSON.stringify(['Exclude Week in All Calendars']), JSON.stringify(menuFor(W2)));
    // a week only cal_a covers still offers the action (all covering calendars = just cal_a)
    check('week 1 (covered by cal_a only) offers Exclude-All', JSON.stringify(menuFor(W1)) === JSON.stringify(['Exclude Week in All Calendars']), JSON.stringify(menuFor(W1)));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Exclude-All applies to every covering calendar + recalcs; Include-All restores ═══ */
  await suite('Exclude-All / Include-All apply to every covering calendar and recalculate immediately', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    const aBefore = pcSched('CalA'), bBefore = pcSched('CalB');
    check('baseline: CalA 240h (4 wks x 60), CalB 60h (2 wks x 30)', aBefore === 240 && bBefore === 60, aBefore + '/' + bBefore);
    let h0 = -1; try { W._pgHist.flushNow(); h0 = W._pgHist.list('pg-001').length; } catch (e) {}
    await pick(W2, 'Exclude Week in All Calendars');
    check('Exclude-All wrote the exclusion in BOTH calendars', excluded('cal_a', W2) === true && excluded('cal_b', W2) === true, JSON.stringify(det().wkExcl));
    check('CalA Scheduled dropped by one week (240 -> 180)', pcSched('CalA') === 180, pcSched('CalA'));
    check('CalB Scheduled dropped by one week (60 -> 30)', pcSched('CalB') === 30, pcSched('CalB'));
    check('the combined-view Week/Dates cell is striped (excluded everywhere)', combinedCell(W2).classList.contains('pg-wk-vis-excl'));
    let h1 = -1, rec = null; try { W._pgHist.flushNow(); const l = W._pgHist.list('pg-001'); h1 = l.length; rec = l[0]; } catch (e) {}
    check('exactly ONE History record for the whole all-calendars action', h0 < 0 || h1 === h0 + 1, h0 + ' -> ' + h1);
    check('the History record names "all calendars"', !!rec && /all calendars/.test(rec.action || ''), rec && JSON.stringify(rec).slice(0, 120));
    // Include-All restores both
    await pick(W2, 'Include Week in All Calendars');
    check('Include-All cleared the exclusion in BOTH calendars', excluded('cal_a', W2) === false && excluded('cal_b', W2) === false, JSON.stringify(det().wkExcl || null));
    check('CalA restored to 240, CalB restored to 60', pcSched('CalA') === 240 && pcSched('CalB') === 60, pcSched('CalA') + '/' + pcSched('CalB'));
    check('the combined cell is no longer striped', !combinedCell(W2).classList.contains('pg-wk-vis-excl'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Include-All from a MIXED state normalizes every calendar to included ═══ */
  await suite('Include-All from a mixed state includes the week in every calendar', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    EX().toggle('pg-001', 'cal_a', W3); await flush(400);   // mixed: cal_a excluded, cal_b included
    check('CalA already down a week (180), CalB full (60)', pcSched('CalA') === 180 && pcSched('CalB') === 60, pcSched('CalA') + '/' + pcSched('CalB'));
    await pick(W3, 'Include Week in All Calendars');
    check('both calendars now include the week', excluded('cal_a', W3) === false && excluded('cal_b', W3) === false);
    check('CalA restored to 240 (cal_b unchanged at 60)', pcSched('CalA') === 240 && pcSched('CalB') === 60, pcSched('CalA') + '/' + pcSched('CalB'));
    // Exclude-All from mixed normalizes the other way
    EX().toggle('pg-001', 'cal_a', W3); await flush(400);
    await pick(W3, 'Exclude Week in All Calendars');
    check('Exclude-All from mixed excludes the week everywhere', excluded('cal_a', W3) === true && excluded('cal_b', W3) === true);
    check('CalA 180, CalB 30', pcSched('CalA') === 180 && pcSched('CalB') === 30, pcSched('CalA') + '/' + pcSched('CalB'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. A calendar that does not cover the week is left untouched ═══ */
  await suite('Exclude-All touches only the calendars that cover the week', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    // week 1 is covered by cal_a only; cal_b starts at week 2
    await pick(W1, 'Exclude Week in All Calendars');
    check('cal_a excluded for week 1', excluded('cal_a', W1) === true);
    check('cal_b (does not cover week 1) is NOT excluded for week 1', excluded('cal_b', W1) === false, JSON.stringify(det().wkExcl));
    check('CalA lost a week (180); CalB unchanged (60)', pcSched('CalA') === 180 && pcSched('CalB') === 60, pcSched('CalA') + '/' + pcSched('CalB'));
    // and week 4 is cal_a-only too
    check('week 4 offers Exclude-All (cal_a covers it)', JSON.stringify(menuFor(W4)) === JSON.stringify(['Exclude Week in All Calendars']), JSON.stringify(menuFor(W4)));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Undo reverts the whole all-calendars action in one step; parity with manual toggles ═══ */
  await suite('Undo reverts the all-calendars action atomically, and the result equals per-calendar manual toggles', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    await pick(W2, 'Exclude Week in All Calendars');
    const aExcl = pcSched('CalA'), bExcl = pcSched('CalB');
    check('both excluded via the combined action (A 180, B 30)', aExcl === 180 && bExcl === 30, aExcl + '/' + bExcl);
    try { W._pgUndo.doUndo('pg-001'); } catch (e) { try { W._pgUndo.undo(); } catch (e2) {} }
    await flush(700);
    check('one Undo restored BOTH calendars', excluded('cal_a', W2) === false && excluded('cal_b', W2) === false && pcSched('CalA') === 240 && pcSched('CalB') === 60, [excluded('cal_a', W2), excluded('cal_b', W2), pcSched('CalA'), pcSched('CalB')].join('/'));
    // parity: manually excluding each calendar (single-calendar toggle) reaches the SAME figures
    EX().toggle('pg-001', 'cal_a', W2); await flush(400);
    EX().toggle('pg-001', 'cal_b', W2); await flush(400);
    check('manual per-calendar toggles reach the identical figures the combined action produced', pcSched('CalA') === aExcl && pcSched('CalB') === bExcl, pcSched('CalA') + '/' + pcSched('CalB'));
    check('and the same wkExcl state', excluded('cal_a', W2) === true && excluded('cal_b', W2) === true);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. The menu reads state FRESH each open; single-calendar guides keep the old menu ═══ */
  await suite('The menu re-reads state each open; a single-calendar guide keeps the one-item menu', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    check('first open (included) -> Exclude-All', JSON.stringify(menuFor(W2)) === JSON.stringify(['Exclude Week in All Calendars']));
    await pick(W2, 'Exclude Week in All Calendars');
    check('second open (now excluded everywhere) -> Include-All (fresh read)', JSON.stringify(menuFor(W2)) === JSON.stringify(['Include Week in All Calendars']), JSON.stringify(menuFor(W2)));
    // single-calendar guide: the combined view is not offered; the per-calendar menu says just "Exclude Week"
    await importGuide(dom, c, JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'One', status: 'Draft' }, data: {
      status: 'Draft', combinedView: false,
      calendarRows: [{ name: 'Solo', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-02', color: '#e57373', pricePerHour: '80.00', billable: true }],
      roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
      siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] },
      staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
      siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] } })); await flush(300);
    const cell = [...pl().querySelectorAll('td[data-wk-cal="cal_a"][data-wk-iso="' + W2 + '"]')][0];
    check('single-calendar Week cell carries the real calId (not __combined__)', !!cell);
    if (cell) { cell.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); const m = d.querySelector('.pg-wkvis-ctx'); const items = m ? [...m.querySelectorAll('.pg-wkvis-ctx-item')].map(x => x.textContent.trim()) : null; if (m) m.remove(); check('its menu is the plain single-calendar "Exclude Week"', JSON.stringify(items) === JSON.stringify(['Exclude Week']), JSON.stringify(items)); }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
