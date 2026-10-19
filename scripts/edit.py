"""One-off launch edits applied to the converted pages: shared header/footer,
real links, config tokens, and removal of sections whose content is not yet
available. Each replacement asserts it matched, so nothing is silently skipped."""
import re, pathlib
SRC = pathlib.Path(__file__).resolve().parent.parent / 'src'

def load(n): return (SRC / n).read_text()
def save(n, s): (SRC / n).write_text(s)

def rep(s, old, new, count=1):
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:70]!r}, found {n}'
    return s.replace(old, new)

def cut(s, start_marker, end_marker, new=''):
    """Replace from start_marker up to (not including) end_marker."""
    a = s.index(start_marker); b = s.index(end_marker, a)
    return s[:a] + new + s[b:]

def sub1(s, pattern, new, flags=re.S):
    out, n = re.subn(pattern, new, s, count=1, flags=flags)
    assert n == 1, f'pattern not found: {pattern[:70]}'
    return out

MENU_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>'

def header(current, partner=False):
    if partner:
        links = [('/partners#offer', 'Services', 'partners'), ('/telehealth', 'Telehealth', 'telehealth'),
                 ('/partners#integrate', 'Integration', None), ('/about', 'About', 'about'), ('/', 'For patients', None)]
        logo = '<a href="/partners" class="logo" aria-label="Express Pathology partners"><b>express</b><i></i><span>partners</span></a>'
        actions = '<a href="/partners#enquire" class="btn btn-dark">Talk to partnerships</a>'
    else:
        links = [('/#how', 'At-home collection', None), ('/tests', 'Blood tests', 'tests'), ('/partners', 'Partners', 'partners'),
                 ('/about', 'About', 'about'), ('/prepare', 'Help', 'prepare')]
        logo = '<a href="/" class="logo" aria-label="Express Pathology home"><b>express</b><i></i><span>pathology</span></a>'
        actions = '<a href="{{shopUrl}}/account" class="quiet">Sign in</a><a href="{{bookingUrl}}" class="btn btn-dark">Book a nurse</a>'
    items = ''.join(f'<a href="{h}"' + (' aria-current="page"' if k and k == current else '') + f'>{t}</a>' for h, t, k in links)
    return (f'<a class="skip" href="#main">Skip to content</a>\n<header class="site-header">\n<nav aria-label="Main" class="nav">\n{logo}\n'
            f'<div class="nav-links" id="nav-links">{items}</div>\n<div class="nav-actions">{actions}'
            f'<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu">{MENU_ICON}</button></div>\n</nav>\n</header>\n<main id="main">\n')

FOOTER = '''</main>
<footer class="site-footer">
<div class="footer-inner">
<div class="footer-cols">
<div class="footer-col"><span class="footer-brand">express<em>.</em></span><span>Mobile blood collection and pathology infrastructure across Australia.</span></div>
<div class="footer-col"><strong>Patients</strong><a href="{{bookingUrl}}">Book a home visit</a><a href="/tests">Blood tests</a><a href="/prepare">Preparing for your visit</a><a href="{{shopUrl}}/pages/collection-centres">Collection centres</a></div>
<div class="footer-col"><strong>Partners</strong><a href="/partners">Partner with Express</a><a href="/telehealth">Telehealth</a><a href="/partners#integrate">Integration</a><a href="/partners#enquire">Partner enquiries</a></div>
<div class="footer-col"><strong>Company</strong><a href="/about">About</a><a href="/careers">Nurse careers</a><a href="/contact">Contact</a><a href="{{shopUrl}}/policies/privacy-policy">Privacy policy</a><a href="{{shopUrl}}/policies/terms-of-service">Terms of service</a></div>
</div>
<div class="footer-legal">
<p>Express Pathology provides pathology collection and private testing services. Results are for informational purposes and do not constitute a medical diagnosis. Always consult a qualified healthcare professional to interpret your results.</p>
<p>© 2026 Express Pathology · ABN {{abn}}</p>
</div>
</div>
</footer>
'''

def frame(s, current, partner=False):
    s = cut(s, '<!-- Navigation -->', '<!-- ', '') if False else s
    a = s.index('<!-- Navigation -->'); b = s.index('</header>', a) + len('</header>')
    s = s[:a] + header(current, partner) + s[b:]
    a = s.index('<!-- Footer -->'); b = s.index('</footer>', a) + len('</footer>')
    s = s[:a] + FOOTER + s[b:]
    # outer wrapper div carries inline font styles already set in CSS
    return s

def postcode_form(s, input_id, label_extra=''):
    """Turn a postcode form into a GET form that hands the postcode to the booking page."""
    i = s.index(f'id="{input_id}"')
    fa = s.rindex('<form ', 0, i)
    s = s[:fa] + '<form action="{{bookingUrl}}" method="get" ' + s[fa + len('<form '):]
    s = rep(s, f'id="{input_id}" type="text"', f'id="{input_id}" name="postcode" type="text" autocomplete="postal-code"')
    return s

SHOP = {
    'General Health Check': '{{shopUrl}}/products/general-health',
    'Male Hormonal Panel': '{{shopUrl}}/pages/male-hormonal-page',
    'Ultimate Performance': '{{shopUrl}}/products/ultimate-performance-screen',
    "Women's Wellness Plus": '{{shopUrl}}/pages/womens-wellness',
    'Complete Wellness Panel': '{{shopUrl}}/products/complete-wellness-panel',
    'Advanced Longevity Panel': '{{shopUrl}}/products/advanced-longevity-panel',
}

def link_panels(s):
    # every <a href="/tests" ...> that wraps a panel name gets that panel's shop URL
    def fix(m):
        block = m.group(0)
        for name, url in SHOP.items():
            if f'>{name}<' in block:
                return block.replace('href="/tests"', f'href="{url}"', 1)
        return block
    return re.sub(r'<a href="/tests"[^>]*>.*?</a>', fix, s, flags=re.S)

# ---------------- index ----------------
s = load('index.html')
s = frame(s, None)
s = rep(s, '<a href="#partners" style="display: flex; flex-wrap: wrap; justify-content: center', '<a href="/partners" style="display: flex; flex-wrap: wrap; justify-content: center')
s = postcode_form(s, 'hero-postcode')
s = rep(s, '<button type="button" style="min-height: 52px; padding: 0 26px; border: 0; border-radius: 999px; background: #F2A981', '<button type="submit" style="min-height: 52px; padding: 0 26px; border: 0; border-radius: 999px; background: #F2A981')
s = sub1(s, r'<div role="img" aria-label="Photo placeholder: nurse and patient at a kitchen table".*?</div>\n', '')
s = rep(s, '<a href="#" style="padding: 0 24px; border-radius: 999px; border: 1px solid #5B7A6E', '<a href="/partners#integrate" style="padding: 0 24px; border-radius: 999px; border: 1px solid #5B7A6E')
s = rep(s, '>API documentation</a>', '>How integration works</a>')
s = sub1(s, r'<div style="display: flex; flex-direction: column; gap: 18px">\n<span[^>]*>Working with clinics and health platforms across Australia</span>.*?</div>\n</div>\n', '')
s = link_panels(s)
s = postcode_form(s, 'cov-postcode')
s = rep(s, '>Check coverage</button>', '>Check coverage</button>')
s = rep(s, '<button type="button" style="min-height: 50px; padding: 0 22px; border: 0; border-radius: 999px; background: #17302A', '<button type="submit" style="min-height: 50px; padding: 0 22px; border: 0; border-radius: 999px; background: #17302A')
s = sub1(s, r'<div role="img" aria-label="Coverage map placeholder".*?</div>\n', '')
s = rep(s, 'The fee covers the nurse, travel and sample transport. Laboratory testing is billed separately by the laboratory, or included if you order a test from us.', 'The fee covers the nurse, travel and sample transport. {{labBillingNote}}')
s = rep(s, '[METRO FEE]', '{{metroFee}}')
s = rep(s, '[REGIONAL FEE]', '{{regionalFee}}')
s = rep(s, '[CONFIRM CANCELLATION POLICY AND MEDICARE BILLING WORDING]', '{{cancellationPolicy}}')
s = cut(s, '<!-- Reviews -->', '<!-- FAQ -->')
s = rep(s, '[CONFIRM HOME VISIT PRICING AND LAB BILLING WORDING]', 'A home visit is {{metroFee}} in metro areas and {{regionalFee}} in regional areas. {{labBillingNote}}')
s = rep(s, '[CONFIRM RESCHEDULE AND CANCELLATION POLICY]', '{{cancellationPolicy}}')
s = rep(s, '<a href="/#tests" style="flex: 0 0 auto', '<a href="/tests" style="flex: 0 0 auto')
s = s.replace('href="#book"', 'href="{{bookingUrl}}"')
save('index.html', s)

# ---------------- tests ----------------
s = load('tests.html')
s = frame(s, 'tests')
s = link_panels(s)
a = s.index('<!-- Build your own -->'); b = s.index('<!-- How it works -->')
s = s[:a] + (SRC.parent / 'scripts' / 'builder.html').read_text() + '\n' + s[b:]
s = sub1(s, r'<details[^>]*><summary[^>]*>Can I add tests to a panel\?.*?</details>\n', '')
s = rep(s, '<script src="/assets/site.js" defer></script>', '<script src="/assets/site.js" defer></script>\n<script>window.EXPRESS_SHOP={store:"{{shopifyStoreDomain}}",token:"{{shopifyStorefrontToken}}",version:"{{shopifyApiVersion}}",collection:"{{shopifyTestsCollection}}",shopUrl:"{{shopUrl}}",homeVisitVariant:"{{shopifyHomeVisitVariantId}}",homeVisitLabel:"{{metroFee}}"};</script>\n<script src="/assets/builder.js" defer></script>')
save('tests.html', s)

# ---------------- partners ----------------
s = load('partners.html')
s = frame(s, 'partners', partner=True)
s = rep(s, '[BOOKING-REF]', 'Example collection')
s = sub1(s, r'<pre style=.*?</pre>\n', '')
s = rep(s, '<a href="#" style="align-self: flex-start; font-weight: 700; text-decoration: underline; text-underline-offset: 4px">Read the API documentation</a>', '<a href="#enquire" style="align-self: flex-start; font-weight: 700; text-decoration: underline; text-underline-offset: 4px">Request the API documentation</a>')
s = cut(s, '<!-- Case study -->', '<!-- Enquiry -->')
s = rep(s, 'We will come back within one business day with coverage for your patient base and a proposed setup.', 'We will come back to you with coverage for your patient base and a proposed setup.')
s = sub1(s, r'<details[^>]*>\n<summary[^>]*>How quickly can we go live\?.*?</details>\n', '')
s = sub1(s, r'<details[^>]*>\n<summary[^>]*>How is patient data protected\?.*?</details>\n', '')
save('partners.html', s)

# ---------------- telehealth ----------------
s = load('telehealth.html')
s = frame(s, 'telehealth', partner=True)
s = sub1(s, r'<details[^>]*>\n<summary[^>]*>How long does integration take\?.*?</details>\n', '')
s = rep(s, '<a href="#" style="padding: 0 26px; border-radius: 999px; border: 1px solid #1C2420; font-weight: 700; min-height: 52px; display: inline-flex; align-items: center">API documentation</a>', '<a href="/partners#integrate" style="padding: 0 26px; border-radius: 999px; border: 1px solid #1C2420; font-weight: 700; min-height: 52px; display: inline-flex; align-items: center">How integration works</a>')
s = rep(s, '<span style="font-weight: 700">Pathology for other services</span>', '<span style="font-weight: 700">We also work with</span>')
s = re.sub(r'<a href="#" (style="padding: 10px 18px;[^"]*")>(.*?)</a>', r'<span \1>\2</span>', s)
save('telehealth.html', s)

# ---------------- about ----------------
s = load('about.html')
s = frame(s, 'about')
s = sub1(s, r'<p style="margin: 0">\[FOUNDER STORY:.*?</p>\n', '')
s = cut(s, '<!-- Team -->', '<!-- Two CTAs -->')
save('about.html', s)

# ---------------- careers ----------------
s = load('careers.html')
s = frame(s, None)
s = rep(s, '[CONFIRM PAYMENT TERMS AND FREQUENCY]', 'Paid for every collection you complete.')
s = cut(s, '<!-- Requirements -->', '<!-- Apply -->')
s = rep(s, '[CONFIRM WHERE YOU ARE CURRENTLY RECRUITING]', 'Create your profile and our team will be in touch to complete onboarding.')
s = rep(s, '<a href="#" style="padding: 0 28px; border-radius: 999px; background: #17302A', '<a href="{{nurseApplyUrl}}" style="padding: 0 28px; border-radius: 999px; background: #17302A')
save('careers.html', s)

# ---------------- prepare ----------------
s = load('prepare.html')
s = frame(s, 'prepare')
s = sub1(s, r'<li style="display: flex; gap: 10px">[^\n]*Most visits take about \[X\] minutes\.</li>\n', '')
s = sub1(s, r'<div style="display: flex; flex-wrap: wrap; justify-content: space-between[^"]*"><span style="font-weight: 700">If fasting is required</span>.*?</div>\n', '')
s = sub1(s, r'<div style="display: flex; flex-wrap: wrap; justify-content: space-between[^"]*"><span style="font-weight: 700">Hormone tests</span>.*?</div>\n', '')
s = rep(s, '[CONFIRM RESCHEDULE AND CANCELLATION POLICY]', '{{cancellationPolicy}}')
s = sub1(s, r'<details[^>]*><summary[^>]*>Can you collect from a child\?.*?</details>\n', '')
s = rep(s, ' [CONFIRM TYPICAL TURNAROUND]', '')
save('prepare.html', s)

# ---------------- contact ----------------
s = load('contact.html')
s = frame(s, None)
s = rep(s, '[PHONE NUMBER]', '{{phone}}')
s = rep(s, '[SUPPORT EMAIL]', '<a href="mailto:{{email}}">{{email}}</a>')
s = rep(s, '[SUPPORT HOURS]', '{{supportHours}}')
save('contact.html', s)
# ---------------- forms ----------------
STATUS = '<p class="form-status" role="status" aria-live="polite"></p>\n'
HONEYPOT = '<div class="sr-only" aria-hidden="true"><label>Leave this empty<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label></div>\n'

s = load('partners.html')
s = rep(s, '<form style="flex: 1 1 520px', '<form data-enquiry="partner" action="/api/enquiry" method="post" style="flex: 1 1 520px')
for i, n in [('p-name', 'name'), ('p-email', 'email'), ('p-org', 'organisation'), ('p-type', 'organisation_type'), ('p-vol', 'monthly_volume'), ('p-need', 'interest'), ('p-msg', 'message')]:
    s = rep(s, f'id="{i}"', f'id="{i}" name="{n}"' + (' required' if n in ('name', 'email', 'organisation') else ''))
s = rep(s, '<button type="button" style="grid-column: 1 / -1; min-height: 54px; border: 0; border-radius: 999px; background: #F2A981', HONEYPOT + STATUS + '<button type="submit" style="grid-column: 1 / -1; min-height: 54px; border: 0; border-radius: 999px; background: #F2A981')
save('partners.html', s)

s = load('contact.html')
s = rep(s, '<form style="flex: 1 1 520px', '<form data-enquiry="contact" action="/api/enquiry" method="post" style="flex: 1 1 520px')
for i, n in [('c-name', 'name'), ('c-email', 'email'), ('c-topic', 'topic'), ('c-msg', 'message')]:
    s = rep(s, f'id="{i}"', f'id="{i}" name="{n}"' + (' required' if n != 'topic' else ''))
s = rep(s, '<button type="button" style="grid-column: 1 / -1; min-height: 54px; border: 0; border-radius: 999px; background: #17302A', HONEYPOT + STATUS + '<button type="submit" style="grid-column: 1 / -1; min-height: 54px; border: 0; border-radius: 999px; background: #17302A')
save('contact.html', s)
print('edits applied')
