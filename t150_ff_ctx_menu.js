// t150_ff_ctx_menu.js — Fulfillment controls in the calendar context menus (individual / combined / multi-
// select): section above Freeze Schedule with a divider; highlighting + counts reflect the SAVED checkbox
// state; staged pick + Save-only-when-changing; Close discards; Save writes the SAME store the breakdown
// checkbox uses, only enabling program-days WITH data; everything recalcs and reconciles.
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
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001']; const sec = () => d.getElementById('fulfillment-section-pg-001');
  const cellOf = (dk, cal) => { const els = [...pl().querySelectorAll('.cal-day-cell[data-date-key="' + dk + '"]')]; return els.find(e => cal ? e.getAttribute('data-cal-id') === cal : !e.classList.contains('cal-combined-carrier')) || els[0]; };
  const hrsOf = (dk, cal) => parseFloat(cellOf(dk, cal).querySelector('.cal-hours').textContent) || 0;
  const cntOf = (dk, cal) => parseInt(cellOf(dk, cal).getAttribute('data-eff-cnt'), 10) || 0;
  const colOf = (dk, cal) => cellOf(dk, cal).querySelector('.cal-hours').style.color;
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const menu = () => d.querySelector('.cal-ctx-menu');
  const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
  const multiMenu = () => [...d.querySelectorAll('div')].find(x => x.style && x.style.position === 'fixed' && x.querySelector('.cal-ctx-ff') && x !== menu());
  const opts = m => ({ use: m.querySelector('.cal-ctx-ff-opt[data-ff-action="use"]'), ign: m.querySelector('.cal-ctx-ff-opt[data-ff-action="ignore"]') });
  const state = m => { const o = opts(m); return { useCur: o.use.getAttribute('data-ff-current') === '1', ignCur: o.ign.getAttribute('data-ff-current') === '1', useCnt: o.use.querySelector('.cal-ctx-ff-cnt').textContent, ignCnt: o.ign.querySelector('.cal-ctx-ff-cnt').textContent }; };
  const applyBtn = m => leaves(m).find(e => e.textContent.trim() === 'Apply');
  const closeBtn = m => leaves(m).find(e => e.textContent.trim() === 'Close');
  const progAll = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent))); const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); return [...t.tBodies[0].rows].map(r => parseFloat(r.cells[i].textContent) || 0).reduce((a, b) => a + b, 0); };
  const summaryHours = () => parseFloat(pl().querySelector('[data-guide-summary] .pg-gs-box-hours').textContent);
  const summaryAmt = () => parseFloat(pl().querySelector('[data-guide-summary] .pg-gs-box-amount').textContent.replace(/[^0-9.]/g, ''));
  const flags = () => det().fulfillmentAuth || {};
  const HDR = 'Field Program ID,Field Program Name,Shift Date,Produced Hours,Calculator Hours,Price Per Hour\n';
  const seed = async () => {
    await importGuide(dom, c, fixture()); await flush(1000);
    const f = { name: 'f.csv', arrayBuffer: async () => new ArrayBuffer(0), text: async () => HDR + [['1', 'PA', '2026-07-06', '20', '1', '80'], ['1', 'PA', '2026-07-07', '21', '1', '80'], ['1', 'PA', '2026-07-08', '22', '1', '80'], ['2', 'PB', '2026-07-06', '5', '1', '70']].map(r => r.join(',')).join('\n') + '\n' };
    const inp = sec().querySelector('.ff-file'); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); $(inp).trigger('change'); await flush(1200);
    const rr = sec().querySelectorAll('.ff-review-row'); $(rr[0].querySelector('.ff-rev-cal')).val('cal_a').trigger('change'); await flush(40); $(rr[0].querySelector('.ff-rev-school')).val('s1').trigger('change'); await flush(40);
    $(rr[1].querySelector('.ff-rev-cal')).val('cal_b').trigger('change'); await flush(40); $(rr[1].querySelector('.ff-rev-school')).val('s1').trigger('change'); await flush(40); $(sec().querySelector('.ff-review-confirm')).trigger('click'); await flush(1200);
  };
  const reconcile = label => { check(label + ': Programs (all rows) == Summary hours', progAll() === summaryHours(), progAll() + '/' + summaryHours()); check(label + ': Summary amount == hours x PPH mix (>0)', summaryAmt() > 0); };

  await suite('Individual menu: Fulfillment section above Freeze with a divider; highlight reflects the SAVED state; pick stages, Save shows only when it changes something; Close discards; Save writes the shared checkbox store and recalcs', async () => {
    await seed();
    const D = '2026-07-07'; const base = hrsOf(D, 'cal_a');
    fire(cellOf(D, 'cal_a'), 'contextmenu'); await flush(300); let m = menu();
    check('the section exists above Freeze Schedule with a divider', !!m.querySelector('.cal-ctx-ff') && !!(m.querySelector('.cal-ctx-ff').compareDocumentPosition(m.querySelector('.cal-ctx-freeze')) & 4) && !!m.querySelector('.cal-ctx-ff-div'));
    check('two options: Use Fulfillment / Ignore Fulfillment', /Use Fulfillment/.test(opts(m).use.textContent) && /Ignore Fulfillment/.test(opts(m).ign.textContent));
    check('no section label (the Fulfillment title is gone) and both controls are 12px', !m.querySelector('.cal-ctx-ff-title') && opts(m).use.style.fontSize === '12px' && opts(m).ign.style.fontSize === '12px', opts(m).use.style.fontSize);
    check('nothing enabled -> Ignore is highlighted as current, no counts', !state(m).useCur && state(m).ignCur && state(m).useCnt === '' && state(m).ignCnt === '', JSON.stringify(state(m)));
    check('Save is hidden until a pick', !applyBtn(m) || applyBtn(m).style.display === 'none');
    $(opts(m).ign).trigger('click'); await flush(100);
    check('picking the CURRENT state (Ignore) stages it but shows NO Save (it would change nothing)', opts(m).ign.getAttribute('data-ff-staged') === '1' && (!applyBtn(m) || applyBtn(m).style.display === 'none'));
    $(opts(m).use).trigger('click'); await flush(100);
    check('picking Use stages it and reveals Save', opts(m).use.getAttribute('data-ff-staged') === '1' && applyBtn(m).style.display !== 'none');
    $(closeBtn(m)).trigger('click'); await flush(300);
    check('Close without Save changes nothing (no flag, hours unchanged)', !flags()['cal_a|' + D] && hrsOf(D, 'cal_a') === base);
    fire(cellOf(D, 'cal_a'), 'contextmenu'); await flush(300); m = menu(); $(opts(m).use).trigger('click'); await flush(100); $(applyBtn(m)).trigger('click'); await flush(1400);
    check('Use + Save sets the SAME flag the breakdown checkbox uses', flags()['cal_a|' + D] === true);
    check('the cell shows the Fulfillment hours (21) in green; the staff count is unchanged (3)', hrsOf(D, 'cal_a') === 21 && /31,\s*115,\s*76/.test(colOf(D, 'cal_a')) && cntOf(D, 'cal_a') === 3, hrsOf(D, 'cal_a') + ' ' + colOf(D, 'cal_a') + ' ' + cntOf(D, 'cal_a'));
    reconcile('after Use');
    // the breakdown checkbox reflects it
    $(cellOf(D, 'cal_a')).trigger('click'); await flush(600); const pp = [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
    check('the breakdown checkbox for that day is now checked (same state)', !!pp && pp.querySelector('.cal-tip-ff-chk').checked);
    $(d.body).trigger('click'); await flush(200);
    fire(cellOf(D, 'cal_a'), 'contextmenu'); await flush(300); m = menu();
    check('reopen: Use is highlighted as current', state(m).useCur && !state(m).ignCur);
    $(opts(m).ign).trigger('click'); await flush(100); $(applyBtn(m)).trigger('click'); await flush(1400);
    check('Ignore + Save clears the flag and restores the inherited hours + label colour', !flags()['cal_a|' + D] && hrsOf(D, 'cal_a') === base && /60,\s*64,\s*67/.test(colOf(D, 'cal_a')), hrsOf(D, 'cal_a') + ' ' + colOf(D, 'cal_a'));
    reconcile('after Ignore');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  await suite('Multi-select: MIXED state shows counts next to both options with neither highlighted; Use enables every selected day WITH data; all-on shows Use as current; Ignore clears them all; unrelated days untouched', async () => {
    await seed();
    // pre-enable 07-07 via the breakdown checkbox path
    W._pgFf; det().fulfillmentAuth = { 'cal_a|2026-07-07': true }; d.getElementById('staffing-section-pg-001')._recalcAll(); await flush(800);
    const untouched = hrsOf('2026-07-09', 'cal_a');
    fire(cellOf('2026-07-06', 'cal_a'), 'mousedown', { shiftKey: true }); await flush(40); fire(cellOf('2026-07-08', 'cal_a'), 'mousedown', { shiftKey: true }); await flush(80);
    fire(cellOf('2026-07-06', 'cal_a'), 'contextmenu'); await flush(300); let mm = multiMenu();
    check('the multi-select menu has the Fulfillment section', !!mm);
    check('mixed: counts shown - Use (1) / Ignore (2) - and neither highlighted as current', state(mm).useCnt === '(1)' && state(mm).ignCnt === '(2)' && !state(mm).useCur && !state(mm).ignCur, JSON.stringify(state(mm)));
    $(opts(mm).use).trigger('click'); await flush(100);
    check('picking Use reveals Apply', applyBtn(mm).style.display !== 'none');
    $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('Use + Apply enabled all three selected days (each exactly once)', ['06', '07', '08'].every(dd => flags()['cal_a|2026-07-' + dd] === true) && Object.keys(flags()).length === 3, JSON.stringify(flags()));
    check('the cells show their Fulfillment hours in green (20 / 21 / 22)', hrsOf('2026-07-06', 'cal_a') === 20 && hrsOf('2026-07-07', 'cal_a') === 21 && hrsOf('2026-07-08', 'cal_a') === 22 && /31,\s*115,\s*76/.test(colOf('2026-07-08', 'cal_a')));
    check('an unrelated day is untouched', hrsOf('2026-07-09', 'cal_a') === untouched && !flags()['cal_a|2026-07-09']);
    reconcile('after multi Use');
    fire(cellOf('2026-07-06', 'cal_a'), 'mousedown', { shiftKey: true }); await flush(40); fire(cellOf('2026-07-08', 'cal_a'), 'mousedown', { shiftKey: true }); await flush(80); fire(cellOf('2026-07-06', 'cal_a'), 'contextmenu'); await flush(300); mm = multiMenu();
    check('reopen all-on: Use is current, no counts', state(mm).useCur && !state(mm).ignCur && state(mm).useCnt === '' && state(mm).ignCnt === '', JSON.stringify(state(mm)));
    $(opts(mm).ign).trigger('click'); await flush(100); $(applyBtn(mm)).trigger('click'); await flush(1500);
    check('Ignore + Apply clears all three and restores inherited hours/colour', Object.keys(flags()).length === 0 && hrsOf('2026-07-07', 'cal_a') === untouched && /60,\s*64,\s*67/.test(colOf('2026-07-07', 'cal_a')), JSON.stringify(flags()));
    reconcile('after multi Ignore');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  await suite('Combined Calendar cell: Use applies to EVERY program on that date that has data; a program without data is never enabled; the day still reconciles', async () => {
    await seed();
    det().combinedView = true; const cvChk = [...pl().querySelectorAll('input[type=checkbox]')].find(x => x.parentElement && /Combined/i.test(x.parentElement.textContent)); if (cvChk && !cvChk.checked) { cvChk.checked = true; $(cvChk).trigger('change'); await flush(1200); }
    const comb = pl().querySelector('.cal-combined-day[data-date-key="2026-07-06"]');
    check('07-06 renders as a combined cell with two program carriers', !!comb && comb.querySelectorAll('.cal-combined-carrier').length === 2);
    $(comb).trigger('contextmenu'); await flush(300); let cm = menu();
    check('the combined menu shows the Fulfillment section (both programs off -> Ignore current)', !!cm.querySelector('.cal-ctx-ff') && state(cm).ignCur);
    $(opts(cm).use).trigger('click'); await flush(100); $(applyBtn(cm)).trigger('click'); await flush(1500);
    check('Use + Save enabled BOTH programs on 07-06 (both have data)', flags()['cal_a|2026-07-06'] === true && flags()['cal_b|2026-07-06'] === true && Object.keys(flags()).length === 2, JSON.stringify(flags()));
    reconcile('combined Use');
    // 07-07: cal_a has data, cal_b does not -> only cal_a enabled
    const comb7 = pl().querySelector('.cal-combined-day[data-date-key="2026-07-07"]');
    $(comb7).trigger('contextmenu'); await flush(300); cm = menu(); $(opts(cm).use).trigger('click'); await flush(100); $(applyBtn(cm)).trigger('click'); await flush(1500);
    check('on a date where only one program has data, only that program is enabled (no empty override)', flags()['cal_a|2026-07-07'] === true && !flags()['cal_b|2026-07-07'], JSON.stringify(flags()));
    $(comb7).trigger('contextmenu'); await flush(300); cm = menu();
    // (spec) cal_b has no data on 07-07, so it is NOT counted: the single eligible program is on -> Use is current, no counts
    check('reopen 07-07: the program without data is not counted -> Use current (1 eligible, on), no mixed counts', state(cm).useCur && !state(cm).ignCur && state(cm).useCnt === '' && state(cm).ignCnt === '' && cm.querySelector('.cal-ctx-ff').getAttribute('data-ff-eligible') === '1', JSON.stringify(state(cm)));
    $(closeBtn(cm)).trigger('click'); await flush(200);
    reconcile('combined final');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
