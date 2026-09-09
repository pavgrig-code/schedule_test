// t130_shday_collapse.js — TWENTY-SECOND SPEC. A horizontal Collapse/Expand control next to each Day
// label in the Staffing Hours table, using the same visual language as the other collapsible columns
// (Site Breakdown role columns, Staff/Day (Max)). Collapsed: a narrow vertical strip with the rotated
// Day label, ONE expand control, spanning header -> body -> the Total Hrs/Day row; a valued day keeps
// its Total Hrs/Day cell, an empty day's strip runs through it. Each Day is INDEPENDENTLY collapsible.
// Collapse is DISPLAY ONLY: all recalculations keep running while a Day is collapsed, and a collapsed
// day's Total Hrs/Day updates live on an edit.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  const data = {
    status: 'Draft',
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'DC', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1800); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  // the separated-section per-school Staffing Hours table
  const shTbl = () => [...pl().querySelectorAll('table')].find(t => t.querySelector('thead th[data-day]') && t.querySelector('tfoot td.day-total-u'));
  const th = (dk) => { const t = shTbl(); return t && t.querySelector('thead th[data-day="' + dk + '"]'); };
  const collapseBtn = (dk) => { const h = th(dk); return h && h.querySelector('.sh-day-collapse'); };
  const bodyCells = (dk) => { const t = shTbl(); return t ? t.querySelectorAll('tbody td[data-day="' + dk + '"]').length : -1; };
  const totalOf = (dk) => { const t = shTbl(); const c2 = t && t.querySelector('tfoot td.day-total-u[data-day="' + dk + '"]'); return c2 ? c2.textContent.trim() : '(removed)'; };
  const collapse = async (dk) => { $(collapseBtn(dk)).trigger('click'); await flush(600); };
  const collapsedTh = () => { const t = shTbl(); return t ? [...t.querySelectorAll('.pg-col-collapsed-th')] : []; };
  const strip = () => { const t = shTbl(); return t ? t.querySelector('.pg-col-strip') : null; };
  const expandVia = async (kind, dk) => { const t = shTbl(); let el = null; if (kind === 'th') { el = [...t.querySelectorAll('.pg-col-collapsed-th')].map(x => x.querySelector('button')).find(Boolean); } else { el = t.querySelector('.pg-col-strip'); } if (el) { $(el).trigger('click'); await flush(600); } };
  // Reset any leaked collapse state (the map is session-scoped and keyed gid|calId|day, so it
  // survives a re-import into the same pg-001/cal_a). Expand every collapsed column back.
  const resetCollapse = async () => { for (let i = 0; i < 8; i++) { const t = shTbl(); if (!t) break; const cth = t.querySelector('.pg-col-collapsed-th button'); if (!cth) break; $(cth).trigger('click'); await flush(400); } };

  /* ═══ 1. The expanded header carries a Collapse control; clicking it folds the column ═══ */
  await suite('Each expanded Day header carries a Collapse control that folds the column', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    check('the Staffing Hours table has day headers and a Total Hrs/Day footer', !!shTbl() && !!th('wed') && !!shTbl().querySelector('tfoot td.day-total-u'));
    check('Wednesday header carries a Collapse control', !!collapseBtn('wed'), collapseBtn('wed') && collapseBtn('wed').className);
    check('Wednesday starts expanded with its full body cells', bodyCells('wed') > 1, bodyCells('wed'));
    check('its Total Hrs/Day reads 12 (6h x 2 coaches)', totalOf('wed') === '12', totalOf('wed'));
    await collapse('wed');
    check('after Collapse: the Wednesday day header is gone (folded)', !th('wed'));
    check('a collapsed th (narrow, with an Expand control) appears', collapsedTh().length === 1 && !!collapsedTh()[0].querySelector('button'));
    check('the body cells folded into a single rowspan strip', bodyCells('wed') === 0 && !!strip() && parseInt(strip().getAttribute('rowspan'), 10) >= 1, bodyCells('wed') + '/' + (strip() && strip().getAttribute('rowspan')));
    check('the strip carries a rotated Day label', !!strip() && /vertical-rl/.test((strip().querySelector('span') || {}).style ? strip().querySelector('span').style.writingMode || strip().innerHTML : strip().innerHTML), strip() && strip().innerHTML.slice(0, 60));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Total Hrs/Day is preserved for a valued day; empty day folds through ═══ */
  await suite('A valued day keeps its Total Hrs/Day cell; an empty day\u2019s strip runs through the total row', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    check('Wednesday has a value (12); Saturday is empty', totalOf('wed') === '12' && (totalOf('sat') === '' || totalOf('sat') === '(removed)'), totalOf('wed') + '/' + totalOf('sat'));
    await collapse('wed');
    check('collapsed Wednesday PRESERVES a visible Total Hrs/Day cell showing 12', totalOf('wed') === '12', totalOf('wed'));
    // Saturday (no value) folds through the total row: strip rowspan covers the total row
    if (th('sat')) {
      const beforeRowspan = (function () { return null; })();
      await collapse('sat');
      const t = shTbl();
      const satTotCell = t.querySelector('tfoot td.day-total-u[data-day="sat"]');
      check('collapsed empty Saturday has NO separate total cell (strip runs through the total row)', !satTotCell, satTotCell ? satTotCell.textContent : 'none');
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Independent per-day collapse ═══ */
  await suite('Each Day collapses independently; collapsing one does not affect another', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    await collapse('mon'); await collapse('fri');
    check('Monday and Friday are collapsed; Tuesday stays expanded', !th('mon') && !th('fri') && !!th('tue'), [!!th('mon'), !!th('fri'), !!th('tue')].join('/'));
    check('exactly two collapsed columns', collapsedTh().length === 2, collapsedTh().length);
    // expand Monday only (via its collapsed-th button); Friday stays collapsed
    const monBtn = collapsedTh()[0].querySelector('button'); $(monBtn).trigger('click'); await flush(600);
    check('expanding Monday restores it while Friday stays collapsed', !!th('mon') && !th('fri'), [!!th('mon'), !!th('fri')].join('/'));
    check('Tuesday was never affected', !!th('tue'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Expand via the strip cell restores the full column ═══ */
  await suite('Clicking the collapsed column restores the full Day column', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    await collapse('thu');
    check('Thursday collapsed', !th('thu') && bodyCells('thu') === 0);
    await expandVia('strip', 'thu');
    check('clicking the strip restored the full Thursday column', !!th('thu') && bodyCells('thu') > 1, bodyCells('thu'));
    check('and its Total Hrs/Day is back to 12', totalOf('thu') === '12', totalOf('thu'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Recalculation keeps running while a Day is collapsed ═══ */
  await suite('A collapsed Day still recalculates: its Total Hrs/Day updates live on an edit', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    await collapse('mon');
    check('Monday collapsed, total 12', !th('mon') && totalOf('mon') === '12', totalOf('mon'));
    // change the Site Breakdown coach count 2 -> 3 while Monday is collapsed
    const sbTbl = [...pl().querySelectorAll('table')].find(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /# of Coaches/.test(c2.textContent)));
    check('the Site Breakdown table is present', !!sbTbl);
    if (sbTbl) {
      const row = sbTbl.rows[2]; const ins = [...row.querySelectorAll('input')].filter(i => !i.readOnly && !i.disabled); const cin = ins.find(i => i.value === '2') || ins[ins.length - 1];
      $(cin).val('3').trigger('input').trigger('change'); await flush(1000);
    }
    check('the coach count reached the data (3)', W._pgGuideDetails()['pg-001'].siteRowsByCal.cal_a[0].coaches_ctkk == 3);
    check('Monday is STILL collapsed after the edit', !th('mon'));
    check('the collapsed Monday Total Hrs/Day updated LIVE to 18 (6h x 3)', totalOf('mon') === '18', totalOf('mon'));
    // expanding shows the latest recalculated values
    await expandVia('strip', 'mon');
    check('expanding Monday shows the recalculated total (18)', !!th('mon') && totalOf('mon') === '18', totalOf('mon'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Collapse is display-only: it does not change any calculation or persist ═══ */
  await suite('Collapse is display-only \u2014 no calc change, not persisted', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await resetCollapse();
    const guideTot = () => { const s = W._pgGuideDetails()['pg-001']; try { const sec = d.getElementById('summary-section-pg-001'); return sec && sec.__pgCalc ? sec.__pgCalc.totals.hours : null; } catch (e) { return null; } };
    const before = guideTot();
    const detBefore = JSON.stringify(W._pgGuideDetails()['pg-001'].staffingHoursSlots);
    await collapse('wed'); await collapse('thu');
    check('the guide total hours are unchanged by collapsing (display only)', guideTot() === before, before + ' -> ' + guideTot());
    check('the stored staffing data is untouched by collapse', JSON.stringify(W._pgGuideDetails()['pg-001'].staffingHoursSlots) === detBefore);
    check('no wkExcl / collapse state leaked into guideDetails', !('shDayCollapse' in W._pgGuideDetails()['pg-001']));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
