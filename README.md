# CareClear

AI-powered automation that turns a hospital discharge summary into a home-care plan a family can actually follow.

Live demo: https://nageswarreddy06.github.io/careclear/

## The problem

When a patient leaves hospital in India, the family gets a discharge summary full of shorthand: "Tab Ecosprin 75 mg 0-1-0 PC", "Pan 40 OD AC", "SOS", "HS". Caregivers have to work out which tablet to give when, before or after food, for how long, when to go back for review, and which symptoms are an emergency. Mistakes here lead to missed doses, stopped blood thinners and avoidable readmissions.

## What CareClear does

1. Redacts personal details (names, UHID/IP/MRN numbers, phone, Aadhaar, email, address) in the browser before any text is sent to AI.
2. AI decode: Google Gemini reads the redacted summary with a structured system prompt and returns strict JSON.
3. Validates the JSON and normalises every field. If the model returns broken JSON, the app asks the model to repair its own output once.
4. Grounding check (hallucination guard): every medicine the AI lists must be traceable to the original text. Anything that is not is flagged "Verify: not in original". Each medicine also shows the exact source line.
5. Outputs a family-friendly plan:
   - plain-language summary and medical terms explained
   - morning / afternoon / night medicine schedule with food timing and duration
   - follow-up visits and tests with dates
   - emergency warning signs
   - items that are unclear in the summary, plus questions to ask the doctor
6. Automation: one click exports phone calendar reminders (.ics) for every medicine time slot and every dated follow-up, a WhatsApp-ready text version, a printable PDF and JSON.
7. Explains in English, Telugu, Hindi, Tamil, Kannada or Malayalam (medicine names stay as written).

## Try it

Open the live demo and click a sample, then "Create care plan". Without an API key the two fictional samples run in Demo Mode using saved AI output.

To process any summary, click "AI settings" and paste a free Gemini API key from https://aistudio.google.com/apikey. The key is stored only in your browser and sent only to Google.

## Run locally

```
git clone https://github.com/Nageswarreddy06/careclear.git
cd careclear
npx serve .        # or: python3 -m http.server 8000
npm test           # 9 unit tests, Node 18+
```

## Project structure

```
index.html                 UI and styles
js/core.js                 prompts, redaction, JSON validation, grounding check, .ics and text export (pure functions, unit tested)
js/app.js                  UI wiring and Gemini API call
js/samples.js              two fictional discharge summaries and Demo Mode outputs
tests/core.test.js         node:test unit tests
.github/workflows/deploy.yml   CI: run tests, then deploy to GitHub Pages
PROMPTS.md                 all prompts used to build the project, with revisions
```

## Tech and AI tools

- Google Gemini 2.5 Flash (in-app model): fast, free tier, native JSON output mode, good at Indian languages
- Claude (development assistant): planning, code, prompt design and review
- Vanilla HTML/CSS/JavaScript, no build step
- GitHub Actions + GitHub Pages for test-then-deploy

## Safety and limits

CareClear only explains what the doctor wrote. It is not medical advice and does not replace the doctor or pharmacist. Sample patients are fictional. Handwritten or scanned summaries need OCR first (planned).

## Roadmap

- OCR for photos of printed/handwritten summaries (Gemini vision)
- WhatsApp reminder bot for daily medicine alerts
- Hospital-side version that generates the plan at discharge
