// t133_header_layout.js — TWENTY-FIFTH SPEC. The Planning Guide header controls read as one aligned
// row: Customer View • Collapse All  Expand All • Actions  Status. A small DOT separator sits
// between Customer View and Collapse All, and between Expand All and Actions; Collapse All + Expand All
// stay grouped (no divider between them). The Collapse/Expand buttons have NO icons (labels only).
// The separators are 3px rgb(182,186,190) DOTS; every control + dot is a flex item of ONE
// align-items:center header row (the collapse wrap is display:contents), so they share a baseline.
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
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'H', status: 'Draft' }, data });
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
  const cust = () => pl().querySelector('.pg-customer-view-btn');
  const col = () => pl().querySelector('.pg-collapse-all');
  const exp = () => pl().querySelector('.pg-expand-all');
  const act = () => pl().querySelector('#pg-actions-pill');
  const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));

  /* ═══ 1. All five controls in one aligned row, in order ═══ */
  await suite('Customer View, Collapse All, Expand All, Actions and Status align in one row, in order', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    check('all five controls exist (Customer View, Collapse All, Expand All, Actions, + a Status pill)', !!cust() && !!col() && !!exp() && !!act() && !!pl().querySelector('.d-flex.align-items-center'));
    check('order: Customer View \u2192 Collapse All \u2192 Expand All \u2192 Actions', before(cust(), col()) && before(col(), exp()) && before(exp(), act()));
    // they share a common flex header row that centers vertically
    const row = cust().closest('.d-flex.align-items-center');
    check('they sit in a flex row that vertically centers its items (align-items-center)', !!row && /align-items-center/.test(row.className));
    check('every control has the same explicit height (26px)', [cust(), col(), exp(), act()].every(b => b.style.height === '26px'), [cust(), col(), exp(), act()].map(b => b.style.height).join('/'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Dividers: after Customer View, after Expand All; none between Collapse/Expand ═══ */
  await suite('A dot separator sits after Customer View and after Expand All; Collapse+Expand stay grouped', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const dots = [...pl().querySelectorAll('.pg-hdr-divider')];
    check('there are exactly two dot separators', dots.length === 2, dots.length);
    check('each separator is a small (3px) rgb(182, 186, 190) DOT (border-radius 50%)', dots.every(dt => dt.style.width === '3px' && dt.style.height === '3px' && dt.style.borderRadius === '50%' && /rgb\(182,\s*186,\s*190\)/.test(dt.style.background)), dots.map(dt => dt.style.width + '/' + dt.style.borderRadius + '/' + dt.style.background).join(' | '));
    check('dot 0 sits AFTER Customer View and BEFORE Collapse All', before(cust(), dots[0]) && before(dots[0], col()));
    check('dot 1 sits AFTER Expand All and BEFORE Actions', before(exp(), dots[1]) && before(dots[1], act()));
    // Collapse All + Expand All are grouped (a tight inline-flex pair, no dot between them)
    check('there is NO dot between Collapse All and Expand All (they are grouped)', before(col(), exp()) && !(col().nextElementSibling && col().nextElementSibling.classList.contains('pg-hdr-divider')));
    check('the collapse/expand pair shares one small inline-flex group', col().parentElement === exp().parentElement && /inline-flex/.test(col().parentElement.style.display), col().parentElement.style.display);
    // the collapse wrap is display:contents so cust + dots + the pair are direct flex items of the header row
    const wrap = cust().parentElement;
    check('the collapse wrap uses display:contents so its items join the header flex row', wrap.style.display === 'contents');
    const row = cust().closest('.d-flex.align-items-center');
    check('and that wrap sits directly in the align-items-center header row', wrap.parentElement === row);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Collapse All and Expand All have NO icons (labels only) ═══ */
  await suite('Collapse All and Expand All carry no icon — just their text labels', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    check('Collapse All has NO icon span', !col().querySelector('.pg-global-collapse-ic'));
    check('Expand All has NO icon span', !exp().querySelector('.pg-global-collapse-ic'));
    check('Collapse All contains no svg', !col().querySelector('svg'));
    check('Expand All contains no svg', !exp().querySelector('svg'));
    check('the labels are intact', col().textContent.trim() === 'Collapse All' && exp().textContent.trim() === 'Expand All', col().textContent.trim() + '/' + exp().textContent.trim());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. The controls still WORK (icons/dividers are presentation-only) ═══ */
  await suite('The restyled Collapse All / Expand All buttons still collapse and expand all sections', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    // expand all, then collapse all, and check the aggregate aria state flips
    const expanded = () => pl().querySelectorAll('[aria-expanded="true"]').length;
    $(exp()).trigger('click'); await flush(300);
    const afterExpand = expanded();
    $(col()).trigger('click'); await flush(300);
    const afterCollapse = expanded();
    check('Expand All expands sections and Collapse All collapses them (aggregate aria-expanded drops)', afterCollapse < afterExpand, afterExpand + ' -> ' + afterCollapse);
    // Customer View still toggles (green)
    $(cust()).trigger('click'); await flush(300);
    check('Customer View still toggles green', cust().style.background === 'rgb(48, 137, 48)', cust().style.background);
    $(cust()).trigger('click'); await flush(200);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
