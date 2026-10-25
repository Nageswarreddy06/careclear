// Unit tests for CareClear core logic. Run: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/core.js');

// Load the browser samples file into a sandbox object
const sandbox = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../js/samples.js'), 'utf8'))(sandbox);
const SAMPLES = sandbox.CareClearSamples;

test('redact removes names, IDs and phone numbers', () => {
  SAMPLES.forEach((s) => {
    const r = C.redact(s.text);
    assert.ok(r.total >= 3, 'expected at least 3 redactions in ' + s.id);
    assert.ok(!/9848012345|99490 22334/.test(r.text), 'phone leaked');
    assert.ok(!/Ramesh Kumar Reddy|Lakshmi Devi|Suresh K/.test(r.text), 'name leaked');
    assert.ok(!/SVH2026-48213|GCH-77120/.test(r.text), 'ID leaked');
  });
});

test('redact keeps clinical content intact', () => {
  const r = C.redact(SAMPLES[0].text);
  assert.match(r.text, /Ecosprin 75 mg/);
  assert.match(r.text, /27\/10\/2026/);
});

test('extractJson handles markdown fences and extra text', () => {
  const obj = C.extractJson('Here you go:\n```json\n{"a": 1}\n```');
  assert.deepStrictEqual(obj, { a: 1 });
  assert.throws(() => C.extractJson('no json here'));
});

test('normalizePlan fills defaults and coerces types', () => {
  const p = C.normalizePlan({ medications: [{ name: 'X', morning: 'true' }, { dose: 'no name' }], follow_ups: [{ what: 'Review', date_iso: '27/10' }] });
  assert.strictEqual(p.medications.length, 1);
  assert.strictEqual(p.medications[0].morning, true);
  assert.strictEqual(p.medications[0].food, 'unclear');
  assert.strictEqual(p.follow_ups[0].date_iso, null);
  assert.deepStrictEqual(p.warning_signs, []);
});

test('groundCheck passes real medicines and flags invented ones', () => {
  SAMPLES.forEach((s) => {
    const plan = C.normalizePlan(JSON.parse(JSON.stringify(s.demoPlan)));
    assert.deepStrictEqual(C.groundCheck(plan, s.text), [], 'demo plan for ' + s.id + ' should be fully grounded');
  });
  const plan = C.normalizePlan({ medications: [{ name: 'Ecosprin' }, { name: 'Warfarin' }] });
  const issues = C.groundCheck(plan, SAMPLES[0].text);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0], /Warfarin/);
});

test('durationDays parses common durations', () => {
  assert.strictEqual(C.durationDays('5 days'), 5);
  assert.strictEqual(C.durationDays('x 2 weeks'), 14);
  assert.strictEqual(C.durationDays('1 month'), 30);
  assert.strictEqual(C.durationDays('lifelong'), 30);
});

test('buildIcs creates follow-up and medicine reminder events', () => {
  const plan = C.normalizePlan(SAMPLES[1].demoPlan);
  const ics = C.buildIcs(plan, '2026-10-20T00:00:00', 'test');
  assert.match(ics.text, /^BEGIN:VCALENDAR/);
  assert.match(ics.text, /DTSTART;VALUE=DATE:20261028/);
  assert.match(ics.text, /RRULE:FREQ=DAILY;COUNT=5/);
  assert.strictEqual(ics.events, 4); // 1 dated follow-up + morning, afternoon, night slots
});

test('planToText includes warning signs and disclaimer', () => {
  const t = C.planToText(C.normalizePlan(SAMPLES[0].demoPlan));
  assert.match(t, /Go to hospital immediately/);
  assert.match(t, /not medical advice/);
});

test('system prompt contains the anti-hallucination rules', () => {
  assert.match(C.SYSTEM_PROMPT, /Use ONLY information/);
  assert.match(C.SYSTEM_PROMPT, /unclear_items/);
  assert.match(C.SYSTEM_PROMPT, /source_quote/);
});
