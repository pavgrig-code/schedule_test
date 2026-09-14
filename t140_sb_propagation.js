// t140_sb_propagation.js — Site Breakdown -> Calendar propagation. Every Site Breakdown edit that changes
// staffing (students -> derived coaches, a non-coach role count, add / remove a school) must recalculate
// and rerender the Calendar IMMEDIATELY: the day cell's hours + count badge, the hover and pinned
// popups, and the Summary — with no reopen, view switch or navigation. Reproduces the reported Salinas
// scenario (Aug 18 cell stale at its old value while the popup showed the new total) on the REAL guide.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
const fs = require('fs');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
// small fixture: 3 schools, Coaches (spc 10) + SM ; SH 09-15 (6h)
function fixture() {
  const rows = [
    { school: 'Alpha', schoolId: 's1', coaches_ctkk: 2, ctkk: 20, sm: 1 },
    { school: 'Bravo', schoolId: 's2', coaches_ctkk: 1, ctkk: 10, sm: 1 },
    { school: 'Charlie', schoolId: 's3', coaches_ctkk: 3, ctkk: 30, sm: 1 }];
  const data = {
    status: 'Draft', calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }, { key: 'sm', name: 'SM', isCoach: false }],
    siteRowsByCal: { cal_a: rows.slice() }, siteRows: rows.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00'), sm: mkTimes('09:00', '15:00') } }
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data });
}
async function importGuide(dom, c, json, settle) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(settle || 3000); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const cellFor = (dk, calId) => pl().querySelector('.cal-day-cell[data-date-key="' + dk + '"][data-cal-id="' + calId + '"]:not(.cal-combined-carrier)');
  const hrsOf = cl => { const h = cl && cl.querySelector('.cal-hours'); return h ? parseFloat(h.textContent) : NaN; };
  const cntOf = cl => { const b = cl && (cl.querySelector('.sf-cell-cnt') || cl.querySelector('[data-eff-cnt]')); return b ? parseInt(b.getAttribute('data-eff-cnt') || b.textContent, 10) : NaN; };
  const sbTable = () => [...pl().querySelectorAll('table')].find(t => t.rows[0] && /# of Coaches/.test(t.rows[0].textContent) && [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del'));
  const sbRows = () => [...sbTable().tBodies[0].rows].filter(r => [...r.querySelectorAll('button')].some(b => b.textContent.trim() === 'Del'));
  const colIdx = re => [...sbTable().rows[0].cells].findIndex(x => re.test(x.textContent));
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const popGrand = pop => { const t = [...pop.querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total \(\d+ schools?\)/, '').trim()) : NaN; };
  const pinnedTotal = async cl => { $(cl).trigger('click'); await flush(500); const p = popup(); const g = p ? popGrand(p) : NaN; $(d.body).trigger('click'); await flush(250); return g; };
  const hoverTotal = async cl => { $(cl).trigger('mouseenter'); await flush(500); const p = popup(); const g = p ? popGrand(p) : NaN; $(cl).trigger('mouseleave'); await flush(300); return g; };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  // wait until the cell shows the expected value (propagation is debounced ~120ms + a full recalc)
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (fn()) return true; await flush(100); } return fn(); };

  /* ═══ 1. Small fixture: students edit (derived coaches) propagates immediately to cell, count, popups, Summary ═══ */
  await suite('Editing # of Students re-derives coaches and immediately updates the day cell, count badge, popups and Summary', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const D = '2026-07-08'; const cl = () => cellFor(D, 'cal_a');
    check('baseline: 6h x (2+1+3 coaches + 3 SM) = 54', hrsOf(cl()) === 54, hrsOf(cl()));
    const sumBefore = summaryHours();
    const sI = colIdx(/# of Students/);
    // Alpha: 20 students -> 50 => ceil(50/10) = 5 coaches (+3) => +18h
    $(sbRows()[0].cells[sI].querySelector('input')).val('50').trigger('input');
    const ok = await until(() => hrsOf(cl()) === 72, 5000);
    check('the day cell updates to 72 with NO reopen / navigation', ok && hrsOf(cl()) === 72, hrsOf(cl()));
    check('the stored derived coaches are 5', String(det().siteRowsByCal.cal_a[0].coaches_ctkk) === '5', det().siteRowsByCal.cal_a[0].coaches_ctkk);
    check('the count badge updates (5+1+3 coaches + 3 SM = 12)', cntOf(cl()) === 12, cntOf(cl()));
    check('the hover popup reconciles with the cell (72)', (await hoverTotal(cl())) === 72);
    check('the pinned popup reconciles with the cell (72)', (await pinnedTotal(cl())) === 72);
    await until(() => summaryHours() !== sumBefore, 3000);
    check('the Summary Total Hours moved too', isFinite(summaryHours()) && summaryHours() !== sumBefore, sumBefore + ' -> ' + summaryHours());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Non-coach role count edit propagates ═══ */
  await suite('Editing a non-coach role count (SM) immediately updates the Calendar', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const D = '2026-07-08'; const cl = () => cellFor(D, 'cal_a');
    // non-coach roles (SM) live under the '# of Specialized' column
    const smI = colIdx(/# of Specialized/);
    check('a # of Specialized column exists in the Site Breakdown', smI >= 0, JSON.stringify([...sbTable().rows[0].cells].map(x => x.textContent.trim())));
    const smInp = sbRows()[1].cells[smI].querySelector('input');
    check('the SM count input is editable', !!smInp, sbRows()[1].cells[smI].innerHTML.slice(0, 120));
    // Bravo SM 1 -> 4 => +3 x 6h = +18 => 72
    if (smInp) $(smInp).val('4').trigger('input');
    const ok = await until(() => hrsOf(cl()) === 72, 5000);
    check('the day cell updates to 72 immediately', ok && hrsOf(cl()) === 72, hrsOf(cl()));
    check('the pinned popup reconciles (72)', (await pinnedTotal(cl())) === 72);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Remove a school -> cell drops immediately; popups reconcile ═══ */
  await suite('Deleting a Site Breakdown school row immediately drops it from the Calendar', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const D = '2026-07-08'; const cl = () => cellFor(D, 'cal_a');
    const delBtns = [...sbTable().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Del');
    $(delBtns[2]).trigger('click');   // Charlie: 3 coaches + 1 SM = 24h
    const ok = await until(() => hrsOf(cl()) === 30, 5000);
    check('the day cell drops to 30 immediately', ok && hrsOf(cl()) === 30, hrsOf(cl()));
    check('the pinned popup reconciles (30) and says 2 schools', (await pinnedTotal(cl())) === 30);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. The REAL Salinas guide: the reported Aug 18 scenario ═══ */
  await suite('Salinas guide: a Site Breakdown students edit on an allocated school immediately updates the Aug 18 cell and both popups (no stale 401 vs 1105)', async () => {
    const real = fs.readFileSync(__dirname + '/../probes/salinas_09-13.json', 'utf8');
    await importGuide(dom, c, real, 6000); await flush(3000);
    const CAL = 'cal_mtabwyjh6nhmh1'; const D = '2026-08-18'; const cl = () => cellFor(D, CAL);
    check('Aug 18 renders', !!cl());
    const before = hrsOf(cl());
    check('cell and pinned popup agree on load (single source of truth)', (await pinnedTotal(cl())) === before, before);
    // El Gabilan (row 2) is allocated on Tuesdays: students -> 200 => coaches ceil(200/20) = 10 (was 20) => -4h x 10 = -40
    const sI = colIdx(/# of Students/);
    $(sbRows()[2].cells[sI].querySelector('input')).val('200').trigger('input');
    const ok = await until(() => hrsOf(cl()) === before - 40, 12000);
    check('the Aug 18 cell moves by -40 IMMEDIATELY (no reopen)', ok && hrsOf(cl()) === before - 40, before + ' -> ' + hrsOf(cl()));
    check('the derived coaches for El Gabilan are now 10', String(det().siteRowsByCal[CAL][2].coaches_cg18) === '10', det().siteRowsByCal[CAL][2].coaches_cg18);
    check('the hover popup reconciles with the cell', (await hoverTotal(cl())) === hrsOf(cl()));
    check('the pinned popup reconciles with the cell', (await pinnedTotal(cl())) === hrsOf(cl()));
    // a school that is allocation-OFF on Tuesdays (Boronda Elementary, row 1) must not move Aug 18
    const v = hrsOf(cl());
    $(sbRows()[1].cells[sI].querySelector('input')).val('300').trigger('input'); await flush(2500);
    check('editing a school excluded on Tuesdays leaves Aug 18 unchanged (but the Calendar still rerendered)', hrsOf(cl()) === v, hrsOf(cl()));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Salinas Aug 11 (frozen): schools with no effective contribution are omitted from both popups ═══ */
  await suite('Salinas Aug 11: Boronda Meadows (frozen at count 0) and Boronda Elementary (allocation-off) are omitted; subtotal, Total and cell agree', async () => {
    const real = fs.readFileSync(__dirname + '/../probes/salinas_09-13.json', 'utf8');
    await importGuide(dom, c, real, 6000); await flush(3000);
    const CAL = 'cal_mtabwyjh6nhmh1'; const cl = () => cellFor('2026-08-11', CAL);
    const txt = () => (popup() ? popup().textContent : '');
    const counts = () => { const sub = [...popup().querySelectorAll('tr,div')].filter(e => /^Subtotal \(\d+ schools?\)/.test(e.textContent.trim())).map(e => /\((\d+) school/.exec(e.textContent)[1]); const t = [...popup().querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); return { sub, tot: t ? /\((\d+) school/.exec(t.textContent)[1] : null }; };
    check('Aug 11 cell = 316 (frozen)', hrsOf(cl()) === 316, hrsOf(cl()));
    $(cl()).trigger('mouseenter'); await flush(700);
    check('HOVER: Boronda Meadows omitted', !/Boronda Meadows/.test(txt()));
    check('HOVER: Boronda Elementary omitted', !/Boronda Elementary/.test(txt()));
    let cnt = counts();
    // Aug 11 now takes the AGGREGATE layout (like Aug 12): a single section, so no per-group Subtotal row - only the Total
    check('HOVER: the Total says 12 schools and equals the cell (316); any Subtotal present also says 12', cnt.tot === '12' && popGrand(popup()) === 316 && cnt.sub.every(x => x === '12'), JSON.stringify(cnt) + '/' + popGrand(popup()));
    $(cl()).trigger('mouseleave'); await flush(400);
    $(cl()).trigger('click'); await flush(700);
    check('PINNED: both Boronda schools omitted', !/Boronda Meadows/.test(txt()) && !/Boronda Elementary/.test(txt()));
    cnt = counts();
    check('PINNED: Total 12 = cell 316 (no stale 13-vs-12 mismatch; any Subtotal also 12)', cnt.tot === '12' && popGrand(popup()) === 316 && cnt.sub.every(x => x === '12'), JSON.stringify(cnt) + '/' + popGrand(popup()));
    $(d.body).trigger('click'); await flush(300);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Salinas: the school list renders the same way on Aug 11 (frozen) and Aug 12 (live) ═══ */
  await suite('Salinas Aug 11 vs Aug 12: the school list is outside the table, above the header, unstyled, indented 10px, on both days', async () => {
    const real = fs.readFileSync(__dirname + '/../probes/salinas_09-13.json', 'utf8');
    await importGuide(dom, c, real, 6000); await flush(3000);
    const CAL = 'cal_mtabwyjh6nhmh1';
    const describe = pop => {
      const list = pop.querySelector('.cal-tip-schoollist');
      const hdr = [...pop.querySelectorAll('th,td')].find(x => /^Role$/.test(x.textContent.trim()));
      const grouped = [...pop.querySelectorAll('table td[colspan]')].filter(td => /Elementary/.test(td.textContent)).length;
      const row = list && list.querySelector('div');
      return { outside: !!list && !list.closest('table'), aboveHeader: !!(list && hdr && (list.compareDocumentPosition(hdr) & W.Node.DOCUMENT_POSITION_FOLLOWING)), grouped, ml: list && list.style.marginLeft, weight: row && row.style.fontWeight, size: row && row.style.fontSize, bg: list && list.style.background };
    };
    const out = {};
    for (const dk of ['2026-08-11', '2026-08-12']) {
      const cl = cellFor(dk, CAL); $(cl).trigger('click'); await flush(800);
      out[dk] = describe(popup()); $(d.body).trigger('click'); await flush(300);
    }
    const a = out['2026-08-11'], b = out['2026-08-12'];
    check('Aug 11 (frozen): list OUTSIDE the table and ABOVE the header, no grouped section rows', a.outside && a.aboveHeader && a.grouped === 0, JSON.stringify(a));
    check('Aug 12 (live): same', b.outside && b.aboveHeader && b.grouped === 0, JSON.stringify(b));
    check('both lists carry margin-left 10px, normal weight, 10px type, no background', [a, b].every(x => x.ml === '10px' && (x.weight === '' || x.weight === '400') && x.size === '10px' && !x.bg), JSON.stringify([a, b]));
    check('the two days use identical list styling', JSON.stringify([a.ml, a.weight, a.size, a.bg]) === JSON.stringify([b.ml, b.weight, b.size, b.bg]));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Salinas v2: EVERY frozen day reconciles (cell = hover = pinned) and none renders empty ═══ */
  await suite('Salinas v2: every frozen day (Aug 6-21) shows its schools and reconciles cell = hover = pinned; none is empty', async () => {
    const real = fs.readFileSync(__dirname + '/../probes/salinas_v2.json', 'utf8');
    await importGuide(dom, c, real, 6000); await flush(3000);
    const CAL = 'cal_mtabwyjh6nhmh1';
    const grand = pop => { const t = [...pop.querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)/.test(e.textContent.trim())).pop(); const m = t && /Total \((\d+) school/.exec(t.textContent); return { n: m ? +m[1] : NaN, v: t ? parseFloat(t.textContent.replace(/^Total \(\d+ schools?\)/, '').trim()) : NaN }; };
    const days = ['2026-08-06', '2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
    const expectedCells = { '2026-08-10': 1020, '2026-08-06': 1272, '2026-08-13': 1166, '2026-08-17': 1020, '2026-08-20': 1166 };
    for (const dk of days) {
      const cl = cellFor(dk, CAL); const cv = hrsOf(cl);
      if (expectedCells[dk] != null) check(dk + ': the frozen cell reads ' + expectedCells[dk], cv === expectedCells[dk], cv);
      $(cl).trigger('mouseenter'); await flush(600); const hv = grand(popup()); $(cl).trigger('mouseleave'); await flush(300);
      $(cl).trigger('click'); await flush(600); const pn = grand(popup()); $(d.body).trigger('click'); await flush(300);
      check(dk + ': hover = pinned = cell (' + cv + ') with schools listed (never empty)', hv.v === cv && pn.v === cv && hv.n > 0 && pn.n > 0, 'hover ' + hv.n + '/' + hv.v + ' pinned ' + pn.n + '/' + pn.v);
    }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
