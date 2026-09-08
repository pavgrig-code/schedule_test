// t126_propagation_chains.js — Global requirement: rigorous calculation, propagation, performance
// and reliability testing. Boots ONE rich guide (2 programs, 3 schools, 2 roles, a Min Day special
// day, a discount stage) and, after EVERY mutation, reconciles every surface that shows the same
// value against an INDEPENDENT oracle computed from the stored guide data (single source of truth):
//   Programs table row | __pgCalc | Program Summary card | Planning Guide Summary | calendar day
//   cells | hourly breakdown | Days/Rotation/Weeks counts + their popups | Amount breakdown popup |
//   Remaining Hours breakdown popup | Discounts table.
// Each reconciliation reports the exact surface, calendar, school, date and figures that disagree.
// Run a subset with SUITES=1,3,7 node t126_propagation_chains.js
'use strict';
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0; const defects = [];
const ONLY = process.env.SUITES ? process.env.SUITES.split(',').map(Number) : null;
function check(name, cond, diag) {
  if (cond) { pass++; return true; }
  fail++; console.log('  [FAIL] ' + name + (diag !== undefined ? '\n         ' + (typeof diag === 'string' ? diag : JSON.stringify(diag)) : ''));
  defects.push({ test: name, diag: diag }); return false;
}
async function suite(n, name, fn) {
  if (ONLY && ONLY.indexOf(n) < 0) return;
  suites++; console.log('\u2500 ' + n + '. ' + name); const t0 = Date.now();
  try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); defects.push({ test: name, threw: String(e && e.message || e) }); }
  console.log('   (' + (Date.now() - t0) + 'ms)');
}
const mkT = (s, e) => ({ start: s, end: e });
const r2 = x => Math.round(x * 100) / 100;
const near = (a, b, eps) => Math.abs(a - b) < (eps == null ? 0.005 : eps);
const num = t => { const m = String(t == null ? '' : t).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

/* ─────────────────────────── fixture ─────────────────────────── */
function fx(extra) {
  const wk = { 'sd-minday': mkT('13:00', '17:00'), mon: mkT('14:00', '18:00'), tue: mkT('14:00', '18:00'), wed: mkT('14:00', '18:00'), thu: mkT('14:00', '18:00'), fri: mkT('14:00', '17:45') };
  const smwk = { mon: mkT('13:30', '18:30'), tue: mkT('13:30', '18:30'), wed: mkT('13:30', '18:30'), thu: mkT('13:30', '18:30'), fri: mkT('13:30', '18:30') };
  const rowsA = [
    { school: 'Lincoln', schoolId: 'a1', coaches_ctkk: 5, ctkk: 50, sm: 1 },
    { school: 'Roosevelt', schoolId: 'a2', coaches_ctkk: 3, ctkk: 30, sm: 1 },
    { school: 'Jefferson', schoolId: 'a3', coaches_ctkk: 2, ctkk: 20, sm: 0 }];
  const rowsB = [{ school: 'Adams', schoolId: 'b1', coaches_ctkk: 4, ctkk: 40, sm: 1 }];
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'Chains', status: 'Draft' }, data: Object.assign({
    status: 'Draft', combinedView: false,
    specialDays: [{ id: 'sd-minday', name: 'Min Day', color: 'rgb(226,244,247)', noHours: false }, { id: 'sd-hol', name: 'Holiday', color: 'rgb(255,220,220)', noHours: true }],
    calendarRows: [
      { name: 'After School', calId: 'cal_a', firstDay: '2026-08-03', lastDay: '2026-08-28', color: '#e57373', pricePerHour: '80.30', billable: true },
      { name: 'Intersession', calId: 'cal_b', firstDay: '2027-01-04', lastDay: '2027-01-15', color: '#64b5f6', pricePerHour: '95.00', billable: true }],
    siteRows: rowsA, siteRowsByCal: { cal_a: rowsA, cal_b: rowsB },
    staffingOptsByCal: { cal_a: { bySchool: false, byPods: false, alternateWeeks: false }, cal_b: { bySchool: false } },
    staffingHoursSlots: { c0: { ctkk: wk, sm: smwk }, c1: { ctkk: wk, sm: smwk } },
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }, { key: 'sm', name: 'SM', isCoach: false, spc: 0 }],
    unschedByCal: { cal_a: { unalloc: '100', rows: [{ date: '2026-08-05', total: '12.5', notes: 'PD' }, { date: '', total: '7.25', notes: 'undated' }] }, cal_b: { unalloc: '', rows: [] } },
    discounts: { names: ['Promo', '', '', '', ''], stages: [{ byCal: { cal_a: { name: 'Promo', pct: '7.5' } } }] }, districtFloor: '74.00'
  }, extra || {}) });
}

/* ─────────────────────────── independent oracle ─────────────────────────── */
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function mondayIso(iso) { const d = new Date(iso + 'T00:00:00'); const w = d.getDay(); d.setDate(d.getDate() + (w === 0 ? -6 : 1 - w)); return isoOf(d); }
function weekIndex(firstDay, iso) { return Math.round((new Date(mondayIso(iso) + 'T00:00:00') - new Date(mondayIso(firstDay) + 'T00:00:00')) / 6048e5); }
function calcH(tm) { if (!tm || !tm.start || !tm.end) return 0; const p = s => { const a = String(s).split(':'); return parseInt(a[0]) * 60 + (parseInt(a[1]) || 0); }; const em = p(tm.end), sm = p(tm.start); return em > sm ? r2((em - sm) / 60) : 0; }
function breakMins(cr, raw) { const rows = (Array.isArray(cr.mealBreaks) && cr.mealBreaks.length) ? cr.mealBreaks : [{ hours: 5, mins: 30 }, { hours: 10, mins: 60 }]; let best = null; rows.forEach(r => { const h = parseFloat(r.hours), m = parseInt(r.mins); if (isNaN(h) || isNaN(m)) return; if (raw > h && (best === null || h > best.h)) best = { h, m }; }); return best ? best.m : 0; }
function adjH(cr, raw) { if (cr.billable === false) { const v = r2(raw - breakMins(cr, raw) / 60); return v < 0 ? 0 : v; } return raw; }
function netPrice(det, calId, price) {
  const floor = parseFloat(det.districtFloor); const fl = isFinite(floor) ? floor : 0;
  const below = price > 0 && fl > 0 && price < fl; const maxCum = (price > 0 && fl > 0) ? Math.max(0, (1 - fl / price) * 100) : 100;
  let cum = 0; ((det.discounts && det.discounts.stages) || []).forEach(st => { const sl = st && st.byCal && st.byCal[calId]; const iv = sl ? parseFloat(sl.pct) : NaN; const intended = (isFinite(iv) && iv > 0) ? iv : 0; let eff = 0; if (!below && intended > 0) eff = Math.min(intended, Math.max(0, maxCum - cum)); eff = Math.round(eff * 1e6) / 1e6; cum = Math.round((cum + eff) * 1e6) / 1e6; });
  return r2(price * (1 - cum / 100));
}
// Effective {tm,cnt} for one school/role on one date, walking the hierarchy the app documents:
// Base -> per-school count override -> Rotation Week (day off, schedule override) -> Weeks
// override / rotation participation -> Calendar Day override; gated by allocation + Special Days.
function oracleCal(W, det, calId, gid) {
  gid = gid || 'pg-001';
  const ci = det.calendarRows.findIndex(r => r.calId === calId); const cr = det.calendarRows[ci];
  const rows = (det.siteRowsByCal && det.siteRowsByCal[calId]) || det.siteRows || [];
  const opts = (det.staffingOptsByCal && det.staffingOptsByCal[calId]) || {};
  const slots = det.staffingHoursSlots || {};
  const roles = (det.roles || []).map(r => ({ key: r.key, countKey: r.isCoach ? 'coaches_' + r.key : r.key }));
  const alloc = det.staffAlloc && det.staffAlloc['c' + ci];
  const rot = det.wkRot && det.wkRot[calId]; const wkOv = det.wkOv && det.wkOv[calId]; const wkHrs = det.wkRotHrs && det.wkRotHrs[calId];
  const excl = det.wkExcl && det.wkExcl[calId];
  const rotLen = si => { if (!rot || !rot.cells) return 0; let w = 1; while (rot.cells[si + '|' + w] !== undefined) w++; return w - 1; };
  const rotWeek = (si, iso) => { const len = rotLen(si); if (!len) return 0; const wi = weekIndex(cr.firstDay, iso); if (wi < 0) return 0; let eff = 0; if (excl) { const base = mondayIso(cr.firstDay); for (let j = 0; j <= wi; j++) { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + j * 7); const ex = excl[isoOf(d)] === true; if (j === wi) { if (ex) return 0; break; } if (!ex) eff++; } } else eff = wi; return (eff % len) + 1; };
  const out = { calId, ci, price: parseFloat(cr.pricePerHour) || 0, schools: [], byDate: {}, dateCnt: {}, dateRows: {} };
  const d0 = new Date(cr.firstDay + 'T00:00:00'), d1 = new Date(cr.lastDay + 'T00:00:00');
  rows.forEach((sr, si) => {
    let tot = 0; const name = (sr.school || '').trim() || ('School ' + (si + 1));
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const iso = isoOf(d); const dow = DOW[d.getDay()]; let srcKey = dow; let noHours = false;
      const mk = det.calMarkers && det.calMarkers[calId + '|' + iso]; const sdId = mk && mk.schools && mk.schools[String(si)];
      if (sdId) { const sd = (det.specialDays || []).find(s => s.id === sdId); if (sd) { if (sd.noHours) noHours = true; else srcKey = sd.id; } }
      if (noHours) continue;
      if (alloc && alloc.on && alloc.cells && alloc.cells[si + '|' + srcKey] === false) continue;
      const ov = wkOv && wkOv[si + '|' + mondayIso(iso)]; const w = rotWeek(si, iso);
      if (ov === false) continue;
      if (ov !== true && w && rot.cells[si + '|' + w] === false) continue;
      const base = slots[(opts.bySchool ? ('s' + si) : '') + 'c' + ci] || {};
      const pslot = slots['s' + si + 'c' + ci] || null;
      let dayCnt = 0;
      roles.forEach(role => {
        let cnt = parseInt(sr[role.countKey]) || 0;
        const so = pslot && pslot[role.key] && pslot[role.key][srcKey]; if (so && so.cnt != null && so.cnt !== '') cnt = parseInt(so.cnt) || 0;
        let tm = base[role.key] && base[role.key][srcKey] ? { start: base[role.key][srcKey].start || '', end: base[role.key][srcKey].end || '' } : { start: '', end: '' };
        if (w) {
          if (W._pgAllocRotDayDisabled(gid, calId, si, w, srcKey)) tm = { start: '', end: '' };
          else if (!sdId) { const ho = wkHrs && wkHrs[si + '|' + w + '|' + role.key + '|' + dow]; if (ho) { if (ho.start != null) tm.start = ho.start; if (ho.end != null) tm.end = ho.end; if (ho.count != null) cnt = parseInt(ho.count) || 0; } }
        }
        const co = det.calCellOverrides && det.calCellOverrides[calId + '|' + iso + '|' + si + '|' + role.key];
        if (co) { if (co.start != null) tm.start = co.start; if (co.end != null) tm.end = co.end; if (co.cnt != null) cnt = parseInt(co.cnt) || 0; if (co.del) cnt = 0; }
        if (!cnt || !tm.start || !tm.end) return;
        const h = adjH(cr, calcH(tm)); if (h > 0) { tot += h * cnt; dayCnt += cnt; out.byDate[iso] = r2((out.byDate[iso] || 0) + h * cnt); (out.dateRows[iso] = out.dateRows[iso] || []).push({ si, role: role.key, h, cnt, total: r2(h * cnt) }); }
      });
      out.dateCnt[iso] = (out.dateCnt[iso] || 0) + dayCnt;
    }
    // Extra Shifts for this school
    const xs = det.calExtraShifts || {};
    Object.keys(xs).forEach(k => { if (k.indexOf(calId + '|') !== 0) return; const dk = k.slice(calId.length + 1); if (dk < cr.firstDay || dk > cr.lastDay) return; (xs[k] || []).forEach(s => { if (!s || String(s.school).trim() !== name) return; (s.rows || []).forEach(rw => { if (!rw || !rw.role) return; const raw = calcH(rw); const c = parseInt(rw.cnt); if (!raw || isNaN(c) || c <= 0) return; const h = adjH(cr, raw); const t = r2(h * c); tot += t; out.byDate[dk] = r2((out.byDate[dk] || 0) + t); out.dateCnt[dk] = (out.dateCnt[dk] || 0) + c; }); }); });
    out.schools.push({ si, name, hours: r2(tot) });
  });
  const un = (det.unschedByCal || {})[calId]; const pool = un ? parseFloat(un.unalloc) : NaN;
  const hasPool = isFinite(pool) && pool > 0;
  const allocT = hasPool ? r2(((un && un.rows) || []).reduce((a, r) => { const v = parseFloat(r && r.total); return a + ((isFinite(v) && v > 0) ? v : 0); }, 0)) : 0;
  out.allocByDate = {}; if (hasPool) ((un && un.rows) || []).forEach(r => { const v = parseFloat(r && r.total); if (r && r.date && isFinite(v) && v > 0) out.allocByDate[r.date] = r2((out.allocByDate[r.date] || 0) + v); });
  out.staffing = r2(out.schools.reduce((a, s) => a + s.hours, 0));
  out.sched = r2(out.staffing + allocT); out.allocT = allocT; out.pool = hasPool ? pool : 0;
  out.rem = r2(out.pool - allocT); out.total = r2(out.sched + out.rem);
  out.amount = r2(out.price * out.total); out.netP = netPrice(det, calId, out.price);
  out.netAmt = r2(out.total * out.netP); out.savings = r2(out.amount - out.netAmt);
  let mx = 0; Object.keys(out.dateCnt).forEach(k => { if (out.dateCnt[k] > mx) mx = out.dateCnt[k]; }); out.maxCnt = mx;
  return out;
}

/* ─────────────────────────── boot + surface readers ─────────────────────────── */
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(2400); d.createElement = ocr;
}
function mkEnv(dom) {
  const W = dom.window; const c = ctx(dom); const { d, $ } = c; const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const calTbl = () => [...pl().querySelectorAll('table')].find(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /Meal Breaks/.test(c2.textContent)));
  const hs = () => [...calTbl().querySelectorAll('thead th')].map(x => x.textContent.trim());
  const pcRow = calId => { const cr = det().calendarRows.find(r => r.calId === calId); return [...calTbl().querySelectorAll('tbody tr')].find(r => { const nm = r.children[hs().indexOf('Name')]; const i = nm && nm.querySelector('input'); return !!i && i.value.trim() === cr.name; }); };
  const pc = (calId, col) => { const r = pcRow(calId); return r ? num(r.children[hs().indexOf(col)].textContent) : NaN; };
  const pcInput = (calId, col) => pcRow(calId).children[hs().indexOf(col)].querySelector('input');
  const pgTotRow = () => calTbl().querySelector('tfoot tr') || [...calTbl().querySelectorAll('tr')].find(r => /Planning Guide \(/.test(r.textContent));
  const calc = () => d.getElementById('summary-section-pg-001').__pgCalc;
  const calcCal = calId => calc().calendars.find(x => x.calId === calId);
  const sumCard = calId => pl().querySelector('[data-summary-cal="' + calId + '"]');
  const sumSchools = calId => { const card = sumCard(calId); const hdr = [...card.querySelectorAll('thead th')].map(t => t.textContent.trim()); const nI = hdr.indexOf('School Name'), hI = hdr.indexOf('Hours'), pI = hdr.indexOf('PPH (Net)'), aI = hdr.indexOf('Amount'); return [...card.querySelectorAll('tbody tr')].filter(r => r.children.length >= 5 && /^\d+$/.test((r.children[nI - 1 + (r.children.length - hdr.length)] || {}).textContent || '')).map(r => { const off = r.children.length - hdr.length; return { name: r.children[nI + off].textContent.trim(), hours: num(r.children[hI + off].textContent), pph: num(r.children[pI + off].textContent), amount: num(r.children[aI + off].textContent), amtText: r.children[aI + off].textContent.trim() }; }); };
  const sumRow = (calId, re) => { const card = sumCard(calId); return [...card.querySelectorAll('tbody tr')].find(r => re.test(r.textContent)); };
  const sumRowVals = (calId, re) => { const r = sumRow(calId, re); if (!r) return null; const n = r.children.length; return { hours: num(r.children[n - 3].textContent), pph: num(r.children[n - 2].textContent), amount: num(r.children[n - 1].textContent), amtText: r.children[n - 1].textContent.trim() }; };
  const gCard = () => d.querySelector('[data-guide-summary]');
  const gRows = () => [...gCard().querySelectorAll('tbody tr')].map(r => ({ name: r.children[0].textContent.trim(), hours: num(r.children[r.children.length - 3].textContent), pph: num(r.children[r.children.length - 2].textContent), amount: num(r.children[r.children.length - 1].textContent), amtText: r.children[r.children.length - 1].textContent.trim() }));
  const gRow = calId => { const cr = det().calendarRows.find(r => r.calId === calId); return gRows().find(r => r.name === cr.name); };
  const gTot = () => gRows().find(r => /Planning Guide/.test(r.name));
  const dayCells = calId => { const ci = det().calendarRows.findIndex(r => r.calId === calId); return [...pl().querySelectorAll('.cal-day-cell:not(.cal-combined-carrier)[data-date-key][data-cal-orig-idx="' + ci + '"]')]; };
  const dayHrs = (calId, iso) => { const c2 = dayCells(calId).find(x => x.getAttribute('data-date-key') === iso); if (!c2) return NaN; const h = c2.querySelector('.cal-hours'); const v = h ? num(h.textContent) : 0; return isNaN(v) ? 0 : v; };
  const dayCnt = (calId, iso) => { const c2 = dayCells(calId).find(x => x.getAttribute('data-date-key') === iso); return c2 ? (parseInt(c2.getAttribute('data-eff-cnt'), 10) || 0) : NaN; };
  const tipFor = async (calId, iso) => { const c2 = dayCells(calId).find(x => x.getAttribute('data-date-key') === iso); $(c2).trigger('mouseenter'); await flush(500); const t = d.querySelector('.cal-hours-breakdown'); return { cell: c2, tip: t }; };
  const tipClose = async (c2) => { $(c2).trigger('mouseleave'); await flush(120); };
  const allocTbl = calId => { const ci = det().calendarRows.findIndex(r => r.calId === calId); const toggles = [...pl().querySelectorAll('.sf-alloc-toggle-cb')]; const sec = toggles[ci] && toggles[ci].closest('.sf-cal-section'); return sec ? sec.querySelector('.sf-alloc-table') : [...pl().querySelectorAll('.sf-alloc-table')][ci]; };
  const allocOn = async (calId) => { const ci = det().calendarRows.findIndex(r => r.calId === calId); const cb = [...pl().querySelectorAll('.sf-alloc-toggle-cb')][ci]; if (cb && !cb.checked) { $(cb).prop('checked', true).trigger('change'); await flush(700); } const t = allocTbl(calId); const sc = t && t.querySelector('.sf-alloc-sc-cb'); if (sc && !sc.checked) { $(sc).prop('checked', true).trigger('change'); await flush(500); } };
  const allocCellCnt = (calId, si, day) => { const t = allocTbl(calId); const c2 = t && t.querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + day + '"]'); const s = c2 && c2.querySelector('.sf-cell-cnt'); return s ? num(s.textContent) : 0; };
  const allocCb = (calId, si, day) => { const t = allocTbl(calId); return t && t.querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + day + '"] input.sf-alloc-cb'); };
  const setDay = async (calId, si, day, on) => { const cb = allocCb(calId, si, day); if (!cb) throw new Error('no alloc cb ' + calId + ' ' + si + ' ' + day); if (cb.checked === on) return; cb.checked = on; $(cb).trigger('change'); await flush(600); };
  const discSec = () => d.getElementById('discounts-section-pg-001');
  const discExpand = async () => { const t = discSec().querySelector('.pg-sec-toggle'); if (t && t.getAttribute('aria-expanded') === 'false') { $(t).trigger('click'); await flush(300); } };
  const discRow = calId => discSec().querySelector('tbody tr[data-disc-cal="' + calId + '"]');
  const discVal = (calId, cls, i) => { const r = discRow(calId); if (!r) return NaN; const l = [...r.querySelectorAll('td.' + cls)]; return l[i || 0] ? num(l[i || 0].textContent) : NaN; };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { try { if (fn()) return Date.now() - t0; } catch (e) {} await flush(15); } return -1; };
  // Settle = the whole visible chain has stopped moving: __pgCalc + EVERY calendar cell's hours and staff
  // count, sampled until three consecutive reads agree (the calendar repaint lands ~300ms after a burst
  // through the 80ms count timer + the ~150ms _updateHours pass; one quiet sample is not proof).
  const settle = async () => { let last = null, same = 0; await flush(200); for (let i = 0; i < 60; i++) { const s = JSON.stringify(calc()) + '|' + [...pl().querySelectorAll('.cal-hours')].map(x => x.textContent).join(',') + '|' + [...pl().querySelectorAll('.cal-day-cell[data-eff-cnt]')].map(x => x.getAttribute('data-eff-cnt')).join(','); if (s === last) { if (++same >= 2) return; } else same = 0; last = s; await flush(140); } };
  const noNaN = () => !/NaN/.test(pl().textContent);
  const errs = () => dom.pageErrors.length + dom.consoleErrors.length;
  return { dom, W, c, d, $, pl, det, calTbl, hs, pcRow, pc, pcInput, pgTotRow, calc, calcCal, sumCard, sumSchools, sumRow, sumRowVals, gCard, gRows, gRow, gTot, dayCells, dayHrs, dayCnt, tipFor, tipClose, allocTbl, allocOn, allocCellCnt, allocCb, setDay, discSec, discExpand, discRow, discVal, until, settle, noNaN, errs };
}

/* ─────────────────────────── the reconciliation ───────────────────────────
   For every calendar: oracle vs Programs row vs __pgCalc vs Summary card vs PG Summary vs the
   day cells (sum + per date) vs Staff/Day (Max). Also the internal invariants: summary school
   rows sum to the Scheduled row; Total = Scheduled + Remaining; Amount(Net) = Total x PPH(Net);
   PG Summary total = sum of program rows. */
function reconcile(E, label, opts) {
  opts = opts || {}; const det = E.det(); const problems = [];
  const P = (surface, calId, what, exp, act, extra) => problems.push(Object.assign({ surface, calId, what, expected: exp, actual: act }, extra || {}));
  det.calendarRows.forEach(cr => {
    const calId = cr.calId; const o = oracleCal(E.W, det, calId);
    // Programs table
    const pcS = E.pc(calId, 'Scheduled Hrs'), pcR = E.pc(calId, 'Remaining Hrs'), pcT = E.pc(calId, 'Total'), pcA = E.pc(calId, 'Amount'), pcN = E.pc(calId, 'PPH (Net)'), pcAN = E.pc(calId, 'Amount (Net)'), pcMx = E.pc(calId, 'Staff/Day (Max)');
    if (!near(pcS, o.sched)) P('Programs Scheduled Hrs', calId, 'scheduled', o.sched, pcS);
    if (!near(pcR, o.rem)) P('Programs Remaining Hrs', calId, 'remaining', o.rem, pcR);
    if (!near(pcT, o.total)) P('Programs Total', calId, 'total', o.total, pcT);
    if (!near(pcA, o.amount)) P('Programs Amount', calId, 'amount', o.amount, pcA);
    if (!near(pcN, o.netP)) P('Programs PPH (Net)', calId, 'netPph', o.netP, pcN);
    if (!near(pcAN, o.netAmt)) P('Programs Amount (Net)', calId, 'netAmount', o.netAmt, pcAN);
    if (!opts.skipMax && !(isNaN(pcMx) && o.maxCnt === 0) && pcMx !== o.maxCnt) P('Programs Staff/Day (Max)', calId, 'maxCnt', o.maxCnt, pcMx);
    // __pgCalc
    const cc = E.calcCal(calId);
    if (!cc) P('__pgCalc', calId, 'calendar present', true, false);
    else {
      if (!near(cc.staffingHours, o.sched)) P('__pgCalc.staffingHours', calId, 'scheduled', o.sched, cc.staffingHours);
      if (!near(cc.allocatedHours, o.allocT)) P('__pgCalc.allocatedHours', calId, 'allocated', o.allocT, cc.allocatedHours);
      if (!near(cc.unallocatedHours, o.rem)) P('__pgCalc.unallocatedHours', calId, 'remaining', o.rem, cc.unallocatedHours);
      if (!near(cc.totalHours, o.total)) P('__pgCalc.totalHours', calId, 'total', o.total, cc.totalHours);
      if (!near(cc.amount, o.amount)) P('__pgCalc.amount', calId, 'amount', o.amount, cc.amount);
      o.schools.forEach(s => { const cs = cc.schools.find(x => x.name === s.name); if (s.hours > 0 && (!cs || !near(cs.hours, s.hours))) P('__pgCalc.schools', calId, 'school hours', s.hours, cs && cs.hours, { school: s.name }); if (s.hours === 0 && cs) P('__pgCalc.schools', calId, 'zero-hour school listed', 'absent', cs.hours, { school: s.name }); });
    }
    // Summary card
    const ss = E.sumSchools(calId);
    o.schools.forEach(s => { const row = ss.find(x => x.name === s.name); if (s.hours > 0) { if (!row) P('Summary school row', calId, 'row present', s.hours, 'missing', { school: s.name }); else { if (!near(row.hours, s.hours)) P('Summary school Hours', calId, 'school hours', s.hours, row.hours, { school: s.name }); if (!near(row.pph, o.netP)) P('Summary school PPH (Net)', calId, 'netPph', o.netP, row.pph, { school: s.name }); if (!near(row.amount, r2(s.hours * o.netP))) P('Summary school Amount', calId, 'hours x netPph', r2(s.hours * o.netP), row.amount, { school: s.name }); } } else if (row) P('Summary school row', calId, 'zero-hour school listed', 'absent', row.hours, { school: s.name }); });
    const sched = E.sumRowVals(calId, /Scheduled Hours/); const remRow = E.sumRowVals(calId, /Unallocated \(Remaining\)/); const totRow = E.sumRowVals(calId, /^\s*Total\s*$|\bTotal\b(?!.*(Scheduled|Unallocated))/);
    if (!sched) P('Summary Scheduled row', calId, 'present', true, false); else { if (!near(sched.hours, o.sched)) P('Summary Scheduled Hours', calId, 'scheduled', o.sched, sched.hours); if (!near(sched.amount, r2(o.sched * o.netP))) P('Summary Scheduled Amount', calId, 'sched x netPph', r2(o.sched * o.netP), sched.amount); }
    const sumSchoolHrs = r2(ss.reduce((a, r) => a + r.hours, 0)); if (sched && !near(sumSchoolHrs + o.allocT, sched.hours)) P('Summary reconciliation', calId, 'school rows + allocated == Scheduled', r2(sumSchoolHrs + o.allocT), sched.hours);
    if (o.pool > 0) { if (!remRow) P('Summary Remaining row', calId, 'present when pool>0', true, false); else if (!near(remRow.hours, o.rem)) P('Summary Remaining Hours', calId, 'remaining', o.rem, remRow.hours); }
    const gr = E.gRow(calId); if (!gr) P('PG Summary program row', calId, 'present', true, false); else { if (!near(gr.hours, o.total)) P('PG Summary Hours', calId, 'total', o.total, gr.hours); if (!near(gr.pph, o.netP)) P('PG Summary PPH (Net)', calId, 'netPph', o.netP, gr.pph); if (!near(gr.amount, o.netAmt)) P('PG Summary Amount', calId, 'netAmount', o.netAmt, gr.amount); }
    // day cells: per date (staffing + dated allocations) and their sum
    let cellSum = 0; const cells = E.dayCells(calId);
    if (!cells.length) P('Calendar day cells', calId, 'rendered', '>0', 0);
    cells.forEach(c2 => { const iso = c2.getAttribute('data-date-key'); const exp = r2((o.byDate[iso] || 0) + (o.allocByDate[iso] || 0)); const act = E.dayHrs(calId, iso); cellSum = r2(cellSum + act); if (!near(act, exp)) P('Calendar day cell', calId, 'day hours', exp, act, { date: iso }); const expC = o.dateCnt[iso] || 0; const actC = E.dayCnt(calId, iso); if (!opts.skipMax && expC !== actC) P('Calendar day staff count (data-eff-cnt)', calId, 'day staff count', expC, actC, { date: iso }); });
    const datedAlloc = r2(Object.keys(o.allocByDate).reduce((a, k) => a + o.allocByDate[k], 0));
    if (cells.length && !near(cellSum, r2(o.staffing + datedAlloc))) P('Calendar day cells SUM', calId, 'sum of day cells == staffing + dated allocations', r2(o.staffing + datedAlloc), cellSum);
  });
  // PG totals
  const dets = det.calendarRows.map(cr => oracleCal(E.W, det, cr.calId));
  const gt = E.gTot(); const expH = r2(dets.reduce((a, o) => a + o.total, 0)), expA = r2(dets.reduce((a, o) => a + o.netAmt, 0));
  if (!gt) P('PG Summary total row', '*', 'present', true, false); else { if (!near(gt.hours, expH)) P('PG Summary total Hours', '*', 'sum of programs', expH, gt.hours); if (!near(gt.amount, expA)) P('PG Summary total Amount', '*', 'sum of program net amounts', expA, gt.amount); const rowsSum = r2(E.gRows().filter(r => !/Planning Guide/.test(r.name)).reduce((a, r) => a + r.amount, 0)); if (!near(rowsSum, gt.amount)) P('PG Summary total vs its rows', '*', 'displayed rows sum to displayed total', rowsSum, gt.amount); }
  const tr = E.pgTotRow(); if (tr) { const th = num(E.$(tr).find('td.pg-cal-total-hours').text()), ta = num(E.$(tr).find('td.pg-cal-total-amount').text()); if (!near(th, expH)) P('Programs total row Hours', '*', 'sum', expH, th); const expBase = r2(dets.reduce((a, o) => a + o.amount, 0)); if (!near(ta, expBase)) P('Programs total row Amount', '*', 'sum of base amounts', expBase, ta); }
  if (!near(E.calc().totals.hours, expH)) P('__pgCalc.totals.hours', '*', 'sum', expH, E.calc().totals.hours);
  if (!E.noNaN()) P('panel text', '*', 'no NaN', 'none', 'NaN present');
  const ok = check(label + ' — every surface reconciles with the oracle and with each other', problems.length === 0, problems.length ? { label, problems: problems.slice(0, 12), more: problems.length > 12 ? problems.length - 12 : 0 } : undefined);
  return { ok, problems, oracle: dets };
}
// A byte-level signature of every visible figure, for exact-restoration checks.
function sig(E) { const det = E.det(); const o = {}; det.calendarRows.forEach(cr => { const id = cr.calId; o[id] = { pc: ['Scheduled Hrs', 'Remaining Hrs', 'Total', 'Amount', 'PPH (Net)', 'Amount (Net)', 'Staff/Day (Max)'].map(c => E.pc(id, c)), sum: E.sumSchools(id), sched: E.sumRowVals(id, /Scheduled Hours/), cells: E.dayCells(id).map(c2 => c2.getAttribute('data-date-key') + ':' + E.dayHrs(id, c2.getAttribute('data-date-key')) + ':' + E.dayCnt(id, c2.getAttribute('data-date-key'))) }; }); o.g = E.gRows(); o.calc = E.calc(); return JSON.stringify(o); }

/* ─────────────────────────── driver ─────────────────────────── */
(async () => {
  const dom = bootApp(); await whenReady(dom); await flush(400);
  const E = mkEnv(dom); const { W, d, $, pl } = E;
  await importGuide(dom, E.c, fx()); await flush(1500); await E.settle();
  const A = 'cal_a', B = 'cal_b';
  const sbTbl = calId => { const ci = E.det().calendarRows.findIndex(r => r.calId === calId); return [...pl().querySelectorAll('table')].filter(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /# of Coaches/.test(c2.textContent)))[ci]; };
  const sbInput = (calId, si, colRe) => { const t = sbTbl(calId); const hdr2 = [...t.rows[1].cells].map(c2 => c2.textContent.trim()); const hdr1 = [...t.rows[0].cells].map(c2 => c2.textContent.trim()); const row = t.rows[2 + si]; const inputs = [...row.querySelectorAll('input')]; return inputs.find(i => { const td = i.closest('td'); return colRe.test(td.parentElement === row ? (td.getAttribute('data-role-key') || '') + td.textContent : ''); }) || null; };
  // Site Breakdown count input for a role: locate by the input's own position under the "# of Coaches"/"SM" group
  const sbCountInput = (calId, si, roleKey) => { const t = sbTbl(calId); const row = t.rows[2 + si]; const ins = [...row.querySelectorAll('input')]; const ed = ins.filter(i => !i.readOnly && !i.disabled); const rk = E.det().roles.findIndex(r => r.key === roleKey); const role = E.det().roles[rk]; if (ed.length === 4) return role.isCoach ? ed[2] : ed[3]; return role.isCoach ? ins[3] : ins[5]; };
  const shTables = () => [...pl().querySelectorAll('table')].filter(x => { const h = x.rows[0] && [...x.rows[0].cells].map(c2 => c2.textContent.trim()).join(','); if (!h || !/^Role,,Min Day,Monday/.test(h)) return false; let el = x; while (el && el.id !== 'planning-panel') { if ($(el).css('display') === 'none') return false; el = el.parentElement; } return true; });
  const shTable = calId => { const ci = E.det().calendarRows.findIndex(r => r.calId === calId); const toggles = [...pl().querySelectorAll('.sf-alloc-toggle-cb')]; const sec = toggles[ci] && toggles[ci].closest('.sf-cal-section'); const inSec = sec ? shTables().filter(t => sec.contains(t)) : []; return inSec.find(t => t.querySelector('input')) || shTables()[ci]; };
  const roleRow = (tbl, label, sub) => { for (const r of tbl.rows) { if (r.cells.length >= 9 && r.cells[0].textContent.trim() === label && r.cells[1].textContent.trim() === sub) return r; } return null; };
  const dayColIdx = (tbl, dayLabel) => [...tbl.rows[0].cells].findIndex(c2 => c2.textContent.trim() === dayLabel);
  const setTime = async (cell, val) => { const $inp = $(cell).find('input'); $inp.trigger('focus'); await flush(10); $inp.val(val).trigger('input'); const e = $.Event('keydown'); e.key = 'Enter'; $inp.trigger(e); await flush(40); };
  const timeCell = (calId, roleLabel, which, dayLabel) => { const t = shTable(calId); const sr = roleRow(t, roleLabel, 'Start Time'); const ci = dayColIdx(t, dayLabel); if (which === 'start') return sr.cells[ci]; return sr.nextElementSibling.cells[ci - 1]; };
  const closePops = async () => { [...d.querySelectorAll('.alloc-day-hours-dd,.alloc-rotweek-hours-dd,.alloc-week-hours-dd,.pg-amt-break-dd,.pg-rem-break-dd')].forEach(p => { const x = [...p.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (x) x.click(); else p.remove(); }); await flush(80); };

  /* ═══ 1. Baseline ═══ */
  await suite(1, 'Baseline: every surface reconciles with the independent oracle immediately after import', async () => {
    const r = reconcile(E, 'import baseline');
    const o = r.oracle[0];
    // Independent arithmetic spelled out: 20 weekdays; Mon-Thu 4h, Fri 3.75h coaches; SM 5h Mon-Fri.
    // Lincoln 5 coaches: 5x(16x4+4x3.75)=5x79=395, SM 1x100 -> 495. Roosevelt 3x79+100=337. Jefferson 2x79=158.
    check('oracle sanity: cal_a staffing = 495+337+158 = 990 (Fri 14:00-17:45 = 3.75h)', o.staffing === 990, o.staffing);
    check('oracle sanity: cal_a pool 100, allocated 19.75 (12.5 dated + 7.25 undated) -> Scheduled 1009.75, Remaining 80.25, Total 1090', o.sched === 1009.75 && o.rem === 80.25 && o.total === 1090, [o.sched, o.rem, o.total].join('/'));
    check('oracle sanity: 7.5% off $80.30 = $74.28 (floor 74 not reached); Amount(Net) = 1090 x 74.28 = $80,965.20', o.netP === 74.28 && o.netAmt === 80965.2, [o.netP, o.netAmt].join('/'));
    check('no page/console errors after import', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 2. Site Breakdown counts ═══ */
  await suite(2, 'Site Breakdown counts: coach and staff count edits propagate immediately to every surface, and restore exactly', async () => {
    const before = sig(E);
    const inp = sbCountInput(A, 0, 'ctkk'); check('found the Lincoln # of Coaches input (value 5)', !!inp && inp.value === '5', inp && inp.value);
    const t0 = Date.now(); $(inp).val('7').trigger('input'); const lat = await E.until(() => E.pc(A, 'Scheduled Hrs') === 1167.75, 5000); await E.settle();
    check('7 coaches: Scheduled 1009.75 + 2x79 = 1167.75 landed (latency ' + lat + 'ms)', lat >= 0, E.pc(A, 'Scheduled Hrs'));
    check('propagation latency under 2.5s', lat >= 0 && lat < 2500, lat);
    reconcile(E, 'after coaches 5->7');
    // SM count (non-coach role) to 0 removes SM hours from Lincoln
    const sm = sbCountInput(A, 0, 'sm'); check('found the Lincoln SM input (value 1)', !!sm && sm.value === '1', sm && sm.value);
    $(sm).val('0').trigger('input'); await E.until(() => E.pc(A, 'Scheduled Hrs') === 1067.75, 5000); await E.settle();
    check('SM 1->0: Scheduled drops by exactly 100 (20 days x 5h)', E.pc(A, 'Scheduled Hrs') === 1067.75, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after SM 1->0');
    // the Staffing Hours table's count row reflects the new counts
    const t = shTable(A); const cntRow = roleRow(t, 'Coaches', '# of Coaches') || [...t.rows].find(r => /# of Coaches/.test(r.cells[1] ? r.cells[1].textContent : ''));
    if (cntRow) { const mi = dayColIdx(t, 'Monday'); check('Staffing Hours table Monday # of Coaches = 7+3+2 = 12', num(cntRow.cells[mi - 1 + (cntRow.cells.length - t.rows[0].cells.length + 1)].textContent) === 12 || /12/.test(cntRow.textContent), cntRow.textContent.replace(/\s+/g, ' ')); }
    // restore
    $(inp).val('5').trigger('input'); $(sm).val('1').trigger('input'); await E.until(() => E.pc(A, 'Scheduled Hrs') === 1009.75, 5000); await E.settle();
    check('restoring 5 / 1 returns EVERY figure byte-identical to the baseline', sig(E) === before, 'signature differs');
    reconcile(E, 'after restore');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 3. Start / End times ═══ */
  await suite(3, 'Start/End time edits in Staffing Hours propagate through the full chain; Hours row, day cells, totals, amounts', async () => {
    const before = sig(E);
    const endCell = timeCell(A, 'Coaches', 'end', 'Monday');
    check('found the Coaches Monday End Time cell', !!endCell && !!endCell.querySelector('input'));
    await setTime(endCell, '7:00 PM'); const lat = await E.until(() => E.pc(A, 'Scheduled Hrs') === 1049.75, 5000); await E.settle();
    // Mon 14:00-19:00 = 5h (+1h) x 10 coaches x 4 Mondays = +40
    check('Monday end 6pm->7pm: Scheduled +40 (1h x 10 coaches x 4 Mondays) = 1049.75 (latency ' + lat + 'ms)', E.pc(A, 'Scheduled Hrs') === 1049.75, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after Monday end 19:00');
    const hrsRow = [...shTable(A).rows].find(r => r.cells[0].textContent.trim() === 'Coaches' || r.cells[1].textContent.trim() === 'Start Time'); const hRow = hrsRow && hrsRow.nextElementSibling && hrsRow.nextElementSibling.nextElementSibling;
    check('the Staffing Hours "Hours" row shows 5 for Monday', hRow && /5/.test(hRow.cells[dayColIdx(shTable(A), 'Monday') - 1].textContent), hRow && hRow.textContent.replace(/\s+/g, ' '));
    // Start time later than end (invalid span) contributes 0, never negative
    const startCell = timeCell(A, 'Coaches', 'start', 'Tuesday');
    await setTime(startCell, '7:00 PM'); await E.until(() => E.pc(A, 'Scheduled Hrs') === 889.75, 5000); await E.settle();
    check('Tuesday start 7pm (after the 6pm end): Tuesday coaches contribute 0, not negative (1049.75 - 4x10x4 = 889.75)', E.pc(A, 'Scheduled Hrs') === 889.75, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after invalid Tuesday span');
    await setTime(startCell, '2:00 PM'); await setTime(timeCell(A, 'Coaches', 'end', 'Monday'), '6:00 PM'); await E.until(() => E.pc(A, 'Scheduled Hrs') === 1009.75, 5000); await E.settle();
    check('restoring the times returns EVERY figure byte-identical to the baseline', sig(E) === before, 'signature differs');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 4. PPH, discounts, floor ═══ */
  await suite(4, 'PPH / Discounts / District Floor: PPH (Net), Amount (Net), Savings re-derive at once and reconcile across Programs, Discounts, Summaries', async () => {
    await E.discExpand();
    const chk = (label) => { const o = oracleCal(W, E.det(), A); const dp = E.discVal(A, 'pg-disc-price'), ds = E.discVal(A, 'pg-disc-savings'), da = E.discVal(A, 'pg-disc-amount'), bh = E.discVal(A, 'pg-disc-base-hours'), ba = E.discVal(A, 'pg-disc-base-amt'); check(label + ': Discounts table stage PPH/Savings/Amount + base hours/amount all match the oracle (' + [o.netP, o.savings, o.netAmt, o.total, o.amount].join('/') + ')', near(dp, o.netP) && near(ds, o.savings) && near(da, o.netAmt) && near(bh, o.total) && near(ba, o.amount), [dp, ds, da, bh, ba].join('/')); check(label + ': stage Amount + Savings == base Amount', near(da + ds, ba), (da + ds) + ' vs ' + ba); reconcile(E, label); };
    chk('baseline discount 7.5%');
    // PPH edit ripples through base + net
    const pi = E.pcInput(A, 'PPH'); $(pi).val('100').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 92.5, 5000); await E.settle();
    check('PPH 80.30 -> 100: PPH (Net) becomes $92.50 immediately', E.pc(A, 'PPH (Net)') === 92.5, E.pc(A, 'PPH (Net)'));
    chk('after PPH 100');
    // floor capping: raise the floor above the discounted price -> net lands exactly on the floor
    const df = pl().querySelector('.pg-df-wrap input'); check('District Floor field present (74.00)', !!df && df.value === '74.00', df && df.value);
    $(df).val('95').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 95, 5000); await E.settle();
    check('floor 95 caps the 7.5% discount so PPH (Net) lands EXACTLY on 95.00', E.pc(A, 'PPH (Net)') === 95, E.pc(A, 'PPH (Net)'));
    chk('after floor 95');
    $(df).val('120').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 100, 5000); await E.settle();
    check('floor above the price: NO discount is taken (net = base 100), never a raised rate', E.pc(A, 'PPH (Net)') === 100 && E.pc(A, 'Amount (Net)') === E.pc(A, 'Amount'), E.pc(A, 'PPH (Net)'));
    chk('after floor 120');
    $(df).val('74').trigger('input'); $(pi).val('80.30').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 74.28, 5000); await E.settle();
    chk('after restore');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });
  /* ─────────────── shared drivers for the hierarchy / popup / import suites ─────────────── */
  const GID = 'pg-001';
  const aTbl = () => E.allocTbl(A);
  const expandRot = async () => { if (!aTbl().querySelector('td.sf-wkrot-cell')) { $(aTbl().querySelector('.sf-wkrot-vert')).trigger('click'); await flush(500); } };
  const expandWeeks = async () => { if (!aTbl().querySelector('td.sf-wkov-cell')) { $(aTbl().querySelector('td.sf-wkov-vert')).trigger('click'); await flush(500); } };
  const rotCtl = () => W._pgWkRotCtl[GID + '|' + A];
  const viewWk = async (w) => { const t = aTbl(); const c2 = t && t.querySelector('.sf-alloc-dv-wk[data-dv="' + w + '"]'); if (!c2) throw new Error('no rotation view ' + w); $(c2).trigger('click'); await flush(400); };
  const viewBase = async () => { const t = aTbl(); const b = t && t.querySelector('.sf-alloc-dv-base'); if (b) { $(b).trigger('click'); await flush(400); } };
  const rotCircle = (si, w) => aTbl().querySelector('td.sf-wkrot-cell[data-wkrot-si="' + si + '"][data-wkrot-week="' + w + '"] .sf-wkrot-circle');
  const wkovCircle = (si, iso) => aTbl().querySelector('td.sf-wkov-cell[data-wkov-si="' + si + '"][data-wk-iso="' + iso + '"] .sf-wkrot-circle');
  const rotCellCnt = (si, w) => { const c2 = aTbl().querySelector('td.sf-wkrot-cell[data-wkrot-si="' + si + '"][data-wkrot-week="' + w + '"] .sf-cell-cnt'); return c2 ? num(c2.textContent) : null; };
  const wkovCellCnt = (si, iso) => { const c2 = aTbl().querySelector('td.sf-wkov-cell[data-wkov-si="' + si + '"][data-wk-iso="' + iso + '"] .sf-cell-cnt'); return c2 ? num(c2.textContent) : null; };
  // Day / Rotation / Week staff-count popups: {total, subtotalSum, rows}
  const popTotal = (dd, re, col) => { const r = [...dd.querySelectorAll('table tr')].find(x => re.test((x.children[0] && x.children[0].textContent) || '') || re.test(x.textContent)); return r ? num([...r.children][col].textContent) : NaN; };
  const subSum = dd => [...dd.querySelectorAll('table tr')].filter(r => /Subtotal/.test(r.textContent)).reduce((a, r) => a + (num([...r.children][5].textContent) || 0), 0);
  const dayPopup = async (si, day) => { const chip = aTbl().querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + day + '"] .sf-cell-cnt'); if (!chip) return null; chip.onclick(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.alloc-day-hours-dd'); const out = dd ? { total: popTotal(dd, /^Total/, 4) } : null; await closePops(); return out; };
  const rotPopup = async (si, w) => { const chip = aTbl().querySelector('td.sf-wkrot-cell[data-wkrot-si="' + si + '"][data-wkrot-week="' + w + '"] .sf-cell-cnt'); if (!chip) return null; chip.onclick(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.alloc-rotweek-hours-dd'); const out = dd ? { total: popTotal(dd, /Total \(/, 5), sub: subSum(dd) } : null; await closePops(); return out; };
  const wkPopup = async (si, iso) => { const chip = aTbl().querySelector('td.sf-wkov-cell[data-wkov-si="' + si + '"][data-wk-iso="' + iso + '"] .sf-cell-cnt'); if (!chip) return null; chip.onclick(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.alloc-week-hours-dd'); const out = dd ? { total: popTotal(dd, /^Total/, 5), sub: subSum(dd) } : null; await closePops(); return out; };
  // Per-school Staffing Hours popup (Base view + Rotation Week view editors)
  const popEl = () => d.querySelector('.sf-sh-popup');
  const closeSchoolPopup = async () => { try { W._pgCloseSchoolShPopups({ target: d.body }); } catch (e) {} await flush(200); };
  const openSchoolPopup = async (name) => { await closeSchoolPopup(); const nm = [...pl().querySelectorAll('.sf-alloc-school-nm,.sf-strip-school-nm')].find(x => x.textContent.trim() === name); if (!nm) throw new Error('no school name ' + name); nm.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700); if (!popEl()) throw new Error('popup did not open for ' + name); return popEl(); };
  const setBaseCount = async (name, role, day, val) => { await openSchoolPopup(name); const cc = popEl().querySelector('.count-cell-u[data-role="' + role + '"][data-day="' + day + '"]'); if (!cc) throw new Error('no count cell ' + role + '/' + day); $(cc.closest('td')).trigger('click'); await flush(120); const inp = popEl().querySelector('input.sf-sh-cnt-input'); if (!inp) throw new Error('no base count input'); inp.value = String(val); inp.dispatchEvent(new W.Event('input', { bubbles: true })); await flush(60); inp.dispatchEvent(new W.Event('blur', { bubbles: true })); await flush(120); $(popEl().querySelector('.sf-sh-cnt-save')).trigger('click'); await flush(900); await E.settle(); await closeSchoolPopup(); };
  const setWeekCount = async (name, w, role, day, val) => { await openSchoolPopup(name); const wc = popEl().querySelector('.sf-shv-wk[data-shv="' + w + '"]'); if (!wc) throw new Error('no week circle ' + w); $(wc).trigger('click'); await flush(400); const cc = popEl().querySelector('.count-cell-u[data-role="' + role + '"][data-day="' + day + '"]'); if (!cc) throw new Error('no week count cell'); $(cc.closest('td')).trigger('click'); await flush(150); const inp = popEl().querySelector('.sf-shv-input'); if (!inp) throw new Error('no week input'); $(inp).val(String(val)).trigger('input').trigger('blur'); await flush(150); $(popEl().querySelector('.sf-sh-wk-save')).trigger('click'); await flush(1200); await E.settle(); await closeSchoolPopup(); };
  // Calendar surfaces
  const cellOf = iso => E.dayCells(A).find(x => x.getAttribute('data-date-key') === iso);
  const markCell = async (iso, label) => { const cell = cellOf(iso); $(cell).trigger('contextmenu'); await flush(150); const menu = d.querySelector('.cal-ctx-menu'); if (!menu || menu.style.display === 'none') return false; const leaves = () => [...menu.querySelectorAll('*')].filter(e => e.children.length === 0); const opt = leaves().find(e => e.textContent.trim() === label); if (!opt) return false; $(opt).trigger('click'); await flush(80); const apply = leaves().find(e => e.textContent.trim() === 'Apply'); if (apply) $(apply).trigger('click'); await flush(500); await E.settle(); return true; };
  const pinnedTip = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none' && /Total/.test(el.textContent)).pop();
  const openDay = async iso => { $(d.body).trigger('click'); await flush(80); $(cellOf(iso)).trigger('click'); await flush(300); return pinnedTip(); };
  const tipTotal = tip => { const r = [...tip.querySelectorAll('tr')].find(x => /^Total/.test(x.textContent.trim())); return r ? num(r.children[r.children.length - 1].textContent) : NaN; };
  const setDateCount = async (iso, schoolName, roleIdx, val) => { const tip = await openDay(iso); const combs = [...tip.querySelectorAll('td')].filter(t2 => t2.getAttribute('title') === 'Click to edit each school for this date'); if (!combs[roleIdx]) throw new Error('no combined count cell'); $(combs[roleIdx]).trigger('click'); await flush(200); const pop = d.querySelector('.cal-day-cnt-popup'); if (!pop) throw new Error('no per-date popup'); const row = [...pop.querySelectorAll('.sh-cnt-popup-row')].find(r => new RegExp('^' + schoolName).test(r.textContent.trim())); if (!row) throw new Error('no row ' + schoolName); $(row.lastElementChild).trigger('click'); await flush(30); $(row.lastElementChild).find('input').val(String(val)).trigger('input'); await flush(30); $(pop.querySelector('.sh-cnt-popup-save')).trigger('mousedown'); await flush(500); await E.settle(); $(d.body).trigger('click'); await flush(80); };
  const resetDateCounts = async (iso, roleIdx) => { const tip = await openDay(iso); const combs = [...tip.querySelectorAll('td')].filter(t2 => t2.getAttribute('title') === 'Click to edit each school for this date'); if (!combs.length) { /* separated-by-school rows: the pinned tip's own Reset to Original Hours (staged, then Save) */ const rb = tip.querySelector('.cal-tip-reset'); if (!rb) throw new Error('no reset control on ' + iso); $(rb).trigger('click'); await flush(250); const sv = pinnedTip() && pinnedTip().querySelector('.cal-tip-save'); if (!sv) throw new Error('no save after staging the reset'); $(sv).trigger('click'); await flush(600); await E.settle(); $(d.body).trigger('click'); await flush(80); return; } $(combs[roleIdx]).trigger('click'); await flush(200); const pop = d.querySelector('.cal-day-cnt-popup'); const rs = pop && pop.querySelector('.sh-cnt-popup-reset'); if (rs && rs.style.display !== 'none') { $(rs).trigger('mousedown'); await flush(60); $(pop.querySelector('.sh-cnt-popup-save')).trigger('mousedown'); await flush(500); } else if (pop) { $(pop.querySelector('.sh-cnt-popup-cancel')).trigger('mousedown'); await flush(200); } await E.settle(); $(d.body).trigger('click'); await flush(80); };
  const addXS = async (iso, school, roleKey, startAmPm, endAmPm, count) => { const tip = await openDay(iso); $([...tip.querySelectorAll('*')].find(e => e.children.length === 0 && /Add Extra Shift/.test(e.textContent))).trigger('click'); await flush(300); const pop = [...d.body.children].filter(el => el.tagName === 'DIV' && /Extra Shift for/.test(el.textContent) && el.style.display !== 'none').pop(); const sels = [...pop.querySelectorAll('select')]; $(sels[1]).val(school).trigger('change'); $(sels[2]).val(roleKey).trigger('change'); await flush(100); const ins = [...pop.querySelectorAll('input')]; await setTime(ins[0].parentElement, startAmPm); await setTime(ins[1].parentElement, endAmPm); $(ins[2]).val(String(count)).trigger('input').trigger('change'); await flush(150); $([...pop.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')).trigger('click'); await flush(700); await E.settle(); $(d.body).trigger('click'); await flush(80); };
  const delXS = async (iso, timeRe) => { const tip = await openDay(iso); const row = [...tip.querySelectorAll('tr')].find(r => timeRe.test(r.textContent.replace(/\s+/g, '')) && r.querySelector('.xs-del')); const del = row && row.querySelector('.xs-del'); if (!del) throw new Error('no extra shift delete'); $(del).trigger('click'); await flush(250); const dlg = [...d.querySelectorAll('.xs-ui')].filter(x => /Delete this Extra Shift\?/.test(x.textContent)).pop(); const ok = dlg && [...dlg.querySelectorAll('button')].find(b => b.textContent.trim() === 'Delete'); if (!ok) throw new Error('no delete confirm'); $(ok).trigger('click'); await flush(700); await E.settle(); $(d.body).trigger('click'); await flush(80); };
  // Unallocated Hours card (cal_a)
  const unCard = () => pl().querySelector('.cal-group[data-cal-group="' + A + '"]');
  const unInp = () => unCard().querySelector('.sf-unalloc-inp');
  const allocRows = () => [...unCard().querySelectorAll('tr')].filter(r => { const ins = [...r.querySelectorAll('input[type="text"]')]; return ins.length >= 3 && /\d{4}/.test(ins[0].placeholder || '') && !r.querySelector('.sf-unalloc-inp'); });
  const addAllocRow = async (hours, notes) => { const b = [...unCard().querySelectorAll('button')].find(x => /Allocated Hours/.test(x.textContent)); $(b).trigger('click'); await flush(400); const rows = allocRows(); const r = rows[rows.length - 1]; const ins = [...r.querySelectorAll('input[type="text"]')]; $(ins[1]).val(String(hours)).trigger('input').trigger('change').trigger('blur'); await flush(200); if (notes != null) { $(ins[2]).val(notes).trigger('input').trigger('change').trigger('blur'); await flush(120); } await E.settle(); return r; };
  const remPopup = async () => { await closePops(); const cellA = E.pcRow(A).querySelector('.pg-rem-clickable'); cellA.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.pg-rem-break-dd'); if (!dd) return null; const rows = [...dd.querySelectorAll('tr')].map(r => [...r.children].map(c2 => c2.textContent.trim())); const rec = rows.filter(r => r.length >= 3 && /^(—|[A-Z][a-z]+ \d)/.test(r[0]) && !/^(Allocated|Remaining|Date)$/.test(r[0])); const alloc = rows.find(r => r[0] === 'Allocated'), rem = rows.find(r => r[0] === 'Remaining'); const un = num((dd.textContent.match(/Unallocated\s*([\d.,]+)/) || [])[1]); await closePops(); return { unalloc: un, records: rec.map(r => num(r[1])), allocated: alloc ? num(alloc[1]) : NaN, remaining: rem ? num(rem[1]) : NaN }; };
  const amtPopup = async (calId) => { await closePops(); const cell = E.pcRow(calId).querySelector('.pg-amt-clickable'); if (!cell) return null; cell.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.pg-amt-break-dd'); if (!dd) return null; const rows = [...dd.querySelectorAll('tr')].map(r => [...r.children].map(c2 => c2.textContent.trim())).filter(r => r.length >= 4 && r[0] !== '#'); const tot = rows.find(r => /Program Total/.test(r[1])); const detail = rows.filter(r => !/Program Total/.test(r[1])); await closePops(); return { total: tot ? num(tot[4]) : NaN, totalHours: tot ? num(tot[2]) : NaN, rowSum: r2(detail.reduce((a, r) => a + num(r[4]), 0)), rowHours: r2(detail.reduce((a, r) => a + num(r[2]), 0)), rows: detail.length }; };
  const lenCell = calId => E.pcRow(calId).children[E.hs().indexOf('Length')].textContent.trim();
  const wkTotal = (o, mIso) => { let t = 0; Object.keys(o.byDate).forEach(k => { if (mondayIso(k) === mIso) t += o.byDate[k]; }); return r2(t); };
  const oracleA = () => oracleCal(W, E.det(), A);
  const setCalOpt = async (calId, label, on) => { const ci = E.det().calendarRows.findIndex(r => r.calId === calId); const optBtns = [...pl().querySelectorAll('button')].filter(b => /^Options/.test(b.textContent.trim())); $(optBtns[ci]).trigger('click'); await flush(80); const rows = [...d.querySelectorAll('div')].filter(x => x.children.length && /(Separate by School|Separate by Pods|Alternate Weeks)/.test(x.textContent) && x.querySelector('input[type=checkbox]')); const row = rows.find(r => new RegExp(label).test(r.textContent)); if (!row) throw new Error('no option row ' + label); const cb = row.querySelector('input[type=checkbox]'); if (cb.checked !== on) $(cb).trigger('click'); await flush(1400); await E.settle(); $(d.body).trigger('click'); await flush(80); };

  /* ═══ 5. Base staffing count overrides (per-school popup, Base view) ═══ */
  await suite(5, 'Base staffing overrides: a per-school count override written from the Staffing Hours popup propagates at once; editing back to Base prunes it and restores every figure', async () => {
    const before = sig(E); await E.allocOn(A);
    const h5 = (function () { try { W._pgHist.flushNow(); return W._pgHist.list(GID).length; } catch (e) { return -1; } })();
    // Lincoln Monday coaches 5 -> 6: +1 x 4h x 4 Mondays = +16
    await setBaseCount('Lincoln', 'ctkk', 'mon', 6);
    check('the count-only popup save writes exactly ONE History record in the override phrasing (Created a Staffing Hours Coach Count override for Lincoln, Monday in \u201cAfter School\u201d: 6)', (function () { try { W._pgHist.flushNow(); const l = W._pgHist.list(GID); return h5 < 0 || (l.length === h5 + 1 && /Created a Staffing Hours Coach Count override for Lincoln, Monday in \u201cAfter School\u201d: 6/.test(l[0].action || '')); } catch (e) { return false; } })(), (function () { try { return JSON.stringify(W._pgHist.list(GID)[0]).slice(0, 160); } catch (e) { return '?'; } })());
    const det = E.det(); const slot = det.staffingHoursSlots['s0c0'];
    check('the override is stored in the school slot s0c0 (ctkk.mon.cnt = 6), not in a shared slot', !!(slot && slot.ctkk && slot.ctkk.mon && String(slot.ctkk.mon.cnt) === '6'), JSON.stringify(slot && slot.ctkk && slot.ctkk.mon));
    check('Scheduled +16 (1 coach x 4h x 4 Mondays): 1009.75 -> 1025.75', E.pc(A, 'Scheduled Hrs') === 1025.75, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after Lincoln Monday coaches override 6');
    check('the Days count for Lincoln Monday reads 7 (6 coaches + 1 SM) immediately', E.allocCellCnt(A, 0, 'mon') === 7, E.allocCellCnt(A, 0, 'mon'));
    const dp = await dayPopup(0, 'mon'); check('the Day popup total reconciles to the visible count (7)', !!dp && dp.total === 7, dp);
    // Monday day cells show +5 (Lincoln 5->6 coaches x 4h +4 ... wait: +1 coach x 4h = +4 per Monday)
    check('every Monday day cell rose by exactly 4h (Aug 3: 50 -> 54)', E.dayHrs(A, '2026-08-03') === 54 && E.dayHrs(A, '2026-08-24') === 54, E.dayHrs(A, '2026-08-03') + '/' + E.dayHrs(A, '2026-08-24'));
    check('a Tuesday is untouched (50)', E.dayHrs(A, '2026-08-04') === 50, E.dayHrs(A, '2026-08-04'));
    // Site Breakdown count is NOT rewritten by the override (override sits above it)
    check('Site Breakdown # of Coaches stays 5 (override layer does not mutate the base count)', sbCountInput(A, 0, 'ctkk').value === '5', sbCountInput(A, 0, 'ctkk').value);
    // DEFECT FOUND BY THIS CAMPAIGN (fixed in this build): the count override lives in a times-less
    // scaffolding slot (s0c0 = {ctkk:{mon:{start:'',end:'',cnt:6}}}). Separating the calendar made that
    // slot authoritative with EMPTY times, so every Lincoln hour vanished (495 -> 0). Both separation
    // entry points are exercised: the header Options toggle here, the Rotation-Week auto-separation in suite 6.
    const midSig = sig(E);
    await setCalOpt(A, 'Separate by School', true);
    check('Separate by School with a count-only scaffolding slot keeps EVERY hour (Lincoln 495+16 = 511, Scheduled 1025.75)', E.pc(A, 'Scheduled Hrs') === 1025.75 && !!E.sumSchools(A).find(x => x.name === 'Lincoln' && x.hours === 511), E.pc(A, 'Scheduled Hrs') + ' ' + JSON.stringify(E.sumSchools(A)));
    const sl = E.det().staffingHoursSlots['s0c0'];
    check('separation MATERIALIZED the inherited times into s0c0 (Monday 14:00-18:00 with cnt 6; Friday 14:00-17:45; SM 13:30-18:30)', !!sl && sl.ctkk.mon.start === '14:00' && sl.ctkk.mon.end === '18:00' && String(sl.ctkk.mon.cnt) === '6' && sl.ctkk.fri.end === '17:45' && sl.sm.mon.start === '13:30', JSON.stringify(sl).slice(0, 300));
    check('every figure is identical across the separation flip', sig(E) === midSig, 'signature differs');
    reconcile(E, 'after separating with a scaffolding slot');
    await setCalOpt(A, 'Separate by School', false);
    check('un-separating returns the same figures', sig(E) === midSig, 'signature differs');
    // back to Base -> pruned
    await setBaseCount('Lincoln', 'ctkk', 'mon', 5);
    const slot2 = E.det().staffingHoursSlots['s0c0'];
    check('editing back to the Base value PRUNES the override (no cnt stored)', !(slot2 && slot2.ctkk && slot2.ctkk.mon && slot2.ctkk.mon.cnt != null && slot2.ctkk.mon.cnt !== ''), JSON.stringify(slot2 && slot2.ctkk && slot2.ctkk.mon));
    check('every figure is byte-identical to the pre-override baseline', sig(E) === before, 'signature differs');
    reconcile(E, 'after pruning the Base override');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 6. Rotation Weeks: inheritance, overrides, day disable, week removal ═══ */
  await suite(6, 'Rotation Weeks: Base -> Rotation inheritance; a rotation-week count override, a rotation-week day disable and a rotation-week removal each propagate both ways and restore exactly', async () => {
    const before = sig(E); await E.allocOn(A); await expandRot();
    rotCtl().setRotation('0', 2); await flush(600); await E.settle();
    check('Lincoln now has a 2-week rotation (cells 0|1 and 0|2)', E.det().wkRot && E.det().wkRot[A] && E.det().wkRot[A].cells['0|1'] !== undefined && E.det().wkRot[A].cells['0|2'] !== undefined, JSON.stringify(E.det().wkRot && E.det().wkRot[A]));
    check('a rotation with no overrides changes NOTHING (pure inheritance from Base)', sig(E) === before, 'signature differs');
    reconcile(E, 'after configuring a 2-week rotation (inheritance only)');
    // rotation counts: week 1 = weeks Aug 3 + Aug 17, week 2 = Aug 10 + Aug 24; each = Lincoln 6 staff x 5 days = 30
    check('Rotation Week 1 and 2 counts both read 30 (6 staff x 5 days), inheriting Base', rotCellCnt(0, 1) === 30 && rotCellCnt(0, 2) === 30, rotCellCnt(0, 1) + '/' + rotCellCnt(0, 2));
    // (a) rotation-week count override: week 2 Monday coaches 8 -> Aug 10 + Aug 24: +3 x 4h x 2 = +24
    await setWeekCount('Lincoln', 2, 'ctkk', 'mon', 8);
    const wh = E.det().wkRotHrs && E.det().wkRotHrs[A] && E.det().wkRotHrs[A]['0|2|ctkk|mon'];
    check('the override is stored as a Rotation-Week diff (count only, no start/end copied)', !!wh && String(wh.count) === '8' && wh.start == null && wh.end == null, JSON.stringify(wh));
    check('Scheduled +24 (3 coaches x 4h x 2 rotation-week-2 Mondays): 1033.75', E.pc(A, 'Scheduled Hrs') === 1033.75, E.pc(A, 'Scheduled Hrs'));
    check('rotation-week-2 Mondays rose to 62 (50 + 12); rotation-week-1 Mondays stay 50', E.dayHrs(A, '2026-08-10') === 62 && E.dayHrs(A, '2026-08-24') === 62 && E.dayHrs(A, '2026-08-03') === 50 && E.dayHrs(A, '2026-08-17') === 50, [E.dayHrs(A, '2026-08-03'), E.dayHrs(A, '2026-08-10'), E.dayHrs(A, '2026-08-17'), E.dayHrs(A, '2026-08-24')].join('/'));
    reconcile(E, 'after rotation-week-2 Monday count override 8');
    check('Rotation Week 2 count = 33 (30 + 3), Week 1 still 30', rotCellCnt(0, 2) === 33 && rotCellCnt(0, 1) === 30, rotCellCnt(0, 1) + '/' + rotCellCnt(0, 2));
    let rp = await rotPopup(0, 2); check('Rotation Week 2 popup total = 33 = sum of its day subtotals', !!rp && rp.total === 33 && rp.sub === 33, rp);
    await viewWk(2); check('the Days view for Rotation Week 2 shows Lincoln Monday = 9 (8 + SM 1)', E.allocCellCnt(A, 0, 'mon') === 9, E.allocCellCnt(A, 0, 'mon'));
    await viewBase(); check('Base view still shows Lincoln Monday = 6 (override isolated to rotation week 2)', E.allocCellCnt(A, 0, 'mon') === 6, E.allocCellCnt(A, 0, 'mon'));
    // (b) rotation-week day disable: week 2 Tuesday off -> Aug 11 + Aug 25 lose Lincoln's 25h each = -50
    await viewWk(2); await E.setDay(A, 0, 'tue', false); await E.settle();
    check('rotation-week-2 Tuesday disabled: Scheduled -50 (Lincoln 25h x 2 Tuesdays) = 983.75', E.pc(A, 'Scheduled Hrs') === 983.75, E.pc(A, 'Scheduled Hrs'));
    check('the rotation-week-2 Tuesday cells dropped to 25 (Roosevelt 17 + Jefferson 8); week-1 Tuesdays stay 50', E.dayHrs(A, '2026-08-11') === 25 && E.dayHrs(A, '2026-08-25') === 25 && E.dayHrs(A, '2026-08-04') === 50, [E.dayHrs(A, '2026-08-04'), E.dayHrs(A, '2026-08-11'), E.dayHrs(A, '2026-08-25')].join('/'));
    check('the disabled day shows NO staff count in the week-2 view', !(E.allocCellCnt(A, 0, 'tue') > 0), E.allocCellCnt(A, 0, 'tue'));
    check('Rotation Week 2 count fell to 27 (33 - 6); the disable did not touch Base or the override', rotCellCnt(0, 2) === 27 && (await viewBase(), E.allocCellCnt(A, 0, 'tue') === 6) && String(E.det().wkRotHrs[A]['0|2|ctkk|mon'].count) === '8', rotCellCnt(0, 2));
    rp = await rotPopup(0, 2); check('Rotation Week 2 popup total = 27 = sum of subtotals (disabled Tuesday absent)', !!rp && rp.total === 27 && rp.sub === 27, rp);
    reconcile(E, 'after rotation-week-2 Tuesday disable');
    // re-enable -> restored
    await viewWk(2); await E.setDay(A, 0, 'tue', true); await E.settle(); await viewBase();
    check('re-enabling the rotation-week day restores Scheduled 1033.75 and the week-2 count 33', E.pc(A, 'Scheduled Hrs') === 1033.75 && rotCellCnt(0, 2) === 33, E.pc(A, 'Scheduled Hrs') + '/' + rotCellCnt(0, 2));
    reconcile(E, 'after rotation-week-2 Tuesday re-enable');
    // (c) prune the override by editing it back to Base
    await setWeekCount('Lincoln', 2, 'ctkk', 'mon', 5);
    check('editing the rotation override back to Base prunes it and restores 1009.75', !E.det().wkRotHrs && E.pc(A, 'Scheduled Hrs') === 1009.75, JSON.stringify(E.det().wkRotHrs || null) + ' ' + E.pc(A, 'Scheduled Hrs'));
    // (d) remove Lincoln from rotation week 2 -> Lincoln contributes nothing in weeks Aug 10 + Aug 24 (123.75 each)
    $(rotCircle(0, 2)).trigger('click'); await flush(700); await E.settle();
    check('removing week 2 from the rotation stores cells[0|2] = false', E.det().wkRot[A].cells['0|2'] === false, E.det().wkRot[A].cells['0|2']);
    check('Scheduled -247.5 (Lincoln 123.75 x 2 weeks) = 762.25', E.pc(A, 'Scheduled Hrs') === 762.25, E.pc(A, 'Scheduled Hrs'));
    check('Rotation Week 2 shows no count; Week 1 still 30', rotCellCnt(0, 2) === null && rotCellCnt(0, 1) === 30, rotCellCnt(0, 2) + '/' + rotCellCnt(0, 1));
    reconcile(E, 'after removing Lincoln from rotation week 2');
    $(rotCircle(0, 2)).trigger('click'); await flush(700); await E.settle();
    check('adding week 2 back restores 1009.75 and the 30/30 counts', E.pc(A, 'Scheduled Hrs') === 1009.75 && rotCellCnt(0, 1) === 30 && rotCellCnt(0, 2) === 30, E.pc(A, 'Scheduled Hrs'));
    check('every figure is byte-identical to the pre-rotation baseline', sig(E) === before, 'signature differs');
    reconcile(E, 'after restoring the rotation');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 7. Calendar Weeks: per-school week override + Exclude/Include Week ═══ */
  await suite(7, 'Calendar Weeks: a per-school Weeks override and a whole-week Exclude/Include remove and restore that week\'s staffing everywhere; Length, counts and popups agree', async () => {
    const before = sig(E); await E.allocOn(A); await expandWeeks();
    const o0 = oracleA(); const wkL = wkTotal(o0, '2026-08-10'); // whole calendar week of Aug 10
    check('Weeks cells show every week at 30 for Lincoln (inherited)', wkovCellCnt(0, '2026-08-10') === 30 && wkovCellCnt(0, '2026-08-17') === 30, wkovCellCnt(0, '2026-08-10'));
    // per-school override: Lincoln off in the Aug 10 week -> -123.75
    $(wkovCircle(0, '2026-08-10')).trigger('click'); await flush(700); await E.settle();
    check('the Weeks override stores 0|2026-08-10 = false', E.det().wkOv && E.det().wkOv[A] && E.det().wkOv[A]['0|2026-08-10'] === false, JSON.stringify(E.det().wkOv && E.det().wkOv[A]));
    check('Scheduled -123.75 (Lincoln\'s week: 4x25 + 23.75) = 886', E.pc(A, 'Scheduled Hrs') === 886, E.pc(A, 'Scheduled Hrs'));
    check('the Aug 10 week cells drop by 25 (Mon-Thu) and 23.75 (Fri); other weeks untouched', E.dayHrs(A, '2026-08-10') === 25 && E.dayHrs(A, '2026-08-14') === 23.75 && E.dayHrs(A, '2026-08-17') === 50, [E.dayHrs(A, '2026-08-10'), E.dayHrs(A, '2026-08-14'), E.dayHrs(A, '2026-08-17')].join('/'));
    check('the disabled Weeks cell shows no count; neighbours keep 30', wkovCellCnt(0, '2026-08-10') === null && wkovCellCnt(0, '2026-08-17') === 30, wkovCellCnt(0, '2026-08-10'));
    reconcile(E, 'after Lincoln Weeks override off (Aug 10)');
    const wp0 = await wkPopup(0, '2026-08-17'); check('the Week popup for a live week = 30 = sum of its date subtotals', !!wp0 && wp0.total === 30 && wp0.sub === 30, wp0);
    $(wkovCircle(0, '2026-08-10')).trigger('click'); await flush(700); await E.settle();
    check('turning the week back on restores 1009.75 and the count 30', E.pc(A, 'Scheduled Hrs') === 1009.75 && wkovCellCnt(0, '2026-08-10') === 30, E.pc(A, 'Scheduled Hrs') + '/' + wkovCellCnt(0, '2026-08-10'));
    // whole-week exclude (Aug 17): every school off, Length 4 -> 3
    check('Length reads 4 weeks before the exclusion', lenCell(A) === '4 weeks', lenCell(A));
    W._pgWeekVis.toggle(GID, A, '2026-08-17'); await flush(700); await E.settle();
    const wk3 = wkTotal(o0, '2026-08-17');
    check('Exclude Week: Scheduled drops by the whole week (' + wk3 + ') and Length reads 3 weeks', E.pc(A, 'Scheduled Hrs') === r2(1009.75 - wk3) && lenCell(A) === '3 weeks', E.pc(A, 'Scheduled Hrs') + ' ' + lenCell(A));
    check('every school row got an explicit OFF override for that week (15th spec auto-manage)', ['0', '1', '2'].every(si => E.det().wkOv[A][si + '|2026-08-17'] === false), JSON.stringify(E.det().wkOv[A]));
    check('the excluded week\'s day cells show no hours', !(E.dayHrs(A, '2026-08-17') > 0) && !(E.dayHrs(A, '2026-08-21') > 0), E.dayHrs(A, '2026-08-17'));
    reconcile(E, 'after Exclude Week Aug 17');
    W._pgWeekVis.toggle(GID, A, '2026-08-17'); await flush(700); await E.settle();
    check('Include Week removes the auto-overrides and restores 1009.75 / 4 weeks', E.pc(A, 'Scheduled Hrs') === 1009.75 && lenCell(A) === '4 weeks' && !Object.keys((E.det().wkOv && E.det().wkOv[A]) || {}).some(k => /2026-08-17/.test(k)), E.pc(A, 'Scheduled Hrs') + ' ' + lenCell(A) + ' ' + JSON.stringify(E.det().wkOv && E.det().wkOv[A]));
    check('every figure is byte-identical to the pre-week-edit baseline', sig(E) === before, 'signature differs');
    reconcile(E, 'after Include Week');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 8. Calendar Day layer: Special Days (Min Day / No-Hours) + per-date count overrides ═══ */
  await suite(8, 'Calendar Day layer: a Min Day substitutes the Min-Day schedule, a No-Hours day removes the day, a per-date count override changes ONE date; clearing each restores exactly', async () => {
    const before = sig(E);
    // Min Day on Aug 5 (Wed): coaches keep 4h (13:00-17:00), SM has no Min-Day hours -> Lincoln -5, Roosevelt -5 -> -10
    check('Min Day marked on Aug 5', await markCell('2026-08-05', 'Min Day'));
    check('Aug 5 staffing 50 -> 40 (SM has no Min-Day schedule); the dated 12.5 allocation still rides the cell (52.5)', E.dayHrs(A, '2026-08-05') === 52.5, E.dayHrs(A, '2026-08-05'));
    check('Scheduled -10 = 999.75', E.pc(A, 'Scheduled Hrs') === 999.75, E.pc(A, 'Scheduled Hrs'));
    const tip = await E.tipFor(A, '2026-08-05'); check('the hover breakdown for Aug 5 totals 40 (schedule only; 52.5 if it lists the dated allocation)', !!tip.tip && (tipTotal(tip.tip) === 40 || tipTotal(tip.tip) === 52.5), tip.tip && tip.tip.textContent.replace(/\s+/g, ' ').slice(0, 160)); await E.tipClose(tip.cell);
    reconcile(E, 'after Min Day on Aug 5');
    // No-Hours day on Aug 6 (Thu): -50
    check('Holiday (no hours) marked on Aug 6', await markCell('2026-08-06', 'Holiday'));
    check('Aug 6 shows no hours; Scheduled -50 = 949.75', E.dayHrs(A, '2026-08-06') === 0 && E.pc(A, 'Scheduled Hrs') === 949.75, E.dayHrs(A, '2026-08-06') + '/' + E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after Holiday on Aug 6');
    check('Staff/Day (Max) is unaffected by removing one day (still 12)', E.pc(A, 'Staff/Day (Max)') === 12, E.pc(A, 'Staff/Day (Max)'));
    // per-date count override: Aug 7 (Fri) Lincoln coaches 5 -> 7: +2 x 3.75 = +7.5
    await setDateCount('2026-08-07', 'Lincoln', 0, 7);
    const co = E.det().calCellOverrides && E.det().calCellOverrides[A + '|2026-08-07|0|ctkk'];
    check('a DATE-scoped override is stored (cal_a|2026-08-07|0|ctkk cnt 7)', !!co && String(co.cnt) === '7', JSON.stringify(E.det().calCellOverrides || null));
    check('Aug 7 rises by 7.5 (47.5 -> 55); Aug 14 (another Friday) stays 47.5', E.dayHrs(A, '2026-08-07') === 55 && E.dayHrs(A, '2026-08-14') === 47.5, E.dayHrs(A, '2026-08-07') + '/' + E.dayHrs(A, '2026-08-14'));
    check('Scheduled +7.5 = 957.25', E.pc(A, 'Scheduled Hrs') === 957.25, E.pc(A, 'Scheduled Hrs'));
    check('Staff/Day (Max) rose to 14 (Aug 7 now staffs 7+1+3+1+2 = 14)', E.pc(A, 'Staff/Day (Max)') === 14, E.pc(A, 'Staff/Day (Max)'));
    reconcile(E, 'after per-date count override Aug 7');
    // restore all three
    await resetDateCounts('2026-08-07', 0);
    check('Reset removes the date override', !(E.det().calCellOverrides && E.det().calCellOverrides[A + '|2026-08-07|0|ctkk']), JSON.stringify(E.det().calCellOverrides || null));
    check('Aug 6 cleared', await markCell('2026-08-06', 'Clear')); check('Aug 5 cleared', await markCell('2026-08-05', 'Clear'));
    check('every figure is byte-identical to the baseline after clearing all three', sig(E) === before, 'signature differs');
    reconcile(E, 'after clearing the Calendar Day layer');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 9. Day inclusion/exclusion (Base) both directions, repeatedly ═══ */
  await suite(9, 'Day inclusion/exclusion (Base): disabling a day removes its staffing from every surface with no stale count; re-enabling restores it with no missing count; repeated cycles never drift', async () => {
    const before = sig(E); await E.allocOn(A); await viewBase();
    await E.setDay(A, 0, 'wed', false); await E.settle();
    check('Lincoln Wednesday off: Scheduled -100 (25h x 4) = 909.75', E.pc(A, 'Scheduled Hrs') === 909.75, E.pc(A, 'Scheduled Hrs'));
    check('every Wednesday cell drops to 25 (+12.5 dated allocation on Aug 5 -> 37.5)', E.dayHrs(A, '2026-08-05') === 37.5 && E.dayHrs(A, '2026-08-12') === 25 && E.dayHrs(A, '2026-08-26') === 25, [E.dayHrs(A, '2026-08-05'), E.dayHrs(A, '2026-08-12')].join('/'));
    check('the Days cell shows NO staff count (no stale 6)', !(E.allocCellCnt(A, 0, 'wed') > 0), E.allocCellCnt(A, 0, 'wed'));
    const t1 = await E.tipFor(A, '2026-08-12'); check('the Aug 12 hover breakdown lists only Roosevelt + Jefferson (Lincoln removed) and totals 25', !!t1.tip && tipTotal(t1.tip) === 25 && !/Lincoln/.test(t1.tip.textContent), t1.tip && t1.tip.textContent.replace(/\s+/g, ' ').slice(0, 160)); await E.tipClose(t1.cell);
    reconcile(E, 'after Lincoln Wednesday off');
    // a second school + day, then re-enable in the opposite order
    await E.setDay(A, 1, 'fri', false); await E.settle();
    check('Roosevelt Friday off too: Scheduled -65 (16.25h x 4) = 844.75', E.pc(A, 'Scheduled Hrs') === 844.75, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after Roosevelt Friday off');
    await E.setDay(A, 0, 'wed', true); await E.settle();
    check('Lincoln Wednesday back on: 944.75, Days count 6 returns', E.pc(A, 'Scheduled Hrs') === 944.75 && E.allocCellCnt(A, 0, 'wed') === 6, E.pc(A, 'Scheduled Hrs') + '/' + E.allocCellCnt(A, 0, 'wed'));
    await E.setDay(A, 1, 'fri', true); await E.settle();
    check('Roosevelt Friday back on: 1009.75', E.pc(A, 'Scheduled Hrs') === 1009.75, E.pc(A, 'Scheduled Hrs'));
    check('every figure byte-identical after the two disable/enable pairs', sig(E) === before, 'signature differs');
    // rapid cycles
    for (let i = 0; i < 4; i++) { await E.setDay(A, 0, 'mon', false); await E.setDay(A, 2, 'thu', false); await E.setDay(A, 0, 'mon', true); await E.setDay(A, 2, 'thu', true); }
    await E.settle();
    check('4 rapid disable/enable cycles on two schools leave every figure byte-identical (no drift, no stale or missing counts)', sig(E) === before, 'signature differs');
    reconcile(E, 'after rapid day cycles');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 10. Extra Shifts ═══ */
  await suite(10, 'Extra Shifts: adding one adds exactly its hours and count to that date and to every total; deleting it restores exactly', async () => {
    const before = sig(E);
    // Aug 6 (Thu): Roosevelt Coaches 9:00-11:00 x 2 = +4h, +2 staff
    await addXS('2026-08-06', 'Roosevelt', 'ctkk', '9:00 AM', '11:00 AM', 2);
    const xs = E.det().calExtraShifts && E.det().calExtraShifts[A + '|2026-08-06'];
    check('the extra shift is stored under cal_a|2026-08-06 for Roosevelt', !!xs && xs.some(s => s.school === 'Roosevelt'), JSON.stringify(xs || null).slice(0, 200));
    check('Aug 6 cell 50 -> 54; Scheduled +4 = 1013.75', E.dayHrs(A, '2026-08-06') === 54 && E.pc(A, 'Scheduled Hrs') === 1013.75, E.dayHrs(A, '2026-08-06') + '/' + E.pc(A, 'Scheduled Hrs'));
    check('Staff/Day (Max) 12 -> 14 (the two extra coaches count on Aug 6)', E.pc(A, 'Staff/Day (Max)') === 14, E.pc(A, 'Staff/Day (Max)'));
    const ss = E.sumSchools(A).find(x => x.name === 'Roosevelt'); check('the Program Summary Roosevelt row includes the 4 extra hours (341)', !!ss && ss.hours === 341, ss && ss.hours);
    reconcile(E, 'after adding an Extra Shift');
    const tip = await openDay('2026-08-06'); check('the pinned breakdown for Aug 6 totals 54 and shows the extra shift', !!tip && tipTotal(tip) === 54 && /9:00am/.test(tip.textContent.replace(/\s+/g, '')), tip && tip.textContent.replace(/\s+/g, ' ').slice(0, 200));
    $(d.body).trigger('click'); await flush(80);
    await delXS('2026-08-06', /9:00am/);
    check('deleting the extra shift restores every figure byte-identically', sig(E) === before, 'signature differs');
    reconcile(E, 'after deleting the Extra Shift');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 11. Allocated / Unallocated / Remaining Hours ═══ */
  await suite(11, 'Allocated Hours: the Unallocated pool, allocation records, Remaining, Scheduled, Total and Amount move together; the Remaining popup reconciles exactly to the displayed Remaining', async () => {
    const before = sig(E);
    let rp = await remPopup();
    check('Remaining popup: Unallocated 100, records 12.5 + 7.25, Allocated 19.75, Remaining 80.25 == Programs Remaining == Summary Remaining', !!rp && rp.unalloc === 100 && rp.records.length === 2 && rp.allocated === 19.75 && rp.remaining === 80.25 && E.pc(A, 'Remaining Hrs') === 80.25 && E.sumRowVals(A, /Unallocated \(Remaining\)/).hours === 80.25, rp);
    // pool 100 -> 150: Remaining +50, Total +50, Scheduled unchanged, Amount(Net) +50 x 74.28
    $(unInp()).val('150').trigger('input'); await E.until(() => E.pc(A, 'Remaining Hrs') === 130.25, 4000); await E.settle();
    check('pool 150: Remaining 130.25, Total 1140, Scheduled still 1009.75, Amount(Net) 1140 x 74.28 = 84,679.20', E.pc(A, 'Remaining Hrs') === 130.25 && E.pc(A, 'Total') === 1140 && E.pc(A, 'Scheduled Hrs') === 1009.75 && E.pc(A, 'Amount (Net)') === 84679.2, [E.pc(A, 'Remaining Hrs'), E.pc(A, 'Total'), E.pc(A, 'Amount (Net)')].join('/'));
    reconcile(E, 'after pool 150');
    // add a record: 10h, undated -> Scheduled +10, Remaining -10, Total unchanged, Amount unchanged (allocating MOVES hours)
    const totBefore = E.pc(A, 'Total'), amtBefore = E.pc(A, 'Amount (Net)');
    const row = await addAllocRow(10, 'Coverage');
    check('new 10h record: Scheduled 1019.75, Remaining 120.25, Total and Amount UNCHANGED (allocating moves hours, never creates them)', E.pc(A, 'Scheduled Hrs') === 1019.75 && E.pc(A, 'Remaining Hrs') === 120.25 && E.pc(A, 'Total') === totBefore && E.pc(A, 'Amount (Net)') === amtBefore, [E.pc(A, 'Scheduled Hrs'), E.pc(A, 'Remaining Hrs'), E.pc(A, 'Total'), E.pc(A, 'Amount (Net)')].join('/'));
    rp = await remPopup(); check('Remaining popup lists 3 records, Allocated 29.75, Remaining 120.25 (live, no reopen needed)', !!rp && rp.records.length === 3 && rp.allocated === 29.75 && rp.remaining === 120.25 && rp.unalloc === 150, rp);
    reconcile(E, 'after adding an allocation record');
    // edit the record 10 -> 4.5
    const ins = [...row.querySelectorAll('input[type="text"]')]; $(ins[1]).val('4.5').trigger('input').trigger('change').trigger('blur'); await E.until(() => E.pc(A, 'Scheduled Hrs') === 1014.25, 4000); await E.settle();
    check('editing the record to 4.5: Scheduled 1014.25, Remaining 125.75', E.pc(A, 'Scheduled Hrs') === 1014.25 && E.pc(A, 'Remaining Hrs') === 125.75, E.pc(A, 'Scheduled Hrs') + '/' + E.pc(A, 'Remaining Hrs'));
    rp = await remPopup(); check('popup follows the edit: Allocated 24.25, Remaining 125.75', !!rp && rp.allocated === 24.25 && rp.remaining === 125.75, rp);
    const ap = await amtPopup(A); check('Amount breakdown: Allocated 24.25 + Remaining 125.75 rows present, rows sum to the Program Total = Programs Amount (Net)', !!ap && ap.rows === 5 && near(ap.rowSum, ap.total) && ap.total === E.pc(A, 'Amount (Net)') && ap.totalHours === E.pc(A, 'Total'), ap);
    // delete the record + restore the pool
    const del = [...row.querySelectorAll('button')].find(b => /Del/.test(b.textContent)); $(del).trigger('click'); await flush(500); await E.settle();
    $(unInp()).val('100').trigger('input'); await E.until(() => E.pc(A, 'Remaining Hrs') === 80.25, 4000); await E.settle();
    check('deleting the record and restoring the pool returns every figure byte-identically', sig(E) === before, 'signature differs');
    reconcile(E, 'after restoring the pool');
    // overallocation: records exceed the pool -> negative Remaining, Total = Scheduled + negative remaining
    $(unInp()).val('10').trigger('input'); await E.until(() => E.pc(A, 'Remaining Hrs') === -9.75, 4000); await E.settle();
    check('pool 10 with 19.75 allocated: Remaining -9.75, Total = 1009.75 - 9.75 = 1000', E.pc(A, 'Remaining Hrs') === -9.75 && E.pc(A, 'Total') === 1000, E.pc(A, 'Remaining Hrs') + '/' + E.pc(A, 'Total'));
    reconcile(E, 'after overallocation');
    $(unInp()).val('100').trigger('input'); await E.until(() => E.pc(A, 'Remaining Hrs') === 80.25, 4000); await E.settle();
    check('restored', sig(E) === before, 'signature differs');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 12. Popup reconciliation across the board ═══ */
  await suite(12, 'Popup reconciliation: Day, Rotation Week, Calendar Week, Remaining Hours and Amount breakdown popups each reconcile exactly to the value that opened them, for every school and both programs', async () => {
    await E.allocOn(A); await expandRot(); if (!(E.det().wkRot && E.det().wkRot[A] && E.det().wkRot[A].cells && E.det().wkRot[A].cells['0|1'] !== undefined)) { rotCtl().setRotation('0', 2); await flush(600); await E.settle(); }
    await expandWeeks(); await viewBase();
    const o = oracleA(); const problems = [];
    for (let si = 0; si < 3; si++) for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) { const vis = E.allocCellCnt(A, si, day); const dp = await dayPopup(si, day); if (!dp || dp.total !== vis) problems.push({ popup: 'Day', si, day, visible: vis, popup_total: dp && dp.total }); }
    check('Day popups: 15 school x day popups all total exactly their visible Days count', problems.length === 0, problems.slice(0, 5));
    const rp1 = await rotPopup(0, 1), rp2 = await rotPopup(0, 2);
    check('Rotation popups (Lincoln weeks 1 + 2) total exactly their visible counts and their own subtotals', rp1 && rp2 && rp1.total === rotCellCnt(0, 1) && rp1.sub === rp1.total && rp2.total === rotCellCnt(0, 2) && rp2.sub === rp2.total, [rp1, rp2]);
    const wkProblems = [];
    for (let si = 0; si < 3; si++) for (const iso of ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']) { const vis = wkovCellCnt(si, iso); const wp = await wkPopup(si, iso); if (!wp || wp.total !== vis || wp.sub !== vis) wkProblems.push({ popup: 'Week', si, iso, visible: vis, pop: wp }); }
    check('Week popups: 12 school x week popups all total their visible count and their date subtotals', wkProblems.length === 0, wkProblems.slice(0, 4));
    // Week count vs the oracle's per-date staff counts for that school/week
    const oc = (si, mIso) => { let n = 0; Object.keys(o.dateRows).forEach(k => { if (mondayIso(k) !== mIso) return; o.dateRows[k].forEach(r => { if (r.si === si) n += r.cnt; }); }); return n; };
    check('Weeks counts equal the oracle\'s per-date staff counts (Lincoln 30, Roosevelt 20, Jefferson 10 per week)', wkovCellCnt(0, '2026-08-03') === oc(0, '2026-08-03') && wkovCellCnt(1, '2026-08-10') === oc(1, '2026-08-10') && wkovCellCnt(2, '2026-08-24') === oc(2, '2026-08-24'), [wkovCellCnt(0, '2026-08-03'), oc(0, '2026-08-03'), wkovCellCnt(1, '2026-08-10'), oc(1, '2026-08-10')].join('/'));
    // Amount breakdown for both programs from the Programs table; and from the Program Summary + PG Summary
    for (const id of [A, B]) { const ap = await amtPopup(id); check('Amount breakdown (' + id + '): rows sum EXACTLY to Program Total; total == Programs Amount (Net) == PG Summary Amount; hours == Total', !!ap && near(ap.rowSum, ap.total) && ap.total === E.pc(id, 'Amount (Net)') && ap.total === E.gRow(id).amount && ap.totalHours === E.pc(id, 'Total') && near(ap.rowHours, ap.totalHours), ap); }
    const sumAmtCell = E.sumRow(A, /Scheduled Hours/) && E.sumCard(A).querySelector('.pg-amt-clickable');
    if (sumAmtCell) { sumAmtCell.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.pg-amt-break-dd'); const tot = dd && [...dd.querySelectorAll('tr')].find(r => /Program Total/.test(r.textContent)); check('the Program Summary entry point opens the SAME breakdown (Program Total = Programs Amount (Net))', !!tot && num(tot.children[tot.children.length - 1].textContent) === E.pc(A, 'Amount (Net)'), tot && tot.textContent); await closePops(); }
    const gAmt = E.gCard().querySelector('.pg-amt-clickable');
    if (gAmt) { gAmt.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(300); const dd = d.querySelector('.pg-amt-break-dd'); const tot = dd && [...dd.querySelectorAll('tr')].find(r => /Program Total/.test(r.textContent)); check('the Planning Guide Summary entry point opens the same breakdown too', !!tot && num(tot.children[tot.children.length - 1].textContent) === E.gRows()[0].amount, tot && tot.textContent); await closePops(); }
    const rp = await remPopup(); const sumRem = E.sumCard(A).querySelector('.pg-rem-clickable');
    check('Remaining popup from the Programs table reconciles (Unallocated - Allocated = Remaining = Programs = Summary)', !!rp && near(rp.unalloc - rp.allocated, rp.remaining) && rp.remaining === E.pc(A, 'Remaining Hrs') && !!sumRem, rp);
    // the calendar tips reconcile to their cells for every date of both programs
    const tipProblems = [];
    for (const id of [A, B]) for (const c2 of E.dayCells(id).filter(x => E.dayHrs(id, x.getAttribute('data-date-key')) > 0).slice(0, 6)) { const iso = c2.getAttribute('data-date-key'); const t = await E.tipFor(id, iso); const oo = oracleCal(W, E.det(), id); const exp = r2((oo.byDate[iso] || 0) + (oo.allocByDate[iso] || 0)); const act = t.tip ? tipTotal(t.tip) : null; if (act !== exp) tipProblems.push({ calId: id, date: iso, expected: exp, actual: act, cell: E.dayHrs(id, iso) }); await E.tipClose(t.cell); }
    check('hover breakdown popups total exactly their date\'s hours (schedule + dated allocation), 12 dates across both programs', tipProblems.length === 0, tipProblems);
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 13. Precision and rounding ═══ */
  await suite(13, 'Precision and rounding: PPH (Net) is rounded to the cent ONCE and that rounded rate drives every Amount; no hidden precision anywhere; totals sum to the cent', async () => {
    const before = sig(E); await E.discExpand();
    const pi = E.pcInput(A, 'PPH'); $(pi).val('86.75').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 80.24, 5000); await E.settle();
    // 86.75 x 0.925 = 80.24375 -> 80.24 (not 80.25, not 80.243750)
    check('$86.75 - 7.5% = 80.24375 rounds to $80.24 in the Programs table', E.pc(A, 'PPH (Net)') === 80.24, E.pc(A, 'PPH (Net)'));
    const cells = [E.pc(A, 'PPH (Net)'), E.sumRowVals(A, /Scheduled Hours/).pph, E.gRow(A).pph, E.discVal(A, 'pg-disc-price')];
    check('the SAME $80.24 appears in Programs, Program Summary, PG Summary and Discounts', cells.every(v => v === 80.24), cells.join('/'));
    const amts = [E.pc(A, 'Amount (Net)'), E.gRow(A).amount, E.discVal(A, 'pg-disc-amount')];
    check('Amount (Net) = 1090 x 80.24 = $87,461.60 exactly, identical in Programs, PG Summary and Discounts (NOT 1090 x 80.24375 = 87,465.69)', amts.every(v => v === 87461.6), amts.join('/'));
    check('Savings = Amount - Amount (Net) = 94,557.50 - 87,461.60 = 7,095.90 exactly', E.discVal(A, 'pg-disc-savings') === 7095.9 && E.pc(A, 'Amount') === 94557.5, E.discVal(A, 'pg-disc-savings') + '/' + E.pc(A, 'Amount'));
    const ss = E.sumSchools(A); check('Program Summary school amounts each = hours x 80.24 (Lincoln 495 x 80.24 = 39,718.80)', !!ss.find(x => x.name === 'Lincoln' && x.amount === 39718.8) && ss.every(x => near(x.amount, r2(x.hours * 80.24))), JSON.stringify(ss));
    const ap = await amtPopup(A); check('the Amount breakdown rows sum to the cent to its Program Total (no hidden precision)', !!ap && ap.rowSum === ap.total && ap.total === 87461.6, ap);
    const gt = E.gTot(); const expA = r2(87461.6 + E.pc(B, 'Amount (Net)')); const expH = r2(1090 + E.pc(B, 'Total'));
    check('PG Summary total Amount = sum of the two program net amounts to the cent; weighted PPH (Net) = total amount / total hours rounded', gt.amount === expA && gt.hours === expH && gt.pph === r2(expA / expH), JSON.stringify(gt) + ' exp ' + expA + '/' + expH);
    check('cal_b (no discount): PPH (Net) == PPH ($95.00) and Amount (Net) == Amount', E.pc(B, 'PPH (Net)') === 95 && E.pc(B, 'Amount (Net)') === E.pc(B, 'Amount'), E.pc(B, 'PPH (Net)') + '/' + E.pc(B, 'Amount (Net)') + '/' + E.pc(B, 'Amount'));
    reconcile(E, 'after PPH 86.75');
    // a fractional-cent base rate keeps to two decimals everywhere
    $(pi).val('80.305').trigger('input'); await E.settle();
    const badMoney = [...pl().querySelectorAll('td,span,div')].map(t => (t.children.length ? '' : t.textContent.trim())).filter(t => /^-?\$\d/.test(t) && !/^-?\$[\d,]+\.\d{2}$/.test(t));
    check('a 3-decimal PPH entry never leaks extra precision into any displayed money cell (every $ figure has exactly two decimals)', badMoney.length === 0, badMoney.slice(0, 5));
    $(pi).val('80.30').trigger('input'); await E.until(() => E.pc(A, 'PPH (Net)') === 74.28, 5000); await E.settle();
    check('restored', sig(E) === before, 'signature differs');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 14. Import / export regression ═══ */
  await suite(14, 'Import/export: a guide carrying overrides, disabled days and weeks, a rotation, special days, an extra shift and allocations re-imports to IDENTICAL figures; imported disabled items show disabled and re-enable correctly', async () => {
    await E.allocOn(A); await expandRot(); await expandWeeks(); await viewBase();
    // build a rich state through the real UI
    await E.setDay(A, 0, 'wed', false);                     // Base day off (Lincoln Wed)
    $(wkovCircle(1, '2026-08-17')).trigger('click'); await flush(600);   // Weeks override off (Roosevelt Aug 17)
    rotCtl().setRotation('0', 2); await flush(600);                       // Lincoln 2-week rotation
    await setWeekCount('Lincoln', 2, 'ctkk', 'mon', 8);                   // rotation-week count override
    await viewWk(2); const hBefore = (function () { try { W._pgHist.flushNow(); return W._pgHist.list(GID).length; } catch (e) { return -1; } })();
    await E.setDay(A, 0, 'tue', false); await viewBase();  // rotation-week day disable
    check('the rotation-week day disable writes ONE History record with the spec wording', (function () { try { W._pgHist.flushNow(); const l = W._pgHist.list(GID); return hBefore < 0 || (l.length === hBefore + 1 && /Disabled Tuesday for Lincoln in Rotation Week 2/.test(JSON.stringify(l[0]))); } catch (e) { return false; } })(), (function () { try { return JSON.stringify(W._pgHist.list(GID)[0]).slice(0, 200); } catch (e) { return '?'; } })());
    const snk = [...d.querySelectorAll('.pg-undo-snack .pg-undo-text')].pop(); check('an Undo is offered for the rotation-week day disable', !!snk && /Rotation Week 2/.test(snk.textContent), snk && snk.textContent);
    await markCell('2026-08-12', 'Min Day');                              // special day
    await addXS('2026-08-13', 'Jefferson', 'ctkk', '9:00 AM', '10:30 AM', 2); // extra shift
    await addAllocRow(6, 'Import test');                                  // allocation record
    await setDateCount('2026-08-14', 'Roosevelt', 0, 5);                  // per-date count override
    await E.settle();
    const rich = sig(E); const oRich = oracleA();
    reconcile(E, 'rich state before export');
    check('the rich state carries all seven layers (day off, week off, rotation + override + rot-day off, Min Day, extra shift, allocation, date override)', E.det().staffAlloc.c0.cells['0|wed'] === false && E.det().wkOv[A]['1|2026-08-17'] === false && E.det().wkRotHrs[A]['0|2|ctkk|mon'] && W._pgAllocRotDayDisabled(GID, A, 0, 2, 'tue') && E.det().calMarkers[A + '|2026-08-12'] && E.det().calExtraShifts[A + '|2026-08-13'] && E.det().unschedByCal[A].rows.length === 3 && E.det().calCellOverrides[A + '|2026-08-14|1|ctkk'], 'a layer is missing');
    // export = the guide's own payload path
    const exported = JSON.stringify({ type: 'planning-guide', guide: { id: GID, name: 'Chains', status: 'Draft' }, data: JSON.parse(JSON.stringify(E.det())) });
    check('the export payload CARRIES the rotation-week day disable (a fresh session must be able to restore it)', /"0\|2\|tue"|0\|2\|tue/.test(exported), 'no rotation-week day-off state found in the payload');
    // simulate a fresh session: the in-memory disable flag is gone; only the payload can bring it back
    W._pgAllocRotDaySetDisabled(GID, A, 0, 2, 'tue', false);
    await importGuide(dom, E.c, exported); await flush(1500); await E.settle();
    await E.allocOn(A); await expandRot(); await expandWeeks(); await viewBase();
    const r = reconcile(E, 'immediately after re-import');
    check('re-imported guide reproduces EVERY figure of the exported state byte-identically (Programs, summaries, day cells, counts, __pgCalc)', sig(E) === rich, (function () { try { const a = JSON.parse(rich), b = JSON.parse(sig(E)); return { pcBefore: a.cal_a.pc, pcAfter: b.cal_a.pc, cellsDiff: a.cal_a.cells.filter((x, i) => x !== b.cal_a.cells[i]).slice(0, 4) }; } catch (e) { return 'signature differs'; } })());
    check('imported Lincoln Wednesday shows DISABLED in the matrix (unchecked, no staff count)', !E.allocCb(A, 0, 'wed').checked && !(E.allocCellCnt(A, 0, 'wed') > 0), E.allocCb(A, 0, 'wed').checked + '/' + E.allocCellCnt(A, 0, 'wed'));
    check('imported Roosevelt Aug 17 Weeks override shows OFF (no count, unchecked circle)', wkovCellCnt(1, '2026-08-17') === null && !wkovCircle(1, '2026-08-17').classList.contains('is-checked'), wkovCellCnt(1, '2026-08-17'));
    check('imported rotation + week-2 override survive (Rotation Week 2 count 21: 30 - 6 Base Wed off + 3 override - 6 Tuesday off)', rotCellCnt(0, 2) === 21 && String(E.det().wkRotHrs[A]['0|2|ctkk|mon'].count) === '8', rotCellCnt(0, 2));
    await viewWk(2); check('imported rotation-week-2 Tuesday shows DISABLED in the week-2 Days view', !(E.allocCellCnt(A, 0, 'tue') > 0) && !E.allocCb(A, 0, 'tue').checked, E.allocCellCnt(A, 0, 'tue') + '/' + E.allocCb(A, 0, 'tue').checked);
    // re-enable the imported disabled items
    await E.setDay(A, 0, 'tue', true); await viewBase(); await E.setDay(A, 0, 'wed', true); $(wkovCircle(1, '2026-08-17')).trigger('click'); await flush(600); await E.settle();
    const o2 = oracleA();
    check('re-enabling the imported disabled day, rotation day and week restores exactly the oracle\'s figures (Scheduled ' + o2.sched + ')', E.pc(A, 'Scheduled Hrs') === o2.sched && E.allocCellCnt(A, 0, 'wed') === 6 && wkovCellCnt(1, '2026-08-17') !== null, E.pc(A, 'Scheduled Hrs'));
    reconcile(E, 'after re-enabling imported disabled items');
    // an export of the CLEAN baseline re-imports clean (idempotent)
    await importGuide(dom, E.c, fx()); await flush(1500); await E.settle();
    await E.allocOn(A); await viewBase();
    const base = sig(E); const again = JSON.stringify({ type: 'planning-guide', guide: { id: GID, name: 'Chains', status: 'Draft' }, data: JSON.parse(JSON.stringify(E.det())) });
    await importGuide(dom, E.c, again); await flush(1500); await E.settle(); await E.allocOn(A); await viewBase();
    check('export -> import of the baseline is idempotent (identical figures)', sig(E) === base, 'signature differs');
    reconcile(E, 'after idempotent re-import');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 15. Performance ═══ */
  await suite(15, 'Performance: propagation latency is bounded across price, count, time and day-toggle edits; DOM node and body-portal counts return to baseline after churn', async () => {
    const { bodyPortalCount, domNodeCount } = require('./testutil');
    await E.allocOn(A); await viewBase(); await E.settle();
    const lat = { price: [], count: [], time: [], day: [] };
    const pi = E.pcInput(A, 'PPH');
    for (const p of [90, 100, 75.5, 120, 80.30, 99.99]) { $(pi).val(String(p)).trigger('input'); const t = await E.until(() => E.pc(A, 'PPH (Net)') === r2(p * 0.925) || E.pc(A, 'PPH (Net)') === 74, 5000); lat.price.push(t < 0 ? 5000 : t); }
    $(pi).val('80.30').trigger('input'); await E.settle();
    const inp = sbCountInput(A, 0, 'ctkk');
    for (const v of [6, 7, 4, 8, 5]) { const exp = r2(1009.75 + (v - 5) * 79); $(inp).val(String(v)).trigger('input'); const t = await E.until(() => E.pc(A, 'Scheduled Hrs') === exp, 5000); lat.count.push(t < 0 ? 5000 : t); }
    await E.settle();
    const endCell = () => timeCell(A, 'Coaches', 'end', 'Monday');
    for (const v of ['7:00 PM', '5:00 PM', '6:00 PM']) { const prev = E.pc(A, 'Scheduled Hrs'); await setTime(endCell(), v); const t = await E.until(() => { const s2 = E.pc(A, 'Scheduled Hrs'); return s2 !== prev && near(s2, oracleA().sched); }, 5000); lat.time.push(t < 0 ? 5000 : t); }
    await E.settle();
    for (let i = 0; i < 3; i++) { const cb = E.allocCb(A, 0, 'thu'); cb.checked = false; $(cb).trigger('change'); let t = await E.until(() => E.pc(A, 'Scheduled Hrs') === 909.75, 5000); lat.day.push(t < 0 ? 5000 : t); const cb2 = E.allocCb(A, 0, 'thu'); cb2.checked = true; $(cb2).trigger('change'); t = await E.until(() => E.pc(A, 'Scheduled Hrs') === 1009.75, 5000); lat.day.push(t < 0 ? 5000 : t); }
    await E.settle();
    const stats = a => { const s = a.slice().sort((x, y) => x - y); const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: a.length, med: q(0.5), p95: q(0.95), max: s[s.length - 1] }; };
    const S = { price: stats(lat.price), count: stats(lat.count), time: stats(lat.time), day: stats(lat.day) };
    console.log('   latency ms: ' + JSON.stringify(S));
    check('every edit propagated (no 5s timeouts)', Object.keys(lat).every(k => lat[k].every(x => x < 5000)), JSON.stringify(S));
    check('price edits reprice the chain fast (p95 <= 1500ms on this host)', S.price.p95 <= 1500, S.price);
    check('count / time / day-toggle edits each land under 3s (p95)', S.count.p95 <= 3000 && S.time.p95 <= 3000 && S.day.p95 <= 3000, JSON.stringify(S));
    check('figures are back at the baseline after the latency storm', E.pc(A, 'Scheduled Hrs') === 1009.75 && E.pc(A, 'PPH (Net)') === 74.28, E.pc(A, 'Scheduled Hrs') + '/' + E.pc(A, 'PPH (Net)'));
    reconcile(E, 'after the latency storm');
    // DOM stability: popups + collapse churn + edits, then back to baseline counts
    // One warm-up round first so reusable containers (the hover tip keeps its last content) are in
    // their steady state; the baseline is taken AFTER it. Then six rounds must add nothing.
    const round = async (i) => { await dayPopup(0, 'mon'); await remPopup(); await amtPopup(A); await openSchoolPopup('Lincoln'); await closeSchoolPopup(); await openSchoolPopup('Roosevelt'); W._pgCloseSchoolShPopups({ target: d.body }); await flush(200); const t = await E.tipFor(A, '2026-08-04'); await E.tipClose(t.cell); $(pi).val(String(85 + i)).trigger('input'); await flush(60); };
    await round(0); $(pi).val('80.30').trigger('input'); await E.settle(); await closePops(); await closeSchoolPopup(); $(d.body).trigger('click'); await flush(300);
    const n0 = domNodeCount(d), p0 = bodyPortalCount(d);
    for (let i = 1; i <= 6; i++) await round(i);
    $(pi).val('80.30').trigger('input'); await E.settle(); await closePops(); await closeSchoolPopup(); $(d.body).trigger('click'); await flush(300);
    const n1 = domNodeCount(d), p1 = bodyPortalCount(d);
    check('6 rounds of popup open/close (incl. the per-school popup closed by an outside click) + edits never grow the body-portal count: no leaked time pickers or menus', p1 <= p0, p0 + ' -> ' + p1);
    check('DOM node count stays at baseline (no growth)', Math.abs(n1 - n0) <= 10, n0 + ' -> ' + n1);
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });

  /* ═══ 16. Rapid sequential interaction ═══ */
  await suite(16, 'Rapid interaction: bursts of edits fired without waiting settle to EXACTLY the last input everywhere; interleaved edits across surfaces settle consistently', async () => {
    const before = sig(E); await E.allocOn(A); await viewBase();
    const pi = E.pcInput(A, 'PPH');
    let h0 = -1; try { W._pgHist.flushNow(); h0 = W._pgHist.list(GID).length; } catch (e) {}
    [55, 61, 72.25, 88, 90, 99.5, 101, 77.77, 120, 80.30].forEach(v => $(pi).val(String(v)).trigger('input'));
    await flush(700); await E.until(() => E.pc(A, 'PPH (Net)') === 74.28, 5000); await E.settle();
    check('10 price edits fired back-to-back settle on the LAST one ($80.30 -> net $74.28) on every surface', E.pc(A, 'PPH (Net)') === 74.28 && E.gRow(A).pph === 74.28 && E.discVal(A, 'pg-disc-price') === 74.28, [E.pc(A, 'PPH (Net)'), E.gRow(A).pph, E.discVal(A, 'pg-disc-price')].join('/'));
    const inp = sbCountInput(A, 0, 'ctkk');
    [9, 3, 8, 2, 11, 5].forEach(v => $(inp).val(String(v)).trigger('input'));
    await flush(700); await E.until(() => E.pc(A, 'Scheduled Hrs') === 1009.75, 5000); await E.settle();
    check('6 count edits fired back-to-back settle on the last (5) with the baseline 1009.75', E.pc(A, 'Scheduled Hrs') === 1009.75 && sbCountInput(A, 0, 'ctkk').value === '5', E.pc(A, 'Scheduled Hrs'));
    let h1 = -1; try { W._pgHist.flushNow(); h1 = W._pgHist.list(GID).length; } catch (e) {}
    check('History grouped the two bursts (16 keystrokes produced at most 3 records, never one per keystroke)', h0 < 0 || h1 < 0 || (h1 - h0) <= 3, h0 + ' -> ' + h1);
    // interleave: count, price, day toggle, pool in one burst; expected final = count 6 (+79), price 100 (net 92.5), Wed off (-100 + ... Lincoln wed with 6 coaches = 29 x 4 = -116 ...) -> compute via oracle
    $(inp).val('6').trigger('input'); $(pi).val('100').trigger('input'); const cb = E.allocCb(A, 0, 'wed'); cb.checked = false; $(cb).trigger('change'); $(unInp()).val('120').trigger('input');
    await flush(300); await E.settle();
    const o = oracleA();
    check('an interleaved burst (count 6, PPH 100, Lincoln Wed off, pool 120) settles to the oracle: Scheduled ' + o.sched + ', Remaining ' + o.rem + ', PPH (Net) ' + o.netP + '; the Monday cells show 54 hrs / 13 staff', E.pc(A, 'Scheduled Hrs') === o.sched && E.pc(A, 'Remaining Hrs') === o.rem && E.pc(A, 'PPH (Net)') === o.netP && E.dayHrs(A, '2026-08-03') === 54 && E.dayCnt(A, '2026-08-03') === 13, [E.pc(A, 'Scheduled Hrs'), E.pc(A, 'Remaining Hrs'), E.pc(A, 'PPH (Net)'), E.dayHrs(A, '2026-08-03'), E.dayCnt(A, '2026-08-03')].join('/'));
    check('oracle sanity for the burst: Scheduled = 1009.75 + 79 - 4 x (6x4+5) = 972.75, Remaining 100.25, net 92.50', o.sched === 972.75 && o.rem === 100.25 && o.netP === 92.5, [o.sched, o.rem, o.netP].join('/'));
    reconcile(E, 'after the interleaved burst');
    // rapid Weeks circle toggles x5 -> back on
    await expandWeeks(); for (let i = 0; i < 5; i++) { $(wkovCircle(0, '2026-08-24')).trigger('click'); await flush(40); $(wkovCircle(0, '2026-08-24')).trigger('click'); await flush(40); }
    await E.settle();
    check('5 rapid Weeks on/off pairs leave the week ON with its count intact', wkovCellCnt(0, '2026-08-24') !== null && E.pc(A, 'Scheduled Hrs') === o.sched, wkovCellCnt(0, '2026-08-24') + '/' + E.pc(A, 'Scheduled Hrs'));
    // restore
    $(sbCountInput(A, 0, 'ctkk')).val('5').trigger('input'); $(E.pcInput(A, 'PPH')).val('80.30').trigger('input'); const cb2 = E.allocCb(A, 0, 'wed'); cb2.checked = true; $(cb2).trigger('change'); $(unInp()).val('100').trigger('input');
    await E.until(() => E.pc(A, 'Scheduled Hrs') === 1009.75 && E.pc(A, 'PPH (Net)') === 74.28 && E.pc(A, 'Remaining Hrs') === 80.25, 5000); await E.settle();
    // the calendar repaint (80ms count timer + the _updateHours pass) must land on its own: the burst is
    // followed only by settle, never by a manual refresh
    const lat = await E.until(() => E.dayHrs(A, '2026-08-03') === 50 && E.dayCnt(A, '2026-08-03') === 12, 3000);
    check('the calendar day cells repaint to the settled data on their own (Aug 3 back to 50 hrs / 12 staff)', lat >= 0, E.dayHrs(A, '2026-08-03') + '/' + E.dayCnt(A, '2026-08-03'));
    check('restoring in one burst returns every figure byte-identically', sig(E) === before, 'signature differs');
    reconcile(E, 'after restoring the burst');
    check('no errors', E.errs() === 0, dom.pageErrors.slice(0, 2));
  });
  /* @@MORE@@ */

  console.log('\n' + (defects.length ? ('CAPTURED DEFECTS:\n' + defects.map(x => '  ' + JSON.stringify(x).slice(0, 900)).join('\n') + '\n') : '') +
    'TOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
