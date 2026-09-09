// t131_rotday_inherit_total.js — TWENTY-THIRD SPEC (two parts).
// PART 1 — Rotation-Week Day checkboxes are a THREE-STATE override over the Base Day checkbox:
//   no override -> inherit the current Base state live; an explicit click -> a true/false override
//   (subtly highlighted); right-click an overridden cell -> Remove Override (restores inheritance).
// PART 2 — a Total row at the bottom of the Staffing Allocation table sums the currently VISIBLE
//   staff-count columns across Days (for the selected Base/Rotation view), Rotation, and Weeks, and
//   updates immediately after any dependent change, reconciling cell-for-cell with the school rows.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  const data = {
    status: 'Draft', showAllocStaffCount: true,
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [
      { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
      { school: 'Roosevelt', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }
    ] },
    siteRows: [
      { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
      { school: 'Roosevelt', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }
    ],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    wkRot: { cal_a: { count: 2, cells: { '0|1': true, '0|2': true, '1|1': true, '1|2': true } } }
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'RD', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(2000); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const GID = 'pg-001', A = 'cal_a';
  const t = () => pl().querySelector('.sf-alloc-table');
  const openAlloc = async () => { const cb = [...pl().querySelectorAll('.sf-alloc-toggle-cb')][0]; if (cb && !cb.checked) { $(cb).prop('checked', true).trigger('change'); await flush(700); } };
  const dv = async (w) => { const c2 = w > 0 ? t().querySelector('.sf-alloc-dv-wk[data-dv="' + w + '"]') : t().querySelector('.sf-alloc-dv-base'); $(c2).trigger('click'); await flush(400); };
  const cell = (si, dk) => t().querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + dk + '"]');
  const chk = (si, dk) => { const b = cell(si, dk) && cell(si, dk).querySelector('input.sf-alloc-cb'); return b ? b.checked : null; };
  const hasOvHi = (si, dk) => cell(si, dk) && cell(si, dk).classList.contains('sf-alloc-day-ov');
  const setBase = async (si, dk, on) => { await dv(0); await flush(120); const b = cell(si, dk).querySelector('input.sf-alloc-cb'); b.checked = on; $(b).trigger('change'); await flush(600); };
  const setRot = async (w, si, dk, on) => { await dv(w); await flush(120); const b = cell(si, dk).querySelector('input.sf-alloc-cb'); b.checked = on; $(b).trigger('change'); await flush(600); };
  const ov = (si, w, dk) => W._pgAllocRotDayOv(GID, A, si, w, dk);
  const expandRot = async () => { const v = t().querySelector('td.sf-wkrot-vert'); if (v && !t().querySelector('td.sf-wkrot-cell')) { $(v).trigger('click'); await flush(400); } };
  const expandWeeks = async () => { const v = t().querySelector('td.sf-wkov-vert'); if (v && !t().querySelector('td.sf-wkov-cell')) { $(v).trigger('click'); await flush(400); } };
  const totDay = (dk) => { const c2 = t().querySelector('td.sf-alloc-total-day[data-total-day="' + dk + '"]'); return c2 ? c2.textContent.trim() : '(none)'; };
  const totRot = (w) => { const c2 = t().querySelector('td.sf-alloc-total-rot[data-total-rot="' + w + '"]'); return c2 ? c2.textContent.trim() : '(none)'; };
  const totWk = (i) => { const c2 = t().querySelector('td.sf-alloc-total-wk[data-total-wk="' + i + '"]'); return c2 ? c2.textContent.trim() : '(none)'; };
  const cellCnt = (sel) => { const c2 = t().querySelector(sel); const sp = c2 && c2.querySelector('.sf-cell-cnt'); return sp ? parseInt(sp.textContent, 10) : 0; };
  const sumSel = (sel) => { let s = 0; t().querySelectorAll(sel).forEach(c2 => { const sp = c2.querySelector('.sf-cell-cnt'); if (sp) { const v = parseInt(sp.textContent, 10); if (!isNaN(v)) s += v; } }); return s; };

  /* ═══ 1. Rotation-Week Day inherits Base; changing Base propagates to weeks without an override ═══ */
  await suite('A Rotation-Week Day with no override inherits the Base checkbox and follows Base changes', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    await dv(2);
    check('RW2 Monday (no override) inherits Base = checked', chk(0, 'mon') === true, chk(0, 'mon'));
    check('and shows NO override highlight', hasOvHi(0, 'mon') === false);
    await setBase(0, 'mon', false);
    await dv(2);
    check('unchecking Base Monday immediately propagates to RW2 (inherits off)', chk(0, 'mon') === false && ov(0, 2, 'mon') === undefined, chk(0, 'mon') + '/' + ov(0, 2, 'mon'));
    check('still no override highlight (it is inherited, not overridden)', hasOvHi(0, 'mon') === false);
    await setBase(0, 'mon', true);
    await dv(2);
    check('re-checking Base restores the inherited RW2 checked state', chk(0, 'mon') === true);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. An explicit rotation click is an override, highlighted, and independent of Base ═══ */
  await suite('Clicking a Day in a Rotation Week creates a highlighted override that ignores later Base changes', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    await setRot(3 > W._pgAllocRotDayOv ? 2 : 2, 0, 'tue', false);   // RW2 Tuesday -> explicit OFF
    check('the click stored an explicit false override for RW2 Tuesday', ov(0, 2, 'tue') === false, ov(0, 2, 'tue'));
    check('the overridden cell is subtly highlighted', hasOvHi(0, 'tue') === true);
    check('the checkbox shows the override (unchecked)', chk(0, 'tue') === false);
    // change Base Tuesday off — the RW2 override must NOT change; RW1 (no override) follows Base
    await setBase(0, 'tue', false);
    await dv(2);
    check('RW2 Tuesday keeps its explicit override after Base changes', ov(0, 2, 'tue') === false && chk(0, 'tue') === false);
    await dv(1);
    check('RW1 Tuesday (no override) follows Base (now off)', chk(0, 'tue') === false && ov(0, 1, 'tue') === undefined, chk(0, 'tue'));
    // a force-ON override: Base off, but RW1 explicitly on
    await setRot(1, 0, 'tue', true);
    check('a force-ON override in RW1 (Base off) shows checked + highlighted', ov(0, 1, 'tue') === true && chk(0, 'tue') === true && hasOvHi(0, 'tue') === true, ov(0, 1, 'tue'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Remove Override via right-click restores inheritance ═══ */
  await suite('Right-click Remove Override restores Base inheritance and clears the highlight', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    await setRot(2, 0, 'wed', false);   // override RW2 Wednesday off
    await setBase(0, 'wed', false);     // Base Wednesday now also off (so inheritance == off)
    await dv(2);
    check('RW2 Wednesday has an override before removal', ov(0, 2, 'wed') === false && hasOvHi(0, 'wed') === true);
    // right-click -> Remove Override
    $('.sf-wkov-ctx').remove();
    cell(0, 'wed').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); await flush(200);
    const menu = d.querySelector('.sf-wkov-ctx');
    check('a Remove Override menu appears on the overridden cell', !!menu && /Remove Override/.test(menu.textContent), menu && menu.textContent.trim());
    if (menu) { $(menu.querySelector('.sf-wkov-ctx-item')).trigger('click'); await flush(500); }
    check('the override is deleted (inherits Base again)', ov(0, 2, 'wed') === undefined, ov(0, 2, 'wed'));
    check('the highlight is gone', hasOvHi(0, 'wed') === false);
    check('the checkbox now inherits Base (off)', chk(0, 'wed') === false);
    // a NON-overridden cell shows no menu
    $('.sf-wkov-ctx').remove();
    cell(0, 'thu').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); await flush(150);
    check('right-clicking a non-overridden cell shows NO Remove Override menu', !d.querySelector('.sf-wkov-ctx'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. The Total row exists and sums the Days section for the current view ═══ */
  await suite('The Total row sums the Days section, reconciling with the cells, per the selected view', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    check('a Total footer row exists', !!t().querySelector('tfoot.sf-alloc-total-foot') && !!t().querySelector('tr.sf-alloc-total-row'));
    check('the Total row is labelled "Total"', /Total/.test((t().querySelector('tr.sf-alloc-total-row td') || {}).textContent || ''));
    // Base: Lincoln 2 + Roosevelt 1 = 3 on Monday
    check('Base Days total Monday = 3 and reconciles with the two school cells', totDay('mon') === '3' && cellCnt('td.sf-alloc-cell[data-alloc-si="0"][data-alloc-day="mon"]') + cellCnt('td.sf-alloc-cell[data-alloc-si="1"][data-alloc-day="mon"]') === 3, totDay('mon'));
    check('every Days total equals the live sum of that column', ['mon','tue','wed','thu','fri'].every(dk => (totDay(dk) === '' ? 0 : parseInt(totDay(dk), 10)) === sumSel('td.sf-alloc-cell[data-alloc-day="' + dk + '"]')));
    // uncheck Lincoln Monday (in the BASE view) -> total drops to 1 immediately
    await dv(0); await flush(120);
    const lm = cell(0, 'mon').querySelector('input.sf-alloc-cb'); lm.checked = false; $(lm).trigger('change'); await flush(500);
    check('unchecking Lincoln Monday drops the Days total to 1 immediately', totDay('mon') === '1', totDay('mon'));
    // switch to a rotation view -> the Days total recomputes for that view (both inherit -> 3 again)
    await dv(2);
    check('switching to Rotation Week 2 recomputes the Days total for that view (Monday inherits Base=1)', totDay('mon') === '1', totDay('mon'));
    // re-check base and confirm the rotation-view total follows
    await setBase(0, 'mon', true);
    await dv(2);
    for (let i = 0; i < 12 && totDay('mon') !== '3'; i++) await flush(150);
    check('re-checking Base Monday brings the Rotation-view Days total back to 3 (Lincoln inherits on again)', chk(0, 'mon') === true && totDay('mon') === '3', chk(0, 'mon') + '/' + totDay('mon'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Rotation + Weeks section totals ═══ */
  await suite('The Total row sums the Rotation and Weeks sections, reconciling with their cells', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    await expandRot();
    // each rotation week: (Lincoln 2 + Roosevelt 1) staff x 5 weekdays = 15
    check('Rotation Week 1 total = 15 and reconciles with its column cells', totRot('1') === String(sumSel('td.sf-wkrot-cell[data-wkrot-week="1"]')) && totRot('1') === '15', totRot('1'));
    check('Rotation Week 2 total = 15', totRot('2') === '15', totRot('2'));
    await expandWeeks();
    check('each Weeks total equals the live sum of its column', ['1','2','3','4'].every(wi => { const c2 = t().querySelector('td.sf-alloc-total-wk[data-total-wk="' + wi + '"]'); if (!c2) return true; const shown = c2.textContent.trim() === '' ? 0 : parseInt(c2.textContent, 10); return shown === sumSel('td.sf-wkov-cell[data-wkov-idx="' + wi + '"]'); }));
    check('the first Weeks column has a positive total', (function () { const c2 = t().querySelector('td.sf-alloc-total-wk[data-total-wk="1"]'); return c2 && parseInt(c2.textContent, 10) > 0; })());
    // a rotation override that disables a day drops that rotation week's total
    await dv(1); const b = cell(0, 'mon').querySelector('input.sf-alloc-cb'); b.checked = false; $(b).trigger('change'); await flush(500);
    await expandRot();
    check('disabling Lincoln Monday in RW1 drops RW1 total by Lincoln\'s 2 (15 -> 13), RW2 unchanged (15)', totRot('1') === '13' && totRot('2') === '15', totRot('1') + '/' + totRot('2'));
    check('and RW1 total still reconciles with its cells', totRot('1') === String(sumSel('td.sf-wkrot-cell[data-wkrot-week="1"]')));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Import round-trip: overrides persist; totals recompute on load ═══ */
  await suite('Overrides ride import/export and the Total row recomputes correctly after import', async () => {
    await importGuide(dom, c, fixture()); await flush(300); await openAlloc();
    await setRot(2, 0, 'tue', false);   // an override to persist
    check('override set before export', ov(0, 2, 'tue') === false);
    const payload = JSON.stringify({ type: 'planning-guide', guide: { id: GID, name: 'RD', status: 'Draft' }, data: JSON.parse(JSON.stringify(W._pgGuideDetails()[GID])) });
    check('the export payload carries the rotation-day override', /allocRotDayOv/.test(payload) && /0\|2\|tue/.test(payload), 'payload');
    await importGuide(dom, c, payload); await flush(400); await openAlloc();
    check('after re-import the override is still present', W._pgAllocRotDayOv(GID, A, 0, 2, 'tue') === false, W._pgAllocRotDayOv(GID, A, 0, 2, 'tue'));
    await dv(2);
    check('the imported override still shows unchecked + highlighted', chk(0, 'tue') === false && hasOvHi(0, 'tue') === true);
    check('the Total row is present and non-stale after import (Days Monday = 3)', totDay('mon') === '3', totDay('mon'));
    // legacy allocRotDayOff migrates to an explicit false override
    await importGuide(dom, c, JSON.stringify({ type: 'planning-guide', guide: { id: GID, name: 'Legacy', status: 'Draft' }, data: Object.assign(JSON.parse(fixture()).data, { allocRotDayOff: { cal_a: { '0|2|fri': true } } }) })); await flush(400); await openAlloc();
    check('a legacy allocRotDayOff record migrates to an explicit force-off override', W._pgAllocRotDayOv(GID, A, 0, 2, 'fri') === false, W._pgAllocRotDayOv(GID, A, 0, 2, 'fri'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
