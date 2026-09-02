// t110_order_summary_badges.js — (1) The Site Breakdown drag-drop display order propagates to the
// Separate-by-School Staffing Hours tables and to the Program Summary school lists (the same
// authoritative order everywhere), with every per-school record staying attached to the school
// IDENTITY (true index si), never the row position. (2) The Summary's School Name column shows the
// school's Charter/GS badges (pgSchoolBadges via CDS) and its Site Breakdown label chips
// (sbLabelChipsFor) — same builders, same styling — updating immediately on any badge/label/order
// change through the existing refreshSummary rebuild chain.
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(k => o[k] = { start: s, end: e }); return o; }

function pickSchools(W) {
  const SL = W._pgRef.allSchools();
  const ch = SL.find(s => String(s.charter || '').toUpperCase() === 'Y' && s.gs);
  const nc = SL.find(s => String(s.charter || '').toUpperCase() !== 'Y' && s.gs && s !== ch);
  return { ch, nc };
}
function fx(W, extra) {
  const { ch, nc } = pickSchools(W);
  // Three schools with DISTINCT coach counts (1/2/3), so hours identify the school (60/120/180 hrs
  // over the 2-week calendar) regardless of where its row is displayed.
  const A = [
    { school: ch.name, schoolCds: String(ch.cds), coaches_ctkk: 1, ctkk: 10, sbLabels: ['lblES'] },
    { school: nc.name, schoolCds: String(nc.cds), coaches_ctkk: 2, ctkk: 10 },
    { school: 'Plain School', coaches_ctkk: 3, ctkk: 10 }];
  const data = Object.assign({
    status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A },
    sbLabelsByCal: { cal_a: [{ id: 'lblES', name: 'ES', color: '#ef5350' }, { id: 'lblMS', name: 'MS', color: '#e91e63' }] },
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  }, extra || {});
  return { json: JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data }), ch, nc };
}
async function importGuide(dom, c, json) {
  const { d, $ } = c; const W = dom.window; let cap = null; const ocr = d.createElement.bind(d);
  d.createElement = function (t) { const el = ocr(t); if (t === 'input') cap = el; if (t === 'a') { el.click = () => {}; } return el; };
  const pl = () => d.getElementById('planning-panel');
  await setMode(c, 'btn-planning'); await flush(40); await clickGuide(c, 0); await flush(40); cap = null;
  $([...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20)).trigger('click');
  $([...pl().querySelectorAll('button')].find(x => x.textContent.indexOf('Import') >= 0 && x.querySelector('span'))).trigger('click'); await flush(20);
  Object.defineProperty(cap, 'files', { value: [new W.File([json], 'g.json', { type: 'application/json' })], configurable: true });
  cap.dispatchEvent(new W.Event('change')); await flush(1400); d.createElement = ocr;
}
async function boot(extra) {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const E = { dom, W, d, $, c };
  E.pl = () => d.getElementById('planning-panel');
  E.card = () => W._pgSbCards['pg-001|cal_a'];
  // TRUE si sequence of the separated hours tables (dedup: base + week-view builds share the attr).
  E.soloOrder = () => { const seen = [], out = []; [...E.pl().querySelectorAll('#staffing-section-pg-001 [data-sf-school]')].forEach(e => { const v = e.getAttribute('data-sf-school'); if (!seen.includes(v) && e.querySelector('thead th[data-day]')) { seen.push(v); out.push(v); } }); return out; };
  E.sumRows = () => [...E.pl().querySelectorAll('#summary-section-pg-001 tr.sum-school-row')];
  E.sumInfo = () => E.sumRows().map(tr => ({
    num: tr.querySelector('td').textContent.trim(),
    nm: tr.querySelector('.sum-school-nm').textContent,
    ch: !!tr.querySelector('.pg-ch-badge'), gs: !!tr.querySelector('.pg-gs-badge'),
    lbls: [...tr.querySelectorAll('.sb-lbl-chip')].map(x => x.textContent),
    hrs: tr.children[tr.children.length - 2].textContent
  }));
  E.undoBtn = () => [...d.body.querySelectorAll('button, span, a')].find(x => /^Undo$/i.test(x.textContent.trim()));
  const f = fx(W, extra); E.ch = f.ch; E.nc = f.nc;
  await importGuide(dom, c, f.json); await flush(1200);
  return E;
}

(async () => {

  /* ═══ Suite 1: separated Staffing Hours tables follow the display order; data rides identity ═══ */
  await suite('Separate-by-School tables reorder with Site Breakdown; slots/hours stay on the school identity; Undo restores', async () => {
    const E = await boot(); const { dom, W, $ } = E;
    check('initial separated-table order is the natural array order', E.soloOrder().join(',') === '0,1,2', E.soloOrder().join(','));
    check('the reorder seam is registered', !!(E.card() && E.card().reorder));
    $('.pg-undo-snack').remove();
    E.card().reorder(0, 2); await flush(1800);
    check('Site Breakdown display order moved (true indices 1,2,0)', E.card().order().join(',') === '1,2,0', E.card().order().join(','));
    check('the separated hours tables re-emitted in the SAME order', E.soloOrder().join(',') === '1,2,0', E.soloOrder().join(','));
    // Identity: each solo table still keyed by its TRUE si, so the moved school's hours are its own.
    const hrs = E.sumInfo().map(r => r.nm.slice(0, 8) + '=' + r.hrs);
    check('hours follow the school, not the row position (60/120/180 stay with their schools)', (function () {
      const m = {}; E.sumInfo().forEach(r => m[r.nm] = r.hrs);
      return m[E.ch.name] === '60 hrs' && m[E.nc.name] === '120 hrs' && m['Plain School'] === '180 hrs';
    })(), hrs.join(' '));
    check('Undo offered for the reorder', !!E.undoBtn());
    if (E.undoBtn()) { $(E.undoBtn()).trigger('click'); await flush(1800); }
    check('Undo restores the order in Site Breakdown AND the separated tables', E.card().order().join(',') === '0,1,2' && E.soloOrder().join(',') === '0,1,2', E.card().order().join(',') + ' / ' + E.soloOrder().join(','));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 2: Program Summary school list follows the same authoritative order ═══ */
  await suite('Summary rows reorder with Site Breakdown, keeping identity numbers, hours, and chips on the school', async () => {
    const E = await boot(); const { dom, W } = E;
    check('initial Summary order matches Site Breakdown', E.sumInfo().map(r => r.nm).join('|') === E.card().names().join('|'));
    E.card().reorder(0, 2); await flush(1800);
    const info = E.sumInfo();
    check('Summary rows follow the new display order', info.map(r => r.nm).join('|') === E.card().names().join('|'), info.map(r => r.nm.slice(0, 10)).join('|'));
    check('the # column keeps the school\u2019s identity number (1 now listed last)', info[2].num === '1' && info[0].num === '2', info.map(r => r.num).join(','));
    check('the ES label chip moved WITH its school to the bottom row', info[2].lbls.join(',') === 'ES' && info[0].lbls.length === 0);
    check('badges moved with the school too (charter row now last)', info[2].ch === true && info[0].ch === false);
    E.card().reorder(2, 0); await flush(1800);
    check('a second reorder restores the original listing', E.sumInfo().map(r => r.nm).join('|') === E.card().names().join('|') && E.card().order().join(',') === '0,1,2');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 3: badges + label chips in the Summary, live on every change ═══ */
  await suite('Summary School Name shows Charter/GS badges + label chips (shared builders), updating live', async () => {
    const E = await boot(); const { dom, d, $ } = E;
    const info = E.sumInfo();
    check('the charter school row shows the round C badge + its GS badge', info[0].ch && info[0].gs);
    check('the C badge is the shared round marker (14px circle, borderRadius 50%)', (function () {
      const b = E.sumRows()[0].querySelector('.pg-ch-badge');
      return b && b.style.borderRadius === '50%' && b.style.width === '14px' && b.textContent === 'C';
    })());
    check('the GS badge carries its category attribute (shared builder)', !!E.sumRows()[0].querySelector('.pg-gs-badge[data-gs-cat]'));
    check('the non-charter GS school shows only the GS badge', !info[1].ch && info[1].gs);
    check('the plain (no-CDS) school shows no badges', !info[2].ch && !info[2].gs);
    check('the imported ES label renders as the shared chip (data-lbl-id, label color)', (function () {
      const chip = E.sumRows()[0].querySelector('.sb-lbl-chip');
      return chip && chip.getAttribute('data-lbl-id') === 'lblES' && chip.textContent === 'ES' && /ef5350|239, 83, 80/.test(chip.style.background);
    })());
    // live: toggle MS onto school 1 from the label menu — the Summary chip appears with no refresh
    E.card().labels.open(1); await flush(60);
    const menu = () => d.querySelector('.sb-lbl-menu');
    $(menu().querySelector('[data-lbl-name="MS"]')).trigger('click'); await flush(1500);
    check('an immediate label toggle reaches the Summary live', E.sumInfo()[1].lbls.join(',') === 'MS', JSON.stringify(E.sumInfo()[1].lbls));
    $(menu().querySelector('[data-lbl-name="MS"]')).trigger('click'); await flush(1500);
    check('removing it clears the Summary chip live', E.sumInfo()[1].lbls.length === 0);
    // recolor ES — the Summary chip repaints with the new color
    $(menu().querySelector('[data-lbl-name="ES"] .sb-pod-circle')).trigger('click'); await flush(40);
    $([...d.querySelectorAll('.sb-pod-colors .sb-pod-color-opt')][5]).trigger('click'); await flush(1500);
    check('recoloring a label repaints the Summary chip live', (function () {
      const chip = E.sumRows()[0].querySelector('.sb-lbl-chip');
      return chip && /2196f3|33, 150, 243/.test(chip.style.background);
    })(), (E.sumRows()[0].querySelector('.sb-lbl-chip') || {}).style && E.sumRows()[0].querySelector('.sb-lbl-chip').style.background);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  /* ═══ Suite 4: guides WITHOUT an order overlay are untouched ═══ */
  await suite('no overlay \u2192 natural order everywhere (nothing changed for existing guides)', async () => {
    const E = await boot(); const { dom, W } = E;
    check('no overlay is present after a plain import', !((W._pgGuideDetails()['pg-001'] || {}).siteOrderByCal || {}).cal_a);
    check('separated tables render in array order', E.soloOrder().join(',') === '0,1,2');
    check('Summary rows render in array order with sequential identity numbers', E.sumInfo().map(r => r.num).join(',') === '1,2,3');
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1).join(''));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
