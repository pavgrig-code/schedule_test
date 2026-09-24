// t56_view_mode.js — Planning Guide Lock / Unlock (View & Edit mode).
// Covers: view-by-default for never-opened guides, the Edit / Done Editing header
// button placed before Actions, the in-place lockdown (disabled controls, locked
// contenteditables, capture gate over restricted buttons), the mode-aware Actions
// menu (exports stay, Import/Duplicate/Delete hide), per-guide persistence across
// switches, and the Shift Schedule exemption: Shift Details, staff assignment, and
// Session editing stay fully live while the guide's editor sits in View Mode.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

// Grid two-step: the first plain click selects a session block, the second opens Edit.
// This helper clicks once, and clicks again only if Edit didn't open (state-proof).
async function openEditVia(d, W, get) {
  const ev = () => new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W });
  get().dispatchEvent(ev()); await flush(260);
  if (!d.getElementById('sess-modal')) { get().dispatchEvent(ev()); await flush(320); }
}

const results = { suites: [] };
let _cur = null;
function suiteAsync(name, fn) {
  _cur = { name, checks: [], fail: 0 };
  results.suites.push(_cur);
  const t0 = Date.now();
  return Promise.resolve().then(fn).then(() => { _cur._ms = Date.now() - t0; }, e => {
    _cur.fail++; _cur.threw = String(e && e.stack || e); _cur._ms = Date.now() - t0;
  });
}
function check(label, cond, detail) {
  const ok = !!cond; if (!ok) _cur.fail++;
  _cur.checks.push({ label, ok, detail });
}
function report() {
  let pass = 0, fail = 0, n = 0, lines = [];
  for (const s of results.suites) {
    const sp = s.checks.filter(c => c.ok).length, sf = s.checks.length - sp;
    pass += sp; fail += sf; n += s.checks.length;
    if (sf || s.threw) { lines.push('[FAIL] ' + s.name + (s.threw ? ' THREW ' + s.threw.split('\n')[0] : '')); s.checks.filter(c => !c.ok).forEach(c => lines.push('   \u2717 ' + c.label + '  \u2014 ' + (c.detail == null ? '' : c.detail))); }
    else lines.push('[ OK ] ' + s.name + '  (' + sp + '/' + s.checks.length + ' checks, ' + s._ms + 'ms)');
  }
  lines.push('TOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + n + ' checks across ' + results.suites.length + ' suites');
  results.failed = fail;
  return lines.join('\n');
}

function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
const SITE = [{ school: 'Alpha', schoolId: 's1', coaches_ctkk: 1, ctkk: 10, coaches_g15: 1, g15: 20 }];
function guideJson() {
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-v56', name: 'ViewG', status: 'Draft' }, data: { status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '86.00', billable: true, calId: 'cal_a' }],
    siteRows: SITE, siteRowsByCal: { cal_a: SITE },
    staffingOptsByCal: { cal_a: { bySchool: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00','15:30'), g15: mkTimes('11:00','17:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }, { key: 'g15', name: 'Gr 1-5', isCoach: true, spc: 20 }],
    sessions: [{ id: 'v1', si: 0, origIdx: 0, calId: 'cal_a', shifts: [{ roleKey: 'ctkk', num: 1 }], type: 'STEM', color: '#00695c', start: 10, end: 11, date: '2026-07-22', notes: 'vm', activities: [] }] } });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window;
  let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40);
  cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(900);
  d.createElement = ocr;
}
const rawOpen = async (c, i) => { const rows = c.d.querySelectorAll('#staff-list-scroll .staff-row'); if (!rows[i]) return false; c.$(rows[i]).trigger('click'); await flush(150); return true; };

(async () => {


  await suiteAsync('locked guide renders as a READ-ONLY DOCUMENT, not a disabled form', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    await setMode(c, 'btn-planning'); await flush(80);
    await rawOpen(c, 0);
    const P = () => d.getElementById('planning-panel');
    check('a guide opens in EDIT mode by default (live controls, no view class)', !P().classList.contains('pg-view-mode') && P().querySelectorAll('input,select,textarea').length > 50);
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(350);
    const liveCtl = () => [...P().querySelectorAll('input,select,textarea')].filter(el => !el.closest('.pg-view-ok'));
    check('LOCK replaces every EDITING control with plain text (only .pg-view-ok display toggles remain: Unallocated / staff-count / show-count)', liveCtl().length === 0 && P().querySelectorAll('.pgv-text').length > 100, liveCtl().map(x => x.className).join(','));
    check('exactly HubSpot Deal and District read "Missing"; no placeholder text leaks', P().querySelectorAll('.pgv-missing').length === 2 && P().textContent.indexOf('Enter HubSpot deal') < 0 && P().textContent.indexOf('Search for a district') < 0);
    check('Add Program / Add Role / Add Special Day / Add School and Copy To / Options are REMOVED', !/\+ Add Program|\+ Add Role|\+ Add Special Day|\+ Add School/.test(P().textContent) && [...P().querySelectorAll('button')].every(b => !/^(Copy To|Options)$/.test(b.textContent.trim())));
    check('every Del column is stripped from the tables', [...P().querySelectorAll('th')].every(h => h.textContent.trim() !== 'Del'));
    check('checked boxes render as checkmark icons; no EDITING checkbox controls remain', liveCtl().filter(x => x.type === 'checkbox').length === 0 && P().querySelectorAll('.pgv-check').length >= 1, liveCtl().filter(x => x.type === 'checkbox').map(x => x.className).join(','));
    const bil = [...P().querySelectorAll('td,span,div,label')].filter(e => !e.children.length && e.textContent.trim() === 'Billable');
    check('Billable text is tinted green rgb(48,137,48)', bil.length > 0 && bil.every(e => e.style.color === 'rgb(48, 137, 48)'));
    // UNLOCK re-renders the full editor
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(400);
    check('UNLOCK re-renders the complete editor (controls back and enabled, Add buttons restored)', P().querySelectorAll('input,select,textarea').length > 50 && [...P().querySelectorAll('input,select,textarea')].every(x => !x.disabled) && /\+ Add Program/.test(P().textContent));
    check('no page or console errors', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('locked Actions menu: Import and Delete hidden; exports, Unlock, History, Duplicate stay', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    await setMode(c, 'btn-planning'); await flush(80);
    await rawOpen(c, 0);
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(300);
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    const menu = d.getElementById('pg-actions-pill').parentElement;
    const item = t => [...menu.querySelectorAll('button')].find(x => x.textContent.indexOf(t) >= 0);
    const vis = t => { const el = item(t); return !!el && el.style.display !== 'none'; };
    check('Import and Delete are hidden while locked', !vis('Import') && !vis('Delete'));
    check('Export as Excel / JSON, History, Duplicate, Add to Workspace stay available', vis('Export as Excel') && vis('Export as JSON') && vis('History') && vis('Duplicate') && vis('Add to Workspace'));
    const lk = d.getElementById('pg-lock-item');
    check('the mode item reads Unlock with the unlock icon', lk.textContent.trim() === 'Unlock' && lk.querySelector('svg').getAttribute('data-icon') === 'unlock');
    d.body.click(); await flush(80);
    check('no page or console errors', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('lock persistence + export exclusion (locked guide reopens as a document)', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    await setMode(c, 'btn-planning'); await flush(80);
    await rawOpen(c, 0);
    const P = () => d.getElementById('planning-panel');
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(300);
    const key = (function () { for (let i = 0; i < W.localStorage.length; i++) { const k = W.localStorage.key(i); if (/^pg_mode_/.test(k)) return k; } return null; })();
    check('the lock persists per guide (pg_mode_* = view)', !!key && W.localStorage.getItem(key) === 'view');
    await rawOpen(c, 1);
    check('a different, never-locked guide opens in EDIT', !P().classList.contains('pg-view-mode') && P().querySelectorAll('input,select,textarea').length > 50);
    await rawOpen(c, 0);
    check('the locked guide REOPENS as a read-only document (no editing controls)', P().classList.contains('pg-view-mode') && [...P().querySelectorAll('input,select,textarea')].filter(el => !el.closest('.pg-view-ok')).length === 0 && P().querySelectorAll('.pgv-text').length > 100);
    // export of a locked guide carries no lock/mode field
    let capJ = null; const OrigBlob = W.Blob; const ocr2 = d.createElement.bind(d);
    d.createElement = function (t) { const el = ocr2(t); if (t === 'a') { el.click = () => {}; } return el; };
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') capJ = parts[0]; return new OrigBlob(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $([...P().querySelectorAll('button')].find(x => x.textContent.indexOf('Export as JSON') >= 0)).trigger('click'); await flush(300);
    W.Blob = OrigBlob; d.createElement = ocr2;
    check('JSON export of a LOCKED guide has no lock/mode field', !!capJ && !/pg_mode|"locked"|lockState/i.test(capJ) && !Object.keys(JSON.parse(capJ).data).some(k => /mode|lock/i.test(k)));
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(300);
    check('Unlock from the reopened document restores editing', !P().classList.contains('pg-view-mode') && P().querySelectorAll('input,select,textarea').length > 50);
    check('no page or console errors', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('locked popups are read-only: Coach/Staff Count + Calendar Hours Breakdown', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    const j = JSON.parse(guideJson());
    j.data.combinedView = true;
    j.data.siteRows.push({ school: 'Beta', schoolId: 's2', coaches_ctkk: 2, ctkk: 20, coaches_g15: 1, g15: 15 });
    j.data.siteRowsByCal = { cal_a: j.data.siteRows };
    await importGuide(dom, c, JSON.stringify(j));
    const P = () => d.getElementById('planning-panel');
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(400);
    check('rich guide locks into the document view (no editing controls)', [...P().querySelectorAll('input,select,textarea')].filter(el => !el.closest('.pg-view-ok')).length === 0);
    // combined Coach Count popup
    const cnt = P().querySelector('.count-cell-u[data-role="ctkk"][data-day="mon"]');
    check('a combined multi-school count cell exists', !!cnt);
    if (cnt) { $(cnt).trigger('click'); await flush(500); }
    let pop = d.querySelector('.sh-cnt-popup');
    check('clicking the combined count opens a popup while locked', !!pop);
    if (pop) {
      check('the popup uses the role-specific non-edit title ("Coach Count", never "Edit Coach Count")', /Coach Count/.test(pop.textContent) && !/Edit Coach Count/.test(pop.textContent));
      check('the popup is read-only: no fields; Save/Discard/Update/Reset/Delete gone; Cancel relabeled Close', pop.querySelectorAll('input,select,textarea').length === 0 && ![...pop.querySelectorAll('button')].some(b => /^(Save|Discard|Update|Reset to Original Counts|Delete|Cancel)$/.test(b.textContent.trim())));
      check('schools, counts, and Total remain visible', /Alpha/.test(pop.textContent) && /Beta/.test(pop.textContent) && /Total/.test(pop.textContent));
      d.body.click(); await flush(200);
    }
    check('no page or console errors through the popup flow', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('locked-mode hardening: flat fields, live Filter/Combined, inert POD, inspection-only popups', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    const j = JSON.parse(guideJson());
    j.data.combinedView = true;
    j.data.calendarRows.push({ name: 'Fall 2026', firstDay: '2026-08-03', lastDay: '2026-08-14', color: '#64b5f6', pricePerHour: '90.00', billable: true, calId: 'cal_b' });
    j.data.siteRows.push({ school: 'Beta', schoolId: 's2', coaches_ctkk: 2, ctkk: 20, coaches_g15: 1, g15: 15 });
    j.data.siteRowsByCal = { cal_a: j.data.siteRows, cal_b: j.data.siteRows };
    j.data.staffingOptsByCal.cal_b = { bySchool: false, alternateWeeks: false };
    await importGuide(dom, c, JSON.stringify(j));
    const P = () => d.getElementById('planning-panel');
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(450);
    const calT = [...P().querySelectorAll('table')].find(t => /First Day/.test(t.textContent));
    check('field-box styling is FLATTENED: no inset shadows outside the allowlist; dropdown carets gone; calendar name reads as table text', [...P().querySelectorAll('div,span')].filter(e => !e.closest('.pg-view-ok') && /inset/.test(e.style.boxShadow || '')).length === 0 && !/\u25be/.test(calT.textContent) && /CalA/.test(calT.textContent));
    check('Options and Copy To are removed even with their dropdown carets', [...P().querySelectorAll('button')].every(b => !/Options|Copy To/.test(b.textContent)));
    const fb = [...P().querySelectorAll('button')].find(b => /Filter/.test(b.textContent));
    check('every Filter button is allowlisted for locked mode', [...P().querySelectorAll('button')].filter(b => /Filter/.test(b.textContent)).every(b => b.classList.contains('pg-view-ok')));
    let fOK = true; try { $(fb).trigger('click'); } catch (e) { fOK = false; }
    await flush(250);
    const dd = [...d.querySelectorAll('div')].find(x => x.style.zIndex === '99999' && x.style.display !== 'none' && x.textContent.trim().length > 3);
    check('the Staffing Hours Filter WORKS while locked (dropdown opens; the buildViewDD scope bug is fixed)', fOK && !!dd);
    d.body.click(); await flush(150);
    const beforeOv = d.querySelectorAll('.sb-pod-editov').length;
    [...P().querySelectorAll('td')].filter(t => t.textContent.trim().length < 16 && /pointer/.test(t.style.cursor || '')).slice(0, 6).forEach(t => $(t).trigger('click'));
    await flush(300);
    check('POD brackets are inert while locked (the Edit Pod guard: no editor ever opens)', d.querySelectorAll('.sb-pod-editov').length === beforeOv);
    const cvIn = () => { const l = [...P().querySelectorAll('label')].find(x => /Combined View/.test(x.textContent)); return l && l.classList.contains('pg-view-ok') ? l.querySelector('input[type=checkbox]') : null; };
    check('the Combined View toggle is allowlisted, ENABLED, and present', !!cvIn() && !cvIn().disabled);
    const was = cvIn().checked;
    $(cvIn()).trigger('click'); await flush(500);
    check('toggling Combined works while locked and the rebuilt sections stay documentized', cvIn() && cvIn().checked !== was && [...P().querySelectorAll('input,select,textarea')].filter(i => !i.closest('.pg-view-ok')).length === 0);
    const cnt = P().querySelector('.count-cell-u[data-role="ctkk"][data-day="mon"]');
    if (cnt) { $(cnt).trigger('click'); await flush(450); }
    const pop = d.querySelector('.sh-cnt-popup');
    check('the count popup titles itself "Coach Count" (never "Edit Coach Count") and is read-only', !!pop && /Coach Count/.test(pop.textContent) && !/Edit Coach Count/.test(pop.textContent) && pop.querySelectorAll('input,select,textarea').length === 0);
    if (pop) {
      const snap = pop.textContent;
      const td = pop.querySelector('td');
      if (td) { td.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: W })); td.dispatchEvent(new W.KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true })); }
      await flush(150);
      check('popup interactions are inert (dblclick and keydown blocked; content unchanged)', d.querySelector('.sh-cnt-popup') && d.querySelector('.sh-cnt-popup').textContent === snap && d.querySelector('.sh-cnt-popup').querySelectorAll('input').length === 0);
      d.body.click(); await flush(150);
    }
    check('no page or console errors through the hardening flows', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('locked-mode hardening 2: visual circles, no Copy to, live filter checkboxes, swept breakdown singleton', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    const j = JSON.parse(guideJson());
    j.data.combinedView = true;
    j.data.calendarRows.push({ name: 'Fall 2026', firstDay: '2026-08-03', lastDay: '2026-08-14', color: '#64b5f6', pricePerHour: '90.00', billable: true, calId: 'cal_b' });
    j.data.siteRows.push({ school: 'Beta', schoolId: 's2', coaches_ctkk: 2, ctkk: 20, coaches_g15: 1, g15: 15 });
    j.data.siteRows[0].coaches_g15 = 1; j.data.siteRows[0].g15 = 15;
    j.data.siteRowsByCal = { cal_a: j.data.siteRows, cal_b: j.data.siteRows };
    j.data.staffingOptsByCal.cal_b = { bySchool: false, alternateWeeks: false };
    const wk = s => ({ mon: { start: s, end: '15:00' }, tue: { start: s, end: '15:00' }, wed: { start: s, end: '15:00' }, thu: { start: s, end: '15:00' }, fri: { start: s, end: '15:00' } });
    j.data.roles = [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }, { key: 'g15', name: 'Gr 1-5', isCoach: false, spc: 15 }];
    j.data.staffingHoursSlots = { c0: { ctkk: wk('08:00') }, c1: { g15: wk('09:00') } };
    await importGuide(dom, c, JSON.stringify(j));
    const P = () => d.getElementById('planning-panel');
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(100);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(450);
    const circ = [...P().querySelectorAll('div')].filter(e => e.style.borderRadius === '50%' && e.style.width === '12px');
    check('color circles stay visible but purely visual (pointer-events none, default cursor)', circ.length >= 2 && circ.every(e => e.style.pointerEvents === 'none' && e.style.cursor === 'default'));
    check('no "Copy to" affordance survives anywhere (any tag, any caret, any case)', [...P().querySelectorAll('*')].filter(e => e.isConnected && /^copy to$/i.test(e.textContent.replace(/[\u25bc\u25be\u2026]/g, '').replace(/\s+/g, ' ').trim())).length === 0);
    const openDD = async () => { const fb = [...P().querySelectorAll('button')].find(b => /Filter/.test(b.textContent)); $(fb).trigger('click'); await flush(250); return [...d.querySelectorAll('div')].find(x => x.style.zIndex === '99999' && x.style.display !== 'none'); };
    let dd = await openDD();
    check('the staffing filter dropdown keeps LIVE checkboxes (zero static checkmark icons)', !!dd && dd.querySelectorAll('input[type=checkbox]').length > 0 && dd.querySelectorAll('.pgv-check').length === 0);
    const leafName = j.data.calendarRows[0].name;
    const findLeaf = box => box && [...box.querySelectorAll('label,div')].find(x => x.textContent.indexOf(leafName) >= 0 && x.querySelector('input[type=checkbox]'));
    const lab = findLeaf(dd);
    if (lab) { $(lab.querySelector('input')).trigger('click'); await flush(400); }
    dd = await openDD();
    const lab2 = findLeaf(dd);
    check('toggling a filter checkbox works while locked and the selection persists across reopen', !!lab2 && lab2.querySelector('input').checked === false);
    if (lab2) { $(lab2.querySelector('input')).trigger('click'); await flush(300); }
    d.body.click(); await flush(150);
    check('the panel stays documentized through filter-driven re-renders', [...P().querySelectorAll('input,select,textarea')].filter(i => !i.closest('.pg-view-ok')).length === 0 && P().classList.contains('pg-view-mode'));
    const tip = d.querySelector('.cal-hours-breakdown');
    tip.innerHTML = '<div>8:00 AM \u2013 4:30 PM</div><button>Add Extra Shift</button><span title="Edit note">\u270f</span><input type="text" value="x">';
    await flush(350);
    check('a populated Calendar Hours Breakdown singleton is swept read-only (Add Extra Shift, pencil, and field gone; hours kept)', !/Add Extra Shift/.test(tip.textContent) && !tip.querySelector('input') && !tip.querySelector('[title*="dit"]') && /8:00 AM/.test(tip.textContent));
    const cntS = P().querySelector('.count-cell-u[data-role="g15"][data-day="mon"]');
    if (cntS) { $(cntS).trigger('click'); await flush(450); }
    const pop = d.querySelector('.sh-cnt-popup');
    check('a non-coach combined count opens read-only "Staff Count" (never "Edit Staff Count")', !!pop && /Staff Count/.test(pop.textContent) && !/Edit Staff Count/.test(pop.textContent) && pop.querySelectorAll('input,select,textarea').length === 0);
    if (pop) { const _cl = [...pop.querySelectorAll('button')].find(b => b.textContent.trim() === 'Close'); if (_cl) { $(_cl).trigger('click'); await flush(250); } }
    // \u2500\u2500 Calendar Hours Breakdown: pinned-tip behaviors while locked \u2500\u2500
    const tipPopup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').pop();
    const dayCell = () => { const cells = [...d.querySelectorAll('#planning-panel [data-date-key="2026-07-22"]')]; return cells.find(el => el.querySelector && (el.querySelector('.cal-combined-sum') || el.querySelector('.cal-day-sum'))) || cells[0]; };
    $(dayCell()).trigger('click'); await flush(500);
    const tp = tipPopup();
    check('the pinned Calendar Hours Breakdown opens while locked WITHOUT "+ Add Extra Shift"', !!tp && !/Add Extra Shift/.test(tp.textContent));
    check('the delete-row \u00d7 is stripped while the corner close control is kept', !!tp && !tp.querySelector('.cal-tip-del') && !!tp.querySelector('.cal-tip-close'));
    const sl = tp && tp.querySelector('.cal-school-link');
    check('school links in multi-school groups stay clickable (pointer cursor kept)', !!sl && /pointer/.test(sl.style.cursor || ''));
    if (sl) { $(sl).trigger('click'); await flush(500); }
    const sw = tipPopup();
    check('clicking a school opens its individual breakdown as a READ-ONLY window (no fields, no Add Extra Shift)', !!sw && sw.querySelectorAll('input,select,textarea').length === 0 && !/Add Extra Shift/.test(sw.textContent));
    const cx = sw && sw.querySelector('.cal-tip-close');
    if (cx) { $(cx).trigger('click'); await flush(300); }
    check('the corner \u00d7 CLOSES the breakdown while locked', [...d.querySelectorAll('.cal-hours-breakdown')].filter(el => el.style.display !== 'none').length === 0);
    // \u2500\u2500 dedicated read-only rendering (source-level, not post-hoc stripping) \u2500\u2500
    $(dayCell()).trigger('click'); await flush(450);
    const tp2 = tipPopup();
    check('the "+ Add Extra Shift" anchor NEVER RENDERS while locked (source guard on the builders)', !!tp2 && !tp2.querySelector('.cal-tip-xsadd'));
    check('no cell in the locked tip carries a "Click to edit" title', tp2 && tp2.querySelectorAll('[title="Click to edit"]').length === 0);
    const sl2 = tp2 && tp2.querySelector('.cal-school-link');
    if (sl2) { $(sl2).trigger('click'); await flush(450); }
    const sw2 = tipPopup();
    const roTds = sw2 ? [...sw2.querySelectorAll('td')].filter(x => /^\d{1,2}:\d{2}/.test(x.textContent.trim()) || /^\d+$/.test(x.textContent.trim())) : [];
    let spawned2 = false;
    for (const x of roTds.slice(0, 4)) { $(x).trigger('click'); await flush(140); if (sw2.querySelectorAll('input').length) { spawned2 = true; break; } }
    check('school-window Start/End/Count clicks spawn NO editors while locked (handlers are mode-guarded)', !spawned2);
    const cx2 = sw2 && sw2.querySelector('.cal-tip-close'); if (cx2) { $(cx2).trigger('click'); await flush(250); }
    // count popup: dedicated read-only rendering, synchronous at open
    const cnt2 = P().querySelector('.count-cell-u[data-role="ctkk"][data-day="mon"]');
    if (cnt2) { $(cnt2).trigger('click'); await flush(450); }
    const pop2 = [...d.querySelectorAll('.sh-cnt-popup')].pop();
    check('the count popup opens titled "Coach Count" (never "Edit Coach Count") with a Close-only footer', !!pop2 && /Coach Count/.test(pop2.textContent) && !/Edit Coach Count/.test(pop2.textContent) && [...pop2.querySelectorAll('button')].some(b => b.textContent.trim() === 'Close') && ![...pop2.querySelectorAll('button')].some(b => /^(Save|Discard|Cancel|Reset to Original Counts|Update)$/.test(b.textContent.trim())));
    const nCells = pop2 ? [...pop2.querySelectorAll('td')].filter(x => /^\d+$/.test(x.textContent.trim())) : [];
    let spawned3 = false;
    for (const x of nCells.slice(0, 3)) { $(x).trigger('click'); await flush(140); if (pop2.querySelectorAll('input').length) { spawned3 = true; break; } }
    check('per-school Count cells in the popup are inspection-only (source-guarded: no editor even via programmatic clicks)', !spawned3 && !!pop2 && pop2.querySelectorAll('input,select,textarea').length === 0);
    const cl2 = pop2 && [...pop2.querySelectorAll('button')].find(b => b.textContent.trim() === 'Close');
    if (cl2) { $(cl2).trigger('click'); await flush(250); }
    check('Close dismisses the read-only count popup', d.querySelectorAll('.sh-cnt-popup').length === 0);
    check('no page or console errors through the second hardening pass', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  await suiteAsync('Shift Schedule exemption: Details, staff, and Sessions stay editable while LOCKED', async () => {
    const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
    await whenReady(dom);
    await importGuide(dom, c, guideJson());
    // lock the imported guide via Actions > Lock
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(80);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(200);
    check('the imported guide is LOCKED (View mode)', d.getElementById('planning-panel').classList.contains('pg-view-mode'));
    // into the grid
    await setMode(c, 'btn-schedule'); await flush(200); await clickGuide(c, 0); await flush(400);
    for (let i = 0; i < 120; i++) { if (/Jul 22, 2026/.test(d.getElementById('date-label').textContent)) break; $(d.getElementById('prev-btn')).trigger('click'); await flush(60); }   // walk, never a fixed distance from "today"
    $([...d.getElementById('shift-layout-toggle').querySelectorAll('.shift-layout-btn')][1]).trigger('click'); await flush(500);
    const panel = () => d.getElementById('schedule-panel');
    const sbs = () => [...panel().querySelectorAll('.sess-block')];
    check('the grid renders the guide\u2019s session', sbs().length === 1);
    // Session EDIT works: open, change end time, save
    await openEditVia(d, W, () => sbs()[0]);
    check('Edit Session opens from the grid while the guide is LOCKED (two-step click)', !!d.getElementById('sess-modal'));
    $(d.getElementById('sess-time-end')).val('11:30 AM').trigger('change');
    $(d.getElementById('sess-save')).trigger('click'); await flush(500);
    check('the session update SAVES (11:00 -> 11:30 end)', /10:00 AM \u2013 11:30 AM/.test((sbs()[0] && sbs()[0].getAttribute('title')) || ''));
    // Shift Details opens with live staff search
    const hr = [...panel().querySelectorAll('.block-assign-row')].filter(r => !r.closest('.site-sched-block'));
    $(hr[0].parentElement.parentElement).trigger('click'); await flush(500);
    const sd = d.getElementById('shiftdet-modal');
    check('Shift Details opens with the related Sessions section live', !!sd && !!d.getElementById('shiftdet-sessions') && d.getElementById('shiftdet-sessions').style.display !== 'none');
    const at = [...sd.querySelectorAll('div')].find(x => /click to assign staff/i.test(x.textContent) && x.children.length === 0);
    $(at).trigger('click'); await flush(150);
    const dd = d.getElementById('shiftdet-staff-dd');
    check('the Assigned Staff search opens and offers results (fully editable)', !!dd && dd.style.position === 'fixed' && dd.children.length > 0);
    $(sd.querySelector('.modal-close')).trigger('click'); await flush(200);
    check('no page or console errors through the exemption flows', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  console.log(report());
  process.exit(results.failed ? 1 : 0);
})();
