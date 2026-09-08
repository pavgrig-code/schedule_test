// t124_pph_net_summary.js — Fifty-eighth spec parts 2-6: PPH (Net) column in the Program Summaries
// and Planning Guide Summary, placed between Hours and Amount; Amount = Hours x PPH (Net) using the
// EFFECTIVE net rate (not the editable base PPH); the PG Summary Total shows the weighted PPH (Net).
// Uses a 10% discount so PPH (Net) != base PPH (the whole point of part 4).
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function fx() {
  const wk = { mon: { start: '14:00', end: '18:00' }, tue: { start: '14:00', end: '18:00' }, wed: { start: '14:00', end: '18:00' }, thu: { start: '14:00', end: '18:00' }, fri: { start: '14:00', end: '18:00' } };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
    status: 'Draft',
    calendarRows: [{ name: 'Alpha', calId: 'cal_a', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#e57373', pricePerHour: '100.00', billable: true }],
    siteRows: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }], siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }] },
    staffingHoursSlots: { c0: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }],
    discounts: { names: ['D1'], stages: [{ byCal: { cal_a: { pct: '10' } } }] }, districtFloor: '0'
  } });
}
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
(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400); const pl = () => d.getElementById('planning-panel');
  await importGuide(dom, c, fx()); await flush(1200);
  const num = t => parseFloat(String(t || '').replace(/[^0-9.]/g, '')) || 0;

  await suite('Part 1: Show Staff Counts is checked by default', async () => {
    const scChk = d.querySelector('.sf-show-cnt-chk');
    check('the Show Staff Counts checkbox is checked on open', !!scChk && scChk.checked === true);
  });

  await suite('Parts 2/4/5: Program Summary has PPH (Net) between Hours and Amount, using the net rate', async () => {
    const card = d.getElementById('summary-section-pg-001').querySelector('[data-summary-cal]');
    const hdr = [...card.querySelectorAll('thead th')].map(t => t.textContent.trim());
    const hIdx = hdr.indexOf('Hours'), pIdx = hdr.indexOf('PPH (Net)'), aIdx = hdr.indexOf('Amount');
    check('the header has a PPH (Net) column', pIdx >= 0, hdr.join('|'));
    check('column order is Hours -> PPH (Net) -> Amount', hIdx >= 0 && hIdx < pIdx && pIdx < aIdx, hIdx + '/' + pIdx + '/' + aIdx);
    const progNet = d.querySelector('td.pg-cal-disc-price');
    check('the Programs table PPH (Net) is $90.00 (10% off $100)', progNet && progNet.textContent === '$90.00', progNet && progNet.textContent);
    const schoolRow = [...card.querySelectorAll('tbody tr')].find(r => /A1/.test(r.textContent));
    check('the summary school row exists', !!schoolRow);
    if (schoolRow) {
      const cells = [...schoolRow.children].map(x => x.textContent);
      const h = num(cells[hIdx]), netP = num(cells[pIdx]), amt = num(cells[aIdx]);
      check('Part 5: summary PPH (Net) equals the Programs table PPH (Net) ($90.00)', cells[pIdx].trim() === progNet.textContent.trim(), cells[pIdx]);
      check('Part 4: Amount == Hours x PPH (Net) (net rate, NOT base $100)', Math.abs(amt - h * netP) < 0.05 && Math.abs(amt - h * 90) < 0.05, h + ' x ' + netP + ' = ' + (h * netP).toFixed(2) + ' vs ' + amt);
      check('Part 4: Amount is NOT computed from the base $100 PPH', Math.abs(amt - h * 100) > 0.05, 'amt=' + amt + ' baseWouldBe=' + (h * 100));
    }
  });

  await suite('Parts 3/6: Planning Guide Summary has PPH (Net) + a WEIGHTED total', async () => {
    const gCard = d.querySelector('[data-guide-summary]');
    check('the Planning Guide Summary card exists', !!gCard);
    if (gCard) {
      const gHdr = [...gCard.querySelectorAll('thead th')].map(t => t.textContent.trim());
      const gp = gHdr.indexOf('PPH (Net)'), gh = gHdr.indexOf('Hours'), ga = gHdr.indexOf('Amount');
      check('Part 3: the PG Summary has PPH (Net) between Hours and Amount', gp >= 0 && gh < gp && gp < ga, gHdr.join('|'));
      const progWeighted = d.querySelector('td.pg-cal-total-disc-price');
      const gTot = [...gCard.querySelectorAll('tr')].find(r => /Planning Guide/.test(r.textContent));
      check('Part 6: the PG Summary Total PPH (Net) equals the Programs table WEIGHTED total ($90.00)', gTot && [...gTot.children][gp].textContent.trim() === progWeighted.textContent.trim() && progWeighted.textContent === '$90.00', gTot && [...gTot.children][gp].textContent);
    }
  });

  check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  await suite('Fifty-ninth spec: a discount change propagates PPH (Net) + Amount to the summaries immediately', async () => {
    const cardSel = '[data-summary-cal]';
    const sumNet = () => { const card = d.getElementById('summary-section-pg-001').querySelector(cardSel); const hdr = [...card.querySelectorAll('thead th')].map(t => t.textContent.trim()); const pIdx = hdr.indexOf('PPH (Net)'); const row = [...card.querySelectorAll('tbody tr')].find(r => /A1/.test(r.textContent)); return row ? [...row.children][pIdx].textContent.trim() : '?'; };
    const sumAmt = () => { const card = d.getElementById('summary-section-pg-001').querySelector(cardSel); const hdr = [...card.querySelectorAll('thead th')].map(t => t.textContent.trim()); const aIdx = hdr.indexOf('Amount'); const row = [...card.querySelectorAll('tbody tr')].find(r => /A1/.test(r.textContent)); return row ? [...row.children][aIdx].textContent.trim() : '?'; };
    const gTotNet = () => { const g2 = d.querySelector('[data-guide-summary]'); if (!g2) return '?'; const hdr = [...g2.querySelectorAll('thead th')].map(t => t.textContent.trim()); const p = hdr.indexOf('PPH (Net)'); const tot = [...g2.querySelectorAll('tr')].find(r => /Planning Guide/.test(r.textContent)); return tot ? [...tot.children][p].textContent.trim() : '?'; };
    const progNet = () => { const c2 = d.querySelector('td.pg-cal-disc-price'); return c2 ? c2.textContent.trim() : '?'; };
    check('baseline: everything reads $90.00 (10% off $100)', progNet() === '$90.00' && sumNet() === '$90.00' && gTotNet() === '$90.00');
    // clear the discount through the real UI path -> net PPH returns to $100
    const discHd = [...pl().querySelectorAll('.pg-sec-toggle')].find(t => /Discounts/.test(t.getAttribute('title') || ''));
    if (discHd) { $(discHd).trigger('click'); await flush(600); }
    const xBtn = pl().querySelector('.pg-disc-cell-x');
    check('the discount clear (x) control is available', !!xBtn);
    if (xBtn) { $(xBtn).trigger('click'); await flush(800); }
    check('Programs table PPH (Net) updated to $100.00 immediately', progNet() === '$100.00', progNet());
    check('summary PPH (Net) propagated to $100.00 immediately', sumNet() === '$100.00', sumNet());
    check('summary Amount recalculated to $54,000.00 (540 x $100)', sumAmt() === '$54,000.00', sumAmt());
    check('Planning Guide Summary weighted PPH (Net) updated to $100.00', gTotNet() === '$100.00', gTotNet());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  await suite('Sixtieth spec: rounded PPH (Net) is the source of truth; Programs total == PG Summary total', async () => {
    // A fractional base price + a discount produce a PPH (Net) that rounds (e.g. $75.2580... -> $75.26).
    // The Programs total and the Planning Guide Summary total must match to the cent (no hidden precision).
    const E = await (async () => {
      const dom2 = bootApp(); const W2 = dom2.window; const c2 = ctx(dom2); const d2 = c2.d, $2 = c2.$;
      await whenReady(dom2); await flush(400);
      const wk = { mon: { start: '14:00', end: '18:00' }, tue: { start: '14:00', end: '18:00' }, wed: { start: '14:00', end: '18:00' }, thu: { start: '14:00', end: '18:00' }, fri: { start: '14:00', end: '18:00' } };
      const j = JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
        status: 'Draft',
        calendarRows: [
          { name: 'Alpha', calId: 'cal_a', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#e57373', pricePerHour: '86.75', billable: true },
          { name: 'Beta', calId: 'cal_b', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#64b5f6', pricePerHour: '93.40', billable: true }
        ],
        siteRows: [{ school: 'A1', ctkk: '7' }], siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '7' }], cal_b: [{ school: 'B1', ctkk: '5' }] },
        staffingHoursSlots: { c0: { ctkk: wk }, c1: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }],
        discounts: { names: ['D1'], stages: [{ byCal: { cal_a: { name: 'D1', pct: '13.25' }, cal_b: { name: 'D1', pct: '7.5' } } }] }, districtFloor: '0'
      } });
      await importGuide(dom2, c2, j); await flush(1400);
      return { dom2, W2, d2, $2 };
    })();
    const { d2 } = E;
    const num2 = t => parseFloat(String(t || '').replace(/[^0-9.]/g, '')) || 0;
    const progTot = d2.querySelector('td.pg-cal-total-disc-amount');
    const gCard = d2.querySelector('[data-guide-summary]');
    const gHdr = gCard ? [...gCard.querySelectorAll('thead th')].map(t => t.textContent.trim()) : [];
    const aIdx = gHdr.indexOf('Amount');
    const gTot = gCard && [...gCard.querySelectorAll('tr')].find(r => /Planning Guide/.test(r.textContent));
    const pgTotAmt = gTot ? [...gTot.children][aIdx].textContent : '?';
    check('Programs table Total Amount and Planning Guide Summary Total Amount match to the cent', progTot && progTot.textContent.trim() === String(pgTotAmt).trim(), 'programs=' + (progTot && progTot.textContent) + ' pg=' + pgTotAmt);
    check('the two totals differ by $0.00 (no hidden PPH precision)', progTot && Math.abs(num2(progTot.textContent) - num2(pgTotAmt)) < 0.005, 'diff=' + (progTot ? (num2(pgTotAmt) - num2(progTot.textContent)).toFixed(4) : '?'));
    // each program's PPH (Net) is a clean 2-decimal value used for its Amount
    const perCalPrice = [...d2.querySelectorAll('td.pg-cal-disc-price[data-disc-cal]')].map(td => td.textContent.trim());
    check('per-program PPH (Net) values are rounded to 2 decimals', perCalPrice.length > 0 && perCalPrice.every(v => /^\$[\d,]+\.\d{2}$/.test(v)), perCalPrice.join(','));
  });

  await suite('Sixty-third spec: Program Amount Breakdown popup reconciles from both entry points', async () => {
    const E2 = await (async () => {
      const dom2 = bootApp(); const c2 = ctx(dom2); const d2 = c2.d, $2 = c2.$; const W2 = dom2.window;
      await whenReady(dom2); await flush(400);
      const wk = { mon: { start: '14:00', end: '18:00' }, tue: { start: '14:00', end: '18:00' }, wed: { start: '14:00', end: '18:00' }, thu: { start: '14:00', end: '18:00' }, fri: { start: '14:00', end: '18:00' } };
      const j = JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
        status: 'Draft',
        calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#e57373', pricePerHour: '80.30', billable: true }],
        siteRows: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }, { school: 'A2', ctkk: '6', coaches_ctkk: '6' }],
        siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }, { school: 'A2', ctkk: '6', coaches_ctkk: '6' }] },
        staffingHoursSlots: { c0: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
      } });
      await importGuide(dom2, c2, j); await flush(1400);
      return { dom2, d2, $2, W2 };
    })();
    const { dom2, d2, $2, W2 } = E2;
    const num2 = t => parseFloat(String(t || '').replace(/[^0-9.]/g, '')) || 0;
    // open from the Program Summary Amount
    const sumAmt = d2.querySelector('#summary-section-pg-001 .pg-amt-clickable');
    check('the Program Summary Amount is clickable', !!sumAmt);
    if (sumAmt) { sumAmt.dispatchEvent(new W2.MouseEvent('click', { bubbles: true })); await flush(300); }
    let dd = d2.querySelector('.pg-amt-break-dd');
    check('clicking the summary Amount opens the breakdown popup', !!dd);
    if (dd) {
      const rows = [...dd.querySelectorAll('table tr')];
      const dataRows = rows.filter(r => r.children.length === 5 && !/^#$/.test(r.children[0].textContent) && !/Program Total/.test(r.textContent));
      const totRow = rows.find(r => /Program Total/.test(r.textContent));
      const sumH = dataRows.reduce((a, r) => a + num2(r.children[2].textContent), 0);
      const sumA = dataRows.reduce((a, r) => a + num2(r.children[4].textContent), 0);
      check('School Hours (+ Remaining) reconcile with the Program Total Hours', totRow && Math.abs(sumH - num2(totRow.children[2].textContent)) < 1, sumH + ' vs ' + (totRow && num2(totRow.children[2].textContent)));
      check('School Amounts (+ Remaining) reconcile with the Program Amount', totRow && Math.abs(sumA - num2(totRow.children[4].textContent)) < 0.05, sumA + ' vs ' + (totRow && num2(totRow.children[4].textContent)));
      check('the popup total equals the summary Amount cell', totRow && totRow.children[4].textContent.trim() === sumAmt.textContent.trim());
    }
    // now open from the Programs table Amount (Net) — same breakdown
    const cx = dd && [...dd.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (cx) cx.click(); await flush(100);
    const progAmt = d2.querySelector('td.pg-cal-disc-amount.pg-amt-clickable');
    check('the Programs table Amount (Net) is clickable', !!progAmt);
    if (progAmt) { progAmt.dispatchEvent(new W2.MouseEvent('click', { bubbles: true })); await flush(300); }
    const dd2 = d2.querySelector('.pg-amt-break-dd');
    check('clicking the Programs Amount opens the same breakdown', !!dd2);
    if (dd2 && progAmt) { const t2 = [...dd2.querySelectorAll('table tr')].find(r => /Program Total/.test(r.textContent)); check('Programs Amount == breakdown total (three-way reconciliation)', t2 && t2.children[4].textContent.trim() === progAmt.textContent.trim()); }
    // Sixty-fourth spec: the Planning Guide Summary rollup program-Amount cells open the same breakdown
    const cx2 = dd2 && [...dd2.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (cx2) cx2.click(); await flush(100);
    const gCard = d2.querySelector('[data-guide-summary]');
    const gRow = gCard && [...gCard.querySelectorAll('tbody tr')].find(r => !/Planning Guide/.test(r.textContent));
    const gAmt = gRow && [...gRow.children][gRow.children.length - 1];
    check('the Planning Guide Summary program Amount is clickable', !!gAmt && gAmt.classList.contains('pg-amt-clickable'));
    if (gAmt) { gAmt.dispatchEvent(new W2.MouseEvent('click', { bubbles: true })); await flush(300); }
    const dd3 = d2.querySelector('.pg-amt-break-dd');
    check('clicking the PG Summary program Amount opens the breakdown popup', !!dd3);
    if (dd3 && gAmt) { const t3 = [...dd3.querySelectorAll('table tr')].find(r => /Program Total/.test(r.textContent)); check('PG Summary program Amount == breakdown total', t3 && t3.children[4].textContent.trim() === gAmt.textContent.trim()); }
    check('no page errors', dom2.pageErrors.length === 0, dom2.pageErrors.slice(0, 1).join(''));
  });

  await suite('Sixty-fifth spec: Remaining Hours breakdown popup (Unallocated - Allocated) from both entry points', async () => {
    const E3 = await (async () => {
      const dom3 = bootApp(); const c3 = ctx(dom3); const d3 = c3.d, $3 = c3.$; const W3 = dom3.window;
      await whenReady(dom3); await flush(400);
      const wk = { mon: { start: '14:00', end: '18:00' }, tue: { start: '14:00', end: '18:00' } };
      const j = JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
        status: 'Draft',
        calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-01', lastDay: '2026-12-18', color: '#e57373', pricePerHour: '80', billable: true }],
        siteRows: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }], siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '9', coaches_ctkk: '9' }] },
        staffingHoursSlots: { c0: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }],
        unschedByCal: { cal_a: { unalloc: '3004.91', rows: [
          { date: '2026-07-30', total: '221.34', notes: 'PD' }, { date: '2026-07-31', total: '106.08', notes: 'Tournament' },
          { date: '2026-08-31', total: '401.00', notes: "Teacher's Day" }, { date: '2026-08-04', total: '20.50', notes: 'Training' },
          { date: '2026-08-05', total: '40.00', notes: 'Graduation' }
        ] } }
      } });
      await importGuide(dom3, c3, j); await flush(1400);
      return { dom3, d3, $3, W3 };
    })();
    const { dom3, d3, W3 } = E3;
    const num3 = t => parseFloat(String(t || '').replace(/[^0-9.]/g, '')) || 0;
    const progRem = d3.querySelector('td.pg-cal-calc[data-calc-kind="unalloc"].pg-rem-clickable');
    check('the Programs table Remaining cell is clickable and shows 2215.99', !!progRem && num3(progRem.textContent) === 2215.99, progRem && progRem.textContent);
    if (progRem) { progRem.dispatchEvent(new W3.MouseEvent('click', { bubbles: true })); await flush(300); }
    let dd = d3.querySelector('.pg-rem-break-dd');
    check('clicking Programs Remaining opens the breakdown popup', !!dd);
    check('sixty-eighth spec: the popup is content-based width, not a fixed 360px min', !!dd && (!dd.style.minWidth || dd.style.minWidth === '') && /max-content|fit-content|auto/.test(dd.style.width || ''), dd && ('minW=' + dd.style.minWidth + ' w=' + dd.style.width));
    if (dd) {
      check('the popup shows Unallocated 3004.91', /Unallocated\s*3,?004\.91/.test(dd.textContent.replace(/\s+/g, ' ')), dd.textContent.slice(0, 60));
      const rows = [...dd.querySelectorAll('table tr')];
      const dataRows = rows.filter(r => r.children.length === 3 && !/Date|Allocated|Remaining/.test(r.children[0].textContent));
      check('all 5 individual Allocated records are listed', dataRows.length === 5, String(dataRows.length));
      const allocRow = rows.find(r => /^Allocated/.test(r.children[0].textContent));
      const remRow = rows.find(r => /^Remaining/.test(r.children[0].textContent));
      check('Total Allocated = 788.92', allocRow && num3(allocRow.children[1].textContent) === 788.92, allocRow && allocRow.children[1].textContent);
      check('Remaining = Unallocated - Allocated = 2215.99', remRow && num3(remRow.children[1].textContent) === 2215.99, remRow && remRow.children[1].textContent);
      check('the popup Remaining equals the Programs Remaining cell', remRow && num3(remRow.children[1].textContent) === num3(progRem.textContent));
    }
    const cx = dd && [...dd.querySelectorAll('button')].find(b => b.textContent === '\u00d7'); if (cx) cx.click(); await flush(100);
    const sumRem = d3.querySelector('#summary-section-pg-001 td.pg-rem-clickable');
    check('the Program Summary Remaining cell is also clickable', !!sumRem);
    if (sumRem) { sumRem.dispatchEvent(new W3.MouseEvent('click', { bubbles: true })); await flush(300); }
    const dd2 = d3.querySelector('.pg-rem-break-dd');
    check('clicking the Summary Remaining opens the same breakdown', !!dd2 && /Allocated Hours/.test(dd2.textContent));
    check('no page errors', dom3.pageErrors.length === 0, dom3.pageErrors.slice(0, 1).join(''));
  });

  await suite('Sixty-seventh spec: Discounts collapsed header hides the District Floor field', async () => {
    const E4 = await (async () => {
      const dom4 = bootApp(); const c4 = ctx(dom4); const d4 = c4.d, $4 = c4.$; const W4 = dom4.window;
      await whenReady(dom4); await flush(400);
      const wk = { mon: { start: '14:00', end: '18:00' } };
      const j = JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'T', status: 'Draft' }, data: {
        status: 'Draft',
        calendarRows: [{ name: 'Alpha', calId: 'cal_a', firstDay: '2026-09-07', lastDay: '2026-09-25', color: '#e57373', pricePerHour: '80', billable: true }],
        siteRows: [{ school: 'A1', ctkk: '9' }], siteRowsByCal: { cal_a: [{ school: 'A1', ctkk: '9' }] },
        staffingHoursSlots: { c0: { ctkk: wk } }, roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }], districtFloor: '74.00'
      } });
      await importGuide(dom4, c4, j); await flush(1400);
      return { dom4, d4, $4, W4 };
    })();
    const { dom4, d4, $4 } = E4;
    const pl4 = () => d4.getElementById('planning-panel');
    const dfWrap = () => pl4().querySelector('.pg-df-wrap');
    const discTg = () => pl4().querySelector('[data-pg-sec-key="pg-001|discounts"] .pg-sec-toggle');
    const isVis = (el) => !!el && !(el.style && el.style.display === 'none');
    check('the District Floor field exists', !!dfWrap());
    check('Discounts starts collapsed -> District Floor is hidden', !isVis(dfWrap()));
    $4(discTg()).trigger('click'); await flush(300);
    check('expanding Discounts restores the District Floor field', isVis(dfWrap()));
    $4(discTg()).trigger('click'); await flush(300);
    check('re-collapsing hides the District Floor field again', !isVis(dfWrap()));
    check('no page errors', dom4.pageErrors.length === 0, dom4.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
