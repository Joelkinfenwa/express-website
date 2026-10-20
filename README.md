# expresspathology.com.au

The Express Pathology website: patient pages, partner pages and a build-your-own-test builder that reads products from Shopify and sends patients to Shopify checkout.

- **Hosting:** Vercel (static pages plus one serverless function for enquiry forms)
- **Shop and checkout:** Shopify, moved to `shop.expresspathology.com.au`. Checkout, Afterpay and Order Printer Pro keep working as they do now.
- **No framework.** Plain HTML, CSS and JavaScript, so the site is fast and easy to edit.

## Structure

| Path | What it is |
|---|---|
| `src/*.html` | One file per page: home, book (home visit request), tests, partners, telehealth, about, careers, prepare, contact, 404 |
| `src/assets/site.css` | Shared styles, header, footer, mobile rules |
| `src/assets/site.js` | Mobile menu and enquiry forms |
| `src/assets/builder.js` | Build-your-own-test (Shopify Storefront API) |
| `api/enquiry.js` | Receives partner and contact forms and sends them to HubSpot or by email |
| `site.config.json` | Every fact used on the site: fees, contact details, Shopify settings |
| `build.mjs` | Fills in the config, adds the sitemap and robots file, and **refuses to build if anything is missing or any placeholder text remains** |
| `vercel.json` | Clean URLs, security headers, and redirects for every old Shopify URL |

## 1. Fill in `site.config.json`

| Key | Example | Notes |
|---|---|---|
| `bookingUrl` | `/book` | Where "Book a nurse" goes. Currently the home visit request page. Postcode forms add `?postcode=2000` |
| `metroFee`, `regionalFee` | `$99` | Shown exactly as written |
| `cancellationPolicy` | One or two sentences | Shown in pricing and in the FAQ |
| `phone`, `phoneTel`, `email` | | Contact page, footer and structured data |
| `supportHours`, `abn` | | Optional. Hidden from the site when empty |
| `shopifyStoreDomain` | `express-pathology.myshopify.com` | The myshopify.com address |
| `shopifyStorefrontToken` | | Public Storefront API token from the Headless channel. This token is designed to be used on a public website |
| `shopifyTestsCollection` | `individual-tests` | Handle of the collection holding the individual tests |
| `shopifyHomeVisitVariantId` | `gid://shopify/ProductVariant/…` | Optional. A home visit fee product, added to the cart when the patient chooses a nurse |
| `gaMeasurementId`, `metaPixelId` | | Optional analytics |

Each value can also be set in Vercel as an environment variable named `SITE_` plus the key in capitals with underscores, for example `SITE_METRO_FEE`.

**Test categories:** the builder sorts tests by keywords in the product title. To place a test in a category yourself, add a Shopify tag `category:hormones` (or `general`, `heart`, `thyroid`, `nutrients`, `sexual`, `mens`).

## 2. Forms

In Vercel, under Project, Settings, Environment Variables, set up one of these:

- **HubSpot (recommended):** `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_ID`. Create a form in HubSpot with the fields email, firstname, lastname, company and message.
- **Email:** `RESEND_API_KEY`, `ENQUIRY_TO` (comma-separated) and `ENQUIRY_FROM` (an address on a domain verified in Resend).

## 3. Deploy

1. Push this repository to GitHub.
2. In Vercel, add a new project and import the repository. The build settings are read from `vercel.json`.
3. Check the preview URL Vercel gives you, including test checkout with one cheap test.

## 4. Go live (domain switch). Do this at a quiet time

1. **Shopify:** go to Settings, Domains. Connect `shop.expresspathology.com.au` and make it the **primary** domain. Checkout then runs on the shop subdomain.
2. **Vercel:** add `expresspathology.com.au` and `www.expresspathology.com.au` to the project.
3. **DNS** (at your domain registrar): point the root and `www` records to Vercel, using the values Vercel shows you. Point `shop` to Shopify (`shops.myshopify.com`).
4. **Shopify:** check that Order Printer Pro, Klaviyo and any app links still use the right domain.
5. **Google Search Console:** add the new site and submit `https://expresspathology.com.au/sitemap.xml`.

Every old link under `/products`, `/collections`, `/pages`, `/blogs`, `/policies`, `/cart` and `/account` redirects to the shop subdomain automatically, so existing links, ads and search results keep working.

## Local preview

```
npm run preview
```

You need a filled-in `site.config.json` first.

## Live booking (Doorstep)

The /book page books home visits straight into Doorstep through the site's own server functions (`api/doorstep/*`, shared code in `lib/doorstep.js`). Credentials never reach the browser.

Set these in Vercel under Settings, then Environment Variables:

| Name | Value |
|---|---|
| `DOORSTEP_CLIENT_ID` | Client ID for the website's own partner account in Doorstep |
| `DOORSTEP_CLIENT_SECRET` | Its client secret |
| `DOORSTEP_API_BASE` | Leave unset to use the **sandbox**. For live bookings set `https://api.bookings.expresspathology.com.au` and use production credentials |

Without the two credentials, /book shows the "request a home visit" form instead. In sandbox mode the page shows a notice that no nurse will be sent.

Booking flow: postcode, then coverage check, then 14 days of live slots shown in the patient's local time, then patient details. The site creates or updates the patient, creates the booking with an idempotency key, and attaches the referral if one was uploaded. If a slot is taken in the meantime, the patient is asked to pick another time.
