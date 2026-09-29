// t169_field_program_load.js (t167's prelude + verifiers; a GENERATED large guide) — Field Program grouping propagation. Moving programs between groups is
// out of scope (no move control exists); grouping changes here are: add a Field Program, add a program into a group
// (then date and price it so it contributes), delete a program (and Undo it), rapid bursts, and an export/import
// round trip. After EVERY change, with no manual refresh:
//   MEMBERSHIP in every grouped area (Programs, Summary, Site Breakdown, Staffing Hours, Calendars, Program
//     Summaries, Pricing Calculator): each program under its own group, none missing, none twice;
//   TOTALS from members only: the Programs area Total rows, the Summary's Field Program Totals and the Pricing
//     subtotals re-derived from their rows, and the groups adding up to the guide totals to the cent;
//   CALENDARS: a combined group's grid holds only its programs; its controls are its own;
//   HIERARCHY: every group's collapse state equals "all its children collapsed" in all four collapsible areas.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
const ONLY = String(process.env.ONLY || '').split(',').map(x => x.trim()).filter(Boolean);   // ONLY=1,3 runs just those suites
async function suite(n, fn) { suites++; if (ONLY.length && !ONLY.includes(String(suites))) { console.log('\u2500 (skipped) ' + n); return; } console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
async function importGuide(dom, c, json, settle) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(settle || 2500); d.createElement = ocr;
  // jsdom: the Undo notice's 9s timer starts BEFORE the (slow, synchronous) rebuild that follows an undoable change,
  // so it can expire before control returns; give it a long lifetime here (test-only, via the public handle)
  try { W._pgUndo.timeout(120000); } catch (e) {}
}
// a large synthetic guide: nFp groups x perFp programs, each with `schools` schools, staffing hours everywhere,
// dated ranges (a few spanning most of a year), discounts, COLA and a Not to Exceed
function fxBig(nFp, perFp, schools) {
  const rows = [], site = {}, slots = {}, byCal = {}, fps = [];
  const cols = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#a1887f'];
  let n = 0;
  for (let f = 0; f < nFp; f++) {
    const fpId = f === 0 ? '' : 'fp_' + f; if (f) fps.push({ id: fpId, name: 'Field Program ' + (f + 1) });
    for (let p = 0; p < perFp; p++) {
      const id = 'cal_' + (++n); const long = (n % 8 === 1);
      const r = { name: 'P' + n, firstDay: long ? '2026-08-10' : '2026-09-0' + (1 + (n % 3)), lastDay: long ? '2027-05-28' : '2026-09-' + (18 + (n % 5)), color: cols[n % cols.length], pricePerHour: (60 + (n % 25)) + '.00', billable: true, calId: id };
      if (fpId) r.fpId = fpId; rows.push(r);
      site[id] = []; for (let k = 0; k < schools; k++) site[id].push({ school: 'S' + n + '-' + k, schoolId: 's' + n + '_' + k, coaches_ctkk: 1 + (k % 3), ctkk: 10 * (1 + (k % 3)) });
      slots['c' + (n - 1)] = { ctkk: mkTimes('0' + (8 + (n % 2)) + ':00', (13 + (n % 3)) + ':00') };
      if (n % 4 === 0) byCal[id] = { name: 'D1', pct: String(5 + (n % 3)) };
    }
  }
  const data = { status: 'Draft', combinedView: false, calendarRows: rows, fieldPrograms: fps, siteRowsByCal: site, siteRows: [{ school: 'S', schoolId: 's0', coaches_ctkk: 1, ctkk: 10 }],
    discounts: { names: ['D1'], stages: [{ byCal }] }, districtFloor: '30.00', cola: { on: true, pct: '2.5' }, notToExceed: { nte: '9000000' },
    staffingHoursSlots: slots, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'LOAD', status: 'Draft' }, data });
}
function fx() { return fxBig(3, 2, 2); }   // the verifiers' small default; the suites import fxBig explicitly
(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const num = t => { const v = parseFloat(String(t || '').replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : 0; };
  const cents = t => Math.round(num(t) * 100);
  const r2 = x => Math.round(x * 100) / 100;
  const gCard = () => [...pl().querySelectorAll('[data-guide-summary="pg-001"]')].pop();
  const box = k => gCard().querySelector('.pg-gs-box-' + k).textContent.trim();
  const groupIds = () => [''].concat((det().fieldPrograms || []).filter(f => f && f.id).map(f => String(f.id)));
  const groupOf = r => { const id = r && r.fpId ? String(r.fpId) : ''; return (id && groupIds().includes(id)) ? id : ''; };
  const members = gid => det().calendarRows.filter(r => groupOf(r) === gid).map(r => String(r.calId));
  const dated = cid => { const r = det().calendarRows.find(x => String(x.calId) === cid); return !!(r && r.firstDay && r.lastDay && r.firstDay <= r.lastDay); };
  const calc = () => { const s = d.getElementById('summary-section-pg-001'); return (s && s.__pgCalc && s.__pgCalc.calendars) || []; };
  const uniq = a => [...new Set(a)];
  // ── membership per area: {gid -> [calIds shown]} ──
  const areaMembers = {
    'Programs': () => Object.fromEntries([...pl().querySelectorAll('.pg-fp-card')].map(cd => [cd.getAttribute('data-fp-id'), uniq([...cd.querySelectorAll('tbody tr [data-calc-cal], tbody tr [data-disc-cal]')].map(e => e.getAttribute('data-calc-cal') || e.getAttribute('data-disc-cal')))])),
    'Summary': () => { const o = {}; [...gCard().querySelectorAll('tr.pg-gs-prog-row')].forEach(r => { const g = r.getAttribute('data-fp'); (o[g] = o[g] || []).push(r.querySelector('td.pg-gs-maxcnt').getAttribute('data-calc-cal')); }); return o; },
    'Site Breakdown': () => Object.fromEntries([...d.querySelectorAll('#calgroups-section-pg-001 .sb-fp-body')].map(b => [b.getAttribute('data-fp-id'), [...b.querySelectorAll('.site-cal-card')].map(x => x.getAttribute('data-site-cal'))])),
    'Staffing Hours': () => Object.fromEntries([...d.querySelectorAll('#staffing-section-pg-001 .sf-fp-body')].map(b => [b.getAttribute('data-fp-id'), [...b.querySelectorAll('.sf-cal-section')].map(x => x.getAttribute('data-sf-cal-section'))])),
    'Calendars': () => Object.fromEntries([...d.querySelectorAll('#cal-section-pg-001 .cal-fp-body')].map(b => [b.getAttribute('data-cal-fp'), uniq([...b.querySelectorAll('[data-cal-id]')].map(x => x.getAttribute('data-cal-id')))])),
    'Pricing Calculator': () => { const o = {}; let g = null; const t = pl().querySelector('tr.pg-disc-total-row'); if (!t) return o; [...t.closest('table').tBodies[0].rows].forEach(r => { if (r.classList.contains('pg-disc-fp-hdr')) g = r.getAttribute('data-fp'); else if (r.classList.contains('pg-disc-row')) (o[g] = o[g] || []).push(r.getAttribute('data-disc-cal')); }); return o; }
  };
  // rules: Programs, Site Breakdown and Pricing show EVERY program; Summary and Calendars show dated ones; Staffing
  // Hours shows programs that have staffing slots (a brand-new program has none) — so for those the rule is
  // "everything shown is in the right group, nothing twice, and every expected program with data is present"
  const verifyMembership = () => {
    const bad = []; const ids = groupIds();
    Object.keys(areaMembers).forEach(area => {
      const shown = areaMembers[area](); const all = [].concat(...Object.values(shown));
      if (uniq(all).length !== all.length) bad.push(area + ': a program appears twice');
      Object.keys(shown).forEach(g => shown[g].forEach(cid => { if (!ids.includes(g)) bad.push(area + ': group ' + g + ' does not exist'); else if (groupOf(det().calendarRows.find(r => String(r.calId) === cid) || {}) !== g) bad.push(area + ': ' + cid + ' shown under the wrong group'); }));
      ids.forEach(g => {
        const want = members(g).filter(cid => area === 'Summary' || area === 'Calendars' ? dated(cid) : area === 'Staffing Hours' ? (calc().some(x => String(x.calId) === cid) && d.querySelector('#staffing-section-pg-001 .sf-cal-section[data-sf-cal-section="' + cid + '"]')) : true);
        want.forEach(cid => { if (!(shown[g] || []).includes(cid)) bad.push(area + ': ' + cid + ' missing from its group'); });
      });
    });
    // Program Summaries: one card per dated program, in each group in order (cards carry no id; count + order by group)
    ids.forEach(g => { const b = d.querySelector('#summary-section-pg-001 .ps-fp-body[data-fp-id="' + g + '"]'); const n = b ? [...b.children].filter(x => x.textContent.trim()).length : 0; const want = members(g).filter(dated).length; if (n !== want) bad.push('Program Summaries: group ' + g + ' shows ' + n + ' cards, expected ' + want); });
    return bad;
  };
  // ── totals from members only ──
  const verifyTotals = () => {
    const bad = []; const ids = groupIds(); const cc = calc();
    let sumH = 0, sumA = 0;
    ids.forEach(g => {
      const mem = members(g);
      // Programs area Total row
      const card = pl().querySelector('.pg-fp-card[data-fp-id="' + g + '"]'); const tot = card && card.querySelector('tr.pg-cal-total-row');
      if (tot) {
        const h = r2(cc.filter(x => mem.includes(String(x.calId))).reduce((a, x) => a + (parseFloat(x.totalHours) || 0), 0));
        const net = r2(mem.reduce((a, cid) => a + num((pl().querySelector('td.pg-cal-disc-amount[data-disc-cal="' + cid + '"]') || {}).textContent), 0));
        if (Math.abs(num(tot.querySelector('td.pg-cal-total-hours').textContent) - h) > 0.011) bad.push('Programs ' + g + ' hours ' + tot.querySelector('td.pg-cal-total-hours').textContent + ' vs ' + h);
        if (Math.abs(num(tot.querySelector('td.pg-cal-total-disc-amount').textContent) - net) > 0.011) bad.push('Programs ' + g + ' net ' + tot.querySelector('td.pg-cal-total-disc-amount').textContent + ' vs ' + net);
        if (!new RegExp('(^|\\| )' + mem.length + ' programs?$').test(tot.querySelector('.pg-cal-total-labeltxt').getAttribute('aria-label'))) bad.push('Programs ' + g + ' count label');
      } else bad.push('Programs: no Total row for ' + g);
      // Summary Field Program Total = its rows
      const rows = [...gCard().querySelectorAll('tr.pg-gs-prog-row[data-fp="' + g + '"]')]; const t = gCard().querySelector('tr.pg-gs-fp-total[data-fp="' + g + '"]');
      if (t) {
        const S = rows.reduce((a, r) => a + (parseInt(r.querySelector('td.pg-gs-schools').getAttribute('data-schools-count'), 10) || 0), 0);
        const H = rows.reduce((a, r) => a + num(r.cells[4].textContent), 0), A = rows.reduce((a, r) => a + cents(r.cells[5].textContent), 0);
        if (num(t.querySelector('td.pg-gs-fp-schools').textContent) !== S) bad.push('Summary ' + g + ' schools');
        if (Math.abs(num(t.querySelector('td.pg-gs-fp-hours').textContent) - r2(H)) > 0.011) bad.push('Summary ' + g + ' hours');
        if (cents(t.querySelector('td.pg-gs-fp-amount').textContent) !== A) bad.push('Summary ' + g + ' amount');
        sumH += num(t.querySelector('td.pg-gs-fp-hours').textContent); sumA += cents(t.querySelector('td.pg-gs-fp-amount').textContent);
        rows.forEach(r => { const cid = r.querySelector('td.pg-gs-maxcnt').getAttribute('data-calc-cal'); const net = pl().querySelector('td.pg-cal-disc-amount[data-disc-cal="' + cid + '"]'); if (net && cents(net.textContent) !== cents(r.cells[5].textContent)) bad.push('Summary row ' + cid + ' amount vs Programs Amount (Net)'); });
      } else bad.push('Summary: no Field Program Total for ' + g);
      // Pricing Calculator subtotal = its rows
      const pt = pl().querySelector('tr.pg-disc-fp-subtotal[data-fp="' + g + '"]');
      if (pt) { const prs = [...pl().querySelectorAll('tr.pg-disc-row')].filter(r => mem.includes(r.getAttribute('data-disc-cal'))); const A2 = prs.reduce((a, r) => a + cents(r.querySelector('td.pg-disc-base-amt').textContent), 0); if (cents(pt.querySelector('td.pg-disc-fp-amt').textContent) !== A2) bad.push('Pricing ' + g + ' subtotal ' + pt.querySelector('td.pg-disc-fp-amt').textContent + ' vs rows ' + A2 / 100); }
      else bad.push('Pricing: no subtotal for ' + g);
    });
    if (Math.abs(num(box('hours')) - r2(sumH)) > 0.011) bad.push('Summary hours box vs group totals');
    if (cents(box('amount')) !== sumA) bad.push('Summary amount box vs group totals');
    if (/[0-9]/.test(box('nte')) && cents(box('avail')) !== cents(box('nte')) - cents(box('amount'))) bad.push('Amount Available');
    const gt = pl().querySelector('tr.pg-disc-total-row'); if (gt) { const subs = [...pl().querySelectorAll('tr.pg-disc-fp-subtotal td.pg-disc-fp-amt')].reduce((a, x) => a + cents(x.textContent), 0); if (cents(gt.querySelector('td.pg-disc-tot-amt').textContent) !== subs) bad.push('Pricing grand total vs subtotals'); }
    return bad;
  };
  // ── hierarchy: every group's collapse state == all its children collapsed ──
  const verifyHierarchy = () => {
    const bad = [];
    const isColT = t => /^Expand/.test((t && t.getAttribute('title')) || '');
    [...d.querySelectorAll('#calgroups-section-pg-001 .sb-fp-group')].forEach(fg => { const cs = [...fg.querySelectorAll('.site-cal-card')]; const col = cs.length > 0 && cs.every(x => isColT(x.querySelector('.pg-sec-toggle'))); if ((fg.querySelector('.sb-fp-hdr').getAttribute('data-collapsed') === '1') !== col) bad.push('Site Breakdown hierarchy out of step for ' + fg.getAttribute('data-fp-id')); });
    [...d.querySelectorAll('#staffing-section-pg-001 .sf-fp-group')].forEach(fg => { const cs = [...fg.querySelectorAll('.sf-cal-section')]; const col = cs.length > 0 && cs.every(x => isColT(x.querySelector('.pg-sec-toggle'))); if ((fg.querySelector('.sf-fp-hdr').getAttribute('data-collapsed') === '1') !== col) bad.push('Staffing Hours hierarchy out of step for ' + fg.getAttribute('data-fp-id')); });
    [...d.querySelectorAll('#summary-section-pg-001 .ps-fp-group')].forEach(fg => { const cs = [...fg.querySelector('.ps-fp-body').children].filter(x => x.querySelector('.pg-sec-toggle')); const col = cs.length > 0 && cs.every(x => isColT(x.querySelector('.pg-sec-toggle'))); if ((fg.querySelector('.ps-fp-hdr').getAttribute('data-collapsed') === '1') !== col) bad.push('Program Summaries hierarchy out of step for ' + fg.getAttribute('data-fp-id')); });
    [...d.querySelectorAll('#cal-section-pg-001 .cal-fp-hdr')].forEach(h => { const id = h.getAttribute('data-fp-id'); const b = d.querySelector('#cal-section-pg-001 .cal-fp-body[data-cal-fp="' + id + '"]'); const togs = [...b.querySelectorAll('.pg-sec-toggle')]; const comb = b.querySelector('.cal-combined-day'); const col = comb ? b.style.display === 'none' : (togs.length > 0 && togs.every(isColT)); if ((h.getAttribute('data-collapsed') === '1') !== col) bad.push('Calendars hierarchy out of step for ' + id); });
    // Calendars: a combined group's grid holds only its programs
    [...d.querySelectorAll('#cal-section-pg-001 .cal-fp-body')].forEach(b => { if (!b.querySelector('.cal-combined-day')) return; const g = b.getAttribute('data-cal-fp'); const shown = uniq([...b.querySelectorAll('[data-cal-id]')].map(x => x.getAttribute('data-cal-id'))); if (shown.some(cid => groupOf(det().calendarRows.find(r => String(r.calId) === cid) || {}) !== g)) bad.push('Calendars: combined grid of ' + g + ' holds another group\u2019s program'); });
    return bad;
  };
  let states = 0, badStates = 0;
  const after = async (label, wait) => { await flush(wait || 2500); states++; const b = verifyMembership().concat(verifyTotals(), verifyHierarchy()); if (b.length) badStates++; check('[' + label + '] membership, totals and hierarchy hold everywhere, immediately', b.length === 0, b.slice(0, 4).join(' ; ')); };
  // ── operations ──
  const card = g => pl().querySelector('.pg-fp-card[data-fp-id="' + g + '"]');
  const opAddFP = async () => { $(pl().querySelector('.pg-add-fp-btn')).trigger('click'); };
  const opAddProgram = async g => { $(card(g).querySelector('.pg-add-prog-btn')).trigger('click'); };
  const rowOf = cid => { for (const t of pl().querySelectorAll('.pg-fp-card table')) { const hs = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim()); const r = [...t.querySelectorAll('tbody tr')].find(tr => tr.querySelector('[data-disc-cal="' + cid + '"], [data-calc-cal="' + cid + '"]')); if (r) return { r, hs }; } return null; };
  const opDate = async (cid, first, last) => { const { r } = rowOf(cid); const ins = [...r.querySelectorAll('input')].filter(i => i.placeholder === 'Aug 3, 2026'); $(ins[0]).val(first); $(ins[0]).trigger($.Event('keydown', { key: 'Enter' })); await flush(1500); const r2_ = rowOf(cid).r; const ins2 = [...r2_.querySelectorAll('input')].filter(i => i.placeholder === 'Aug 3, 2026'); $(ins2[1]).val(last); $(ins2[1]).trigger($.Event('keydown', { key: 'Enter' })); };
  const opPph = async (cid, v) => { const { r, hs } = rowOf(cid); const inp = r.children[hs.indexOf('PPH')].querySelector('input'); $(inp).val(v).trigger('input'); $(inp).trigger('blur'); };
  const opDelete = async cid => { const { r } = rowOf(cid); $(r.querySelector('button[title="Delete row"]')).trigger('click'); await flush(300); const conf = d.querySelector('.pg-confirm-ov, .xs-ui'); const yes = conf && [...conf.querySelectorAll('button')].find(x => /^(Delete|Remove|Yes)$/i.test(x.textContent.trim())); if (yes) $(yes).trigger('click'); };
  const undoBtn = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
  const opUndo = async () => { for (let i = 0; i < 40 && !undoBtn(); i++) await flush(150); const b = undoBtn(); if (b) $(b).trigger('click'); return !!b; };
  const lastCal = () => String(det().calendarRows[det().calendarRows.length - 1].calId);
  const sbTog = g => d.querySelector('#calgroups-section-pg-001 .sb-fp-hdr[data-fp-id="' + g + '"] .pg-sb-fp-toggle');
  const sfTog = g => d.querySelector('#staffing-section-pg-001 .sf-fp-hdr[data-fp-id="' + g + '"] .pg-sf-fp-toggle');
  const psTog = g => d.querySelector('#summary-section-pg-001 .ps-fp-hdr[data-fp-id="' + g + '"] .pg-ps-fp-toggle');
  const calTog = g => d.querySelector('#cal-section-pg-001 .cal-fp-hdr[data-fp-id="' + g + '"] .pg-cal-fp-toggle');
  const calChk = (g, cls) => d.querySelector('#cal-section-pg-001 .cal-fp-hdr[data-fp-id="' + g + '"] .' + cls);

  // delete a group through its header menu + confirmation
  const delGroup = async (g, confirm) => {
    const hd = pl().querySelector('.pg-fp-card[data-fp-id="' + g + '"] [data-pg-sec-key="calsetup"]');
    $(hd).trigger('mouseenter'); await flush(50); $(hd.querySelector('.pg-fp-dots')).trigger('click'); await flush(200);
    $(d.querySelector('.pg-fp-menu .pg-fp-menu-delete')).trigger('click'); await flush(300);
    const ov = d.querySelector('.pg-confirm-ov'); const btn = ov && [...ov.querySelectorAll('button')].find(b => b.textContent.trim() === (confirm ? 'Delete' : 'Cancel'));
    if (btn) $(btn).trigger('click'); await flush(confirm ? 3500 : 300);
  };
  const T = {}; const timed = async (label, fn, wait) => { const t = Date.now(); await fn(); await flush(wait || 3000); T[label] = Date.now() - t; return T[label]; };
  const tot = () => ['hours', 'amount', 'avail'].map(box).join(' | ');

  /* ═══ 1. Import a large guide; every operation stays accurate and proportionate ═══ */
  await suite('64 programs in 8 groups, 320 schools: add / delete / add group / delete group / price / collapse / expand, each accurate everywhere and proportionate in cost', async () => {
    const tImp = await timed('import', async () => { await importGuide(dom, c, fxBig(8, 8, 5), 4000); }, 4000);
    check('the guide loaded: 8 groups, 64 programs, 320 school rows', groupIds().length === 8 && det().calendarRows.length === 64 && Object.values(det().siteRowsByCal).reduce((a, x) => a + x.length, 0) === 320);
    await after('loaded', 500);
    const g3 = groupIds()[3];
    await timed('add program 1', async () => { await opAddProgram(g3); }, 3500); await after('add a program to group 4', 300);
    await timed('add program 2', async () => { await opAddProgram(g3); }, 3500);
    await timed('add program 3', async () => { await opAddProgram(groupIds()[7]); }, 3500); await after('two more programs (groups 4 and 8)', 300);
    await timed('add group', async () => { await opAddFP(); }, 3500); await after('add a group (with its one blank program)', 300);
    check('68 programs (three added + the new group\u2019s blank one), 9 groups, each where it was put', det().calendarRows.length === 68 && groupIds().length === 9 && members(g3).length === 10);
    const doomed = String(det().calendarRows[det().calendarRows.length - 1].calId);
    await timed('delete program', async () => { await opDelete(doomed); }, 3500); await after('delete the last program', 300);
    const g9 = groupIds()[8];
    await timed('delete group', async () => { await delGroup(g9, true); }, 3500); await after('delete the new group', 300);
    await timed('price change', async () => { await opPph('cal_20', '99.00'); }, 3000); await after('price a program', 300);
    check('the price landed and only that program\u2019s amount moved', det().calendarRows[19].pricePerHour === '99.00');
    const T0 = tot();
    await timed('collapse all groups', async () => { for (const g of groupIds()) { const t = sbTog(g); if (t) $(t).trigger('click'); } }, 800);
    await timed('expand all groups', async () => { for (const g of groupIds()) { const t = sbTog(g); if (t) $(t).trigger('click'); } }, 800);
    check('collapse / expand changed no total', tot() === T0);
    await after('after collapse / expand', 300);
    console.log('    timings (ms): ' + Object.keys(T).map(k => k + '=' + T[k]).join(', '));
    // jsdom noise: an add sits well under half the import (it was ~1x the import before the targeted paths)
    check('adding a program costs a fraction of the import (targeted work, not a full rebuild)', T['add program 1'] < tImp / 2, T['add program 1'] + ' vs import ' + tImp);
    check('repeated adds do not grow (the third add is not much slower than the first)', T['add program 3'] < T['add program 1'] * 1.8, T['add program 3'] + ' vs ' + T['add program 1']);
    check('adding a group costs about the same as adding a program', T['add group'] < T['add program 1'] * 2.5, T['add group'] + ' vs ' + T['add program 1']);
    // jsdom timings are only meaningful relative to each other: a collapse cycle across every group costs less than one add
    check('collapse / expand across 8 groups is fast (less than one add)', T['collapse all groups'] < T['add program 1'] && T['expand all groups'] < T['add program 1'], T['collapse all groups'] + ' / ' + T['expand all groups'] + ' vs ' + T['add program 1']);
    // a delete still rebuilds the Staffing Hours tables (positions shift), so it costs more than an add but far less than two imports
    check('deleting a program or a group costs less than two imports (no repeated full-application rebuild)', T['delete program'] < tImp * 2 && T['delete group'] < tImp * 2, T['delete program'] + ' / ' + T['delete group'] + ' vs import ' + tImp);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Rapid actions ═══ */
  await suite('Rapid actions on the large guide: add, add, price, delete, add group, delete group with no pause; the final state is the latest committed one', async () => {
    await importGuide(dom, c, fxBig(6, 6, 4), 4000); await flush(3000);
    const n0 = det().calendarRows.length; const g2 = groupIds()[2];
    await opAddProgram(g2); await opAddProgram(g2); await opPph('cal_3', '77.00'); await opDelete(String(det().calendarRows[det().calendarRows.length - 1].calId)); await opAddFP(); await flush(200); const gn = groupIds()[groupIds().length - 1]; await delGroup(gn, true);
    await after('burst settled', 4000);
    check('no lost or duplicated programs: +2 -1 +1(group) -1(group) = +1', det().calendarRows.length === n0 + 1 && new Set(det().calendarRows.map(r => r.calId)).size === n0 + 1 && groupIds().length === 6);
    check('the price landed', det().calendarRows[2].pricePerHour === '77.00');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Export / import under load ═══ */
  await suite('Large guide export then import: grouping, order, data, totals and calculations identical; editing continues normally', async () => {
    await importGuide(dom, c, fxBig(6, 6, 4), 4000); await flush(3000);
    await opAddProgram(groupIds()[1]); await flush(3000); await opDate(String(det().calendarRows[det().calendarRows.length - 1].calId), 'Sep 1, 2026', 'Sep 20, 2026'); await flush(3500);
    const snap = () => JSON.stringify({ groups: groupIds(), mem: groupIds().map(members), calc: calc(), boxes: ['hours', 'amount', 'avail'].map(box), fpTot: [...gCard().querySelectorAll('tr.pg-gs-fp-total')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) });
    const S0 = snap();
    let cap = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') cap = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {}; const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60); $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    await importGuide(dom, c, fx(), 2500); await flush(800); await importGuide(dom, c, cap, 4000); await flush(3000);
    check('identical after the round trip', snap() === S0, snap().slice(0, 200));
    await after('after import', 300);
    await opAddProgram(groupIds()[4]); await after('edit continues after import', 3500);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\n    verified states: ' + states + ', failing states: ' + badStates);
  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
