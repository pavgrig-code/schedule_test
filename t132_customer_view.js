// t132_customer_view.js — TWENTY-FOURTH SPEC. A Customer View toggle button (left of Collapse All)
// that HIDES internal pricing/rate fields for presenting a Planning Guide to a customer: Programs
// PPH / Amount / PPH (Net); the Amount-breakdown popup's PPH (Net); Discounts base PPH + each
// discount's % and PPH; every Program Summary's PPH (Net); the PG Summary's PPH (Net). It is
// DISPLAY-ONLY — no data, discount, PPH, Amount, override, staffing or total changes; hidden values
// still exist and calculate. Toggling preserves collapse/scroll/view state (no rebuild). Clicking the
// green button again restores everything.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  const data = {
    status: 'Draft',
    calendarRows: [
      { name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '100.00', billable: true },
      { name: 'CalB', calId: 'cal_b', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#64b5f6', pricePerHour: '90.00', billable: true }
    ],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }], cal_b: [{ school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
    staffingOptsByCal: { cal_a: { bySchool: false }, cal_b: { bySchool: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') } },
    discounts: { names: ['Promo'], stages: [{ byCal: { cal_a: { name: 'Promo', pct: '10' }, cal_b: { name: 'Promo', pct: '10' } } }] }, districtFloor: '0'
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'CV', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(2400); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const btn = () => pl().querySelector('.pg-customer-view-btn');
  const toggle = async () => { $(btn()).trigger('click'); await flush(500); };
  const prog = () => [...pl().querySelectorAll('table')].find(t => { const hr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1]; return hr && [...hr.cells].some(c2 => /Meal Breaks/.test(c2.textContent)); });
  const visibleProgHeaders = () => { const t = prog(); const hr = t.tHead.rows[t.tHead.rows.length - 1]; return [...hr.cells].filter(c2 => c2.style.display !== 'none').map(c2 => c2.textContent.replace(/\s+/g, ' ').trim()); };
  const cellHidden = (sel) => { const c2 = pl().querySelector(sel); return c2 ? c2.style.display === 'none' : null; };
  const sumTables = () => [...pl().querySelectorAll('[id^="summary-section-"] table')];
  const anySummaryShowsNpph = () => sumTables().some(t => { const hr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1]; return hr && [...hr.cells].some(c2 => c2.style.display !== 'none' && /PPH \(Net\)/.test(c2.textContent)); });

  /* ═══ 1. The button: placement, default style, green when on, restores on second click ═══ */
  await suite('The Customer View button sits left of Collapse All, styles normal/green, and toggles', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    check('a Customer View button exists', !!btn(), btn() && btn().textContent.trim());
    const col = pl().querySelector('.pg-collapse-all');
    check('it sits immediately to the LEFT of Collapse All', !!btn() && !!col && !!(btn().compareDocumentPosition(col) & 4));
    check('default style is the normal pill (white background)', /255, 255, 255|#fff|white|^$/.test(btn().style.background) || btn().style.background === 'rgb(255, 255, 255)', btn().style.background);
    await toggle();
    check('enabling turns it green (#308930) with white text', btn().style.background === 'rgb(48, 137, 48)' && btn().style.color === 'rgb(255, 255, 255)', btn().style.background + '/' + btn().style.color);
    check('the panel carries the pg-customer-view class', pl().classList.contains('pg-customer-view'));
    await toggle();
    check('clicking again returns it to the normal white style', btn().style.background === 'rgb(255, 255, 255)', btn().style.background);
    check('and removes the panel class', !pl().classList.contains('pg-customer-view'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Programs table columns hide + reflow, then restore ═══ */
  await suite('Programs table hides PPH, Amount, PPH (Net) (columns removed), and restores them', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    check('before: the Programs header shows PPH, Amount, PPH (Net)', ['PPH','Amount','PPH (Net)'].every(l => visibleProgHeaders().indexOf(l) >= 0), JSON.stringify(visibleProgHeaders().filter(h => /PPH|Amount/.test(h))));
    await toggle();
    check('PPH column is hidden (th + cells display:none)', cellHidden('td.pg-cal-pph') === true && visibleProgHeaders().indexOf('PPH') < 0);
    check('Amount column is hidden', cellHidden('td.pg-cal-calc[data-calc-kind="amount"]') === true && visibleProgHeaders().indexOf('Amount') < 0);
    check('PPH (Net) column is hidden', cellHidden('td.pg-cal-disc-price') === true && visibleProgHeaders().indexOf('PPH (Net)') < 0);
    check('Amount (Net) STAYS visible (customer-safe)', visibleProgHeaders().indexOf('Amount (Net)') >= 0);
    check('the hidden cells are display:none (removed from layout), not blanked', (function () { const c2 = prog().querySelector('td.pg-cal-pph'); return c2 && c2.style.display === 'none' && (c2.textContent || '').trim().length > 0; })());
    await toggle();
    check('disabling restores all three columns', ['PPH','Amount','PPH (Net)'].every(l => visibleProgHeaders().indexOf(l) >= 0), JSON.stringify(visibleProgHeaders().filter(h => /PPH|Amount/.test(h))));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Discounts + Summaries + PG Summary ═══ */
  await suite('Discounts (base PPH, %, per-discount PPH), Program Summaries and PG Summary hide PPH (Net)', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    check('before: no summary column is hidden yet (PPH (Net) shown)', anySummaryShowsNpph() === true);
    await toggle();
    check('Discounts base PPH is hidden', cellHidden('.pg-disc-base-price') === true);
    check('each discount\u2019s % is hidden', cellHidden('[class*="pg-disc-col-pct-"]') === true);
    check('each discount\u2019s PPH is hidden', cellHidden('[class*="pg-disc-col-pph-"]') === true);
    check('Discounts Amount stays visible (customer-safe)', cellHidden('.pg-disc-amount') === false);
    check('NO summary table shows a PPH (Net) column (Program Summaries + PG Summary)', anySummaryShowsNpph() === false);
    await toggle();
    check('disabling restores the Discounts base PPH', cellHidden('.pg-disc-base-price') === false);
    check('disabling restores PPH (Net) in the summaries', anySummaryShowsNpph() === true);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Amount breakdown popup hides PPH (Net) ═══ */
  await suite('The Amount (Net) breakdown popup hides PPH (Net) while Customer View is on', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    await toggle();
    const amtCell = prog().querySelector('.pg-amt-clickable');
    check('the Programs Amount (Net) cell is clickable', !!amtCell);
    amtCell.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300);
    const dd = d.querySelector('.pg-amt-break-dd');
    check('the breakdown popup opened', !!dd);
    check('the popup carries the customer-view class (its PPH (Net) column is CSS-hidden)', !!dd && dd.classList.contains('pg-customer-view-popup'));
    check('the popup DOES contain PPH (Net) cells (hidden by the class, values intact)', !!dd && dd.querySelectorAll('.pg-amt-break-npph').length > 0);
    check('the popup still shows the other columns + a Program Total', !!dd && /Program Total/.test(dd.textContent) && /Hours/.test(dd.textContent));
    const x = dd && [...dd.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (x) x.click(); await flush(80);
    // with Customer View OFF the same popup shows PPH (Net)
    await toggle();
    const amt2 = prog().querySelector('.pg-amt-clickable'); amt2.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300);
    const dd2 = d.querySelector('.pg-amt-break-dd');
    check('with Customer View OFF the popup does NOT carry the hide class', !!dd2 && !dd2.classList.contains('pg-customer-view-popup'));
    const x2 = dd2 && [...dd2.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (x2) x2.click();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Display-only: no data / calc / total change ═══ */
  await suite('Customer View is display-only \u2014 no data, calculation or total changes', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    const calcSig = () => { const sec = d.getElementById('summary-section-pg-001'); return sec && sec.__pgCalc ? JSON.stringify(sec.__pgCalc.totals) : null; };
    const detSig = () => JSON.stringify(W._pgGuideDetails()['pg-001']);
    const c0 = calcSig(), det0 = detSig();
    // the hidden value still exists
    await toggle();
    check('a hidden PPH cell still holds its computed value (hidden, not cleared)', (function () { const c2 = prog().querySelector('td.pg-cal-pph'); return c2 && c2.style.display === 'none' && (c2.textContent || '').trim().length > 0; })(), prog().querySelector('td.pg-cal-pph').textContent);
    check('__pgCalc totals are byte-identical after enabling Customer View', calcSig() === c0, 'calc changed');
    check('the stored guide details are byte-identical (no data/discount/override change)', detSig() === det0, 'det changed');
    await toggle();
    check('and identical again after disabling', calcSig() === c0 && detSig() === det0);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Preserves other UI state (no rebuild) ═══ */
  await suite('Toggling Customer View preserves collapse/scroll/view state (no rebuild)', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    const secNode = d.getElementById('summary-section-pg-001');
    // collapse a section
    const secToggle = pl().querySelector('.pg-sec-toggle, .pg-cal-toggle'); if (secToggle) { $(secToggle).trigger('click'); await flush(300); }
    const collapsedBefore = pl().querySelectorAll('[aria-expanded="false"]').length;
    await toggle();
    check('the summary-section DOM node is the SAME object (no rebuild)', d.getElementById('summary-section-pg-001') === secNode);
    check('the collapse state is unchanged across the toggle', pl().querySelectorAll('[aria-expanded="false"]').length === collapsedBefore, collapsedBefore + '/' + pl().querySelectorAll('[aria-expanded="false"]').length);
    await toggle();
    check('and unchanged again after disabling', pl().querySelectorAll('[aria-expanded="false"]').length === collapsedBefore);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Survives a recalc (re-render re-applies the hide) ═══ */
  await suite('A recalc while Customer View is on keeps the columns hidden (build re-applies)', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    await toggle();
    check('PPH hidden before the recalc', cellHidden('td.pg-cal-pph') === true);
    // force a summary rebuild (a normal consequence of many edits)
    try { W._pgGuideDetails(); const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); } catch (e) {}
    await flush(600);
    check('PPH stays hidden after a recalc/rebuild (customer view re-applied)', cellHidden('td.pg-cal-pph') === true);
    check('and the summaries still hide PPH (Net) after the recalc', anySummaryShowsNpph() === false);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Discounts total row stays column-aligned in Customer View (colspan fix) ═══ */
  await suite('The Discounts total row keeps the same visible-column structure as the data rows in Customer View', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { await toggle(); }   // normalize OFF (state persists per gid across re-imports)
    const discTbl = () => pl().querySelector('table.pg-disc-table');
    // count visible column slots in a row (sum of colspans of non-hidden cells)
    const rowCols = (sel) => { const tt = discTbl(); const r = tt && tt.querySelector(sel); if (!r) return -1; let n = 0; [...r.cells].forEach(c2 => { if (c2.style.display !== 'none') n += parseInt(c2.getAttribute('colspan') || '1', 10); }); return n; };
    const dataCols = () => rowCols('tbody tr.pg-disc-row');
    const totCols = () => rowCols('tfoot tr.pg-disc-total-row');
    check('the Discounts table + its total row exist', !!discTbl() && !!discTbl().querySelector('tfoot tr.pg-disc-total-row'));
    check('BEFORE: total row column count equals the data row column count', dataCols() === totCols() && dataCols() > 0, dataCols() + ' vs ' + totCols());
    await toggle();
    check('AFTER enabling Customer View: total row STILL matches the data rows (no misalignment)', dataCols() === totCols(), dataCols() + ' vs ' + totCols());
    check('and the count actually shrank (base PPH + each discount %/PPH hidden)', totCols() < 9, totCols());
    await toggle();
    check('AFTER restore: total row matches the data rows again', dataCols() === totCols() && dataCols() > 0, dataCols() + ' vs ' + totCols());
    check('the leading total cell colspan restored to its original', (function () { const tt = discTbl(); const r = tt.querySelector('tfoot tr.pg-disc-total-row'); const c0 = r && r.cells[0]; return c0 && c0.getAttribute('colspan') === '2' && !c0.getAttribute('data-cv-colspan'); })());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. Programs table total row stays column-aligned in Customer View (colspan-aware hide) ═══ */
  await suite('The Programs total row keeps the same visible-column structure as the data rows in Customer View', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    const progT = () => prog();
    const rowCols = (r) => { if (!r) return -1; let n = 0; [...r.cells].forEach(c2 => { if (c2.style.display !== 'none') n += parseInt(c2.getAttribute('colspan') || '1', 10); }); return n; };
    const headCols = () => rowCols(progT().tHead.rows[progT().tHead.rows.length - 1]);
    const dataCols = () => rowCols(progT().tBodies[0].rows[0]);
    const totCols = () => (progT().tFoot ? rowCols(progT().tFoot.rows[0]) : -1);
    const dataColsBaseline = dataCols();
    check('the Programs table has a tfoot total row', !!progT().tFoot && progT().tFoot.rows.length > 0);
    check('BEFORE: header, data and total rows all have the same visible-column count', headCols() === dataCols() && dataCols() === totCols() && dataCols() > 0, headCols() + '/' + dataCols() + '/' + totCols());
    await toggle();
    check('AFTER enabling Customer View: the total row STILL matches the data rows (no misalignment)', dataCols() === totCols() && headCols() === totCols(), headCols() + '/' + dataCols() + '/' + totCols());
    check('and the count actually shrank (PPH + Amount + PPH (Net) hidden)', totCols() < dataColsBaseline, totCols() + ' < ' + dataColsBaseline);
    // the total row's PPH / Amount / PPH (Net) total cells are hidden by their own single-column position
    check('the total row PPH cell is hidden', (function () { const c2 = progT().tFoot.rows[0].querySelector('.pg-cal-total-row-pph'); return c2 && c2.style.display === 'none'; })());
    check('the total row Amount cell is hidden', (function () { const c2 = progT().tFoot.rows[0].querySelector('.pg-cal-total-amount'); return c2 && c2.style.display === 'none'; })());
    check('the total row PPH (Net) cell is hidden', (function () { const c2 = progT().tFoot.rows[0].querySelector('.pg-cal-total-disc-price'); return c2 && c2.style.display === 'none'; })());
    check('the total row Amount (Net) cell STAYS visible', (function () { const c2 = progT().tFoot.rows[0].querySelector('.pg-cal-total-disc-amount'); return c2 && c2.style.display !== 'none'; })());
    await toggle();
    check('AFTER restore: header, data and total rows realign', headCols() === dataCols() && dataCols() === totCols(), headCols() + '/' + dataCols() + '/' + totCols());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 10. District Floor is hidden in Customer View (Discounts area) ═══ */
  await suite('Customer View hides the District Floor label + field; disabling restores it', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    if (pl().classList.contains('pg-customer-view')) { $(btn()).trigger('click'); await flush(300); }
    const df = () => pl().querySelector('.pg-df-wrap');
    check('the District Floor wrap (label + field) exists', !!df());
    check('it contains the "District Floor" label', !!df() && /District Floor/.test(df().textContent));
    // the hide is via a CSS rule under .pg-customer-view (so it does not fight the section-collapse toggle)
    const rules = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText); } catch (e) { return []; } });
    const cvRule = rules.find(r => /pg-customer-view\s+\.pg-df-wrap/i.test(r));
    check('a CSS rule hides .pg-df-wrap under .pg-customer-view (display:none)', !!cvRule && /display:\s*none/i.test(cvRule), cvRule);
    await toggle();
    check('enabling Customer View adds the pg-customer-view class (rule takes effect)', pl().classList.contains('pg-customer-view'));
    // Customer View does NOT touch the DF wrap's inline display (its hide is a CSS class on the
    // panel). The wrap's own inline display is owned solely by the section-collapse toggle — so
    // Customer View never sets data-cv-hidden on it, keeping the two independent.
    check('Customer View leaves the DF wrap free of any inline hide marker (data-cv-hidden)', df().getAttribute('data-cv-hidden') === null);
    await toggle();
    check('disabling Customer View removes the class (District Floor visible again)', !pl().classList.contains('pg-customer-view'));
    check('the District Floor field/label are still in their normal place after restore', !!pl().querySelector('.pg-df-wrap') && /District Floor/.test(pl().querySelector('.pg-df-wrap').textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 11. A >=15px gap sits below the Staffing Allocation table ═══ */
  await suite('The Staffing Allocation table has a >=15px bottom gap (consistent across states)', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const rules = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText); } catch (e) { return []; } });
    const gapRule = rules.find(r => /\.sf-alloc-wrap\s*\{[^}]*margin-bottom/i.test(r));
    check('a CSS rule sets a bottom margin on .sf-alloc-wrap', !!gapRule, gapRule);
    const m = gapRule && gapRule.match(/margin-bottom:\s*(\d+)px/i);
    check('the bottom gap is at least 15px', !!m && parseInt(m[1], 10) >= 15, m && m[1]);
    check('the rule applies to the alloc wrap regardless of table height (a class rule, not inline)', /^\s*\.sf-alloc-wrap/.test(gapRule) || /\.sf-alloc-wrap\s*\{/.test(gapRule));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
