// t129_rotview_sync.js — TWENTY-FIRST SPEC (sync fix). Toggling a Rotation-Week Day from ANY entry
// point (the Staffing Allocation Days checkbox, the per-school Staffing Hours popup right-click, or
// the separated-section per-school table's own right-click) must IMMEDIATELY rerender the separated-
// section per-school Staffing Hours TABLE when it is currently showing that same School + Rotation
// Week — no view-switch required. Before the fix, that overlay table stayed stale until the user
// switched views and came back (the state changed, _recalcAll ran, but the .sf-shv-sec-prev overlay
// was never rebuilt). The fix calls _pgShvSecSyncAll() from both day-toggle paths.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  const data = {
    status: 'Draft',
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    siteRowsByCal: { cal_a: [
      { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
      { school: 'Roosevelt', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }
    ] },
    siteRows: [
      { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 },
      { school: 'Roosevelt', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }
    ],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    wkRot: { cal_a: { count: 2, cells: { '0|1': true, '0|2': true } } }
  };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'RS', status: 'Draft' }, data });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1800); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const GID = 'pg-001', A = 'cal_a';
  const RD = () => W._pgAllocRotDayDisabled;

  // Show Lincoln's Rotation Week 2 view in the separated section.
  const showSectionRW = async (w) => { const sel = [...pl().querySelectorAll('.sf-shv-sec-wk[data-shv="' + w + '"]')][0]; if (!sel) throw new Error('no section RW' + w + ' selector'); $(sel).trigger('click'); await flush(600); };
  const prev = () => pl().querySelector('.sf-shv-sec-prev');
  const dayTh = (dayK) => { const p = prev(); return p ? [...p.querySelectorAll('thead th[data-day="' + dayK + '"]')].pop() : null; };
  const struck = (dayK) => { const th = dayTh(dayK); return th ? /line-through/.test(th.style.textDecoration || '') : null; };
  const faded = (dayK) => { const p = prev(); if (!p) return null; const td = p.querySelector('tbody td[data-day="' + dayK + '"]'); return td ? (parseFloat(td.style.opacity) < 1) : null; };
  // alloc matrix Days view
  const openAlloc = async () => { const cb = [...pl().querySelectorAll('.sf-alloc-toggle-cb')][0]; if (cb && !cb.checked) { $(cb).prop('checked', true).trigger('change'); await flush(700); } };
  const daysViewWeek = async (w) => { const t = pl().querySelector('.sf-alloc-table'); const dv = t && t.querySelector('.sf-alloc-dv-wk[data-dv="' + w + '"]'); if (dv) { $(dv).trigger('click'); await flush(500); } };
  const daysCb = (si, dayK) => { const t = pl().querySelector('.sf-alloc-table'); return t && t.querySelector('td.sf-alloc-cell[data-alloc-si="' + si + '"][data-alloc-day="' + dayK + '"] input.sf-alloc-cb'); };
  const rclick = async (th) => { th.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true })); await flush(200); const m = d.querySelector('.pg-dayvis-ctx'); if (m) { $(m.querySelector('.pg-dayvis-ctx-item')).trigger('click'); await flush(700); } };
  const openPopup = async (name) => { W._pgCloseSchoolShPopups && W._pgCloseSchoolShPopups({ target: d.body }); await flush(150); const nm = [...pl().querySelectorAll('.sf-alloc-school-nm,.sf-strip-school-nm')].find(x => x.textContent.trim() === name); nm.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); await flush(700); return d.querySelector('.sf-sh-popup'); };
  const setPopupWeek = async (pop, w) => { const wc = pop.querySelector('.sf-shv-wk[data-shv="' + w + '"]'); $(wc).trigger('click'); await flush(500); };

  /* ═══ 1. Days checkbox -> the section table (already open on that RW) updates immediately ═══ */
  await suite('Days-checkbox toggle immediately restrikes the section table showing that Rotation Week', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    await showSectionRW(2);
    check('the section shows the Rotation-Week-2 table', !!prev());
    check('Wednesday starts NOT struck', struck('wed') === false, struck('wed'));
    await openAlloc(); await daysViewWeek(2);
    const cb = daysCb(0, 'wed');
    check('the Days view exposes Lincoln Wednesday (checked)', !!cb && cb.checked === true);
    cb.checked = false; $(cb).trigger('change'); await flush(700);
    check('the rotation-day state is now disabled', RD()(GID, A, 0, 2, 'wed') === true);
    // THE FIX: the section table (still open on RW2) shows the day struck WITHOUT a view switch
    check('the section table Wednesday header is IMMEDIATELY struck (no view switch)', struck('wed') === true, struck('wed'));
    check('and its Wednesday body column is faded', faded('wed') === true, faded('wed'));
    // re-enable restores immediately
    const cb2 = daysCb(0, 'wed'); cb2.checked = true; $(cb2).trigger('change'); await flush(700);
    check('re-enabling immediately clears the struck header', struck('wed') === false, struck('wed'));
    check('and un-fades the column', faded('wed') === false, faded('wed'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Section table's OWN right-click -> updates in place ═══ */
  await suite('The section table\u2019s own day-header right-click updates it in place', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    await showSectionRW(2);
    check('Tuesday starts NOT struck', struck('tue') === false);
    await rclick(dayTh('tue'));
    check('the right-click disabled Tuesday for RW2', RD()(GID, A, 0, 2, 'tue') === true);
    check('the section table Tuesday header is immediately struck', struck('tue') === true, struck('tue'));
    // restore
    await rclick(dayTh('tue'));
    check('a second right-click restores Tuesday immediately', RD()(GID, A, 0, 2, 'tue') === false && struck('tue') === false, struck('tue'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Popup right-click -> the section table (a DIFFERENT open surface) updates immediately ═══ */
  await suite('A popup right-click immediately updates the section table showing the same Rotation Week', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    await showSectionRW(2);
    await openAlloc();
    const pop = await openPopup('Lincoln'); await setPopupWeek(pop, 2);
    const pth = [...pop.querySelectorAll('thead th[data-day="thu"]')].pop();
    check('Thursday starts NOT struck in the section table', struck('thu') === false);
    await rclick(pth);
    check('the popup right-click disabled Thursday for RW2', RD()(GID, A, 0, 2, 'thu') === true);
    // close the popup so only the section table remains, and confirm the section already reflects it
    W._pgCloseSchoolShPopups && W._pgCloseSchoolShPopups({ target: d.body }); await flush(300);
    check('the section table Thursday header is struck WITHOUT a view switch', struck('thu') === true, struck('thu'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Only the matching school/week updates; a section showing a DIFFERENT week is not falsely struck ═══ */
  await suite('Only the section view showing the SAME school + Rotation Week reflects the change', async () => {
    await importGuide(dom, c, fixture()); await flush(300);
    // put the section on Rotation Week 1 (not 2), then disable a RW2 day
    await showSectionRW(1);
    check('the section shows RW1; Friday not struck', struck('fri') === false);
    await openAlloc(); await daysViewWeek(2);
    const cb = daysCb(0, 'fri'); cb.checked = false; $(cb).trigger('change'); await flush(700);
    check('RW2 Friday is disabled in state', RD()(GID, A, 0, 2, 'fri') === true);
    check('the section (showing RW1) does NOT strike Friday (its own week is unaffected)', struck('fri') === false, struck('fri'));
    // now switch the section to RW2 and it appears struck (state was correct all along)
    await showSectionRW(2);
    check('switching the section to RW2 shows Friday struck', struck('fri') === true, struck('fri'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
