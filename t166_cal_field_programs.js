// (fixture shared with t160) t166_cal_field_programs.js — the Summary's Programs table grouped by Field Program: a header row, the group's
// programs in their existing order, then a Field Program Total row whose # of Schools, Total Hours and Total Amount
// are the SUM of the rows above it (Total Staff Needed is left blank there for now). After EVERY change (schools, staffing counts, hours, pricing,
// COLA, Override Day Totals, Fulfillment, Freeze), with no manual refresh:
//   rows -> Field Program Total (exact, amounts to the cent) -> Total Hours / Total Amount boxes (exact) and
//   Amount Available = Not to Exceed - Total Amount; each program row also matches independent sources:
//   Amount = the Programs table's Amount (Net), Hours = the calculated block, Staff = the calendar cells' max.
const fs = require('fs');
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
const ONLY = String(process.env.ONLY || '').split(',').map(x => x.trim()).filter(Boolean);   // ONLY=1,3 runs just those suites
async function suite(n, fn) { suites++; if (ONLY.length && !ONLY.includes(String(suites))) { console.log('\u2500 (skipped) ' + n); return; } console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
async function importGuide(dom, c, json, settle) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(settle || 2200); d.createElement = ocr;
}
function fx() {
  const cal = (id, n, col, pph, last) => ({ name: n, firstDay: '2026-07-20', lastDay: last || '2026-07-31', color: col, pricePerHour: pph, billable: true, calId: id });
  const rows = [cal('cal_1', 'One', '#e57373', '80.00'), cal('cal_2', 'Two', '#64b5f6', '70.00'), cal('cal_3', 'Three', '#81c784', '60.00', '2026-07-28'), cal('cal_4', 'Four', '#ffb74d', '75.37'), cal('cal_5', 'Five', '#ba68c8', '90.00')];
  rows[1].fpId = 'fp_b'; rows[3].fpId = 'fp_b'; rows[4].fpId = 'fp_c';
  const sch = (n, id, a, b) => ({ school: n, schoolId: id, coaches_ctkk: a, ctkk: b });
  const data = {
    status: 'Draft', combinedView: false, calendarRows: rows,
    fieldPrograms: [{ id: 'fp_b' }, { id: 'fp_c', name: 'Evening' }],
    siteRowsByCal: { cal_1: [sch('S1', 's1', 1, 10), sch('S2', 's2', 2, 20)], cal_2: [sch('S3', 's3', 2, 20)], cal_3: [sch('S4', 's4', 1, 10)], cal_4: [sch('S5', 's5', 3, 30), sch('S6', 's6', 1, 10)], cal_5: [sch('S7', 's7', 2, 20)] },
    siteRows: [sch('S1', 's1', 1, 10)],
    discounts: { names: ['D1'], stages: [{ byCal: { cal_1: { name: 'D1', pct: '5' }, cal_4: { name: 'D1', pct: '10' } } }] },
    districtFloor: '30.00', cola: { on: true, pct: '2.5' }, notToExceed: { nte: '250000' },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('08:30', '14:00') }, c2: { ctkk: mkTimes('09:00', '13:00') }, c3: { ctkk: mkTimes('10:00', '16:30') }, c4: { ctkk: mkTimes('09:00', '12:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data });
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const gCard = () => [...pl().querySelectorAll('[data-guide-summary="pg-001"]')].pop();
  const box = k => gCard().querySelector('.pg-gs-box-' + k).textContent.trim();
  const cs = () => d.getElementById('cal-section-pg-001');
  const hdr = id => cs().querySelector('.cal-fp-hdr[data-fp-id="' + id + '"]');
  const body = id => cs().querySelector('.cal-fp-body[data-cal-fp="' + id + '"]');
  const chk = (id, cls) => { const h = hdr(id); return h && h.querySelector('.' + cls); };
  const set = async (id, cls, on, wait) => { const k = chk(id, cls); k.checked = on; $(k).trigger('change'); await flush(wait || 2500); };
  const progsIn = id => [...new Set([...body(id).querySelectorAll('[data-cal-id]')].map(x => x.getAttribute('data-cal-id')))].sort().join('/');
  const combined = id => body(id).querySelectorAll('.cal-combined-day').length > 0;
  const badges = id => body(id).querySelectorAll('.sf-cell-cnt').length;
  // the oracle: every program's per-day staff count, the calculated block and the Summary boxes
  const vals = () => { const m = {}; [...cs().querySelectorAll('[data-eff-cnt][data-cal-id]')].forEach(x => { const dk = x.getAttribute('data-date-key') || (x.closest('[data-date-key]') || { getAttribute: () => '' }).getAttribute('data-date-key'); m[x.getAttribute('data-cal-id') + '|' + dk] = x.getAttribute('data-eff-cnt'); });
    const sec = d.getElementById('summary-section-pg-001'); return JSON.stringify(Object.keys(m).sort().map(k => k + '=' + m[k])) + '#' + JSON.stringify(sec && sec.__pgCalc && sec.__pgCalc.calendars) + '#' + ['hours', 'amount', 'avail'].map(box).join('|'); };
  const tipShown = () => [...d.querySelectorAll('.cal-hours-breakdown')].some(e => e.style.display !== 'none' && e.textContent.trim().length > 0);
  const hide = async () => { try { W.hideCalTooltip && W.hideCalTooltip(); } catch (e) {} $(d.body).trigger('click'); await flush(300); };
  const hoverCell = id => [...body(id).querySelectorAll(combined(id) ? '.cal-combined-day' : '.cal-day-cell')].find(x => /[0-9]/.test((x.querySelector('.cal-hours') || x).textContent || ''));

  await suite('Structure: the master Calendars header keeps only Collapse All / Expand All; a Field Program header (with its own controls) above each group\u2019s Program Calendars', async () => {
    await importGuide(dom, c, fx(), 2500); await flush(1800);
    const m = cs().firstElementChild;
    check('the master header has no checkboxes any more', m.querySelectorAll('input[type="checkbox"]').length === 0 && !/Combined View|Show Staff Counts|Show Breakdown/.test(m.textContent));
    check('...and keeps Collapse All and Expand All', !!m.querySelector('.pg-calmst-collapse') && !!m.querySelector('.pg-calmst-expand'));
    check('three Field Program headers in order', JSON.stringify([...cs().querySelectorAll('.cal-fp-hdr')].map(h => h.getAttribute('data-fp-id'))) === JSON.stringify(['', 'fp_b', 'fp_c']));
    check('each body holds exactly its programs\u2019 calendars', progsIn('') === 'cal_1/cal_3' && progsIn('fp_b') === 'cal_2/cal_4' && progsIn('fp_c') === 'cal_5');
    check('groups with two or more programs offer Combined View; the one-program group does not', !!chk('', 'cal-fp-cv-chk') && !!chk('fp_b', 'cal-fp-cv-chk') && !chk('fp_c', 'cal-fp-cv-chk'));
    check('every group offers Show Staff Counts and Show Breakdown on Hover', ['', 'fp_b', 'fp_c'].every(id => chk(id, 'cal-fp-sc-chk') && chk(id, 'cal-fp-bh-chk')));
    const h = hdr('fp_c');
    check('the header is styled like every other Field Program header', h.style.fontSize === '14px' && h.style.fontWeight === '800' && h.style.color === 'rgb(76, 116, 169)');
    check('the bracket is the Field Program colour, rounded', /2px solid rgb\(76, 116, 169\)/.test(body('fp_c').style.borderLeft) && body('fp_c').style.borderRadius === '5px');
  });

  await suite('Combined View is per Field Program and uses only that group\u2019s programs; no value changes in any mix of modes', async () => {
    const V0 = vals();
    await set('fp_b', 'cal-fp-cv-chk', true);
    check('Field Program 2 shows a Combined Calendar of ONLY its two programs', combined('fp_b') && progsIn('fp_b') === 'cal_2/cal_4');
    check('the other groups keep their individual calendars', !combined('') && !combined('fp_c'));
    check('every program\u2019s per-day staff counts, the calculated block and the Summary are identical', vals() === V0);
    await set('', 'cal-fp-cv-chk', true);
    check('with two groups combined there are two separate grids, each with only its programs', combined('') && combined('fp_b') && progsIn('') === 'cal_1/cal_3' && progsIn('fp_b') === 'cal_2/cal_4');
    check('still identical values', vals() === V0);
    check('the settings are stored per group; the other group\u2019s stay untouched', det().fpCalOpts['fp_b'].combinedView === true && det().fpCalOpts[''].combinedView === true && !(det().fpCalOpts['fp_c']));
    await set('fp_b', 'cal-fp-cv-chk', false);
    check('turning it off for Field Program 2 hides only its Combined Calendar', !combined('fp_b') && combined(''));
    check('values identical again', vals() === V0);
  });

  await suite('Show Staff Counts and Show Breakdown on Hover are scoped to one Field Program (combined grids included)', async () => {
    const b0 = { fp: badges('fp_b'), ev: badges('fp_c') };
    await set('', 'cal-fp-sc-chk', false, 1500);
    check('turning Staff Counts off for the first group removes only its counts (its Combined View included)', badges('') === 0 && badges('fp_b') === b0.fp && badges('fp_c') === b0.ev && b0.fp > 0);
    await set('', 'cal-fp-sc-chk', true, 1500);
    check('turning it back on restores them', badges('') > 0);
    // hover: the first group on, Field Program 2 off
    await set('', 'cal-fp-bh-chk', true, 600); await set('fp_b', 'cal-fp-bh-chk', false, 600);
    await hide(); const c1 = hoverCell(''); $(c1).trigger('mouseenter'); await flush(700);
    check('hovering a cell in a group with hover ON opens the breakdown popup', tipShown());
    await hide(); const c2 = hoverCell('fp_b'); $(c2).trigger('mouseenter'); await flush(700);
    check('hovering a cell in a group with hover OFF opens nothing', !tipShown());
    $(c2).trigger('click'); await flush(900);
    check('...but clicking that cell still opens its breakdown window', tipShown());
    await hide();
    check('each group keeps its own hover value', det().fpCalOpts[''].showHoverBreakdown === true && det().fpCalOpts['fp_b'].showHoverBreakdown === false);
  });

  await suite('Master Collapse / Expand All drive every Field Program\u2019s calendars and Combined Calendars; settings survive export/import; legacy and default behaviour', async () => {
    const m = () => cs().firstElementChild;
    $(m().querySelector('.pg-calmst-collapse')).trigger('click'); await flush(500);
    check('Collapse All collapses the combined group (its body hidden) and every individual calendar', body('').style.display === 'none' && [...cs().querySelectorAll('.cal-fp-body:not([style*="display: none"]) .cal-vf-btn')].every(b => b.style.display === 'none'));
    check('...and leaves only Expand All', m().querySelector('.pg-calmst-collapse').style.display === 'none' && m().querySelector('.pg-calmst-expand').style.display !== 'none');
    $(m().querySelector('.pg-calmst-expand')).trigger('click'); await flush(500);
    check('Expand All restores every group', body('').style.display !== 'none' && m().querySelector('.pg-calmst-expand').style.display === 'none');
    // export / import
    let cap = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') cap = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {}; const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60); $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    const P = JSON.parse(cap);
    check('the export carries each group\u2019s Calendar settings', P.data.fpCalOpts && P.data.fpCalOpts[''].combinedView === true && P.data.fpCalOpts['fp_b'].showHoverBreakdown === false);
    await importGuide(dom, c, fx(), 2500); await flush(800); await importGuide(dom, c, JSON.stringify(P), 2500); await flush(1500);
    check('after import each group renders with its own settings', combined('') && !combined('fp_b') && chk('fp_b', 'cal-fp-bh-chk').checked === false);
    // legacy guide-wide Combined View: every group starts combined (nothing stored per group yet)
    const L = JSON.parse(fx()); L.data.combinedView = true;
    await importGuide(dom, c, JSON.stringify(L), 2500); await flush(1500);
    check('a guide saved with the old guide-wide Combined View shows every eligible group combined', combined('') && combined('fp_b') && !combined('fp_c') && !det().fpCalOpts);
    // default: hover unchecked when nothing was chosen (the harness hook forced it on for older suites)
    const hook = W.__pgHoverDefaultOn; W.__pgHoverDefaultOn = false;
    await importGuide(dom, c, fx(), 2500); await flush(1500);
    check('Show Breakdown on Hover is unchecked by default in every group', ['', 'fp_b', 'fp_c'].every(id => chk(id, 'cal-fp-bh-chk').checked === false));
    W.__pgHoverDefaultOn = hook;
    const J = JSON.parse(fx()); delete J.data.fieldPrograms; J.data.calendarRows.forEach(r => delete r.fpId);
    await importGuide(dom, c, JSON.stringify(J), 2500); await flush(1500);
    check('a single-group guide shows one Field Program header holding all five calendars', cs().querySelectorAll('.cal-fp-hdr').length === 1 && progsIn('') === 'cal_1/cal_2/cal_3/cal_4/cal_5');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  await suite('Each Calendars Field Program header has its own expand/collapse control: it drives only its calendars (or its Combined Calendar), rolls up from single calendar toggles, and follows the master; the two renamed labels', async () => {
    await importGuide(dom, c, fx(), 2500); await flush(1800);
    const fpTog = id => hdr(id).querySelector('.pg-cal-fp-toggle');
    const fpCol = id => hdr(id).getAttribute('data-collapsed') === '1';
    const blockTogs = id => [...body(id).querySelectorAll('.pg-sec-toggle')].filter(t => !t.classList.contains('pg-cal-fp-toggle'));
    const blockCol = t => /^Expand/.test(t.getAttribute('title') || '');
    check('every Field Program header has a control, expanded to start', ['', 'fp_b', 'fp_c'].every(id => fpTog(id) && fpTog(id).style.display !== 'none' && !fpCol(id)));
    $(fpTog('fp_b')).trigger('click'); await flush(500);
    check('collapsing Field Program 2 collapses both its calendars and nothing else', blockTogs('fp_b').every(blockCol) && fpCol('fp_b') && !fpCol('') && !fpCol('fp_c') && blockTogs('').every(t => !blockCol(t)));
    check('its control reads "Expand Field Program 2"', fpTog('fp_b').getAttribute('title') === 'Expand Field Program 2');
    $(fpTog('fp_b')).trigger('click'); await flush(500);
    check('expanding it restores both', blockTogs('fp_b').every(t => !blockCol(t)) && !fpCol('fp_b'));
    $(blockTogs('')[0]).trigger('click'); await flush(400);
    check('one of two calendars collapsed by hand: the group still reads expanded', !fpCol(''));
    $(blockTogs('')[1]).trigger('click'); await flush(400);
    check('both collapsed by hand: the group reads collapsed', fpCol(''));
    $(hdr('').querySelector('.cal-fp-name')).trigger('click'); await flush(500);
    check('clicking the header itself expands them again', !fpCol('') && blockTogs('').every(t => !blockCol(t)));
    await set('fp_b', 'cal-fp-cv-chk', true);
    $(fpTog('fp_b')).trigger('click'); await flush(500);
    check('for a combined group the control collapses its Combined Calendar (body hidden, program list shown)', fpCol('fp_b') && body('fp_b').style.display === 'none' && hdr('fp_b').querySelector('.cal-fp-sum').style.display !== 'none');
    const m = cs().firstElementChild;
    $(m.querySelector('.pg-calmst-expand')).trigger('click'); await flush(500);
    check('master Expand All expands every group, the combined one included', ['', 'fp_b', 'fp_c'].every(id => !fpCol(id)) && body('fp_b').style.display !== 'none');
    $(m.querySelector('.pg-calmst-collapse')).trigger('click'); await flush(500);
    check('master Collapse All collapses every group', ['', 'fp_b', 'fp_c'].every(fpCol));
    $(m.querySelector('.pg-calmst-expand')).trigger('click'); await flush(500);
    await set('fp_b', 'cal-fp-cv-chk', false);
    // renamed labels: the Extra Shift editor and the Staffing Hours "Copy to" menu
    const cell = [...body('').querySelectorAll('.cal-day-cell')].find(x => /[0-9]/.test((x.querySelector('.cal-hours') || x).textContent || ''));
    $(cell).trigger('click'); await flush(700);
    const pop0 = [...d.querySelectorAll('.cal-hours-breakdown')].find(e => e.style.display !== 'none');
    const addEl = pop0 && [...pop0.querySelectorAll('*')].find(e => e.children.length === 0 && /Add Extra Shift/.test(e.textContent));
    if (addEl) { $(addEl).trigger('click'); await flush(500); }
    const ed = [...d.body.children].filter(el => el.tagName === 'DIV' && /Extra Shift for/.test(el.textContent) && el.style.display !== 'none').pop();
    const labels = ed ? [...ed.querySelectorAll('*')].filter(e => e.children.length === 0).map(x => x.textContent.trim()) : [];
    check('the Extra Shift editor labels its picker "Program *" (no "Calendar" label)', !!ed && labels.includes('Program *') && !labels.some(t => /^Calendar\b/.test(t)), labels.filter(t => /\*/.test(t)).join(' | '));
    if (ed) { const cancel = [...ed.querySelectorAll('button')].find(b => /Cancel|Close/.test(b.textContent)); if (cancel) { $(cancel).trigger('click'); await flush(200); } }
    await hide();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
