// t143_esc_dismiss.js — Esc dismisses open dropdowns/menus/popups the same way an outside click does,
// consistently and layered (topmost first). Covers the calendar right-click / Freeze / Special Days menu,
// the hourly-breakdown popup, and the Edit Staff/Coach Count editor.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: {
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-07-17', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } } } });
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
  await whenReady(dom); await flush(400); W.__pgHoverDefaultOn = true;
  const pl = () => d.getElementById('planning-panel');
  const D = '2026-07-08';
  const cell = () => pl().querySelector('.cal-day-cell[data-date-key="' + D + '"]:not(.cal-combined-carrier)');
  const esc = () => { d.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
  const ctxMenu = () => [...d.querySelectorAll('.cal-ctx-menu')].filter(m => m.style.display !== 'none').pop();
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const card = () => { const el = [...d.querySelectorAll('.cal-day-cnt-popup')].pop(); return el && el.isConnected ? el : null; };

  await suite('Esc dismisses the calendar right-click / Freeze / Special Days menu (like an outside click)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    $(cell()).trigger('contextmenu'); await flush(300);
    check('the menu opened', !!ctxMenu());
    esc(); await flush(200);
    check('Esc dismissed it', !ctxMenu());
  });

  await suite('Esc dismisses the Calendar Hourly Breakdown popup', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    $(cell()).trigger('click'); await flush(600);
    check('the breakdown popup opened', !!popup());
    esc(); await flush(200);
    check('Esc dismissed it', !popup());
  });

  await suite('Esc dismisses the Edit Count editor, then (a second Esc) the breakdown - topmost first, layered like outside-click', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    $(cell()).trigger('click'); await flush(600);
    const cntTd = (() => { const tr = [...popup().querySelectorAll('tr')].find(t => /Coaches/.test(t.textContent) && t.querySelectorAll('td').length >= 5); return tr && tr.querySelectorAll('td')[4]; })();
    $(cntTd.querySelector('[style*="cursor"]') || cntTd).trigger('click'); await flush(400);
    check('the count editor opened', !!card());
    esc(); await flush(200);
    check('Esc closed the count editor', !card());
    check('the breakdown stayed open (Esc closed only the topmost)', !!popup());
    esc(); await flush(200);
    check('a second Esc closed the breakdown', !popup());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
