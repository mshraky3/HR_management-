# HR management system

A multi-branch HR platform for a healthcare and education company, built from scratch and in daily use. Arabic, right-to-left, with Hijri and Gregorian dates side by side.

> **The screenshots below use demo data.** The same code was run on a throwaway local database filled with invented people, branches and numbers. This repository contains no real employee data.

## What it does
- **Employees and branches.** One record per employee, linked to a primary branch; branch and head-office roles see only what they should (`main_manager`, `branch_manager`, `branch_operations_manager`).
- **Expiry dates.** Identity, residency and contract dates, with counts of what is expired, due in 30 and due in 90 days, and reminders sent to a branch. Daily alerts at 90, 60 and 30 days.
- **Year follow-up.** Each new school year every branch reviews its staff, documents and buses. One page shows which branches finished and exactly what is missing.
- **Staffing requirements.** From the beneficiaries enrolled and the therapies they receive, how many staff each branch needs per role, against who is employed.
- **Absence and payroll inputs, documents, student bus transport, notifications and tasks** per branch.
- **Reports** as Excel (ExcelJS) and PDF (PDFKit), with Hijri dates.

## Screens (demo data)
| | |
|---|---|
| ![Expiry dates](docs/screens/expiry.webp) | ![Year follow-up](docs/screens/year-cycle.webp) |
| Expiry dates per branch | Year follow-up per branch |
| ![Staffing requirements](docs/screens/staffing.webp) | ![Branch statistics](docs/screens/branch-statistics.webp) |
| Staff needed per role | Branch statistics with Excel export |

## Stack
- **Front end:** React 19, Vite, React Router, Recharts. Right-to-left Arabic UI.
- **Back end:** Node.js, Express 5, PostgreSQL (`postgres`), JWT sessions, one-time e-mail codes for operations-manager accounts, in-memory response cache with short expiry, composite indexes on the hot queries.
- **Files:** Cloudflare R2 (S3 API) for employee and branch documents.
- **Hosting:** Vercel (front end and API), Neon PostgreSQL.

## Layout
```
HR/express-app   API: routes/, models/, middleware/, database/ (schema + numbered migrations), utils/, test/
HR/react-app     Web app: src/pages, src/components, src/contexts
HR/backup-system Backup scripts (not deployed)
```

## Run it locally
You need Node.js and a local PostgreSQL (a UTF8 database).
```bash
# API
cd HR/express-app
npm ci
DATABASE_URL=postgres://user:pass@localhost:5432/hr JWT_SECRET=dev-secret INIT_DB_ON_STARTUP=true npm run dev

# Web app (second terminal)
cd HR/react-app
npm ci
VITE_API_URL=http://localhost:3000 npm run dev
```
The database host check only relaxes TLS for `localhost`, so a production URL is never used unencrypted. Create a head-office user row yourself; there is no seed data in this repository.

## Tests
`HR/express-app`: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/hrscratch npm test`. Integration tests run the real app against a local scratch database and refuse any non-localhost host.

## Error e-mail
Server errors (HTTP 500), failed login-code e-mails and error reports from the web app are mailed to the developer address (CRITICAL and HIGH only, 5-minute cooldown per error type and endpoint, 20 per hour per instance).
- **Routing.** Error mail follows `EMAIL_GATEWAY_MODE`, like every other HR mail: `off` (default) sends by direct SMTP; `on` sends through the e-mail gateway and falls back to direct SMTP when the gateway fails or rejects the call; `shadow` sends by SMTP and only records in the gateway.
- **Timing.** The error handlers wait for the mail, at most 8 seconds (`ERROR_MAIL_TIMEOUT_MS` overrides), then answer anyway. A slow or dead mail server never breaks a response.
- **Logs.** Errors are written with `console.error` and warnings with `console.warn`, so the Vercel runtime logs show them. Secrets stay redacted.
- **`ERROR_HEARTBEAT_ENABLED`**: must be exactly `true` (default off). The daily cron `GET /api/cron/daily-alerts` then also sends one short plain mail to the error-report address only, with the date and the result of one self-check (SMTP verify, gateway health in mode `on`). It runs even when `DAILY_ALERTS_ENABLED` is off, is skipped by `?dry=1`, and a failure never affects the alerts. If this mail stops arriving, the error-mail path or the cron is down.

## Notes
- Schema changes are numbered migrations in `HR/express-app/database/migrations`. A cheap schema guard runs on every cold start.
- Built and maintained by [Mahmoud Alshraky](https://alshraky.xyz).
