// t117_sb_unalloc_header.js — Twenty-eighth spec: fix the Site Breakdown header Unallocated/Remaining
// behavior. ONE summary element, always visible in the header when unalloc exists (expanded OR
// collapsed) and never duplicated by collapse/expand/re-render; the Unallocated checkbox is fully
// removed while collapsed and restored (to its prior checked state) on expand; live sync on edits;
// no summary when there is no unalloc; and a stress loop asserting exactly one summary at all times.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fx(unalloc, alloc) {
  const A = [{ school: 'Alpha', schoolId: 'a1', coaches_ctkk: 1, ctkk: 10 }];
  const data = {
    status: 'Draft',
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A }, staffingOptsByCal: { cal_a: { bySchool: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:30') } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  };
  if (unalloc != null) data.unschedByCal = { cal_a: { unalloc: String(unalloc), rows: [{ total: String(alloc == null ? 7.5 : alloc) }] } };
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
  E.hd = () => E.sb().querySelector('.px-3.py-2');
  E.sumX = () => E.sb().querySelector('.sb-unalloc-sum');
  E.sumCount = () => E.sb().querySelectorAll('.sb-unalloc-sum').length;
  E.sumVisible = () => { const x = E.sumX(); return !!x && x.style.display !== 'none'; };
  E.sumText = () => { const x = E.sumX(); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; };
  E.cbSeg = () => E.sb().querySelector('.sb-unalloc-toggle-seg');
  E.cbSegVisible = () => { const s = E.cbSeg(); return !!s && s.style.display !== 'none'; };
  E.cb = () => E.sb().querySelector('.sb-unalloc-cb');
  E.unCard = () => E.pl().querySelector('.unsched-cal-card[data-unsched-cal="cal_a"]');
  E.cardVisible = () => { const c2 = E.unCard(); return !!c2 && c2.style.display !== 'none'; };
  E.tog = () => E.sb().querySelector('.pg-sec-toggle');
  E.collapsed = () => E.tog().getAttribute('aria-expanded') === 'false';
  E.toggle = async () => { $(E.tog()).trigger('click'); await flush(150); };
  E.dupLabels = () => (E.hd().textContent.match(/Unallocated Hours:/g) || []).length;
  await importGuide(dom, c, json); await flush(1200);
  return E;
}

(async () => {

  /* ═══ Suite 1: the state table (parts 1, 3, 4, 6) ═══ */
  await suite('the header follows the spec state table across expanded/collapsed and checkbox states', async () => {
    const E = await boot(fx(100)); const { dom, $ } = E;
    // Expanded, checkbox checked (default)
    check('expanded+checked: summary visible, checkbox visible, detail area visible', !E.collapsed() && E.sumVisible() && E.cbSegVisible() && E.cardVisible());
    check('exactly one summary element', E.sumCount() === 1 && E.dupLabels() === 1);
    // Expanded, unchecked
    $(E.cb()).prop('checked', false).trigger('change'); await flush(120);
    check('expanded+unchecked: summary stays, checkbox stays, detail area hidden', E.sumVisible() && E.cbSegVisible() && !E.cardVisible());
    // Collapse (from unchecked)
    await E.toggle();
    check('collapsed: summary STAYS visible', E.sumVisible() && /Unallocated Hours:\s*100/.test(E.sumText()));
    check('collapsed: the checkbox is COMPLETELY hidden (no reserved space)', !E.cbSegVisible());
    check('collapsed: detail area hidden', !E.cardVisible());
    check('collapsed: still exactly one summary element', E.sumCount() === 1 && E.dupLabels() === 1);
    // Expand -> checkbox restored to its prior (unchecked) state
    await E.toggle();
    check('re-expanded: checkbox restored and visible, in its prior UNCHECKED state', E.cbSegVisible() && E.cb().checked === false);
    check('re-expanded: summary still visible, detail still hidden (checkbox was off)', E.sumVisible() && !E.cardVisible());
    // Re-check, collapse, expand -> checkbox restored CHECKED and detail returns
    $(E.cb()).prop('checked', true).trigger('change'); await flush(120);
    await E.toggle();
    check('collapsed from checked: checkbox hidden, detail hidden, summary visible', !E.cbSegVisible() && !E.cardVisible() && E.sumVisible());
    await E.toggle();
    check('re-expanded: checkbox restored CHECKED and detail area returns', E.cbSegVisible() && E.cb().checked === true && E.cardVisible());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: no duplication under repeated re-render (part 2) ═══ */
  await suite('repeated collapse/expand never duplicates the Unallocated or Remaining summary', async () => {
    const E = await boot(fx(100)); const { dom } = E;
    check('starts with one Unallocated and one Remaining label', E.dupLabels() === 1 && (E.hd().textContent.match(/Remaining Hours:/g) || []).length === 1);
    for (let i = 0; i < 8; i++) {
      await E.toggle();
      check('cycle ' + (i + 1) + ': exactly one summary element and one Remaining label', E.sumCount() === 1 && E.dupLabels() === 1 && (E.hd().textContent.match(/Remaining Hours:/g) || []).length === 1, 'sum=' + E.sumCount() + ' un=' + E.dupLabels());
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: live sync (part 5) ═══ */
  await suite('the header values stay synchronized with the Unallocated area on every edit', async () => {
    const E = await boot(fx(100)); const { dom, $ } = E;
    check('starts at 100 / 92.5', /Unallocated Hours:\s*100\s*\|\s*Remaining Hours:\s*92\.5/.test(E.sumText()), E.sumText());
    const inp = E.unCard().querySelector('.sf-unalloc-inp');
    $(inp).val('60').trigger('input'); await flush(500);
    check('editing Unallocated to 60 updates the header to 60 / 52.5 immediately', /Unallocated Hours:\s*60\s*\|\s*Remaining Hours:\s*52\.5/.test(E.sumText()), E.sumText());
    // negative remaining -> red
    $(inp).val('5').trigger('input'); await flush(500);
    check('setting to 5 (< allocated 7.5) shows Remaining -2.5 in red', /Remaining Hours:\s*-2\.5/.test(E.sumText()) && /220,\s*53,\s*69/.test(E.sumX().querySelector('.sb-unalloc-sum-rem').style.color), E.sumText());
    // edit while collapsed -> header still tracks
    await E.toggle();
    $(inp).val('80').trigger('input'); await flush(500);
    check('editing while collapsed still updates the header summary live', /Unallocated Hours:\s*80/.test(E.sumText()) && E.sumVisible());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4: no summary when no unalloc (part 5-negative) ═══ */
  await suite('a program with no Unallocated Hours shows no summary in any state', async () => {
    const E = await boot(fx(null)); const { dom } = E;
    check('expanded: no summary', !E.sumVisible());
    check('the checkbox is still present (it controls the detail area)', E.cbSegVisible());
    await E.toggle();
    check('collapsed: still no summary, and no Unallocated label anywhere in the header', !E.sumVisible() && E.dupLabels() === 0);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 5: stress \u2014 random interactions keep exactly one correct summary (parts 7, 8) ═══ */
  await suite('30 random collapse/expand/checkbox/edit ops keep exactly one correct summary', async () => {
    const E = await boot(fx(100)); const { dom, $ } = E;
    const inp = () => E.unCard() && E.unCard().querySelector('.sf-unalloc-inp');
    let ok = true;
    for (let i = 0; i < 30; i++) {
      const r = Math.random();
      if (r < 0.4) { await E.toggle(); }
      else if (r < 0.7) { if (E.cbSegVisible()) { $(E.cb()).prop('checked', !E.cb().checked).trigger('change'); await flush(80); } }
      else { const v = Math.floor(Math.random() * 200); const el = inp(); if (el) { $(el).val(String(v)).trigger('input'); await flush(120); } }
      if (E.sumCount() !== 1 || E.dupLabels() !== 1 || (E.hd().textContent.match(/Remaining Hours:/g) || []).length !== 1) { ok = false; console.log('  break at op ' + i + ' sum=' + E.sumCount() + ' un=' + E.dupLabels()); break; }
      // whenever collapsed, the checkbox must be gone; whenever expanded, present
      if (E.collapsed() && E.cbSegVisible()) { ok = false; console.log('  checkbox visible while collapsed at op ' + i); break; }
      if (!E.collapsed() && !E.cbSegVisible()) { ok = false; console.log('  checkbox missing while expanded at op ' + i); break; }
    }
    check('through 30 random ops: always exactly one Unallocated and one Remaining summary', ok);
    check('final state is self-consistent (summary present, one element)', E.sumVisible() && E.sumCount() === 1);
    check('no page errors across the stress run', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
