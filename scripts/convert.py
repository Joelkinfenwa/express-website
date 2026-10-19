"""One-off converter: turns the design canvas artboards (.dc.html) into plain
HTML pages for the production site. Run once; the output in src/ is then the
source of truth and is edited directly."""
import re, sys, pathlib

SRC = pathlib.Path(sys.argv[1])          # folder holding the .dc.html files
OUT = pathlib.Path(sys.argv[2])          # src/ folder of the site

PAGES = {
    'Main.dc.html':       ('index.html',      'Mobile blood collection at your door', 'Book a registered nurse to collect your blood test at home or at work, at an exact time. Private blood tests without a referral, and pathology infrastructure for clinics and health platforms.'),
    'Tests.dc.html':      ('tests.html',      'Blood tests without a referral',       'Choose a blood test panel or build your own from individual tests. Collected by a nurse at home or at 2,000+ partner centres, with doctor-reviewed results.'),
    'Partners.dc.html':   ('partners.html',   'Pathology infrastructure for partners', 'Mobile collection, white-label pathology and a booking and results API for clinics, telehealth services and health platforms across Australia.'),
    'Telehealth.dc.html': ('telehealth.html', 'Pathology for telehealth services',    'Add at-home blood collection and white-label pathology to your telehealth service, booked from your own platform with results returned to your doctors.'),
    'About.dc.html':      ('about.html',      'About Express Pathology',              'Express Pathology brings pathology to people, and to the services that care for them, through a national network of mobile collectors and partner centres.'),
    'Careers.dc.html':    ('careers.html',    'Nurse and collector careers',          'Join the Express Pathology mobile network. Set your own service area and availability and get paid for every collection.'),
    'Prepare.dc.html':    ('prepare.html',    'Preparing for your home visit',        'How to prepare for your Express Pathology home blood collection, including fasting, what to have ready and what happens on the day.'),
    'Contact.dc.html':    ('contact.html',    'Contact Express Pathology',            'Contact Express Pathology about a booking, results, ordering a test or partnering with us.'),
}

LINKS = {
    'Main.dc.html': '/', 'Tests.dc.html': '/tests', 'Partners.dc.html': '/partners',
    'Telehealth.dc.html': '/telehealth', 'About.dc.html': '/about', 'Careers.dc.html': '/careers',
    'Prepare.dc.html': '/prepare', 'Contact.dc.html': '/contact',
    'Booking.dc.html': '{{bookingUrl}}', 'Test.dc.html': '/tests', 'Suburb.dc.html': '/',
}

HEAD = '''<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | Express Pathology</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{{{{siteUrl}}}}{path}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title} | Express Pathology">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{{{{siteUrl}}}}/assets/img/og.jpg">
<meta property="og:url" content="{{{{siteUrl}}}}{path}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#17302A">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;family=Figtree:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<!--analytics-->
</head>
<body>
'''

for dc, (out, title, desc) in PAGES.items():
    s = (SRC / dc).read_text()
    body = s[s.index('<x-dc>') + 6: s.index('</x-dc>')]
    body = re.sub(r'<helmet>.*?</helmet>', '', body, flags=re.S).strip()
    for k, v in LINKS.items():
        body = body.replace(f'href="{k}#', f'href="{v}#' if not v.startswith('{{') else f'href="{v}')
        body = body.replace(f'href="{k}"', f'href="{v}"')
    body = body.replace('/_blob/da86563a978ef0dc003774a8aecc17e4', '/assets/img/hero.webp')
    path = '/' if out == 'index.html' else '/' + out[:-5]
    page = HEAD.format(title=title, desc=desc, path=path) + body + '\n<script src="/assets/site.js" defer></script>\n</body>\n</html>\n'
    (OUT / out).write_text(page)
    print('wrote', out, len(page))
