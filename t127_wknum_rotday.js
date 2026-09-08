// t127_wknum_rotday.js — NINETEENTH SPEC. Two features:
//  (1) the DISPLAYED calendar Week number counts only INCLUDED weeks — an excluded week (from the
//      Program Calendar Week/Dates menu OR the Staffing Allocation Weeks subheader, ONE shared store)
//      consumes no number, every following included week renumbers sequentially and immediately, and
//      Include restores the sequence;
//  (2) a Rotation-Week day can be removed/restored by RIGHT-CLICKING the day header in BOTH the
//      per-school Staffing Hours POPUP and the per-school (separated-section) TABLE while viewing that
//      Rotation Week, scoped to exactly calendar+school+rotation-week+day, behaving identically to the
//      Staffing Allocation Days checkbox, synchronised bidirectionally, recalculating + rerendering at once.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
// Mondays of a calendar starting 2026-07-20 (a Monday). idx 0..N.
function mon(i) { const d = new Date('2026-07-20T00:00:00'); d.setDate(d.getDate() + i * 7); const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), da = String(d.getDate()).padStart(2,'0'); return y + '-' + m + '-' + da; }
function fixture(extra) {
  const weeks = (extra && extra.weeks) || 6;
  const last = new Date('2026-07-20T00:00:00'); last.setDate(last.getDate() + weeks * 7 - 1);
  const lastIso = last.getFullYear() + '-' + String(last.getMonth()+1).padStart(2,'0') + '-' + String(last.getDate()).padStart(2,'0');
  const A = (extra && extra.siteRows) || [{ school: 'S1', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }];
  const data = Object.assign({
    status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: lastIso, color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A },
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  }, extra && extra.data || {});
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

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const EX = () => W._pgWeekVis;
  const RD = () => W._pgAllocRotDayDisabled;
  const detOff = () => W._pgGuideDetails()['pg-001'].allocRotDayOff || null;

  // Week-label reader: the first cell of every calendar week row (Block B) holds the display number.
  const weekLabels = () => [...pl().querySelectorAll('tr[data-cal-orig-idx] td[data-wk-num-cell="1"]')].map(td => td.textContent.trim());

  /* ═══ 1. Calendar Week renumbering after excluded weeks (item 1) ═══ */
  await suite('Calendar Week numbers count only INCLUDED weeks; excluding/including renumbers the rest immediately', async () => {
    await importGuide(dom, c, fixture({ weeks: 4 }));
    await flush(300);
    check('a 4-week calendar shows Week 1..4', weekLabels().join(',') === 'Week 1,Week 2,Week 3,Week 4', weekLabels().join(','));
    // Paul's example: exclude original Week 2
    EX().toggle('pg-001', 'cal_a', mon(1)); await flush(500);
    check("excluding Week 2 -> Week 1, \u2014, Week 2, Week 3 (following weeks renumber)", weekLabels().join(',') === 'Week 1,\u2014,Week 2,Week 3', weekLabels().join(','));
    check('the excluded week itself shows no number (em-dash)', weekLabels()[1] === '\u2014', weekLabels()[1]);
    // exclude another (original Week 4) — only included weeks keep counting
    EX().toggle('pg-001', 'cal_a', mon(3)); await flush(500);
    check('excluding Week 4 too -> Week 1, \u2014, Week 2, \u2014', weekLabels().join(',') === 'Week 1,\u2014,Week 2,\u2014', weekLabels().join(','));
    // include the first-excluded back -> immediate restore of sequential numbering
    EX().toggle('pg-001', 'cal_a', mon(1)); await flush(500);
    check('including Week 2 back -> Week 1, Week 2, Week 3, \u2014 (Week 4 still excluded)', weekLabels().join(',') === 'Week 1,Week 2,Week 3,\u2014', weekLabels().join(','));
    EX().toggle('pg-001', 'cal_a', mon(3)); await flush(500);
    check('including the last week back restores Week 1..4', weekLabels().join(',') === 'Week 1,Week 2,Week 3,Week 4', weekLabels().join(','));
  });

  await suite('Multiple + consecutive exclusions renumber correctly, in a 6-week calendar', async () => {
    await importGuide(dom, c, fixture({ weeks: 6 }));
    await flush(300);
    check('6 weeks show Week 1..6', weekLabels().join(',') === 'Week 1,Week 2,Week 3,Week 4,Week 5,Week 6', weekLabels().join(','));
    // exclude weeks 2 and 3 (consecutive)
    EX().toggle('pg-001', 'cal_a', mon(1)); await flush(300);
    EX().toggle('pg-001', 'cal_a', mon(2)); await flush(400);
    check('two consecutive exclusions -> 1, \u2014, \u2014, 2, 3, 4', weekLabels().join(',') === 'Week 1,\u2014,\u2014,Week 2,Week 3,Week 4', weekLabels().join(','));
    // exclude the first week too
    EX().toggle('pg-001', 'cal_a', mon(0)); await flush(400);
    check('excluding the first week too -> \u2014, \u2014, \u2014, 1, 2, 3', weekLabels().join(',') === '\u2014,\u2014,\u2014,Week 1,Week 2,Week 3', weekLabels().join(','));
    // include all back
    EX().toggle('pg-001', 'cal_a', mon(0)); await flush(200);
    EX().toggle('pg-001', 'cal_a', mon(1)); await flush(200);
    EX().toggle('pg-001', 'cal_a', mon(2)); await flush(400);
    check('including all back restores Week 1..6', weekLabels().join(',') === 'Week 1,Week 2,Week 3,Week 4,Week 5,Week 6', weekLabels().join(','));
  });

  // ── shared rotation-day drivers ───────────────────────────────────────────────────────────
  const A = 'cal_a', GID = 'pg-001';
  const twoSchoolRot = () => fixture({ weeks: 6, siteRows: [
    { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
    { school: 'Roosevelt', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }
  ], data: { wkRot: { cal_a: { count: 2, cells: { '0|1': true, '0|2': true } } } } });
  const allocTable = () => pl().querySelector('.sf-alloc-table');
  const openAlloc = async () => { const cb = [...pl().querySelectorAll('.sf-alloc-toggle-cb')][0]; if (cb && !cb.checked) { $(cb).prop('checked', true).trigger('change'); await flush(700); } };
  const openPopup = async (name) => { W._pgCloseSchoolShPopups && W._pgCloseSchoolShPopups({ target: d.body }); await flush(150); const nm = [...pl().querySelectorAll('.sf-alloc-school-nm,.sf-strip-school-nm')].find(x => x.textContent.trim() === name); if (!nm) throw new Error('no school name ' + name); nm.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700); return d.querySelector('.sf-sh-popup'); };
  const popup = () => d.querySelector('.sf-sh-popup');
  const setPopupWeek = async (w) => { const wc = popup().querySelector('.sf-shv-wk[data-shv="' + w + '"]'); if (!wc) throw new Error('no popup week selector ' + w); $(wc).trigger('click'); await flush(500); };
  const rclickDay = async (root, dayK) => { const th = [...root.querySelectorAll('thead th[data-day="' + dayK + '"]')].pop(); if (!th) throw new Error('no day header ' + dayK); th.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); await flush(200); return d.querySelector('.pg-dayvis-ctx'); };
  const pickMenu = async (menu) => { const it = menu.querySelector('.pg-dayvis-ctx-item'); if (!it) throw new Error('no menu item'); $(it).trigger('click'); await flush(800); };
  const daysViewWeek = async (w) => { const t = allocTable(); const dv = t.querySelector('.sf-alloc-dv-wk[data-dv="' + w + '"]'); if (dv) { $(dv).trigger('click'); await flush(500); } };
  const daysCb = (si, dayK) => { const t = allocTable(); return t && t.querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + dayK + '"] input.sf-alloc-cb'); };

  /* ═══ 3. Right-click day removal in the per-school POPUP, rotation-week scoped (items 2,3,4) ═══ */
  await suite('Per-school POPUP: right-click a day header in a Rotation Week removes exactly that calendar+school+week+day', async () => {
    await importGuide(dom, c, twoSchoolRot()); await flush(300);
    await openAlloc();
    const pop = await openPopup('Lincoln');
    check('the popup opened', !!pop);
    await setPopupWeek(2);
    const th = [...pop.querySelectorAll('thead th[data-day="tue"]')].pop();
    check('the Rotation-Week day header is marked interactive (pg-day-vis-cell)', !!th && th.classList.contains('pg-day-vis-cell'), th && th.className);
    let menu = await rclickDay(pop, 'tue');
    check('right-click offers Exclude Tuesday', !!menu && /Exclude Tuesday/.test(menu.textContent) && !/Include/.test(menu.textContent), menu && menu.textContent.trim());
    await pickMenu(menu);
    check('the state is written to det.allocRotDayOff[cal_a]["0|2|tue"]', RD()(GID, A, 0, 2, 'tue') === true, JSON.stringify(detOff()));
    check('Rotation Week 1 Tuesday is UNTOUCHED (Base remains)', RD()(GID, A, 0, 1, 'tue') === false, 'rw1');
    check('Wednesday of the same week is UNTOUCHED', RD()(GID, A, 0, 2, 'wed') === false, 'wed');
    check('the OTHER school (Roosevelt) Rotation Week 2 Tuesday is UNTOUCHED', RD()(GID, A, 1, 2, 'tue') === false, 'roosevelt');
    // restore via the same right-click (now Include)
    menu = await rclickDay(popup(), 'tue');
    check('right-click now offers Include Tuesday', !!menu && /Include Tuesday/.test(menu.textContent), menu && menu.textContent.trim());
    await pickMenu(menu);
    check('including restores the day (state pruned)', RD()(GID, A, 0, 2, 'tue') === false && detOff() === null, JSON.stringify(detOff()));
  });

  /* ═══ 4. Right-click day removal in the per-school TABLE (separated section), rotation-week scoped ═══ */
  await suite('Per-school TABLE (separated section): right-click a Rotation-Week day header removes that exact combination', async () => {
    await importGuide(dom, c, twoSchoolRot()); await flush(300);
    // switch the separated section to Lincoln's Rotation Week 2 view
    const secWk = [...pl().querySelectorAll('.sf-shv-sec-wk[data-shv="2"]')][0];
    check('the separated section exposes a Rotation Week 2 view selector', !!secWk);
    $(secWk).trigger('click'); await flush(600);
    const prev = pl().querySelector('.sf-shv-sec-prev');
    check('the section renders the full-size Rotation-Week table', !!prev);
    const th = prev && [...prev.querySelectorAll('thead th[data-day="wed"]')].pop();
    check('its day header is interactive', !!th && th.classList.contains('pg-day-vis-cell'), th && th.className);
    let menu = await rclickDay(prev, 'wed');
    check('right-click offers Exclude Wednesday', !!menu && /Exclude Wednesday/.test(menu.textContent), menu && menu.textContent.trim());
    await pickMenu(menu);
    check('the table right-click wrote det.allocRotDayOff["0|2|wed"]', RD()(GID, A, 0, 2, 'wed') === true, JSON.stringify(detOff()));
    check('Rotation Week 1 Wednesday untouched', RD()(GID, A, 0, 1, 'wed') === false);
    check('Roosevelt Rotation Week 2 Wednesday untouched', RD()(GID, A, 1, 2, 'wed') === false);
    // restore
    const prev2 = pl().querySelector('.sf-shv-sec-prev');
    menu = await rclickDay(prev2, 'wed'); check('now offers Include Wednesday', !!menu && /Include Wednesday/.test(menu.textContent));
    await pickMenu(menu);
    check('restored', RD()(GID, A, 0, 2, 'wed') === false && detOff() === null, JSON.stringify(detOff()));
  });

  /* ═══ 5. Parity with the Days checkbox + bidirectional sync (items 4,5) ═══ */
  await suite('Right-click and the Staffing Allocation Days checkbox share ONE state and sync both directions', async () => {
    await importGuide(dom, c, twoSchoolRot()); await flush(300);
    await openAlloc();
    // forward: remove via the popup right-click, the Days checkbox for RW2 reflects it
    const pop = await openPopup('Lincoln'); await setPopupWeek(2);
    await pickMenu(await rclickDay(pop, 'thu'));
    check('popup right-click disabled Lincoln Thursday for RW2', RD()(GID, A, 0, 2, 'thu') === true);
    await daysViewWeek(2);
    const cb = daysCb(0, 'thu');
    check('the Days view on Rotation Week 2 shows Lincoln Thursday UNCHECKED (forward sync)', !!cb && cb.checked === false, cb && cb.checked);
    // a checkbox in a DIFFERENT week (RW1) stays checked — scope proof on the checkbox surface too
    await daysViewWeek(1);
    const cb1 = daysCb(0, 'thu');
    check('the Days view on Rotation Week 1 shows Lincoln Thursday still CHECKED', !!cb1 && cb1.checked === true, cb1 && cb1.checked);
    // reverse: re-check via the Days checkbox (back on RW2), the state clears and the popup follows
    await daysViewWeek(2);
    const cb2 = daysCb(0, 'thu'); cb2.checked = true; $(cb2).trigger('change'); await flush(800);
    check('re-checking the Days box cleared the rotation-day state (reverse sync)', RD()(GID, A, 0, 2, 'thu') === false && detOff() === null, JSON.stringify(detOff()));
    const p2 = popup();
    check('the popup is still open on RW2 and its Thursday header is no longer struck', !!p2 && !/line-through/.test((([...p2.querySelectorAll('thead th[data-day="thu"]')].pop()) || {}).style?.textDecoration || ''), 'popup');
    // and driving the checkbox OFF pushes the popup + state the other way
    const cb3 = daysCb(0, 'thu'); cb3.checked = false; $(cb3).trigger('change'); await flush(800);
    check('unchecking the Days box wrote the rotation-day state again', RD()(GID, A, 0, 2, 'thu') === true, JSON.stringify(detOff()));
  });

  /* ═══ 6. Recalculation + rerender: only the affected cells change; History + Undo; persistence ═══ */
  await suite('Removing a Rotation-Week day recalculates immediately, records ONE History entry, and is undoable + persistent', async () => {
    await importGuide(dom, c, twoSchoolRot()); await flush(300);
    await openAlloc();
    // A Rotation-Week-2 Friday falls on 2026-07-31 (week index 1, which maps to rotation week 2).
    // Capture that calendar day cell's hours before the change — this is the real dependent value.
    const dayHrs = (iso) => { const cell = [...pl().querySelectorAll('.cal-day-cell[data-date-key="' + iso + '"]')].find(x => x.getAttribute('data-cal-orig-idx') === '0'); const sp = cell && cell.querySelector('.cal-hours'); return sp ? parseFloat(sp.textContent) : (cell ? 0 : null); };
    const friRW2 = '2026-07-31';   // Friday of program week 2 -> rotation week 2 for a 2-week rotation
    const hrsBefore = dayHrs(friRW2);
    let h0 = -1; try { W._pgHist.flushNow(); h0 = W._pgHist.list(GID).length; } catch (e) {}
    const pop = await openPopup('Lincoln'); await setPopupWeek(2);
    await pickMenu(await rclickDay(pop, 'fri'));
    check('Lincoln Friday RW2 is now disabled', RD()(GID, A, 0, 2, 'fri') === true);
    // the calendar repaint lands via the deferred _updateHours pass; poll for it
    for (let i = 0; i < 20 && dayHrs(friRW2) === hrsBefore; i++) { await flush(120); }
    // exactly one History record, with the spec wording
    let rec = null; try { W._pgHist.flushNow(); const l = W._pgHist.list(GID); rec = l[0]; check('exactly ONE new History record', l.length === h0 + 1, h0 + ' -> ' + l.length); } catch (e) { check('History readable', false, String(e)); }
    check('the History record names the day, school and Rotation Week', !!rec && /Rotation Week day changed/.test(rec.action || '') && /Friday/.test(rec.desc || '') && /Lincoln/.test(rec.desc || '') && /Rotation Week 2/.test(rec.desc || ''), rec && JSON.stringify(rec).slice(0, 160));
    // the calendar day for that RW2 Friday lost Lincoln's hours; a RW1 Friday (2026-07-24) is unaffected
    const hrsAfter = dayHrs(friRW2);
    check('the RW2 Friday calendar hours dropped (Lincoln removed) while the pre-change value was present', hrsBefore != null && hrsBefore > 0 && hrsAfter != null && hrsAfter < hrsBefore, hrsBefore + ' -> ' + hrsAfter);
    check('a Rotation-Week-1 Friday (2026-07-24) is UNAFFECTED', dayHrs('2026-07-24') === hrsBefore, dayHrs('2026-07-24') + ' vs ' + hrsBefore);
    // Undo restores it
    try { W._pgUndo.doUndo(GID); } catch (e) { try { W._pgUndo.undo(); } catch (e2) {} }
    await flush(700);
    check('Undo restores Lincoln Friday RW2', RD()(GID, A, 0, 2, 'fri') === false, JSON.stringify(detOff()));
    // persistence: re-set then export/import round-trip keeps it
    const pop2 = await openPopup('Lincoln'); await setPopupWeek(2); await pickMenu(await rclickDay(pop2, 'fri'));
    check('re-disabled for the round-trip', RD()(GID, A, 0, 2, 'fri') === true);
    const payload = JSON.stringify({ type: 'planning-guide', guide: { id: GID, name: 'MA', status: 'Draft' }, data: JSON.parse(JSON.stringify(W._pgGuideDetails()[GID])) });
    check('the export payload carries the rotation-day state', /0\|2\|fri/.test(payload), 'payload');
    await importGuide(dom, c, payload); await flush(400);
    check('after re-import the disabled Rotation-Week day is still disabled', RD()(GID, A, 0, 2, 'fri') === true, JSON.stringify(detOff()));
    check('no page errors across the feature', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 7. Locked View: the right-click menu is inert ═══ */
  await suite('Locked View: the Rotation-Week day header offers no removal', async () => {
    await importGuide(dom, c, twoSchoolRot()); await flush(300);
    await openAlloc();
    const pop = await openPopup('Lincoln'); await setPopupWeek(2);
    // lock in place
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(80);
    const lock = d.getElementById('pg-lock-item'); if (lock) { $(lock).trigger('click'); await flush(400); }
    const p2 = popup();
    if (p2) { const th = [...p2.querySelectorAll('thead th[data-day="tue"]')].pop(); if (th) { th.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); await flush(150); } }
    check('no day-vis menu appears in Locked View', !d.querySelector('.pg-dayvis-ctx'), 'menu present');
    check('no rotation-day state was written while locked', detOff() === null, JSON.stringify(detOff()));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
