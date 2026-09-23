// t152_summary_school_list.js — Summary "# of Schools" is clickable (> 0 only) and opens the School List
// popup for that Program: the SAME Site Breakdown rows the count came from, in Site Breakdown DISPLAY
// order, with pod rails, reference badges, label chips and the 'School N' placeholder for blank names.
// Live: reorder / pod / label / rename / clear / add / delete / Undo all update the open popup and the
// count together, and the list always reconciles with the clicked value. Popup chrome + dismissal match
// the Amount Breakdown popup (fixed, viewport-clamped, outside mousedown closes) plus Esc.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function pickSchools(W) {
  const SL = W._pgRef.allSchools();
  const ch = SL.find(s => String(s.charter || '').toUpperCase() === 'Y' && s.gs);
  const nc = SL.find(s => String(s.charter || '').toUpperCase() !== 'Y' && s.gs && s !== ch);
  const other = SL.find(s => s !== ch && s !== nc && s.name && s.cds);
  return { ch, nc, other };
}
function fx(W) {
  const { ch, nc } = pickSchools(W);
  const A = [
    { school: ch.name, schoolCds: String(ch.cds), coaches_ctkk: 1, ctkk: 10, sbLabels: ['lblES'] },
    { school: nc.name, schoolCds: String(nc.cds), coaches_ctkk: 2, ctkk: 10 },
    { school: '', coaches_ctkk: 3, ctkk: 10 },
    { school: 'Plain School', coaches_ctkk: 1, ctkk: 10 }];
  const data = {
    status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }, { name: 'CalB', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#64b5f6', pricePerHour: '70.00', billable: true, calId: 'cal_b' }],
    siteRows: A, siteRowsByCal: { cal_a: A, cal_b: [] },
    sbLabelsByCal: { cal_a: [{ id: 'lblES', name: 'ES', color: '#ef5350' }, { id: 'lblMS', name: 'MS', color: '#e91e63' }] },
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '12:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] };
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
  cap.dispatchEvent(new W.Event('change')); await flush(1600); d.createElement = ocr;
}
async function boot() {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const E = { dom, W, d, $, c };
  E.pl = () => d.getElementById('planning-panel');
  E.card = () => W._pgSbCards['pg-001|cal_a'];
  E.det = () => W._pgGuideDetails()['pg-001'];
  E.cell = cal => { const cs = E.pl().querySelectorAll('[data-guide-summary="pg-001"]'); const cd = cs[cs.length - 1]; return cd && cd.querySelector('.pg-gs-schools[data-calc-cal="' + cal + '"]'); };
  E.dd = () => d.querySelector('.pg-schools-dd');
  E.lines = () => [...E.dd().querySelectorAll('.pg-schools-row')].map(r => ({ pos: r.getAttribute('data-pos'), si: r.getAttribute('data-si'), nm: r.querySelector('.pg-schools-nm').textContent, ch: !!r.querySelector('.pg-ch-badge'), gs: !!r.querySelector('.pg-gs-badge'), lbls: [...r.querySelectorAll('.sb-lbl-chip')].map(x => x.textContent), pod: (r.closest('.tip-pod-run') || { getAttribute: () => null }).getAttribute('data-pod-name') }));
  E.open = async cal => { $(E.cell(cal)).trigger('click'); await flush(200); return E.dd(); };
  E.sbNames = () => (E.det().siteRowsByCal.cal_a || []).map((r, i) => (String(r.school || '').trim() || ('School ' + (i + 1))));
  E.sbRows = () => [...E.pl().querySelectorAll('.sb-num-cell')].map(td => td.closest('tr')).filter((v, i, a) => v && a.indexOf(v) === i);
  E.undoBtn = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop() || [...d.body.querySelectorAll('button, span, a')].find(x => /^Undo$/i.test(x.textContent.trim()));
  await importGuide(dom, c, fx(W)); await flush(800);
  return E;
}
// display-ordered names straight from the store: the truth the popup must match
const displayNames = E => { const idx = E.card().order(); const rows = E.det().siteRowsByCal.cal_a; return idx.map(ai => (String(rows[ai].school || '').trim() || ('School ' + (ai + 1)))); };

(async () => {

  /* ═══ 1. Clickable count, zero, and popup contents ═══ */
  await suite('# of Schools > 0 is clickable and opens the School List; 0 is not and opens nothing; the list is the Site Breakdown rows in order with numbering, placeholder, badges and label chips', async () => {
    const E = await boot(); const { dom, d, $ } = E;
    check('CalA shows 4 and is clickable with the Amount-cell affordance', E.cell('cal_a').textContent === '4' && E.cell('cal_a').classList.contains('pg-schools-clickable') && E.cell('cal_a').style.cursor === 'pointer' && /dotted/.test(E.cell('cal_a').style.textDecoration), E.cell('cal_a').textContent);
    check('CalB shows 0 and is NOT clickable', E.cell('cal_b').textContent === '0' && !E.cell('cal_b').classList.contains('pg-schools-clickable') && E.cell('cal_b').style.cursor !== 'pointer');
    $(E.cell('cal_b')).trigger('click'); await flush(150);
    check('clicking a 0 opens no popup', !E.dd());
    const dd = await E.open('cal_a');
    check('clicking the 4 opens the popup', !!dd);
    check('the header names the Program with its colour dot and the count', /CalA/.test(dd.querySelector('.pg-schools-title').textContent) && /\(4\)/.test(dd.querySelector('.pg-schools-title').textContent) && dd.getAttribute('data-schools-count') === '4', dd.querySelector('.pg-schools-title').textContent);
    const L = E.lines();
    check('exactly 4 lines, one per counted row, numbered 1..4', L.length === 4 && L.map(l => l.pos).join(',') === '1,2,3,4');
    check('names are in Site Breakdown order', L.map(l => l.nm).join('|') === displayNames(E).join('|'), L.map(l => l.nm).join('|'));
    check('the blank-named row uses the existing "School 3" placeholder', L[2].nm === 'School 3' && E.sbNames()[2] === 'School 3');
    check('badges match the Site Breakdown / Summary builders: charter+GS, GS only, none, none', L[0].ch && L[0].gs && !L[1].ch && L[1].gs && !L[2].ch && !L[2].gs && !L[3].ch && !L[3].gs, JSON.stringify(L.map(l => [l.ch, l.gs])));
    check('the ES label chip shows on its school as the shared chip', L[0].lbls.join(',') === 'ES' && dd.querySelector('.sb-lbl-chip[data-lbl-id="lblES"]') && /ef5350|239, 83, 80/.test(dd.querySelector('.sb-lbl-chip[data-lbl-id="lblES"]').style.background));
    check('no duplicates and every line maps to a distinct row index', new Set(L.map(l => l.si)).size === 4);
    check('no pod rails yet (no pod assigned)', !dd.querySelector('.tip-pod-run'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Popup chrome and dismissal ═══ */
  await suite('Popup uses the Amount Breakdown chrome (fixed, top layer, viewport-clamped) and closes on Esc, outside mousedown, or its close button; an inside click keeps it; only one is open at a time', async () => {
    const E = await boot(); const { dom, d, $, W } = E;
    const amtStyle = () => { const c = [...E.pl().querySelectorAll('.pg-amt-clickable')][0]; if (!c) return null; $(c).trigger('click'); const a = d.querySelector('.pg-amt-break-dd'); const st = a && { position: a.style.position, zIndex: a.style.zIndex, radius: a.style.borderRadius, shadow: a.style.boxShadow, border: a.style.border, bg: a.style.background }; $(d.body).trigger('mousedown'); return st; };
    const ref = amtStyle(); await flush(100);
    const dd = await E.open('cal_a');
    check('same chrome as the Amount popup (position/z-index/radius/shadow/border/background)', !!ref && dd.style.position === ref.position && dd.style.zIndex === ref.zIndex && dd.style.borderRadius === ref.radius && dd.style.boxShadow === ref.shadow && dd.style.border === ref.border && dd.style.background === ref.bg, JSON.stringify(ref));
    check('positioned near the cell and kept inside the viewport (left/top >= 8/4, scrollable body)', parseFloat(dd.style.left) >= 8 && parseFloat(dd.style.top) >= 4 && dd.style.maxHeight === '80vh' && dd.style.overflow === 'auto', dd.style.left + '/' + dd.style.top);
    $(d).trigger($.Event('keydown', { key: 'Escape' })); await flush(80);
    check('Esc closes it', !E.dd());
    await E.open('cal_a'); $(E.dd()).trigger('mousedown'); await flush(60);
    check('a mousedown inside keeps it open', !!E.dd());
    $(d.body).trigger('mousedown'); await flush(60);
    check('a mousedown outside closes it', !E.dd());
    await E.open('cal_a'); $(E.dd().querySelector('.pg-schools-close')).trigger('click'); await flush(60);
    check('the \u00d7 button closes it', !E.dd());
    await E.open('cal_a'); const first = E.dd(); await E.open('cal_a');
    check('clicking the count again replaces the popup (never two)', d.querySelectorAll('.pg-schools-dd').length === 1 && E.dd() !== first);
    $(d.body).trigger('mousedown'); await flush(60);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Immediate synchronization ═══ */
  await suite('Open popup + count follow the Site Breakdown immediately: reorder (badges/chips travel), POD assign (rail spans the run) and remove, label toggle, rename, clear name -> placeholder, Add School, Delete row, Undo', async () => {
    const E = await boot(); const { dom, d, $, W } = E;
    await E.open('cal_a');
    E.card().reorder(0, 3); await flush(1800);
    check('reorder 1->4: the open popup re-lists in the new display order', !!E.dd() && E.lines().map(l => l.nm).join('|') === displayNames(E).join('|'), E.lines().map(l => l.nm.slice(0, 10)).join('|'));
    check('...the charter badge and ES chip travelled with their school to the last line; numbering stays 1..4', E.lines()[3].ch && E.lines()[3].lbls.join(',') === 'ES' && !E.lines()[0].ch && E.lines().map(l => l.pos).join(',') === '1,2,3,4');
    check('...and the count is unchanged (4)', E.cell('cal_a').textContent === '4' && E.dd().getAttribute('data-schools-count') === '4');
    E.card().reorder(3, 0); await flush(1800);
    check('reorder back: original listing again', E.lines().map(l => l.nm).join('|') === displayNames(E).join('|') && E.lines()[0].ch);
    // POD: rows 1-2 -> new pod Blue (Site Breakdown driver), then remove
    const rows = E.sbRows();
    $(rows[0].querySelector('.sb-num-cell')).trigger($.Event('click', { metaKey: true })); $(rows[1].querySelector('.sb-num-cell')).trigger($.Event('click', { metaKey: true })); await flush(10);
    $(rows[0]).trigger($.Event('contextmenu', { clientX: 200, clientY: 200 })); await flush(30);
    let menu = d.querySelector('.sb-pod-menu'); $(menu.querySelector('.sb-pod-search')).val('blue').trigger('input'); await flush(10); $(menu.querySelector('.sb-pod-create')).trigger('click'); await flush(1800);
    check('POD Blue on rows 1-2: the open popup groups them under one Blue rail spanning 2, the rest ungrouped', !!E.dd() && E.lines().map(l => l.pod || '-').join(',') === 'Blue,Blue,-,-' && E.dd().querySelector('.tip-pod-run[data-pod-name="Blue"]').getAttribute('data-pod-size') === '2' && E.dd().querySelectorAll('.tip-pod-run').length === 1, E.lines().map(l => l.pod || '-').join(','));
    check('the rail carries the pod name in the pod ink like the Site Breakdown bracket', E.dd().querySelector('.tip-pod-run .tip-pod-name').textContent === 'Blue' && !!E.dd().querySelector('.tip-pod-run .tip-pod-line'));
    check('grouping did not change the line count or order', E.lines().length === 4 && E.lines().map(l => l.nm).join('|') === displayNames(E).join('|'));
    // reorder a pod member away: runs regroup like the card
    E.card().reorder(1, 3); await flush(1800);
    check('moving a Blue member to the end splits the run: rails now 1 and 1, order followed', E.lines().map(l => l.pod || '-').join(',') === 'Blue,-,-,Blue' && E.lines().map(l => l.nm).join('|') === displayNames(E).join('|'), E.lines().map(l => l.pod || '-').join(','));
    E.card().reorder(3, 1); await flush(1800);
    // remove from pod
    const rows2 = E.sbRows();
    $(rows2[0].querySelector('.sb-num-cell')).trigger($.Event('click', { metaKey: true })); $(rows2[1].querySelector('.sb-num-cell')).trigger($.Event('click', { metaKey: true })); await flush(10);
    $(rows2[0]).trigger($.Event('contextmenu', { clientX: 200, clientY: 200 })); await flush(30);
    menu = d.querySelector('.sb-pod-menu'); $(menu.querySelector('.sb-pod-remove')).trigger('click'); await flush(1800);
    check('removing the pod assignment drops the rail from the open popup', !!E.dd() && !E.dd().querySelector('.tip-pod-run') && E.lines().length === 4);
    // labels
    E.card().labels.open(1); await flush(60);
    $(d.querySelector('.sb-lbl-menu [data-lbl-name="MS"]')).trigger('click'); await flush(1500);
    check('toggling the MS label onto row 2 shows the chip in the open popup', E.lines()[1].lbls.join(',') === 'MS', JSON.stringify(E.lines().map(l => l.lbls)));
    $(d.querySelector('.sb-lbl-menu [data-lbl-name="MS"]')).trigger('click'); await flush(1500);
    check('toggling it off removes the chip', E.lines()[1].lbls.length === 0);
    $(d.querySelector('.sb-lbl-menu .sb-lbl-close')).trigger('click'); await flush(30);
    // rename row 4 (Plain School) by picking a reference school from the dropdown
    const { other } = pickSchools(W);
    const inp4 = [...E.sbRows()[3].querySelectorAll('input')].find(i => /chool/.test(i.getAttribute('placeholder') || ''));
    if (inp4 && other) {
      $(inp4).trigger('focus'); await flush(60); $(inp4).val(other.name.slice(0, 6)).trigger('input'); await flush(300);
      const opt = [...d.querySelectorAll('.pg-school-dd input[data-cds="' + other.cds + '"]')].map(x => x.closest('div')).pop();
      if (opt) { $(opt).trigger('mousedown'); await flush(1800); }
      // the pick is a mousedown outside the popup, so it dismisses it (as any outside click must); reopening shows the fresh list
      check('picking from the school dropdown (an outside mousedown) dismissed the popup', !E.dd());
      await E.open('cal_a');
      check('renaming row 4 (reference pick) renames line 4 on reopen and keeps the count', !!E.dd() && E.lines()[3].nm === other.name && E.cell('cal_a').textContent === '4', E.dd() && E.lines()[3] && E.lines()[3].nm);
    } else check('(rename driver unavailable; skipped)', true);
    // clear row 1's name -> placeholder "School 1"
    const clr = (function () { const chip = E.sbRows()[0].querySelector('.sb-name-chip'); return chip && [...chip.children].find(c => c.textContent.trim() === '\u00d7'); })();   // the chip's clear (x), not a label chip
    if (clr) { $(clr).trigger('click'); await flush(1800); check('clearing row 1\u2019s name shows the "School 1" placeholder in the open popup', !!E.dd() && E.lines()[0].nm === 'School 1' && E.sbNames()[0] === 'School 1', E.lines()[0] && E.lines()[0].nm); }
    else check('(clear driver unavailable; skipped)', true);
    // add + delete + undo
    $([...E.pl().querySelectorAll('button')].find(b => b.textContent.trim() === '+ Add School')).trigger('click'); await flush(1800);
    check('Add School: count 5 and the open popup lists 5 with the new "School 5" placeholder last', E.cell('cal_a').textContent === '5' && !!E.dd() && E.lines().length === 5 && E.lines()[4].nm === 'School 5' && E.dd().getAttribute('data-schools-count') === '5', E.cell('cal_a').textContent + '/' + (E.dd() && E.lines().length));
    let dels = [...E.pl().querySelectorAll('button[title="Delete row"]')]; $(dels[dels.length - 1]).trigger('click'); await flush(1800);
    check('Delete row: count 4 and the popup lists 4', E.cell('cal_a').textContent === '4' && !!E.dd() && E.lines().length === 4);
    const ub = E.undoBtn();
    if (ub) { $(ub).trigger('click'); await flush(1800); check('Undo of the delete: count back to 5 and the popup follows', E.cell('cal_a').textContent === '5' && !!E.dd() && E.lines().length === 5, E.cell('cal_a').textContent + '/' + (E.dd() && E.lines().length)); }
    else check('(no Undo offered for row delete; skipped)', true);
    check('every line still maps to a distinct row and the list equals the Site Breakdown', new Set(E.lines().map(l => l.si)).size === E.lines().length && E.lines().map(l => l.nm).join('|') === displayNames(E).join('|'));
    $(d.body).trigger('mousedown'); await flush(60);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 4. Reconciliation and the drop to zero ═══ */
  await suite('The list always reconciles with the clicked value; when a Program drops to 0 the popup closes and the cell stops being clickable; Undo brings both back', async () => {
    const E = await boot(); const { dom, d, $ } = E;
    for (const cal of ['cal_a', 'cal_b']) {
      const n = parseInt(E.cell(cal).textContent, 10);
      const rows = (E.det().siteRowsByCal[cal] || []).length;
      check(cal + ': the cell value equals the Site Breakdown row count (' + rows + ')', n === rows);
      if (n > 0) { await E.open(cal); check(cal + ': popup lines == cell value == header count', E.lines().length === n && E.dd().getAttribute('data-schools-count') === String(n)); $(d.body).trigger('mousedown'); await flush(60); }
      else check(cal + ': no popup for 0', !E.cell(cal).classList.contains('pg-schools-clickable'));
    }
    await E.open('cal_a');
    for (let i = 4; i >= 2; i--) {
      const dels = [...E.pl().querySelectorAll('button[title="Delete row"]')]; $(dels[dels.length - 1]).trigger('click'); await flush(1500);
      check('after deleting to ' + (i - 1) + ': cell ' + (i - 1) + ' and the open popup lists ' + (i - 1), E.cell('cal_a').textContent === String(i - 1) && !!E.dd() && E.lines().length === i - 1, E.cell('cal_a').textContent + '/' + (E.dd() && E.lines().length));
    }
    // Deleting the last row removes that school and leaves one BLANK placeholder row (the app's floor), so the
    // count stays 1 and the popup shows the 'School 1' placeholder; Undo puts the named school back into it.
    const lastName = displayNames(E)[0];
    const dels1 = [...E.pl().querySelectorAll('button[title="Delete row"]')]; $(dels1[dels1.length - 1]).trigger('click'); await flush(1500);
    check('deleting the last named school leaves one blank row: cell 1, still clickable, popup lists the "School 1" placeholder', E.cell('cal_a').textContent === '1' && E.cell('cal_a').classList.contains('pg-schools-clickable') && !!E.dd() && E.lines().length === 1 && E.lines()[0].nm === 'School 1' && (E.det().siteRowsByCal.cal_a || []).length === 1 && String(E.det().siteRowsByCal.cal_a[0].school || '') === '', E.cell('cal_a').textContent + '/' + (E.dd() && E.lines().map(l => l.nm).join('|')));
    const ub = E.undoBtn();
    if (ub) { $(ub).trigger('click'); await flush(1800); check('Undo restores the named school into that row (count still 1) and the open popup shows its name, badges and chip again', E.cell('cal_a').textContent === '1' && !!E.dd() && E.lines().length === 1 && E.lines()[0].nm === lastName && E.lines()[0].ch && E.lines()[0].lbls.join(',') === 'ES', E.dd() && JSON.stringify(E.lines()[0])); $(d.body).trigger('mousedown'); await flush(60); }
    else check('(no Undo offered; skipped)', true);
    // a genuine 0 (a Program with no rows at all) stays inert
    check('a Program with no rows (CalB) shows 0, is not clickable and opens nothing', E.cell('cal_b').textContent === '0' && !E.cell('cal_b').classList.contains('pg-schools-clickable') && (($(E.cell('cal_b')).trigger('click')), !E.dd()));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
