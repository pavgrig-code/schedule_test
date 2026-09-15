// t142_ovr_freeze_stress.js — adversarial stress test of Override Day Totals and Freeze Schedule and
// their interaction. Every mutation is followed by a CROSS-SURFACE reconciliation check: the Calendar
// cell, the hourly-breakdown final total, the Programs "Scheduled Hrs" column, and the Planning Guide
// Summary Total Hours must all agree, and the stored data must be exactly what the UI shows. Any
// discrepancy is a critical defect.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(opts) {
  opts = opts || {};
  const rows = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }, { school: 'Roosevelt', schoolId: 's3', coaches_ctkk: 3, ctkk: 10 }];
  const data = {
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: (opts.long ? '2026-07-31' : '2026-07-17'), color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: rows.slice() }, siteRows: rows.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
  };
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
  await whenReady(dom); await flush(400); W._pgCurrentUser = 'QA';
  const pl = () => d.getElementById('planning-panel');
  const CAL = 'cal_a', D = '2026-07-08';   // Wed of week Mon 2026-07-06
  const cell = dk => pl().querySelector('.cal-day-cell[data-date-key="' + (dk || D) + '"][data-cal-id="' + CAL + '"]:not(.cal-combined-carrier)') || pl().querySelector('.cal-day-cell[data-date-key="' + (dk || D) + '"]:not(.cal-combined-carrier)');
  const hrs = dk => { const h = cell(dk) && cell(dk).querySelector('.cal-hours'); return h ? (parseFloat(h.textContent) || 0) : 0; };
  const cnt = dk => parseInt(cell(dk).getAttribute('data-eff-cnt'), 10) || 0;
  const det = () => W._pgGuideDetails()['pg-001'];
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const ovRow = () => popup() && popup().querySelector('.cal-tip-dayov-row');
  const grand = () => { const t = [...popup().querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)|^Total/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total(\s*\(\d+ schools?\))?/, '').trim()) : NaN; };
  const ctl = () => popup().querySelector('.cal-tip-ovr-day-totals'); const q = cls => ctl().querySelector(cls);
  const enable = async () => { q('.cal-tip-odt-chk').checked = true; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(1000); };
  const saveVals = async (h, s) => { $(q('.cal-tip-odt-hours')).val(h).trigger('input'); $(q('.cal-tip-odt-staff')).val(s).trigger('input'); await flush(40); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); };
  const pin = async dk => { $(cell(dk)).trigger('click'); await flush(600); };
  const closePop = async () => { $(d.body).trigger('click'); await flush(250); };
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(700); };
  const progSched = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent))); if (!t) return NaN; const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); return parseFloat(t.tBodies[0].rows[0].cells[i].textContent); };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  const freezeDay = async dk => { $(cell(dk)).trigger('contextmenu'); await flush(250); const m = d.querySelector('.cal-ctx-menu'); $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $([...m.querySelectorAll('*')].filter(e => e.children.length === 0).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(500); };

  // Central reconciliation: with a pinned popup open on `dk`, the breakdown final total must equal the
  // cell hours; Programs "Scheduled Hrs" must equal the Summary Total Hours (they are the same aggregate).
  async function reconcile(label, dk, expectCellH, expectCellC) {
    if (expectCellH != null) check(label + ': cell hours = ' + expectCellH, hrs(dk) === expectCellH, hrs(dk));
    if (expectCellC != null) check(label + ': cell count = ' + expectCellC, cnt(dk) === expectCellC, cnt(dk));
    await pin(dk);
    check(label + ': breakdown final total = cell hours (' + hrs(dk) + ')', grand() === hrs(dk), grand() + ' vs ' + hrs(dk));
    await closePop();
    check(label + ': Programs Scheduled Hrs = Summary Total Hours', progSched() === summaryHours(), progSched() + ' vs ' + summaryHours());
  }

  /* ═══ 1. Override on a FROZEN day: override wins, frozen snapshot preserved, all surfaces reconcile ═══ */
  await suite('Override on a frozen day: the override is authoritative over the snapshot; disabling returns to the frozen value; every surface reconciles at each step', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await freezeDay(D);
    check('frozen day = 36', hrs() === 36, hrs());
    // upstream change ignored by the freeze
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 9; det().siteRows[0].coaches_ctkk = 9; await recalc();
    await reconcile('frozen (upstream ignored)', D, 36, 6);
    // override 500/40 on top of the freeze
    await pin(D); await enable(); await saveVals('500', '40'); await closePop();
    await reconcile('override over freeze', D, 500, 40);
    check('the frozen snapshot is intact under the override', !!det().calMarkers['cal_a|' + D].frozenSnap);
    await pin(D); check('the breakdown shows both a Calendar Total row and the Override row', !!popup().querySelector('.cal-tip-calctotal-row') && !!ovRow()); await closePop();
    // disable override -> back to the frozen 36 (NOT the changed upstream 9-coach value)
    await pin(D); q('.cal-tip-odt-chk').checked = false; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(1100); await closePop(); await recalc();
    await reconcile('override off -> frozen', D, 36, 6);
    // remove the freeze -> now the inherited (changed) schedule applies: 9-coach Lincoln => 9*6 + 1*6 + 3*6 = 78
    $(cell()).trigger('contextmenu'); await flush(250); let m = d.querySelector('.cal-ctx-menu'); $(m.querySelector('.sch-freeze')).trigger('click'); $([...m.querySelectorAll('.sch-freeze')][1]).trigger('click'); $([...m.querySelectorAll('.sch-freeze')][2]).trigger('click'); await flush(60); $([...m.querySelectorAll('*')].filter(e => e.children.length === 0).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(600);
    await reconcile('freeze removed -> inherited', D, 78, 13);
    // re-enable the override -> 500/40 again from the kept values
    await pin(D); q('.cal-tip-odt-chk').checked = true; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(1100); await closePop(); await recalc();
    await reconcile('override re-enabled', D, 500, 40);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Rapid partial-override churn: hours-only <-> staff-only <-> both <-> removed, reconciling each ═══ */
  await suite('Rapid partial-override churn (hours-only / staff-only / both / removed) reconciles at every step with no drift', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const base = hrs(), baseC = cnt();
    await pin(D); await enable();
    // both
    await saveVals('500', '40'); await closePop(); await reconcile('both', D, 500, 40);
    // hours-only
    await pin(D); $(q('.cal-tip-odt-staff')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); await closePop();
    await reconcile('hours-only', D, 500, baseC);
    check('hours-only: cal-hours is amber', /154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color));
    // staff-only
    await pin(D); $(q('.cal-tip-odt-hours')).val('').trigger('input'); $(q('.cal-tip-odt-staff')).val('40').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); await closePop();
    await reconcile('staff-only', D, base, 40);
    check('staff-only: cal-hours is NOT amber', !/154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color));
    // change staff value repeatedly
    for (const s of ['7', '99', '1']) { await pin(D); $(q('.cal-tip-odt-staff')).val(s).trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); await closePop(); check('staff churn ' + s + ': cell count = ' + s, cnt() === +s, cnt()); }
    await reconcile('after staff churn', D, base, 1);
    // remove entirely
    await pin(D); $(q('.cal-tip-odt-hours')).val('').trigger('input'); $(q('.cal-tip-odt-staff')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); await closePop();
    check('removed: store entry gone', !det().calDayTotalsOv || !det().calDayTotalsOv['cal_a|' + D]);
    await reconcile('removed -> calculated', D, base, baseC);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Multiple overridden days in one calendar: Programs/Summary count each once, no double-count ═══ */
  await suite('Several overridden days: Programs and Summary include each override exactly once and reconcile', async () => {
    await importGuide(dom, c, fixture({ long: true })); await flush(700);
    const days = ['2026-07-08', '2026-07-15', '2026-07-22'];
    const base = progSched();
    let expectedDelta = 0;
    for (let i = 0; i < days.length; i++) {
      const dk = days[i], H = 100 * (i + 1);
      const calcH = hrs(dk);
      await pin(dk); await enable(); await saveVals(String(H), String(10 * (i + 1))); await closePop();
      expectedDelta += (H - calcH);
      check(dk + ': cell = ' + H, hrs(dk) === H, hrs(dk));
    }
    check('Programs reflects all three overrides once (base + sum of deltas)', Math.abs(progSched() - (base + expectedDelta)) < 0.5, progSched() + ' vs ' + (base + expectedDelta));
    check('Programs = Summary', progSched() === summaryHours(), progSched() + ' vs ' + summaryHours());
    // each day still reconciles individually
    for (const dk of days) { await pin(dk); check(dk + ': breakdown total = cell', grand() === hrs(dk), grand() + '/' + hrs(dk)); await closePop(); }
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Override + week exclusion + freeze all at once on the same week ═══ */
  await suite('Override + freeze + week-exclusion interaction: exclusion outranks both; inclusion restores the override; every surface reconciles', async () => {
    await importGuide(dom, c, fixture({ long: true })); await flush(700);
    const dk = '2026-07-15', MON = '2026-07-13';
    await freezeDay(dk);
    await pin(dk); await enable(); await saveVals('500', '40'); await closePop(); await recalc();
    await reconcile('override over frozen day', dk, 500, 40);
    const schedWith = progSched();
    // exclude the week
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    check('EXCLUDED: cell blank/0', (function () { const t = cell(dk).querySelector('.cal-hours').textContent.trim(); return t === '' || /^0/.test(t); })(), cell(dk).querySelector('.cal-hours').textContent);
    check('EXCLUDED: Programs = Summary (both drop the whole week)', progSched() === summaryHours(), progSched() + ' vs ' + summaryHours());
    check('EXCLUDED: override + frozen snapshot both preserved in the store', det().calDayTotalsOv['cal_a|' + dk].on === true && !!det().calMarkers['cal_a|' + dk].frozenSnap);
    await pin(dk); check('EXCLUDED: no Override row, no Calendar Total row in the breakdown', !ovRow() && !popup().querySelector('.cal-tip-calctotal-row')); await closePop();
    // include -> override restored
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    await reconcile('INCLUDED -> override restored', dk, 500, 40);
    check('INCLUDED: Programs back to the with-override figure', progSched() === schedWith, progSched() + ' vs ' + schedWith);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Full round-trip: build a mixed state, export, re-import, and reconcile everything ═══ */
  await suite('Export/import round-trip of a mixed override+freeze state reconciles exactly on reload', async () => {
    await importGuide(dom, c, fixture({ long: true })); await flush(700);
    // frozen day with an override; a plain override; a staff-only override
    await freezeDay('2026-07-08');
    await pin('2026-07-08'); await enable(); await saveVals('300', '25'); await closePop();
    await pin('2026-07-15'); await enable(); await saveVals('450', '33'); await closePop();
    await pin('2026-07-22'); await enable(); $(q('.cal-tip-odt-staff')).val('50').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100); await closePop();
    await recalc();
    const beforeProg = progSched(), beforeSum = summaryHours();
    check('pre-export: Programs = Summary', beforeProg === beforeSum, beforeProg + '/' + beforeSum);
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    const parsed = JSON.parse(captured).data;
    check('export carries all three overrides and the freeze', Object.keys(parsed.calDayTotalsOv || {}).length === 3 && !!(parsed.calMarkers['cal_a|2026-07-08'] || {}).frozenSnap);
    await importGuide(dom, c, captured); await flush(800);
    check('after reload: 07-08 = 300 (frozen+override)', hrs('2026-07-08') === 300, hrs('2026-07-08'));
    check('after reload: 07-15 = 450', hrs('2026-07-15') === 450, hrs('2026-07-15'));
    check('after reload: 07-22 staff-only (hours calculated, count 50)', cnt('2026-07-22') === 50, cnt('2026-07-22'));
    check('after reload: Programs = Summary and equals the pre-export Programs', progSched() === summaryHours() && progSched() === beforeProg, progSched() + '/' + summaryHours() + ' vs ' + beforeProg);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Undo/redo across an override save reconciles ═══ */
  await suite('Undo and redo around an override save keep every surface reconciled', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const base = hrs();
    await pin(D); await enable(); await saveVals('500', '40'); await closePop();
    check('after save: 500', hrs() === 500, hrs());
    // the app's undo is a snackbar with an Undo button (not Ctrl+Z); saving an override must offer it
    const snackUndo = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
    check('saving the override offers an Undo snackbar', !!snackUndo());
    if (snackUndo()) { $(snackUndo()).trigger('click'); await flush(900); await recalc(); }
    check('after Undo: the override is reverted to the calculated value ' + base, hrs() === base || !det().calDayTotalsOv || !det().calDayTotalsOv['cal_a|' + D], hrs());
    check('after Undo: Programs = Summary', progSched() === summaryHours(), progSched() + '/' + summaryHours());
    // reconcile the reverted state fully
    await pin(D); check('after Undo: breakdown total = cell', grand() === hrs(), grand() + '/' + hrs()); await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
