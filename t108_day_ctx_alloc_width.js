// t108_day_ctx_alloc_width.js — right-click day Exclude/Include on Per-School Staffing Hours
// (popup from the school list, popup from Staffing Allocation, and the regular school-specific
// table) performing the ONE authoritative Days-allocation toggle (identical to the Staffing
// Allocation → Days checkbox: same record write, same History sentence, same Undo, same recalc
// chain, bidirectional live sync). Plus: expanding the Staffing Allocation Weeks segment keeps
// the table at its pre-expansion width (Week columns scroll inside; collapse restores), and the
// default-open materialization fix (a day toggle on a calendar with NO record writes on:true so
// the exclusion takes effect and the open matrix stays open).
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }

function fx(extra) {
  const A = [];
  for (let i = 0; i < 3; i++) A.push({ school: 'A-School ' + (i + 1), schoolId: 'a' + (i + 1), coaches_ctkk: 1, ctkk: 10 });
  const data = Object.assign({
    status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A },
    staffingOptsByCal: { cal_a: { bySchool: false, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:30') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  }, extra || {});
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
  E.tbl = () => E.pl().querySelector('.sf-alloc-table');
  E.det = () => W._pgGuideDetails()['pg-001'];
  E.cbAt = (si, day) => E.tbl() && E.tbl().querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + day + '"] input.sf-alloc-cb');
  E.allows = (si, day) => W._pgAllocAllows('pg-001', 0, '', si, day);
  E.totals = () => { const s = d.getElementById('summary-section-pg-001'); return (s && s.__pgCalc && s.__pgCalc.totals) || null; };
  E.pop = () => d.querySelector('.sf-sh-popup');
  E.ctxm = () => d.querySelector('.pg-dayvis-ctx');
  E.ctxItem = () => { const m = E.ctxm(); return m && m.querySelector('.pg-dayvis-ctx-item'); };
  E.rclick = async (el) => { $(el).trigger($.Event('contextmenu', { clientX: 60, clientY: 60 })); await flush(60); };
  E.hist = () => { W._pgHist.flushNow('pg-001'); return W._pgHist.list('pg-001'); };
  E.undoBtn = () => [...d.body.querySelectorAll('button, span, a')].find(x => /^Undo$/i.test(x.textContent.trim()));
  // The summary snapshot settles on its own debounce; poll rather than guess one flush size.
  E.waitTotals = async (hours, ms) => { const t1 = Date.now() + (ms || 4000); for (;;) { const t = E.totals(); if (t && t.hours === hours) return t; if (Date.now() > t1) return t; await flush(150); } };
  // Separate-by-School renders an anchor div AND the real scroll with the same data-sf-school;
  // resolve the one that actually contains the day headers.
  E.soloTbl = (si) => [...E.pl().querySelectorAll('[data-sf-school="' + si + '"]')].find(el => el.querySelectorAll('thead th[data-day]').length) || null;
  await importGuide(dom, c, json); await flush(900);
  return E;
}

(async () => {

  /* ═══ Suite 1: the Days checkbox on a DEFAULT-OPEN calendar (no record) now takes effect ═══ */
  await suite('default-open materialization: a day uncheck writes on:true, the exclusion applies, the matrix stays open', async () => {
    const E = await boot(fx()); const { dom, W, d, $ } = E;
    check('matrix renders default-open with NO record materialized', !!E.tbl() && !(E.det().staffAlloc && E.det().staffAlloc.c0));
    check('seam registered for the calendar master', !!(W._pgAllocDayCtl && W._pgAllocDayCtl['pg-001|cal_a'] && W._pgAllocDayCtl['pg-001|cal_a'].set && W._pgAllocDayCtl['pg-001|cal_a'].allows));
    const t0 = E.totals();
    check('baseline totals computed', !!t0 && t0.hours === 195 && t0.amount === 15600, JSON.stringify(t0));
    const h0 = E.hist().length;
    $('.pg-undo-snack').remove();
    $(E.cbAt(0, 'mon')).prop('checked', false).trigger('change'); await flush(1300);
    const rec = E.det().staffAlloc && E.det().staffAlloc.c0;
    check('the materialized record says on:true (the state the user was looking at)', !!rec && rec.on === true, JSON.stringify(rec && { on: rec.on }));
    check('the exclusion is recorded and IN FORCE', rec && rec.cells['0|mon'] === false && E.allows(0, 'mon') === false);
    check('the matrix did NOT hide on the rebuild', !!E.tbl() && E.cbAt(0, 'mon') && E.cbAt(0, 'mon').checked === false);
    const t1 = E.totals();
    check('the schedule lost exactly that school-day (195h \u2192 182h)', !!t1 && t1.hours === 182 && t1.amount === 14560, JSON.stringify(t1));
    const recs = E.hist();
    check('exactly ONE readable History record with the checkbox sentence', recs.length === h0 + 1 && /Removed A-School 1 from Monday Staffing Allocation for CalA\./.test(recs[0].desc || ''), (recs[0] || {}).desc);
    const ub = E.undoBtn();
    check('the transaction offers Undo', !!ub);
    if (ub) { $(ub).trigger('click'); await flush(1300); }
    check('Undo restores the allocation and the totals', E.allows(0, 'mon') === true && E.totals().hours === 195);
    check('Select All / Clear also work on the (re-)default state \u2014 Clear writes a record that takes effect', await (async () => {
      const clr = [...E.tbl().querySelectorAll('button, span, a, div')].find(x => /^Clear$/.test(x.textContent.trim()));
      if (!clr) return false;
      $(clr).trigger('click'); await flush(1300);
      const ok = E.allows(1, 'tue') === false && E.totals().hours === 0;
      const ub2 = E.undoBtn(); if (ub2) { $(ub2).trigger('click'); await flush(1300); }
      return ok && E.totals().hours === 195;
    })());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: the seam performs the IDENTICAL transaction the checkbox performs ═══ */
  await suite('seam .set() = the checkbox transaction: same record, sentence, Undo, totals, checkbox sync', async () => {
    const E = await boot(fx()); const { dom, W, $ } = E;
    const h0 = E.hist().length;
    $('.pg-undo-snack').remove();
    W._pgAllocDayCtl['pg-001|cal_a'].set(0, 'mon', false); await flush(1300);
    const rec = E.det().staffAlloc && E.det().staffAlloc.c0;
    check('the record matches the checkbox write (on:true, 0|mon false)', !!rec && rec.on === true && rec.cells['0|mon'] === false);
    check('allows() and the seam agree', E.allows(0, 'mon') === false && W._pgAllocDayCtl['pg-001|cal_a'].allows(0, 'mon') === false);
    check('totals moved exactly as the checkbox moves them', E.totals().hours === 182);
    check('the visible matrix checkbox synced (unchecked)', E.cbAt(0, 'mon') && E.cbAt(0, 'mon').checked === false);
    const recs = E.hist();
    check('ONE History record, the SAME sentence the checkbox writes', recs.length === h0 + 1 && /Removed A-School 1 from Monday Staffing Allocation for CalA\./.test(recs[0].desc || ''), (recs[0] || {}).desc);
    check('Undo offered', !!E.undoBtn());
    W._pgAllocDayCtl['pg-001|cal_a'].set(0, 'mon', true); await flush(1300);
    check('set(true) restores: allows, checkbox, totals', E.allows(0, 'mon') === true && E.cbAt(0, 'mon').checked === true && E.totals().hours === 195);
    const recs2 = E.hist();
    check('the restore logs the Added sentence', /Added A-School 1 to Monday Staffing Allocation for CalA\./.test((recs2[0] || {}).desc || ''), (recs2[0] || {}).desc);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: popup from the SCHOOL LIST — right-click menu, exclude/include, live sync ═══ */
  await suite('popup (school-list entry): right-click opens Exclude {Day} with the excludeweek icon; picking applies + keeps the popup live; Include restores', async () => {
    const E = await boot(fx()); const { dom, W, d, $ } = E;
    const nm = [...E.pl().querySelectorAll('.sf-strip-school-nm')].find(x => /A-School 1/.test(x.textContent));
    $(nm).trigger('click'); await flush(300);
    check('the per-school popup opened from the school list', !!E.pop());
    const th = E.pop().querySelector('thead th[data-day="tue"]');
    await E.rclick(th);
    let m = E.ctxm();
    check('right-clicking an ACTIVE day header opens the one-item menu', !!m && !!E.ctxItem());
    check('the item reads "Exclude Tuesday" (full day name)', m && /^Exclude Tuesday$/.test(m.textContent.trim()), m && m.textContent.trim());
    check('it carries the excludeweek icon', m && !!m.querySelector('svg[data-icon="excludeweek"]'));
    d.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush(40);
    check('Escape closes the menu without acting', !E.ctxm() && E.allows(0, 'tue') === true);
    await E.rclick(E.pop().querySelector('thead th[data-day="tue"]'));
    $('.pg-undo-snack').remove();
    const h0 = E.hist().length;
    $(E.ctxItem()).trigger('click'); await flush(1400);
    check('picking Exclude applies the allocation exclusion', E.allows(0, 'tue') === false);
    check('the popup STAYED OPEN and re-rendered live', !!E.pop());
    const th2 = E.pop().querySelector('thead th[data-day="tue"]');
    check('the popup day header is struck through immediately', th2 && th2.style.textDecoration === 'line-through');
    check('the Staffing Allocation checkbox synced live', E.cbAt(0, 'tue') && E.cbAt(0, 'tue').checked === false);
    const tEx = await E.waitTotals(182);
    check('the totals recalculated through the same chain', !!tEx && tEx.hours === 182 && tEx.amount === 14560, JSON.stringify(tEx));
    const recs = E.hist();
    check('ONE History record with the checkbox sentence', recs.length === h0 + 1 && /Removed A-School 1 from Tuesday Staffing Allocation for CalA\./.test(recs[0].desc || ''), (recs[0] || {}).desc);
    check('Undo offered for the right-click op too', !!E.undoBtn());
    await E.rclick(E.pop().querySelector('thead th[data-day="tue"]'));
    m = E.ctxm();
    check('an EXCLUDED day now offers "Include Tuesday"', m && /^Include Tuesday$/.test(m.textContent.trim()), m && m.textContent.trim());
    check('with the includeweek icon', m && !!m.querySelector('svg[data-icon="includeweek"]'));
    $(E.ctxItem()).trigger('click'); await flush(1400);
    const tIn = await E.waitTotals(195);
    check('Include restores the day everywhere (allows, header, checkbox, totals)', (function () {
      const th3 = E.pop() && E.pop().querySelector('thead th[data-day="tue"]');
      return E.allows(0, 'tue') === true && th3 && th3.style.textDecoration !== 'line-through' && E.cbAt(0, 'tue').checked === true && tIn && tIn.hours === 195;
    })());
    check('exactly one menu ever exists (no double-binding from the popup build)', d.querySelectorAll('.pg-dayvis-ctx').length === 0 && (await (async () => { await E.rclick(E.pop().querySelector('thead th[data-day="wed"]')); const n = d.querySelectorAll('.pg-dayvis-ctx').length; const it = E.ctxItem(); d.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); await flush(40); return n === 1 && !!it; })()));
    const px = d.querySelector('.sf-sh-popup-x'); if (px) { $(px).trigger('click'); await flush(40); }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4: popup from STAFFING ALLOCATION + Week views carry NO menu + locked View ═══ */
  await suite('popup (Staffing Allocation entry) has the menu in Base; a Rotation Week view and locked View never do', async () => {
    const E = await boot(fx()); const { dom, W, d, $ } = E;
    // Give school 0 a 2-week rotation so the popup shows Week circles (t99 prep).
    $(E.tbl().querySelector('td.sf-wkov-vert')).trigger('click'); await flush(700);
    $(E.tbl().querySelector('.sf-wkrot-vert')).trigger('click'); await flush(700);
    const ctl = W._pgWkRotCtl['pg-001|cal_a'];
    ctl.setRotation('0', 2); await flush(800);
    const anm = [...E.pl().querySelectorAll('.sf-alloc-school-nm')].find(x => /A-School 1/.test(x.textContent.trim()));
    check('the Staffing Allocation school name is present', !!anm);
    $(anm).trigger('click'); await flush(300);
    check('the popup opened from the Staffing Allocation entry point', !!E.pop());
    await E.rclick(E.pop().querySelector('thead th[data-day="mon"]'));
    check('Base view carries the right-click menu from this entry point too', !!E.ctxm() && /^Exclude Monday$/.test(E.ctxm().textContent.trim()));
    d.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush(40);
    check('Escape dismissed the menu but left the popup open', !E.ctxm() && !!E.pop());
    const wk1 = E.pop().querySelector('.sf-shv-wk[data-shv="1"]');
    check('the popup exposes the Week 1 circle', !!wk1);
    $(wk1).trigger('click'); await flush(300);
    await E.rclick(E.pop().querySelector('thead th[data-day="mon"]'));
    check('a Rotation Week VIEW carries NO day menu', !E.ctxm());
    const bb = E.pop().querySelector('.sf-shv-base'); if (bb) { $(bb).trigger('click'); await flush(300); }
    const px = d.querySelector('.sf-sh-popup-x'); if (px) { $(px).trigger('click'); await flush(60); }
    // Locked View: the popup opens read-only and must offer no menu.
    $([...E.pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(120);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(1400);
    const nm2 = [...E.pl().querySelectorAll('.sf-strip-school-nm, .sf-alloc-school-nm')].find(x => /A-School 1/.test(x.textContent));
    $(nm2).trigger('click'); await flush(300);
    if (E.pop()) {
      await E.rclick(E.pop().querySelector('thead th[data-day="mon"]'));
      check('locked View: right-click opens NO menu', !E.ctxm());
      const px2 = d.querySelector('.sf-sh-popup-x'); if (px2) { $(px2).trigger('click'); await flush(40); }
    } else {
      check('locked View: right-click opens NO menu', true, 'popup not openable while locked \u2014 trivially no menu');
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 5: the REGULAR school-specific table (Separate by School, Base) ═══ */
  await suite('regular separated table: right-click on its day headers runs the same op; struck header + zeroed day follow', async () => {
    const E = await boot(fx({ staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } } }));
    const { dom, W, d, $ } = E;
    const solo = E.soloTbl(0);
    check('the separated per-school table renders', !!solo);
    const th = solo.querySelector('thead th[data-day="wed"]');
    await E.rclick(th);
    check('right-click on the LIVE per-school table opens the menu', !!E.ctxm() && /^Exclude Wednesday$/.test(E.ctxm().textContent.trim()), E.ctxm() && E.ctxm().textContent.trim());
    $('.pg-undo-snack').remove();
    $(E.ctxItem()).trigger('click'); await flush(1400);
    check('the exclusion applied through the master', E.allows(0, 'wed') === false);
    const th2 = E.pl().querySelector('[data-sf-school="0"] thead th[data-day="wed"]');
    check('the table\u2019s own header struck through by the recalc', th2 && th2.style.textDecoration === 'line-through');
    check('the day\u2019s column went INACTIVE in the solo table (count blanked, cell faded, Total Hours emptied)', (function () {
      const s2 = E.soloTbl(0); if (!s2) return false;
      const c2 = s2.querySelector('.count-cell-u[data-role="ctkk"][data-day="wed"]');
      const t2 = s2.querySelector('.total-hrs-cell-u[data-role="ctkk"][data-day="wed"]');
      const txt = c2 && c2.textContent.replace(/\s+/g, '');
      return c2 && (txt === '' || txt === '0') && c2.closest('td').style.opacity === '0.4' && t2 && t2.textContent.trim() === '';
    })());
    check('the master matrix checkbox synced', E.cbAt(0, 'wed') && E.cbAt(0, 'wed').checked === false);
    check('the sibling school is untouched', E.allows(1, 'wed') === true);
    check('Undo offered', !!E.undoBtn());
    await E.rclick(E.soloTbl(0).querySelector('thead th[data-day="wed"]'));
    check('the struck header now offers Include Wednesday', E.ctxm() && /^Include Wednesday$/.test(E.ctxm().textContent.trim()));
    $(E.ctxItem()).trigger('click'); await flush(1400);
    check('Include restores header + allocation', (function () {
      const th3 = E.soloTbl(0) && E.soloTbl(0).querySelector('thead th[data-day="wed"]');
      return E.allows(0, 'wed') === true && th3 && th3.style.textDecoration !== 'line-through';
    })());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 6: bidirectional — a MATRIX checkbox change reaches an OPEN popup live ═══ */
  await suite('bidirectional sync: toggling the Days checkbox updates an open popup immediately (and back)', async () => {
    const E = await boot(fx()); const { dom, d, $ } = E;
    const nm = [...E.pl().querySelectorAll('.sf-strip-school-nm')].find(x => /A-School 1/.test(x.textContent));
    $(nm).trigger('click'); await flush(300);
    check('popup open on Base', !!E.pop());
    $(E.cbAt(0, 'thu')).prop('checked', false).trigger('change'); await flush(1400);
    const th = E.pop() && E.pop().querySelector('thead th[data-day="thu"]');
    check('the popup re-rendered with Thursday struck (no reopen needed)', !!E.pop() && th && th.style.textDecoration === 'line-through');
    $(E.cbAt(0, 'thu')).prop('checked', true).trigger('change'); await flush(1400);
    const th2 = E.pop() && E.pop().querySelector('thead th[data-day="thu"]');
    check('re-checking restores the popup header live', !!E.pop() && th2 && th2.style.textDecoration !== 'line-through');
    const px = d.querySelector('.sf-sh-popup-x'); if (px) { $(px).trigger('click'); await flush(40); }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 7: Weeks expansion width cap (seeded through the seam; jsdom has no geometry) ═══ */
  await suite('expanding Weeks caps the alloc scroller at the stored pre-expansion width; collapsing removes the cap', async () => {
    const E = await boot(fx()); const { dom, W, $ } = E;
    const scr = () => E.pl().querySelector('.sf-alloc-wrap > div');
    check('the scroll container renders uncapped while collapsed', scr() && scr().style.maxWidth === '100%', scr() && scr().style.maxWidth);
    W._pgAllocWovW['pg-001|cal_a'] = 500;   // seeded "measured while collapsed" width (jsdom measures 0)
    $(E.tbl().querySelector('td.sf-wkov-vert')).trigger('click'); await flush(800);
    check('the Weeks columns are expanded', E.tbl().querySelectorAll('th.sf-wkov-week-h').length > 0);
    check('the scroller is CAPPED at the stored pre-expansion width', scr() && scr().style.maxWidth === '500px', scr() && scr().style.maxWidth);
    check('and stretches to it (width:100% under the cap)', scr() && scr().style.width === '100%');
    check('School Name stays sticky inside the capped scroller', (function () {
      const sn = E.tbl().querySelector('td.sf-alloc-school'); return sn && sn.style.position === 'sticky';
    })());
    $(E.tbl().querySelector('.sf-wkov-lbl')).trigger('click'); await flush(800);
    check('collapsing restores the natural (uncapped) width', scr() && scr().style.maxWidth === '100%', scr() && scr().style.maxWidth);
    // No stored width and no real geometry -> the cap must NOT apply (browser-only behavior).
    delete W._pgAllocWovW['pg-001|cal_a'];
    $(E.tbl().querySelector('td.sf-wkov-vert')).trigger('click'); await flush(800);
    check('with no measurement available the expansion stays uncapped (jsdom no-op)', scr() && scr().style.maxWidth === '100%', scr() && scr().style.maxWidth);
    $(E.tbl().querySelector('.sf-wkov-lbl')).trigger('click'); await flush(400);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
