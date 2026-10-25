/*
 * Fictional sample discharge summaries (no real patients) and pre-generated outputs for Demo Mode,
 * so reviewers can try the full flow without an API key. Demo outputs were produced by the same
 * prompt in js/core.js and reviewed by hand.
 */
(function (root) {
  'use strict';

  const cardiac = [
    'SRI VENKATESWARA MULTISPECIALITY HOSPITAL, KADAPA',
    'DISCHARGE SUMMARY',
    '',
    'Patient Name: Ramesh Kumar Reddy    Age/Sex: 58/M    UHID: SVH2026-48213',
    'IP No: IP/26/10/0917    Contact: 9848012345',
    'Address: 4-12, Gandhi Road, Proddatur',
    'Date of Admission: 16/10/2026    Date of Discharge: 20/10/2026',
    'Consultant: Dr. A. Prasad, MD DM (Cardiology)',
    '',
    'DIAGNOSIS: Acute Inferior Wall MI (STEMI). Single vessel CAD - RCA. Type 2 DM. Systemic HTN.',
    '',
    'PROCEDURE: CAG followed by PTCA with DES to RCA on 16/10/2026. Procedure uneventful.',
    '',
    'COURSE IN HOSPITAL: Pt presented with retrosternal chest pain x 3 hrs with sweating. ECG showed ST elevation in II, III, aVF. Taken up for primary PCI. Post procedure pt hemodynamically stable. 2D Echo: LVEF 50%, mild inferior hypokinesia. Sugars controlled with insulin, switched to OHA before discharge. Pt ambulant and asymptomatic at discharge.',
    '',
    'MEDICATIONS ON DISCHARGE:',
    '1. Tab. Ecosprin 75 mg  0-1-0  PC  - to continue lifelong',
    '2. Tab. Clopidogrel 75 mg  0-1-0  PC  - x 1 year, do not stop without cardiologist advice',
    '3. Tab. Atorvastatin 40 mg  0-0-1  HS  - to continue',
    '4. Tab. Metoprolol XL 25 mg  1-0-1  - to continue',
    '5. Tab. Pantoprazole 40 mg  1-0-0  AC  - x 1 month',
    '6. Tab. Metformin 500 mg  1-0-1  PC  - to continue',
    '7. Tab. Sorbitrate 5 mg  SL  SOS for chest pain',
    '',
    'ADVICE:',
    '- Low salt, low fat, diabetic diet. Avoid ghee, fried foods, sweets.',
    '- Walking 10 min twice daily, increase gradually. No heavy lifting > 5 kg for 4 weeks.',
    '- Strict stop smoking.',
    '- Check BP and sugars at home, maintain chart.',
    '',
    'REVIEW: Cardiology OPD on 27/10/2026 with reports. Lipid profile and HbA1c after 6 weeks.',
    '',
    'EMERGENCY: Report immediately to casualty if chest pain not relieved by Sorbitrate in 5 min, breathlessness, giddiness/fainting, black stools or blood in urine.'
  ].join('\n');

  const surgery = [
    'GREEN CROSS HOSPITAL - DEPT OF GENERAL SURGERY',
    'DISCHARGE SUMMARY',
    '',
    'Name: Lakshmi Devi K    Age: 34 Y    Sex: F    MRN: GCH-77120',
    'Attendant: Suresh K (Husband), Mob: +91 99490 22334',
    'DOA: 18/10/2026    DOD: 20/10/2026',
    '',
    'Diagnosis: Acute appendicitis.',
    'Procedure: Laparoscopic appendicectomy done on 18/10/2026 under GA.',
    'Post-op period uneventful. Tolerating oral diet. Wounds healthy. Pt passed flatus and stools.',
    '',
    'Rx at discharge:',
    'Tab Cefuroxime 500mg  BD  x 5 days  after food',
    'Tab Dolo 650  TDS x 3 days then SOS for pain',
    'Tab Pan 40  OD  before breakfast x 5 days',
    'Syp Cremaffin  15 ml  HS x 5 days',
    'Tab Ondem ?4mg - if vomiting',
    '',
    'Advice:',
    'Soft diet for 3 days then normal diet. Plenty of fluids.',
    'Keep dressing dry. No bath on wound site till suture removal; sponge bath only.',
    'Avoid lifting heavy weights, driving for 2 weeks.',
    'Suture removal on 28/10/2026 in Surgery OPD.',
    'Collect HPE (biopsy) report on review.',
    '',
    'Come back immediately if: fever more than 101 F, redness/pus discharge from wound, severe abdominal pain, persistent vomiting.'
  ].join('\n');

  const cardiacPlan = {
    patient_summary: 'The patient had a heart attack because one blood vessel of the heart (the right coronary artery) got blocked. Doctors opened the blocked vessel and placed a small metal tube called a stent to keep it open. His heart is pumping fairly well (50%). He also has diabetes and high blood pressure, which are now under control with tablets. He was walking and had no chest pain when he went home.',
    terms_explained: [
      { term: 'Acute Inferior Wall MI (STEMI)', meaning: 'A heart attack affecting the lower part of the heart, caused by a fully blocked blood vessel.' },
      { term: 'CAD - RCA', meaning: 'Coronary artery disease: narrowing of the heart\'s blood vessels. Here the right coronary artery was blocked.' },
      { term: 'CAG + PTCA with DES', meaning: 'A dye test to see the heart vessels, then a balloon to open the block and a medicine-coated stent to keep it open.' },
      { term: 'LVEF 50%', meaning: 'How much blood the heart pumps out with each beat. 50% is close to normal.' },
      { term: 'HTN', meaning: 'High blood pressure.' },
      { term: 'OHA', meaning: 'Diabetes tablets taken by mouth, instead of insulin injections.' }
    ],
    medications: [
      { name: 'Ecosprin', dose: '75 mg', morning: false, afternoon: true, night: false, food: 'after food', duration: 'Lifelong', purpose: 'Thins the blood to stop clots in the stent', as_needed: false, source_quote: 'Tab. Ecosprin 75 mg  0-1-0  PC  - to continue lifelong' },
      { name: 'Clopidogrel', dose: '75 mg', morning: false, afternoon: true, night: false, food: 'after food', duration: '1 year - do not stop without cardiologist advice', purpose: 'Second blood thinner that protects the new stent', as_needed: false, source_quote: 'Tab. Clopidogrel 75 mg  0-1-0  PC  - x 1 year, do not stop without cardiologist advice' },
      { name: 'Atorvastatin', dose: '40 mg', morning: false, afternoon: false, night: true, food: 'any time', duration: 'Continue', purpose: 'Lowers cholesterol and protects the heart vessels', as_needed: false, source_quote: 'Tab. Atorvastatin 40 mg  0-0-1  HS  - to continue' },
      { name: 'Metoprolol XL', dose: '25 mg', morning: true, afternoon: false, night: true, food: 'unclear', duration: 'Continue', purpose: 'Slows the heart rate and lowers blood pressure', as_needed: false, source_quote: 'Tab. Metoprolol XL 25 mg  1-0-1  - to continue' },
      { name: 'Pantoprazole', dose: '40 mg', morning: true, afternoon: false, night: false, food: 'before food', duration: '1 month', purpose: 'Protects the stomach from the blood thinners', as_needed: false, source_quote: 'Tab. Pantoprazole 40 mg  1-0-0  AC  - x 1 month' },
      { name: 'Metformin', dose: '500 mg', morning: true, afternoon: false, night: true, food: 'after food', duration: 'Continue', purpose: 'Controls blood sugar (diabetes)', as_needed: false, source_quote: 'Tab. Metformin 500 mg  1-0-1  PC  - to continue' },
      { name: 'Sorbitrate', dose: '5 mg (under the tongue)', morning: false, afternoon: false, night: false, food: 'any time', duration: 'Only when chest pain comes', purpose: 'Quickly relieves chest pain. Keep it with you always.', as_needed: true, source_quote: 'Tab. Sorbitrate 5 mg  SL  SOS for chest pain' }
    ],
    follow_ups: [
      { what: 'Cardiology OPD review - bring all reports', when: '27/10/2026', date_iso: '2026-10-27' },
      { what: 'Blood tests: lipid profile and HbA1c', when: 'After 6 weeks', date_iso: null }
    ],
    warning_signs: [
      'Chest pain that does not go away 5 minutes after Sorbitrate',
      'Breathlessness',
      'Giddiness or fainting',
      'Black stools or blood in urine (can be bleeding from blood thinners)'
    ],
    home_care: [
      'Eat low salt, low fat food suitable for diabetes. Avoid ghee, fried foods and sweets.',
      'Walk 10 minutes twice a day and slowly increase.',
      'Do not lift anything heavier than 5 kg for 4 weeks.',
      'Stop smoking completely.',
      'Check BP and sugar at home and write them in a chart to show the doctor.'
    ],
    questions_for_doctor: [
      'Should Metoprolol be taken before or after food?',
      'What BP and sugar readings should make us call you?',
      'When can he go back to work and climb stairs normally?',
      'Is it safe to take painkillers like Combiflam with these blood thinners?'
    ],
    unclear_items: [
      'Food timing for Metoprolol XL is not written.',
      'Exact date for the 6-week blood tests is not given.'
    ]
  };

  const surgeryPlan = {
    patient_summary: 'The patient had an infected appendix (appendicitis). It was removed by keyhole surgery on 18/10/2026. She recovered well after the operation, is eating normally and her wounds are healing. She can rest at home and needs a short course of medicines.',
    terms_explained: [
      { term: 'Acute appendicitis', meaning: 'Sudden infection and swelling of the appendix, a small pouch attached to the bowel.' },
      { term: 'Laparoscopic appendicectomy', meaning: 'Removing the appendix through small cuts using a camera (keyhole surgery).' },
      { term: 'GA', meaning: 'General anaesthesia: she was fully asleep during the operation.' },
      { term: 'HPE report', meaning: 'A lab test of the removed appendix under a microscope, to confirm the diagnosis.' }
    ],
    medications: [
      { name: 'Cefuroxime', dose: '500 mg', morning: true, afternoon: false, night: true, food: 'after food', duration: '5 days', purpose: 'Antibiotic to prevent infection. Complete all 5 days.', as_needed: false, source_quote: 'Tab Cefuroxime 500mg  BD  x 5 days  after food' },
      { name: 'Dolo 650', dose: '650 mg', morning: true, afternoon: true, night: true, food: 'unclear', duration: '3 days, then only when there is pain', purpose: 'Relieves pain and fever', as_needed: false, source_quote: 'Tab Dolo 650  TDS x 3 days then SOS for pain' },
      { name: 'Pan 40', dose: '40 mg', morning: true, afternoon: false, night: false, food: 'before food', duration: '5 days', purpose: 'Protects the stomach from acidity', as_needed: false, source_quote: 'Tab Pan 40  OD  before breakfast x 5 days' },
      { name: 'Cremaffin syrup', dose: '15 ml', morning: false, afternoon: false, night: true, food: 'any time', duration: '5 days', purpose: 'Keeps stools soft so there is no straining', as_needed: false, source_quote: 'Syp Cremaffin  15 ml  HS x 5 days' },
      { name: 'Ondem', dose: 'unclear (4 mg?)', morning: false, afternoon: false, night: false, food: 'any time', duration: 'Only if vomiting', purpose: 'Stops vomiting', as_needed: true, source_quote: 'Tab Ondem ?4mg - if vomiting' }
    ],
    follow_ups: [
      { what: 'Suture removal in Surgery OPD', when: '28/10/2026', date_iso: '2026-10-28' },
      { what: 'Collect HPE (biopsy) report', when: 'At the review visit', date_iso: null }
    ],
    warning_signs: [
      'Fever above 101 F',
      'Redness or pus coming from the wound',
      'Severe stomach pain',
      'Vomiting that does not stop'
    ],
    home_care: [
      'Soft food for 3 days, then normal food. Drink plenty of fluids.',
      'Keep the dressing dry. Only sponge bath until stitches are removed.',
      'Do not lift heavy weights or drive for 2 weeks.'
    ],
    questions_for_doctor: [
      'What is the correct dose of Ondem, and how many times a day can she take it?',
      'Should Dolo 650 be taken after food?',
      'When can she return to housework or office work?'
    ],
    unclear_items: [
      'Ondem dose is written with a question mark ("?4mg"). Confirm the dose with the doctor or pharmacist.',
      'Food timing for Dolo 650 is not written.'
    ]
  };

  root.CareClearSamples = [
    { id: 'cardiac', label: 'Heart attack + stent (58 M)', text: cardiac, demoPlan: cardiacPlan, discharge: '2026-10-20' },
    { id: 'surgery', label: 'Appendix surgery (34 F)', text: surgery, demoPlan: surgeryPlan, discharge: '2026-10-20' }
  ];
})(typeof window !== 'undefined' ? window : this);
