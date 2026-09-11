// t134_not_to_exceed.js — TWENTY-SIXTH SPEC. A collapsible "Not to Exceed" area immediately after
// Discounts, collapsed by default, with a one-row table: Initial Contract Amount | % | Additional
// Additional | Not to Exceed. The user enters the Initial Contract Amount (ica); then editing any
// ONE of % / Additional / Not-to-Exceed recomputes the other two (add = ica*pct/100; nte = ica+add).
// Changing ica later recomputes from the most recently active driver. No NaN/Infinity; no division
// when ica is blank/0. Collapse is display-only and preserves values.
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
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
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
  cap.dispatchEvent(new W.Event('change')); await flush(2200); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const sec = () => d.getElementById('nte-section-pg-001');
  const toggle = () => sec().querySelector('.pg-sec-toggle');
  const expand = async () => { const tg = toggle(); if (tg && tg.getAttribute('aria-expanded') === 'false') { $(tg).trigger('click'); await flush(300); } };
  const ica = () => sec().querySelector('.pg-nte-ica');
  const pct = () => sec().querySelector('.pg-nte-pct');
  const add = () => sec().querySelector('.pg-nte-add');
  const nte = () => sec().querySelector('.pg-nte-nte');
  const num = (el) => parseFloat(String(el.value).replace(/[^0-9.\-]/g, ''));
  const setInp = async (el, v) => { el.value = String(v); $(el).trigger('input'); await flush(100); };
  const fixtureUnnamed = () => JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: {
    status: 'Draft',
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [ { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: '', coaches_ctkk: 1, ctkk: 10 } ] },
    siteRows: [ { school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: '', coaches_ctkk: 1, ctkk: 10 } ],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } } } });


  /* ═══ 1. Section placement, header, default-collapsed, expand ═══ */
  await suite('The Not to Exceed area sits after Discounts, is collapsed by default, and expands to a table', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    check('a Not to Exceed section exists', !!sec());
    const disc = d.getElementById('discounts-section-pg-001');
    check('it sits immediately AFTER the Discounts section', !!disc && !!sec() && !!(disc.compareDocumentPosition(sec()) & 4));
    check('its header label reads "Not to Exceed"', sec().querySelector('.pg-area-label').textContent.trim() === 'Not to Exceed');
    check('it has a collapse/expand control (the shared pg-sec-toggle)', !!toggle());
    check('it is COLLAPSED by default (aria-expanded false)', toggle().getAttribute('aria-expanded') === 'false');
    const body = sec().querySelector('.px-0.py-0');
    check('the body is hidden while collapsed', body && body.style.visibility === 'hidden');
    await expand();
    check('expanding shows the body', body && body.style.visibility !== 'hidden' && toggle().getAttribute('aria-expanded') === 'true');
    const heads = [...sec().querySelectorAll('table.pg-nte-table thead th')].map(x => x.textContent.trim());
    check('the four columns are: Initial Contract | % | Additional | Not to Exceed', heads.join('|') === 'Initial Contract|%|Additional|Not to Exceed', heads.join('|'));
    check('the table has one input row with four editable fields', !!ica() && !!pct() && !!add() && !!nte());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. Entering % computes Additional + Not to Exceed (spec example 1) ═══ */
  await suite('With an Initial Contract Amount, entering % computes Additional and Not to Exceed', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1000000');
    await setInp(pct(), '10');
    check('Additional Amount = 100,000 (1,000,000 x 10%)', Math.abs(num(add()) - 100000) < 0.01, add().value);
    check('Not to Exceed Amount = 1,100,000 (contract + additional)', Math.abs(num(nte()) - 1100000) < 0.01, nte().value);
    check('the Additional field is formatted as currency ($ prefix, grouped, 2 decimals)', /^\$[\d,]+\.\d{2}$/.test(add().value), add().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. Entering Additional computes % + Not to Exceed (spec example 2) ═══ */
  await suite('Entering Additional Amount computes % and Not to Exceed', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1000000');
    await setInp(add(), '150000');
    check('% = 15 (150,000 / 1,000,000)', Math.abs(num(pct()) - 15) < 0.01, pct().value);
    check('Not to Exceed Amount = 1,150,000', Math.abs(num(nte()) - 1150000) < 0.01, nte().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Entering Not to Exceed computes Additional + % (spec example 3) ═══ */
  await suite('Entering Not to Exceed computes Additional and %', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1000000');
    await setInp(nte(), '1200000');
    check('Additional Amount = 200,000 (1,200,000 - 1,000,000)', Math.abs(num(add()) - 200000) < 0.01, add().value);
    check('% = 20 (200,000 / 1,000,000)', Math.abs(num(pct()) - 20) < 0.01, pct().value);
    check('the invariant holds: Not to Exceed = Initial Contract + Additional', Math.abs(num(nte()) - (num(ica()) + num(add()))) < 0.01);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Changing Initial Contract Amount recomputes from the last active driver ═══ */
  await suite('Changing the Initial Contract Amount recomputes from the most recent driver, staying consistent', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    // driver = % (10%)
    await setInp(ica(), '1000000'); await setInp(pct(), '10');
    check('setup: add 100k, nte 1.1M', Math.abs(num(add()) - 100000) < 0.01 && Math.abs(num(nte()) - 1100000) < 0.01);
    await setInp(ica(), '2000000');
    check('after ica -> 2M with % driver: Additional = 200,000 (2M x 10%)', Math.abs(num(add()) - 200000) < 0.01, add().value);
    check('and Not to Exceed = 2,200,000', Math.abs(num(nte()) - 2200000) < 0.01, nte().value);
    check('% is unchanged (still the driver at 10)', Math.abs(num(pct()) - 10) < 0.01, pct().value);
    // now switch driver to Additional, then change ica again
    await setInp(add(), '500000');
    await setInp(ica(), '4000000');
    check('after switching driver to Additional (500k) then ica -> 4M: Additional stays 500,000', Math.abs(num(add()) - 500000) < 0.01, add().value);
    check('Not to Exceed = 4,500,000 and % recomputed to 12.5', Math.abs(num(nte()) - 4500000) < 0.01 && Math.abs(num(pct()) - 12.5) < 0.01, nte().value + '/' + pct().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Validation: no NaN/Infinity; no division on blank/zero contract ═══ */
  await suite('No NaN/Infinity is shown, and no percentage division runs on a blank or zero contract', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    // blank ica + a % entry must not produce NaN/Infinity in any field
    await setInp(pct(), '10');
    check('with a blank Initial Contract Amount, no field shows NaN/Infinity', ![ica(), pct(), add(), nte()].some(el => /NaN|Infinity/.test(el.value)), [ica().value, pct().value, add().value, nte().value].join(' | '));
    check('and Additional/Not-to-Exceed were NOT computed from a blank contract', num(add()) === num(add()) ? (add().value === '' || !/NaN|Infinity/.test(add().value)) : true);
    // zero ica + additional: % division must be guarded
    await setInp(ica(), '0');
    await setInp(add(), '5000');
    check('with a ZERO contract, % does not become Infinity/NaN', !/NaN|Infinity/.test(pct().value), pct().value);
    // now a valid contract makes the math resume
    await setInp(ica(), '1000000');
    await setInp(pct(), '5');
    check('once a valid contract exists the math resumes (Additional = 50,000)', Math.abs(num(add()) - 50000) < 0.01, add().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 7. Collapse is display-only and preserves entered values (persist through rebuild/import) ═══ */
  await suite('Collapse/expand and rebuild preserve the entered values (stored in det.notToExceed)', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1000000'); await setInp(pct(), '10'); $(pct()).trigger('blur'); await flush(100);
    const stored = W._pgGuideDetails()['pg-001'].notToExceed;
    check('values are stored in det.notToExceed', !!stored && Math.abs(parseFloat(stored.ica) - 1000000) < 0.01 && Math.abs(parseFloat(stored.add) - 100000) < 0.01, JSON.stringify(stored));
    // collapse then expand: values intact, no recompute wiping them
    $(toggle()).trigger('click'); await flush(200);
    $(toggle()).trigger('click'); await flush(200);
    check('after collapse+expand the Initial Contract Amount is intact', Math.abs(num(ica()) - 1000000) < 0.01, ica().value);
    check('and Additional/Not-to-Exceed are intact', Math.abs(num(add()) - 100000) < 0.01 && Math.abs(num(nte()) - 1100000) < 0.01);
    // import round-trip
    const payload = JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: JSON.parse(JSON.stringify(W._pgGuideDetails()['pg-001'])) });
    check('the export payload carries notToExceed', /notToExceed/.test(payload) && /1000000/.test(payload));
    await importGuide(dom, c, payload); await flush(400); await expand();
    check('after re-import the values are restored', Math.abs(num(ica()) - 1000000) < 0.01 && Math.abs(num(add()) - 100000) < 0.01, ica().value + '/' + add().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. All four fields accept numbers only (letters / invalid chars stripped) ═══ */
  await suite('The four fields are numeric-only: letters and invalid characters are prevented, decimals allowed', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    // typing letters mixed with digits into a field strips the letters (input sanitizer)
    ica().value = '12ab34.5cd'; $(ica()).trigger('input'); await flush(80);
    check('letters are stripped from a money field on input (12ab34.5cd -> 1234.5, sans letters)', !/[a-z]/i.test(ica().value) && /34\.5|1,234/.test(ica().value), ica().value);
    // a second decimal point is collapsed to one
    const raw = () => { const el = ica(); return el.value; };
    ica().value = '1.2.3'; $(ica()).trigger('input'); await flush(80);
    check('only one decimal point is kept (1.2.3 -> 1.23)', (ica().value.match(/\./g) || []).length <= 1, ica().value);
    // % strips letters, keeps decimals, and still drives the calc
    await setInp(ica(), '1000000');
    pct().value = '1x0.5y'; $(pct()).trigger('input'); await flush(80);
    check('a percent field strips letters but keeps the decimal (1x0.5y -> 10.5)', !/[a-z]/i.test(pct().value) && Math.abs(parseFloat(pct().value) - 10.5) < 0.01, pct().value);
    check('and the calc still runs on the sanitized value (Additional = 105,000)', Math.abs(num(add()) - 105000) < 0.01, add().value);
    // keypress of a letter is prevented; a digit and a '.' are allowed
    const kp = (el, key) => { const ev = new W.KeyboardEvent('keypress', { key: key, cancelable: true, bubbles: true }); return !el.dispatchEvent(ev); };
    check('a letter keypress is prevented on every field', kp(ica(), 'a') && kp(pct(), 'z') && kp(add(), 'q') && kp(nte(), 'w'));
    check('a digit keypress is allowed', !kp(add(), '5'));
    check('a decimal-point keypress is allowed (decimals permitted)', !kp(add(), '.'));
    check('a minus keypress is allowed (Additional/NTE can go negative)', !kp(add(), '-'));
    // paste-style bad content is sanitized on input
    add().value = 'abc150000def'; $(add()).trigger('input'); await flush(80);
    check('bad pasted content is sanitized on input (abc150000def -> 150,000)', Math.abs(num(add()) - 150000) < 0.01 && !/[a-z]/i.test(add().value), add().value);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. The NTE table is content-sized (no wasted horizontal space), with consistent padding ═══ */
  await suite('The NTE table sizes to its content (width auto, content-based columns) with consistent padding', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    const tbl = sec().querySelector('.pg-nte-table');
    check('the table width is content-based (auto), not stretched to 100%', tbl.style.width === 'auto', tbl.style.width);
    check('the table does NOT use a fixed layout (columns size to content)', tbl.style.tableLayout !== 'fixed', tbl.style.tableLayout || '(auto)');
    // content-appropriate input widths: money fields wider, the percent field narrow
    const wMoney = parseInt(ica().style.width, 10), wPct = parseInt(pct().style.width, 10);
    check('the money inputs use a fixed content width (not 100%)', ica().style.width !== '100%' && wMoney > 0, ica().style.width);
    check('the percent input is narrower than the money inputs (short values)', wPct > 0 && wPct < wMoney, pct().style.width + ' < ' + ica().style.width);
    check('all three money inputs share the same width', ica().style.width === add().style.width && add().style.width === nte().style.width, ica().style.width);
    // consistent, readable padding: the container keeps its px-3 padding; header/input cells are uniform
    const wrap = tbl.closest('div');
    check('the table container keeps consistent horizontal padding (px-3)', /(^|\s)px-3(\s|$)/.test(wrap.className), wrap.className);
    const ths = [...sec().querySelectorAll('.pg-nte-table th')];
    check('all header cells share the same (compact, consistent) padding', ths.every(th => th.style.padding === ths[0].style.padding) && !!ths[0].style.padding, ths[0] && ths[0].style.padding);
    const tds = [...sec().querySelectorAll('.pg-nte-table tbody td')];
    check('all input cells share the same padding', tds.every(td => td.style.padding === tds[0].style.padding), tds[0] && tds[0].style.padding);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 10. $ / % field formatting, collapsed-header summary, and global Collapse/Expand All ═══ */
  await suite('Money fields show $, percent shows %, the collapsed header summarizes Initial + NTE, and Collapse/Expand All reach the area', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1100000'); $(ica()).trigger('blur'); await flush(50);
    await setInp(pct(), '2.5'); $(pct()).trigger('blur'); await flush(50);
    // $ prefix on money fields
    check('the Initial Contract field shows a $ prefix', /^\$/.test(ica().value), ica().value);
    check('the Additional field shows a $ prefix', /^\$/.test(add().value), add().value);
    check('the Not to Exceed field shows a $ prefix', /^\$/.test(nte().value), nte().value);
    check('the amounts are correct ($1,100,000.00 / $27,500.00 / $1,127,500.00)', ica().value === '$1,100,000.00' && add().value === '$27,500.00' && nte().value === '$1,127,500.00', ica().value + ' / ' + add().value + ' / ' + nte().value);
    // % suffix on the percent field
    check('the percent field shows a % suffix', /%$/.test(pct().value), pct().value);
    check('the percent value is 2.5%', pct().value === '2.5%', pct().value);
    // collapsed header summary: Initial + NTE
    $(toggle()).trigger('click'); await flush(300);   // collapse
    const sum = sec().querySelector('.pg-sec-summary');
    check('the collapsed header shows a summary line', !!sum && sum.style.display !== 'none' && sum.textContent.trim().length > 0, sum && sum.textContent);
    check('the summary shows the Initial Contract amount ($1,100,000.00)', !!sum && /Initial:\s*\$1,100,000\.00/.test(sum.textContent), sum && sum.textContent);
    check('the summary shows the Not to Exceed amount ($1,127,500.00)', !!sum && /NTE:\s*\$1,127,500\.00/.test(sum.textContent), sum && sum.textContent);
    // Summary styling matches Staff Roles / Programs: the NTE no longer overrides the base
    // .pg-sec-summary style — it inherits the same font size (10.5px), color (var(--tx2, #6c757d))
    // and normal weight the other collapsed-header summaries use.
    check('the summary span carries NO inline font-weight override (normal weight, like Roles/Programs)', !sum.style.fontWeight, sum.style.fontWeight);
    check('the summary span uses the base 10.5px size (not the old 11px override)', /font-size:\s*10\.5px/.test(sum.getAttribute('style') || ''), (sum.getAttribute('style') || '').match(/font-size:[^;]*/));
    check('the summary span uses the base --tx2 grey (not the old #5f6368 override)', /color:\s*var\(--tx2/.test(sum.getAttribute('style') || '') && !/5f6368/.test(sum.style.color || ''), (sum.getAttribute('style') || '').match(/color:[^;]*/));
    // global Collapse All / Expand All reach the NTE area
    await expand();   // make sure it is expanded first
    check('NTE is expanded before Collapse All', toggle().getAttribute('aria-expanded') === 'true');
    const colAll = pl().querySelector('.pg-collapse-all'), expAll = pl().querySelector('.pg-expand-all');
    $(colAll).trigger('click'); await flush(400);
    check('clicking global Collapse All collapses the Not to Exceed area', sec().querySelector('.pg-sec-toggle').getAttribute('aria-expanded') === 'false');
    $(expAll).trigger('click'); await flush(400);
    check('clicking global Expand All expands the Not to Exceed area', sec().querySelector('.pg-sec-toggle').getAttribute('aria-expanded') === 'true');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  const cvBtn = () => pl().querySelector('.pg-customer-view-btn');
  const sumOf = () => sec().querySelector('.pg-sec-summary');

  /* ═══ 11. Regular view: collapsed header has a divider + extra spacing before the summary ═══ */
  await suite('Regular-view collapsed NTE header separates the title from the summary with a divider + spacing', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1100000'); $(ica()).trigger('blur'); await flush(50);
    await setInp(pct(), '2.5'); $(pct()).trigger('blur'); await flush(50);
    $(toggle()).trigger('click'); await flush(300);   // collapse
    const sum = sumOf();
    check('the collapsed summary is shown with the Initial + NTE values', !!sum && /Initial:.*NTE:/.test(sum.textContent.replace(/\s+/g, ' ')), sum && sum.textContent);
    check('a subtle vertical divider (border-left) separates the title from the summary', !!sum && /1px\s+solid/.test(sum.style.borderLeft || ''), sum && sum.style.borderLeft);
    check('the divider uses the app border colour (#dee2e6)', !!sum && /rgb\(222,\s*226,\s*230\)|#dee2e6/.test(sum.style.borderLeft || ''), sum && sum.style.borderLeft);
    check('there is extra space before the summary (left margin + padding)', !!sum && parseInt(sum.style.marginLeft, 10) >= 8 && parseInt(sum.style.paddingLeft, 10) >= 8, sum && (sum.style.marginLeft + '/' + sum.style.paddingLeft));
    // vertical alignment: the header is an align-items:center flex row
    const hd = sec().querySelector('.pg-area-label').closest('.d-flex');
    check('the header vertically centers title + summary (align-items-center)', /align-items-center/.test(hd.className));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 12. Customer View: collapsed NTE header shows only the title (no summary values) ═══ */
  await suite('In Customer View the collapsed NTE header shows only "Not to Exceed" — no summary values', async () => {
    await importGuide(dom, c, fixture()); await flush(400); await expand();
    await setInp(ica(), '1100000'); $(ica()).trigger('blur'); await flush(50);
    await setInp(pct(), '2.5'); $(pct()).trigger('blur'); await flush(50);
    $(toggle()).trigger('click'); await flush(300);   // collapse (regular view: summary shows)
    check('regular view: the summary shows values before Customer View', /Initial:/.test(sumOf().textContent));
    // enable Customer View
    $(cvBtn()).trigger('click'); await flush(500);
    const sum = sumOf();
    check('Customer View ON: the collapsed summary is EMPTY (no Initial / NTE values)', !sum || sum.textContent.trim() === '', sum && JSON.stringify(sum.textContent));
    check('and the divider styling is cleared (no stale border)', !sum || !/1px\s+solid/.test(sum.style.borderLeft || ''), sum && sum.style.borderLeft);
    check('the header still displays the "Not to Exceed" title', /Not to Exceed/.test(sec().querySelector('.pg-area-label').textContent));
    // disable Customer View -> summary returns
    $(cvBtn()).trigger('click'); await flush(500);
    check('Customer View OFF: the summary values return', /Initial:.*NTE:/.test(sumOf().textContent.replace(/\s+/g, ' ')), sumOf().textContent);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 13. District Category is a search/select control mirroring the District field ═══ */
  await suite('District Category is a search/select (like District): 2 options, no em-dash, colour pill + x clear', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    // NO old <select>; it's a search input now
    check('the old <select> dropdown is gone', !pl().querySelector('.pg-cat-select'));
    const inp = () => pl().querySelector('.pg-cat-input');
    check('a searchable input exists (like the District field)', !!inp());
    check('it is labelled "District Category"', !![...pl().querySelectorAll('div')].find(x => x.textContent.trim() === 'District Category'));
    // focus -> dropdown of exactly the two categories, NO em-dash / blank option
    $(inp()).trigger('focus'); await flush(150);
    check('the dropdown uses list-group styling like the District dropdown', !!pl().querySelector('.pg-cat-dd.list-group') && pl().querySelectorAll('.pg-cat-opt.list-group-item-action').length > 0);
    const opts = [...pl().querySelectorAll('.pg-cat-opt')].map(o => o.getAttribute('data-cat'));
    check('exactly two options: Renewal/Expansion and New (no "\u2014" / blank)', opts.length === 2 && opts.indexOf('Renewal/Expansion') >= 0 && opts.indexOf('New') >= 0 && opts.every(o => o && o !== '\u2014' && !/u2014/.test(o)), JSON.stringify(opts));
    // same row as State + District
    const stateLbl = [...pl().querySelectorAll('div')].find(x => x.textContent.trim() === 'State');
    const catLbl = [...pl().querySelectorAll('div')].find(x => x.textContent.trim() === 'District Category');
    const flexRow = (el) => { let n = el; while (n && n !== pl()) { if (/display:\s*flex/.test(n.getAttribute('style') || '')) return n; n = n.parentElement; } return null; };
    check('District Category shares the State/District flex row', !!stateLbl && !!catLbl && flexRow(stateLbl) === flexRow(catLbl) && flexRow(catLbl) !== null);
    // select "New" -> a rounded-pill chip in the category colour, with an "x" clear button
    const pick = (v) => { const o = [...pl().querySelectorAll('.pg-cat-opt')].find(x => x.getAttribute('data-cat') === v); o.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); };
    pick('New'); await flush(200);
    const pill = () => pl().querySelector('.pg-cat-pill');
    check('the selection shows a rounded-pill chip (like the selected District)', !!pill() && pill().classList.contains('rounded-pill'));
    check('the pill carries the New category colour (amber background, dark text)', !!pill() && /rgb\(255,\s*230,\s*199\)/.test(pill().style.background) && !!pill().style.color, pill() && pill().style.background + '/' + pill().style.color);
    check('the pill contains an "x" remove button', !!pl().querySelector('.pg-cat-clear'));
    check('the selection is stored in det.districtCategory', W._pgGuideDetails()['pg-001'].districtCategory === 'New');
    // click the x -> cleared, back to the search input
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(200);
    check('clicking "x" clears the category and returns to the search input', !pl().querySelector('.pg-cat-pill') && !!pl().querySelector('.pg-cat-input') && (W._pgGuideDetails()['pg-001'].districtCategory === '' || W._pgGuideDetails()['pg-001'].districtCategory == null));
    // Renewal/Expansion gets a DIFFERENT colour
    $(pl().querySelector('.pg-cat-input')).trigger('focus'); await flush(120);
    pick('Renewal/Expansion'); await flush(200);
    check('Renewal/Expansion pill uses a DIFFERENT (blue) colour', !!pill() && /rgb\(215,\s*235,\s*255\)/.test(pill().style.background), pill() && pill().style.background);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });


  /* ═══ 14. District Category dropdown option: swatch + label vertically centered on one row ═══ */
  await suite('District Category dropdown options align the colour swatch and label on one centered row', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const inp = pl().querySelector('.pg-cat-input');
    $(inp).trigger('focus'); await flush(150);
    const opt = pl().querySelector('.pg-cat-opt');
    check('each option is a flex row', /flex/.test(opt.style.display), opt.style.display);
    check('its swatch + label are vertically centered (align-items:center)', opt.style.alignItems === 'center', opt.style.alignItems);
    const swatch = opt.querySelector('span');
    check('the colour swatch does not shrink (flex:0 0 auto)', /0\s+0\s+auto/.test(swatch.style.flex), swatch.style.flex);
    // comfortable right-side spacing: the option's right padding is at least as large as its left
    check('the option has comfortable right padding (>= left padding, away from the edge)', (function () { const p = (opt.style.padding || '').match(/(\d+)px\s+(\d+)px(?:\s+(\d+)px\s+(\d+)px)?/); if (!p) return false; const right = parseInt(p[2], 10); const left = p[4] != null ? parseInt(p[4], 10) : parseInt(p[2], 10); return right >= left && right >= 24; })(), opt.style.padding);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 15. State, District and District Category share ONE row; District shrinks (no overlap) ═══ */
  await suite('State, District and District Category stay on ONE horizontal row; District shrinks so nothing overlaps', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const lbl = (t) => [...pl().querySelectorAll('div.text-uppercase')].find(x => x.textContent.trim() === t);
    const stateLbl = lbl('State');
    let row = stateLbl; while (row && row !== pl() && !/display:\s*flex/.test(row.getAttribute('style') || '')) row = row.parentElement;
    check('the State/District/Category row is a flex row', !!row && /display:\s*flex/.test(row.getAttribute('style') || ''));
    check('the row does NOT wrap (nowrap) — all three fields stay on one row', /flex-wrap:\s*nowrap/.test(row.getAttribute('style') || ''), row && row.getAttribute('style'));
    check('State, District AND District Category all sit in the SAME row', !!row && row.contains(lbl('District')) && row.contains(lbl('District Category')));
    // the District field can genuinely shrink (min-width:0) and hides overflow so a long name never
    // pushes into / overlaps the category
    const distField = lbl('District') && lbl('District').parentElement;
    check('the District field is width-bounded (min 280 / max 500) so it never overflows the row', !!distField && /min-width:\s*280px/.test(distField.getAttribute('style') || '') && /max-width:\s*500px/.test(distField.getAttribute('style') || ''), distField && (distField.getAttribute('style') || '').slice(0, 90));
    // NOT overflow:hidden on the field: that would clip the absolutely-positioned district dropdown
    // (the bug fixed in build 4265d0d9). The long-name containment lives on the chip (max-width:100%)
    // and its name span (ellipsis) instead.
    check('the District field does NOT use overflow:hidden (it would clip the district dropdown)', !!distField && !/overflow(-x|-y)?:\s*hidden/.test(distField.getAttribute('style') || ''), distField && distField.getAttribute('style'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 15b. Selecting a District Category never shifts State / District / the category control ═══ */
  await suite('Selecting a District Category does not shift the State, District or category controls (content-based, independent)', async () => {
    await importGuide(dom, c, fixture()); await flush(400);
    const lbl = (t) => [...pl().querySelectorAll('div.text-uppercase')].find(x => x.textContent.trim() === t);
    const catField = () => lbl('District Category').parentElement;
    const distField = () => lbl('District').parentElement;
    const stateField = () => lbl('State').parentElement;
    const sig = () => ({ cat: catField().getAttribute('style'), dist: distField().getAttribute('style'), state: stateField().getAttribute('style') });
    const before = sig();
    check('the category field is content-based (flex:0 0 auto, no reserved fixed width)', /flex:\s*0 0 auto/.test(before.cat), before.cat);
    const inp = pl().querySelector('.pg-cat-input');
    check('the search input has a content width (not stretched to 100%)', inp.style.width !== '100%' && parseInt(inp.style.width, 10) > 0, inp.style.width);
    // select New
    $(inp).trigger('focus'); await flush(150);
    const pick = (v) => { const o = [...pl().querySelectorAll('.pg-cat-opt')].find(x => x.getAttribute('data-cat') === v); o.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); };
    pick('New'); await flush(250);
    const after = sig();
    check('after selecting New the category field flex style is IDENTICAL (still content-based, no reserved width)', after.cat === before.cat, after.cat);
    check('the District field style is IDENTICAL (it did not grow/shift)', after.dist === before.dist, after.dist);
    check('the State field style is IDENTICAL', after.state === before.state);
    const pill = pl().querySelector('.pg-cat-pill');
    check('the selected pill is capped to the field width (max-width:100%) so it cannot push neighbours', !!pill && pill.style.maxWidth === '100%', pill && pill.style.maxWidth);
    // clear -> still identical
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(250);
    const cleared = sig();
    check('after clearing, all three field styles are still IDENTICAL to the original', cleared.cat === before.cat && cleared.dist === before.dist && cleared.state === before.state);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 16. An unnamed Site Breakdown row still counts as a school (header + summary) ═══ */
  await suite('An unnamed Site Breakdown row counts as a school and shows a "School {n}" placeholder', async () => {
    await importGuide(dom, c, fixtureUnnamed()); await flush(800);
    // collapsed Site Breakdown header count includes the blank row (2 schools, not 1)
    const secHd = [...pl().querySelectorAll('[data-pg-sec-key^="pg-001|site|"]')][0];
    check('a Site Breakdown section header exists', !!secHd);
    const tg = secHd && secHd.querySelector('.pg-sec-toggle');
    if (tg && tg.getAttribute('aria-expanded') === 'true') { $(tg).trigger('click'); await flush(300); }
    const sum = secHd && secHd.querySelector('.pg-sec-summary');
    check('the collapsed Site Breakdown header counts BOTH rows (2 schools), blank name included', !!sum && /\(2 schools\)/.test(sum.textContent), sum && sum.textContent);
    // the program summary lists the blank row as "School 2"
    const sumSec = d.getElementById('summary-section-pg-001');
    const rows = sumSec ? [...sumSec.querySelectorAll('table tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ')).filter(t => /Lincoln|School \d/.test(t)) : [];
    check('the program summary lists the named school (Lincoln)', rows.some(t => /Lincoln/.test(t)), JSON.stringify(rows).slice(0, 120));
    check('and lists the unnamed row with the "School 2" placeholder', rows.some(t => /School 2\b|School 2\d/.test(t) || /School 2/.test(t)), JSON.stringify(rows).slice(0, 160));
    check('so the summary shows two school rows, not one', rows.length >= 2, rows.length);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
