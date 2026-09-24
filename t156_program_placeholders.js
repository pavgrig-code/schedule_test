// t156_program_placeholders.js — unnamed programs are shown as "Program N" (N = the program's row in the Programs
// table) everywhere they are shown, instead of "Calendar N". Display only: a blank name stays blank in the data,
// user-defined names are untouched, and the placeholder follows the program's position.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');
let pass = 0, fail = 0, suites = 0;
function check(n, c, e) { if (c) pass++; else { fail++; console.log('  [FAIL] ' + n + (e != null ? '  \u2014 ' + e : '')); } }
async function suite(n, fn) { suites++; console.log('\u2500 ' + n); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1600); d.createElement = ocr;
}
// program 1 blank, program 2 named, program 3 whitespace-only (also a placeholder)
function fx() {
  const cal = (id, n, col) => ({ name: n, firstDay: '2026-07-20', lastDay: '2026-07-31', color: col, pricePerHour: '80.00', billable: true, calId: id });
  const data = {
    status: 'Draft', combinedView: true,
    calendarRows: [cal('cal_a', '', '#e57373'), cal('cal_b', 'Named Prog', '#64b5f6'), cal('cal_c', '   ', '#81c784')],
    siteRowsByCal: { cal_a: [{ school: 'S1', coaches_ctkk: 1, ctkk: 10 }], cal_b: [{ school: 'S2', coaches_ctkk: 1, ctkk: 10 }], cal_c: [{ school: 'S3', coaches_ctkk: 1, ctkk: 10 }] },
    siteRows: [{ school: 'S1', coaches_ctkk: 1, ctkk: 10 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') }, c1: { ctkk: mkTimes('09:00', '15:00') }, c2: { ctkk: mkTimes('09:00', '15:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }] };
  return JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data });
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const det = () => W._pgGuideDetails()['pg-001'];
  const OLD = /\bCalendar [0-9]+\b/;
  const calTbl = () => [...pl().querySelectorAll('table')].find(x => x.rows[0] && [...x.rows[0].cells].some(c2 => /Meal Breaks/.test(c2.textContent)));
  const nameInputs = () => [...calTbl().querySelectorAll('tbody tr')].map(r => r.querySelector('input[placeholder]')).filter(Boolean);
  const allPlaceholders = () => [...d.querySelectorAll('[placeholder]')].map(e => e.getAttribute('placeholder'));
  const expCapture = async () => { let cap = null; const OB = W.Blob; W.Blob = function (p, o) { if (p && typeof p[0] === 'string') cap = p[0]; return new OB(p, o); }; W.URL.createObjectURL = () => 'blob:x'; W.URL.revokeObjectURL = () => {}; const oc = d.createElement.bind(d); d.createElement = function (t) { const el = oc(t); if (t === 'a') el.click = () => {}; return el; }; $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click'); await flush(60); $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300); W.Blob = OB; d.createElement = oc; return cap; };
  const expandAll = async () => { for (const t of [...pl().querySelectorAll('.pg-sec-toggle')]) { if (/Expand/.test(t.getAttribute('title') || '')) { $(t).trigger('click'); await flush(150); } } };

  /* ═══ 1. Everywhere ═══ */
  await suite('Unnamed programs read "Program N" everywhere; no "Calendar N" remains in the page; named programs are untouched; blank names stay blank in the data', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expandAll();
    const ins = nameInputs();
    check('the Programs table name inputs use "Program N" placeholders by row', ins.length === 3 && ins[0].getAttribute('placeholder') === 'Program 1' && ins[2].getAttribute('placeholder') === 'Program 3', ins.map(i => i.getAttribute('placeholder')).join(','));
    check('the named program keeps its name in its input', ins[1].value === 'Named Prog');
    check('no "Calendar N" anywhere in the Planning Guide text', !OLD.test(pl().textContent), (pl().textContent.match(OLD) || [''])[0]);
    check('no "Calendar N" in any placeholder attribute', !allPlaceholders().some(p => OLD.test(p || '')), allPlaceholders().filter(p => OLD.test(p || '')).join(','));
    check('the Summary lists Program 1, Named Prog and Program 3', (() => { const t = d.getElementById('summary-section-pg-001').textContent; return /Program 1/.test(t) && /Named Prog/.test(t) && /Program 3/.test(t); })());
    check('the calendar area (combined view) names them the same way', (() => { const t = d.getElementById('cal-section-pg-001').textContent; return /Program 1/.test(t) && /Named Prog/.test(t) && /Program 3/.test(t); })());
    check('the Pricing Calculator rows name them the same way', (() => { const rows = [...pl().querySelectorAll('tr.pg-disc-row')].map(r => r.cells[0].textContent.trim()); return rows.join('|') === 'Program 1|Named Prog|Program 3'; })(), [...pl().querySelectorAll('tr.pg-disc-row')].map(r => r.cells[0].textContent.trim()).join('|'));
    check('the stored names are unchanged: blank stays blank, whitespace stays whitespace (display only)', det().calendarRows[0].name === '' && det().calendarRows[1].name === 'Named Prog' && det().calendarRows[2].name === '   ');
    const P = JSON.parse(await expCapture());
    check('the export keeps the blank names in the data', P.data.calendarRows[0].name === '' && P.data.calendarRows[1].name === 'Named Prog');
    check('the export\u2019s calculated block names them Program 1 / Named Prog / Program 3', P.calculated.calendars.map(x => x.name).join('|') === 'Program 1|Named Prog|Program 3', P.calculated.calendars.map(x => x.name).join('|'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 2. Fulfillment pickers and card (formerly "Calendar cal_a") ═══ */
  await suite('The Fulfillment review picker and the program cards show "Program N" (they used to fall back to the internal id)', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expandAll();
    const sec = () => d.getElementById('fulfillment-section-pg-001');
    const H = 'Field Program ID,Field Program Name,School site,Shift Date,Produced Hours,Calculator Hours,Price Per Hour\n';
    const f = { name: 'f.csv', arrayBuffer: async () => new ArrayBuffer(0), text: async () => H + '1,PA,S1,2026-07-20,5,1,80\n' };
    const inp = sec().querySelector('.ff-file'); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); $(inp).trigger('change'); await flush(1500);
    const opts = [...sec().querySelectorAll('.ff-review-row .ff-rev-cal option')].map(o => o.textContent).filter(t => t && !/^\u2014/.test(t));
    check('the review\u2019s Program picker lists Program 1, Named Prog, Program 3', opts.join('|') === 'Program 1|Named Prog|Program 3', opts.join('|'));
    check('no internal ids leak into the picker', !opts.some(t => /cal_/.test(t)));
    $(sec().querySelector('.ff-review-row .ff-rev-cal')).val('cal_a').trigger('change'); await flush(40);
    const ss = sec().querySelector('.ff-review-row .ff-rev-school'); if (ss) { $(ss).val(ss.options[1] && ss.options[1].value).trigger('change'); await flush(40); }
    $(sec().querySelector('.ff-review-confirm')).trigger('click'); await flush(1500);
    const cardHdrs = [...sec().querySelectorAll('.ff-card')].map(cd => cd.textContent);
    check('the Fulfillment card for the unnamed program is headed "Program 1"', cardHdrs.some(t => /Program 1/.test(t)) && !cardHdrs.some(t => /cal_a/.test(t)), cardHdrs.map(t => t.slice(0, 30)).join(' | '));
    check('no "Calendar N" anywhere after the upload', !OLD.test(pl().textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 3. Live behaviour ═══ */
  await suite('Naming a program replaces its placeholder; clearing the name brings "Program N" back; the placeholder follows the program\u2019s position when a program above it is deleted', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expandAll();
    const i0 = nameInputs()[0];
    $(i0).trigger('focus'); i0.value = 'Morning Club'; $(i0).trigger('input'); $(i0).trigger('change'); $(i0).trigger('blur'); await flush(1500);
    check('typing a name stores it and the Summary shows it instead of the placeholder', det().calendarRows[0].name === 'Morning Club' && /Morning Club/.test(d.getElementById('summary-section-pg-001').textContent) && !/Program 1\b/.test(d.getElementById('summary-section-pg-001').textContent));
    const i0b = nameInputs()[0];
    $(i0b).trigger('focus'); i0b.value = ''; $(i0b).trigger('input'); $(i0b).trigger('change'); $(i0b).trigger('blur'); await flush(1500);
    check('clearing it brings back "Program 1"', det().calendarRows[0].name === '' && /Program 1\b/.test(d.getElementById('summary-section-pg-001').textContent));
    // delete the named program (row 2): the whitespace-named program moves to row 2 and reads "Program 2"
    const delBtn = [...calTbl().querySelectorAll('tbody tr')][1].querySelector('button[title*="Delete"], button[title*="Remove"], .pg-cal-del');
    if (delBtn) {
      $(delBtn).trigger('click'); await flush(400);
      const conf = d.querySelector('.pg-confirm-ov, .xs-ui'); const yes = conf && [...conf.querySelectorAll('button')].find(b => /^(Delete|Remove|Yes)$/i.test(b.textContent.trim())); if (yes) { $(yes).trigger('click'); }
      await flush(1800);
      check('after deleting the program above it, the third program now reads "Program 2" (placeholders follow position)', det().calendarRows.length === 2 && nameInputs()[1].getAttribute('placeholder') === 'Program 2' && /Program 2\b/.test(d.getElementById('summary-section-pg-001').textContent), nameInputs().map(i => i.getAttribute('placeholder')).join(','));
    } else check('the Programs table has its Delete row button', false);
    check('no "Calendar N" anywhere', !OLD.test(pl().textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ 4. The add button ═══ */
  await suite('The Programs area button reads "+ Add Program" (no "Add Calendar" anywhere) and still adds a program, which shows as the next "Program N"', async () => {
    await importGuide(dom, c, fx()); await flush(900); await expandAll();
    const btns = [...pl().querySelectorAll('button')];
    const add = btns.find(b => b.textContent.trim() === '+ Add Program');
    check('the button reads "+ Add Program"', !!add);
    check('no button or text says "Add Calendar" any more', !btns.some(b => /Add Calendar/.test(b.textContent)) && !/Add Calendar/.test(pl().textContent));
    const n0 = det().calendarRows.length;
    $(add).trigger('click'); await flush(1500);
    check('clicking it adds a program exactly as before (one new row, blank name)', det().calendarRows.length === n0 + 1 && !String(det().calendarRows[n0].name || '').trim());
    const ph = nameInputs().map(i => i.getAttribute('placeholder'));
    check('the new program shows as "Program ' + (n0 + 1) + '"', ph[n0] === 'Program ' + (n0 + 1), ph.join(','));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
