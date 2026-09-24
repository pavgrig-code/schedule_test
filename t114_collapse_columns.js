// t114_collapse_columns.js — Twenty-fourth spec: collapse/expand for (1) the Staffing Allocation
// Days section, (2) five Program Calendars columns, (3) Discounts base PPH + per-discount %/PPH,
// (4) Student-Section role columns, (5) the two Site Breakdown Total columns. Every collapsible
// element follows the shared toolkit: LEFT chevron collapses; the collapsed column is narrow with a
// single RIGHT expand chevron at the top and a centered rotated label; clicking anywhere in the
// collapsed column expands it; values are preserved (never recalculated) across collapse.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function svgDir(btn) { const p = btn && btn.querySelector('path'); if (!p) return null; const dd = p.getAttribute('d'); if (/^M15\.41/.test(dd)) return 'left'; if (/^M10 6/.test(dd)) return 'right'; return dd.slice(0, 6); }
function fx(opts) {
  opts = opts || {};
  const A = opts.siteRows || [{ school: 'Zeta', schoolId: 'z1', coaches_ctkk: 2, ctkk: 20, aide: 3 }, { school: 'Alpha', schoolId: 'a1', coaches_ctkk: 1, ctkk: 10, aide: 1 }];
  const cals = [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }];
  if (opts.twoCals) cals.push({ name: 'CalB', firstDay: '2026-08-03', lastDay: '2026-08-07', color: '#64b5f6', pricePerHour: '50.00', billable: true, calId: 'cal_b' });
  const data = {
    status: 'Draft', combinedView: false, calendarRows: cals,
    siteRows: A, siteRowsByCal: (function () { const m = {}; cals.forEach(c => m[c.calId] = JSON.parse(JSON.stringify(A))); return m; })(),
    staffingOptsByCal: (function () { const m = {}; cals.forEach(c => m[c.calId] = { bySchool: false, byPods: false, alternateWeeks: false }); return m; })(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:30') } },
    roles: opts.roles || [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }, { key: 'aide', name: 'Aide', isCoach: false }]
  };
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
  await importGuide(dom, c, json); await flush(1200);
  return E;
}

(async () => {

  /* ═══ Suite 1: Program Calendars — five collapsible columns ═══ */
  await suite('Program Calendars: Length, Scheduled Hrs, Remaining Hrs, PPH, Staff/Day (Max) collapse and expand', async () => {
    const E = await boot(fx({ twoCals: true })); const { dom, $ } = E;
    const pc = () => [...E.pl().querySelectorAll('table')].find(t => t.querySelector('td.pg-cal-length, td.pg-col-strip'));
    const hCols = () => [...pc().querySelectorAll('thead th')].length;
    const wanted = { 'Length': 'th.pg-cal-h-length', 'Scheduled Hrs': 'th.pg-cal-h-sched', 'Remaining Hrs': 'th.pg-cal-h-remain', 'PPH': 'th.pg-cal-h-pph', 'Total Staff Needed': 'th.pg-cal-h-maxcnt' };
    Object.keys(wanted).forEach(lbl => {
      const th = pc().querySelector(wanted[lbl]);
      check(lbl + ' header carries a LEFT collapse chevron', !!th && svgDir(th.querySelector('.pg-col-toggle')) === 'left', lbl);
    });
    const base = hCols();
    // collapse Scheduled Hrs
    $(pc().querySelector('th.pg-cal-h-sched .pg-col-toggle')).trigger('click'); await flush(500);
    const cth = pc().querySelector('.pg-col-collapsed-th');
    check('collapsing yields a narrow collapsed th with a RIGHT expand chevron', !!cth && svgDir(cth.querySelector('.pg-col-toggle')) === 'right');
    const strip = pc().querySelector('tbody .pg-col-strip');
    check('the strip carries the centered rotated label, spanning both calendars (rowspan 2)', !!strip && strip.getAttribute('rowspan') === '2' && /Scheduled Hrs/.test(strip.textContent) && strip.style.verticalAlign === 'middle' && /vertical-rl/.test(strip.querySelector('span').style.cssText));
    check('the column count is unchanged (still one, now narrow)', hCols() === base, base + ' -> ' + hCols());
    // expand by clicking the strip
    $(strip).trigger('click'); await flush(500);
    check('clicking the strip restores the Scheduled Hrs header and cells', !!pc().querySelector('th.pg-cal-h-sched') && !pc().querySelector('.pg-col-strip'));
    // collapse Staff/Day (Max) which owns a total cell -> narrowed, value preserved
    $(pc().querySelector('th.pg-cal-h-maxcnt .pg-col-toggle')).trigger('click'); await flush(500);
    check('Staff/Day (Max) collapsed keeps its (narrowed) total cell', !!pc().querySelector('tfoot .pg-cal-total-maxcnt'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: Discounts — base PPH and per-discount %/PPH ═══ */
  await suite('Discounts: base PPH and each discount\u2019s % and PPH columns collapse independently', async () => {
    const E = await boot(fx({ twoCals: true })); const { dom, d, $ } = E;
    const sec = () => d.getElementById('discounts-section-pg-001');
    const tog = sec().querySelector('.pg-sec-toggle');
    if (/Expand/.test(tog.getAttribute('title') || '') || tog.getAttribute('aria-expanded') === 'false') { $(tog).trigger('click'); await flush(500); }
    const tbl = () => sec().querySelector('table.pg-disc-table');
    $(sec().querySelector('.pg-disc-add')).trigger('click'); await flush(800);
    check('base PPH header carries a LEFT collapse chevron', svgDir(tbl().querySelector('th.pg-disc-h-basepph .pg-col-toggle')) === 'left');
    check('discount 1 % header carries a LEFT collapse chevron', svgDir(tbl().querySelector('th.pg-disc-h-pct-0 .pg-col-toggle')) === 'left');
    check('discount 1 PPH header carries a LEFT collapse chevron', svgDir(tbl().querySelector('th.pg-disc-h-pph-0 .pg-col-toggle')) === 'left');
    // collapse base PPH
    $(tbl().querySelector('th.pg-disc-h-basepph .pg-col-toggle')).trigger('click'); await flush(500);
    const bStrip = [...tbl().querySelectorAll('tbody .pg-col-strip')].find(s => s.textContent.trim() === 'PPH Initial');
    check('base PPH collapses to a strip (rotated "PPH", rowspan 2 for two calendars)', !!bStrip && bStrip.getAttribute('rowspan') === '2');
    check('a narrow collapsed th with a RIGHT expand chevron replaces the header', svgDir(tbl().querySelector('.pg-col-collapsed-th .pg-col-toggle')) === 'right');
    // collapse discount 1 % independently
    $(tbl().querySelector('th.pg-disc-h-pct-0 .pg-col-toggle')).trigger('click'); await flush(500);
    const strips = [...tbl().querySelectorAll('tbody .pg-col-strip')].map(s => s.textContent.trim());
    check('both columns collapse independently (base PPH strip and Discount 1 % strip coexist)', strips.indexOf('PPH Initial') >= 0 && strips.some(x => /Discount 1 %/.test(x)), JSON.stringify(strips));
    // expand base PPH back
    const bStrip2 = [...tbl().querySelectorAll('tbody .pg-col-strip')].find(s => s.textContent.trim() === 'PPH Initial');
    $(bStrip2).trigger('click'); await flush(500);
    check('expanding base PPH restores its cells', [...tbl().querySelectorAll('tbody tr.pg-disc-row')].every(r => !!r.querySelector('td.pg-disc-col-basepph')));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: Site Breakdown — Student-Section role columns ═══ */
  await suite('Site Breakdown Student Section: every role column collapses independently', async () => {
    const E = await boot(fx({ roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }, { key: 'read', name: 'Reading', isCoach: true, spc: 8 }] }));
    const { dom, $ } = E;
    const sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
    const tbl = () => [...sb().querySelectorAll('table')].find(t => t.querySelector('th.sb-stu-role-th, .sb-stu-role-collapsed-th'));
    const stuHdrs = () => [...tbl().querySelectorAll('th.sb-stu-role-th')];
    check('each student-section role header carries a LEFT collapse chevron', stuHdrs().length === 2 && stuHdrs().every(th => svgDir(th.querySelector('.pg-col-toggle')) === 'left'), String(stuHdrs().length));
    $(stuHdrs()[0].querySelector('.pg-col-toggle')).trigger('click'); await flush(500);
    const cth = sb().querySelector('.sb-stu-role-collapsed-th');
    check('collapsing a student role yields a narrow collapsed th with a RIGHT expand chevron', !!cth && svgDir(cth.querySelector('.pg-col-toggle')) === 'right');
    const strip = sb().querySelector('tbody .pg-col-strip');
    check('the strip carries the centered rotated role name', !!strip && /TK\/K/.test(strip.textContent) && strip.style.verticalAlign === 'middle');
    check('the role total stays displayed (column has values)', !!sb().querySelector('.site-total-row .tot-stu-ctkk'));
    // the OTHER student role remains expanded
    check('the other student role is still expanded and independently collapsible', !!tbl().querySelector('th.sb-stu-role-th[data-role-key="read"]'));
    // expand back
    $(strip).trigger('click'); await flush(500);
    check('expanding restores the student column inputs', [...sb().querySelectorAll('tbody tr:not(.site-total-row)')].every(tr => !!tr.querySelector('input[data-key="ctkk"]')));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4: Site Breakdown — Total Coaches / Total Staff columns ═══ */
  await suite('Site Breakdown: the Total # of Coaches / Total # of Staff columns collapse with the merged-total rule', async () => {
    const E = await boot(fx()); const { dom, $ } = E;
    const sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
    const tbl = () => [...sb().querySelectorAll('table')].find(t => t.querySelector('th.sb-tot-h-coaches, .pg-col-collapsed-th'));
    check('the Total Coaches header carries a LEFT collapse chevron', svgDir(sb().querySelector('th.sb-tot-h-coaches .pg-col-toggle')) === 'left');
    check('the Total Staff header carries a LEFT collapse chevron', svgDir(sb().querySelector('th.sb-tot-h-staff .pg-col-toggle')) === 'left');
    $(sb().querySelector('th.sb-tot-h-coaches .pg-col-toggle')).trigger('click'); await flush(500);
    const strip = sb().querySelector('tbody .pg-col-strip');
    const nData = [...sb().querySelectorAll('tbody tr:not(.site-total-row)')].length;
    check('collapsed with values: strip spans the data rows only, Total row keeps its value', strip && strip.getAttribute('rowspan') === String(nData) && !!sb().querySelector('.site-total-row .tot-coaches') && sb().querySelector('.site-total-row .tot-coaches').textContent === '3');
    check('a narrow collapsed th with a RIGHT expand chevron replaces the header', svgDir(sb().querySelector('.pg-col-collapsed-th .pg-col-toggle')) === 'right');
    // grid integrity
    const leaf = [...tbl().querySelectorAll('thead tr:first-child th')].reduce((s, th) => s + (th.colSpan || 1), 0);
    const totRow = sb().querySelector('.site-total-row');
    const spanning = [...sb().querySelectorAll('.pg-col-strip')].filter(v => parseInt(v.getAttribute('rowspan')) >= nData + 1).length;
    check('grid column counts stay consistent', ([...totRow.children].reduce((s, td) => s + (td.colSpan || 1), 0) + spanning) === leaf);
    // expand
    $(strip).trigger('click'); await flush(500);
    check('expanding restores the Total Coaches column and its row inputs', [...sb().querySelectorAll('tbody tr:not(.site-total-row)')].every(tr => !!tr.querySelector('.total-coaches')));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4b: Total # of Students collapses like the others; labels drop "Per Site" (27th spec) ═══ */
  await suite('Total # of Students collapses to a centered rotated strip; all three total labels drop "Per Site"', async () => {
    const E = await boot(fx()); const { dom, $ } = E;
    const sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
    const stuH = sb().querySelector('th.sb-tot-h-students');
    check('the Total # of Students header carries a LEFT collapse chevron', !!stuH && svgDir(stuH.querySelector('.pg-col-toggle')) === 'left');
    $(stuH.querySelector('.pg-col-toggle')).trigger('click'); await flush(500);
    const strip = [...sb().querySelectorAll('tbody .pg-col-strip')].find(s => /Total # of Students/.test(s.textContent));
    check('it collapses to a narrow vertical strip with the centered rotated "Total # of Students" label', !!strip && strip.style.verticalAlign === 'middle' && strip.style.width === '1px' && /vertical-rl/.test(strip.querySelector('span').style.cssText));
    const cth = sb().querySelector('.pg-col-collapsed-th');
    check('a narrow collapsed th with a RIGHT expand icon replaces the header (like Total # of Staff)', !!cth && svgDir(cth.querySelector('.pg-col-toggle')) === 'right' && cth.style.width === '1px');
    check('the Total # of Students value is preserved in the Total row', !!sb().querySelector('.site-total-row .tot-students'));
    $(strip).trigger('click'); await flush(500);
    check('expanding restores the Total # of Students column', !!sb().querySelector('th.sb-tot-h-students') && !sb().querySelector('.pg-col-strip'));
    // Labels: collapse each total and confirm no "Per Site" in any rotated strip
    ['students', 'coaches', 'staff'].forEach(tc => { const h = sb().querySelector('th.sb-tot-h-' + tc + ' .pg-col-toggle'); if (h) $(h).trigger('click'); });
    await flush(600);
    const labels = [...sb().querySelectorAll('.pg-col-strip')].map(s => s.textContent.trim());
    check('the collapsed labels are "Total # of Students/Coaches/Staff" with no "Per Site"', labels.some(l => l === 'Total # of Students') && labels.some(l => l === 'Total # of Coaches') && labels.some(l => l === 'Total # of Staff') && !labels.some(l => /Per Site/.test(l)), JSON.stringify(labels));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 5: Staffing Allocation — Days section ═══ */
  await suite('Staffing Allocation Days section collapses to a narrow vertical column like Weeks', async () => {
    const E = await boot(fx()); const { dom, $ } = E;
    const tbl = () => E.pl().querySelector('.sf-alloc-table');
    const daysTitle = tbl().querySelector('.sf-alloc-title-days');
    check('the Days title carries a LEFT collapse chevron', svgDir(daysTitle.querySelector('.sf-alloc-days-toggle')) === 'left' && /Days/.test(daysTitle.textContent));
    const dayCellsBefore = tbl().querySelectorAll('tbody td.sf-alloc-cell').length;
    check('day cells are present while expanded', dayCellsBefore > 0, String(dayCellsBefore));
    $(daysTitle.querySelector('.sf-alloc-days-toggle')).trigger('click'); await flush(700);
    const collTitle = tbl().querySelector('.sf-alloc-title-days-collapsed');
    check('collapsing yields a narrow collapsed title th with a RIGHT expand chevron', !!collTitle && svgDir(collTitle.querySelector('.sf-alloc-days-toggle')) === 'right');
    const vert = tbl().querySelector('td.sf-alloc-days-vert');
    check('a rotated centered "Days" strip spans the school rows', !!vert && /Days/.test(vert.textContent) && vert.style.verticalAlign === 'middle' && /vertical-rl/.test(vert.querySelector('span').style.cssText));
    check('all day header columns and body cells are removed while collapsed', tbl().querySelectorAll('thead .sf-alloc-day-h').length === 0 && tbl().querySelectorAll('tbody td.sf-alloc-cell').length === 0);
    // expand via the strip
    $(vert).trigger('click'); await flush(700);
    check('clicking the strip restores every day cell (allocation data intact)', tbl().querySelectorAll('tbody td.sf-alloc-cell').length === dayCellsBefore);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 6: section headers extend over their Total column; labels renamed (twenty-fifth spec) ═══ */
  await suite('Site Breakdown headers: Students/Coaches groups span their Total column; Per-Site labels renamed', async () => {
    const E = await boot(fx({ roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }, { key: 'read', name: 'Reading', isCoach: true, spc: 8 }, { key: 'aide', name: 'Aide', isCoach: false }] }));
    const { dom } = E;
    const sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
    const tbl = () => [...sb().querySelectorAll('table')].find(t => [...t.querySelectorAll('th')].some(x => /# of Coaches/.test(x.textContent)));
    const r1 = () => [...tbl().querySelectorAll('thead tr:first-child th')];
    const r2 = () => [...tbl().querySelectorAll('thead tr:nth-child(2) th')];
    const stuG = r1().find(th => /# of Students/.test(th.textContent));
    const coachG = r1().find(th => /# of Coaches/.test(th.textContent));
    check('# of Students group spans its 2 role columns PLUS the Total column (colspan 3)', stuG && stuG.colSpan === 3, stuG && String(stuG.colSpan));
    check('# of Coaches group spans its 2 role columns PLUS the Total column (colspan 3)', coachG && coachG.colSpan === 3, coachG && String(coachG.colSpan));
    check('Total # of Students now sits in row 2 inside the Students group, renamed (no "Per Site")', r2().some(th => th.textContent.trim().replace(/\s+/g, ' ') === 'Total # of Students'));
    check('Total # of Coaches now sits in row 2 inside the Coaches group, renamed', r2().some(th => th.textContent.trim().replace(/\s+/g, ' ') === 'Total # of Coaches'));
    const staffTh = r1().find(th => /Total/.test(th.textContent) && /Staff/.test(th.textContent));
    check('Total # of Staff renamed (standalone rowspan-2 column, no "Per Site")', !!staffTh && /# of Staff/.test(staffTh.innerHTML) && !/Per Site/.test(staffTh.innerHTML));
    check('# of Specialized Staff renamed to # of Specialized', r1().some(th => th.textContent.trim() === '# of Specialized') && !r1().some(th => /# of Specialized Staff/.test(th.textContent)));
    check('no "Per Site" text remains anywhere in the table header', ![...tbl().querySelectorAll('thead th')].some(th => /Per Site/.test(th.textContent)));
    // grid integrity with the restructured groups
    const leaf = r1().reduce((s, th) => s + (th.colSpan || 1), 0);
    const dr = [...sb().querySelectorAll('tbody tr:not(.site-total-row)')][0];
    check('grid stays consistent (header leaf == data row cells)', leaf === [...dr.children].reduce((s, td) => s + (td.colSpan || 1), 0), leaf + ' vs ' + [...dr.children].reduce((s, td) => s + (td.colSpan || 1), 0));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
