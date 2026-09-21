// t137_freeze_schedule.js — Freeze Schedule: an INDEPENDENT second label per (calendar date + school),
// modelled on the Special Day system. Covers: the ❄ Freeze Schedule row above the Special Days (with a
// divider) in the individual-calendar day menu, the combined-calendar menu, and the multi-select menu;
// bold/tinted when active + a "(n)" count of frozen schools; a per-school snowflake after each school's
// Special Day indicator (muted = off, vivid = on) whose toggles are PENDING until Apply; the day-level
// row freezing/clearing every school; Clear; commit to markers[calId|dateKey].frozen independent of
// .schools (Special Days); persistence on reopen; SD + Freeze coexisting; multi-day apply; and NO
// indicator inside the calendar cell (for now).
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(twoCals) {
  const cals = [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }];
  if (twoCals) cals.push({ name: 'CalB', calId: 'cal_b', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#64b5f6', pricePerHour: '90.00', billable: true });
  const rowsA = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }];
  const data = {
    status: 'Draft', calendarRows: cals,
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    specialDays: [{ id: 'sd1', name: 'Half Day', color: '#ffd54f' }],
    siteRowsByCal: { cal_a: rowsA.slice(), cal_b: [{ school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: rowsA.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') } }
  };
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
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const secId = () => d.querySelector('[id^="cal-section-"]');
  const fire = (el, type, opts) => { const ev = new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: W, button: 0 }, opts || {})); el.dispatchEvent(ev); };
  const cell = dk => secId().querySelector('.cal-day-cell[data-date-key="' + dk + '"]:not(.cal-combined-carrier)');
  const menu = () => d.querySelector('.cal-ctx-menu');
  const fzRow = (m) => m.querySelector('.cal-ctx-freeze');
  const fzCnt = (m) => (fzRow(m).querySelector('.cal-ctx-freeze-cnt').textContent || '').trim();
  const snows = (m) => [...m.querySelectorAll('.sch-freeze')];
  const frozenAttr = (m) => snows(m).map(s => s.getAttribute('data-frozen')).join(',');
  const leaves = (m) => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const applyBtn = (m) => leaves(m).find(e => e.textContent.trim() === 'Apply');
  const clearBtn = (m) => leaves(m).find(e => e.textContent.trim() === 'Clear');
  const closeMenu = async (m) => { const b = leaves(m).find(e => e.textContent.trim() === 'Close'); if (b) { $(b).trigger('click'); await flush(120); } };
  const markers = () => W._pgGuideDetails()['pg-001'].calMarkers || {};
  const openDay = async (dk) => { $(cell(dk)).trigger('contextmenu'); await flush(250); return menu(); };

  /* ═══ 1. Individual menu: ❄ Freeze Schedule row above the Special Days, with a divider ═══ */
  await suite('Individual calendar: the ❄ Freeze Schedule option sits above the Special Days with a divider', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    const m = await openDay('2026-07-08');
    check('the day menu opens', !!m && m.style.display !== 'none');
    check('a Freeze Schedule row is present', !!fzRow(m));
    check('it carries a snowflake icon before the label', fzRow(m).querySelector('.cal-ctx-freeze-icon') && fzRow(m).querySelector('.cal-ctx-freeze-icon').textContent === '\u2744');
    check('it reads "Freeze Schedule"', /Freeze Schedule/.test(fzRow(m).textContent));
    const kids = [...m.children];
    const fzIdx = kids.indexOf(fzRow(m));
    const sdIdx = kids.findIndex(k => /Half Day/.test(k.textContent) && k !== fzRow(m));
    check('the Freeze row precedes the Special Day options', fzIdx >= 0 && sdIdx > fzIdx, fzIdx + ' vs ' + sdIdx);
    const div = m.querySelector('.cal-ctx-freeze-div');
    check('a divider sits between Freeze Schedule and the Special Days', !!div && kids.indexOf(div) === fzIdx + 1 && kids.indexOf(div) < sdIdx);
    check('inactive style: normal weight and no count', fzRow(m).style.fontWeight === '400' && fzCnt(m) === '', fzRow(m).style.fontWeight + '/' + fzCnt(m));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Per-school snowflakes after the Special Day indicator; pending until Apply ═══ */
  await suite('Each school gets a snowflake after its Special Day indicator; toggles are pending until Apply', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    const m = await openDay('2026-07-08');
    check('one snowflake per school (2)', snows(m).length === 2, snows(m).length);
    check('both start muted/inactive', frozenAttr(m) === '0,0', frozenAttr(m));
    const row0 = snows(m)[0].parentElement; const rk = [...row0.children];
    check('the snowflake is placed after the Special Day circle + name (last in the row)', rk[rk.length - 1] === snows(m)[0] && rk.length === 4, rk.length);
    check('Apply is hidden before any change', applyBtn(m) && applyBtn(m).style.display === 'none');
    $(snows(m)[0]).trigger('click'); await flush(80);
    check('clicking a school snowflake turns it vivid/active', frozenAttr(m) === '1,0', frozenAttr(m));
    check('the Freeze Schedule count updates to (1)', fzCnt(m) === '(1)', fzCnt(m));
    check('the Freeze Schedule row reads bold/tinted when any school is frozen', fzRow(m).style.fontWeight === '600');
    check('Apply appears (the change is pending)', applyBtn(m).style.display !== 'none');
    check('nothing is committed yet (markers untouched before Apply)', !markers()['cal_a|2026-07-08'] || !markers()['cal_a|2026-07-08'].frozen);
    // Close (discard) -> nothing committed
    const closeB = leaves(m).find(e => e.textContent.trim() === 'Close'); $(closeB).trigger('click'); await flush(150);
    check('Close discards the pending freeze', !markers()['cal_a|2026-07-08'] || !markers()['cal_a|2026-07-08'].frozen);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Global Freeze Schedule freezes every school; Apply commits independently of Special Days ═══ */
  await suite('The day-level Freeze Schedule freezes every school; Apply commits it independently of the Special Days', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    let m = await openDay('2026-07-08');
    $(fzRow(m)).trigger('click'); await flush(80);
    check('global Freeze turns on every school snowflake', frozenAttr(m) === '1,1', frozenAttr(m));
    check('the count shows all schools (2)', fzCnt(m) === '(2)', fzCnt(m));
    $(applyBtn(m)).trigger('click'); await flush(400);
    const mk = markers()['cal_a|2026-07-08'];
    check('Apply commits frozen for both schools', !!mk && !!mk.frozen && mk.frozen['0'] === true && mk.frozen['1'] === true, JSON.stringify(mk));
    check('the Special Day selection is untouched (empty)', !!mk && (!mk.schools || Object.keys(mk.schools).length === 0), JSON.stringify(mk && mk.schools));
    // (create-new-snapshot model, spec §1/§8) Apply created a snapshot in history; reopening the menu
    // opens CLEAN (no preselect) - it is used to build the NEXT snapshot, not to mirror the active one.
    check('a snapshot was created in history, active, covering both schools', !!mk.frozenHist && mk.frozenHist.length === 1 && mk.frozenHist[0].active && Object.keys(mk.frozenHist[0].snap).sort().join() === '0,1', JSON.stringify((mk.frozenHist || []).length));
    m = await openDay('2026-07-08');
    check('reopening the menu opens CLEAN (no schools preselected, no bold count)', frozenAttr(m) === '0,0' && fzCnt(m) === '', frozenAttr(m) + '/' + fzCnt(m));
    await closeMenu(m);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Special Day + Freeze coexist; Clear removes both; count tracks per-school toggles ═══ */
  await suite('Freeze Schedule is independent of Special Days: both can apply; Clear removes both; the count follows the snowflakes', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    let m = await openDay('2026-07-08');
    // pick the Special Day for all + freeze only school 2
    const sdOpt = leaves(m).find(e => e.textContent.trim() === 'Half Day' && !e.closest('.cal-ctx-freeze'));
    $(sdOpt).trigger('click'); await flush(60);
    $(snows(m)[1]).trigger('click'); await flush(60);
    check('count reflects the single frozen school (1)', fzCnt(m) === '(1)', fzCnt(m));
    $(applyBtn(m)).trigger('click'); await flush(400);
    const mk = markers()['cal_a|2026-07-08'];
    check('Special Day applied to both schools AND Freeze applied to one — both labels coexist', !!mk && mk.schools && mk.schools['0'] === 'sd1' && mk.schools['1'] === 'sd1' && mk.frozen && mk.frozen['1'] === true && !mk.frozen['0'], JSON.stringify(mk));
    // (create-new-snapshot) a fresh freeze creates a NEW snapshot; the menu opens clean, so select the
    // school(s) to freeze. The Special Day selection on the marker is independent and must stay untouched.
    m = await openDay('2026-07-08');
    $(snows(m)[0]).trigger('click'); await flush(60);   // build a snapshot freezing school 0
    $(applyBtn(m)).trigger('click'); await flush(400);
    const mk2 = markers()['cal_a|2026-07-08'];
    check('creating a freeze snapshot leaves the Special Day selection unchanged', mk2.schools['0'] === 'sd1' && mk2.schools['1'] === 'sd1' && mk2.frozenHist && mk2.frozenHist.some(function (e) { return e.active && e.snap['0']; }), JSON.stringify({ schools: mk2.schools, hist: (mk2.frozenHist || []).length }));
    // Clear removes both the Special Days and the Freeze labels
    m = await openDay('2026-07-08');
    check('Clear is offered while labels are applied', !!clearBtn(m) && clearBtn(m).style.display !== 'none');
    $(clearBtn(m)).trigger('click'); await flush(80);
    check('Clear turns every snowflake off in the draft (already clean on open)', frozenAttr(m) === '0,0' && fzCnt(m) === '');
    $(applyBtn(m)).trigger('click'); await flush(400);
    // (create-new-snapshot model, spec §1/§7) Clear empties the Special Day selection; Freeze Schedule is
    // no longer managed from the menu (its snapshots live in history, toggled from the breakdown), so the
    // active snapshot is untouched by a menu Clear. Assert the Special Days are gone, snapshot preserved.
    const _mk137 = markers()['cal_a|2026-07-08'];
    check('after Clear+Apply the Special Day labels are gone', !_mk137 || !_mk137.schools || Object.keys(_mk137.schools).length === 0, JSON.stringify(_mk137 && _mk137.schools));
    check('the Freeze snapshot history is preserved (not cleared by a menu Clear)', !!_mk137 && !!_mk137.frozenHist && _mk137.frozenHist.length >= 1, JSON.stringify(_mk137 && (_mk137.frozenHist || []).length));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Cell indicator (superseded the original 'no indicator' rule): a compact snowflake next to the date ═══ */
  await suite('Freeze Schedule shows a compact snowflake indicator in the day cell (detailed in t138)', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    let m = await openDay('2026-07-08');
    $(fzRow(m)).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(500);
    const dayCell = cell('2026-07-08');
    const indEl = dayCell && dayCell.querySelector('.cal-freeze-ind');
    check('the day cell carries a compact freeze indicator once frozen', !!indEl && /\u2744/.test(indEl.textContent), indEl && indEl.textContent);
    check('the menu opens CLEAN even though the day is frozen (create-new-snapshot workflow)', (function () { $(cell('2026-07-08')).trigger('contextmenu'); const mm = menu(); return mm && frozenAttr(mm).split(',').every(function (x) { return x === '0'; }); })());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Multi-select: Freeze Schedule applies to every selected date ═══ */
  await suite('Multiple selected days: the Freeze Schedule option applies to the schools of every selected date', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    fire(cell('2026-07-07'), 'mousedown', { shiftKey: true }); await flush(40);
    fire(cell('2026-07-09'), 'mousedown', { shiftKey: true }); await flush(80);   // Tue..Thu = 3 dates
    fire(cell('2026-07-08'), 'contextmenu', {}); await flush(250);
    const mm = () => [...d.body.children].filter(el => el.classList && el.classList.contains('cal-sd-multi-menu') && el.style.display !== 'none').pop();
    check('the multi-select menu opens', !!mm());
    check('it offers a ❄ Freeze Schedule row', !!fzRow(mm()) && fzRow(mm()).querySelector('.cal-ctx-freeze-icon').textContent === '\u2744');
    const kids = [...mm().children];
    // (Fulfillment-menu spec) the Fulfillment section now sits FIRST, above Freeze Schedule, with its own
    // divider; the Freeze row follows it and still sits above the Special Days header with a divider.
    const fzIdx = kids.indexOf(fzRow(mm()));
    // (spec) this fixture has NO Fulfillment data, so the Fulfillment section is correctly ABSENT: the Freeze
    // row is the first item and still sits above the Special Days header with its divider.
    check('order: no Fulfillment data -> no Fulfillment section; Freeze row first (with divider) -> Special Days', !mm().querySelector('.cal-ctx-ff') && fzIdx === 0 && kids[fzIdx + 1] && kids[fzIdx + 1].classList.contains('cal-ctx-freeze-div'), kids.map(k => k.className.split(' ')[0]).join(','));
    const mbtn = l => [...mm().querySelectorAll('button')].find(b => b.textContent.trim() === l);
    check('Apply is hidden before staging', mbtn('Apply').style.display === 'none');
    $(fzRow(mm())).trigger('click'); await flush(80);
    check('clicking stages a freeze for all selected pairs (shown as "all 6" = 3 dates x 2 schools)', fzCnt(mm()) === 'all 6' && fzRow(mm()).style.fontWeight === '700', fzCnt(mm()));
    check('Apply appears', mbtn('Apply').style.display !== 'none');
    $(mbtn('Apply')).trigger('click'); await flush(700);
    const per = ['2026-07-07', '2026-07-08', '2026-07-09'].map(dk => { const k = markers()['cal_a|' + dk]; return k && k.frozen ? Object.keys(k.frozen).length : 0; });
    check('every selected date has both schools frozen', JSON.stringify(per) === '[2,2,2]', JSON.stringify(per));
    check('the Special Day selection on those dates is untouched', ['2026-07-07', '2026-07-08', '2026-07-09'].every(dk => { const k = markers()['cal_a|' + dk]; return !k || !k.schools || !Object.keys(k.schools).length; }));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Combined calendar: Freeze row above the SD labels; per-calendar snowflakes; global reaches all calendars ═══ */
  await suite('Combined calendar: Freeze Schedule above the Special Days, per-school snowflakes across calendars, global applies to all', async () => {
    await importGuide(dom, c, fixture(true)); await flush(800);
    const cvChk = [...secId().querySelectorAll('input[type=checkbox]')].find(cb => { const l = cb.closest('label'); return l && /Combined View/.test(l.textContent); });
    check('the Combined View toggle is available with 2 calendars', !!cvChk);
    cvChk.checked = true; $(cvChk).trigger('change'); await flush(800);
    const combCell = dk => secId().querySelector('.cal-combined-day[data-date-key="' + dk + '"]');
    check('a combined cell renders with two carriers', !!combCell('2026-07-13') && combCell('2026-07-13').querySelectorAll('.cal-combined-carrier').length === 2);
    fire(combCell('2026-07-13'), 'contextmenu', {}); await flush(300);
    const m = menu();
    check('the combined day menu opens with a ❄ Freeze Schedule row', !!m && !!fzRow(m) && fzRow(m).querySelector('.cal-ctx-freeze-icon').textContent === '\u2744');
    const bar = fzRow(m).parentElement; const bk = [...bar.children];
    const sdIdx = bk.findIndex(k => /Half Day/.test(k.textContent) && k !== fzRow(m));
    check('the Freeze row precedes the Special Day labels in the top bar, with a divider', bk.indexOf(fzRow(m)) < sdIdx && !!m.querySelector('.cal-ctx-freeze-div'));
    check('per-school snowflakes span all calendars (2 for cal_a + 1 for cal_b = 3)', snows(m).length === 3, snows(m).length);
    $(fzRow(m)).trigger('click'); await flush(80);
    check('the global Freeze turns on every school on every calendar', frozenAttr(m) === '1,1,1' && fzCnt(m) === '(3)', frozenAttr(m) + '/' + fzCnt(m));
    $(applyBtn(m)).trigger('click'); await flush(700);
    const a = markers()['cal_a|2026-07-13'], b = markers()['cal_b|2026-07-13'];
    check('Apply commits frozen on cal_a (2 schools) AND cal_b (1 school)', !!a && !!a.frozen && a.frozen['0'] && a.frozen['1'] && !!b && !!b.frozen && b.frozen['0'], JSON.stringify([a && a.frozen, b && b.frozen]));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Persistence: the frozen labels survive an export/import round-trip ═══ */
  await suite('Freeze labels are stored with the guide and survive export/import', async () => {
    await importGuide(dom, c, fixture(false)); await flush(600);
    let m = await openDay('2026-07-08');
    $(fzRow(m)).trigger('click'); await flush(60); $(applyBtn(m)).trigger('click'); await flush(400);
    // capture the JSON export, then re-import it
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    const payload = captured ? JSON.parse(captured) : null;
    const exp = payload && payload.data && payload.data.calMarkers && payload.data.calMarkers['cal_a|2026-07-08'];
    check('the export carries the frozen labels', !!exp && !!exp.frozen && exp.frozen['0'] && exp.frozen['1'], JSON.stringify(exp));
    await importGuide(dom, c, captured); await flush(600);
    // (create-new-snapshot) the menu opens clean after import too; the preserved+active snapshot is what
    // matters - verify the marker's history survived the round-trip with an active 2-school snapshot.
    const _mkImp = markers()['cal_a|2026-07-08'];
    check('after re-import the Freeze snapshot history survived and is still active (2 schools)', !!_mkImp && !!_mkImp.frozenHist && _mkImp.frozenHist.some(function (e) { return e.active && Object.keys(e.snap).length === 2; }), JSON.stringify(_mkImp && { hist: (_mkImp.frozenHist || []).length, frozen: _mkImp.frozen }));
    m = await openDay('2026-07-08');
    check('the re-imported menu opens CLEAN (create-new-snapshot)', frozenAttr(m).split(',').every(function (x) { return x === '0'; }), frozenAttr(m));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. Special Day label position: Date, Hours, then the Special Day label (this layout spec) ═══ */
  await suite('The Special Day label(s) render BELOW the Hours in the calendar day cell (order: Date, Hours, label)', async () => {
    // fixture with a Special Day pre-applied to one school on 2026-07-08 (renders a label on load)
    const withSd = (() => {
      const base = JSON.parse(fixture(false));
      base.data.calMarkers = { 'cal_a|2026-07-08': { schools: { '0': 'sd1' } } };
      return JSON.stringify(base);
    })();
    await importGuide(dom, c, withSd); await flush(800);
    const dayCell = dk => secId().querySelector('.cal-day-cell[data-date-key="' + dk + '"]:not(.cal-combined-carrier)');
    const idxOf = (cell, cls) => [...cell.children].findIndex(x => x.classList.contains(cls));
    // INITIAL render
    let cellA = dayCell('2026-07-08');
    const dI = idxOf(cellA, 'cal-date-label'), hI = idxOf(cellA, 'cal-hours'), lI = idxOf(cellA, 'cal-label');
    check('the cell has a date, hours, and a Special Day label', dI >= 0 && hI >= 0 && lI >= 0, 'date=' + dI + ' hours=' + hI + ' label=' + lI);
    check('the date comes before the hours', dI < hI);
    check('the Special Day label comes AFTER the hours (below it)', lI > hI, 'label=' + lI + ' hours=' + hI);
    check('the Special Day label also comes after the date', lI > dI);
    check('the existing label styling + affected-school count are preserved (e.g. "Half Day (1)")', /Half Day \(1\)/.test(cellA.querySelector('.cal-label').textContent), cellA.querySelector('.cal-label').textContent.trim());
    // APPLY path (refreshCell): apply a Special Day to a fresh day and re-check the order
    const m = await openDay('2026-07-09');
    const sdOpt = leaves(m).find(e => e.textContent.trim() === 'Half Day' && !e.closest('.cal-ctx-freeze'));
    $(sdOpt).trigger('click'); await flush(60);
    $(applyBtn(m)).trigger('click'); await flush(500);
    let cellB = dayCell('2026-07-09');
    const hI2 = idxOf(cellB, 'cal-hours'), lI2 = idxOf(cellB, 'cal-label');
    check('after applying a Special Day the label is still BELOW the hours', lI2 >= 0 && hI2 >= 0 && lI2 > hI2, 'label=' + lI2 + ' hours=' + hI2);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
