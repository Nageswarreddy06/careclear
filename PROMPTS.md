# CareClear - Prompt Documentation

Candidate: Peddireddy Nageswar Reddy
Role: AI Growth & Automation Associate (Task 1)
Project: CareClear - AI automation that converts hospital discharge summaries into a home-care plan

This document has two parts:

- Part A: the in-app prompt that Gemini runs on every summary, with each version and why it changed
- Part B: the development prompts used with Claude to plan, build, test and document the project

---

## Part A - In-app prompt (Google Gemini 2.5 Flash)

### Version 1 - first attempt

```
Summarize this hospital discharge summary in simple language for the patient's family.
List the medicines and the follow-up date.

<discharge summary>
```

Result on the two test summaries:
- Readable paragraph, but medicines came back as free text, so the app could not build a schedule or calendar reminders.
- "0-1-0" was read as "zero, one, zero tablets" in one run and ignored in another.
- For the appendix case it confidently wrote "Ondem 4 mg three times a day". The summary only says "Tab Ondem ?4mg - if vomiting". The model guessed the dose and invented a frequency. This is the most dangerous failure for a health tool.
- Patient name, phone number and UHID were sent to the API.

### Version 2 - structure and shorthand

Changes:
- Asked for JSON with fixed fields (summary, medications with morning/afternoon/night, follow_ups, warning_signs).
- Added a decoding table for Indian prescription shorthand (OD, BD, TDS, HS, SOS, AC, PC, 1-0-1).
- Turned on Gemini's `responseMimeType: application/json` and lowered temperature to 0.2 for consistent output.
- Added browser-side redaction of names, IDs and phone numbers before the API call.

```
You convert discharge summaries into JSON for a patient app.
Decode: OD = once daily, BD = twice daily, TDS = three times daily, HS = bedtime,
SOS = when needed, AC = before food, PC = after food, 1-0-1 = morning-afternoon-night.
Return JSON: {"patient_summary": "", "medications": [{"name","dose","morning","afternoon","night","food","duration"}],
"follow_ups": [{"what","when"}], "warning_signs": []}
```

Result:
- Schedule and shorthand were correct in both samples.
- Still filled gaps: Metoprolol food timing (not written) came back as "after food". The Ondem dose became "4 mg".
- Medical words like "PTCA with DES" and "LVEF 50%" were left unexplained.
- In Telugu mode it sometimes translated medicine names, which a pharmacist would not recognise.

### Version 3 - final (in js/core.js)

Changes and the reason for each:

| Change | Why |
|---|---|
| Rule 1: use ONLY information in the text | stop invented doses and advice |
| Rule 2: put missing or ambiguous items in `unclear_items` instead of guessing | turns uncertainty into a question for the doctor |
| `food` allows the value `unclear` | Metoprolol case: missing info must stay missing |
| `source_quote` = exact original line for each medicine | lets a human verify every row; powers the UI quote chip |
| `terms_explained` field and "Class 8 reading level" | families did not understand STEMI, DES, LVEF |
| Keep medicine names exactly as written; translate only explanations | brand names must match the strip in hand |
| `date_iso` only when exact, else null | prevents made-up calendar dates; enables .ics export |
| `questions_for_doctor` | gives the family a next step |
| "You are not giving medical advice. You are only explaining what the doctor already wrote." | sets the model's role and tone |

```
You are CareClear, an assistant that rewrites hospital discharge summaries into a clear home-care plan for patients and family caregivers in India.

RULES
1. Use ONLY information written in the discharge summary. Never add medicines, doses, dates or advice that are not in the text.
2. If something is missing, illegible, contradictory or ambiguous, do NOT guess. Put it in "unclear_items" so the family asks the doctor.
3. Write for a reader with a Class 8 reading level. Short sentences. Explain every medical term in everyday words.
4. Decode Indian prescription shorthand: OD = once daily, BD = twice daily, TDS = three times daily, QID = four times daily, HS = at bedtime, SOS/PRN = only when needed, AC = before food, PC = after food, 1-0-1 = morning-afternoon-night counts, Tab = tablet, Cap = capsule, Syp = syrup, Inj = injection.
5. Keep medicine names exactly as written in the summary (brand or generic). Do not translate medicine names.
6. For each medicine, copy the exact original line into "source_quote" so a human can verify it.
7. Convert follow-up dates to ISO format (YYYY-MM-DD) only when a full date is written or can be computed exactly from the discharge date. Otherwise set date_iso to null.
8. You are not giving medical advice. You are only explaining what the doctor already wrote.

Return ONLY valid JSON matching this schema, with no markdown and no extra text:
{
  "patient_summary": "4-6 short sentences: why the patient was admitted, what was done, how they are now",
  "terms_explained": [{"term": "string", "meaning": "string"}],
  "medications": [{"name": "string", "dose": "string", "morning": true, "afternoon": false, "night": true, "food": "before food | after food | with food | any time | unclear", "duration": "string", "purpose": "string in plain words", "as_needed": false, "source_quote": "string"}],
  "follow_ups": [{"what": "string", "when": "string as written", "date_iso": "YYYY-MM-DD or null"}],
  "warning_signs": ["string: symptom that needs urgent care"],
  "home_care": ["string: diet, activity, wound care and lifestyle instructions"],
  "questions_for_doctor": ["string"],
  "unclear_items": ["string"]
}
```

User message template:

```
Write every explanation field in <language>.
Keep medicine names, doses and "source_quote" exactly as in the original English text. Keep JSON keys in English.   (non-English only)

DISCHARGE SUMMARY (personal identifiers have been removed and replaced with tags like [NAME]):
"""
<redacted summary>
"""
```

Result: both samples fully correct. Ondem dose and Metoprolol/Dolo food timing now appear under "Unclear - please confirm", and every medicine passes the grounding check.

### Self-repair prompt (fallback)

Used automatically if the model returns invalid JSON:

```
Your previous answer was not valid JSON. Return the same content as ONE valid JSON object that matches the schema exactly. No markdown.

Previous answer:
<raw output>
```

### Not trusting the prompt alone

Prompts reduce errors but do not remove them, so the app adds code checks after the AI:
- `normalizePlan` coerces types and drops incomplete rows
- `groundCheck` confirms every medicine name exists in the original text and flags anything that does not
- unit tests in CI cover redaction, JSON parsing, grounding and calendar export

---

## Part B - Development prompts (Claude)

### 1. Choosing the project

```
I have to complete an AI skills assessment for an "AI Growth & Automation Associate" role.
I must build one project in healthcare or technology where AI plays a meaningful role.
Options: website, digital marketing, web scraping, automation, or innovation.
Suggest 4 project ideas, with a recommendation. I want something that solves a real
problem in India, can be demoed live in 2 minutes, and shows automation, not just a chatbot.
```

Picked: discharge summary to home-care plan automation. It is a real problem, it is easy to show before/after in a video, and it has clear automation outputs (schedule, calendar reminders, WhatsApp text).

### 2. Architecture

```
Build this as a static web app that I can host free on GitHub Pages. No backend.
Pipeline: redact personal details in the browser -> call Gemini API -> validate JSON ->
check the AI output against the original text -> render the plan.
Include a demo mode with saved output so reviewers can try it without an API key.
Keep the logic in pure functions so I can unit test it in GitHub Actions.
```

### 3. Realistic test data

```
Write two fictional but realistic Indian discharge summaries for testing:
1) 58-year-old man after a heart attack with stent, diabetes and BP, 7 discharge medicines
   in Indian notation (0-1-0, PC, HS, SOS).
2) 34-year-old woman after laparoscopic appendix surgery. Include one deliberately
   ambiguous line (a dose with a question mark) so I can test if the AI guesses.
Include fake names, phone numbers and UHID so I can test redaction.
```

### 4. Prompt design (led to v1, v2, v3 above)

```
Write the system prompt for the AI step. The output must be strict JSON the app can render.
Biggest risk: the model inventing doses or dates. Make it refuse to guess and put
ambiguous items in a separate list.
```

Follow-up after testing v2:

```
v2 still filled in "after food" for Metoprolol even though the summary does not say it,
and changed "?4mg" to "4 mg". Tighten the prompt so missing info stays missing, add an
exact source quote for every medicine, and explain medical terms in simple words.
In Telugu mode keep medicine names in English.
```

### 5. Hallucination guard in code

```
Add a check after the AI step: for every medicine in the output, confirm the name appears
in the original summary. If not, show a red "verify" badge and add it to the unclear list.
```

Bug found in testing: "Pan 40" was wrongly flagged because the check ignored words shorter than 4 letters. Follow-up:

```
The grounding check flags "Pan 40" as not found. Short brand names like Pan, Dolo, Ecosprin
must match. Ignore pure numbers and dosage-form words, and match whole words.
```

### 6. Redaction

```
Write regex-based redaction for Indian hospital documents: patient name, attendant name,
UHID / IP No / MRN, Indian mobile numbers with or without +91, Aadhaar, email, address.
Keep medicine names and dates untouched. Add unit tests that fail if anything leaks.
```

Bug found: the attendant line "Attendant: Suresh K (Husband)" was not redacted because the regex did not stop at "(". Fixed and covered by a test.

### 7. Automation outputs

```
Add one-click exports: an .ics calendar file with a daily reminder for each medicine time
slot (morning 8 AM, afternoon 2 PM, night 9 PM) repeating for the medicine's duration,
plus all-day events for dated follow-ups with a reminder the evening before.
Also a WhatsApp-friendly text version, print to PDF, and JSON download.
```

### 8. UI

```
Design a clean, calm, mobile-friendly UI. Two columns on desktop (input, output), one on mobile.
Show the pipeline steps live. Medicine table with morning/noon/night dots, warning signs in
a red box at the top, unclear items in an amber box. Support dark mode.
```

### 9. CI/CD and docs

```
Write a GitHub Actions workflow that runs the unit tests on every push and PR, and deploys
to GitHub Pages only if tests pass on main. Then write a README explaining the problem,
the pipeline, how to run it, and the safety limits.
```
