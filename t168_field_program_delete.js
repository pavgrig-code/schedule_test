// t168_field_program_delete.js (shares t167's prelude: fixture, membership / totals / hierarchy verifiers, drivers) — Field Program grouping propagation. Moving programs between groups is
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
function fx() {
  const cal = (id, n, col, pph, last) => ({ name: n, firstDay: '2026-07-20', lastDay: last || '2026-07-31', color: col, pricePerHour: pph, billable: true, calId: id });
  const rows = [cal('cal_1', 'One', '#e57373', '80.00'), cal('cal_2', 'Two', '#64b5f6', '70.00'), cal('cal_3', 'Three', '#81c784', '60.00', '2026-07-28'), cal('cal_4', 'Four', '#ffb74d', '75.37'), cal('cal_5', 'Five', '#ba68c8', '90.00')];
  rows[1].fpId = 'fp_b'; rows[3].fpId = 'fp_b'; rows[4].fpId = 'fp_c';
  const sch = (n, id, a, b) => ({ school: n, schoolId: id, coaches_ctkk: a, ctkk: b });
  const data = {
    status: 'Draft', combinedView: false, calendarRows: rows,
    fieldPrograms: [{ id: 'fp_b' }, { id: 'fp_c', name: 'Evening' }],
    siteRowsByCal: { cal_1: [sch('S1', 's1', 1, 10), sch('S2', 's2', 2, 20)], cal_2: [sch('S3', 's3', 2, 20)], cal_3: [sch('S4', 's4', 1, 10)], cal_4: [sch('S5', 's5', 3, 30), sch('S6', 's6', 1, 10)], cal_5: [sch('S7', 's7', 2, 20)] },
    siteRows: [sch('S1', 's1', 1, 10)],
    discounts: { names: ['D1'], stages: [{ byCal: { cal_1: { name: 'D1', pct: '5' }, cal_4: { name: 'D1', pct: '10' } } }] },
    districtFloor: '30.00', cola: { on: true, pct: '2.5' }, notToExceed: { nte: '250000' },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('08:30', '14:00') }, c2: { ctkk: mkTimes('09:00', '13:00') }, c3: { ctkk: mkTimes('10:00', '16:30') }, c4: { ctkk: mkTimes('09:00', '12:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data });
}

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

  // ── per-program data profile, resolved through the program's CURRENT position; identical before and after any
  // deletion for every survivor (fpId and session origIdx are compared separately: they legitimately change) ──
  const CKEY = /^((?:s\d+)?)c(\d+)([ab]?)$/;
  const profile = cid => {
    const D = det(), rows = D.calendarRows, i = rows.findIndex(r => String(r.calId) === cid); if (i < 0) return null;
    const pick = store => { const o = {}; Object.keys(store || {}).forEach(k => { const m = CKEY.exec(k); if (m && parseInt(m[2], 10) === i) o[m[1] + 'c#' + m[3]] = store[k]; }); return o; };
    const byCal = name => { const st = D[name] || {}; const o = {}; Object.keys(st).forEach(k => { if (String(k).split('|')[0] === cid) o[k.replace(cid, '@')] = st[k]; }); return o; };
    const rec = calc().find(x => String(x.calId) === cid);
    const row = Object.assign({}, rows[i]); delete row.fpId;
    return JSON.stringify({ row, slots: pick(D.staffingHoursSlots), alloc: pick(D.staffAlloc), site: D.siteRowsByCal && D.siteRowsByCal[cid], order: (D.siteOrderByCal || {})[cid], pods: (D.podsByCal || {})[cid], labels: (D.sbLabelsByCal || {})[cid], wkRot: (D.wkRot || {})[cid], wkOv: (D.wkOv || {})[cid], wkExcl: (D.wkExcl || {})[cid], rotOv: (D.allocRotDayOv || {})[cid], markers: byCal('calMarkers'), cellOv: byCal('calCellOverrides'), dayTot: byCal('calDayTotalsOv'), ff: byCal('fulfillment'), ffAuth: byCal('fulfillmentAuth'), disc: ((D.discounts || {}).stages || []).map(st => (st.byCal || {})[cid] || null), hours: rec && rec.totalHours, amount: rec && rec.amount, net: num((pl().querySelector('td.pg-cal-disc-amount[data-disc-cal="' + cid + '"]') || {}).textContent), sessions: (D.sessions || []).filter(x => String(x.calId) === cid).map(x => { const y = Object.assign({}, x); delete y.origIdx; return y; }) });
  };
  const profiles = () => { const o = {}; det().calendarRows.forEach(r => { o[String(r.calId)] = profile(String(r.calId)); }); return o; };
  // nothing left behind for removed programs; every positional key points at an existing position
  const orphans = removed => {
    const D = det(), bad = [], n = D.calendarRows.length;
    ['staffingHoursSlots', 'staffAlloc'].forEach(nm => Object.keys(D[nm] || {}).forEach(k => { const m = CKEY.exec(k); if (m && parseInt(m[2], 10) >= n) bad.push(nm + ' key ' + k + ' beyond the last program'); }));
    ['siteRowsByCal', 'siteOrderByCal', 'podsByCal', 'sbLabelsByCal', 'staffingOptsByCal', 'unschedByCal', 'wkRot', 'wkOv', 'wkExcl', 'wkRotHrs', 'allocRotDayOv', 'allocRotDayOff', 'fulfillmentAuth', 'calCellOverrides', 'calDayTotalsOv', 'calMarkers', 'fulfillment', 'fulfillmentMap'].forEach(nm => Object.keys(D[nm] || {}).forEach(k => { if (removed.includes(String(k).split('|')[0])) bad.push(nm + ' still holds ' + k); }));
    (D.sessions || []).forEach(x => { if (removed.includes(String(x.calId))) bad.push('session of a removed program'); if (x.origIdx != null && (x.origIdx < 0 || x.origIdx >= n)) bad.push('session origIdx out of range'); });
    return bad;
  };
  const undoBtnNow = () => [...d.querySelectorAll('.pg-undo-snack .pg-undo-btn')].pop();
  // delete a group through its header menu + confirmation
  const delGroup = async (g, confirm) => {
    const hd = pl().querySelector('.pg-fp-card[data-fp-id="' + g + '"] [data-pg-sec-key="calsetup"]');
    $(hd).trigger('mouseenter'); await flush(50); $(hd.querySelector('.pg-fp-dots')).trigger('click'); await flush(200);
    $(d.querySelector('.pg-fp-menu .pg-fp-menu-delete')).trigger('click'); await flush(300);
    const ov = d.querySelector('.pg-confirm-ov'); const btn = ov && [...ov.querySelectorAll('button')].find(b => b.textContent.trim() === (confirm ? 'Delete' : 'Cancel'));
    if (btn) $(btn).trigger('click'); await flush(confirm ? 3500 : 300);
  };
  // the whole guide-level check after a deletion
  const afterDelete = (label, before, removed, survivors) => {
    const bad = [];
    survivors.forEach(cid => { if (!det().calendarRows.some(r => String(r.calId) === cid)) bad.push(cid + ' missing'); else if (profile(cid) !== before[cid]) bad.push(cid + ' data changed'); });
    removed.forEach(cid => { if (det().calendarRows.some(r => String(r.calId) === cid)) bad.push(cid + ' still present'); });
    bad.push(...orphans(removed));
    const order = det().calendarRows.map(r => String(r.calId)); const want = survivors.filter(cid => order.includes(cid));
    if (JSON.stringify(order) !== JSON.stringify(want)) bad.push('order ' + order.join(',') + ' vs ' + want.join(','));
    bad.push(...verifyMembership(), ...verifyTotals(), ...verifyHierarchy());
    check('[' + label + '] only the group and its programs went; every survivor keeps its exact data, in order; nothing orphaned; every area and total reconciles', bad.length === 0, bad.slice(0, 4).join(' ; '));
  };
  const opSetFirst = async (cid, txt) => { const { r } = rowOf(cid); const el = [...r.querySelectorAll('input')].filter(i => i.placeholder === 'Aug 3, 2026')[0]; $(el).val(txt); $(el).trigger($.Event('keydown', { key: 'Enter' })); };

  /* ═══ 1. Deleting the middle, last, first and only groups, with data everywhere ═══ */
  await suite('Delete a middle group, then the last, then the first (its successor is promoted), then the only one (a fresh blank group with one program); every survivor keeps its exact data after each', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    // extensive data on survivors and on the doomed group alike: an Override Day Total, a Freeze, an Extra edit
    const cell = (cid, dk) => pl().querySelector('.cal-day-cell[data-cal-id="' + cid + '"][data-date-key="' + dk + '"]:not(.cal-combined-carrier)');
    const popup = () => [...d.querySelectorAll('.cal-hours-breakdown')].filter(e => e.style.display !== 'none').pop();
    $(cell('cal_1', '2026-07-21')).trigger('click'); await flush(600);
    { const q = k => popup().querySelector('.cal-tip-ovr-day-totals ' + k); q('.cal-tip-odt-chk').checked = true; $(q('.cal-tip-odt-chk')).trigger('change'); await flush(900); $(q('.cal-tip-odt-hours')).val('40').trigger('input'); $(q('.cal-tip-odt-staff')).val('9').trigger('input'); await flush(40); $(q('.cal-tip-odt-save')).trigger('click'); await flush(900); $(d.body).trigger('click'); await flush(300); }
    $(cell('cal_5', '2026-07-22')).trigger('contextmenu'); await flush(300);
    { const m = d.querySelector('.cal-ctx-menu'); $(m.querySelector('.cal-ctx-freeze')).trigger('click'); await flush(60); $([...m.querySelectorAll('*')].filter(e => e.children.length === 0).find(e => e.textContent.trim() === 'Apply')).trigger('click'); await flush(2000); }
    await opPph('cal_3', '61.50'); await flush(2000);
    check('data is in place (an override on cal_1, a freeze on cal_5, a price on cal_3)', Object.keys(det().calDayTotalsOv || {}).some(k => k.startsWith('cal_1|')) && Object.keys(det().calMarkers || {}).some(k => k.startsWith('cal_5|')) && det().calendarRows[2].pricePerHour === '61.50');
    let before = profiles();
    await delGroup('fp_b', false);
    check('Cancel changes nothing', JSON.stringify(profiles()) === JSON.stringify(before) && det().calendarRows.length === 5 && !d.querySelector('.pg-confirm-ov'));
    await delGroup('fp_b', true);
    afterDelete('middle group Field Program 2 (cal_2, cal_4)', before, ['cal_2', 'cal_4'], ['cal_1', 'cal_3', 'cal_5']);
    check('the groups are now the first and Evening', JSON.stringify(groupIds()) === JSON.stringify(['', 'fp_c']));
    before = profiles();
    await delGroup('fp_c', true);
    afterDelete('last group Evening (cal_5, one program, frozen day)', before, ['cal_5'], ['cal_1', 'cal_3']);
    check('one group left, holding cal_1 and cal_3', JSON.stringify(groupIds()) === JSON.stringify(['']) && !det().fieldPrograms);
    // the first group with a successor: import a fresh three-group guide and delete its first group
    await importGuide(dom, c, fx()); await flush(1500);
    before = profiles();
    await delGroup('', true);
    afterDelete('first group (cal_1, cal_3): Field Program 2 is promoted into first place', before, ['cal_1', 'cal_3'], ['cal_2', 'cal_4', 'cal_5']);
    check('the promoted group is now the first, keeping its programs and default name; Evening follows', JSON.stringify(groupIds()) === JSON.stringify(['', 'fp_c']) && det().calendarRows.slice(0, 2).every(r => !r.fpId) && !det().programsLabel && pl().querySelector('.pg-fp-card[data-fp-id=""] .pg-programs-label').textContent === 'Field Program');
    // the only group
    const J = JSON.parse(fx()); delete J.data.fieldPrograms; J.data.calendarRows.forEach(r => delete r.fpId); J.data.programsLabel = 'Solo';
    await importGuide(dom, c, JSON.stringify(J)); await flush(1500);
    await delGroup('', true);
    // the fresh program gets a new program's own defaults (one blank school row, an empty slot at position 0) and nothing of the old ones
    const fresh = det().calendarRows[0] && String(det().calendarRows[0].calId);
    check('deleting the only group leaves a fresh default group with exactly one blank program and nothing else', groupIds().length === 1 && det().calendarRows.length === 1 && !det().calendarRows[0].name && !det().calendarRows[0].firstDay && !det().programsLabel && !det().fieldPrograms && Object.keys(det().staffingHoursSlots || {}).every(k => /^c0[ab]?$/.test(k)) && Object.keys(det().siteRowsByCal || {}).every(k => k === fresh) && !['cal_1', 'cal_2', 'cal_3', 'cal_4', 'cal_5'].some(cid => JSON.stringify(det()).includes('"' + cid + '"')));
    check('...and every area shows that one blank program under one group', verifyMembership().concat(verifyHierarchy()).length === 0 && pl().querySelectorAll('.pg-fp-card').length === 1);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Many programs, repeated add/delete, Undo, the single delete ═══ */
  await suite('A many-program group, repeated add-and-delete, Undo restoring everything, and the single-program delete now keeping every survivor\u2019s data', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    $(pl().querySelector('.pg-add-fp-btn')).trigger('click'); await flush(2500);
    const g4 = groupIds()[3];
    check('a new group starts with exactly one blank program', members(g4).length === 1 && !det().calendarRows[det().calendarRows.length - 1].name);
    for (let k = 0; k < 4; k++) { $(pl().querySelector('.pg-fp-card[data-fp-id="' + g4 + '"] .pg-add-prog-btn')).trigger('click'); await flush(2200); }
    const last = String(det().calendarRows[det().calendarRows.length - 1].calId);
    await opSetFirst(last, 'Jul 20, 2026'); await flush(1500); await opDate(last, 'Jul 20, 2026', 'Jul 31, 2026'); await flush(3000);
    check('the group holds five programs, one of them dated', members(g4).length === 5 && calc().some(x => String(x.calId) === last));
    let before = profiles(); const doomed = members(g4).slice(); const keep = det().calendarRows.map(r => String(r.calId)).filter(cid => !doomed.includes(cid));
    await delGroup(g4, true);
    afterDelete('many-program group (5, one dated)', before, doomed, keep);
    // repeated add / delete
    for (let k = 0; k < 3; k++) {
      $(pl().querySelector('.pg-add-fp-btn')).trigger('click'); await flush(2500);
      const gid = groupIds()[groupIds().length - 1]; const b2 = profiles(); const dm = members(gid).slice(); const kp = det().calendarRows.map(r => String(r.calId)).filter(cid => !dm.includes(cid));
      await delGroup(gid, true);
      afterDelete('add + delete round ' + (k + 1), b2, dm, kp);
    }
    check('three groups remain, exactly the original five programs', JSON.stringify(groupIds()) === JSON.stringify(['', 'fp_b', 'fp_c']) && det().calendarRows.map(r => r.calId).join() === 'cal_1,cal_2,cal_3,cal_4,cal_5');
    // Undo restores the deleted group with everything in it
    const full = () => JSON.stringify(det());
    const F0 = full();
    await delGroup('fp_b', true);
    check('Field Program 2 is gone', !groupIds().includes('fp_b') && det().calendarRows.length === 3);
    const ub = undoBtnNow(); if (ub) $(ub).trigger('click'); await flush(3500);
    check('Undo restores the group, its programs and every store byte for byte', !!ub && full() === F0, ub ? (full().length + ' vs ' + F0.length) : 'no Undo offered');
    afterDelete('after Undo', profiles(), [], det().calendarRows.map(r => String(r.calId)));
    // the single-program delete keeps survivors intact (the pre-existing shift is fixed)
    before = profiles();
    await opDelete('cal_1'); await flush(3000);
    afterDelete('single delete of the first program', before, ['cal_1'], ['cal_2', 'cal_3', 'cal_4', 'cal_5']);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Header behaviour ═══ */
  await suite('Header: chevron-only collapse, hover-only "..." menu, and "+ Add Field Program" hidden while every group is collapsed', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    const hd = g => pl().querySelector('.pg-fp-card[data-fp-id="' + g + '"] [data-pg-sec-key="calsetup"]');
    const expd = g => hd(g).querySelector('.pg-cal-toggle').getAttribute('aria-expanded') === 'true';
    check('the header shows "Name (n programs)" then the hidden "..." button, in that order', hd('fp_b').querySelector('.pg-fp-count').textContent === '(2 programs)' && hd('fp_b').querySelector('.pg-programs-label').nextElementSibling === hd('fp_b').querySelector('.pg-fp-count') && hd('fp_b').querySelector('.pg-fp-count').nextElementSibling === hd('fp_b').querySelector('.pg-fp-dots') && hd('fp_b').querySelector('.pg-fp-dots').style.display === 'none');
    $(hd('fp_b').querySelector('.pg-fp-count')).trigger('click'); await flush(200); check('clicking the count does not toggle', expd('fp_b'));
    $(hd('fp_b')).trigger('click'); await flush(200); check('clicking blank header space does not toggle', expd('fp_b'));
    $(hd('fp_b')).trigger('mouseenter'); await flush(50);
    check('hovering the header reveals "..."', hd('fp_b').querySelector('.pg-fp-dots').style.display !== 'none');
    $(hd('fp_b').querySelector('.pg-fp-dots')).trigger('click'); await flush(200);
    check('clicking "..." opens "Delete Field Program 2" and does not toggle', !!d.querySelector('.pg-fp-menu') && /Delete Field Program 2/.test(d.querySelector('.pg-fp-menu').textContent) && expd('fp_b'));
    $(d.body).trigger('mousedown'); await flush(100);
    $(hd('fp_b')).trigger('mouseleave'); await flush(50);
    check('leaving the header hides "..." again', hd('fp_b').querySelector('.pg-fp-dots').style.display === 'none');
    $(hd('fp_b').querySelector('.pg-cal-toggle')).trigger('click'); await flush(300);
    check('the chevron still collapses', !expd('fp_b'));
    for (const g of ['', 'fp_c']) { $(hd(g).querySelector('.pg-cal-toggle')).trigger('click'); await flush(300); }
    check('with every group collapsed, "+ Add Field Program" is hidden', pl().querySelector('.pg-fp-add-row').style.display === 'none');
    $(hd('fp_c').querySelector('.pg-cal-toggle')).trigger('click'); await flush(300);
    check('expanding one group restores it at once', pl().querySelector('.pg-fp-add-row').style.display !== 'none');
    check('program data untouched by all of it', det().calendarRows.length === 5 && det().calendarRows.every(r => r.calId));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
