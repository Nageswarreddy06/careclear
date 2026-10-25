/* CareClear UI: wires the pipeline redact -> AI -> validate -> ground check -> render. */
(function () {
  'use strict';
  const C = window.CareClearCore;
  const SAMPLES = window.CareClearSamples;
  const $ = function (id) { return document.getElementById(id); };

  // ---------- Safe storage (works in private windows too) ----------
  const store = {
    get: function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: function (k, v, persist) {
      try { sessionStorage.setItem(k, v); } catch (e) {}
      try { if (persist) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {}
    }
  };

  let lastPlan = null;
  let activeSample = null;

  // ---------- Setup ----------
  const today = new Date();
  $('startDate').value = today.toISOString().slice(0, 10);

  SAMPLES.forEach(function (s) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'small'; b.textContent = 'Sample: ' + s.label;
    b.addEventListener('click', function () {
      $('src').value = s.text; activeSample = s;
      $('startDate').value = s.discharge;
      toast('Sample loaded. Click "Create care plan".');
    });
    $('sampleChips').appendChild(b);
  });

  $('src').addEventListener('input', function () {
    if (activeSample && $('src').value !== activeSample.text) activeSample = null;
  });

  $('uploadBtn').addEventListener('click', function () { $('fileIn').click(); });
  $('fileIn').addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 200000) { showStatus('File is too large. Please paste the text instead.', 'err'); return; }
    const r = new FileReader();
    r.onload = function () { $('src').value = r.result; activeSample = null; };
    r.readAsText(f);
  });
  $('clearBtn').addEventListener('click', function () { $('src').value = ''; activeSample = null; });

  // Settings
  $('apiKey').value = store.get('cc_key');
  $('model').value = store.get('cc_model') || 'gemini-3.5-flash-lite';
  $('settingsBtn').addEventListener('click', function () { $('settings').showModal(); });
  $('closeSettings').addEventListener('click', function () { $('settings').close(); });
  $('saveSettings').addEventListener('click', function () {
    store.set('cc_key', $('apiKey').value.trim(), $('remember').checked);
    store.set('cc_model', $('model').value, true);
    $('settings').close(); updateModeHint(); toast('Settings saved');
  });

  // Theme toggle
  $('themeBtn').addEventListener('click', function () {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
  });

  function updateModeHint() {
    $('modeHint').textContent = store.get('cc_key')
      ? 'Live mode: using ' + (store.get('cc_model') || 'gemini-3.5-flash-lite') + '.'
      : 'Demo mode: no API key set, so the two samples use saved AI output. Add a free Gemini key in AI settings to process any summary.';
  }
  updateModeHint();

  // ---------- Pipeline UI ----------
  function setStep(name, state) {
    document.querySelectorAll('.step').forEach(function (el) {
      if (name === null) { el.className = 'step'; return; }
      if (el.dataset.s === name) el.className = 'step ' + state;
    });
  }
  function showStatus(msg, kind) {
    const s = $('status'); s.textContent = msg; s.className = 'status show ' + (kind || 'info');
  }
  function hideStatus() { $('status').className = 'status'; }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- AI call ----------
  async function callGemini(userPrompt, key, model) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: C.SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const msg = (data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error(res.status === 400 || res.status === 403 ? 'API key or model problem: ' + msg : msg);
    }
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!parts || !parts.length) throw new Error('The AI returned an empty answer (it may have been blocked). Try again.');
    return parts.map(function (p) { return p.text || ''; }).join('');
  }

  // Ask once, and if the JSON is broken, ask the model to repair its own output.
  async function getPlan(redactedText, language, key, model) {
    const prompt = C.buildUserPrompt(redactedText, language);
    const raw = await callGemini(prompt, key, model);
    try { return C.extractJson(raw); }
    catch (e) {
      showStatus('AI output was not valid JSON. Asking it to fix the format...', 'info');
      const repair = 'Your previous answer was not valid JSON. Return the same content as ONE valid JSON object that matches the schema exactly. No markdown.\n\nPrevious answer:\n' + raw.slice(0, 12000);
      return C.extractJson(await callGemini(repair, key, model));
    }
  }

  // ---------- Run ----------
  $('runBtn').addEventListener('click', run);

  async function run() {
    const text = $('src').value.trim();
    hideStatus(); setStep(null);
    if (text.length < 80) { showStatus('Please paste a discharge summary (or load a sample) first.', 'err'); return; }
    const key = store.get('cc_key');
    const model = store.get('cc_model') || 'gemini-3.5-flash-lite';
    const lang = $('lang').value;
    const demo = !key;
    if (demo && !activeSample) {
      showStatus('Demo mode only works with the two samples. Add a free Gemini API key in AI settings to process your own text.', 'err');
      return;
    }
    $('runBtn').disabled = true; $('runBtn').textContent = 'Working...';
    try {
      setStep('redact', 'on');
      const red = C.redact(text);
      await wait(250); setStep('redact', 'done');

      setStep('ai', 'on');
      let rawPlan;
      if (demo) {
        await wait(900);
        rawPlan = JSON.parse(JSON.stringify(activeSample.demoPlan));
        if (lang !== 'English') toast('Demo output is in English. Add an API key for ' + lang + '.');
      } else {
        rawPlan = await getPlan(red.text, lang, key, model);
      }
      setStep('ai', 'done');

      setStep('validate', 'on');
      const plan = C.normalizePlan(rawPlan);
      if (!plan.patient_summary && !plan.medications.length) throw new Error('The AI answer did not contain a care plan. Is the pasted text a discharge summary?');
      await wait(150); setStep('validate', 'done');

      setStep('ground', 'on');
      const issues = C.groundCheck(plan, text);
      issues.forEach(function (i) { if (plan.unclear_items.indexOf(i) === -1) plan.unclear_items.unshift(i); });
      await wait(150); setStep('ground', 'done');

      lastPlan = plan;
      render(plan, { redacted: red, demo: demo, model: model, issues: issues.length });
      hideStatus();
    } catch (err) {
      setStep(null);
      showStatus(err.message || String(err), 'err');
    } finally {
      $('runBtn').disabled = false; $('runBtn').textContent = 'Create care plan';
    }
  }

  // ---------- Render ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dot(on) { return '<span class="dot ' + (on ? 'y' : 'n') + '">' + (on ? '1' : '0') + '</span>'; }
  function list(items) { return '<ul class="clean">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'; }
  function fmtDate(iso) {
    try { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return iso; }
  }

  function render(p, meta) {
    const h = [];
    h.push('<div class="out-head"><h3 style="font-size:22px">Home-care plan</h3><div class="badges">');
    h.push('<span class="badge">' + (meta.demo ? 'Demo output' : esc(meta.model)) + '</span>');
    h.push('<span class="badge">' + meta.redacted.total + ' identifiers removed</span>');
    h.push(meta.issues ? '<span class="badge warn">' + meta.issues + ' not found in source</span>' : '<span class="badge">All medicines matched source</span>');
    h.push('</div></div>');
    h.push('<p class="summary">' + esc(p.patient_summary) + '</p>');

    if (p.warning_signs.length) {
      h.push('<section class="block" style="border:none;padding-top:0"><div class="alert"><h3>Go to the hospital immediately if</h3>' + list(p.warning_signs) + '</div></section>');
    }

    if (p.medications.length) {
      h.push('<section class="block"><h3>Medicine schedule</h3><div class="tablewrap"><table><thead><tr><th>Medicine</th><th style="text-align:center">AM</th><th style="text-align:center">Noon</th><th style="text-align:center">PM</th><th>How long</th></tr></thead><tbody>');
      p.medications.forEach(function (m) {
        h.push('<tr><td><div class="med-name">' + esc(m.name) + ' <span class="sub">' + esc(m.dose) + '</span></div>');
        h.push('<div class="sub">' + esc(m.purpose) + (m.food && m.food !== 'any time' ? ' · <strong>' + esc(m.food) + '</strong>' : '') + '</div>');
        if (m.grounded === false) h.push('<span class="badge warn" style="margin-top:4px;display:inline-block">Verify: not in original</span><br>');
        if (m.source_quote) h.push('<span class="quote" title="Original line from the summary">' + esc(m.source_quote) + '</span>');
        h.push('</td>');
        if (m.as_needed) h.push('<td colspan="3" style="text-align:center"><span class="badge amber">Only when needed</span></td>');
        else h.push('<td class="slot">' + dot(m.morning) + '</td><td class="slot">' + dot(m.afternoon) + '</td><td class="slot">' + dot(m.night) + '</td>');
        h.push('<td>' + esc(m.duration || 'As advised') + '</td></tr>');
      });
      h.push('</tbody></table></div></section>');
    }

    if (p.follow_ups.length) {
      h.push('<section class="block"><h3>Follow-up visits and tests</h3><ul class="clean">');
      p.follow_ups.forEach(function (f) {
        h.push('<li><strong>' + esc(f.what) + '</strong> - ' + (f.date_iso ? esc(fmtDate(f.date_iso)) : esc(f.when)) + '</li>');
      });
      h.push('</ul></section>');
    }

    if (p.home_care.length) h.push('<section class="block"><h3>Care at home</h3>' + list(p.home_care) + '</section>');

    if (p.unclear_items.length) {
      h.push('<section class="block" style="border:none"><div class="unclear"><h3>Unclear in the summary - please confirm</h3>' + list(p.unclear_items) + '</div></section>');
    }
    if (p.questions_for_doctor.length) h.push('<section class="block"><h3>Questions to ask the doctor</h3>' + list(p.questions_for_doctor) + '</section>');

    if (p.terms_explained.length) {
      h.push('<section class="block"><h3>Medical words explained</h3><dl class="terms">');
      p.terms_explained.forEach(function (t) { h.push('<dt>' + esc(t.term) + '</dt><dd>' + esc(t.meaning) + '</dd>'); });
      h.push('</dl></section>');
    }

    h.push('<div class="actions">');
    h.push('<button type="button" id="icsBtn">Add reminders to phone calendar</button>');
    h.push('<button type="button" id="copyBtn">Copy for WhatsApp</button>');
    h.push('<button type="button" id="printBtn">Print / Save PDF</button>');
    h.push('<button type="button" id="jsonBtn">Download JSON</button>');
    h.push('</div>');
    h.push('<p class="disclaimer">This plan only explains the doctor\'s written discharge summary. Always follow your doctor\'s instructions. Medicine lines show the original text so you can check them.</p>');

    $('empty').hidden = true;
    const out = $('out'); out.innerHTML = h.join(''); out.hidden = false;
    if (window.innerWidth < 900) out.scrollIntoView({ behavior: 'smooth' });

    $('icsBtn').addEventListener('click', function () {
      const ics = C.buildIcs(lastPlan, $('startDate').value + 'T00:00:00');
      if (!ics.events) { toast('Nothing to schedule'); return; }
      download('careclear-reminders.ics', ics.text, 'text/calendar');
      toast(ics.events + ' calendar events created');
    });
    $('copyBtn').addEventListener('click', function () {
      const t = C.planToText(lastPlan);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
        .then(function () { toast('Copied. Paste into WhatsApp.'); })
        .catch(function () { download('careclear-plan.txt', t, 'text/plain'); });
    });
    $('printBtn').addEventListener('click', function () { window.print(); });
    $('jsonBtn').addEventListener('click', function () { download('careclear-plan.json', JSON.stringify(lastPlan, null, 2), 'application/json'); });
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
})();
