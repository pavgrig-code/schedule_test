'use strict';
const { bootApp, suite, check, eq, report, results, flush, whenReady, setCurrent } = require('./harness');
const { ctx, clickGuide, setMode, pickDate, errTracker, bodyPortalCount, domNodeCount } = require('./testutil');

(async () => {
const t0 = Date.now();
const dom = bootApp();
const ready = await whenReady(dom);
const bootMs = Date.now() - t0;
const c = ctx(dom);
const { w, d, $ } = c;
const errs = errTracker(dom);
const timings = { bootMs };

/* ───────────────────────── 1. Boot & smoke ───────────────────────── */
suite('1. Boot & smoke', () => {
  check('jQuery loaded', typeof $ === 'function' && !!$.fn.jquery);
  check('app reached interactive state', ready);
  check('boot completes < 5s (jsdom)', bootMs < 5000, bootMs + 'ms');
  const e = errs.delta();
  check('zero JS errors during boot', e.count === 0, e.msgs.join(' | '));
  check('all 5 mode buttons present', ['btn-planning','btn-schedule','btn-people','btn-availability','btn-staff-schedule'].every(id => !!d.getElementById(id)));
  check('day/week/month view buttons present', ['btn-day','btn-week','btn-month'].every(id => !!d.getElementById(id)));
  check('date nav present', !!d.getElementById('prev-btn') && !!d.getElementById('next-btn') && !!d.getElementById('today-badge'));
  check('default mode is Planning', d.getElementById('btn-planning').classList.contains('active'));
  check('planning guide list populated (2 seed guides)', d.querySelectorAll('#staff-list-scroll .staff-row').length === 2,
    'rows=' + d.querySelectorAll('#staff-list-scroll .staff-row').length);
  check('guide rows show IDs', /pg-001/.test(d.getElementById('staff-list-scroll').textContent));
  check('filter bar hidden in planning mode', $('#filter-bar').css('display') === 'none');
});

/* ───────────────────────── 2. Mode switching ───────────────────────── */
await suiteAsync('2. Mode switching & panel routing', async () => {
  const modes = [
    ['btn-schedule', 'schedule', 'schedule-panel'],
    ['btn-people', 'people', 'people-panel'],
    ['btn-availability', 'availability', 'timeline-area'],
    ['btn-staff-schedule', 'staff_schedule', 'staff-schedule-panel'],
    ['btn-planning', 'planning', 'planning-panel'],
  ];
  for (const [btn, name, panel] of modes) {
    await setMode(c, btn);
    check(`${name}: button becomes active`, d.getElementById(btn).classList.contains('active'));
    const el = d.getElementById(panel);
    check(`${name}: target panel visible`, el.style.display !== 'none');
    const others = modes.filter(m => m[2] !== panel && m[2] !== 'timeline-area');
    check(`${name}: other panels hidden`, others.every(m => d.getElementById(m[2]).style.display === 'none' || m[2] === panel));
    check(`${name}: exactly one active mode button`, d.querySelectorAll('.mode-btn.active').length === 1);
  }
  // Toolbar visibility rules
  await setMode(c, 'btn-people');
  check('people: view toggle hidden', $('.view-toggle').css('display') === 'none');
  check('people: date nav hidden', $('.date-nav').css('display') === 'none');
  await setMode(c, 'btn-staff-schedule');
  check('staff_schedule: view toggle hidden', $('.view-toggle').css('display') === 'none');
  await setMode(c, 'btn-availability');
  check('availability: view toggle shown', $('.view-toggle').css('display') !== 'none');
  check('availability: filter bar shown', $('#filter-bar').css('display') !== 'none');
  await setMode(c, 'btn-planning');
  check('planning: filter bar hidden again', $('#filter-bar').css('display') === 'none');
  const e = errs.delta();
  check('zero JS errors across all mode switches', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 3. Guide list: select, search, URL ───────────────────── */
await suiteAsync('3. Planning guide list', async () => {
  check('no guide selected initially → empty panel', d.getElementById('planning-panel').children.length === 0);
  await clickGuide(c, 0);
  check('clicking guide 1 populates detail panel', d.getElementById('planning-panel').children.length > 0);
  check('selected row is highlighted', d.querySelector('#staff-list-scroll .staff-row.selected') !== null);
  check('URL updated with planning_guide param', /planning_guide=pg-001/.test(w.location.search));
  await clickGuide(c, 1);
  check('switching to guide 2 updates URL', /planning_guide=pg-002/.test(w.location.search));
  check('guide 2 detail shows its name', /Template 2/.test(d.getElementById('planning-panel').textContent));
  // Search box filters guides in planning mode
  $('#staff-search').val('Template 1').trigger('input');
  await flush(60);
  eq('search filters list to 1 row', d.querySelectorAll('#staff-list-scroll .staff-row').length, 1);
  $('#staff-search').val('zzz-no-match').trigger('input');
  await flush(60);
  check('no-match search shows empty state', /No guides found/.test(d.getElementById('staff-list-scroll').textContent));
  $('#staff-search').val('').trigger('input');
  await flush(60);
  eq('clearing search restores both guides', d.querySelectorAll('#staff-list-scroll .staff-row').length, 2);
  await clickGuide(c, 0);
  const e = errs.delta();
  check('zero JS errors in list interactions', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 4. Guide detail structure ───────────────────── */
await suiteAsync('4. Guide detail sections', async () => {
  const pp = d.getElementById('planning-panel');
  const txt = pp.textContent;
  for (const sec of ['Programs','Staff Roles','Special Days','Site Breakdown','Staffing Hours','Calendars']) {
    check(`section present: ${sec}`, txt.includes(sec));
  }
  check('Summary block present', /Summary/.test(txt));
  check('summary explains missing calendars', /No program calendars defined/.test(txt));
  const tables = [...pp.querySelectorAll('table')];   // array, so .find() works below
  check('calendar setup table exists', tables.length >= 6, 'tables=' + tables.length);
  // Resolve by header CONTENT, never by position. The panel gains sections over time
  // (Discounts now sits at index 1, between Program Calendars and Staff Roles), and a fixed
  // index silently retargets — three of these checks were passing against the WRONG table.
  const byHdr = re => tables.find(t => t.rows[0] && re.test([...t.rows[0].cells].map(x => x.textContent.trim()).join(',')));
  const calT = byHdr(/Meal Breaks/);
  eq('calendar setup header columns', [...calT.rows[0].cells].map(x => x.textContent.trim()).join(','),
    ',Name,First Day,Last Day,Length,Meal Breaks,Scheduled Hrs,Remaining Hrs,Total,PPH,Amount,Staff/Day (Max),PPH (Net),Amount (Net),Del');
  check('staff roles table has seed rows', byHdr(/^Role,Coach,Students per Coach/).rows.length > 2, 'rows=' + byHdr(/^Role,Coach,Students per Coach/).rows.length);
  check('special days table has seed rows', byHdr(/Special Day,No Hours/).rows.length > 2, 'rows=' + byHdr(/Special Day,No Hours/).rows.length);
  check('site breakdown table present', byHdr(/# of Coaches/).rows.length >= 1);
  const shT = byHdr(/Min Day,Monday/);
  check('staffing hours tables render role sub-rows', shT.rows.length > 30, 'rows=' + shT.rows.length);
  check('staffing hours has Mon–Sun day columns', /Monday.*Tuesday.*Wednesday.*Thursday.*Friday.*Saturday.*Sunday/.test(shT.rows[0].textContent));
  // Add Calendar button grows the table
  const before = calT.rows.length;
  $(pp).find('button').filter((i, b) => b.textContent.trim() === '+ Add Calendar').first().trigger('click');
  await flush(60);
  const calT2 = d.getElementById('planning-panel').querySelectorAll('table')[0];
  eq('+ Add Calendar adds a row', calT2.rows.length, before + 1);
  // Delete it back via its Del button
  $(calT2.querySelectorAll('tbody tr')[calT2.querySelectorAll('tbody tr').length - 1]).find('button').filter((i, b) => b.textContent.trim() === 'Del').trigger('click');
  await flush(60);
  // deletion may confirm via popup
  const confirmBtn = [...d.querySelectorAll('button')].find(b => /^(Delete|OK|Confirm)$/i.test(b.textContent.trim()) && b.offsetParent !== undefined);
  if (confirmBtn) { $(confirmBtn).trigger('click'); await flush(60); }
  const calT3 = d.getElementById('planning-panel').querySelectorAll('table')[0];
  eq('Del removes the added calendar row', calT3.rows.length, before);
  const e = errs.delta();
  check('zero JS errors in detail interactions', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 5. Status dropdown ───────────────────── */
await suiteAsync('5. Guide status workflow', async () => {
  const pp = d.getElementById('planning-panel');
  const statusBtn = [...pp.querySelectorAll('button')].find(b => /Status/.test(b.textContent));
  check('status dropdown trigger exists', !!statusBtn);
  if (statusBtn) {
    $(statusBtn).trigger('click');
    await flush(30);
    const opt = [...pp.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirmed');
    check('status menu offers Confirmed', !!opt);
    if (opt) {
      $(opt).trigger('click');
      await flush(80);
      check('guide list row reflects new status', /Confirmed/.test(d.getElementById('staff-list-scroll').textContent));
    }
  }
  const e = errs.delta();
  check('zero JS errors in status workflow', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 6. Calendar setup drives calendar render ───────────────────── */
let calCellCount = 0;
await suiteAsync('6. Calendar setup → month grid & summary', async () => {
  const pp = d.getElementById('planning-panel');
  const calT = pp.querySelectorAll('table')[0];
  const row = calT.rows[1];
  // Name it
  $(row.cells[1]).find('input').val('Regular').trigger('input').trigger('change');
  await flush(30);
  // First/Last day via the real date-picker popup
  const t1 = Date.now();
  const ok1 = await pickDate(c, $(row.cells[2]).find('input')[0], '2026-08-10');
  const ok2 = await pickDate(c, $(row.cells[3]).find('input')[0], '2026-10-30');
  check('first-day picked via popup', ok1);
  check('last-day picked via popup', ok2);
  await flush(400); // rAF-coalesced combined-view rebuild
  timings.calendarBuildMs = Date.now() - t1;
  const pp2 = d.getElementById('planning-panel');
  calCellCount = pp2.querySelectorAll('.cal-day-cell').length;
  check('calendar day cells rendered', calCellCount > 0, 'cells=' + calCellCount);
  // Aug 10 – Oct 30 2026 spans Aug, Sep, Oct → grids include full weeks
  check('calendar covers the full range (≥ 82 day cells)', calCellCount >= 82, 'cells=' + calCellCount);
  check('empty-state message gone', !/Add a calendar in Calendar Setup with a valid/.test(pp2.textContent));
  check('summary no longer reports missing calendars', !/No program calendars defined/.test(pp2.textContent));
  // Week-row grid design: full range in section header ("Regular :: August 10 – October 30, 2026"),
  // rows labeled Week N with a Dates column.
  check('calendar header shows full date range', /August 10\s+\u2013\s+October 30, 2026/.test(pp2.textContent));
  check('grid is week-row layout (Week col + Mon–Sun)', (() => {
    const sec = pp2.querySelector('[id^="cal-section-"]');
    const tbl = sec && sec.querySelector('table');
    if (!tbl) return false;
    const hdr = [...tbl.rows[0].cells].map(x => x.textContent.trim()).join(',');
    return hdr === 'Week,Dates,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday' && tbl.rows.length === 13;
  })());
  const withKeys = pp2.querySelectorAll('.cal-day-cell[data-date-key]').length;
  check('day cells carry data-date-key', withKeys > 0, 'keyed=' + withKeys);
  const e = errs.delta();
  check('zero JS errors while building calendar', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 7. Calendar cell interactions ───────────────────── */
await suiteAsync('7. Calendar breakdown popup & Extra Shift entry point', async () => {
  const pp = d.getElementById('planning-panel');
  const cell = pp.querySelector('.cal-day-cell[data-date-key="2026-09-09"]') ||
               pp.querySelector('.cal-day-cell[data-date-key]');
  check('found an in-range calendar cell', !!cell);
  if (cell) {
    const portalsBefore = bodyPortalCount(d);
    $(cell).trigger('click');
    await flush(120);
    const bodyTxt = d.body.textContent;
    check('click pins the hours-breakdown popup', bodyPortalCount(d) > portalsBefore || /Extra Shift/i.test(bodyTxt));
    check('popup offers "+ Add Extra Shift"', /Add Extra Shift/i.test(bodyTxt), 'popup text missing');
    check('clicked cell gets active-ring class', cell.classList.contains('cal-tip-active'));
    // Close by clicking elsewhere
    $(d.body).trigger('click');
    await flush(120);
    check('outside click unpins popup', !cell.classList.contains('cal-tip-active'));
  }
  const e = errs.delta();
  check('zero JS errors in breakdown popup flow', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 8. Actions menu ───────────────────── */
await suiteAsync('8. Actions menu', async () => {
  const pp = d.getElementById('planning-panel');
  const expBtn = [...pp.querySelectorAll('button')].find(b => /Actions/.test(b.textContent) && b.textContent.trim().length < 20);
  check('Actions control exists (renamed from "Export to")', !!expBtn);
  check('old "Export to" label is gone', ![...pp.querySelectorAll('button')].some(b => /Export to/.test(b.textContent)));
  if (expBtn) {
    $(expBtn).trigger('click');
    await flush(30);
    const labels = [...pp.querySelectorAll('button')].map(b => b.textContent.trim());
    check('menu has "Export as Excel"', labels.some(l => l.indexOf('Export as Excel') >= 0));
    check('menu has "Export as JSON"', labels.some(l => l.indexOf('Export as JSON') >= 0));
    check('menu has an Import option', labels.some(l => /Import/.test(l)));
    check('menu has "Duplicate"', labels.some(l => l.indexOf('Duplicate') >= 0));
    check('menu has "Delete"', labels.some(l => l.indexOf('Delete') >= 0));
    check('no bare Excel/JSON/PDF options remain', labels.indexOf('Excel') < 0 && labels.indexOf('JSON') < 0 && labels.indexOf('PDF') < 0);
    $(d).trigger('click'); // document click closes
    await flush(30);
    // Repeated open/close must not error or duplicate handlers
    for (let i = 0; i < 10; i++) {
      $(expBtn).trigger('click'); await flush(5);
      $(d).trigger('click'); await flush(5);
    }
    check('10× open/close cycles stay clean', true);
  }
  const e = errs.delta();
  check('zero JS errors in export dropdown', e.count === 0, e.msgs.join(' | '));
});

/* ───────────────────── 9. Time picker parse/format contract ───────────────────── */
suite('9. Time parsing & formatting (exposed picker API)', () => {
  const P = w._PICKER_PARSE, F = w._PICKER_FMT;
  check('parser exposed', typeof P === 'function');
  check('formatter exposed', typeof F === 'function');
  const cases = [
    ['9:00 AM', '09:00'], ['9am', '09:00'], ['12:00 PM', '12:00'], ['12:00 AM', '00:00'],
    ['330pm', '15:30'], ['15:30', '15:30'], ['12pm', '12:00'], ['12am', '00:00'],
    ['1159pm', '23:59'], ['07:05', '07:05'], ['7:05 pm', '19:05'], ['  8:15 AM ', '08:15'],
  ];
  for (const [inp, expct] of cases) eq(`parse "${inp}"`, P(inp), expct);
  const bad = ['xyz', '25:00', '13:60', '99', ''];
  for (const b of bad) check(`rejects "${b}"`, P(b) == null, 'got ' + JSON.stringify(P(b)));
  eq('format 09:00 → 9:00am', F('09:00'), '9:00am');
  eq('format 15:30 → 3:30pm', F('15:30'), '3:30pm');
  eq('format 00:00 → 12:00am', F('00:00'), '12:00am');
  eq('format 12:00 → 12:00pm', F('12:00'), '12:00pm');
  eq('round-trip 23:59', P(F('23:59')), '23:59');
  eq('round-trip 00:30', P(F('00:30')), '00:30');
});

/* ───────── helper for async suites (framework is sync; wrap) ───────── */
function suiteAsync(name, fn) {
  return new Promise(resolve => {
    const s = { name, checks: [], pass: 0, fail: 0, ms: 0 };
    results.suites.push(s);
    const t = Date.now();
    setCurrent(s);
    Promise.resolve()
      .then(fn)
      .catch(e => { s.fail++; results.fail++; s.checks.push({ name: 'SUITE THREW: ' + (e && e.stack || e), ok: false }); })
      .then(() => { s.ms = Date.now() - t; setCurrent(null); resolve(); });
  });
}

console.log('timings:', JSON.stringify(timings));
console.log(report());
process.exit(results.fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
