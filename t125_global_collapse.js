// t125_global_collapse.js — Sixty-sixth spec: global Collapse All / Expand All buttons left of the
// Actions menu. They invoke each of the nine main areas' OWN main-header collapse/expand behavior,
// and their enabled state reflects all/none/mixed, updating live on manual area toggles too.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }

function fx() {
  const wk = { mon: { start: '14:00', end: '18:00' }, tue: { start: '14:00', end: '18:00' } };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
    status: 'Draft',
    calendarRows: [
      { name: 'Alpha', calId: 'cal_a', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#e57373', pricePerHour: '80', billable: true },
      { name: 'Beta', calId: 'cal_b', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#64b5f6', pricePerHour: '80', billable: true }
    ],
    siteRows: [{ school: 'A1', ctkk: '9' }, { school: 'A2', ctkk: '6' }],
    siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '9' }, { school: 'A2', ctkk: '6' }], cal_b: [{ school: 'B1', ctkk: '5' }] },
    staffingHoursSlots: { c0: { ctkk: wk }, c1: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  } });
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
  await whenReady(dom); await flush(400); const pl = () => d.getElementById('planning-panel');
  await importGuide(dom, c, fx()); await flush(1200);
  const colBtn = () => pl().querySelector('.pg-collapse-all');
  const expBtn = () => pl().querySelector('.pg-expand-all');
  const actions = () => pl().querySelector('#pg-actions-pill');
  const secKeys = ['calsetup', 'pg-001|discounts', 'pg-001|roles', 'pg-001|specialdays'];
  // per-area collapsed detection mirroring the app's descriptors (via DOM/state)
  const allAreaHdrs = () => [...pl().querySelectorAll('[data-pg-sec-key]')].map(e => e.getAttribute('data-pg-sec-key'));

  await suite('the buttons exist, left of Actions', async () => {
    check('Collapse All button present', !!colBtn());
    check('Expand All button present', !!expBtn());
    check('Actions button present', !!actions());
    if (colBtn() && actions()) check('Collapse All is positioned before Actions', !!(colBtn().compareDocumentPosition(actions()) & W.Node.DOCUMENT_POSITION_FOLLOWING));
    check('the four simple-area headers carry data-pg-sec-key hooks', secKeys.every(k => allAreaHdrs().includes(k)), allAreaHdrs().join(','));
  });

  await suite('Collapse All / Expand All drive every area, and button states follow all/none/mixed', async () => {
    // Collapse everything
    colBtn().dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700);
    // verify a spread of areas collapsed: the section theads/bodies are hidden
    const sfSecs = (W._pgSfSecReg && W._pgSfSecReg['pg-001']) || [];
    check('Staffing Hours sections all collapsed after Collapse All', sfSecs.length > 0 && sfSecs.every(s2 => s2.querySelector('table') ? (s2.querySelector('table').offsetParent === null || [...s2.children].filter(k => !k.hasAttribute('data-sf-cal')).every(b => b.style.visibility === 'hidden' || b.style.height === '0' || b.style.height === '0px')) : true));
    check('after Collapse All, Collapse All is disabled (all collapsed)', colBtn().disabled === true);
    check('after Collapse All, Expand All is enabled', expBtn().disabled === false);
    // Expand everything
    expBtn().dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700);
    check('after Expand All, Expand All is disabled (all expanded)', expBtn().disabled === true);
    check('after Expand All, Collapse All is enabled', colBtn().disabled === false);
  });

  await suite('button states update live on a manual individual-area toggle', async () => {
    // collapse all, then manually expand ONE simple area -> mixed -> both active
    colBtn().dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700);
    check('precondition: Collapse All disabled after Collapse All', colBtn().disabled === true);
    const rolesTg = pl().querySelector('[data-pg-sec-key="pg-001|roles"] .pg-sec-toggle');
    check('a simple-area toggle is present', !!rolesTg);
    if (rolesTg) { rolesTg.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300); }
    check('after manually expanding one area, Collapse All re-enables (mixed state)', colBtn().disabled === false);
    check('and Expand All is also active in the mixed state', expBtn().disabled === false);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
