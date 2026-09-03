// t116_sb_unalloc_summary.js — Twenty-seventh spec, parts 3-5: the Unallocated/Remaining Hours
// summary in the Site Breakdown header is shown whenever the program HAS unallocated hours, in EVERY
// state — expanded+checked, expanded+unchecked, and collapsed. The checkbox controls only the detailed
// Unallocated area, not the summary. The summary stays live-synced with the Unallocated area, and is
// hidden entirely when there are no unallocated hours.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fx(unalloc, allocRows) {
  const A = [{ school: 'Alpha', schoolId: 'a1', coaches_ctkk: 1, ctkk: 10 }, { school: 'Bravo', schoolId: 'a2', coaches_ctkk: 1, ctkk: 10 }];
  const data = {
    status: 'Draft', calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A }, staffingOptsByCal: { cal_a: { bySchool: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:30') } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  };
  if (unalloc != null) data.unschedByCal = { cal_a: { unalloc: String(unalloc), rows: allocRows || [] } };
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
  E.sb = () => E.pl().querySelector('.site-cal-card[data-site-cal="cal_a"]');
  E.grp = () => E.sb().parentElement;
  E.cb = () => E.sb().querySelector('.sb-unalloc-cb');
  E.unCard = () => E.grp().querySelector('.unsched-cal-card');
  E.sumX = () => E.sb().querySelector('.sb-unalloc-sum');
  E.secSum = () => E.sb().querySelector('.pg-sec-summary');
  E.collapse = async () => { $(E.sb().querySelector('.pg-sec-toggle')).trigger('click'); await flush(150); };
  E.sumVisible = () => { const x = E.sumX(); return !!x && x.style.display !== 'none'; };
  E.sumText = () => { const x = E.sumX(); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; };
  await importGuide(dom, c, json); await flush(1200);
  return E;
}

(async () => {

  /* ═══ Suite 1: summary shown in every state when unalloc exists ═══ */
  await suite('the header summary shows in all three states: expanded+checked, expanded+unchecked, collapsed', async () => {
    const E = await boot(fx(100, [{ total: '7.5' }])); const { dom, $ } = E;
    check('expanded + checkbox CHECKED: the summary is visible with the values', E.cb().checked === true && E.sumVisible() && /Unallocated Hours:\s*100\s*\|\s*Remaining Hours:\s*92\.5/.test(E.sumText()), E.sumText());
    check('the detailed Unallocated card is also visible while checked', E.unCard() && E.unCard().style.display !== 'none');
    // uncheck -> card hides, summary stays
    $(E.cb()).prop('checked', false).trigger('change'); await flush(120);
    check('expanded + checkbox UNCHECKED: the detailed card hides but the summary STAYS', E.unCard().style.display === 'none' && E.sumVisible() && /Remaining Hours:\s*92\.5/.test(E.sumText()));
    // collapse -> summary rides the collapsed header
    await E.collapse();
    check('collapsed: the SAME summary element stays visible in the header (one element, no duplicate)', E.unCard().style.display === 'none' && E.sumVisible() && /Unallocated Hours:\s*100/.test(E.sumText()) && E.sb().querySelectorAll('.sb-unalloc-sum').length === 1);
    // expand + recheck -> card back, summary still there
    await E.collapse();
    $(E.cb()).prop('checked', true).trigger('change'); await flush(120);
    check('expanded + re-checked: the card returns and the summary is STILL visible', E.unCard().style.display !== 'none' && E.sumVisible());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: live sync with the Unallocated area ═══ */
  await suite('the header summary stays synchronized with the Unallocated area on every value change', async () => {
    const E = await boot(fx(100, [{ total: '7.5' }])); const { dom, $ } = E;
    check('starting summary reads 100 / 92.5', /Unallocated Hours:\s*100\s*\|\s*Remaining Hours:\s*92\.5/.test(E.sumText()));
    // edit the Unallocated field -> summary updates immediately (no collapse/expand)
    const inp = E.unCard().querySelector('.sf-unalloc-inp');
    $(inp).val('60').trigger('input'); await flush(400);
    check('editing Unallocated to 60 updates the summary to 60 / 52.5 immediately', /Unallocated Hours:\s*60\s*\|\s*Remaining Hours:\s*52\.5/.test(E.sumText()), E.sumText());
    // add allocated hours -> remaining drops
    $(inp).val('60').trigger('input'); await flush(200);
    // change to a value that makes remaining negative
    $(inp).val('5').trigger('input'); await flush(400);
    check('setting Unallocated to 5 (< allocated 7.5) shows Remaining -2.5 in red', /Unallocated Hours:\s*5\s*\|\s*Remaining Hours:\s*-2\.5/.test(E.sumText()) && /220,\s*53,\s*69/.test(E.sumX().querySelector('.sb-unalloc-sum-rem').style.color), E.sumText());
    // clear the unalloc -> summary disappears (no unalloc)
    $(inp).val('').trigger('input'); await flush(400);
    check('clearing the Unallocated value hides the summary (no unalloc to report)', !E.sumVisible());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: no summary when there is no unalloc ═══ */
  await suite('a program with no Unallocated Hours never shows the summary, in any state', async () => {
    const E = await boot(fx(null)); const { dom, $ } = E;
    check('expanded + checked: no summary', !E.sumVisible());
    $(E.cb()).prop('checked', false).trigger('change'); await flush(120);
    check('expanded + unchecked: still no summary', !E.sumVisible());
    await E.collapse();
    check('collapsed: the header shows only the school count, no unalloc line', /\(2 schools\)/.test(E.secSum().textContent) && !/Unallocated Hours:/.test(E.secSum().textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
