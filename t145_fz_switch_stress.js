// t145_fz_switch_stress.js — (1) rapid Freeze-snapshot switching / disabling must reconcile EVERY dependent
// surface after every action (cell hours+count, breakdown total, Programs, Summary, Weeks, Amounts);
// (2) snapshot-note stress: notes stay bound to their snapshot through switching, disabling, new snapshots,
// rapid editor open/close, repeated edits, and an export/import round-trip; note ops never touch calculations.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(opts) {
  opts = opts || {};
  const rows = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }, { school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 3, ctkk: 10 }];
  const data = { status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-07-17', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }], siteRowsByCal: { cal_a: rows.slice() }, siteRows: rows.slice(), staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } } };
  if (opts.alloc) data.staffAlloc = { c0: { on: true, cells: {} } };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data });
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
  await whenReady(dom); await flush(400); W.__pgHoverDefaultOn = true; W._pgCurrentUser = 'QA';
  const pl = () => d.getElementById('planning-panel');
  const D = '2026-07-08';
  const cell = () => pl().querySelector('.cal-day-cell[data-date-key="' + D + '"]:not(.cal-combined-carrier)');
  const hrs = () => parseFloat(cell().querySelector('.cal-hours').textContent) || 0;
  const cnt = () => parseInt(cell().getAttribute('data-eff-cnt'), 10) || 0;
  const det = () => W._pgGuideDetails()['pg-001'];
  const mk = () => det().calMarkers['cal_a|' + D];
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(700); };
  const pin = async () => { $(cell()).trigger('click'); await flush(600); };
  const closePop = async () => { $(d.body).trigger('click'); await flush(250); };
  const grand = () => { const t = [...popup().querySelectorAll('tr,div')].filter(e => /^Total/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total(\s*\(\d+ schools?\))?/, '').trim()) : NaN; };
  const progSched = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent))); if (!t) return NaN; const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); return parseFloat(t.tBodies[0].rows[0].cells[i].textContent); };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  const summaryAmt = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-amount'); return b ? parseFloat(b.textContent.replace(/[^0-9.]/g, '')) : NaN; };
  const freezeAll = async () => { $(cell()).trigger('contextmenu'); await flush(250); const m = d.querySelector('.cal-ctx-menu'); $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $(leaves(m).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(600); };
  const freezeOnly = async idxs => { $(cell()).trigger('contextmenu'); await flush(250); const m = d.querySelector('.cal-ctx-menu'); idxs.forEach(i => $([...m.querySelectorAll('.sch-freeze')][i]).trigger('click')); await flush(60); $(leaves(m).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(600); };
  const rows = () => [...popup().querySelectorAll('.cal-tip-freeze-line')];
  const hosts = () => [...popup().querySelectorAll('.cal-tip-fz-note-host')];
  const activate = async idx => { const chk = rows()[idx].querySelector('.cal-tip-fz-chk'); chk.checked = true; $(chk).trigger('change'); await flush(900); };
  const deactivate = async () => { const chk = rows().find(r => r.querySelector('.cal-tip-fz-chk').checked); if (chk) { const c2 = chk.querySelector('.cal-tip-fz-chk'); c2.checked = false; $(c2).trigger('change'); await flush(900); } };
  const activeId = () => { const e = (mk().frozenHist || []).find(x => x.active); return e ? e.id : null; };
  const marks = () => [...popup().querySelectorAll('.cal-tip-school-mark')].map(m => m.textContent);

  // Central reconciler: with the popup pinned, cell = breakdown total; Programs = Summary hours; Amount =
  // Summary hours x $80 (Net PPH here); exactly one (or zero) active snapshot; marks match active membership.
  function reconcile(label, expectH) {
    if (expectH != null) check(label + ': cell = ' + expectH, hrs() === expectH, hrs());
    check(label + ': breakdown total = cell (' + hrs() + ')', grand() === hrs(), grand() + ' vs ' + hrs());
    check(label + ': Programs = Summary hours', progSched() === summaryHours(), progSched() + ' vs ' + summaryHours());
    check(label + ': Summary amount = hours x $80', Math.abs(summaryAmt() - summaryHours() * 80) < 0.5, summaryAmt() + ' vs ' + summaryHours() * 80);
    const act = (mk().frozenHist || []).filter(e => e.active).length;
    check(label + ': at most one active snapshot', act <= 1, act);
    const a = (mk().frozenHist || []).find(e => e.active);
    const expectMarks = ['Lincoln', 'Adams', 'Roosevelt'].map((n, i) => (a && a.snap[String(i)]) ? '\u2744' : '\u2022');
    check(label + ': school marks match the active membership', JSON.stringify(marks()) === JSON.stringify(expectMarks), JSON.stringify(marks()) + ' vs ' + JSON.stringify(expectMarks));
  }

  /* ═══ 1. Rapid switching among three snapshots + disable/enable: every surface reconciles at each step ═══ */
  await suite('Rapid switching A->B->C->A->C->off->B and repeated enable/disable reconcile every surface with no stale or mixed values', async () => {
    await importGuide(dom, c, fixture({ alloc: true })); await flush(700);
    await freezeAll();                                              // A: all @6h -> 36
    det().staffingHoursSlots.c0.ctkk = mkTimes('09:00', '19:00'); await recalc();   // 10h upstream
    await freezeOnly([0, 1]);                                       // B: 0,1 from A(6h) -> 18 ; Roosevelt live 10h*3=30 -> 48
    det().staffingHoursSlots.c0.ctkk = mkTimes('09:00', '13:00'); await recalc();   // 4h upstream
    await freezeOnly([2]);                                          // C: Roosevelt live? (not in active B) -> captures live 4h*3=12; 0,1 live 4h*(2+1)=12 -> 24
    await pin();
    check('three snapshots in history (newest first: C, B, A)', rows().length === 3);
    const H = { C: 24, B: null, A: null };   // B/A values under CURRENT 4h inheritance for their live schools
    // B active: 0,1 frozen@6h=18, Roosevelt live 4h*3=12 -> 30 ; A active: all frozen@6h=36
    reconcile('start (C active)', 24);
    const seq = [[2, 'A', 36], [1, 'B', 30], [0, 'C', 24], [2, 'A', 36], [0, 'C', 24], [1, 'B', 30]];
    for (const [idx, name, exp] of seq) { await activate(idx); reconcile('switch -> ' + name, exp); check('switch -> ' + name + ': the right snapshot is active', activeId() === (mk().frozenHist || [])[idx].id); }
    // disable all -> full inheritance 4h*6 = 24 with no active
    await deactivate(); reconcile('disable all', 24); check('disable all: no active snapshot', !activeId());
    await activate(1); reconcile('re-enable B', 30);
    // repeated enable/disable churn
    for (let i = 0; i < 4; i++) { await deactivate(); await activate(2); }
    reconcile('after 4x disable/enable churn (A active)', 36);
    check('history intact after churn (3 snapshots)', (mk().frozenHist || []).length === 3);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Switching updates the Staffing Allocation Weeks row and staff counts ═══ */
  await suite('Switching snapshots updates the Weeks Total row and per-day staff counts immediately', async () => {
    await importGuide(dom, c, fixture({ alloc: true })); await flush(700);
    await freezeAll();                                              // A: 6 staff
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 9; det().siteRows[0].coaches_ctkk = 9; await recalc();
    await freezeOnly([1, 2]);                                       // B: 1,2 from A; Lincoln live 9 -> 13 staff
    // turn Staff Count ON and expand the Weeks view so the Total row renders (mirrors t141/t118)
    const scCb = () => pl().querySelector('.sf-alloc-sc-cb');
    if (scCb()) { scCb().checked = true; $(scCb()).trigger('click'); await flush(500); if (!scCb().checked) { scCb().checked = true; $(scCb()).trigger('change'); await flush(500); } }
    const vert = pl().querySelector('td.sf-wkov-vert'); if (vert) { $(vert).trigger('click'); await flush(700); }
    const wkTot = () => [...pl().querySelectorAll('td.sf-alloc-total-wk')].map(td => parseInt(td.textContent, 10) || 0);
    check('the Weeks table renders its Total row', pl().querySelectorAll('td.sf-alloc-total-wk').length > 0, pl().querySelectorAll('td.sf-alloc-total-wk').length);
    await recalc();
    check('B active: cell count 13 (Lincoln live 9 + frozen 1 + 3)', cnt() === 13, cnt());
    const wkB = JSON.stringify(wkTot());
    await pin(); await activate(1); await closePop(); await recalc();   // switch to A
    check('A active: cell count 6', cnt() === 6, cnt());
    check('Weeks Total row changed with the switch (13 -> 6 in that week)', JSON.stringify(wkTot()) !== wkB, JSON.stringify(wkTot()) + ' vs ' + wkB);
    await pin(); await activate(0); await closePop(); await recalc();   // back to B
    check('back to B: count 13 and Weeks row restored', cnt() === 13 && JSON.stringify(wkTot()) === wkB, cnt() + ' ' + JSON.stringify(wkTot()));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Notes stress: multiple notes, edits, cancels, rapid open/close, switching, new snapshots, round-trip ═══ */
  await suite('Snapshot notes stay bound to their snapshot through switching/disabling/new snapshots/round-trip; note ops never touch calculations', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeAll(); await freezeOnly([0]); await freezeOnly([1, 2]);   // A, B, C (newest first: C,B,A)
    await pin();
    const ids = () => rows().map(r => r.querySelector('.cal-tip-fz-chk').getAttribute('data-snap-id'));
    const noteOf = id => (mk().frozenHist.find(e => e.id === id) || {}).note || '';
    const openEd = async idx => { $(rows()[idx]).trigger('mouseenter'); await flush(40); const pen = rows()[idx].querySelector('.cal-tip-fz-note-pencil'); if (pen) $(pen).trigger('click'); else $(hosts()[idx].querySelector('.cal-tip-note-disp')).trigger('click'); await flush(150); return hosts()[idx].querySelector('.cal-tip-note-edit'); };
    const typeSave = async (idx, txt) => { const ed = await openEd(idx); const inp = ed.querySelector('.cal-tip-note-input'); inp.innerHTML = txt; $(inp).trigger('input'); await flush(30); $(ed.querySelector('.cal-tip-note-save')).trigger('click'); await flush(200); };
    const hBefore = hrs(), idsBefore = ids().slice();
    // add notes to all three
    await typeSave(0, 'note C'); await typeSave(1, 'note B'); await typeSave(2, 'note A');
    check('three notes, each on its own snapshot', noteOf(idsBefore[0]) === 'note C' && noteOf(idsBefore[1]) === 'note B' && noteOf(idsBefore[2]) === 'note A', JSON.stringify(idsBefore.map(noteOf)));
    check('notes display under their rows', hosts()[0].textContent.trim() === 'note C' && hosts()[1].textContent.trim() === 'note B' && hosts()[2].textContent.trim() === 'note A');
    check('adding notes did not change calculations', hrs() === hBefore, hrs());
    // rapid open/close x10 on one row (cancel each) -> unchanged
    for (let i = 0; i < 10; i++) { const ed = await openEd(1); const inp = ed.querySelector('.cal-tip-note-input'); inp.innerHTML = 'junk ' + i; $(inp).trigger('input'); await flush(10); $(ed.querySelector('.cal-tip-note-cancel')).trigger('click'); await flush(60); }
    check('10 rapid open/edit/cancel cycles leave the note unchanged', noteOf(idsBefore[1]) === 'note B' && hosts()[1].textContent.trim() === 'note B');
    // repeated edit+save x5 on row 0
    for (let i = 1; i <= 5; i++) await typeSave(0, 'note C v' + i);
    check('5 repeated edit+save land the last value', noteOf(idsBefore[0]) === 'note C v5' && hosts()[0].textContent.trim() === 'note C v5');
    check('editing C never touched A or B', noteOf(idsBefore[1]) === 'note B' && noteOf(idsBefore[2]) === 'note A');
    // switching + disabling: notes stay put, selection unaffected by note ops
    await activate(2); check('switch to A: notes still on their rows', hosts()[0].textContent.trim() === 'note C v5' && hosts()[2].textContent.trim() === 'note A');
    await deactivate(); check('disable all: notes preserved (3)', ids().every(id => noteOf(id)));
    check('note ops did not change the selection (still none active)', !activeId());
    await activate(1);
    // a new snapshot after notes exist -> new row (no note) at top, old notes keep their snapshots
    await closePop(); await freezeOnly([2]); await pin();
    check('new snapshot D added at top with no note; C/B/A notes intact', rows().length === 4 && hosts()[0].textContent.trim() === '' && hosts()[1].textContent.trim() === 'note C v5' && hosts()[2].textContent.trim() === 'note B' && hosts()[3].textContent.trim() === 'note A');
    // export/import round-trip
    await closePop();
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    const parsed = JSON.parse(captured).data;
    check('export carries the notes on the history entries', (parsed.calMarkers['cal_a|' + D].frozenHist || []).filter(e => e.note).length === 3);
    await importGuide(dom, c, captured); await flush(800);
    await pin();
    check('after reload: 4 snapshots, notes on the right three', rows().length === 4 && hosts()[1].textContent.trim() === 'note C v5' && hosts()[2].textContent.trim() === 'note B' && hosts()[3].textContent.trim() === 'note A' && hosts()[0].textContent.trim() === '');
    check('after reload: breakdown total = cell (notes did not disturb calculations)', grand() === hrs(), grand() + '/' + hrs());
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. The breakdown window stays put through the whole note flow; the editor spans the available width ═══ */
  await suite('The pinned breakdown window keeps its position through pencil -> type -> Save -> click-to-edit -> Cancel; the note editor stretches to near the right edge keeping its indent', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    Object.defineProperty(W, 'innerHeight', { value: 900, configurable: true }); Object.defineProperty(W, 'innerWidth', { value: 1400, configurable: true });
    cell().getBoundingClientRect = () => ({ top: 120, bottom: 180, left: 400, right: 520, width: 120, height: 60 });
    await freezeAll();
    await pin();
    const posOf = () => { const p = popup(); return p ? p.style.top + '|' + p.style.left : null; };
    const p0 = posOf();
    check('the window opened at a real anchored position', !!p0 && p0 !== 'null' && p0 !== '|');
    const row = () => rows()[0], host = () => hosts()[0];
    $(row()).trigger('mouseenter'); await flush(40); $(row().querySelector('.cal-tip-fz-note-pencil')).trigger('click'); await flush(300);
    check('opening the note editor (pencil) does not move the window', posOf() === p0, posOf() + ' vs ' + p0);
    const ed = host().querySelector('.cal-tip-note-edit'); const inp = ed.querySelector('.cal-tip-note-input'); inp.innerHTML = 'hello'; $(inp).trigger('input'); await flush(40);
    check('typing does not move the window', posOf() === p0, posOf());
    $(ed.querySelector('.cal-tip-note-save')).trigger('click'); await flush(400);
    check('saving does not move the window', posOf() === p0, posOf());
    $(host().querySelector('.cal-tip-note-disp')).trigger('click'); await flush(300);
    check('click-to-edit does not move the window', posOf() === p0, posOf());
    const ed2 = host().querySelector('.cal-tip-note-edit'); ed2.querySelector('.cal-tip-note-input').innerHTML = 'x'; $(ed2.querySelector('.cal-tip-note-input')).trigger('input'); await flush(30);
    $(ed2.querySelector('.cal-tip-note-cancel')).trigger('click'); await flush(400);
    check('cancelling does not move the window', posOf() === p0, posOf());
    // width contract: indent kept, stretches to near the right edge, editor fills the host
    const h = host();
    check('the note area keeps its 22px left indent and reaches near the right edge (4px margin, stretched)', h.style.marginLeft === '22px' && h.style.marginRight === '4px' && h.style.alignSelf === 'stretch', h.style.marginLeft + '/' + h.style.marginRight + '/' + h.style.alignSelf);
    $(h.querySelector('.cal-tip-note-disp')).trigger('click'); await flush(200);
    const e3 = host().querySelector('.cal-tip-note-edit');
    check('the editor wrap, wysiwyg wrap and text body all fill the available width', e3.style.width === '100%' && e3.querySelector('.wysiwyg-wrap').style.width === '100%' && e3.querySelector('.cal-tip-note-input').style.width === '100%');
    check('the history list itself is full-width', popup().querySelector('.cal-tip-freeze-list').style.width === '100%');
    $(e3.querySelector('.cal-tip-note-cancel')).trigger('click'); await flush(200);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
