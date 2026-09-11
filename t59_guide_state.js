'use strict';
/* Suite 59: Planning Guide State selector.
 * A compact searchable State field (California/Texas) sits immediately before District in the same
 * wrapping row of the detail card. Saved as the abbreviation ('CA'/'TX') in the guide details; missing
 * or unknown values default to California, so older guides need no migration. Locked mode shows the
 * saved state as plain text. The placeholder contract: selecting Texas does not filter or reset
 * District/School yet — the value is structured for that future support. */
const { bootApp, flush, whenReady } = require('./harness');
const { ctx, clickGuide, setMode } = require('./testutil');

const results = { suites: [] };
let _cur = null;
function suiteAsync(name, fn) {
  _cur = { name, checks: [], fail: 0 };
  results.suites.push(_cur);
  const t0 = Date.now();
  return Promise.resolve().then(fn).then(() => { _cur._ms = Date.now() - t0; }, e => {
    _cur.fail++; _cur.threw = String(e && e.stack || e); _cur._ms = Date.now() - t0;
  });
}
function check(label, cond, detail) {
  const ok = !!cond; if (!ok) _cur.fail++;
  _cur.checks.push({ label, ok, detail });
}
function report() {
  let pass = 0, fail = 0, n = 0, lines = [];
  for (const s of results.suites) {
    const sp = s.checks.filter(c => c.ok).length, sf = s.checks.length - sp;
    pass += sp; fail += sf; n += s.checks.length;
    if (sf || s.threw) { lines.push('[FAIL] ' + s.name + (s.threw ? ' THREW ' + s.threw.split('\n')[0] : '')); s.checks.filter(c => !c.ok).forEach(c => lines.push('   \u2717 ' + c.label + '  \u2014 ' + (c.detail || ''))); }
    else lines.push('[ OK ] ' + s.name + '  (' + sp + '/' + s.checks.length + ' checks, ' + s._ms + 'ms)');
  }
  lines.push('TOTAL: ' + pass + ' passed, ' + fail + ' failed, ' + n + ' checks across ' + results.suites.length + ' suites');
  results.failed = fail;
  return lines.join('\n');
}

(async () => {
  await suiteAsync('guide state: compact selector before District — default, search, abbreviation save, restore, locked text', async () => {
    const dom = bootApp(); const W = dom.window, d = W.document; const c = ctx(dom); const { $ } = c;
    await whenReady(dom); await flush(150);
    await setMode(c, 'btn-planning'); await flush(80); await clickGuide(c, 0); await flush(400);
    const pl = () => d.getElementById('planning-panel');
    const sf = () => pl().querySelector('.pg-state-input');      // search input (unselected state)
    const pill = () => pl().querySelector('.pg-state-pill');    // selected pill
    const stateVal = () => { const p = pill(); if (p) return p.textContent.replace(/\u00d7/g, '').trim(); const i = sf(); return i ? i.value : ''; };
    const clr = () => pl().querySelector('.pg-state-clear');
    const openSearch = async () => { if (clr()) { $(clr()).trigger('click'); await flush(200); } $(sf()).trigger('focus'); await flush(120); };

    const labels = [...pl().querySelectorAll('.text-uppercase')].map(e => e.textContent);
    const iState = labels.indexOf('State'), iDist = labels.indexOf('District');
    // State is a search/pill control now; a fresh guide starts UNSELECTED (searchable input).
    check('State label sits immediately before District in one wrapping row', iState >= 0 && iDist === iState + 1);
    const row = (sf() || pill()).closest('div[style*="flex-wrap"]');
    check('the row wraps the State + District controls together', !!row);
    const stateFieldWrap = (() => { const l = [...pl().querySelectorAll('div.text-uppercase')].find(x => x.textContent.trim() === 'State'); return l ? l.parentElement : null; })();
    check('the State field is content-based (flex:0 0 auto, no fixed reserved width)', !!stateFieldWrap && /flex:\s*0 0 auto/.test(stateFieldWrap.getAttribute('style') || ''), stateFieldWrap && stateFieldWrap.getAttribute('style'));
    check('a guide with no saved state starts UNSELECTED (searchable input, no forced California)', !!sf() && !pill());

    $(sf()).trigger('focus'); await flush(120);
    const dd = () => pl().querySelector('.pg-state-dd');
    const items = [...dd().querySelectorAll('button')].map(b => b.textContent.trim());
    check('the searchable dropdown offers exactly California and Texas', items.length === 2 && /CA/.test(items[0]) && /TX/.test(items[1]));
    $(sf()).val('tex').trigger('input'); await flush(100);
    check('typing filters the list', [...dd().querySelectorAll('button')].length === 1 && /Texas/.test(dd().textContent));

    [...dd().querySelectorAll('button')].find(b => /Texas/.test(b.textContent)).dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); await flush(250);
    check('selecting Texas shows a Texas pill', stateVal() === 'Texas', stateVal());
    check('the pill carries an "x" clear control', !!clr());

    // clearing returns to the searchable input
    $(clr()).trigger('click'); await flush(200);
    check('clearing the State returns to the searchable input (unselected)', !!sf() && !pill());
    // re-select Texas for the save/restore checks below
    $(sf()).trigger('focus'); await flush(80); $(sf()).val('tex').trigger('input'); await flush(100);
    [...dd().querySelectorAll('button')].find(b => /Texas/.test(b.textContent)).dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); await flush(250);
    check('Texas is re-selected', stateVal() === 'Texas');

    // State is the PARENT of District; a district from another state is revalidated, but the field survives.
    check('the District field survives a State change', /District/.test(pl().textContent) && !!pl().querySelector('.pg-dist-dd, .rounded-pill'));

    // the export payload carries the abbreviation
    let capturedJson = null;
    const OrigBlob = W.Blob;
    W.Blob = function (parts, opts) { if (parts && typeof parts[0] === 'string') capturedJson = parts[0]; return new OrigBlob(parts, opts); };
    W.URL.createObjectURL = () => 'blob:mock'; W.URL.revokeObjectURL = () => {};
    const origCreate = d.createElement.bind(d);
    d.createElement = function (tag) { const el = origCreate(tag); if (tag === 'a') el.click = function () {}; return el; };
    const ab = [...pl().querySelectorAll('button')].find(x => /Actions/.test(x.textContent) && x.textContent.trim().length < 20);
    $(ab).trigger('click'); await flush(60);
    $([...pl().querySelectorAll('button')].find(x => /Export as JSON/.test(x.textContent))).trigger('click'); await flush(300);
    const payload = capturedJson ? JSON.parse(capturedJson) : null;
    check('the JSON export saves the state as its abbreviation (TX) inside the guide data', payload && payload.data && payload.data.state === 'TX');
    W.Blob = OrigBlob; d.createElement = origCreate;

    // restore after leaving and reopening the guide
    await setMode(c, 'btn-schedule'); await flush(150); await setMode(c, 'btn-planning'); await flush(80); await clickGuide(c, 0); await flush(400);
    check('the selection is restored after reopening the guide (Texas pill)', stateVal() === 'Texas', stateVal());

    // locked mode: plain text, not editable (no input, no pill button)
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(150);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(500);
    check('locked mode shows the state as plain text (no editable input)', !pl().querySelector('.pg-state-input') && /Texas/.test(pl().textContent));
    $(d.getElementById('pg-actions-pill')).trigger('click'); await flush(150);
    $(d.getElementById('pg-lock-item')).trigger('click'); await flush(500);
    check('unlocking restores the editable control with the saved value (Texas)', (!!pl().querySelector('.pg-state-input') || !!pl().querySelector('.pg-state-pill')) && stateVal() === 'Texas', stateVal());
    check('no page or console errors', dom.pageErrors.length === 0 && dom.consoleErrors.length === 0);
  });

  console.log(report());
})();
