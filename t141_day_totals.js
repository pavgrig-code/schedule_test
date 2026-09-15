// t141_day_totals.js — Override Day Totals as the AUTHORITATIVE Program + Day totals. Blank defaults and
// content-based field widths; Save makes the entered Hours / Staff Count the final day totals (each
// independently) above the detailed schedule, frozen snapshots, overrides, Extra Shifts and Allocated
// Hours; every dependent reconciles (cell, count badge, hover + pinned popups with an Override row,
// Programs Scheduled Hrs, Program Summary row + total, Summary, Weeks Total row); disabling restores the
// detailed schedule while keeping the saved values; persistence across export/import.
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
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: (opts.long ? '2026-07-24' : '2026-07-17'), color: '#e57373', pricePerHour: '80.00', billable: true }],
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
  // Tests exercise the hover popup, which is now OFF by default; enable it unless a suite opts out.
  if (!importGuide._noHover) { try { const det = W._pgGuideDetails()['pg-001']; if (det) { det.showHoverBreakdown = true; } } catch (e) {} }
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  W._pgCurrentUser = 'QA';
  const pl = () => d.getElementById('planning-panel');
  const D = '2026-07-08';
  const cell = dk => pl().querySelector('.cal-day-cell[data-date-key="' + (dk || D) + '"]:not(.cal-combined-carrier)');
  const hrs = dk => parseFloat(cell(dk).querySelector('.cal-hours').textContent) || 0;
  const cnt = dk => parseInt(cell(dk).getAttribute('data-eff-cnt'), 10) || 0;
  const det = () => W._pgGuideDetails()['pg-001'];
  const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
  const grand = () => { const t = [...popup().querySelectorAll('tr,div')].filter(e => /^Total \(\d+ schools?\)|^Total/.test(e.textContent.trim())).pop(); return t ? parseFloat(t.textContent.replace(/^Total(\s*\(\d+ schools?\))?/, '').trim()) : NaN; };
  const ovRow = () => popup().querySelector('.cal-tip-dayov-row');
  const ctl = () => popup().querySelector('.cal-tip-ovr-day-totals'); const q = cls => ctl().querySelector(cls);
  const pin = async dk => { $(cell(dk)).trigger('click'); await flush(600); };
  const closePop = async () => { $(d.body).trigger('click'); await flush(250); };
  const enable = async () => { q('.cal-tip-odt-chk').checked = true; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(1200); };
  const disable = async () => { q('.cal-tip-odt-chk').checked = false; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(1200); };
  const saveVals = async (h, s) => { $(q('.cal-tip-odt-hours')).val(h).trigger('input'); $(q('.cal-tip-odt-staff')).val(s).trigger('input'); await flush(40); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200); };
  const progSched = () => { const t = [...pl().querySelectorAll('table')].find(x => x.tHead && [...x.tHead.rows[x.tHead.rows.length - 1].cells].some(cc => /Scheduled Hrs/.test(cc.textContent))); if (!t) return NaN; const hr = t.tHead.rows[t.tHead.rows.length - 1]; const i = [...hr.cells].findIndex(cc => /Scheduled Hrs/.test(cc.textContent)); return parseFloat(t.tBodies[0].rows[0].cells[i].textContent); };
  const summaryHours = () => { const gc = pl().querySelector('[data-guide-summary]'); const b = gc && gc.querySelector('.pg-gs-box-hours'); return b ? parseFloat(b.textContent) : NaN; };
  const cardText = () => { const cd = pl().querySelector('[data-summary-cal="cal_a"]'); return cd ? cd.textContent.replace(/\s+/g, ' ') : ''; };
  const recalc = async () => { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); await flush(700); };

  /* ═══ 1. Blank defaults, content-based widths, Save makes the values authoritative everywhere ═══ */
  await suite('Blank defaults + content-based widths; Save makes Hours/Staff Count the final day totals in the cell, badge, both popups, Programs, Program Summary (row + total) and Summary', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('baseline: cell 36 hrs / 6 staff; Programs 360; Summary 360', hrs() === 36 && cnt() === 6 && progSched() === 360 && summaryHours() === 360, hrs() + '/' + cnt() + '/' + progSched() + '/' + summaryHours());
    await pin(D);
    check('unchecked by default', !q('.cal-tip-odt-chk').checked);
    await enable();
    check('when enabled the fields are BLANK (not the calculated 36 / 6) with blank placeholders', q('.cal-tip-odt-hours').value === '' && q('.cal-tip-odt-staff').value === '' && q('.cal-tip-odt-hours').placeholder === '' && q('.cal-tip-odt-staff').placeholder === '');
    check('the fields are content-based (3.5ch when empty)', q('.cal-tip-odt-hours').style.width === '3.5ch', q('.cal-tip-odt-hours').style.width);
    $(q('.cal-tip-odt-hours')).val('500').trigger('input'); await flush(30);
    check('the Hours field grows with its content', parseFloat(q('.cal-tip-odt-hours').style.width) > 3.5, q('.cal-tip-odt-hours').style.width);
    $(q('.cal-tip-odt-staff')).val('40').trigger('input'); await flush(40);
    $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200);
    check('CELL: 500 hrs / 40 staff immediately after Save', hrs() === 500 && cnt() === 40, hrs() + '/' + cnt());
    check('the cell is flagged as overridden', cell().getAttribute('data-day-ov') === 'hc');
    check('CELL: the cal-hours label is amber rgb(154, 91, 0) while Hours is overridden', /154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color), cell().querySelector('.cal-hours').style.color);
    check('the stored override carries on:true', JSON.stringify(det().calDayTotalsOv['cal_a|' + D]) === '{"hours":500,"staff":40,"on":true}', JSON.stringify(det().calDayTotalsOv['cal_a|' + D]));
    check('PINNED popup (rebuilt in place): Override Day Totals row present with 500 / 40', !!ovRow() && /Override Day Totals/.test(ovRow().textContent) && /500/.test(ovRow().textContent) && /40/.test(ovRow().textContent));
    check('PINNED popup: final total = 500 (NOT 36 + 500)', grand() === 500, grand());
    check('PINNED popup: the checkbox stays enabled after the rebuild', q('.cal-tip-odt-chk').checked);
    check('the school rows are still shown for reference (3 schools)', /Total \(3 schools\)/.test(popup().textContent));
    await closePop();
    $(cell()).trigger('mouseenter'); await flush(600);
    check('HOVER popup: Override row + final total 500', !!ovRow() && grand() === 500, grand());
    $(cell()).trigger('mouseleave'); await flush(300);
    check('Programs Scheduled Hrs: 360 - 36 + 500 = 824 (no double count)', progSched() === 824, progSched());
    check('Summary Total Hours: 824', summaryHours() === 824, summaryHours());
    const ct = cardText();
    check('Program Summary: an "Override Day Totals | 500 hrs | $80.00 | $40,000.00" row', /Override Day Totals\s*500 hrs\s*\$80\.00\s*\$40,000\.00/.test(ct), ct.slice(Math.max(0, ct.indexOf('Override') - 5), ct.indexOf('Override') + 70));
    check('Program Summary: the overridden day\'s school hours are excluded (Lincoln 12h x 9 other days = 108)', /Lincoln\s*108 hrs/.test(ct), (ct.match(/Lincoln\s*[\d.]+ hrs/) || [''])[0]);
    check('Program Summary: Scheduled Hours total 824 (schools 324 + override 500)', /Scheduled Hours \(3 schools\)\s*824 hrs/.test(ct), (ct.match(/Scheduled Hours[^$]*/) || [''])[0].slice(0, 60));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Disable / re-enable; staff-only and hours-only overrides apply independently ═══ */
  await suite('Disabling restores the detailed schedule (values kept, muted); re-enabling restores the override; Hours and Staff Count each apply independently when the other is blank', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await pin(D); await enable(); await saveVals('500', '40');
    check('override active (500 / 40)', hrs() === 500 && cnt() === 40);
    await disable();
    check('DISABLED: the detailed schedule returns (36 / 6); Programs back to 360', hrs() === 36 && cnt() === 6 && progSched() === 360, hrs() + '/' + cnt() + '/' + progSched());
    check('the saved values are kept (on:false) and shown muted', det().calDayTotalsOv['cal_a|' + D].on === false && /Hours: 500/.test((popup().querySelector('.cal-tip-odt-view') || {}).textContent || ''));
    check('no Override row while disabled; popup total 36', !ovRow() && grand() === 36, grand());
    await enable();
    check('RE-ENABLED: 500 / 40 again, Programs 824', hrs() === 500 && cnt() === 40 && progSched() === 824, hrs() + '/' + cnt() + '/' + progSched());
    // staff-only
    $(q('.cal-tip-odt-hours')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200);
    check('STAFF-ONLY: hours stay calculated (36), staff = 40; Programs 360', hrs() === 36 && cnt() === 40 && progSched() === 360, hrs() + '/' + cnt() + '/' + progSched());
    check('the cell is flagged c only', cell().getAttribute('data-day-ov') === 'c');
    check('STAFF-ONLY: the cal-hours label is NOT amber (normal colour)', !/154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color), cell().querySelector('.cal-hours').style.color);
    // hours-only
    $(q('.cal-tip-odt-hours')).val('120').trigger('input'); $(q('.cal-tip-odt-staff')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200);
    check('HOURS-ONLY: hours = 120, staff stays calculated (6); Programs 360 - 36 + 120 = 444', hrs() === 120 && cnt() === 6 && progSched() === 444, hrs() + '/' + cnt() + '/' + progSched());
    check('HOURS-ONLY: the cal-hours label is amber again', /154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color), cell().querySelector('.cal-hours').style.color);
    check('Program Summary row shows 120 hrs', /Override Day Totals\s*120 hrs/.test(cardText()));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Precedence over Freeze Schedule + Extra Shifts; the snapshot survives underneath ═══ */
  await suite('Override Day Totals sits above a frozen snapshot and Extra Shifts; the snapshot stays intact and returns when the override is disabled', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    // freeze the day, add an Extra Shift
    $(cell()).trigger('contextmenu'); await flush(250); let m = d.querySelector('.cal-ctx-menu');
    $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $([...m.querySelectorAll('*')].filter(e => e.children.length === 0).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(500);
    det().calExtraShifts = det().calExtraShifts || {}; det().calExtraShifts['cal_a|' + D] = [{ school: 'Lincoln', rows: [{ role: 'ctkk', start: '16:00', end: '18:00', cnt: 1 }] }]; await recalc();
    check('frozen + Extra Shift: cell 36 + 2 = 38', hrs() === 38, hrs());
    await pin(D); await enable(); await saveVals('500', '40');
    check('the override is the FINAL total: 500 (not 38 + 500), staff 40', hrs() === 500 && cnt() === 40, hrs() + '/' + cnt());
    check('the frozen snapshot is still stored underneath', !!det().calMarkers['cal_a|' + D].frozenSnap);
    check('the popup total is exactly 500 with the Override row', grand() === 500 && !!ovRow(), grand());
    await disable();
    check('disabled: the frozen schedule + Extra Shift return (38)', hrs() === 38, hrs());
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Staffing Allocation - Weeks Total row uses the day staff override ═══ */
  await suite('Staffing Allocation Weeks: the week Total row uses the saved Staff Count for the overridden date', async () => {
    await importGuide(dom, c, fixture()); await flush(800);
    // turn Staff Count ON and expand the Weeks view so the Total row renders (mirrors t118)
    const scCb = () => pl().querySelector('.sf-alloc-sc-cb');
    if (scCb()) { scCb().checked = true; $(scCb()).trigger('click'); await flush(500); if (!scCb().checked) { scCb().checked = true; $(scCb()).trigger('change'); await flush(500); } }
    const vert = pl().querySelector('td.sf-wkov-vert'); if (vert) { $(vert).trigger('click'); await flush(700); }
    const wkTot = () => { const tds = [...pl().querySelectorAll('td.sf-alloc-total-wk')]; return tds.map(td => parseInt(td.textContent, 10) || 0); };
    let before = wkTot();
    check('the Weeks table renders its Total row', pl().querySelectorAll('td.sf-alloc-total-wk').length > 0, pl().querySelectorAll('td.sf-alloc-total-wk').length);
    await pin(D); await enable(); await saveVals('500', '40'); await closePop(); await recalc(); await flush(300);
    const after = wkTot();
    // Jul 8 (Wed) is in week 1: calculated 6 replaced by 40 => +34
    check('week 1 Total reflects the override staff for Jul 8 (rises by 34: calc 6 -> 40)', after.length > 0 && after[0] === before[0] + 34, JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    check('week 2 Total unchanged (no override there)', after.length > 1 ? after[1] === before[1] : true, JSON.stringify(after));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Persistence across export/import ═══ */
  await suite('The override (values + enabled flag) survives export/import and stays authoritative on reload', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await pin(D); await enable(); await saveVals('500', '40'); await closePop();
    let captured = null; const OB = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') captured = parts[0]; return new OB(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = function () {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    W.Blob = OB; d.createElement = oc;
    check('the export carries the override with on:true', captured && JSON.stringify(JSON.parse(captured).data.calDayTotalsOv['cal_a|' + D]) === '{"hours":500,"staff":40,"on":true}');
    await importGuide(dom, c, captured); await flush(700);
    check('after re-import: cell 500 / 40, Programs 824', hrs() === 500 && cnt() === 40 && progSched() === 824, hrs() + '/' + cnt() + '/' + progSched());
    await pin(D);
    check('the control opens enabled with 500 / 40', q('.cal-tip-odt-chk').checked && q('.cal-tip-odt-hours').value === '500' && q('.cal-tip-odt-staff').value === '40');
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Highest authority: schedule changes never overwrite an active override; the row + amber survive ═══ */
  await suite('Once saved, an Override Day Total survives Special Days, Freeze, Staffing Hours and Site Breakdown changes unchanged; the breakdown Override row and the amber cal-hours colour persist; only an explicit removal clears them', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    await pin(D); await enable(); await saveVals('500', '40'); await closePop();
    const stored = JSON.stringify(det().calDayTotalsOv['cal_a|' + D]);
    // a barrage of schedule changes that would normally recalculate the day
    det().calMarkers['cal_a|' + D] = { schools: { '0': 'sd1' } }; await recalc();               // Special Day
    det().staffingHoursSlots.c0.ctkk = mkTimes('06:00', '20:00'); await recalc();                // Staffing Hours
    det().siteRowsByCal.cal_a[0].coaches_ctkk = 9; await recalc();                                // Site Breakdown
    det().calExtraShifts = { ['cal_a|' + D]: [{ school: 'Lincoln', rows: [{ role: 'ctkk', start: '16:00', end: '18:00', cnt: 1 }] }] }; await recalc();  // Extra Shift
    check('the saved override is byte-for-byte unchanged after every schedule change', JSON.stringify(det().calDayTotalsOv['cal_a|' + D]) === stored, JSON.stringify(det().calDayTotalsOv['cal_a|' + D]));
    check('the cell still reads 500 / 40', hrs() === 500 && cnt() === 40, hrs() + '/' + cnt());
    check('the cal-hours label is still amber', /154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color), cell().querySelector('.cal-hours').style.color);
    await pin(D);
    check('the breakdown Override Day Totals row is still present (with a Special Day + Extra Shift applied)', !!ovRow() && grand() === 500, grand());
    await disable();
    check('disabling recalculates the underlying (now-changed) schedule but keeps the saved values', hrs() !== 500 && det().calDayTotalsOv['cal_a|' + D].on === false, hrs());
    check('disabled: the cal-hours label is back to normal', !/154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color), cell().querySelector('.cal-hours').style.color);
    await enable();
    // explicit removal (both blank) clears the store, the row and the colour
    $(q('.cal-tip-odt-hours')).val('').trigger('input'); $(q('.cal-tip-odt-staff')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1200);
    check('explicit removal clears the stored override', !det().calDayTotalsOv['cal_a|' + D]);
    check('the Override row is gone and the label is normal', !ovRow() && !/154,\s*91,\s*0/.test(cell().querySelector('.cal-hours').style.color));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Calendar Total row above a simplified Override row; Show Breakdown on Hover header control ═══ */
  await suite('When an override is active the popup shows Calendar Total (pre-override, informational) directly above a simplified Override Day Totals row (Count + Total only); the final total is the override, not their sum', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const preH = hrs(), preC = cnt();
    await pin(D); await enable(); await saveVals('720', '42');
    const calRow = popup().querySelector('.cal-tip-calctotal-row'), ovR = popup().querySelector('.cal-tip-dayov-row');
    check('a Calendar Total row is present', !!calRow);
    check('the Calendar Total shows the pre-override calculated hours/count (matches the plain cell: ' + preH + ' / ' + preC + ')', calRow && calRow.textContent.replace(/\s+/g, '') === ('CalendarTotal' + preH + preC + preH), calRow && calRow.textContent.replace(/\s+/g, ''));
    check('the Calendar Total row sits directly ABOVE the Override Day Totals row', !!(calRow && ovR && (calRow.compareDocumentPosition(ovR) & W.Node.DOCUMENT_POSITION_FOLLOWING)));
    check('the Override row shows ONLY the Count (42) and Total (720) columns', ovR && /Override Day Totals\s*42\s*720/.test(ovR.textContent.replace(/\s+/g, ' ').trim()), ovR && ovR.textContent.replace(/\s+/g, ' ').trim());
    check('the final popup total is the override (720), NOT Calendar Total + override', grand() === 720, grand());
    await closePop();
    // partial: hours-only -> Override row shows Count as em-dash, Total = override hours; Calendar Total intact
    await pin(D); $(q('.cal-tip-odt-staff')).val('').trigger('input'); await flush(30); $(q('.cal-tip-odt-save')).trigger('click'); await flush(1100);
    const ovR2 = popup().querySelector('.cal-tip-dayov-row');
    check('HOURS-ONLY: the Override row Count is em-dash and Total is 720', ovR2 && /Override Day Totals\s*\u2014\s*720/.test(ovR2.textContent.replace(/\s+/g, ' ').trim()), ovR2 && ovR2.textContent.replace(/\s+/g, ' ').trim());
    check('the Calendar Total row is still shown', !!popup().querySelector('.cal-tip-calctotal-row'));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Show Breakdown on Hover header control ═══ */
  await suite('A "Show Breakdown on Hover" checkbox sits after Show Staff Counts, unchecked by default; hover popups are off until it is checked; the click window always works', async () => {
    importGuide._noHover = true; await importGuide(dom, c, fixture()); importGuide._noHover = false;
    W.__pgHoverDefaultOn = false;   // this suite verifies the true PRODUCTION default (hover OFF); the harness sets the flag ON for other suites
    await flush(600);
    const scLbl = [...pl().querySelectorAll('label')].find(l => /Show Staff Counts/.test(l.textContent));
    const bhLbl = [...pl().querySelectorAll('label')].find(l => /Show Breakdown on Hover/.test(l.textContent));
    check('the control is present and labelled "Show Breakdown on Hover"', !!bhLbl);
    check('it appears immediately after Show Staff Counts', !!(scLbl && bhLbl && (scLbl.compareDocumentPosition(bhLbl) & W.Node.DOCUMENT_POSITION_FOLLOWING)));
    const bhChk = bhLbl && bhLbl.querySelector('input[type="checkbox"]');
    check('it is a clickable checkbox, unchecked by default', !!bhChk && bhChk.type === 'checkbox' && bhChk.checked === false);
    // hover off by default
    // alignment: the wrap matches Show Staff Counts (same vertical alignment, weight, size)
    check('the control is vertically aligned with Show Staff Counts (same align-self / align-items / weight / size)', scLbl.style.alignSelf === bhLbl.style.alignSelf && scLbl.style.alignItems === bhLbl.style.alignItems && scLbl.style.fontWeight === bhLbl.style.fontWeight && scLbl.style.fontSize === bhLbl.style.fontSize, [bhLbl.style.alignSelf, bhLbl.style.alignItems, bhLbl.style.fontWeight, bhLbl.style.fontSize].join('/'));
    const hoverClass = () => cell().classList.contains('cal-hovered') || cell().classList.contains('cal-hovered-wknd');
    $(cell()).trigger('mouseenter'); await flush(500);
    check('with the setting OFF, the cell still gets its hover styling', hoverClass());
    check('with the setting off, hovering a cell opens NO popup', !popup());
    $(cell()).trigger('mouseleave'); await flush(200);
    check('the hover styling is removed on mouse-leave', !hoverClass());
    // click still works
    $(cell()).trigger('click'); await flush(500);
    check('the click-to-open breakdown window still works with the setting off', !!popup());
    await closePop();
    // enable
    bhChk.checked = true; $(bhChk).trigger('change'); await flush(200);
    $(cell()).trigger('mouseenter'); await flush(500);
    check('with the setting on, the cell gets the SAME hover styling', hoverClass());
    check('with the setting on, hovering opens the breakdown popup', !!popup());
    $(cell()).trigger('mouseleave'); await flush(300);
    check('the setting persists on the guide', det().showHoverBreakdown === true);
    W.__pgHoverDefaultOn = true;   // restore the harness default for any later work
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. Week exclusion outranks Override Day Totals ═══ */
  await suite('Excluding a Week temporarily suppresses any Override Day Totals in it (cell, popups, Programs, Weeks) while preserving the saved values; including the Week restores them with no re-entry', async () => {
    await importGuide(dom, c, fixture({ alloc: true, long: true })); await flush(700);
    const D2 = '2026-07-15', MON = '2026-07-13';
    await pin(D2); await enable(); await saveVals('500', '40'); await closePop(); await recalc();
    check('override active: cell 500 / 40', hrs(D2) === 500 && cnt(D2) === 40, hrs(D2) + '/' + cnt(D2));
    const schedWith = progSched();
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    const schedExcl = progSched();
    check('the week is excluded', W._pgWeekVis.excluded('pg-001', 'cal_a', MON));
    const t = cell(D2).querySelector('.cal-hours').textContent.trim();
    check('EXCLUDED: the override Hours no longer show in the cell (blank/0)', t === '' || /^0/.test(t), t);
    check('EXCLUDED: the override Staff Count no longer shows (0/blank)', !cnt(D2), String(cnt(D2)));
    check('EXCLUDED: the saved override is preserved, still on:true 500/40', JSON.stringify(det().calDayTotalsOv['cal_a|' + D2]) === '{"hours":500,"staff":40,"on":true}', JSON.stringify(det().calDayTotalsOv['cal_a|' + D2]));
    // excluding the week removes BOTH the 500 override AND that week's own school hours; the key point is
    // that the override no longer contributes - the total is strictly less than (with-override - 500)
    check('EXCLUDED: Programs drops by at least the 500 override (override no longer contributes)', schedExcl <= schedWith - 500, schedWith + ' -> ' + schedExcl);
    $(cell(D2)).trigger('click'); await flush(600);
    check('EXCLUDED: the breakdown Override Day Totals row is gone', !popup().querySelector('.cal-tip-dayov-row'));
    await closePop();
    W._pgWeekVis.toggle('pg-001', 'cal_a', MON); await flush(1000); await recalc();
    check('INCLUDED: the override returns without re-entry (cell 500 / 40)', hrs(D2) === 500 && cnt(D2) === 40, hrs(D2) + '/' + cnt(D2));
    check('INCLUDED: Programs is back to the with-override figure', progSched() === schedWith, progSched());
    $(cell(D2)).trigger('click'); await flush(600);
    check('INCLUDED: the breakdown Override row is restored', !!popup().querySelector('.cal-tip-dayov-row'));
    await closePop();
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
