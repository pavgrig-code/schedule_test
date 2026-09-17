// t144_freeze_history.js — Freeze Schedule snapshot-history model: the Program-line checkbox activates/
// deactivates a SAVED snapshot without deleting it; snapshots survive upstream changes; school ❄
// indicators reflect the ACTIVE snapshot only; interaction with Override Day Totals and excluded weeks.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(opts) {
  opts = opts || {};
  const rows = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }, { school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 3, ctkk: 10 }];
  const data = { status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: (opts.long ? '2026-07-24' : '2026-07-17'), color: '#e57373', pricePerHour: '80.00', billable: true }],
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
  const cell = dk => pl().querySelector('.cal-day-cell[data-date-key="' + (dk || D) + '"]:not(.cal-combined-carrier)');
  const hrs = dk => parseFloat(cell(dk).querySelector('.cal-hours').textContent) || 0;
  const det = () => W._pgGuideDetails()['pg-001'];
  const mk = dk => det().calMarkers['cal_a|' + (dk || D)];
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const leaves = m => [...m.querySelectorAll('*')].filter(e => e.children.length === 0);
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(700); };
  const pin = async dk => { $(cell(dk)).trigger('click'); await flush(600); };
  const closePop = async () => { $(d.body).trigger('click'); await flush(250); };
  const fzLine = () => popup().querySelector('.cal-tip-freeze-line');
  const fzChk = () => fzLine() && fzLine().querySelector('.cal-tip-fz-chk');
  const progSched = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent))); if (!t) return NaN; const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); return parseFloat(t.tBodies[0].rows[0].cells[i].textContent); };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  const freezeDay = async dk => { $(cell(dk)).trigger('contextmenu'); await flush(250); const m = d.querySelector('.cal-ctx-menu'); $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $(leaves(m).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(500); };
  const marks = () => [...popup().querySelectorAll('.cal-tip-school-mark')].map(mm => ({ t: mm.textContent, row: mm.parentElement.textContent }));

  /* ═══ 1. Checkbox line: format, activate/deactivate without delete, snapshot preserved (§1-§5) ═══ */
  await suite('The Program line is a checkbox + snowflake + timestamp; unchecking deactivates the saved snapshot without deleting it; re-checking restores the SAVED snapshot even after upstream changes', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeDay(D); const frozen = hrs();
    await pin(D);
    check('the line has a checkbox, checked while active', !!fzChk() && fzChk().checked);
    check('the line shows a snowflake and a timestamp, with no "Latest:"', /\u2744/.test(fzLine().textContent) && /\d{1,2}:\d{2}/.test(fzLine().textContent) && !/Latest/.test(fzLine().textContent), fzLine().textContent);
    check('exactly one history snapshot exists, active', (mk().frozenHist || []).length === 1 && (mk().frozenHist || []).filter(e => e.active).length === 1);
    // uncheck -> deactivate, snapshot kept
    fzChk().checked = false; $(fzChk()).trigger('change'); await flush(1100);
    check('unchecking deactivates (no active flat freeze view)', !mk().frozen);
    check('the snapshot is preserved in history (still 1 entry, now inactive)', (mk().frozenHist || []).length === 1 && (mk().frozenHist || []).filter(e => e.active).length === 0);
    check('the cell returned to the inherited schedule', hrs() === frozen, hrs());   // inherited == snapshot here initially
    // upstream change so inherited diverges from the snapshot
    det().staffingHoursSlots.c0.ctkk = mkTimes('09:00', '21:00'); await recalc();
    const inherited = hrs();
    check('after an upstream change the cell follows inheritance, not the snapshot', inherited !== frozen, inherited + ' vs ' + frozen);
    check('the saved snapshot still holds its ORIGINAL times (not regenerated)', JSON.stringify((mk().frozenHist[0].snap['0'] || {}).ctkk) === JSON.stringify({ start: '09:00', end: '15:00', cnt: 2 }), JSON.stringify(mk().frozenHist[0].snap['0']));
    // re-check -> restore the saved snapshot (original value, NOT the changed inherited)
    await pin(D); fzChk().checked = true; $(fzChk()).trigger('change'); await flush(1100);
    check('re-checking restores the SAVED snapshot value (§5), not the changed inherited value', hrs() === frozen, hrs() + ' vs frozen ' + frozen + ' / inherited ' + inherited);
    check('the snapshot is active again', (mk().frozenHist || []).filter(e => e.active).length === 1);
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. School ❄ indicators reflect the ACTIVE snapshot only (§10) ═══ */
  await suite('School snowflake indicators show ❄ only while the active snapshot freezes that school; a deactivated snapshot shows bullets', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeDay(D);
    await pin(D);
    check('while active: every frozen school shows the snowflake marker', marks().length >= 1 && marks().every(x => x.t === '\u2744'), JSON.stringify(marks().map(x => x.t)));
    fzChk().checked = false; $(fzChk()).trigger('change'); await flush(1100);
    check('after deactivating: schools show bullets, NOT snowflakes (history exists but is inactive)', marks().every(x => x.t === '\u2022'), JSON.stringify(marks().map(x => x.t)));
    check('the snapshot history is still saved', (mk().frozenHist || []).length === 1);
    fzChk().checked = true; $(fzChk()).trigger('change'); await flush(1100);
    check('re-activating restores the snowflake markers', marks().every(x => x.t === '\u2744'));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Repeated freezes build history; every dependent reconciles at each step (§8) ═══ */
  await suite('Every activate/deactivate immediately recalculates all dependents (cell = Programs = Summary)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const baseProg = progSched();
    await freezeDay(D); await recalc();
    check('frozen: Programs = Summary', progSched() === summaryHours(), progSched() + '/' + summaryHours());
    await pin(D); fzChk().checked = false; $(fzChk()).trigger('change'); await flush(1100); await closePop(); await recalc();
    check('deactivated: cell back to inherited and Programs = Summary = base', progSched() === summaryHours() && progSched() === baseProg, progSched() + '/' + summaryHours() + ' base ' + baseProg);
    await pin(D); fzChk().checked = true; $(fzChk()).trigger('change'); await flush(1100); await closePop(); await recalc();
    check('re-activated: Programs = Summary again', progSched() === summaryHours(), progSched() + '/' + summaryHours());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Excluded week keeps the snapshot active but suppressed; inclusion restores it (§12) ═══ */
  await suite('Week exclusion suppresses the active snapshot but keeps it saved+active; inclusion restores it automatically', async () => {
    await importGuide(dom, c, fixture({ long: true })); await flush(700);
    const dk = '2026-07-15', MON = '2026-07-13';
    await freezeDay(dk); const frozen = hrs(dk);
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    const t = cell(dk).querySelector('.cal-hours').textContent.trim();
    check('EXCLUDED: the frozen hours are suppressed (blank/0)', t === '' || /^0/.test(t), t);
    check('EXCLUDED: the snapshot stays saved AND marked active in history', (mk(dk).frozenHist || []).some(e => e.active));
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    check('INCLUDED: the frozen value is restored automatically', hrs(dk) === frozen, hrs(dk) + ' vs ' + frozen);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Create-new-snapshot workflow: clean open, Save creates a new active snapshot preserving prior ones, switchable history list ═══ */
  await suite('The right-click menu opens clean (no preselect); Save creates a new snapshot at the top of history and activates it; older snapshots are preserved, immutable, and switchable from the breakdown list', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const snows = m => [...m.querySelectorAll('.sch-freeze')];
    const openMenu = async () => { $(cell()).trigger('contextmenu'); await flush(300); return d.querySelector('.cal-ctx-menu'); };
    const apply = async m => { $(leaves(m).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(600); };
    // Snapshot A = schools 0,1
    let m = await openMenu();
    check('the menu opens with NO schools preselected (all snowflakes inactive)', snows(m).every(x => x.getAttribute('data-frozen') === '0'), snows(m).map(x => x.getAttribute('data-frozen')).join(','));
    $(snows(m)[0]).trigger('click'); $(snows(m)[1]).trigger('click'); await flush(60); await apply(m);
    check('Save A: one history entry, active, schools {0,1}', (mk().frozenHist || []).length === 1 && Object.keys(mk().frozenHist.find(e => e.active).snap).sort().join() === '0,1', JSON.stringify((mk().frozenHist || []).length));
    const aSnap = JSON.stringify(mk().frozenHist[0].snap['0'].ctkk);
    // change upstream, then Snapshot B = schools 1,2 (menu still opens clean, A stays active until B saved)
    det().staffingHoursSlots.c0.ctkk = mkTimes('09:00', '19:00'); await recalc();
    m = await openMenu();
    check('the 2nd open is still clean while A is active (does NOT mirror A)', snows(m).every(x => x.getAttribute('data-frozen') === '0'));
    $(snows(m)[1]).trigger('click'); $(snows(m)[2]).trigger('click'); await flush(60); await apply(m);
    check('Save B: TWO history entries, B active with schools {1,2}, A preserved', (mk().frozenHist || []).length === 2 && Object.keys(mk().frozenHist.find(e => e.active).snap).sort().join() === '1,2');
    check('A snapshot is immutable (its captured times are unchanged by the upstream edit)', JSON.stringify(mk().frozenHist.find(e => Object.keys(e.snap).sort().join() === '0,1').snap['0'].ctkk) === aSnap, aSnap);
    // breakdown history list
    await pin(D);
    const rows = () => [...popup().querySelectorAll('.cal-tip-freeze-line')];
    check('the breakdown shows a history list, newest first, with the active one checked', rows().length === 2 && rows()[0].querySelector('.cal-tip-fz-chk').checked && !rows()[1].querySelector('.cal-tip-fz-chk').checked);
    check('each row is checkbox + snowflake + timestamp "by <user>", no "Latest:"', rows().every(r => !!r.querySelector('.cal-tip-fz-chk') && /\u2744/.test(r.textContent) && / by /.test(r.textContent) && !/Latest/.test(r.textContent)), rows()[0].textContent);
    // switch to A (older row) -> school membership + marks + values swap
    const chkA = rows()[1].querySelector('.cal-tip-fz-chk'); chkA.checked = true; $(chkA).trigger('change'); await flush(1000);
    check('switching to A activates it and deactivates B (one active at a time)', mk().frozenHist.filter(e => e.active).length === 1 && Object.keys(mk().frozenHist.find(e => e.active).snap).sort().join() === '0,1');
    const mkA = marks();
    check('school marks follow the active snapshot A (❄ Lincoln, ❄ Adams, • Roosevelt)', mkA.find(x => /Lincoln/.test(x.row)).t === '\u2744' && mkA.find(x => /Adams/.test(x.row)).t === '\u2744' && mkA.find(x => /Roosevelt/.test(x.row)).t === '\u2022', JSON.stringify(mkA.map(x => x.t)));
    // disable all (§7)
    const chkAct = rows().find(r => r.querySelector('.cal-tip-fz-chk').checked).querySelector('.cal-tip-fz-chk'); chkAct.checked = false; $(chkAct).trigger('change'); await flush(1000);
    check('unchecking the active one turns Freeze off but keeps ALL snapshots', !mk().frozenHist.some(e => e.active) && mk().frozenHist.length === 2);
    check('all schools show bullets when nothing is active', marks().every(x => x.t === '\u2022'), JSON.stringify(marks().map(x => x.t)));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Cancel/close without Save creates no snapshot and does not alter the active one (§8) ═══ */
  await suite('Closing the menu without Save creates no snapshot and leaves the active snapshot and calculations untouched', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const snows = m => [...m.querySelectorAll('.sch-freeze')];
    const openMenu = async () => { $(cell()).trigger('contextmenu'); await flush(300); return d.querySelector('.cal-ctx-menu'); };
    // create Snapshot A
    let m = await openMenu(); $(snows(m)[0]).trigger('click'); await flush(60); $(leaves(m).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(600);
    const before = JSON.stringify(mk().frozenHist); const beforeHrs = hrs();
    // open again, select schools, but CLOSE (Escape) without Apply
    m = await openMenu(); $(snows(m)[1]).trigger('click'); $(snows(m)[2]).trigger('click'); await flush(60);
    d.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush(300); await recalc();
    check('no new snapshot was created (history unchanged)', JSON.stringify(mk().frozenHist) === before, (mk().frozenHist || []).length + ' entries');
    check('the active snapshot A and the cell value are untouched', hrs() === beforeHrs, hrs() + ' vs ' + beforeHrs);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. A new snapshot over an ACTIVE one captures the current EFFECTIVE state (active snapshot + overrides), not inheritance ═══ */
  await suite('Creating a snapshot while another is active captures Active Snapshot + overrides (the visible effective state), never the inherited schedule; older snapshots stay original', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('inherited = 36', hrs() === 36, hrs());
    await freezeDay(D);   // Snapshot A = 36
    const A = () => mk().frozenHist.find(e => !e.active) || mk().frozenHist[0];
    check('Snapshot A captured Lincoln cnt 2', mk().frozenHist[0].snap['0'].ctkk.cnt === 2);
    // override on top of A: Lincoln 2 -> 5 -> effective 54
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|' + D + '|0|ctkk'] = { cnt: 5 }; await recalc();
    check('effective state with the override = 54', hrs() === 54, hrs());
    // and make INHERITANCE diverge so a wrong capture would be obvious (Lincoln 9 -> would give 78)
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 9; det().siteRows[0].coaches_ctkk = 9; await recalc();
    check('the frozen day ignores the upstream change (still 54)', hrs() === 54, hrs());
    // create Snapshot B
    await freezeDay(D);
    const B = mk().frozenHist.find(e => e.active); const Aold = mk().frozenHist.find(e => !e.active);
    check('Snapshot B captured the EFFECTIVE Lincoln cnt 5 (A + override), NOT the inherited 9 nor A\'s 2', B && B.snap['0'].ctkk.cnt === 5, B && B.snap['0'].ctkk.cnt);
    check('the cell under B equals the effective state at save (54) - no difference between visible state and stored snapshot', hrs() === 54, hrs());
    check('the override was baked into B and removed (future overrides start clean on B)', !(det().calCellOverrides && det().calCellOverrides['cal_a|' + D + '|0|ctkk']));
    check('Snapshot A is unchanged (still cnt 2)', Aold && Aold.snap['0'].ctkk.cnt === 2, Aold && Aold.snap['0'].ctkk.cnt);
    // switching restores each snapshot's own saved state
    await pin(D);
    const rows = () => [...popup().querySelectorAll('.cal-tip-freeze-line')];
    const chkA = rows()[1].querySelector('.cal-tip-fz-chk'); chkA.checked = true; $(chkA).trigger('change'); await flush(1000);
    check('switching back to A restores A\'s original state (36)', hrs() === 36, hrs());
    const chkB = rows()[0].querySelector('.cal-tip-fz-chk'); chkB.checked = true; $(chkB).trigger('change'); await flush(1000);
    check('switching to B restores B\'s baked state (54)', hrs() === 54, hrs());
    await closePop();
    // a new override on top of B applies to B, not to inheritance
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|' + D + '|1|ctkk'] = { cnt: 4 }; await recalc();
    check('a new override applies on top of B (Adams 1 -> 4: 54 - 6 + 24 = 72)', hrs() === 72, hrs());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. No active snapshot: a new snapshot still captures inheritance + current overrides ═══ */
  await suite('With no active snapshot, a new snapshot captures the inherited schedule plus applicable current overrides (normal freeze logic)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    det().calCellOverrides = det().calCellOverrides || {}; det().calCellOverrides['cal_a|' + D + '|0|ctkk'] = { cnt: 5 }; await recalc();
    check('inherited + override = 54', hrs() === 54, hrs());
    await freezeDay(D);
    check('the new snapshot captured inheritance + override (Lincoln cnt 5)', mk().frozenHist[0].snap['0'].ctkk.cnt === 5, mk().frozenHist[0].snap['0'].ctkk.cnt);
    check('cell = 54 under the snapshot', hrs() === 54, hrs());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
