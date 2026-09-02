// t106_sb_labels.js — FOURTEENTH SPEC + the immediate-updates spec. Site Breakdown School Name
// cells show the Charter/GS badges (same builder as the School Search dropdown) and gain an
// Add/Manage Labels "…" menu mirroring the Add to Pod dropdown (search/create, color circles +
// picker with click-away close, hover Edit, inline editing with the duplicate-name validation).
// Selection is IMMEDIATE: clicking a label assigns/removes it on the spot (bold 800 = assigned),
// creation/rename/recolor apply instantly and rerender everywhere; the footer carries ONLY Close,
// which (like an outside click) simply closes — no Save, no Clear, no unsaved-changes dialog.
// Labels ride the school ROW: they follow drag/drop reordering, survive Undo, and round-trip
// JSON export/import. Definitions never materialize on render (peek).
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }

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

function pickSchools(W) {
  const SL = W._pgRef.allSchools();
  const ch = SL.find(s => String(s.charter || '').toUpperCase() === 'Y' && s.gs);
  const nc = SL.find(s => String(s.charter || '').toUpperCase() !== 'Y' && s.gs && s !== ch);
  return { ch, nc };
}
function baseData(ch, nc, extra) {
  const A = [{ school: ch.name, schoolCds: String(ch.cds), schoolAbbr: '', coaches_ctkk: 1, ctkk: 10 },
             { school: nc.name, schoolCds: String(nc.cds), schoolAbbr: '', coaches_ctkk: 1, ctkk: 10 }];
  if (extra && extra.blankRow) A.push({ school: '' });
  if (extra && extra.rowLabels) extra.rowLabels.forEach((ls, i) => { if (ls && A[i]) A[i].sbLabels = ls; });
  return Object.assign({
    status: 'Draft', combinedView: false,
    calendarRows: [{ name: 'CalA', firstDay: '2026-07-20', lastDay: '2026-07-31', color: '#e57373', pricePerHour: '80.00', billable: true, calId: 'cal_a' }],
    siteRows: A, siteRowsByCal: { cal_a: A },
    staffingOptsByCal: { cal_a: { bySchool: true, byPods: false, alternateWeeks: false } },
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } },
    roles: [{ key: 'ctkk', name: 'TK/K', isCoach: true, spc: 10 }]
  }, (extra && extra.data) || {});
}
const fx = (ch, nc, extra) => JSON.stringify({ type: 'planning-guide', guide: { id: 'pg-001', name: 'MA', status: 'Draft' }, data: baseData(ch, nc, extra) });

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const { ch, nc } = pickSchools(W);
  const det = () => W._pgGuideDetails()['pg-001'];
  const card = () => W._pgSbCards && W._pgSbCards['pg-001|cal_a'];
  const chips = () => [...d.querySelectorAll('.sb-name-chip')];
  const menu = () => d.querySelector('.sb-lbl-menu');

  // ── Suite 1: Part 1 badges + the always-visible "…" + the peek contract ─────────────────
  await suite('School Name cells: Charter/GS badges (search-dropdown builder), \u2026 trigger, no render-time defs', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    check('render does NOT materialize sbLabelsByCal (byte-clean exports)', det().sbLabelsByCal === undefined);
    const cs = chips();
    check('both selected-school name chips render', cs.length === 2, 'got ' + cs.length);
    check('the name is left-aligned and first (sb-name-txt)', !!cs[0].querySelector('.sb-name-txt') && cs[0].firstElementChild.classList.contains('sb-name-txt'));
    check('charter row shows the C circle badge', !!cs[0].querySelector('.pg-ch-badge'));
    check('charter row shows its GS badge', !!cs[0].querySelector('.pg-gs-badge'));
    check('non-charter row has NO C badge but a GS badge', !cs[1].querySelector('.pg-ch-badge') && !!cs[1].querySelector('.pg-gs-badge'));
    check('the \u2026 label trigger exists on every row, OUTSIDE the chip, styled like the action dots', (function(){
      const ds = [...d.querySelectorAll('.sb-lbl-dots')];
      return ds.length === 2 && ds.every(x => x.tagName === 'BUTTON' && x.style.width === '12px') && !d.querySelector('.sb-name-chip .sb-lbl-dots');
    })());
    check('badges sit AFTER the name (right side of the flex row)', (function () { const kids = [...cs[0].children]; return kids.indexOf(cs[0].querySelector('.pg-gs-badge')) > kids.indexOf(cs[0].querySelector('.sb-name-txt')); })());
  });

  // ── Suite 2: menu basics — title, seeded defaults, search filter, color popup ───────────
  await suite('Menu opens as Add Label with ES/MS/HS/TBD; search filters; the color circle opens the picker', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    card().labels.open(0); await flush(30);
    check('menu opened titled Add Label (no labels yet)', !!menu() && /Add Label/.test(menu().querySelector('.sb-lbl-title').textContent));
    const names = [...menu().querySelectorAll('.sb-lbl-item')].map(e => e.getAttribute('data-lbl-name'));
    check('defaults seeded in order ES,MS,HS,TBD', names.join(',') === 'ES,MS,HS,TBD', names.join(','));
    check('defs materialized only on this explicit open', Array.isArray(det().sbLabelsByCal && det().sbLabelsByCal.cal_a) && det().sbLabelsByCal.cal_a.length === 4);
    $(menu().querySelector('.sb-lbl-search')).val('M').trigger('input'); await flush(15);
    const filtered = [...menu().querySelectorAll('.sb-lbl-item')].map(e => e.getAttribute('data-lbl-name'));
    check('search "M" filters to the starts-with match (MS)', filtered.join(',') === 'MS', filtered.join(','));
    check('a non-exact query offers Create new', !!menu().querySelector('.sb-lbl-create'));
    $(menu().querySelector('.sb-lbl-search')).val('').trigger('input'); await flush(15);
    $(menu().querySelector('[data-lbl-name="ES"] .sb-pod-circle')).trigger('click'); await flush(20);
    check('clicking the color circle opens the pod-style color popup', !!d.querySelector('.sb-pod-colors.sb-lbl-colors'));
    check('the picker offers the 16-color grid', d.querySelectorAll('.sb-pod-colors .sb-pod-color-opt').length === 16);
    $('.pg-undo-snack').remove();
    $([...d.querySelectorAll('.sb-pod-colors .sb-pod-color-opt')][5]).trigger('click'); await flush(60);
    check('picking a color closes the popup and offers Undo', !d.querySelector('.sb-pod-colors') && !!d.querySelector('.pg-undo-snack'));
    check('the label def carries the new color', card().labels.defs().find(l => l.name === 'ES').color === '#2196f3');
    // ── immediate-updates spec: the picker closes on click-AWAY without changing the color ──
    $(menu().querySelector('[data-lbl-name="MS"] .sb-pod-circle')).trigger('click'); await flush(30);
    check('the picker reopens for another label', !!d.querySelector('.sb-pod-colors.sb-lbl-colors'));
    const msColor = card().labels.defs().find(l => l.name === 'MS').color;
    // click AWAY from the picker but INSIDE the menu (the title): only the picker closes. The
    // menu swallows its own bubbling mousedowns, so this exercises the capture-phase close.
    menu().querySelector('.sb-lbl-title').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); await flush(30);
    check('a click AWAY closes the picker', !d.querySelector('.sb-pod-colors.sb-lbl-colors'));
    check('click-away does NOT change the color', card().labels.defs().find(l => l.name === 'MS').color === msColor);
    check('click-away inside the menu leaves the menu itself open', !!menu());
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(20);
  });

  // ── Suite 3: IMMEDIATE selection — click assigns/removes on the spot, bold 800, chips live ──
  await suite('Selection applies IMMEDIATELY: click toggles + saves, bold 800, chips paint live, chip click reopens', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    card().labels.open(0); await flush(30);
    $('.pg-undo-snack').remove();
    $(menu().querySelector('[data-lbl-name="ES"]')).trigger('click'); await flush(80);
    check('clicked label goes bold 800 (assigned)', menu().querySelector('[data-lbl-name="ES"] .sb-lbl-name').style.fontWeight === '800');
    check('the assignment SAVED immediately (no Save step)', card().labels.assigned(0).length === 1);
    check('the toggle offers Undo', !!d.querySelector('.pg-undo-snack'));
    check('the cell chip painted LIVE while the menu is still open', [...chips()[0].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent).join(',') === 'ES');
    $(menu().querySelector('[data-lbl-name="MS"]')).trigger('click'); await flush(80);
    check('a second click adds the second label immediately', card().labels.assigned(0).length === 2);
    check('the cell shows the ES and MS chips inline', [...chips()[0].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent).join(',') === 'ES,MS');
    check('no Clear and no Save controls exist (Close-only footer)', !menu().querySelector('.sb-lbl-clear') && !menu().querySelector('.sb-lbl-save') && !menu().querySelector('.sb-lbl-cancel') && !!menu().querySelector('.sb-lbl-close'));
    $(menu().querySelector('[data-lbl-name="MS"]')).trigger('click'); await flush(80);
    check('clicking an assigned label REMOVES it immediately', card().labels.assigned(0).length === 1 && menu().querySelector('[data-lbl-name="MS"] .sb-lbl-name').style.fontWeight !== '800');
    check('the removed chip left the cell live', [...chips()[0].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent).join(',') === 'ES');
    $(menu().querySelector('[data-lbl-name="MS"]')).trigger('click'); await flush(80);
    check('re-clicking re-adds it', card().labels.assigned(0).length === 2);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    check('Close simply closes', !menu());
    check('both labels remain on the row after Close', card().labels.assigned(0).length === 2);
    check('the \u2026 trigger is still present after chips render', !!chips()[0].closest('.sb-name-cell').querySelector('.sb-lbl-dots'));
    const lc = [...chips()[0].querySelectorAll('.sb-lbl-chip')];
    check('label chips carry the label color background', !!lc[0].style.background);
    $(lc[0]).trigger('click'); await flush(30);
    check('clicking a saved chip reopens the menu as Manage Labels', !!menu() && /Manage Labels/.test(menu().querySelector('.sb-lbl-title').textContent));
    check('assigned labels open BOLD 800', menu().querySelector('[data-lbl-name="ES"] .sb-lbl-name').style.fontWeight === '800' && menu().querySelector('[data-lbl-name="HS"] .sb-lbl-name').style.fontWeight !== '800');
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
  });

  // ── Suite 4: Close and outside click simply close — no dialog, changes already applied ──
  await suite('Close and an outside click just close the menu; no unsaved-changes dialog exists', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="HS"]')).trigger('click'); await flush(80);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(25);
    check('Close after a toggle just closes — no dialog, the toggle stays applied', !menu() && !d.querySelector('.xs-ui') && card().labels.assigned(0).length === 1);
    card().labels.open(0); await flush(30);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
    check('Close with NO changes just closes (no dialog)', !menu() && !d.querySelector('.xs-ui'));
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="TBD"]')).trigger('click'); await flush(80);
    check('the toggle applied while the menu is open', card().labels.assigned(0).length === 2);
    d.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); await flush(25);
    check('an OUTSIDE click closes the menu without any dialog', !menu() && !d.querySelector('.xs-ui'));
    check('everything toggled so far remains applied', card().labels.assigned(0).length === 2);
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="TBD"]')).trigger('click'); await flush(80);
    $(menu().querySelector('[data-lbl-name="HS"]')).trigger('click'); await flush(80);
    check('toggling back removes both immediately', card().labels.assigned(0).length === 0);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
  });

  // ── Suite 5: create / duplicate-validation / rename / delete ────────────────────────────
  await suite('Search-create, duplicate-name validation, rename propagation, delete strips every school', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    card().labels.open(0); await flush(30);
    $(menu().querySelector('.sb-lbl-search')).val('K8').trigger('input'); await flush(15);
    const cr = menu().querySelector('.sb-lbl-create');
    check('Create new (K8) offered for an unmatched query', !!cr && /Create new \(K8\)/.test(cr.textContent));
    $('.pg-undo-snack').remove();
    $(cr).trigger('click'); await flush(60);
    check('creating adds the definition immediately', card().labels.defs().some(l => l.name === 'K8'));
    check('the new label is ASSIGNED to this school immediately (bold 800)', card().labels.assigned(0).length === 1 && menu().querySelector('[data-lbl-name="K8"] .sb-lbl-name').style.fontWeight === '800');
    check('creating offers Undo', !!d.querySelector('.pg-undo-snack'));
    $(menu().querySelector('[data-lbl-name="ES"]')).trigger('click'); await flush(80);
    check('a further toggle applies immediately: K8 + ES on row 0', card().labels.assigned(0).length === 2);
    // rename with duplicate validation
    card().labels.open(0); await flush(30);
    const esRow = menu().querySelector('[data-lbl-name="ES"]');
    $(esRow).trigger('mouseenter'); await flush(10);
    check('hovering a label shows the Edit control', esRow.querySelector('.sb-lbl-edit').style.visibility === 'visible');
    $(esRow.querySelector('.sb-lbl-edit')).trigger('click'); await flush(20);
    const einp = menu().querySelector('.sb-lbl-edit-input');
    check('Edit converts the label into an inline text field with \u00d7 delete', !!einp && !!menu().querySelector('.sb-lbl-del'));
    $(einp).val('MS').trigger('input'); await flush(10);
    check('a duplicate name shows "A label with this name already exists."', menu().querySelector('.sb-lbl-edit-msg').style.display !== 'none');
    check('Update stays hidden on a duplicate', menu().querySelector('.sb-lbl-edit-update').style.display === 'none');
    $(einp).val('Elem').trigger('input'); await flush(10);
    check('a unique name clears the message and shows Update', menu().querySelector('.sb-lbl-edit-msg').style.display === 'none' && menu().querySelector('.sb-lbl-edit-update').style.display !== 'none');
    $(menu().querySelector('.sb-lbl-edit-update')).trigger('click'); await flush(60);
    check('the rename propagates to the saved cell chip', [...chips()[0].querySelectorAll('.sb-lbl-chip')].some(e => e.textContent === 'Elem'));
    // delete strips assignments everywhere
    const m2 = menu(); const elRow = m2.querySelector('[data-lbl-name="Elem"]');
    $(elRow).trigger('mouseenter'); $(elRow.querySelector('.sb-lbl-edit')).trigger('click'); await flush(20);
    $(menu().querySelector('.sb-lbl-del')).trigger('click'); await flush(25);
    const conf = d.querySelector('.pg-confirm-ov, .xs-ui');
    check('delete asks for confirmation', !!conf && /Delete/.test(conf.textContent));
    $([...conf.querySelectorAll('button')].find(b => /^Delete$/.test(b.textContent.trim()))).trigger('click'); await flush(60);
    check('the definition is gone', !card().labels.defs().some(l => l.name === 'Elem'));
    check('the assignment was stripped from the row (K8 remains)', card().labels.assigned(0).length === 1);
    check('the cell chip for the deleted label is gone', ![...chips()[0].querySelectorAll('.sb-lbl-chip')].some(e => e.textContent === 'Elem'));
    if (menu()) $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
  });

  // ── Suite 6: labels follow the SCHOOL through reorder + Undo + JSON round-trip ──────────
  await suite('Labels ride the school row: drag reorder, Undo, and an import carrying labels', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(600);
    // assign distinct labels to each school
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="ES"]')).trigger('click'); await flush(80);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    card().labels.open(1); await flush(30);
    $(menu().querySelector('[data-lbl-name="HS"]')).trigger('click'); await flush(80);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    const esId = card().labels.assigned(0)[0], hsId = card().labels.assigned(1)[0];
    check('two schools carry two different labels', !!esId && !!hsId && esId !== hsId);
    // reorder display: school 0 moves below school 1 — assignments stay on the TRUE row
    card().reorder(0, 1); await flush(200);
    check('display order flipped (second school first)', card().names()[0] === nc.name, card().names().join(' | '));
    check('labels stayed with their schools (true-index assignments unchanged)', card().labels.assigned(0)[0] === esId && card().labels.assigned(1)[0] === hsId);
    const dispChips = chips();
    check('the moved school still shows ITS chip (HS row now first shows HS)', [...dispChips[0].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent).join(',') === 'HS' && [...dispChips[1].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent).join(',') === 'ES');
    // the menu for the moved school reflects its own labels immediately
    card().labels.open(0); await flush(30);
    check('the moved school\u2019s menu shows its ES bold 800, HS not', menu().querySelector('[data-lbl-name="ES"] .sb-lbl-name').style.fontWeight === '800' && menu().querySelector('[data-lbl-name="HS"] .sb-lbl-name').style.fontWeight !== '800');
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
    // Undo the LAST toggle reverts that assignment
    $('.pg-undo-snack').remove();
    card().labels.open(1); await flush(30);
    $(menu().querySelector('[data-lbl-name="TBD"]')).trigger('click'); await flush(100);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    check('the immediate toggle added a label (2 on the school)', card().labels.assigned(1).length === 2);
    const snackBtn = d.querySelector('.pg-undo-snack button, .pg-undo-snack a');
    if (snackBtn) { $(snackBtn).trigger('click'); await flush(150); }
    check('Undo restored the prior single-label state', card().labels.assigned(1).length === 1 && card().labels.assigned(1)[0] === hsId);
    // JSON round-trip: an import that already carries defs + row labels applies on load
    const defs = [{ id: 'lbl_t1', name: 'ES', color: '#ef5350' }, { id: 'lbl_t2', name: 'Custom', color: '#2196f3' }];
    await importGuide(dom, c, fx(ch, nc, { data: { sbLabelsByCal: { cal_a: defs } }, rowLabels: [['lbl_t1', 'lbl_t2'], null] })); await flush(600);
    const rc = [...chips()[0].querySelectorAll('.sb-lbl-chip')].map(e => e.textContent);
    check('imported labels render as chips on load', rc.join(',') === 'ES,Custom', rc.join(','));
    card().labels.open(0); await flush(30);
    check('the imported assignments open BOLD 800 in Manage Labels', /Manage Labels/.test(menu().querySelector('.sb-lbl-title').textContent) && menu().querySelector('[data-lbl-name="Custom"] .sb-lbl-name').style.fontWeight === '800');
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(15);
  });

  // ── Suite 7 (fifteenth spec): dots on every row incl. unassigned; labels precede assignment;
  // clearing a school keeps the row's labels ────────────────────────────────────────────────
  await suite('The \u2026 works on unassigned rows; labels survive clearing the school', async () => {
    await importGuide(dom, c, fx(ch, nc, { blankRow: true })); await flush(600);
    const cells = () => [...d.querySelectorAll('.sb-name-cell')];
    check('three rows render, dots on ALL of them (blank row included)', cells().length === 3 && cells().every(td => !!td.querySelector('.sb-lbl-dots')));
    check('the blank row has an input, not a chip', !!cells()[2].querySelector('input') && !cells()[2].querySelector('.sb-name-chip'));
    $(cells()[2]).trigger('mouseenter'); await flush(15);
    check('hovering the cell reveals its dots (the action-dots pattern)', cells()[2].querySelector('.sb-lbl-dots').style.opacity === '1');
    // manage labels BEFORE a school is assigned
    card().labels.open(2); await flush(30);
    check('the menu opens for the unassigned row', !!menu());
    $(menu().querySelector('[data-lbl-name="TBD"]')).trigger('click'); await flush(100);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    check('a label saves on the unassigned row', card().labels.assigned(2).length === 1);
    check('the unassigned row DISPLAYS its chip beside the input', !!cells()[2].querySelector('.sb-cell-flex > .sb-lbl-chip') && !!cells()[2].querySelector('input'));
    // clearing an assigned school preserves its labels
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="ES"]')).trigger('click'); await flush(100);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    const kept = card().labels.assigned(0).slice();
    check('row 0 carries a label while assigned', kept.length === 1);
    const clr = [...cells()[0].querySelectorAll('.sb-name-chip span')].find(sp => sp.textContent === '\u00d7');
    $(clr).trigger('click'); await flush(450);
    check('clearing the school KEEPS the label assignment', JSON.stringify(card().labels.assigned(0)) === JSON.stringify(kept));
    check('the cleared row shows input + its chip + the dots', (function(){ const td = cells()[0]; return !!td.querySelector('input') && !!td.querySelector('.sb-lbl-chip') && !!td.querySelector('.sb-lbl-dots'); })());
  });

  // ── Suite 8 (sixteenth spec): labels SYNC into Staffing Allocation + Staffing Hours ───────
  await suite('Label changes propagate live to the Staffing Allocation strip and Hours popup header', async () => {
    await importGuide(dom, c, fx(ch, nc)); await flush(700);
    const allocNames = () => [...d.querySelectorAll('.sf-alloc-school-nm')];
    const chipsBy = (nameEl) => nameEl ? [...nameEl.parentElement.querySelectorAll('.sb-lbl-chip')].map(x => x.textContent) : ['<none>'];
    const row0Name = () => allocNames()[0];
    const row1Name = () => allocNames()[1];
    check('the Staffing Allocation strip renders both school names', allocNames().length === 2, 'got ' + allocNames().length);
    check('no label chips on the strip before assignment', chipsBy(row0Name()).length === 0 && chipsBy(row1Name()).length === 0);
    // assign ES to row 0 — the immediate toggle syncs the strip with the menu still open
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="ES"]')).trigger('click'); await flush(250);
    check('the strip shows the ES chip on row 0 live (menu still open, no Save)', chipsBy(row0Name()).join(',') === 'ES', chipsBy(row0Name()).join(','));
    check('row 1 stays chip-free (labels are row-scoped)', chipsBy(row1Name()).length === 0);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    // the Staffing Hours popup header carries it too
    $(row0Name()).trigger('click'); await flush(80);
    const ttl = d.querySelector('.sf-sh-popup-ttl');
    check('the Staffing Hours popup header shows the ES chip', !!ttl && [...ttl.parentElement.querySelectorAll('.sb-lbl-chip')].some(x => x.textContent === 'ES'));
    const px = d.querySelector('.sf-sh-popup-x'); if (px) { $(px).trigger('click'); await flush(30); }
    // rename ES -> Elementary propagates to the strip chip live
    card().labels.open(0); await flush(30);
    const esRow = menu().querySelector('[data-lbl-name="ES"]');
    $(esRow).trigger('mouseenter'); $(esRow.querySelector('.sb-lbl-edit')).trigger('click'); await flush(20);
    $(menu().querySelector('.sb-lbl-edit-input')).val('Elementary').trigger('input'); await flush(10);
    $(menu().querySelector('.sb-lbl-edit-update')).trigger('click'); await flush(250);
    check('renaming the label updates the strip chip live', chipsBy(row0Name()).join(',') === 'Elementary', chipsBy(row0Name()).join(','));
    // removing the label clears the strip chip live
    card().labels.open(0); await flush(30);
    $(menu().querySelector('[data-lbl-name="Elementary"]')).trigger('click'); await flush(250);
    check('removing the label clears the strip chip live', chipsBy(row0Name()).length === 0);
    $(menu().querySelector('.sb-lbl-close')).trigger('click'); await flush(30);
    // an import already carrying labels shows them on the strip on load
    const defs = [{ id: 'lbl_s1', name: 'HS', color: '#8e44ad' }];
    await importGuide(dom, c, fx(ch, nc, { data: { sbLabelsByCal: { cal_a: defs } }, rowLabels: [['lbl_s1'], null] })); await flush(700);
    check('imported labels render on the Staffing strip at load', chipsBy(allocNames()[0]).join(',') === 'HS', chipsBy(allocNames()[0]).join(','));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
})();
