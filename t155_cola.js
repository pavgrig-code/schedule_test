// t155_cola.js — Pricing Calculator (renamed from Discounts) + COLA. PPH (COLA) = PPH x (1 + COLA/100), rounded
// to cents, becomes THE starting rate: discount stages, the District Floor cap, gross and net Amounts, Programs,
// Summary, totals, Not to Exceed and Amount Available all derive from it. Checked against an INDEPENDENT oracle
// of the spec's pipeline (Original PPH -> COLA -> PPH (COLA) -> existing discounts + floor -> rounded net ->
// Amount), never against the app's own numbers.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
const r2 = x => Math.round(x * 100) / 100;
const num = t => { const v = parseFloat(String(t == null ? '' : t).replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : NaN; };
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1600); d.createElement = ocr;
}
// four programs chosen to stress the rules: the spec's $40 example, a rounding case over two stages, a program the
// District Floor caps WITHOUT COLA but not with it, and one below the floor that takes no discount either way
const CALS = { cal_a: { n: 'Alpha', pph: '40.00', stages: [5] }, cal_b: { n: 'Beta', pph: '75.37', stages: [3, 2] }, cal_c: { n: 'Gamma', pph: '33.33', stages: [10] }, cal_d: { n: 'Delta', pph: '29.00', stages: [5] } };
const FLOOR = 30;
function fx(extra) {
  const ids = Object.keys(CALS);
  const cal = (id, i) => ({ name: CALS[id].n, firstDay: '2026-07-20', lastDay: '2026-07-31', color: ['#e57373', '#64b5f6', '#81c784', '#ffb74d'][i], pricePerHour: CALS[id].pph, billable: true, calId: id });
  const stages = [{ byCal: {} }, { byCal: {} }];
  ids.forEach(id => CALS[id].stages.forEach((p, si) => { stages[si].byCal[id] = { name: 'D' + (si + 1), pct: String(p) }; }));
  const data = Object.assign({
    status: 'Draft', combinedView: false, calendarRows: ids.map(cal),
    siteRowsByCal: { cal_a: [{ school: 'S1', coaches_ctkk: 1, ctkk: 10 }], cal_b: [{ school: 'S2', coaches_ctkk: 2, ctkk: 20 }], cal_c: [{ school: 'S3', coaches_ctkk: 1, ctkk: 10 }], cal_d: [{ school: 'S4', coaches_ctkk: 3, ctkk: 30 }] },
    siteRows: [{ school: 'S1', coaches_ctkk: 1, ctkk: 10 }],
    discounts: { names: ['D1', 'D2'], stages }, districtFloor: FLOOR.toFixed(2), notToExceed: { nte: '100000' },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') }, c2: { ctkk: mkTimes('09:00', '14:30') }, c3: { ctkk: mkTimes('09:00', '13:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] }, extra || {});
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data });
}
// ── the ORACLE: the spec's pipeline, written independently of the app ──
function oracle(pph, stages, floor, colaOn, colaPct, hours) {
  const P0 = parseFloat(pph);
  const start = colaOn ? r2(P0 * (1 + colaPct / 100)) : P0;            // COLA once, divided by 100, cents
  const below = start > 0 && floor > 0 && start < floor;              // existing rule: below the floor, no discount
  const maxCum = (start > 0 && floor > 0) ? Math.max(0, (1 - floor / start) * 100) : 100;
  let cum = 0; const stagePrice = [], shown = [];
  [0, 1].forEach(si => { const has = stages[si] != null; const pct = has ? stages[si] : 0; const eff = below ? 0 : Math.min(pct, Math.max(0, maxCum - cum)); cum = Math.round((cum + Math.round(eff * 1e6) / 1e6) * 1e6) / 1e6; stagePrice.push(r2(start * (1 - cum / 100))); shown.push(has || cum > 0); });
  const net = stagePrice[stagePrice.length - 1];
  // the existing table shows a stage's PPH once the program has a slot there OR any discount so far (carried forward)
  const display = stagePrice.map((v, i) => shown[i] ? v : null);
  return { start, stagePrice, display, net, gross: r2(start * hours), amount: r2(hours * net) };
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const sec = () => d.getElementById('discounts-section-pg-001');
  const wrap = () => sec().querySelector('.pg-cola-wrap');
  const chk = () => wrap().querySelector('.pg-cola-chk');
  const inp = () => wrap().querySelector('.pg-cola-input');
  const tog = () => [...pl().querySelectorAll('.pg-sec-toggle')].find(t => /Pricing Calculator/.test(t.getAttribute('title') || ''));
  const expand = async () => { if (/Expand/.test(tog().getAttribute('title'))) { $(tog()).trigger('click'); await flush(300); } };
  const collapseArea = async () => { if (/Collapse/.test(tog().getAttribute('title'))) { $(tog()).trigger('click'); await flush(300); } };
  const isVis = el => !!el && el.style.display !== 'none';
  const hdrs = () => [...sec().querySelectorAll('table.pg-disc-table thead tr:first-child th')].map(t => t.textContent.trim().replace(/\s+/g, ' '));
  const dRow = cal => sec().querySelector('tr.pg-disc-row[data-disc-cal="' + cal + '"]');
  const dVal = (cal, cls) => { const e = dRow(cal) && dRow(cal).querySelector('td.' + cls); return e ? num(e.textContent) : NaN; };
  const dStage = cal => [...dRow(cal).querySelectorAll('td.pg-disc-price')].map(e => num(e.textContent));
  const dAmount = cal => { const a = [...dRow(cal).querySelectorAll('td.pg-disc-amount')].map(e => num(e.textContent)).filter(isFinite); return a.length ? a[a.length - 1] : NaN; };
  const calTbl = () => [...pl().querySelectorAll('table')].find(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /Meal Breaks/.test(c2.textContent)));
  const hs = () => [...calTbl().querySelectorAll('thead th')].map(x => x.textContent.trim());
  const pcRow = calId => [...calTbl().querySelectorAll('tbody tr')].find(r => { const nm = r.children[hs().indexOf('Name')]; const i = nm && nm.querySelector('input'); return !!i && i.value.trim() === CALS[calId].n; });
  const pc = (calId, col) => { const r = pcRow(calId); return r ? num(r.children[hs().indexOf(col)].textContent) : NaN; };
  const pcInput = (calId, col) => pcRow(calId).children[hs().indexOf(col)].querySelector('input');
  const calc = () => d.getElementById('summary-section-pg-001').__pgCalc;
  const hoursOf = calId => { const x = calc().calendars.find(q => q.calId === calId); return x ? x.totalHours : NaN; };
  const gCard = () => { const cs = pl().querySelectorAll('[data-guide-summary="pg-001"]'); return cs[cs.length - 1]; };
  const box = k => num(gCard().querySelector('.pg-gs-box-' + k).textContent);
  const undoBtn = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
  const snackText = () => ((d.querySelector('.pg-undo-snack') || {}).textContent || '');
  const setCola = async on => { if (chk().checked !== on) { chk().checked = on; $(chk()).trigger('change'); await flush(900); } };
  const typePct = async v => { $(inp()).trigger('focus'); inp().value = String(v); $(inp()).trigger('input'); await flush(700); $(inp()).trigger('blur'); await flush(300); };
  const pickCat = async v => { const i = pl().querySelector('.pg-cat-input'); if (!i) { const pill = pl().querySelector('.pg-cat-pill'); const x = pill && [...pill.querySelectorAll('*')].find(e => e.children.length === 0 && /\u00d7|\u2715/.test(e.textContent)); if (x) { $(x).trigger('click'); await flush(200); } } const i2 = pl().querySelector('.pg-cat-input'); $(i2).trigger('focus'); await flush(60); const o = [...d.querySelectorAll('.pg-cat-opt')].find(b => b.textContent.trim() === v); $(o).trigger('mousedown'); await flush(1200); };
  // every figure for every program against the oracle, plus the guide totals
  const reconcile = (label, colaOn, pct) => {
    let netSum = 0, grossSum = 0;
    Object.keys(CALS).forEach(id => {
      const h = hoursOf(id); const o = oracle(CALS[id].pph, CALS[id].stages, FLOOR, colaOn, pct, h);
      netSum += o.amount; grossSum += o.gross;
      if (colaOn) check(label + ': ' + id + ' PPH (COLA) = ' + o.start.toFixed(2), dVal(id, 'pg-disc-cola-price') === o.start, dVal(id, 'pg-disc-cola-price'));
      check(label + ': ' + id + ' PPH column still shows the ORIGINAL $' + CALS[id].pph, dVal(id, 'pg-disc-base-price') === parseFloat(CALS[id].pph), dVal(id, 'pg-disc-base-price'));
      check(label + ': ' + id + ' every discount stage PPH = oracle (' + o.display.join(',') + ')', JSON.stringify(dStage(id).map(v => isFinite(v) ? v : null)) === JSON.stringify(o.display), dStage(id).join(','));
      check(label + ': ' + id + ' Pricing Calculator pre-discount Amount = hours x starting rate', dVal(id, 'pg-disc-base-amt') === o.gross, dVal(id, 'pg-disc-base-amt') + ' vs ' + o.gross);
      check(label + ': ' + id + ' final Amount = ' + o.amount, dAmount(id) === o.amount, dAmount(id));
      check(label + ': ' + id + ' Programs PPH (Net) / Amount (Net) = ' + o.net + ' / ' + o.amount, pc(id, 'PPH (Net)') === o.net && pc(id, 'Amount (Net)') === o.amount, pc(id, 'PPH (Net)') + ' / ' + pc(id, 'Amount (Net)'));
      check(label + ': ' + id + ' Programs gross Amount = hours x starting rate', pc(id, 'Amount') === o.gross, pc(id, 'Amount') + ' vs ' + o.gross);
    });
    netSum = r2(netSum); grossSum = r2(grossSum);
    check(label + ': Summary Total Amount = sum of net Amounts (' + netSum + ')', box('amount') === netSum, box('amount'));
    check(label + ': Amount Available = Not to Exceed - Total Amount', r2(box('nte') - box('amount')) === box('avail'), box('avail'));
    check(label + ': Pricing Calculator total Amount = gross sum; Programs table total Amount (Net) = net sum', num(sec().querySelector('td.pg-disc-tot-amt').textContent) === grossSum && num(pl().querySelector('td.pg-cal-total-disc-amount').textContent) === netSum);
    return { netSum, grossSum };
  };

  /* ═══ 1. Rename, header controls, defaults ═══ */
  await suite('The area is now "Pricing Calculator"; COLA sits right after District Floor, unchecked at 2.5% and muted; hidden while collapsed; nothing stored until touched', async () => {
    await importGuide(dom, c, fx()); await flush(900);
    check('the header reads Pricing Calculator (not Discounts)', sec().querySelector('.pg-area-label').textContent === 'Pricing Calculator');
    check('the collapse toggle is titled for Pricing Calculator', !!tog() && tog().getAttribute('title') === 'Expand Pricing Calculator');
    check('collapsed (default): COLA controls hidden together with District Floor', !isVis(wrap()) && !isVis(sec().querySelector('.pg-df-wrap')));
    await expand();
    check('expanded: COLA controls visible', isVis(wrap()));
    const kids = [...sec().querySelector('.pg-df-wrap').parentElement.children];
    check('COLA comes immediately after the District Floor label + field', kids.indexOf(wrap()) === kids.indexOf(sec().querySelector('.pg-df-wrap')) + 1);
    check('the checkbox is unchecked and the field reads 2.5', !chk().checked && inp().value === '2.5');
    check('while unchecked the label, field and % are muted', ['.pg-cola-label', '.pg-cola-input', '.pg-cola-sfx'].every(s => wrap().querySelector(s).style.opacity === '0.45'));
    check('nothing is stored for COLA until it is touched (det.cola absent)', det().cola === undefined);
    check('no COLA columns while off', hdrs().join('|') === 'Program|PPH Initial|Total Hours|Amount|Discount 1|Discount 2', hdrs().join('|'));
    reconcile('COLA off', false, 2.5);
    check('clicking the COLA controls does not toggle the area', (() => { $(wrap()).trigger('click'); return /Collapse/.test(tog().getAttribute('title')); })());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Enabled: columns and exact reconciliation ═══ */
  await suite('COLA on: PPH -> COLA -> PPH (COLA) columns; every figure for every program reconciles with the oracle; COLA applied exactly once, before discounts; the floor cap and below-floor rule still hold', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand();
    await setCola(true);
    check('the columns are PPH Initial -> COLA -> PPH -> Total Hours -> Amount -> discounts', hdrs().join('|') === 'Program|PPH Initial|COLA|PPH|Total Hours|Amount|Discount 1|Discount 2', hdrs().join('|'));
    check('each row shows 2.5% in the COLA column', Object.keys(CALS).every(id => dRow(id).querySelector('td.pg-disc-cola').textContent === '2.5%'));
    check('label and field un-mute when checked', wrap().querySelector('.pg-cola-label').style.opacity === '1');
    check('det.cola stores {on:true, pct:"2.5"}', JSON.stringify(det().cola) === '{"on":true,"pct":"2.5"}', JSON.stringify(det().cola));
    check('the spec example: $40.00 x 1.025 = $41.00, then 5% -> $38.95', dVal('cal_a', 'pg-disc-cola-price') === 41 && dStage('cal_a')[0] === 38.95);
    check('COLA applied once: $75.37 -> $77.25 (not $79.18 from applying it twice, not $75.37 / 100)', dVal('cal_b', 'pg-disc-cola-price') === 77.25);
    check('the District Floor cap is judged against PPH (COLA): Gamma is capped to $30.00 without COLA but takes its full 10% ($30.74) with it', dStage('cal_c')[0] === 30.74 && !dRow('cal_c').querySelector('.pg-disc-pct-capped'));
    check('below-floor rule preserved: Delta ($29.73 with COLA) is still below $30 and takes no discount', dVal('cal_d', 'pg-disc-cola-price') === 29.73 && pc('cal_d', 'PPH (Net)') === 29.73);
    reconcile('COLA 2.5%', true, 2.5);
    check('the calculated export block carries the COLA figures only now', calc().calendars.every(x => x.colaPct === 2.5 && x.pricePerHourCola > x.pricePerHour));
    check('the footer label spans Program + PPH + COLA + PPH (COLA)', sec().querySelector('tr.pg-disc-total-row td').getAttribute('colspan') === '4');
    await setCola(false);
    check('COLA off: columns gone and everything back to the original pricing', hdrs().indexOf('COLA') < 0 && hdrs().indexOf('PPH') < 0 && hdrs().indexOf('PPH Initial') === 1);
    reconcile('COLA off again', false, 2.5);
    check('the calculated export block drops the COLA figures when off', calc().calendars.every(x => x.colaPct === undefined && x.pricePerHourCola === undefined));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Percentage and PPH changes ═══ */
  await suite('Changing the COLA percentage or a program\u2019s PPH re-derives everything at once; invalid input is ignored; editing the percentage while off stores it without pricing effect', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand(); await setCola(true);
    for (const p of [0, 4.75, 10, 2.5]) {
      await typePct(p);
      check('COLA ' + p + '%: every row shows ' + p + '%', Object.keys(CALS).every(id => dRow(id).querySelector('td.pg-disc-cola').textContent === p + '%'));
      reconcile('COLA ' + p + '%', true, p);
    }
    check('0% makes PPH (COLA) equal PPH', true);
    $(inp()).trigger('focus'); inp().value = '150'; $(inp()).trigger('input'); await flush(500);
    check('an out-of-range value (150) is ignored while typing: pricing stays at 2.5%', det().cola.pct === '2.5' && dVal('cal_a', 'pg-disc-cola-price') === 41);
    $(inp()).trigger('blur'); await flush(300);
    check('...and blur restores the field to the last valid 2.5', inp().value === '2.5');
    $(inp()).trigger('focus'); inp().value = '3.x5'; $(inp()).trigger('input'); await flush(500);
    check('letters are stripped while typing (3.x5 -> 3.5) and applied live', inp().value === '3.5' && dVal('cal_a', 'pg-disc-cola-price') === r2(40 * 1.035));
    $(inp()).trigger('blur'); await flush(300); await typePct(2.5);
    // change a program's PPH on the Programs table
    const pi = pcInput('cal_a', 'PPH'); $(pi).val('50').trigger('input'); await flush(900); $(pi).trigger('blur'); await flush(900);
    check('changing Alpha\u2019s PPH to $50 recomputes PPH (COLA) $51.25 and its discount $48.69', dVal('cal_a', 'pg-disc-base-price') === 50 && dVal('cal_a', 'pg-disc-cola-price') === 51.25 && dStage('cal_a')[0] === 48.69);
    CALS.cal_a.pph = '50.00'; reconcile('after PPH edit', true, 2.5); CALS.cal_a.pph = '40.00';
    // editing the percentage while off
    await setCola(false); await typePct(6);
    check('while OFF the percentage is stored (6) but nothing is priced with it and no columns appear', det().cola.pct === '6' && det().cola.on === false && hdrs().indexOf('COLA') < 0 && pc('cal_a', 'PPH (Net)') === r2(50 * 0.95));
    await setCola(true);
    check('turning COLA back on uses the stored 6%', dVal('cal_a', 'pg-disc-cola-price') === r2(50 * 1.06));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 4. Collapse is display-only ═══ */
  await suite('Collapsing the COLA column and collapsing the Pricing Calculator are display-only: no figure and no COLA state changes', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand(); await setCola(true);
    const snap = () => JSON.stringify({ n: Object.keys(CALS).map(id => [pc(id, 'PPH (Net)'), pc(id, 'Amount (Net)'), dAmount(id), dVal(id, 'pg-disc-cola-price')]), t: box('amount'), a: box('avail'), cola: det().cola });
    const before = snap();
    const th = sec().querySelector('th.pg-disc-h-cola'); const btn = th && th.querySelector('.pg-col-toggle');
    check('the COLA header carries the same collapse control as PPH', !!btn && !!sec().querySelector('th.pg-disc-h-basepph .pg-col-toggle'));
    $(btn).trigger('click'); await flush(600);
    check('collapsed: COLA shrinks to the collapsed header + strip, PPH (COLA) stays', !!sec().querySelector('.pg-col-collapsed-th') && sec().querySelectorAll('td.pg-disc-cola').length === 0 && sec().querySelectorAll('td.pg-disc-cola-price').length === 4);
    check('collapsing changed no figure and left COLA on', snap() === before, snap());
    const cth = [...sec().querySelectorAll('.pg-col-collapsed-th')].find(x => /COLA/.test(x.getAttribute('title') || x.textContent)) || sec().querySelector('.pg-col-collapsed-th');
    $(cth.querySelector('.pg-col-toggle') || cth).trigger('click'); await flush(600);
    check('expanding brings the COLA column back with 2.5% on every row', sec().querySelectorAll('td.pg-disc-cola').length === 4 && snap() === before);
    await collapseArea();
    check('collapsing the area hides the COLA controls (District Floor too) and changes nothing', !isVis(wrap()) && !isVis(sec().querySelector('.pg-df-wrap')) && JSON.stringify(det().cola) === '{"on":true,"pct":"2.5"}' && box('amount') === JSON.parse(before).t);
    await expand();
    check('expanding shows them again, still checked', isVis(wrap()) && chk().checked && snap() === before);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 5. Renewal/Expansion auto-activation ═══ */
  await suite('Picking Renewal/Expansion checks COLA; the user can uncheck it and no rerender, recalc or later edit re-checks it; a new pick into Renewal/Expansion does; Undo reverts only COLA; existing Renewal guides are not changed on load', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand();
    await pickCat('Renewal/Expansion');
    check('picking Renewal/Expansion checks COLA and prices with it', chk().checked && det().cola.on === true && dVal('cal_a', 'pg-disc-cola-price') === 41);
    reconcile('auto COLA', true, 2.5);
    check('an Undo is offered for the automatic COLA', /COLA/.test(snackText()) && /Renewal/.test(snackText()), snackText());
    $(undoBtn()).trigger('click'); await flush(1500); await expand();
    check('Undo reverts COLA only: unchecked, category still Renewal/Expansion', !chk().checked && det().districtCategory === 'Renewal/Expansion' && hdrs().indexOf('COLA') < 0);
    // pick again via clear + pick (a new selection into Renewal/Expansion)
    await pickCat('New'); await pickCat('Renewal/Expansion');
    check('a new pick into Renewal/Expansion checks it again', chk().checked);
    await setCola(false);
    check('the user can uncheck it with Renewal/Expansion still selected', !chk().checked && det().districtCategory === 'Renewal/Expansion');
    // ordinary rerenders / recalcs / edits must not re-check it
    W.refreshSummary && W.refreshSummary({ id: 'pg-001' });
    await collapseArea(); await expand();
    const df = sec().querySelector('.pg-df-input'); $(df).trigger('focus'); df.value = '31'; $(df).trigger('input'); await flush(500); df.value = '30'; $(df).trigger('input'); $(df).trigger('blur'); await flush(600);
    const pi = pcInput('cal_b', 'PPH'); $(pi).val('75.37').trigger('input'); $(pi).trigger('blur'); await flush(900);
    await typePct(3); await typePct(2.5);
    check('after area collapse/expand, a District Floor edit, a PPH edit and percentage edits it is STILL unchecked', !chk().checked && det().cola.on === false);
    reconcile('manually off under Renewal', false, 2.5);
    await pickCat('New');
    check('switching to New does not change COLA', !chk().checked);
    // a guide already set to Renewal/Expansion when imported keeps COLA off
    await importGuide(dom, c, fx({ districtCategory: 'Renewal/Expansion' })); await flush(900); await expand();
    check('an imported guide already on Renewal/Expansion is not switched on at load', !chk().checked && det().cola === undefined);
    reconcile('legacy Renewal guide', false, 2.5);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 6. Undo, export/import ═══ */
  await suite('Undo reverts a COLA toggle and a percentage change; JSON export/import keeps COLA and every figure byte-identical; a guide without COLA exports with no COLA trace', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand();
    const offTotal = box('amount');
    await setCola(true); const onTotal = box('amount');
    check('enabling offers Undo', /COLA/.test(snackText()) && !!undoBtn());
    $(undoBtn()).trigger('click'); await flush(1500); await expand();
    check('Undo of enabling: unchecked, columns gone, totals back', !chk().checked && hdrs().indexOf('COLA') < 0 && box('amount') === offTotal);
    await setCola(true); await typePct(4);
    const t4 = box('amount');
    check('the percentage edit offered Undo', /changed to 4%/.test(snackText()), snackText());
    $(undoBtn()).trigger('click'); await flush(1500); await expand();
    check('Undo of the percentage: back to 2.5% and its total', inp().value === '2.5' && box('amount') === onTotal && box('amount') !== t4);
    const exp = async () => { let cap = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') cap = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {}; const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; }; $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60); $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc; return cap; };
    const snap = () => JSON.stringify({ cola: det().cola, n: Object.keys(CALS).map(id => [pc(id, 'PPH (Net)'), pc(id, 'Amount (Net)'), pc(id, 'Amount')]), t: box('amount'), a: box('avail') });
    const s1 = snap(); const P = await exp(); const J = JSON.parse(P);
    check('the export stores det.cola and the calculated COLA figures', J.data.cola && J.data.cola.on === true && J.calculated.calendars.every(x => x.colaPct === 2.5));
    await importGuide(dom, c, fx()); await flush(700); await importGuide(dom, c, P); await flush(1200); await expand();
    check('after a clean import: COLA state and every figure are identical', snap() === s1, snap());
    check('...and the header shows it checked with its columns', chk().checked && hdrs().indexOf('COLA') === 2 && hdrs().indexOf('PPH') === 3);
    reconcile('after import', true, 2.5);
    await importGuide(dom, c, fx()); await flush(900);
    const P0 = await exp(); const J0 = JSON.parse(P0);
    check('a guide that never touched COLA exports no cola key and no COLA figures', !('cola' in J0.data) && J0.calculated.calendars.every(x => !('colaPct' in x) && !('pricePerHourCola' in x)));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 7. Rapid edits ═══ */
  await suite('Rapid toggles and rapid percentage edits settle exactly on the last state with no duplicate adjustment', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand();
    for (let i = 0; i < 12; i++) { chk().checked = (i % 2 === 0); $(chk()).trigger('change'); }
    await flush(1500);
    check('12 back-to-back toggles end OFF (the last one) with the original pricing', !chk().checked && det().cola.on === false && hdrs().indexOf('COLA') < 0);
    reconcile('after 12 toggles', false, 2.5);
    chk().checked = true; $(chk()).trigger('change'); await flush(300);
    $(inp()).trigger('focus'); ['3', '3.2', '4', '1', '7.5', '2', '5', '9', '0.5', '3.75'].forEach(v => { inp().value = v; $(inp()).trigger('input'); });
    await flush(1500); $(inp()).trigger('blur'); await flush(400);
    check('10 back-to-back percentages settle on the last (3.75%)', det().cola.pct === '3.75' && inp().value === '3.75');
    reconcile('after 10 percentage edits', true, 3.75);
    check('COLA is applied once, never compounded: Alpha PPH (COLA) = 40 x 1.0375 = 41.50', dVal('cal_a', 'pg-disc-cola-price') === 41.5);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 8. Customer View ═══ */
  await suite('Customer View hides the COLA controls and the COLA / PPH (COLA) rate columns like the other internal rates; the footer stays aligned; amounts unchanged', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand(); await setCola(true);
    const amt = box('amount');
    const cv = pl().querySelector('.pg-customer-view-btn'); $(cv).trigger('click'); await flush(600);
    const shown = sel => [...sec().querySelectorAll(sel)].some(e => e.style.display !== 'none' && W.getComputedStyle(e).display !== 'none');
    check('Customer View hides the COLA header controls', W.getComputedStyle(wrap()).display === 'none');
    check('...and the COLA and PPH (COLA) columns, like base PPH', !shown('td.pg-disc-cola') && !shown('td.pg-disc-cola-price') && !shown('th.pg-disc-h-cola') && !shown('th.pg-disc-h-pphcola') && !shown('td.pg-disc-base-price'));
    check('the footer label shrinks from 4 columns to 1 so the totals stay aligned', sec().querySelector('tr.pg-disc-total-row td').getAttribute('colspan') === '1');
    check('amounts are unchanged', box('amount') === amt);
    $(cv).trigger('click'); await flush(600);
    check('turning Customer View off restores the columns and the 4-column footer', shown('td.pg-disc-cola') && sec().querySelector('tr.pg-disc-total-row td').getAttribute('colspan') === '4');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 9. Labels and COLA styling (follow-up spec) ═══ */
  await suite('Column labels: the original rate is "PPH Initial", the COLA-adjusted rate is "PPH"; the COLA column is tinted #fff8e8 in every cell, expanded or collapsed; labels and styling only, every figure identical', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expand();
    check('COLA off: PPH Initial, then Total Hours (no second PPH)', hdrs().join('|') === 'Program|PPH Initial|Total Hours|Amount|Discount 1|Discount 2', hdrs().join('|'));
    const offSnap = JSON.stringify(Object.keys(CALS).map(id => [pc(id, 'PPH (Net)'), pc(id, 'Amount (Net)'), dAmount(id)]).concat([box('amount'), box('avail')]));
    await setCola(true);
    check('COLA on: PPH Initial -> COLA -> PPH -> Total Hours -> Amount', hdrs().join('|') === 'Program|PPH Initial|COLA|PPH|Total Hours|Amount|Discount 1|Discount 2', hdrs().join('|'));
    check('"PPH Initial" holds the ORIGINAL rate and "PPH" the COLA-adjusted starting rate ($40.00 / $41.00)', (() => { const r = dRow('cal_a'); const i = hdrs().indexOf('PPH Initial'), j = hdrs().indexOf('PPH'); return num(r.cells[i].textContent) === 40 && num(r.cells[j].textContent) === 41; })());
    check('"PPH" is still the starting rate for the discounts: $41.00 x 0.95 = $38.95', dStage('cal_a')[0] === 38.95);
    const TINT = 'rgb(255, 248, 232)';
    const colaTds = [...sec().querySelectorAll('td.pg-disc-cola')];
    check('every COLA body cell has background #fff8e8', colaTds.length === 4 && colaTds.every(td => td.style.background === TINT), [...new Set(colaTds.map(td => td.style.background))].join(','));
    check('the COLA header cell has background #fff8e8', sec().querySelector('th.pg-disc-h-cola').style.background === TINT);
    check('the tint is ONLY on COLA: PPH Initial and PPH cells are untouched', [...sec().querySelectorAll('td.pg-disc-base-price, td.pg-disc-cola-price')].every(td => td.style.background !== TINT) && sec().querySelector('th.pg-disc-h-pphcola').style.background !== TINT && sec().querySelector('th.pg-disc-h-basepph').style.background !== TINT);
    reconcile('relabelled', true, 2.5);
    // collapse COLA: tinted collapsed header + strip, figures unchanged
    const onTot = box('amount');
    $(sec().querySelector('th.pg-disc-h-cola .pg-col-toggle')).trigger('click'); await flush(600);
    const cth = [...sec().querySelectorAll('.pg-col-collapsed-th')].find(x => x.getAttribute('title') === 'Expand COLA');
    const strip = [...sec().querySelectorAll('.pg-col-strip')].find(x => x.textContent.trim() === 'COLA');
    check('collapsed COLA keeps the tint on its header and strip', !!cth && !!strip && cth.style.background === TINT && strip.style.background === TINT);
    check('collapsing COLA changes no figure and keeps COLA on', box('amount') === onTot && det().cola.on === true);
    $(cth.querySelector('.pg-col-toggle') || cth).trigger('click'); await flush(600);
    check('expanding restores the tinted COLA cells', sec().querySelectorAll('td.pg-disc-cola').length === 4 && sec().querySelector('td.pg-disc-cola').style.background === TINT);
    // collapse PPH Initial: the collapse control and strip carry the new label
    $(sec().querySelector('th.pg-disc-h-basepph .pg-col-toggle')).trigger('click'); await flush(600);
    check('collapsing PPH Initial shows a "PPH Initial" strip and an "Expand PPH Initial" header', [...sec().querySelectorAll('.pg-col-strip')].some(x => x.textContent.trim() === 'PPH Initial') && [...sec().querySelectorAll('.pg-col-collapsed-th')].some(x => x.getAttribute('title') === 'Expand PPH Initial'));
    check('...and changes no figure', box('amount') === onTot);
    const bth = [...sec().querySelectorAll('.pg-col-collapsed-th')].find(x => x.getAttribute('title') === 'Expand PPH Initial'); $(bth.querySelector('.pg-col-toggle') || bth).trigger('click'); await flush(600);
    await setCola(false);
    check('turning COLA off returns exactly the figures from before', JSON.stringify(Object.keys(CALS).map(id => [pc(id, 'PPH (Net)'), pc(id, 'Amount (Net)'), dAmount(id)]).concat([box('amount'), box('avail')])) === offSnap);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
