# Inscription à la formation des entraîneurs

French responsive one-page registration website for Ligue Marrakech-Tensift-Al Haouz de Bodybuilding et Fitness. Source includes a deployment workflow; Google Sheets activation still requires owner configuration.

## Architecture

GitHub Pages serves a full-height frame containing the Google Apps Script web app. Apps Script serves the form and uses `google.script.run` to communicate with its backend. This avoids cross-origin fetch and opaque `no-cors` submissions: the interface only confirms success after an acknowledged Sheet write. The standalone build is an explicitly closed preview until configured.

The server validates all seven fields and consent, normalizes CINs, checks duplicates, and enforces the 80-entry limit inside one script lock. Every valid submission immediately consumes one place; there is no manual approval stage. Formula prefixes are escaped. Only aggregate availability and the submitter's reference are returned. No list of participants, browser storage, analytics, or third-party fonts are used.

## Run checks and build

Requires Node.js 24, no package installation:

```
npm test
npm run build
```

Open `dist/index.html` to inspect the closed preview. This does not store registrations.

## Activate Google Sheets (owner configuration required)

1. Create a private Google Sheet owned by the league; do not publish it or enable link sharing. Give access only to registration staff.
2. Create an Apps Script project. Add `Code.gs`, `Index.html` and the manifest from the repository root. Keep exactly these file names. Enable manifest display in project settings if necessary.
3. Set Script Properties (never put these in frontend files): `SPREADSHEET_ID` to the Sheet ID; `REGISTRATION_OPEN` to `false`; `PRIVACY_NOTICE` to the league-approved French notice. The notice needs the responsible organisation/contact, purpose, collected fields, authorized recipients, actual retention/deletion period and how participants request access/correction/deletion. Obtain the league's actual details before opening.
4. Run `setup_` in the editor and authorize Sheet access. It creates the `Inscriptions` tab and headers without overwriting existing rows.
5. Replace the visibly marked logo, dates, venue and WhatsApp placeholders in `Index.html` using league-provided material. Do not invent endorsements, dates or contact information.
6. Deploy as a Web app, executing as the owner and accessible to Anyone. Google account authorization and the selected account's deployment policy must permit anonymous visitors. Copy the `/exec` URL, not the `/dev` URL.
7. Put that URL in `config.json` as `appsScriptUrl`. GitHub Pages hosts no credentials or participant data. The iframe is deliberately embeddable; embed permissions are not an authentication boundary.
8. Perform the live acceptance checks below in a separate test Sheet/deployment. Then point production to a clean private Sheet, run setup, set `REGISTRATION_OPEN=true`, and verify the notice and remaining-place counter before sharing the link.
9. In the chosen GitHub repository, enable Settings → Pages → Source: GitHub Actions. The included workflow tests/builds/deploys on pushes to `main` and manual dispatch. Adjust the branch if the selected repository uses another default branch. Review existing workflows before merging.

Use only one Apps Script project as the writer for this event. A script lock cannot coordinate another Apps Script project or staff editing the Sheet. Treat rows as append-only during registration: deleting rows reopens places and removes duplicate protection. To close registration set `REGISTRATION_OPEN=false`. Update the deployed Apps Script version after source changes.

## Acceptance checks

Automated tests use in-memory Google service substitutes, not the live Google service. They cover successful writes, normalized duplicate CINs, 80th/81st entries, input validation, consent, closure, lock contention, formula handling and backend failures. They do not prove live quotas, Google authorization, iframe policy, browser layout, or concurrency behavior of Google's runtime.

Before launch, test with synthetic information only: desktop and narrow mobile layout; invalid required fields; first successful submission and reference; same CIN with spaces/case changes; 79 existing test registrations followed by two concurrent submissions (only one succeeds); network failure without a false success; closed registration; inaccessible Sheet; no public access to Sheet rows. Remove the test deployment or close it after testing. Never put real CINs into test fixtures, issues, screenshots or Git history.

## Privacy and operational limits

No personal data is logged deliberately. The Sheet contains raw CIN and contact data because the league needs registration records; restrict access and delete data according to the league's approved retention policy. Consent is recorded alongside the submission timestamp. The application does not verify ownership of a CIN or phone number. A hidden honeypot blocks simple bots but is not robust abuse protection; anonymous callers can consume places or Google service quotas. Consider additional verified anti-abuse controls if the public campaign attracts abuse. Duplicate refusals use generic language, although a change in outcome can still allow inference. Google service quotas and network failures can interrupt registrations; monitor the private Sheet and close the form when necessary. No notification emails or WhatsApp messages are sent.

Official implementation references: [HTML-service communication](https://developers.google.com/apps-script/guides/html/communication), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service).
