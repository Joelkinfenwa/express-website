"""Generates the sector partner pages from telehealth.html (the reference layout).
Re-run after editing the copy below: python3 scripts/verticals.py"""
import pathlib, html
SRC = pathlib.Path(__file__).resolve().parent.parent / 'src'
T = (SRC / 'telehealth.html').read_text()

def rep(s, old, new):
    assert s.count(old) == 1, f'expected one {old[:60]!r}, found {s.count(old)}'
    return s.replace(old, new)

def faq(q, a):
    return ('<details style="border-bottom: 1px solid #DCE0D8; padding: 20px 0">\n'
            f'<summary style="display: flex; justify-content: space-between; align-items: center; gap: 16px; font-weight: 700; font-size: 19px; min-height: 44px">{html.escape(q)}<span class="faq-plus" aria-hidden="true" style="font-size: 28px; font-weight: 400; color: #A4502E; transition: transform 0.2s">+</span></summary>\n'
            f'<p style="margin: 12px 0 0; color: #4B5650">{html.escape(a)}</p>\n</details>\n')

RESULTS_Q = ('Can results flow back into our platform?', 'Yes. Results can be returned through the API to your system or EMR, as well as to the requesting doctor.')
PANELS_Q = ('Can we use our own panels?', 'Yes. With white-label pathology we set up your panels under your brand, and patients order them through your service.')

ALL = [
    ('telehealth', 'Telehealth services'),
    ('mens-health-clinics', "Men's health clinics"),
    ('weight-management', 'Weight management programs'),
    ('womens-health', "Women's health"),
    ('longevity', 'Longevity and preventive health'),
    ('aged-care', 'Aged care and home care'),
    ('corporate-health', 'Corporate health'),
    ('insurance-medicals', 'Insurance medicals'),
    ('clinical-trials', 'Clinical trials'),
]

V = {
 'mens-health-clinics': dict(
   title="Pathology for men's health clinics", desc="Initial and follow-up pathology for men's health and hormone programs, collected at home or in a partner centre, under your brand.",
   eyebrow="Pathology for men's health clinics", h1="Hormone monitoring bloods, collected at your patients' door.",
   lead="Initial and follow-up pathology for men's health and hormone programs, under your brand, with results returned to your prescribers.",
   badge=("Follow-up bloods", "Nurse confirmed · Thursday 7:00 am"),
   ph2="Ongoing treatment means ongoing blood tests.",
   p1="Hormone programs depend on baseline bloods before treatment and regular monitoring after it. Every repeat test that relies on the patient finding time for a collection centre is a test that can slip.",
   p2="Express gives your patients the choice of a registered nurse at home or a nearby partner centre, using your own panels. Your clinicians receive results for review, and your team can see which patients are still waiting on collection.",
   faqs=[PANELS_Q, ('Can patients choose between a home visit and a collection centre?', 'Yes. Patients can book a home visit at an exact time, or walk in to a partner collection centre using the same order.'), RESULTS_Q],
   cta="Make repeat bloods easier for your patients."),
 'weight-management': dict(
   title='Pathology for weight management programs', desc='Baseline and monitoring pathology for medical weight management programs, collected at home or in a partner centre.',
   eyebrow='Pathology for weight management', h1='Baseline and monitoring bloods for your weight management patients.',
   lead='Pathology for medical weight management programs, collected at home or in a partner centre and returned to your clinicians.',
   badge=('Baseline bloods', 'Nurse confirmed · Monday 7:30 am'),
   ph2='Medical weight management relies on regular pathology.',
   p1='Patients typically need bloods before starting a program and at intervals throughout it. When every test means a trip to a collection centre, results arrive late or not at all.',
   p2='Express lets your patients book a registered nurse at home at an exact time, or walk in to a partner centre. Results go to your clinicians, and your team can see every order from booking to result.',
   faqs=[PANELS_Q, ('Can patients book early fasting appointments?', 'Yes. Patients can choose early-morning home visit times, which suits tests that require fasting.'), RESULTS_Q],
   cta="Keep your program's pathology on schedule."),
 'womens-health': dict(
   title="Pathology for women's health clinics", desc="Hormone and wellness pathology for menopause and women's health services, collected at home or in a partner centre.",
   eyebrow="Pathology for women's health", h1='Hormone and wellness pathology, collected wherever your patients are.',
   lead="Pathology for menopause, hormone and women's health services, under your brand, at home or in a partner centre.",
   badge=('Hormone panel', 'Nurse confirmed · Wednesday 8:00 am'),
   ph2='Hormone care involves regular, carefully timed tests.',
   p1="Women's health services often need bloods at specific times and repeated over months. Fitting those around work and family is where patients fall behind.",
   p2='Express brings a registered nurse to the patient at an exact time, or the patient walks in to a partner centre. Results go to your clinicians, and your team can see every order from booking to result.',
   faqs=[PANELS_Q, ('Can patients request a female nurse?', 'Patients can note a preference for a female nurse when booking, and we honour it wherever possible.'), RESULTS_Q],
   cta='Make pathology part of a better patient experience.'),
 'longevity': dict(
   title='Pathology for longevity and preventive health', desc='The pathology layer for longevity, preventive health and performance services: panels, at-home collection and results under your brand.',
   eyebrow='Pathology for longevity and preventive health', h1='Comprehensive panels, collected at home, under your brand.',
   lead='The pathology layer for longevity, preventive health and performance services: panels, collection and results, without building it yourself.',
   badge=('Comprehensive panel', 'Nurse confirmed · Tuesday 7:00 am'),
   ph2='Your members expect a premium experience, including the blood test.',
   p1='Preventive health services are built on regular, comprehensive testing. A walk-in centre visit can feel out of step with the rest of the experience you offer.',
   p2="Express brings a registered nurse to the member's home or workplace at an exact time, runs your panels under your brand, and returns results to your platform.",
   faqs=[PANELS_Q, ('Can we offer repeat testing on a schedule?', 'Yes. Repeat panels can be ordered through the API on whatever schedule your program uses.'), RESULTS_Q],
   cta='Deliver testing that matches your brand.'),
 'aged-care': dict(
   title='Pathology for aged care and home care', desc='Registered nurse pathology collections in residential aged care and in clients’ homes, booked by your team.',
   eyebrow='Pathology for aged care and home care', h1='Pathology collection for residents and clients, without the trip.',
   lead="Registered nurse collections in residential aged care and in clients' homes, booked by your team and returned to the treating doctor.",
   badge=('Booked by your team', 'Nurse confirmed · Friday 9:00 am'),
   ph2='Getting to a collection centre is hardest for the people who need tests most.',
   p1='Frail, older and less mobile clients often rely on staff or family to reach a collection centre. That adds cost, delay and stress for everyone involved.',
   p2="Express sends a registered nurse to the facility or the client's home at a confirmed time. Results go to the requesting doctor, and your team can see the status of every booking.",
   faqs=[('Can our staff book on behalf of residents and clients?', 'Yes. Your team can book on behalf of residents and clients, through the booking API or a booking page set up for your organisation.'),
         ('Do you collect in residential aged care facilities?', 'Yes. Nurses can attend residential facilities as well as private homes. Contact us to arrange access requirements for your facility.'),
         ('Where are results sent?', 'Results are sent to the requesting doctor, and can also be returned to your system through the API.')],
   cta='Bring pathology to your residents and clients.'),
 'corporate-health': dict(
   title='Corporate health screening', desc='Blood testing for your workforce, with registered nurses collecting on site or at employees’ homes and confidential reports for each employee.',
   eyebrow='Corporate health screening', h1='Blood testing for your workforce, at the workplace.',
   lead="Health screening programs for teams, with registered nurses collecting on site or at employees' homes, and a confidential, doctor-reviewed report for each employee.",
   badge=('On-site screening', 'Nurse confirmed · Monday 8:00 am'),
   ph2='Screening only works if people actually get tested.',
   p1='Asking employees to visit a collection centre in their own time is where many screening programs lose participation.',
   p2="Express brings registered nurses to your workplace or to employees' homes at confirmed times, using panels agreed with you. Each employee receives their own confidential report.",
   faqs=[('Can you collect on site for a whole team?', 'Yes. Contact us with your locations and team size and we will propose a collection schedule.'),
         ('Do employers see individual results?', 'No. Individual results are confidential to each employee unless they choose to share them.'),
         ('Can employees choose a home visit instead?', 'Yes. Employees who work remotely or are unavailable on the day can book a home visit.')],
   cta='Plan a screening program for your team.'),
 'insurance-medicals': dict(
   title='Pathology for life insurance medicals', desc='Underwriting pathology collected by registered nurses at the applicant’s home or workplace, booked through our API.',
   eyebrow='Life insurance medicals', h1="Underwriting bloods, collected at the applicant's door.",
   lead="Pathology collection for life insurance underwriting, booked through our API and collected by registered nurses at the applicant's home or workplace.",
   badge=('Underwriting bloods', 'Nurse confirmed · Wednesday 7:00 am'),
   ph2='Every day an applicant waits for bloods is a day the decision waits too.',
   p1='Underwriting often stalls at the pathology step, when applicants are asked to find time for a collection centre.',
   p2='Express lets applicants book a registered nurse at an exact time, at home or at work, with status visible to your team from booking to completion.',
   faqs=[('Can bookings be made from our underwriting system?', 'Yes. Our booking API lets your system check availability and book collections directly.'),
         ('Can we see the status of each collection?', 'Yes. Each booking can be tracked through the API, from confirmed to completed.'),
         ('Where are results sent?', 'Results are returned to the requesting party as agreed in your setup.')],
   cta='Reduce the time to an underwriting decision.'),
 'clinical-trials': dict(
   title='Clinical trial home visits', desc='Registered nurse home visits for decentralised and hybrid clinical trials, scheduled at exact times to fit your protocol.',
   eyebrow='Clinical trial home visits', h1="Trial collections at the participant's home.",
   lead='Registered nurse home visits for decentralised and hybrid clinical trials, scheduled at exact times to fit your protocol.',
   badge=('Protocol visit', 'Nurse confirmed · Tuesday 7:30 am'),
   ph2='Site visits are one of the biggest burdens on trial participants.',
   p1='Travelling to a site for routine collections adds to participant burden and can affect retention.',
   p2='Express sends a registered nurse to the participant at a scheduled time, with collection notes for any special handling, and delivers samples to the laboratory.',
   faqs=[('Can visits follow our protocol schedule?', 'Yes. Visits can be booked at exact times through the API to match your schedule.'),
         ('Can you handle special sample requirements?', 'Bookings can carry collection notes for special handling, such as chilled or time-critical samples. Contact us to confirm the requirements for your protocol.'),
         ('Which laboratories do you deliver to?', 'Contact us to discuss laboratory and courier requirements for your trial.')],
   cta='Discuss home visits for your trial.'),
}

def chips(current):
    out = ['<span style="font-weight: 700">Pathology for other services</span>\n<div style="display: flex; flex-wrap: wrap; gap: 10px">']
    for slug, label in ALL:
        if slug == current: continue
        out.append(f'<a href="/{slug}" style="padding: 10px 18px; border-radius: 999px; background: #FFFFFF; border: 1px solid #DCE0D8; font-weight: 600">{html.escape(label)}</a>')
    out.append('</div>')
    return '\n'.join(out)

def replace_chips(s, current):
    a = s.index('<!-- Other verticals -->'); a = s.index('>', s.index('<section', a)) + 1
    b = s.index('</section>', a)
    return s[:a] + '\n' + chips(current) + '\n' + s[b:]

# Telehealth keeps its copy; only its links to the other sectors are refreshed.
(SRC / 'telehealth.html').write_text(replace_chips(T, 'telehealth'))
T = (SRC / 'telehealth.html').read_text()

FAQ_BLOCK_START = '<div style="flex: 2 1 600px; min-width: 0; display: flex; flex-direction: column; border-top: 1px solid #1C2420">\n'
for slug, v in V.items():
    s = T
    s = rep(s, '<title>Pathology for telehealth services | Express Pathology</title>', f'<title>{html.escape(v["title"])} | Express Pathology</title>')
    s = s.replace('Add at-home blood collection and white-label pathology to your telehealth service, booked from your own platform with results returned to your doctors.', html.escape(v['desc'], quote=True))
    s = s.replace('{{siteUrl}}/telehealth', '{{siteUrl}}/' + slug)
    s = s.replace('content="Pathology for telehealth services | Express Pathology"', f'content="{html.escape(v["title"], quote=True)} | Express Pathology"')
    s = rep(s, '<a href="/telehealth" aria-current="page">Telehealth</a>', '<a href="/telehealth">Telehealth</a>')
    s = rep(s, '>Pathology for telehealth</span>', f'>{html.escape(v["eyebrow"])}</span>')
    s = rep(s, ">Your doctors order the test. We collect it at the patient's door.</h1>", f'>{html.escape(v["h1"])}</h1>')
    s = rep(s, '>Add at-home blood collection and white-label pathology to your telehealth service, booked from inside your own platform, with results returned to your doctors.</p>', f'>{html.escape(v["lead"])}</p>')
    s = rep(s, '>Booked from your platform</span>', f'>{html.escape(v["badge"][0])}</span>')
    s = rep(s, '>Nurse confirmed · Tomorrow 7:30 am</span>', f'>{html.escape(v["badge"][1])}</span>')
    s = rep(s, '>Telehealth is convenient until the patient needs a blood test.</h2>', f'>{html.escape(v["ph2"])}</h2>')
    s = rep(s, ">A consultation can happen from the patient's couch, but the request form usually sends them to a collection centre, on their own time, with no visibility for your clinical team.</p>", f'>{html.escape(v["p1"])}</p>')
    s = rep(s, '>Express closes that step. Patients book a registered nurse to their home or workplace at an exact time, or walk in to a partner centre. Your doctors receive the results, and your team can see every order from booking to result.</p>', f'>{html.escape(v["p2"])}</p>')
    s = rep(s, '>From consult to result, inside your service.</h2>', '>From order to result, inside your service.</h2>')
    s = rep(s, '>Your doctor selects a panel during or after the consultation.</span>', '>Your clinician selects the tests or panel required.</span>')
    s = rep(s, '>The patient picks a home visit time or a nearby centre, in your app or on your branded page.</span>', '>The patient, or your team on their behalf, books a home visit time or a nearby centre.</span>')
    s = rep(s, '>Results are sent to the requesting doctor and into your system, ready for the follow-up consult.</span>', '>Results are sent to the requesting doctor and can be returned to your system.</span>')
    s = rep(s, '>Telehealth questions</h2>', '>Common questions</h2>')
    a = s.index(FAQ_BLOCK_START) + len(FAQ_BLOCK_START); b = s.index('</div>\n</section>', a)
    s = s[:a] + ''.join(faq(q, ans) for q, ans in v['faqs']) + s[b:]
    s = rep(s, '>Add at-home pathology to your service.</h2>', f'>{html.escape(v["cta"])}</h2>')
    s = replace_chips(s, slug)
    (SRC / f'{slug}.html').write_text(s)
    print('wrote', slug)
