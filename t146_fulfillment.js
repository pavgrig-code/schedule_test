// t146_fulfillment.js — Fulfillment: parser (CSV + library-free XLSX, junk rows, same-day summing), upsert
// semantics (insert/update/unchanged, partial files never wipe), the section (upload, Unmapped bucket,
// manual program+school mapping with a one-to-one guard, per-program pageable table with live Planned
// from the calendar, school filter, unmap), and export/import round-trip.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
const fs = require('fs');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture() {
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'G', status: 'Draft' }, data: {
    status: 'Draft', calendarRows: [{ name: 'After School', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-09-11', color: '#e57373', pricePerHour: '80.00', billable: true }, { name: 'Enrichment', calId: 'cal_b', firstDay: '2026-07-06', lastDay: '2026-09-11', color: '#64b5f6', pricePerHour: '70.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }], cal_b: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }, { school: 'Adams', schoolId: 's2', coaches_ctkk: 1, ctkk: 10 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '12:00') } } } });
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(3000); d.createElement = ocr;
}
(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(300);
  // jsdom lacks DecompressionStream; polyfill deflate-raw via zlib (browsers have it natively)
  if (!W.DecompressionStream) { const zlib = require('zlib');
    W.DecompressionStream = class { constructor() { this._chunks = []; const self = this; this.writable = { getWriter() { return { write(ch) { self._chunks.push(Buffer.from(ch)); }, close() {} }; } }; this.readable = { _self: self }; } };
    W.Response = class { constructor(r) { this._r = r; } async arrayBuffer() { const out = zlib.inflateRawSync(Buffer.concat(this._r._self._chunks)); return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength); } }; }
  const pl = () => d.getElementById('planning-panel');
  const ff = W._pgFf;
  const XLSX_PATH = '/mnt/user-data/uploads/CNUSD_-_Fulfillment_Data.xlsx';
  const haveXlsx = fs.existsSync(XLSX_PATH);
  const xlsxFile = () => { const buf = fs.readFileSync(XLSX_PATH); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); return { name: 'CNUSD_-_Fulfillment_Data.xlsx', arrayBuffer: async () => ab, text: async () => '' }; };
  const csvText = (rows) => 'Field Program ID,Field Program Name,Shift Date,Week Day,Fulfillment %,Produced Hours,Calculator Hours,Price Per Hour\n' + rows.map(r => r.join(',')).join('\n') + '\nTotal,,,,0.9,100,110,\n"Applied filters:\nsomething",,,,,,,\n';
  const csvFile = (name, text) => ({ name, arrayBuffer: async () => new ArrayBuffer(0), text: async () => text });
  const det = () => W._pgGuideDetails()['pg-001'];
  const sec = () => d.getElementById('fulfillment-section-pg-001');
  const stageUpload = async file => { const inp = sec().querySelector('.ff-file'); Object.defineProperty(inp, 'files', { value: [file], configurable: true }); $(inp).trigger('change'); await flush(1500); };
  const upload = async file => { await stageUpload(file); await confirmReview(); };
  // (review workflow) An upload now STAGES a mapping review. This helper drives it the way a user would:
  // accept whatever the panel prefilled from prior mappings and confirm. Programs with no suggestion stay
  // unmapped and land in the Unmapped bucket, exactly as before the review step existed.
  const confirmReview = async () => { const btn = sec() && sec().querySelector('.ff-review-confirm'); if (btn) { $(btn).trigger('click'); await flush(1300); } };
  const cancelReview = async () => { const btn = sec() && sec().querySelector('.ff-review-cancel'); if (btn) { $(btn).trigger('click'); await flush(600); } };
  const reviewRows = () => sec() ? [...sec().querySelectorAll('.ff-review-row')] : [];
  const setReviewMap = async (idx, calId, schoolId) => { const r = reviewRows()[idx]; if (!r) return; $(r.querySelector('.ff-rev-cal')).val(calId).trigger('change'); await flush(50); $(r.querySelector('.ff-rev-school')).val(schoolId).trigger('change'); await flush(50); };

  const mapFirstPending = async (calId, schoolId) => { const row = sec().querySelector('.ff-unmapped-row'); $(row.querySelector('.ff-map-cal')).val(calId).trigger('change'); await flush(50); $(row.querySelector('.ff-map-school')).val(schoolId).trigger('change'); await flush(50); $(row.querySelector('.ff-map-btn')).trigger('click'); await flush(1200); };
  const card = calId => sec().querySelector('.ff-card[data-ff-cal="' + calId + '"]');
  const rows = calId => [...card(calId).querySelectorAll('tr.ff-row')];

  /* ═══ 1. Parser ═══ */
  await suite('Parser: XLSX (library-free) and CSV both yield clean rows; junk rows dropped; same program+date rows are summed; quoted commas survive', async () => {
    if (haveXlsx) {
      const res = await ff.parseFile(xlsxFile());
      check('XLSX: 49 data rows, no errors', res.rows.length === 49 && res.errors.length === 0, res.rows.length + ' ' + JSON.stringify(res.errors));
      check('XLSX: Total / filters rows skipped', res.skipped >= 2, res.skipped);
      check('XLSX: first row parsed (date, produced, calc, pph, id)', res.rows[0].date === '2026-07-06' && res.rows[0].produced === 96.44 && res.rows[0].calc === 90.5 && res.rows[0].pph === 93.15 && res.rows[0].srcId === '56690866329', JSON.stringify(res.rows[0]));
      const g = ff.group(res.rows); const k = Object.keys(g)[0];
      check('XLSX: one Field Program grouped with 49 days', Object.keys(g).length === 1 && Object.keys(g[k].days).length === 49);
    } else { check('(sample xlsx not present; XLSX checks skipped)', true); }
    const cres = ff.normalize(ff.parseCsv(csvText([['5669', '"Corona, After School"', '7/6/2026', 'Mon', '0.5', '50.25', '45', '93.15'], ['5669', '"Corona, After School"', '7/6/2026', 'Mon', '0.5', '46.19', '45.5', '93.15'], ['5670', 'Enrich Prog', '2026-07-07', 'Tue', '1', '12', '12', '70']])));
    check('CSV: 3 data rows, 2 junk rows skipped', cres.rows.length === 3 && cres.skipped === 2, cres.rows.length + '/' + cres.skipped);
    check('CSV: a quoted name with a comma is preserved', cres.rows[0].name === 'Corona, After School', cres.rows[0].name);
    check('CSV: both M/D/YYYY and ISO dates parse', cres.rows[0].date === '2026-07-06' && cres.rows[2].date === '2026-07-07');
    const cg = ff.group(cres.rows); const ck = ff.norm('Corona, After School');
    check('CSV: two shifts on the same day are SUMMED (96.44 / 90.5, n=2)', cg[ck].days['2026-07-06'].produced === 96.44 && cg[ck].days['2026-07-06'].calc === 90.5 && cg[ck].days['2026-07-06'].n === 2, JSON.stringify(cg[ck].days['2026-07-06']));
    const bad = ff.normalize([['Something', 'Else'], ['a', 'b']]);
    check('missing required columns are reported, not guessed', bad.errors.length === 3 && bad.rows.length === 0, JSON.stringify(bad.errors));
  });

  /* ═══ 2. Upsert semantics ═══ */
  await suite('Upsert: first upload inserts; identical re-upload is unchanged; a partial file updates/adds only its dates and never wipes others; unmapped rows are kept pending', async () => {
    W._pgGuideDetails()['pg-u'] = {}; const dd = W._pgGuideDetails()['pg-u'];
    const G = () => ({ 'p a': { label: 'P A', srcId: '1', days: { '2026-07-06': { produced: 10, calc: 10, pph: 80, n: 1 }, '2026-07-07': { produced: 20, calc: 20, pph: 80, n: 1 } } } });
    dd.fulfillmentMap = { 'p a': { calId: 'cal_a', schoolId: 's1', label: 'P A' } };
    const t1 = ff.applyUpload('pg-u', 'f1.csv', G());
    check('first upload: 2 inserted', t1.inserted === 2 && t1.updated === 0, JSON.stringify(t1));
    const t2 = ff.applyUpload('pg-u', 'f1.csv', G());
    check('identical re-upload: 2 unchanged, 0 inserted/updated', t2.unchanged === 2 && t2.inserted === 0 && t2.updated === 0, JSON.stringify(t2));
    const partial = { 'p a': { label: 'P A', srcId: '1', days: { '2026-07-07': { produced: 25, calc: 20, pph: 80, n: 1 }, '2026-07-08': { produced: 30, calc: 30, pph: 80, n: 1 } } } };
    const t3 = ff.applyUpload('pg-u', 'f2.csv', partial);
    check('partial file: 1 updated (07-07 -> 25) + 1 inserted (07-08); 07-06 untouched', t3.updated === 1 && t3.inserted === 1 && dd.fulfillment['cal_a|s1|2026-07-06'].produced === 10 && dd.fulfillment['cal_a|s1|2026-07-07'].produced === 25 && dd.fulfillment['cal_a|s1|2026-07-08'].produced === 30, JSON.stringify(t3));
    check('store holds 3 keys with the guide-style key shape', Object.keys(dd.fulfillment).length === 3 && Object.keys(dd.fulfillment).every(k => /^cal_a\|s1\|\d{4}-\d{2}-\d{2}$/.test(k)));
    check('upload log: 3 entries, newest first, with counts and date span', dd.fulfillmentLog.length === 3 && dd.fulfillmentLog[0].file === 'f2.csv' && dd.fulfillmentLog[0].dates[0] === '2026-07-07' && dd.fulfillmentLog[0].dates[1] === '2026-07-08');
    const t4 = ff.applyUpload('pg-u', 'f3.csv', { 'new prog': { label: 'New Prog', srcId: '9', days: { '2026-07-06': { produced: 5, calc: 5, pph: 80, n: 1 } } } });
    check('unmapped Field Program is kept pending (not dropped, not stored)', t4.unmapped === 1 && !!dd.fulfillmentPending['new prog'] && Object.keys(dd.fulfillment).length === 3);
    const r = ff.mapPending('pg-u', 'new prog', 'cal_a', 's2');
    check('mapping the pending program flushes its rows into the store and remembers the mapping', r.inserted === 1 && !dd.fulfillmentPending['new prog'] && dd.fulfillmentMap['new prog'].schoolId === 's2' && Object.keys(dd.fulfillment).length === 4);
  });

  /* ═══ 3. Section: upload -> Unmapped -> map -> per-program table with live Planned ═══ */
  await suite('Section: one upload place; Unmapped bucket; manual Program+School mapping; per-program card with school filter, 15-row pager, Planned from the calendar, variance and %', async () => {
    await importGuide(dom, c, fixture()); await flush(1200);
    check('the Fulfillment section mounts after the Summary with an empty state', !!sec() && sec().querySelector('.pg-area-label').textContent === 'Fulfillment' && /No fulfillment data yet/.test(sec().textContent));
    // 20 days for one program + 3 days for another, all via CSV
    const days = []; for (let i = 0; i < 28; i++) { const dt = new Date(2026, 6, 6 + i); if (dt.getDay() === 0 || dt.getDay() === 6) continue; days.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')); }
    const rowsA = days.slice(0, 20).map((dk, i) => ['100', 'District X - After School', dk, 'Mon', '1', String(10 + i), '12', '90']);
    const rowsB = days.slice(0, 3).map((dk) => ['200', 'District X - Enrichment', dk, 'Mon', '1', '4', '3', '70']);
    await upload(csvFile('fulfillment.csv', csvText(rowsA.concat(rowsB))));
    check('after upload: Unmapped bucket lists both Field Programs; nothing stored yet', !!sec().querySelector('.ff-unmapped') && sec().querySelectorAll('.ff-unmapped-row').length === 2 && Object.keys(det().fulfillment || {}).length === 0);
    check('the upload log shows only time, file and day count (no new/updated/unmapped counts)', /fulfillment\.csv/.test(sec().querySelector('.ff-log').textContent) && /23 days/.test(sec().querySelector('.ff-log').textContent) && !/new|updated|unmapped/.test(sec().querySelector('.ff-log').textContent), sec().querySelector('.ff-log').textContent);
    // map the After School program to cal_a / Adams
    const row0 = sec().querySelector('.ff-unmapped-row');
    check('Map is disabled until both Program and School are chosen', row0.querySelector('.ff-map-btn').disabled);
    $(row0.querySelector('.ff-map-cal')).val('cal_a').trigger('change'); await flush(50);
    check('choosing the Program populates its schools', [...row0.querySelector('.ff-map-school').options].map(o => o.textContent).join('|') === '\u2014 School \u2014|Lincoln|Adams');
    $(row0.querySelector('.ff-map-school')).val('s2').trigger('change'); await flush(50); $(row0.querySelector('.ff-map-btn')).trigger('click'); await flush(1200);
    check('after mapping: 20 records stored under cal_a|s2, one program still unmapped', Object.keys(det().fulfillment).filter(k => k.indexOf('cal_a|s2|') === 0).length === 20 && sec().querySelectorAll('.ff-unmapped-row').length === 1);
    check('the mapping is remembered by normalized name', !!det().fulfillmentMap[ff.norm('District X - After School')] && det().fulfillmentMap[ff.norm('District X - After School')].schoolId === 's2');
    // the program card
    check('a card renders for After School with a 15-row first page and a pager', !!card('cal_a') && rows('cal_a').length === 15 && /Page 1 of 2 \u2022 20 rows/.test(card('cal_a').querySelector('.ff-page-lbl').textContent), card('cal_a') && card('cal_a').querySelector('.ff-page-lbl').textContent);
    check('rows are newest first', rows('cal_a')[0].children[0].textContent > rows('cal_a')[1].children[0].textContent || /Aug|Jul 31/.test(rows('cal_a')[0].children[0].textContent));
    const r0 = rows('cal_a')[0];
    check('the table has exactly four columns: Date, Day, School, Produced Hrs (no Planned/Variance/%/Vendor Calc)', [...card('cal_a').querySelectorAll('thead th')].map(h => h.textContent.trim().replace(/\s*[\u25b2\u25bc]$/, '')).join('|') === 'Date|Day|School|Produced Hrs' && r0.children.length === 4 && !card('cal_a').querySelector('.ff-planned, .ff-var, .ff-pct, .ff-calc'), [...card('cal_a').querySelectorAll('thead th')].map(h => h.textContent.trim()).join('|'));
    check('Produced Hrs shows the value', /^\d/.test(r0.querySelector('.ff-produced').textContent));
    check('Produced Hrs values are coloured #1f734c', rows('cal_a').every(r => /31,\s*115,\s*76/.test(r.querySelector('.ff-produced').style.color)), r0.querySelector('.ff-produced').style.color);
    $(card('cal_a').querySelector('.ff-next')).trigger('click'); await flush(300);
    check('Next pages to the remaining 5 rows', rows('cal_a').length === 5 && /Page 2 of 2/.test(card('cal_a').querySelector('.ff-page-lbl').textContent));
    check('the card meta shows only Days and Produced Hrs (no Planned / %)', /^20 days \u2022 [\d.]+ Produced Hrs$/.test(card('cal_a').querySelector('.ff-card-meta').textContent), card('cal_a').querySelector('.ff-card-meta').textContent);
    // one-to-one guard: Enrichment -> cal_a / Adams (already taken) must be blocked; -> cal_b / Lincoln is fine
    const row1 = sec().querySelector('.ff-unmapped-row');
    $(row1.querySelector('.ff-map-cal')).val('cal_a').trigger('change'); await flush(50); $(row1.querySelector('.ff-map-school')).val('s2').trigger('change'); await flush(50);
    check('one-to-one guard: a school already mapped in that program is refused (warning + Map disabled + option marked)', row1.querySelector('.ff-map-warn').style.display !== 'none' && row1.querySelector('.ff-map-btn').disabled && /\(mapped\)/.test([...row1.querySelector('.ff-map-school').options].find(o => o.value === 's2').textContent));
    $(row1.querySelector('.ff-map-cal')).val('cal_b').trigger('change'); await flush(50); $(row1.querySelector('.ff-map-school')).val('s1').trigger('change'); await flush(50); $(row1.querySelector('.ff-map-btn')).trigger('click'); await flush(1200);
    check('mapping Enrichment to its own program+school works; Unmapped bucket disappears', !sec().querySelector('.ff-unmapped') && !!card('cal_b') && rows('cal_b').length === 3);
    check('the Enrichment card rows carry School and Produced Hrs', rows('cal_b')[0].querySelector('.ff-school').textContent === 'Lincoln' && rows('cal_b')[0].querySelector('.ff-produced').textContent === '4');
    // school filter
    $(card('cal_a').querySelector('.ff-school-filter')).val('s2').trigger('change'); await flush(300);
    check('the school filter narrows the table and resets to page 1', /Page 1 of 2/.test(card('cal_a').querySelector('.ff-page-lbl').textContent) && rows('cal_a').every(r => r.children[2].textContent === 'Adams'));
    // unmap moves rows back to Unmapped
    $(card('cal_a').querySelector('.ff-unmap')).trigger('click'); await flush(1200);
    check('unmapping moves its 20 rows back to the Unmapped bucket and drops the mapping', !!sec().querySelector('.ff-unmapped') && Object.keys(det().fulfillment).filter(k => k.indexOf('cal_a|') === 0).length === 0 && !det().fulfillmentMap[ff.norm('District X - After School')] && Object.keys(det().fulfillmentPending[ff.norm('District X - After School')].days).length === 20);
    await mapFirstPending('cal_a', 's1');
    check('re-mapping to a different school lands the rows there', Object.keys(det().fulfillment).filter(k => k.indexOf('cal_a|s1|') === 0).length === 20);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3b. Sorting on School and Produced Hrs; Export CSV of the displayed view ═══ */
  await suite('School and Produced Hrs headers sort (toggle direction, indicator shown); Export CSV downloads the displayed view (filter + sort, every page)', async () => {
    await importGuide(dom, c, fixture()); await flush(1200);
    const rowsA = [['1', 'Prog A', '2026-07-06', 'Mon', '1', '5', '5', '80'], ['1', 'Prog A', '2026-07-07', 'Tue', '1', '30', '5', '80'], ['1', 'Prog A', '2026-07-08', 'Wed', '1', '12', '5', '80']];
    const rowsB = [['2', 'Prog B', '2026-07-06', 'Mon', '1', '9', '5', '80'], ['2', 'Prog B', '2026-07-09', 'Thu', '1', '1', '5', '80']];
    await upload(csvFile('f.csv', csvText(rowsA.concat(rowsB))));
    await mapFirstPending('cal_a', 's2');   // Prog A -> Adams
    await mapFirstPending('cal_a', 's1');   // Prog B -> Lincoln
    const th = key => card('cal_a').querySelector('th[data-ff-sort="' + key + '"]');
    check('School and Produced Hrs headers are sortable; Day is not', !!th('school') && !!th('produced') && !!th('date') && !card('cal_a').querySelector('th[data-ff-sort="day"]'));
    check('default order is Date descending with the indicator on Date', th('date').getAttribute('data-ff-dir') === 'desc' && /\u25bc/.test(th('date').textContent) && rows('cal_a')[0].children[0].textContent > rows('cal_a')[1].children[0].textContent);
    $(th('school')).trigger('click'); await flush(300);
    check('click School: ascending (Adams first), indicator moves to School', th('school').getAttribute('data-ff-dir') === 'asc' && rows('cal_a').slice(0, 3).every(r => r.querySelector('.ff-school').textContent === 'Adams') && !th('date').getAttribute('data-ff-dir'));
    $(th('school')).trigger('click'); await flush(300);
    check('click School again: descending (Lincoln first)', th('school').getAttribute('data-ff-dir') === 'desc' && rows('cal_a')[0].querySelector('.ff-school').textContent === 'Lincoln');
    $(th('produced')).trigger('click'); await flush(300);
    check('click Produced Hrs: descending first (30 on top)', th('produced').getAttribute('data-ff-dir') === 'desc' && rows('cal_a')[0].querySelector('.ff-produced').textContent === '30' && rows('cal_a').map(r => parseFloat(r.querySelector('.ff-produced').textContent)).join(',') === '30,12,9,5,1');
    $(th('produced')).trigger('click'); await flush(300);
    check('click Produced Hrs again: ascending (1 on top)', rows('cal_a').map(r => parseFloat(r.querySelector('.ff-produced').textContent)).join(',') === '1,5,9,12,30');
    // export the displayed view
    let captured = null, dl = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') captured = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => { dl = el.download; }; return el; };
    $(card('cal_a').querySelector('.ff-export')).trigger('click'); await flush(200);
    check('Export CSV downloads a .csv named after the program with the four-column header', /^fulfillment-After_School\.csv$/.test(dl || '') && captured.split('\n')[0] === 'Date,Day,School,Produced Hrs', dl + ' / ' + (captured || '').split('\n')[0]);
    check('the export follows the current sort (ascending Produced Hrs) and includes every row', captured.split('\n').length === 6 && captured.split('\n').slice(1).map(l => l.split(',')[3]).join(',') === '1,5,9,12,30', captured);
    $(card('cal_a').querySelector('.ff-school-filter')).val('s1').trigger('change'); await flush(300);
    $(card('cal_a').querySelector('.ff-export')).trigger('click'); await flush(200);
    W.Blob = OB; d.createElement = oc;
    check('the export follows the school filter (Lincoln only)', captured.split('\n').length === 3 && captured.split('\n').slice(1).every(l => /,Lincoln,/.test(l)), captured);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Re-upload pre-maps known names; export/import round-trip ═══ */
  await suite('A re-upload of a known Field Program is auto-mapped (no prompt) and upserts; fulfillment survives export/import', async () => {
    await importGuide(dom, c, fixture()); await flush(1200);
    await upload(csvFile('f1.csv', csvText([['100', 'District X - After School', '2026-08-03', 'Mon', '1', '10', '12', '90'], ['100', 'District X - After School', '2026-08-04', 'Tue', '1', '11', '12', '90'], ['200', 'District X - Enrichment', '2026-08-03', 'Mon', '1', '4', '3', '70']])));
    await mapFirstPending('cal_a', 's1'); await mapFirstPending('cal_b', 's1');
    const before = Object.keys(det().fulfillment).length;
    check('setup: 3 records across two mapped programs', before === 3, before);
    await upload(csvFile('fulfillment2.csv', csvText([['100', 'district x - after school', '2026-08-05', 'Wed', '1', '99', '12', '90']])));   // different case -> same normalized name
    check('a known name (case-insensitive) is mapped automatically and its day upserted', !sec().querySelector('.ff-unmapped') && Object.keys(det().fulfillment).length === before + 1 && det().fulfillment['cal_a|s1|2026-08-05'].produced === 99, Object.keys(det().fulfillment).length + ' vs ' + (before + 1));
    let captured = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') captured = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {};
    const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; };
    $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc;
    const pd = JSON.parse(captured).data;
    check('export carries fulfillment, fulfillmentMap and fulfillmentLog', Object.keys(pd.fulfillment).length === before + 1 && Object.keys(pd.fulfillmentMap).length === 2 && pd.fulfillmentLog.length >= 2);
    await importGuide(dom, c, captured); await flush(1500);
    check('after reload: store, mappings and the cards are intact', Object.keys(det().fulfillment).length === before + 1 && !!card('cal_a') && !!card('cal_b') && rows('cal_a').length === 3, [Object.keys(det().fulfillment).length, !!card('cal_a'), !!card('cal_b'), card('cal_a') && card('cal_a').querySelector('.ff-page-lbl').textContent].join(' / '));
    check('after reload the pager starts on page 1', /Page 1 of/.test(card('cal_a').querySelector('.ff-page-lbl').textContent), card('cal_a').querySelector('.ff-page-lbl').textContent);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Mapping review is REQUIRED: a prior mapping only prefills; nothing imports without confirmation ═══ */
  await suite('Every upload stages a mapping review: a previous mapping prefills the pickers as a suggestion, the user may edit it, Cancel imports nothing, and only Confirm merges the report', async () => {
    await importGuide(dom, c, fixture()); await flush(900);
    const rev = () => sec().querySelector('.ff-review');
    const nRec = () => Object.keys(det().fulfillment || {}).length;
    // first upload: review opens, nothing imported, no suggestions
    await stageUpload(csvFile('f1.csv', csvText([['100', 'DX After School', '2026-07-06', 'Mon', '1', '10', '1', '90'], ['200', 'DX Enrichment', '2026-07-06', 'Mon', '1', '4', '1', '70']])));
    check('the upload opens a mapping review and imports NOTHING yet', !!rev() && reviewRows().length === 2 && nRec() === 0, nRec());
    check('the "Suggested from" column is gone: five headers matching five cells per row', (function(){ const hs=[...sec().querySelectorAll('.ff-review-table thead th')].map(h=>h.textContent.trim()); return hs.join('|')==='Field Program Name|ID|Days|Program Calendar|School' && !sec().querySelector('.ff-rev-why') && reviewRows().every(r=>r.children.length===hs.length); })(), [...sec().querySelectorAll('.ff-review-table thead th')].map(h=>h.textContent.trim()).join('|'));
    check('every cell in a mapping row shares one baseline and the two pickers are sized alike', reviewRows().every(r => [...r.children].every(td => td.style.verticalAlign === 'middle') && r.querySelector('.ff-rev-cal').style.width === r.querySelector('.ff-rev-school').style.width && r.querySelector('.ff-rev-cal').style.height === r.querySelector('.ff-rev-school').style.height));
    check('the review names the file and shows the program/row counts', /f1\.csv/.test(rev().querySelector('.ff-review-title').textContent) && /2 programs/.test(rev().textContent) && /Nothing is imported until you confirm/.test(rev().textContent));
    check('with no prior mapping the pickers are empty and the row is marked as unsuggested', reviewRows().every(r => r.querySelector('.ff-rev-cal').value === '' && !r.getAttribute('data-ff-suggested') && /No previous mapping/.test(r.getAttribute('title') || '')));
    await setReviewMap(0, 'cal_a', 's2'); await setReviewMap(1, 'cal_b', 's1');
    check('the footer reports how many of the programs are mapped', /2 of 2 mapped/.test(sec().querySelector('.ff-review-note').textContent), sec().querySelector('.ff-review-note').textContent);
    await confirmReview();
    check('Confirm imports both programs and closes the review', !rev() && nRec() === 2 && Object.keys(det().fulfillmentMap).length === 2, nRec());
    // second upload of the SAME names: must not auto-apply
    const before = JSON.stringify(det().fulfillment);
    await stageUpload(csvFile('f2.csv', csvText([['100', 'DX After School', '2026-07-07', 'Tue', '1', '11', '1', '90'], ['200', 'DX Enrichment', '2026-07-07', 'Tue', '1', '5', '1', '70']])));
    check('a second upload with identical names does NOT auto-apply: the review opens and the dataset is untouched', !!rev() && JSON.stringify(det().fulfillment) === before && nRec() === 2);
    check('the pickers are PREFILLED from the previous mapping and flagged as a suggestion to review', reviewRows()[0].querySelector('.ff-rev-cal').value === 'cal_a' && reviewRows()[0].querySelector('.ff-rev-school').value === 's2' && reviewRows()[1].querySelector('.ff-rev-cal').value === 'cal_b' && reviewRows()[1].querySelector('.ff-rev-school').value === 's1' && reviewRows()[0].getAttribute('data-ff-suggested') === 'name' && /same name/.test(reviewRows()[0].getAttribute('title')) && /review before saving/.test(reviewRows()[0].getAttribute('title')));
    await cancelReview();
    check('Cancel closes the review and imports nothing', !rev() && JSON.stringify(det().fulfillment) === before && nRec() === 2);
    // upload again and EDIT the suggestion before confirming
    await stageUpload(csvFile('f3.csv', csvText([['100', 'DX After School', '2026-07-08', 'Wed', '1', '12', '1', '90']])));
    check('the re-upload is prefilled with the previous school (s2)', reviewRows()[0].querySelector('.ff-rev-school').value === 's2');
    await setReviewMap(0, 'cal_a', 's1');
    await confirmReview();
    check('the EDITED mapping wins: the row lands under the chosen school and the saved mapping is updated', !!det().fulfillment['cal_a|s1|2026-07-08'] && !det().fulfillment['cal_a|s2|2026-07-08'] && det().fulfillmentMap[ff.norm('DX After School')].schoolId === 's1');
    // a suggestion can also come from a matching Field Program ID under a different name
    await stageUpload(csvFile('f4.csv', csvText([['100', 'DX After School (renamed 26-27)', '2026-07-09', 'Thu', '1', '13', '1', '90']])));
    check('a new NAME with a known program ID is prefilled from that ID and flagged as such', reviewRows()[0].querySelector('.ff-rev-cal').value === 'cal_a' && reviewRows()[0].querySelector('.ff-rev-school').value === 's1' && reviewRows()[0].getAttribute('data-ff-suggested') === 'id' && /same program ID/.test(reviewRows()[0].getAttribute('title')), reviewRows()[0].getAttribute('title'));
    await cancelReview();
    check('cancelling that one leaves no trace of the renamed program', !det().fulfillmentMap[ff.norm('DX After School (renamed 26-27)')] && !det().fulfillment['cal_a|s1|2026-07-09']);
    // leaving a program unmapped at Confirm sends it to the Unmapped bucket, not the dataset
    await stageUpload(csvFile('f5.csv', csvText([['999', 'Totally New Program', '2026-07-10', 'Fri', '1', '7', '1', '90']])));
    check('an unknown program gets no suggestion', !reviewRows()[0].getAttribute('data-ff-suggested') && /No previous mapping/.test(reviewRows()[0].getAttribute('title') || ''));
    await confirmReview();
    check('confirming with it unmapped parks it in Unmapped and keeps it out of the dataset', !!det().fulfillmentPending[ff.norm('Totally New Program')] && !Object.keys(det().fulfillment).some(k => /2026-07-10$/.test(k)) && !!sec().querySelector('.ff-unmapped'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
