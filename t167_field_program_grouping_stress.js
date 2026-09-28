// t167_field_program_grouping_stress.js — Field Program grouping propagation. Moving programs between groups is
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

  /* ═══ 1. Grouping changes ═══ */
  await suite('Adding groups and programs, dating and pricing a new program, deleting and undoing: every area, every total and every hierarchy hold after each change', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    await after('initial (three groups: 2 / 2 / 1)', 300);
    await opAddFP(); await after('add Field Program 4 (empty)', 2500);
    await opAddProgram('fp_c'); await after('add a program to the one-program group Evening', 3000);
    const n1 = lastCal();
    await opDate(n1, 'Jul 20, 2026', 'Jul 31, 2026'); await after('date the new program (it now enters Summary, Calendars and Program Summaries)', 3500);
    await opPph(n1, '77.00'); await after('price it', 2500);
    const g4 = groupIds()[3];
    await opAddProgram(g4); await after('add a program to the new group', 3000);
    await opAddProgram(g4); await opAddProgram(g4); await after('two more, quickly', 3500);
    check('the new group now has three programs and the totals label says so', members(g4).length === 3 && /3 programs$/.test(card(g4).querySelector('.pg-cal-total-labeltxt').getAttribute('aria-label')));
    // the Undo notice auto-dismisses after ~2s of timers, and the full verification alone can take that long in
    // jsdom: two quick checks, click Undo at once, then verify the delete's effect through the restored state
    await opDelete('cal_4'); await flush(1200);
    check('Field Program 2 is down to one program (data and Site Breakdown)', members('fp_b').length === 1 && !(areaMembers['Site Breakdown']()['fp_b'] || []).includes('cal_4'));
    const ok = await opUndo(); check('the delete offered Undo', ok); await after('Undo the delete', 3000);
    check('Undo puts it back into Field Program 2 everywhere', ok && members('fp_b').includes('cal_4') && areaMembers['Site Breakdown']()['fp_b'].includes('cal_4') && areaMembers['Programs']()['fp_b'].includes('cal_4'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Calendars scoping and hierarchy under grouping changes ═══ */
  await suite('Calendar controls stay scoped per group while programs are added; collapse states survive grouping changes without corruption', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    const set = async (g, cls, on) => { const k = calChk(g, cls); k.checked = on; $(k).trigger('change'); await flush(2500); };
    await set('fp_b', 'cal-fp-cv-chk', true); await after('Field Program 2 in Combined View', 500);
    $(sbTog('fp_b')).trigger('click'); $(sfTog('fp_b')).trigger('click'); $(psTog('fp_b')).trigger('click'); await flush(600);
    await after('Field Program 2 collapsed in Site Breakdown, Staffing Hours and Program Summaries', 300);
    await opAddProgram('fp_b'); await after('add a program to the combined, collapsed group', 3000);
    const n2 = lastCal();
    check('the previously collapsed programs stay collapsed; the new one arrives expanded, so the group reads mixed', /^Expand/.test(d.querySelector('#calgroups-section-pg-001 .site-cal-card[data-site-cal="cal_2"] .pg-sec-toggle').getAttribute('title')) && !/^Expand/.test(d.querySelector('#calgroups-section-pg-001 .site-cal-card[data-site-cal="' + n2 + '"] .pg-sec-toggle').getAttribute('title')));
    await opDate(n2, 'Jul 20, 2026', 'Jul 31, 2026'); await after('date it: it joins Field Program 2\u2019s Combined Calendar', 3500);
    check('the Combined Calendar of Field Program 2 now holds its three programs and no others', JSON.stringify(areaMembers['Calendars']()['fp_b'].sort()) === JSON.stringify(['cal_2', 'cal_4', n2].sort()) && !!d.querySelector('#cal-section-pg-001 .cal-fp-body[data-cal-fp="fp_b"] .cal-combined-day'));
    check('Field Program 2\u2019s Combined View is still on and the other groups\u2019 controls are untouched', calChk('fp_b', 'cal-fp-cv-chk').checked && !calChk('', 'cal-fp-cv-chk').checked);
    $(calTog('')).trigger('click'); await flush(600);
    await after('collapse the first group in Calendars', 300);
    await opAddProgram(''); await after('add a program to that collapsed group', 3000);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Rapid bursts ═══ */
  await suite('Rapid consecutive grouping changes settle to a consistent state everywhere', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    await opAddFP(); await flush(300); await opAddFP(); await flush(300);
    const g4 = groupIds()[3], g5 = groupIds()[4];
    await opAddProgram(g4); await flush(300); await opAddProgram(g5); await flush(300); await opAddProgram(''); await flush(300); await opAddProgram(g4);
    await after('2 groups + 4 programs back to back', 4000);
    check('five groups, nine programs, each where it was put', groupIds().length === 5 && det().calendarRows.length === 9 && members(g4).length === 2 && members(g5).length === 1 && members('').length === 3);
    await opDelete(lastCal()); await flush(300); await opDelete(lastCal());
    await after('two deletes back to back', 4000);
    check('seven programs remain, membership intact', det().calendarRows.length === 7 && members(g4).length === 1 && members('').length === 2);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 4. Persistence ═══ */
  await suite('Export then import: every assignment, order, group total and calculation matches the pre-export state', async () => {
    await importGuide(dom, c, fx()); await flush(1500);
    await opAddFP(); await flush(2000); const g4 = groupIds()[3]; await opAddProgram(g4); await flush(2500); await opDate(lastCal(), 'Jul 20, 2026', 'Jul 31, 2026'); await flush(3000);
    await after('before export', 500);
    const snap = () => JSON.stringify({ groups: groupIds(), mem: groupIds().map(members), calc: calc(), boxes: ['hours', 'amount', 'avail'].map(box), fpTot: [...gCard().querySelectorAll('tr.pg-gs-fp-total')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), pcSub: [...pl().querySelectorAll('tr.pg-disc-fp-subtotal')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) });
    const S0 = snap();
    let cap = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') cap = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {}; const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60); $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    await importGuide(dom, c, fx()); await flush(800);
    await importGuide(dom, c, cap); await flush(2500);
    await after('after import', 500);
    check('assignments, order, Field Program totals, Pricing subtotals, boxes and the calculated block are identical', snap() === S0, snap().slice(0, 240));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\n    verified states: ' + states + ', failing states: ' + badStates);
  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
