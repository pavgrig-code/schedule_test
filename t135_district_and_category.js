// t135_district_and_category.js — District search + District Category are INDEPENDENT controls that
// must both stay fully functional. This suite regression-tests: District focus/open, filtering,
// selection (short AND long names), clearing and re-opening; District Category search, selection,
// colour pill + "x" clear, dropdown spacing, constant width; that using one control never moves,
// resizes or breaks the other; the State/District/Category single-row layout; and a STRUCTURAL guard
// against the clipping bug (an overflow:hidden ancestor hides the absolutely-positioned district
// dropdown in a browser even though jsdom, which does no clipping, would never notice).
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

let pass = 0, fail = 0, suites = 0;
function check(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + name + (extra != null ? '  \u2014 ' + extra : '')); } }
async function suite(name, fn) { suites++; console.log('\u2500 ' + name); try { await fn(); } catch (e) { fail++; console.log('  SUITE THREW: ' + (e && e.stack || e)); } }
function mkTimes(s, e) { const o = {}; ['mon','tue','wed','thu','fri'].forEach(k => o[k] = { start: s, end: e }); return o; }
function fixture(extra) {
  const data = Object.assign({
    status: 'Draft', state: 'CA',
    calendarRows: [{ name: 'CalA', calId: 'cal_a', firstDay: '2026-07-06', lastDay: '2026-08-14', color: '#e57373', pricePerHour: '80.00', billable: true }],
    roles: [{ key: 'ctkk', name: 'Coaches', isCoach: true, spc: 10 }],
    siteRowsByCal: { cal_a: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }] },
    siteRows: [{ school: 'Lincoln', schoolId: 's1', coaches_ctkk: 2, ctkk: 20 }],
    staffingHoursSlots: { c0: { ctkk: mkTimes('09:00', '15:00') } }
  }, extra || {});
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
  cap.dispatchEvent(new W.Event('change')); await flush(2400); d.createElement = ocr;
}

(async () => {
  const dom = bootApp(); const W = dom.window; const c = ctx(dom); const { d, $ } = c;
  await whenReady(dom); await flush(400);
  const pl = () => d.getElementById('planning-panel');
  const lbl = (t) => [...pl().querySelectorAll('div.text-uppercase')].find(x => x.textContent.trim() === t);
  const field = (t) => lbl(t) && lbl(t).parentElement;
  const distInp = () => field('District') && field('District').querySelector('input.form-control');
  const distDd = () => pl().querySelector('.pg-dist-dd');
  const distItems = () => distDd() ? [...distDd().querySelectorAll('button')] : [];
  const distChip = () => field('District') && field('District').querySelector('.rounded-pill');
  const ddShown = () => !!distDd() && distDd().style.display !== 'none' && distItems().length > 0;
  const md = (el) => el.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const catInp = () => pl().querySelector('.pg-cat-input');
  const catPill = () => pl().querySelector('.pg-cat-pill');
  const catOpts = () => [...pl().querySelectorAll('.pg-cat-opt')];
  const pickCat = (v) => { const o = catOpts().find(x => x.getAttribute('data-cat') === v); md(o); };
  const styles = () => ({ state: field('State').getAttribute('style'), dist: field('District').getAttribute('style'), cat: field('District Category').getAttribute('style') });
  const geoRow = () => { let r = lbl('State'); while (r && r !== pl() && !/display:\s*flex/.test(r.getAttribute('style') || '')) r = r.parentElement; return r; };
  // an ancestor with overflow:hidden between an absolutely-positioned dropdown and the panel would clip it in a browser
  const clippingAncestors = (el) => { const out = []; let n = el; while (n && n !== pl()) { const st = (n.getAttribute && n.getAttribute('style')) || ''; if (/overflow(-x|-y)?:\s*hidden/.test(st)) out.push(n.tagName + '[' + st.slice(0, 60) + ']'); n = n.parentElement; } return out; };

  /* ═══ 1. District search: focus opens the dropdown with results; nothing clips it ═══ */
  await suite('District search: clicking into the field opens the dropdown with district results (and nothing can clip it)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('the District search input exists', !!distInp());
    $(distInp()).trigger('focus'); await flush(300);
    check('focusing the field OPENS the dropdown', !!distDd() && distDd().style.display !== 'none', distDd() && distDd().style.display);
    check('the dropdown lists district results', distItems().length > 0, distItems().length);
    const clips = clippingAncestors(distDd());
    check('NO ancestor between the dropdown and the panel has overflow:hidden (would clip the absolute dropdown in a browser)', clips.length === 0, clips.join(' | '));
    check('the District field itself carries no overflow:hidden', !/overflow(-x|-y)?:\s*hidden/.test(field('District').getAttribute('style') || ''), field('District').getAttribute('style'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 2. District search: filtering, selecting a LONG name, clearing, re-opening, selecting a SHORT name ═══ */
  await suite('District search: filters, selects a long-named district, clears, re-opens, and selects a short-named one', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    $(distInp()).trigger('focus'); await flush(250);
    const all = distItems().length;
    $(distInp()).val('Alameda').trigger('input'); await flush(400);
    const filtered = distItems();
    check('typing narrows the results', filtered.length > 0 && filtered.length < all, filtered.length + ' of ' + all);
    check('every result matches the query by name, abbreviation, or county', filtered.length > 0 && filtered.some(b => /alameda/i.test(b.textContent)));
    // LONG name
    const longItem = filtered.find(b => /County Office of Education/i.test(b.textContent)) || filtered[0];
    const longName = longItem.textContent.replace(/\s+/g, ' ').trim();
    md(longItem); await flush(300);
    check('selecting a district shows the selected chip (rounded pill)', !!distChip() && distChip().classList.contains('rounded-pill'));
    check('the chip carries the long district name', !!distChip() && /Office of Education/i.test(distChip().textContent), distChip() && distChip().textContent);
    check('the selection is stored (det.district)', !!(W._pgGuideDetails()['pg-001'].district && W._pgGuideDetails()['pg-001'].district.name));
    // the long name is constrained INSIDE the field (ellipsis) rather than overflowing
    const nameSpan = [...distChip().querySelectorAll('span')].find(s => /Office of Education/i.test(s.textContent));
    check('the long name span ellipsizes (overflow hidden + text-overflow ellipsis + min-width 0)', !!nameSpan && /hidden/.test(nameSpan.style.overflow) && /ellipsis/.test(nameSpan.style.textOverflow) && nameSpan.style.minWidth === '0px', nameSpan && nameSpan.getAttribute('style'));
    check('the chip is capped to the field (max-width:100%)', distChip().style.maxWidth === '100%', distChip().style.maxWidth);
    // clear
    $(distChip().querySelector('button')).trigger('click'); await flush(300);
    check('clicking the chip "x" clears the district and restores the search input', !distChip() && !!distInp() && !W._pgGuideDetails()['pg-001'].district);
    // re-open
    $(distInp()).trigger('focus'); await flush(300);
    check('the dropdown opens again after clearing', ddShown(), distItems().length);
    // SHORT name
    $(distInp()).val('Alameda Unified').trigger('input'); await flush(400);
    const shortItem = distItems()[0];
    md(shortItem); await flush(300);
    check('a short-named district selects into the chip', !!distChip() && /Unified/i.test(distChip().textContent), distChip() && distChip().textContent);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 3. District Category: content-based constant width, search, spacing, select, pill, clear ═══ */
  await suite('District Category: content-based constant width, dropdown spacing, colour pill + x, clear', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const cf = field('District Category');
    check('the category field is content-based (flex:0 0 auto, no reserved fixed width)', /flex:\s*0 0 auto/.test(cf.getAttribute('style') || ''), cf.getAttribute('style'));
    check('the search input has a content width (not stretched to 100%)', catInp().style.width !== '100%' && parseInt(catInp().style.width, 10) > 0, catInp().style.width);
    $(catInp()).trigger('focus'); await flush(200);
    const opts = catOpts();
    check('the dropdown shows exactly Renewal/Expansion and New', opts.map(o => o.getAttribute('data-cat')).sort().join('|') === 'New|Renewal/Expansion', opts.map(o => o.getAttribute('data-cat')).join(','));
    check('each option is a centered flex row that does not wrap', opts.every(o => /flex/.test(o.style.display) && o.style.alignItems === 'center' && o.style.whiteSpace === 'nowrap'));
    check('each option has clear right-side padding (>= 24px, >= left)', opts.every(o => { const p = (o.style.padding || '').match(/(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/); return p && parseInt(p[2], 10) >= 24 && parseInt(p[2], 10) >= parseInt(p[4], 10); }), opts[0] && opts[0].style.padding);
    check('each option carries a colour swatch before its label', opts.every(o => o.querySelector('span') && /border-radius:\s*50%/.test(o.querySelector('span').getAttribute('style') || '')));
    pickCat('Renewal/Expansion'); await flush(250);
    check('selecting shows a rounded pill with the category text', !!catPill() && catPill().classList.contains('rounded-pill') && /Renewal\/Expansion/.test(catPill().textContent));
    check('the Renewal/Expansion pill is blue with readable dark text', /rgb\(215,\s*235,\s*255\)/.test(catPill().style.background) && !!catPill().style.color, catPill().style.background);
    check('the pill fits INSIDE the field (max-width:100%, border-box)', catPill().style.maxWidth === '100%' && catPill().style.boxSizing === 'border-box');
    check('the pill has an "x" remove button', !!pl().querySelector('.pg-cat-clear'));
    check('the field flex style is unchanged while the pill is shown (still content-based)', /flex:\s*0 0 auto/.test(cf.getAttribute('style') || ''));
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(250);
    check('"x" clears the category and returns to the search input', !catPill() && !!catInp() && !W._pgGuideDetails()['pg-001'].districtCategory);
    $(catInp()).trigger('focus'); await flush(200);
    pickCat('New'); await flush(250);
    check('New selects into an amber pill (distinct colour)', !!catPill() && /rgb\(255,\s*230,\s*199\)/.test(catPill().style.background), catPill() && catPill().style.background);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 4. Independence: neither control moves, resizes, or breaks the other (short + long names) ═══ */
  await suite('Independence: using either control never moves, resizes, or breaks the other (short and long district names)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const base = styles();
    // select a LONG district
    $(distInp()).trigger('focus'); await flush(250);
    $(distInp()).val('Alameda').trigger('input'); await flush(400);
    md(distItems().find(b => /County Office of Education/i.test(b.textContent)) || distItems()[0]); await flush(300);
    let s1 = styles();
    check('selecting a LONG district leaves the District Category field style unchanged', s1.cat === base.cat, s1.cat);
    check('and the State field unchanged', s1.state === base.state);
    check('the category search input still works after the district selection', !!catInp());
    // now select a category
    $(catInp()).trigger('focus'); await flush(200); pickCat('New'); await flush(250);
    let s2 = styles();
    check('selecting a category leaves the District field style unchanged (no shift / resize)', s2.dist === s1.dist, s2.dist);
    check('and the category field width is unchanged', s2.cat === base.cat);
    check('the LONG district chip is still present and intact', !!distChip() && /Office of Education/i.test(distChip().textContent));
    // clear the category -> district untouched
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(250);
    let s3 = styles();
    check('clearing the category leaves the District field style unchanged', s3.dist === s1.dist);
    check('and the district chip still present', !!distChip());
    // clear the district -> category untouched
    $(distChip().querySelector('button')).trigger('click'); await flush(300);
    let s4 = styles();
    check('clearing the district leaves the category field style unchanged', s4.cat === base.cat);
    // SHORT district + category, both directions
    $(distInp()).trigger('focus'); await flush(250);
    $(distInp()).val('Alameda Unified').trigger('input'); await flush(400);
    md(distItems()[0]); await flush(300);
    $(catInp()).trigger('focus'); await flush(200); pickCat('Renewal/Expansion'); await flush(250);
    let s5 = styles();
    check('short district + Renewal category: all three field styles equal the baseline', s5.state === base.state && s5.dist === base.dist && s5.cat === base.cat, JSON.stringify(s5).slice(0, 160));
    check('both selections are present together', !!distChip() && /Unified/i.test(distChip().textContent) && !!catPill() && /Renewal/.test(catPill().textContent));
    // district search still opens while a category is selected
    $(distChip().querySelector('button')).trigger('click'); await flush(300);
    $(distInp()).trigger('focus'); await flush(300);
    check('the district dropdown still opens while a category pill is shown', ddShown() && !!catPill(), distItems().length);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 5. Row layout: State, District, District Category stay on one row in every state ═══ */
  await suite('Layout: State, District and District Category stay on ONE row in every combination of states', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const onOneRow = () => { const r = geoRow(); return !!r && /flex-wrap:\s*nowrap/.test(r.getAttribute('style') || '') && r.contains(lbl('State')) && r.contains(lbl('District')) && r.contains(lbl('District Category')); };
    check('empty/empty: one nowrap row holds all three', onOneRow());
    $(distInp()).trigger('focus'); await flush(250); $(distInp()).val('Alameda').trigger('input'); await flush(400);
    md(distItems().find(b => /County Office of Education/i.test(b.textContent)) || distItems()[0]); await flush(300);
    check('long district / empty category: still one row', onOneRow());
    $(catInp()).trigger('focus'); await flush(200); pickCat('Renewal/Expansion'); await flush(250);
    check('long district / Renewal category: still one row', onOneRow());
    check('the District field is width-bounded (min 280 / max 500) so a long name is contained by the chip, not the row', /min-width:\s*280px/.test(field('District').getAttribute('style') || '') && /max-width:\s*500px/.test(field('District').getAttribute('style') || ''), field('District').getAttribute('style'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 6. Loading a guide that already has a district + category renders both, and both stay editable ═══ */
  await suite('A guide loaded with a district and a category renders both chips, and both controls remain usable', async () => {
    await importGuide(dom, c, fixture({ district: { cds: '01100170000000', name: 'Alameda County Office of Education', abbr: 'ACOE', county: 'Alameda County', state: 'CA' }, districtCategory: 'New' })); await flush(600);
    check('the stored district renders as a chip', !!distChip() && /ACOE/.test(distChip().textContent), distChip() && distChip().textContent);
    check('the stored category renders as its amber pill', !!catPill() && /New/.test(catPill().textContent) && /rgb\(255,\s*230,\s*199\)/.test(catPill().style.background));
    check('they sit on one row', /flex-wrap:\s*nowrap/.test(geoRow().getAttribute('style') || ''));
    // clear both and re-search both
    $(distChip().querySelector('button')).trigger('click'); await flush(300);
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(250);
    $(distInp()).trigger('focus'); await flush(300);
    check('after clearing both, the district dropdown opens', ddShown());
    $(catInp()).trigger('focus'); await flush(200);
    check('and the category dropdown opens with its two options', catOpts().length === 2);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  // ── Service Category helpers (same pattern as District Category, cls 'pg-svc') ──
  const svcInp = () => pl().querySelector('.pg-svc-input');
  const svcPill = () => pl().querySelector('.pg-svc-pill');
  const svcOpts = () => [...pl().querySelectorAll('.pg-svc-opt')];
  const pickSvc = (v) => { const o = svcOpts().find(x => x.getAttribute('data-cat') === v); md(o); };
  const SVC_VALS = ['Category 1: Core Offerings', 'Category 2: Flexible Offerings', 'Category 3: Innovation & Pilots'];

  /* ═══ 7. District field width per spec (280–500px); search still works ═══ */
  await suite('The District field uses min-width 280px / max-width 500px and still searches/selects', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const st = field('District').getAttribute('style') || '';
    check('the District field min-width is 280px', /min-width:\s*280px/.test(st), st);
    check('the District field max-width is 500px', /max-width:\s*500px/.test(st), st);
    check('it is content-based (flex:0 1 auto, shrink-only, does not grow to reserve row space)', /flex:\s*0 1 auto/.test(st), st);
    $(distInp()).trigger('focus'); await flush(300);
    check('the district dropdown still opens', ddShown());
    $(distInp()).val('Alameda').trigger('input'); await flush(400);
    md(distItems().find(b => /County Office of Education/i.test(b.textContent)) || distItems()[0]); await flush(300);
    check('a district still selects into a chip', !!distChip());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 8. Service Category: four-control row, three coloured options, pill + x, constant width ═══ */
  await suite('Service Category joins the row as a search/pill control with three distinctly-coloured options', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    check('a Service Category field exists on the same row as State/District/District Category', !!field('Service Category') && (function () { let r = lbl('State'); while (r && r !== pl() && !/display:\s*flex/.test(r.getAttribute('style') || '')) r = r.parentElement; return r && r.contains(lbl('Service Category')) && r.contains(lbl('District Category')) && r.contains(lbl('District')); })());
    // order: State, District, District Category, Service Category
    const ord = (a, b) => !!(lbl(a).compareDocumentPosition(lbl(b)) & 4);
    check('the four controls read State → District → District Category → Service Category', ord('State', 'District') && ord('District', 'District Category') && ord('District Category', 'Service Category'));
    const cf = field('Service Category');
    check('the Service Category field is content-based (flex:0 0 auto, no reserved fixed width)', /flex:\s*0 0 auto/.test(cf.getAttribute('style') || ''), cf.getAttribute('style'));
    $(svcInp()).trigger('focus'); await flush(200);
    const opts = svcOpts();
    check('it offers exactly the three specified options', opts.map(o => o.getAttribute('data-cat')).join('|') === SVC_VALS.join('|'), opts.map(o => o.getAttribute('data-cat')).join(' | '));
    // three distinct swatch colours
    const sw = opts.map(o => o.querySelector('span').style.background);
    check('each option has its own distinct colour', new Set(sw).size === 3, sw.join(' | '));
    check('each option is a nowrap flex row with right padding + a swatch', opts.every(o => /flex/.test(o.style.display) && o.style.whiteSpace === 'nowrap' && /border-radius:\s*50%/.test(o.querySelector('span').getAttribute('style') || '')));
    // select Category 2 -> pill colour equals the option swatch colour
    const opt2 = opts.find(o => /Category 2/.test(o.getAttribute('data-cat')));
    const opt2bg = opt2.querySelector('span').style.background;
    md(opt2); await flush(250);
    check('selecting shows a rounded pill in the same style as District Category', !!svcPill() && svcPill().classList.contains('rounded-pill') && /Category 2/.test(svcPill().textContent));
    check('the pill colour matches the option swatch colour (same colour in both places)', svcPill().style.background === opt2bg, svcPill().style.background + ' vs ' + opt2bg);
    check('the pill is capped to the field (max-width:100%, border-box)', svcPill().style.maxWidth === '100%' && svcPill().style.boxSizing === 'border-box');
    check('the pill has an "x" clear control', !!pl().querySelector('.pg-svc-clear'));
    check('the field flex style is unchanged while the pill is shown (still content-based)', /flex:\s*0 0 auto/.test(cf.getAttribute('style') || ''));
    $(pl().querySelector('.pg-svc-clear')).trigger('click'); await flush(250);
    check('clearing returns to the searchable input', !svcPill() && !!svcInp() && !W._pgGuideDetails()['pg-001'].serviceCategory);
    $(svcInp()).trigger('focus'); await flush(200); pickSvc('Category 3: Innovation & Pilots'); await flush(250);
    check('Category 3 selects into its own distinct-coloured pill', !!svcPill() && /Innovation/.test(svcPill().textContent), svcPill() && svcPill().style.background);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 9. Independence of all FOUR controls (District search never disturbed) ═══ */
  await suite('District, District Category and Service Category are independent — none moves, resizes, or breaks another', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const styles4 = () => ({ state: field('State').getAttribute('style'), dist: field('District').getAttribute('style'), cat: field('District Category').getAttribute('style'), svc: field('Service Category').getAttribute('style') });
    const base = styles4();
    // select a LONG district
    $(distInp()).trigger('focus'); await flush(250); $(distInp()).val('Alameda').trigger('input'); await flush(400);
    md(distItems().find(b => /County Office of Education/i.test(b.textContent)) || distItems()[0]); await flush(300);
    let s1 = styles4();
    check('selecting a long district leaves District Category AND Service Category field styles unchanged', s1.cat === base.cat && s1.svc === base.svc);
    // select Service Category
    $(svcInp()).trigger('focus'); await flush(200); pickSvc('Category 1: Core Offerings'); await flush(250);
    let s2 = styles4();
    check('selecting Service Category leaves District and District Category styles unchanged', s2.dist === s1.dist && s2.cat === base.cat, s2.dist);
    check('the long district chip is still intact', !!distChip() && /Office of Education/i.test(distChip().textContent));
    // select District Category
    $(catInp()).trigger('focus'); await flush(200); const catNew = catOpts().find(o => o.getAttribute('data-cat') === 'New'); md(catNew); await flush(250);
    let s3 = styles4();
    check('selecting District Category leaves District and Service Category styles unchanged', s3.dist === s1.dist && s3.svc === s2.svc);
    check('all three pills/chips coexist (district + district-category + service-category)', !!distChip() && !!catPill() && !!svcPill());
    // the district search still opens with both category pills set
    $(distChip().querySelector('button')).trigger('click'); await flush(300);
    $(distInp()).trigger('focus'); await flush(300);
    check('district search still opens while both category pills are shown', ddShown() && !!catPill() && !!svcPill());
    // clearing each category returns the District styles to baseline
    $(pl().querySelector('.pg-svc-clear')).trigger('click'); await flush(200);
    $(pl().querySelector('.pg-cat-clear')).trigger('click'); await flush(200);
    let s4 = styles4();
    check('after clearing both categories, District/State field styles are back to baseline', s4.dist === base.dist && s4.state === base.state && s4.cat === base.cat && s4.svc === base.svc);
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  const statePill = () => pl().querySelector('.pg-state-pill');
  const stateInp = () => pl().querySelector('.pg-state-input');
  const stateOpts = () => [...pl().querySelectorAll('.pg-state-opt')];
  const openStateSearch = async () => { const clr = pl().querySelector('.pg-state-clear'); if (clr) { $(clr).trigger('click'); await flush(250); } $(stateInp()).trigger('focus'); await flush(200); };
  const pickState = async (nm) => { await openStateSearch(); const o = stateOpts().find(x => new RegExp(nm, 'i').test(x.textContent)); md(o); await flush(300); };

  /* ═══ 10. State is a search/pill control with exactly California + Texas, x clear, one row ═══ */
  await suite('State is a searchable dropdown (California, Texas) with a selected pill + "x" clear', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    // fixture sets state CA -> renders as a pill
    check('a state pill shows the selected State (California)', !!statePill() && /California/.test(statePill().textContent), statePill() && statePill().textContent);
    check('the pill has an "x" clear control', !!pl().querySelector('.pg-state-clear'));
    // clear -> searchable input
    $(pl().querySelector('.pg-state-clear')).trigger('click'); await flush(250);
    check('clearing returns to a searchable input', !statePill() && !!stateInp() && !W._pgGuideDetails()['pg-001'].state);
    $(stateInp()).trigger('focus'); await flush(200);
    check('the dropdown offers exactly California and Texas', stateOpts().map(o => o.getAttribute('data-state')).sort().join('|') === 'CA|TX', stateOpts().map(o => o.getAttribute('data-state')).join(','));
    // search + select Texas
    stateInp().value = 'tex'; $(stateInp()).trigger('input'); await flush(200);
    check('typing "tex" filters to Texas', stateOpts().length === 1 && stateOpts()[0].getAttribute('data-state') === 'TX', stateOpts().map(o => o.getAttribute('data-state')).join(','));
    md(stateOpts()[0]); await flush(300);
    check('selecting Texas shows a Texas pill and stores TX', !!statePill() && /Texas/.test(statePill().textContent) && W._pgGuideDetails()['pg-001'].state === 'TX', statePill() && statePill().textContent);
    check('the pill uses the same rounded style as the other controls', statePill().classList.contains('rounded-pill') && statePill().style.maxWidth === '100%');
    // State sits on the same row, first, before District/DistCat/SvcCat
    let row = lbl('State'); while (row && row !== pl() && !/display:\s*flex/.test(row.getAttribute('style') || '')) row = row.parentElement;
    check('State, District, District Category and Service Category share one row', !!row && /flex-wrap:\s*nowrap/.test(row.getAttribute('style') || '') && row.contains(lbl('District')) && row.contains(lbl('District Category')) && row.contains(lbl('Service Category')));
    const ord = (a, b) => !!(lbl(a).compareDocumentPosition(lbl(b)) & 4);
    check('the order is State → District → District Category → Service Category', ord('State', 'District') && ord('District', 'District Category') && ord('District Category', 'Service Category'));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 11. Changing State never breaks District / District Category / Service Category ═══ */
  await suite('Changing State does not break or shift District, District Category, or Service Category', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const st1 = (t) => { const f = field(t); return f ? f.getAttribute('style') : ('(missing:' + t + ')'); };
    const styles = () => ({ dist: st1('District'), cat: st1('District Category'), svc: st1('Service Category') });
    // set a district (CA) + both categories
    $(distInp()).trigger('focus'); await flush(250); $(distInp()).val('Alameda').trigger('input'); await flush(400);
    md(distItems().find(b => /County Office of Education/i.test(b.textContent)) || distItems()[0]); await flush(300);
    $(catInp()).trigger('focus'); await flush(200); pickCat('New'); await flush(250);
    $(svcInp()).trigger('focus'); await flush(200); pickSvc('Category 1: Core Offerings'); await flush(250);
    const base = styles();
    check('district + both category pills are set', !!distChip() && !!catPill() && !!svcPill());
    // clear the State -> categories untouched, district field style unchanged
    $(pl().querySelector('.pg-state-clear')).trigger('click'); await flush(250);
    const s1 = styles();
    check('clearing State leaves the District Category + Service Category field styles unchanged', s1.cat === base.cat && s1.svc === base.svc);
    check('and both category pills survive a State clear', !!catPill() && !!svcPill());
    check('the District field style is unchanged by the State clear', s1.dist === base.dist, 'base=[' + base.dist + '] now=[' + s1.dist + ']');
    // re-select California -> district search works again, categories still intact
    await pickState('California');
    const s2 = styles();
    check('re-selecting California leaves all three field styles at baseline', s2.dist === base.dist && s2.cat === base.cat && s2.svc === base.svc, 'dist base=[' + base.dist + '] now=[' + s2.dist + ']');
    $(distInp()).trigger('focus'); await flush(250);
    check('District search opens again under California', ddShown(), 'dd=' + (distDd() ? distDd().style.display : 'none') + ' items=' + distItems().length);
    check('the category pills are still present and intact', !!catPill() && !!svcPill());
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  /* ═══ 12. All four controls are content-based (no reserved fixed width); short values leave no gap ═══ */
  await suite('State, District, District Category and Service Category are content-based (no wasted horizontal space)', async () => {
    await importGuide(dom, c, fixture()); await flush(600);
    const style = (t) => (field(t).getAttribute('style') || '');
    // State + both categories: flex:0 0 auto (size to content, do not grow or reserve fixed px)
    check('the State field is content-based (flex:0 0 auto)', /flex:\s*0 0 auto/.test(style('State')), style('State'));
    check('the District Category field is content-based (flex:0 0 auto)', /flex:\s*0 0 auto/.test(style('District Category')), style('District Category'));
    check('the Service Category field is content-based (flex:0 0 auto)', /flex:\s*0 0 auto/.test(style('Service Category')), style('Service Category'));
    // none of the category fields reserve a fixed pixel width
    check('no category field pins a fixed width/min-width/max-width', !/width:\s*\d+px/.test(style('District Category')) && !/width:\s*\d+px/.test(style('Service Category')));
    // District: shrink-only (does not grow to fill/reserve the row), bounded 280-500
    check('the District field is shrink-only (flex:0 1 auto), so it does not grow to reserve row space', /flex:\s*0 1 auto/.test(style('District')), style('District'));
    // comfortable spacing preserved on the row
    let row = lbl('State'); while (row && row !== pl() && !/display:\s*flex/.test(row.getAttribute('style') || '')) row = row.parentElement;
    check('the row keeps comfortable spacing between controls (gap)', /gap:\s*16px/.test(row.getAttribute('style') || '') || parseInt(row.style.gap, 10) >= 12, row.style.gap);
    // short value 'New' -> the category field's flex is unchanged (content-based), so no reserved gap
    $(catInp()).trigger('focus'); await flush(150); pickCat('New'); await flush(250);
    check('selecting a SHORT value (New) keeps the field content-based (no reserved width -> no big gap)', /flex:\s*0 0 auto/.test(style('District Category')) && !/width:\s*\d+px/.test(style('District Category')));
    check('and the neighbouring Service Category field flex is unchanged', /flex:\s*0 0 auto/.test(style('Service Category')));
    // long value expands its OWN control; the search input is content-width (not 100%)
    $(svcInp()).trigger('focus'); await flush(150); pickSvc('Category 3: Innovation & Pilots'); await flush(250);
    check('a LONG value (Category 3: Innovation & Pilots) still lives in its own field (content-based)', /flex:\s*0 0 auto/.test(style('Service Category')) && /Innovation/.test(svcPill().textContent));
    check('no page errors', dom.pageErrors.length === 0, dom.pageErrors.slice(0, 1));
  });

  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks across ' + suites + ' suites');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
