/*
 * CareClear core logic (pure functions, no DOM).
 * Works in the browser (window.CareClearCore) and in Node (module.exports) so it can be unit tested in CI.
 */
(function (root) {
  'use strict';

  // ---------- Prompts ----------
  // v3 system prompt. v1 and v2 are documented in PROMPTS.md with the reasons they were replaced.
  const SYSTEM_PROMPT = [
    'You are CareClear, an assistant that rewrites hospital discharge summaries into a clear home-care plan for patients and family caregivers in India.',
    '',
    'RULES',
    '1. Use ONLY information written in the discharge summary. Never add medicines, doses, dates or advice that are not in the text.',
    '2. If something is missing, illegible, contradictory or ambiguous, do NOT guess. Put it in "unclear_items" so the family asks the doctor.',
    '3. Write for a reader with a Class 8 reading level. Short sentences. Explain every medical term in everyday words.',
    '4. Decode Indian prescription shorthand: OD = once daily, BD = twice daily, TDS = three times daily, QID = four times daily, HS = at bedtime, SOS/PRN = only when needed, AC = before food, PC = after food, 1-0-1 = morning-afternoon-night counts, Tab = tablet, Cap = capsule, Syp = syrup, Inj = injection.',
    '5. Keep medicine names exactly as written in the summary (brand or generic). Do not translate medicine names.',
    '6. For each medicine, copy the exact original line into "source_quote" so a human can verify it.',
    '7. Convert follow-up dates to ISO format (YYYY-MM-DD) only when a full date is written or can be computed exactly from the discharge date. Otherwise set date_iso to null.',
    '8. You are not giving medical advice. You are only explaining what the doctor already wrote.',
    '',
    'Return ONLY valid JSON matching this schema, with no markdown and no extra text:',
    '{',
    '  "patient_summary": "4-6 short sentences: why the patient was admitted, what was done, how they are now",',
    '  "terms_explained": [{"term": "string", "meaning": "string"}],',
    '  "medications": [{"name": "string", "dose": "string", "morning": true, "afternoon": false, "night": true, "food": "before food | after food | with food | any time | unclear", "duration": "string", "purpose": "string in plain words", "as_needed": false, "source_quote": "string"}],',
    '  "follow_ups": [{"what": "string", "when": "string as written", "date_iso": "YYYY-MM-DD or null"}],',
    '  "warning_signs": ["string: symptom that needs urgent care"],',
    '  "home_care": ["string: diet, activity, wound care and lifestyle instructions"],',
    '  "questions_for_doctor": ["string"],',
    '  "unclear_items": ["string"]',
    '}'
  ].join('\n');

  function buildUserPrompt(redactedText, language) {
    const lang = language || 'English';
    return [
      'Write every explanation field in ' + lang + '.',
      lang === 'English' ? '' : 'Keep medicine names, doses and "source_quote" exactly as in the original English text. Keep JSON keys in English.',
      '',
      'DISCHARGE SUMMARY (personal identifiers have been removed and replaced with tags like [NAME]):',
      '"""',
      redactedText,
      '"""'
    ].filter(function (l) { return l !== null; }).join('\n');
  }

  // ---------- Privacy: redact identifiers before anything leaves the browser ----------
  const REDACTION_RULES = [
    { tag: '[NAME]', re: /\b(patient(?:'s)?\s*name|name\s*of\s*patient|name|attendant|guardian|s\/o|d\/o|w\/o)\s*[:\-]\s*([A-Za-z][A-Za-z .']{1,60}?)(?=\s{2,}|\s*[,;|(\n]|\s+(?:age|sex|gender|uhid|ip|mrn|dob|date)\b|$)/gim, group: 2 },
    { tag: '[ID]', re: /\b(uhid|ip\s*no\.?|ipd\s*no\.?|mrn|reg(?:istration)?\s*no\.?|hospital\s*no\.?|patient\s*id)\s*[:\-#]?\s*([A-Z0-9\/-]{4,})/gim, group: 2 },
    { tag: '[AADHAAR]', re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
    { tag: '[EMAIL]', re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g },
    { tag: '[PHONE]', re: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g },
    { tag: '[ADDRESS]', re: /\b(address)\s*[:\-]\s*([^\n]{5,120})/gim, group: 2 }
  ];

  function redact(text) {
    let out = String(text || '');
    const counts = {};
    REDACTION_RULES.forEach(function (rule) {
      out = out.replace(rule.re, function () {
        const args = Array.prototype.slice.call(arguments);
        const match = args[0];
        counts[rule.tag] = (counts[rule.tag] || 0) + 1;
        if (rule.group) {
          const value = args[rule.group];
          const idx = match.lastIndexOf(value);
          return match.slice(0, idx) + rule.tag + match.slice(idx + value.length);
        }
        return rule.tag;
      });
    });
    const total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
    return { text: out, counts: counts, total: total };
  }

  // ---------- Parse and validate the model output ----------
  function extractJson(raw) {
    if (raw && typeof raw === 'object') return raw;
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object found in AI response');
    return JSON.parse(s.slice(first, last + 1));
  }

  function asArray(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); }
  function asText(v) { return v == null ? '' : String(v).trim(); }
  function asBool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  function normalizePlan(obj) {
    const p = obj || {};
    return {
      patient_summary: asText(p.patient_summary),
      terms_explained: asArray(p.terms_explained).map(function (t) {
        return typeof t === 'string' ? { term: t, meaning: '' } : { term: asText(t.term), meaning: asText(t.meaning) };
      }).filter(function (t) { return t.term; }),
      medications: asArray(p.medications).map(function (m) {
        return {
          name: asText(m.name), dose: asText(m.dose),
          morning: asBool(m.morning), afternoon: asBool(m.afternoon), night: asBool(m.night),
          food: asText(m.food) || 'unclear', duration: asText(m.duration), purpose: asText(m.purpose),
          as_needed: asBool(m.as_needed), source_quote: asText(m.source_quote)
        };
      }).filter(function (m) { return m.name; }),
      follow_ups: asArray(p.follow_ups).map(function (f) {
        const iso = asText(f.date_iso);
        return { what: asText(f.what), when: asText(f.when), date_iso: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null };
      }).filter(function (f) { return f.what || f.when; }),
      warning_signs: asArray(p.warning_signs).map(asText).filter(Boolean),
      home_care: asArray(p.home_care).map(asText).filter(Boolean),
      questions_for_doctor: asArray(p.questions_for_doctor).map(asText).filter(Boolean),
      unclear_items: asArray(p.unclear_items).map(asText).filter(Boolean)
    };
  }

  // ---------- Hallucination guard: every medicine must be traceable to the source ----------
  function tokens(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= 3 && !/^\d+$/.test(w) && !/^(tab|tablet|caps?|capsule|syp|syrup|inj|injection|mg|ml|daily)$/.test(w); });
  }

  function groundCheck(plan, sourceText) {
    const src = String(sourceText || '').toLowerCase();
    const issues = [];
    plan.medications.forEach(function (m) {
      const words = tokens(m.name);
      const found = words.length > 0 ? words.some(function (w) { return new RegExp('\\b' + w + '\\b').test(src); }) : src.indexOf(m.name.toLowerCase()) !== -1;
      m.grounded = found;
      if (!found) issues.push('Medicine "' + m.name + '" was not found in the original summary. Please verify with the doctor.');
    });
    plan.follow_ups.forEach(function (f) {
      if (!f.date_iso) return;
      const parts = f.date_iso.split('-');
      const dmy = [parts[2], parts[1], parts[0]];
      const variants = [dmy.join('/'), dmy.join('-'), dmy.join('.'), f.date_iso, String(+parts[2]) + '/' + String(+parts[1])];
      f.date_in_source = variants.some(function (v) { return src.indexOf(v) !== -1; });
    });
    return issues;
  }

  // ---------- Calendar export (.ics) ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function icsDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

  function durationDays(text) {
    const t = String(text || '').toLowerCase();
    let m = t.match(/(\d+)\s*day/); if (m) return +m[1];
    m = t.match(/(\d+)\s*week/); if (m) return +m[1] * 7;
    m = t.match(/(\d+)\s*month/); if (m) return Math.min(+m[1] * 30, 90);
    return 30; // long-term or unspecified: remind for 30 days, then review with doctor
  }

  function buildIcs(plan, startDate, uidSeed) {
    const start = startDate ? new Date(startDate) : new Date();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const seed = uidSeed || String(Date.now());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareClear//Discharge Plan//EN', 'CALSCALE:GREGORIAN'];
    let n = 0;
    function event(fields) {
      n += 1;
      lines.push('BEGIN:VEVENT', 'UID:careclear-' + seed + '-' + n + '@careclear', 'DTSTAMP:' + stamp);
      fields.forEach(function (f) { lines.push(f); });
      lines.push('END:VEVENT');
    }
    plan.follow_ups.forEach(function (f) {
      if (!f.date_iso) return;
      const d = new Date(f.date_iso + 'T00:00:00');
      const next = new Date(d); next.setDate(d.getDate() + 1);
      event(['DTSTART;VALUE=DATE:' + icsDate(d), 'DTEND;VALUE=DATE:' + icsDate(next),
        'SUMMARY:' + icsEscape('Follow-up: ' + f.what), 'DESCRIPTION:' + icsEscape(f.when),
        'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Tomorrow: ' + f.what), 'END:VALARM']);
    });
    const slots = [['morning', 8, 'Morning'], ['afternoon', 14, 'Afternoon'], ['night', 21, 'Night']];
    slots.forEach(function (slot) {
      const meds = plan.medications.filter(function (m) { return m[slot[0]] && !m.as_needed; });
      if (!meds.length) return;
      const days = Math.max.apply(null, meds.map(function (m) { return durationDays(m.duration); }));
      const d = new Date(start); d.setHours(slot[1], 0, 0, 0);
      const dt = icsDate(d) + 'T' + pad(slot[1]) + '0000';
      const end = icsDate(d) + 'T' + pad(slot[1]) + '1500';
      const desc = meds.map(function (m) { return '- ' + m.name + ' ' + m.dose + ' (' + m.food + ', ' + (m.duration || 'as advised') + ')'; }).join('\n');
      event(['DTSTART:' + dt, 'DTEND:' + end, 'RRULE:FREQ=DAILY;COUNT=' + days,
        'SUMMARY:' + icsEscape(slot[2] + ' medicines (' + meds.length + ')'), 'DESCRIPTION:' + icsEscape(desc),
        'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(slot[2] + ' medicines'), 'END:VALARM']);
    });
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n'), events: n };
  }

  // ---------- Plain-text export (for WhatsApp / SMS to family) ----------
  function planToText(plan) {
    const out = ['*CareClear home-care plan*', '', plan.patient_summary, ''];
    if (plan.medications.length) {
      out.push('*Medicines*');
      plan.medications.forEach(function (m) {
        const when = m.as_needed ? 'only when needed' :
          [m.morning ? 'morning' : '', m.afternoon ? 'afternoon' : '', m.night ? 'night' : ''].filter(Boolean).join(', ');
        out.push('- ' + m.name + ' ' + m.dose + ': ' + when + ', ' + m.food + (m.duration ? ', ' + m.duration : '') + (m.purpose ? ' (' + m.purpose + ')' : ''));
      });
      out.push('');
    }
    if (plan.follow_ups.length) { out.push('*Follow-up*'); plan.follow_ups.forEach(function (f) { out.push('- ' + f.what + ': ' + f.when); }); out.push(''); }
    if (plan.warning_signs.length) { out.push('*Go to hospital immediately if*'); plan.warning_signs.forEach(function (w) { out.push('- ' + w); }); out.push(''); }
    if (plan.unclear_items.length) { out.push('*Ask the doctor about*'); plan.unclear_items.forEach(function (u) { out.push('- ' + u); }); out.push(''); }
    out.push('This explains the doctor\'s discharge summary. It is not medical advice.');
    return out.join('\n');
  }

  const api = {
    SYSTEM_PROMPT: SYSTEM_PROMPT, buildUserPrompt: buildUserPrompt, redact: redact,
    extractJson: extractJson, normalizePlan: normalizePlan, groundCheck: groundCheck,
    durationDays: durationDays, buildIcs: buildIcs, planToText: planToText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CareClearCore = api;
})(typeof window !== 'undefined' ? window : this);
