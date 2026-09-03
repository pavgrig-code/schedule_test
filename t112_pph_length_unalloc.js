// t112_pph_length_unalloc.js — Twenty-first spec: (1) Program Calendars PPH column moved between
// Total and Amount; (2) week-vis menu actions renamed Exclude Week / Include Week on BOTH surfaces
// (Calendar Week/Dates column + Staffing Allocation Weeks subheaders — one shared menu builder);
// (3) new Length column after Last Day: active program weeks from the ONE _pgWeekVis store, live on
// Exclude/Include from either surface; (4) Site Breakdown "Unallocated Hours" checkbox + compact
// header summary (collapsed, or expanded-but-unchecked, only while unalloc > 0) with the full
// area's exact value colors.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fx(opts) {
  opts = opts || {};
  const A = [{ school: 'Alpha', schoolId: 'a1', coaches_ctkk: 1, ctkk: 10 }, { school: 'Bravo', schoolId: 'a2', coaches_ctkk: 1, ctkk: 10 }];
  const cals = [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }];
  if (opts.twoCals) cals.push({ name: 'CalB', firstDay: '2026-08-03', lastDay: '2026-08-07', color: '#64b5f6', pricePerHour: '50.00', billable: true, calId: 'cal_b' });
  const data = {
    status: 'Draft', combinedView: false, calendarRows: cals,
    siteRows: A, siteRowsByCal: (function () { const m = {}; cals.forEach(c => m[c.calId] = JSON.parse(JSON.stringify(A))); return m; })(),
    staffingOptsByCal: (function () { const m = {}; cals.forEach(c => m[c.calId] = { bySchool: false, byPods: false, alternateWeeks: false }); return m; })(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:30') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  };
  if (opts.unalloc != null) data.unschedByCal = { cal_a: { unalloc: String(opts.unalloc), rows: opts.allocRows || [] } };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1400); d.createElement = ocr;
}
async function boot(json) {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const E = { dom, W, d, $, c };
  E.pl = () => d.getElementById('planning-panel');
  E.pc = () => [...E.pl().querySelectorAll('table')].find(t => [...t.querySelectorAll('thead th')].some(x => x.textContent === 'Scheduled Hrs'));
  E.hs = () => [...E.pc().querySelectorAll('thead th')].map(x => x.textContent);
  E.lenCell = (cid) => E.pc().querySelector('td.pg-cal-length[data-calc-cal="' + cid + '"]');
  E.rclick = (cell) => { cell.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 60 })); return d.querySelector('.pg-wkvis-ctx'); };
  E.pick = (menu) => { $(menu.querySelector('.pg-wkvis-ctx-item')).trigger('click'); };
  E.leftCells = (cal, iso) => [...E.pl().querySelectorAll('td.pg-wk-vis-cell[data-wk-cal="' + cal + '"][data-wk-iso="' + iso + '"]')];
  E.sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
  E.unCard = () => E.pl().querySelector('.unsched-cal-card[data-unsched-cal="cal_a"]');
  E.cb = () => E.sb().querySelector('.sb-unalloc-cb');
  E.sumX = () => E.sb().querySelector('.sb-unalloc-sum');
  E.secSum = () => E.sb().querySelector('.pg-sec-summary');
  E.collapse = async () => { $(E.sb().querySelector('.pg-sec-toggle')).trigger('click'); await flush(150); };
  await importGuide(dom, c, json); await flush(1200);
  return E;
}

(async () => {

  /* ═══ Suite 1: PPH column between Total and Amount ═══ */
  await suite('Program Calendars column order: Length after Last Day; Total \u2192 PPH \u2192 Amount; total row aligned', async () => {
    const E = await boot(fx({ twoCals: true })); const { dom } = E;
    const hs = E.hs();
    check('header order is exact', hs.join(',') === ',Name,First Day,Last Day,Length,Meal Breaks,Scheduled Hrs,Remaining Hrs,Total,PPH,Amount,Staff/Day (Max),PPH (Net),Amount (Net),Del', hs.join(','));
    const row = E.pc().querySelector('tbody tr');
    const cls = [...row.children].map(td => td.className || (td.querySelector('input') ? 'inp' : ''));
    check('row cells physically match the header order (Length at 4, calc/site..total then the PPH input then Amount)', cls[4] === 'pg-cal-length' && cls[6] === 'pg-cal-calc' && cls[7] === 'pg-cal-calc' && cls[8] === 'pg-cal-calc' && !!row.children[9].querySelector('input') && cls[10] === 'pg-cal-calc' && cls[11] === 'pg-cal-maxcnt', JSON.stringify(cls));
    check('the PPH cell carries the $ currency input', /\$/.test(row.children[9].textContent));
    const tot = [...E.pc().querySelectorAll('tr')].find(tr => tr.querySelector('.pg-cal-total-hours'));
    let col = 0; const at = {};
    [...tot.children].forEach(td => { at[col] = td.className || 'sp'; col += td.colSpan || 1; });
    check('guide total row: hours under Total(8), spacer under PPH(9), amount under Amount(10), max under 11', at[8] === 'pg-cal-total-hours' && (at[9] === 'sp' || at[9] === 'pg-cal-total-row-pph') && at[10] === 'pg-cal-total-amount' && at[11] === 'pg-cal-total-maxcnt', JSON.stringify(at));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: renamed actions on BOTH surfaces ═══ */
  await suite('Exclude Week / Include Week wording on the Calendar week column and the Weeks subheaders', async () => {
    const E = await boot(fx({})); const { dom, $ } = E;
    const left = E.leftCells('cal_a', '2026-07-20');
    check('the Calendar Week/Dates cells are wired', left.length >= 1, left.length);
    let m = E.rclick(left[0]); await flush(30);
    check('Calendar surface offers Exclude Week (old wording gone)', !!m && /Exclude Week/.test(m.textContent) && !/Rotation/.test(m.textContent), m && m.textContent);
    E.pick(m); await flush(300);
    m = E.rclick(left[0]); await flush(30);
    check('excluded week now offers Include Week', !!m && /Include Week/.test(m.textContent) && !/Rotation/.test(m.textContent));
    E.pick(m); await flush(300);
    const at = E.pl().querySelector('.sf-alloc-table');
    $(at.querySelector('td.sf-wkov-vert')).trigger('click'); await flush(700);
    const th = E.pl().querySelector('.sf-alloc-table th.sf-wkov-week-h');
    m = E.rclick(th); await flush(30);
    check('the Staffing Allocation Weeks subheader offers Exclude Week too', !!m && /Exclude Week/.test(m.textContent) && !/Rotation/.test(m.textContent));
    E.dom.window.document.dispatchEvent(new E.W.MouseEvent('mousedown', { bubbles: true })); await flush(50);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: Length column lifecycle ═══ */
  await suite('Length counts active weeks and tracks Exclude/Include Week from either surface instantly', async () => {
    const E = await boot(fx({ twoCals: true })); const { dom, W, $ } = E;
    check('CalA spans 2 weeks, CalB 1 week', E.lenCell('cal_a').textContent === '2 weeks' && E.lenCell('cal_b').textContent === '1 week', E.lenCell('cal_a').textContent + '/' + E.lenCell('cal_b').textContent);
    // Calendar-surface exclude (UI path)
    const left = E.leftCells('cal_a', '2026-07-27');
    let m = E.rclick(left[0]); await flush(30); E.pick(m); await flush(600);
    check('Exclude Week from the Calendar column drops CalA to 1 week', E.lenCell('cal_a').textContent === '1 week', E.lenCell('cal_a').textContent);
    // Alloc-subheader include (UI path) — the SAME store, so it restores the Length
    const at = E.pl().querySelector('.sf-alloc-table');
    $(at.querySelector('td.sf-wkov-vert')).trigger('click'); await flush(700);
    const th = [...E.pl().querySelectorAll('.sf-alloc-table th.sf-wkov-week-h')].find(x => x.getAttribute('data-wk-iso') === '2026-07-27' || /Jul\s*27|7\/27/.test(x.textContent)) || E.pl().querySelectorAll('.sf-alloc-table th.sf-wkov-week-h')[1];
    m = E.rclick(th); await flush(30);
    check('the subheader for the excluded week offers Include Week', !!m && /Include Week/.test(m.textContent));
    E.pick(m); await flush(600);
    check('Include Week from the Allocation surface restores 2 weeks', E.lenCell('cal_a').textContent === '2 weeks', E.lenCell('cal_a').textContent);
    // seam churn: exclude both CalA weeks -> 0 weeks; restore
    W._pgWeekVis.toggle('pg-001', 'cal_a', '2026-07-20'); await flush(400);
    W._pgWeekVis.toggle('pg-001', 'cal_a', '2026-07-27'); await flush(400);
    check('both weeks excluded shows 0 weeks', E.lenCell('cal_a').textContent === '0 weeks', E.lenCell('cal_a').textContent);
    W._pgWeekVis.toggle('pg-001', 'cal_a', '2026-07-20'); await flush(300);
    W._pgWeekVis.toggle('pg-001', 'cal_a', '2026-07-27'); await flush(500);
    check('restoring both returns 2 weeks; CalB untouched throughout', E.lenCell('cal_a').textContent === '2 weeks' && E.lenCell('cal_b').textContent === '1 week');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4: Site Breakdown Unallocated Hours toggle + compact summary ═══ */
  await suite('Unallocated checkbox shows/hides the card; the compact summary appears exactly when specified', async () => {
    const E = await boot(fx({ unalloc: 100, allocRows: [{ total: '7.5' }] })); const { dom, $ } = E;
    check('checkbox sits in the SB header after the Program Name, checked by default', !!E.cb() && E.cb().checked === true && !!E.sb().querySelector('.sb-unalloc-toggle-seg'));
    check('the Unallocated Hours card is visible by default', E.unCard() && E.unCard().style.display !== 'none');
    check('the summary shows even when expanded and checked (twenty-seventh spec: checkbox controls only the card)', E.sumX() && E.sumX().style.display !== 'none' && /Unallocated Hours:\s*100/.test(E.sumX().textContent.replace(/\s+/g,' ')));
    // uncheck -> card hides, summary appears with the full area's values and colors
    $(E.cb()).prop('checked', false).trigger('change'); await flush(120);
    check('unchecking hides the FULL Unallocated Hours area', E.unCard().style.display === 'none');
    const txt = E.sumX().textContent.replace(/\s+/g, '');
    check('expanded+unchecked summary shows "Unallocated Hours: 100 | Remaining Hours: 92.5"', E.sumX().style.display !== 'none' && txt === 'UnallocatedHours:100|RemainingHours:92.5', txt);
    const chips = E.sumX().querySelectorAll('span');
    const green = [...chips].find(x => x.style.background && /216,\s*255,\s*213/.test(x.style.background));
    const rem = E.sumX().querySelector('.sb-unalloc-sum-rem');
    check('value colors match the full area (green field on Unallocated, blue Remaining)', !!green && rem && /13,\s*110,\s*253/.test(rem.style.color), rem && rem.style.color);
    // collapse -> card stays hidden; summary rides the collapsed header right after the school count
    await E.collapse();
    check('collapsed: card hidden; the single header summary still shows the unalloc line (one element)', E.unCard().style.display === 'none' && /Unallocated Hours:\s*100/.test(E.sumX().textContent) && E.sb().querySelectorAll('.sb-unalloc-sum').length === 1 && E.sumX().style.display !== 'none');
    // expand -> restore per the PRE-COLLAPSE checkbox state (unchecked -> still hidden, summary back)
    await E.collapse();
    check('expanded again: checkbox state restored (card hidden, expanded summary visible)', E.unCard().style.display === 'none' && E.sumX().style.display !== 'none' && E.cb().checked === false);
    // recheck -> card restored, summaries gone
    $(E.cb()).prop('checked', true).trigger('change'); await flush(120);
    check('rechecking restores the card; the summary STAYS visible (checkbox no longer gates it)', E.unCard().style.display !== 'none' && E.sumX().style.display !== 'none');
    // collapse while CHECKED -> auto-hide; expand -> auto-restore
    await E.collapse();
    check('collapsing auto-hides the card even while checked (summary still shown \u2014 unalloc exists)', E.unCard().style.display === 'none' && /Unallocated Hours:\s*100/.test(E.sumX().textContent) && E.sumX().style.display !== 'none');
    await E.collapse();
    check('expanding restores the card per the checked state', E.unCard().style.display !== 'none');
    // live repaint: edit the Unallocated field -> the visible summary tracks it
    const inp = E.unCard().querySelector('.sf-unalloc-inp');
    $(inp).val('50').trigger('input'); await flush(500);
    $(E.cb()).prop('checked', false).trigger('change'); await flush(120);
    check('after editing to 50 the summary shows 50 / 42.5', E.sumX().textContent.replace(/\s+/g, '') === 'UnallocatedHours:50|RemainingHours:42.5', E.sumX().textContent);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 5: summary suppressed with no Unallocated Hours; negative Remaining is red ═══ */
  await suite('no-unalloc programs never show the summary; overallocated Remaining paints red', async () => {
    const E1 = await boot(fx({})); const { $ } = E1;
    $(E1.cb()).prop('checked', false).trigger('change'); await flush(100);
    check('expanded+unchecked with NO unalloc: no summary', E1.sumX().style.display === 'none');
    await E1.collapse();
    check('collapsed with NO unalloc: header shows only the school count', E1.secSum().textContent.trim() === '(2 schools)', E1.secSum().textContent.trim());
    check('no page errors (E1)', E1.dom.pageErrors.length === 0);
    const E2 = await boot(fx({ unalloc: 20, allocRows: [{ total: '35' }] }));
    E2.$(E2.cb()).prop('checked', false).trigger('change'); await flush(100);
    const rem = E2.sumX().querySelector('.sb-unalloc-sum-rem');
    check('Remaining \u221215 paints in the full area\u2019s red', rem && rem.textContent === '-15' && /220,\s*53,\s*69/.test(rem.style.color), rem && (rem.textContent + ' ' + rem.style.color));
    check('no page errors (E2)', E2.dom.pageErrors.length === 0);
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
