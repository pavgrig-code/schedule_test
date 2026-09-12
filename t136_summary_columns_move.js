// t136_summary_columns_move.js — Program labels + Summary area. Renames: Discounts "Program Calendar"
// -> "Program"; Programs "Staff/Day (Max)" -> "Total Staff Needed". Summary (renamed from "Planning
// Guide Summary"): a Program | # of Schools | Total Staff Needed | Length | ... table where # of
// Schools counts EVERY Site Breakdown row (blank name / no hours included), and Total Staff Needed +
// Length match the Programs table exactly (same source of truth, kept in sync). The Summary area is
// renamed to "Summary", moved to the very top of the page (before the Programs area), and collapsed
// by default.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(extraSite) {
  const rows = [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }];
  if (extraSite) rows.push({ school: '', coaches_ctkk: 1, ctkk: 10 });   // blank-name row
  const data = {
    status: 'Draft',
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: rows.slice() },
    siteRows: rows.slice(),
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    discounts: { names: ['D1'], stages: [{ byCal: { cal_a: { name: 'D1', pct: '10' } } }] }, districtFloor: '0'
  };
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
  cap.dispatchEvent(new W.Event('change')); await flush(2600); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const gCard = () => pl().querySelector('[data-guide-summary]');   // panel-scoped (avoid a stray card elsewhere in the doc)
  const gHdrs = () => gCard() ? [...gCard().querySelectorAll('thead th')].map(t => t.textContent.trim()) : [];
  const gDataRows = () => gCard() ? [...gCard().querySelectorAll('tbody tr')].filter(r => !/Planning Guide/.test(r.textContent)) : [];
  const progTable = () => [...pl().querySelectorAll('table')].find(t => { const hr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1]; return hr && [...hr.cells].some(c2 => /Meal Breaks/.test(c2.textContent)); });
  const progHdrs = () => progTable() ? [...progTable().tHead.rows[progTable().tHead.rows.length - 1].cells].map(c2 => c2.textContent.replace(/\s+/g, ' ').trim()) : [];

  /* ═══ 1. Label renames: Discounts "Program", Programs "Total Staff Needed" ═══ */
  await suite('Discounts uses "Program"; the Programs table uses "Total Staff Needed" (not Staff/Day (Max))', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const discTbl = pl().querySelector('table.pg-disc-table');
    check('the Discounts first column header is "Program"', !!discTbl && discTbl.querySelector('thead th').textContent.trim() === 'Program', discTbl && discTbl.querySelector('thead th').textContent.trim());
    check('the Programs table has a "Total Staff Needed" column', progHdrs().indexOf('Total Staff Needed') >= 0, JSON.stringify(progHdrs()));
    check('the old "Staff/Day (Max)" label is gone from the Programs table', progHdrs().indexOf('Staff/Day (Max)') < 0);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Summary table: renamed "Program" + the three new columns in order ═══ */
  await suite('The Summary table starts Program | # of Schools | Total Staff Needed | Length | ...', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    check('the Summary card exists', !!gCard());
    const h = gHdrs();
    check('the first column is "Program" (renamed from Program Calendar)', h[0] === 'Program', JSON.stringify(h));
    check('the next three columns are # of Schools, Total Staff Needed, Length in order', h[1] === '# of Schools' && h[2] === 'Total Staff Needed' && h[3] === 'Length', JSON.stringify(h.slice(0, 4)));
    check('the remaining financial columns are Total Hours, Total Amount (PPH (Net) removed)', h.slice(4).join('|') === 'Total Hours|Total Amount', JSON.stringify(h.slice(4)));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. # of Schools counts every Site Breakdown row, blank name included ═══ */
  await suite('# of Schools counts every Site Breakdown row \u2014 a blank-name / no-hours row still counts', async () => {
    await importGuide(dom, c, fixture(true)); await flush(800);   // Lincoln + a blank-name row
    const row = gDataRows()[0];
    const i = gHdrs().indexOf('# of Schools');
    check('the Summary # of Schools counts BOTH rows (blank name included) = 2', row && row.cells[i].textContent.trim() === '2', row && row.cells[i].textContent.trim());
    // the total row was removed (this spec); the per-row # of Schools still counts blanks
    check('there is no total row in the Summary table any more', ![...gCard().querySelectorAll('tbody tr')].some(r => /Planning Guide/.test(r.textContent)));
    // the blank-name row also appears in a Program Summary as "School 2"
    const sumSec = d.getElementById('summary-section-pg-001');
    check('the blank-name row shows as a "School 2" placeholder in the program summary', sumSec && /School 2/.test(sumSec.textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Total Staff Needed + Length match the Programs table exactly (same source) ═══ */
  await suite('Total Staff Needed and Length in the Summary match the Programs table and stay synced', async () => {
    await importGuide(dom, c, fixture()); await flush(800);
    const progMax = pl().querySelector('table td.pg-cal-maxcnt:not(.pg-gs-maxcnt)');
    const gsMax = gCard().querySelector('td.pg-gs-maxcnt');
    check('Total Staff Needed: Programs value equals the Summary value', !!progMax && !!gsMax && progMax.textContent.trim() === gsMax.textContent.trim() && /\d/.test(gsMax.textContent), progMax && (progMax.textContent.trim() + ' vs ' + gsMax.textContent.trim()));
    const progLen = pl().querySelector('table td.pg-cal-length:not(.pg-gs-length)');
    const gsLen = gCard().querySelector('td.pg-gs-length');
    check('Length: Programs value equals the Summary value', !!progLen && !!gsLen && progLen.textContent.trim() === gsLen.textContent.trim() && /week/.test(gsLen.textContent), progLen && (progLen.textContent.trim() + ' vs ' + gsLen.textContent.trim()));
    // both are painted from the shared maps: they share the pg-cal-maxcnt / pg-cal-length classes
    check('the Summary Total Staff Needed cell is painted from the shared maxcnt source (pg-gs-maxcnt)', !!gsMax && gsMax.classList.contains('pg-gs-maxcnt'));
    check('the Summary Length cell is painted from the shared length source (pg-gs-length)', !!gsLen && gsLen.classList.contains('pg-gs-length'));
    // force a recalc; the Summary values must still equal the Programs table
    try { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); } catch (e) {}
    await flush(600);
    const pMax2 = pl().querySelector('table td.pg-cal-maxcnt:not(.pg-gs-maxcnt)'), gMax2 = gCard().querySelector('td.pg-gs-maxcnt');
    check('after a recalc, Total Staff Needed still matches', !!pMax2 && !!gMax2 && pMax2.textContent.trim() === gMax2.textContent.trim());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Summary area: renamed, moved to the top, collapsed by default ═══ */
  await suite('The Summary area is renamed "Summary", hoisted to the top of the page, and collapsed by default', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('the card title reads "Summary" (renamed from Planning Guide Summary)', gCard() && gCard().querySelector('.pg-area-label').textContent.trim() === 'Summary');
    // placed immediately BEFORE the Programs area (the calSetup section)
    const progSec = pl().querySelector('[data-pg-sec-key="calsetup"]');
    const progCard = progSec && progSec.closest('.card');
    check('the Summary card sits immediately before the Programs area', !!progCard && gCard() === progCard.previousElementSibling);
    // before the Programs area in document order
    // The Programs area (calSetup) lives in the summary section, which is a LATER panel child than the
    // hoisted Summary card (panel child 1). So the Summary card precedes the Programs area at the
    // panel-child level, which is what "immediately before the Programs area / top of the page" means.
    // whichever panel child holds the Programs area (calSetup), the hoisted Summary card (panel
    // child 1) must be an EARLIER panel child than it.
    const progHd = pl().querySelector('[data-pg-sec-key="calsetup"]');
    const progCard2 = progHd && progHd.closest('.card');
    check('the Programs area (calSetup) exists', !!progCard2);
    check('the Summary card comes BEFORE the Programs area (compareDocumentPosition)', !!progCard2 && !!(gCard().compareDocumentPosition(progCard2) & 4), progCard2 ? 'pos=' + gCard().compareDocumentPosition(progCard2) : 'no card');
    // collapsed by default
    const tg = gCard().querySelector('.pg-sec-toggle');
    check('it has a collapse control', !!tg);
    check('it is COLLAPSED by default (aria-expanded false)', tg && tg.getAttribute('aria-expanded') === 'false', tg && tg.getAttribute('aria-expanded'));
    const body = gCard().querySelector('.px-0.py-0');
    check('the body is hidden while collapsed', body && body.style.visibility === 'hidden');
    // expand restores the table
    $(tg).trigger('click'); await flush(300);
    check('expanding shows the Summary table again', body && body.style.visibility !== 'hidden' && gHdrs().join('|').indexOf('# of Schools') >= 0);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. The move + collapse survive a refresh, and the sync holds ═══ */
  await suite('After a summary rebuild the Summary stays hoisted and its synced values persist', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    // trigger a rebuild
    try { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); } catch (e) {}
    await flush(600);
    check('exactly one Summary card exists after the rebuild (no stale duplicate)', pl().querySelectorAll('[data-guide-summary]').length === 1, pl().querySelectorAll('[data-guide-summary]').length);
    const progSec6 = pl().querySelector('[data-pg-sec-key="calsetup"]');
    const progCard6 = progSec6 && progSec6.closest('.card');
    check('the Summary card is still immediately before the Programs area after the rebuild', !!progCard6 && gCard() === progCard6.previousElementSibling);
    const pMax = pl().querySelector('table td.pg-cal-maxcnt:not(.pg-gs-maxcnt)'), gMax = gCard().querySelector('td.pg-gs-maxcnt');
    check('Total Staff Needed still matches the Programs table after the rebuild', !!pMax && !!gMax && pMax.textContent.trim() === gMax.textContent.trim());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. The Summary table is compact: content-based width + tight, uniform padding ═══ */
  await suite('The Summary table is compact — content-based widths, no stretch, reduced uniform cell padding', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const card = gCard();
    // card is content-based (fit-content, no min-width:100% stretch)
    check('the Summary card is content-based (width:fit-content, no min-width stretch)', /fit-content/.test(card.style.width) && !card.style.minWidth, card.style.width + '/' + (card.style.minWidth || 'none'));
    const tbl = card.querySelector('table');
    check('the table width is content-based (auto, not stretched to 100%)', tbl.style.width === 'auto', tbl.style.width);
    // Program (first) header no longer reserves a fixed 200px min-width
    const th0 = tbl.querySelector('thead th');
    check('the Program column has no fixed min-width (content-based)', !th0.style.minWidth, th0.style.minWidth || 'none');
    // header padding tightened + uniform (<= 4px vertical / 8px horizontal)
    const ths = [...tbl.querySelectorAll('thead th')];
    const padOK = (el, vMax, hMax) => { const p = (el.style.padding || '').match(/(\d+)px\s+(\d+)px/); return p && parseInt(p[1], 10) <= vMax && parseInt(p[2], 10) <= hMax; };
    check('header cells use tight padding (<= 4px x 8px)', ths.every(t => padOK(t, 4, 8)), ths[0] && ths[0].style.padding);
    check('all header cells share the same padding (uniform)', ths.every(t => t.style.padding === ths[0].style.padding));
    // data cells tighter (<= 3px x 8px) and uniform
    const tds = [...tbl.querySelectorAll('tbody tr')].filter(r => !/Planning Guide/.test(r.textContent))[0];
    const dcells = tds ? [...tds.cells] : [];
    check('data cells use tighter padding (<= 3px x 8px)', dcells.length > 0 && dcells.every(t => padOK(t, 3, 8)), dcells[0] && dcells[0].style.padding);
    check('all data cells share the same padding (uniform)', dcells.every(t => t.style.padding === dcells[0].style.padding));
    // total row cells uniform + tight
    // the content is still intact + aligned (headers + a data row present) — no PPH (Net), no total row
    check('the columns and values are intact after the compacting', gHdrs().join('|') === 'Program|# of Schools|Total Staff Needed|Length|Total Hours|Total Amount' && gDataRows().length >= 1);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Summary participates in global Collapse All / Expand All ═══ */
  await suite('Clicking Collapse All collapses the Summary; Expand All expands it', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const tg = () => gCard().querySelector('.pg-sec-toggle');
    // the Summary header carries the data-pg-sec-key the global controls target
    check('the Summary header carries a data-pg-sec-key ending in "|summary"', /\|summary$/.test((gCard().querySelector('[data-pg-sec-key]') || {}).getAttribute ? gCard().querySelector('[data-pg-sec-key]').getAttribute('data-pg-sec-key') : ''), gCard().querySelector('[data-pg-sec-key]') && gCard().querySelector('[data-pg-sec-key]').getAttribute('data-pg-sec-key'));
    // expand it first (collapsed by default)
    if (tg().getAttribute('aria-expanded') === 'false') { $(tg()).trigger('click'); await flush(300); }
    check('the Summary is expanded before the global test', tg().getAttribute('aria-expanded') === 'true');
    const colAll = pl().querySelector('.pg-collapse-all'), expAll = pl().querySelector('.pg-expand-all');
    check('the global Collapse All / Expand All controls exist', !!colAll && !!expAll);
    $(colAll).trigger('click'); await flush(500);
    check('Collapse All collapses the Summary area', gCard().querySelector('.pg-sec-toggle').getAttribute('aria-expanded') === 'false', gCard().querySelector('.pg-sec-toggle').getAttribute('aria-expanded'));
    $(expAll).trigger('click'); await flush(500);
    check('Expand All expands the Summary area', gCard().querySelector('.pg-sec-toggle').getAttribute('aria-expanded') === 'true', gCard().querySelector('.pg-sec-toggle').getAttribute('aria-expanded'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. Summary stays immediately above Programs across every scenario ═══ */
  await suite('The Summary area stays directly above Programs on load, after collapse/expand, and after a rebuild', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const progCard = () => { const sec = pl().querySelector('[data-pg-sec-key="calsetup"]'); return sec && sec.closest('.card'); };
    const isAbove = () => !!progCard() && gCard() === progCard().previousElementSibling;
    check('on load: Summary sits immediately above Programs', isAbove());
    // collapse + expand the Summary
    const tg = () => gCard().querySelector('.pg-sec-toggle');
    $(tg()).trigger('click'); await flush(300); $(tg()).trigger('click'); await flush(300);
    check('after collapse/expand: still immediately above Programs', isAbove());
    // global collapse-all then expand-all
    $(pl().querySelector('.pg-collapse-all')).trigger('click'); await flush(400);
    $(pl().querySelector('.pg-expand-all')).trigger('click'); await flush(400);
    check('after Collapse All / Expand All: still immediately above Programs', isAbove());
    // force a summary rebuild
    try { const sec = d.getElementById('staffing-section-pg-001'); if (sec && sec._recalcAll) sec._recalcAll(); } catch (e) {}
    await flush(600);
    check('after a rebuild: still immediately above Programs (single card, no bottom placement)', isAbove() && pl().querySelectorAll('[data-guide-summary]').length === 1);
    // re-import (load) and re-check
    await importGuide(dom, c, fixture()); await flush(600);
    check('after re-loading the guide: Summary is immediately above Programs', isAbove());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 10. Large-font Total Hours / Total Amount boxes below the table (PPH (Net) gone, no total row) ═══ */
  await suite('The Summary shows large-font Total Hours + Total Amount boxes below the table', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const hBox = gCard().querySelector('.pg-gs-box-hours');
    const aBox = gCard().querySelector('.pg-gs-box-amount');
    check('a Total Hours box exists below the table', !!hBox);
    check('a Total Amount box exists below the table', !!aBox);
    check('the Total Hours value uses a much larger font (>= 22px)', hBox && parseInt(hBox.style.fontSize, 10) >= 22, hBox && hBox.style.fontSize);
    check('the Total Amount value uses a much larger font (>= 22px)', aBox && parseInt(aBox.style.fontSize, 10) >= 22, aBox && aBox.style.fontSize);
    check('the Total Hours box shows an hours value', hBox && /hrs|\d/.test(hBox.textContent), hBox && hBox.textContent);
    check('the Total Amount box shows a currency value ($ + 2 decimals)', aBox && /^\$[\d,]+\.\d{2}$/.test(aBox.textContent.trim()), aBox && aBox.textContent.trim());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 11. Not to Exceed + Amount Available boxes (shown only with an NTE value; live recalc) ═══ */
  await suite('Not to Exceed + Amount Available boxes appear when NTE has a value and recalc live (Available = NTE - Total Amount)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const nteRow = () => gCard().querySelector('.pg-gs-nte-row');
    check('the Not to Exceed row is HIDDEN when NTE has no value', nteRow() && nteRow().style.display === 'none', nteRow() && nteRow().style.display);
    // enter an NTE value through the Not to Exceed area
    const nteSec = d.getElementById('nte-section-pg-001');
    const ntg = nteSec.querySelector('.pg-sec-toggle'); if (ntg && ntg.getAttribute('aria-expanded') === 'false') { $(ntg).trigger('click'); await flush(300); }
    const ica = nteSec.querySelector('.pg-nte-ica'); ica.value = '11000000'; $(ica).trigger('input'); $(ica).trigger('blur'); await flush(120);
    const nteInp = nteSec.querySelector('.pg-nte-nte'); nteInp.value = '11500000'; $(nteInp).trigger('input'); await flush(200);
    check('the Not to Exceed row is SHOWN once NTE has a value', nteRow().style.display === 'flex', nteRow().style.display);
    const nteBox = () => gCard().querySelector('.pg-gs-box-nte');
    const availBox = () => gCard().querySelector('.pg-gs-box-avail');
    const num = (el) => parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, ''));
    const aBox = gCard().querySelector('.pg-gs-box-amount');
    check('the Not to Exceed box shows the NTE value ($11,500,000.00)', /11,500,000\.00/.test(nteBox().textContent), nteBox().textContent);
    check('Amount Available = Not to Exceed - Total Amount', Math.abs(num(availBox()) - (num(nteBox()) - num(aBox))) < 0.01, availBox().textContent + ' vs ' + num(nteBox()) + '-' + num(aBox));
    // change the NTE and confirm the boxes update immediately
    nteInp.value = '12000000'; $(nteInp).trigger('input'); await flush(200);
    check('changing NTE updates the Not to Exceed box immediately', /12,000,000\.00/.test(nteBox().textContent), nteBox().textContent);
    check('and Amount Available recalculates immediately (= 12,000,000 - Total Amount)', Math.abs(num(availBox()) - (12000000 - num(aBox))) < 0.01, availBox().textContent);
    // clearing the NTE value hides the row again
    nteInp.value = ''; $(nteInp).trigger('input'); $(nteInp).trigger('blur'); await flush(200);
    check('clearing the NTE value hides the Not to Exceed row again', nteRow().style.display === 'none', nteRow().style.display);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
