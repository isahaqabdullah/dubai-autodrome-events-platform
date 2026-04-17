# Dubai Autodrome Event Registration MVP

Production-shaped MVP for recurring event registration, email verification, QR confirmation, and event-day check-in. The system is designed so each new event edition is created as data from the admin panel, not as a new code path.

## Architecture

- Next.js App Router handles public pages, admin pages, and route handlers.
- Supabase Cloud Postgres stores events, pending registrations, final registrations, check-ins, audit logs, and email jobs.
- Supabase Auth is used only for staff/admin authentication.
- Attendee registration is accountless. Attendees verify a registration attempt with a secure token emailed through Resend.
- Critical transactional rules live in Postgres RPC functions:
  - `confirm_pending_registration`
  - `perform_checkin_scan`
  - `manual_checkin_registration`
  - `rotate_registration_qr_token`
- QR payloads carry only the opaque token. No attendee PII is embedded in the QR.

## Why events are data-driven and recurring

- Each occurrence is an `events` row with its own:
  - slug
  - schedule
  - registration window
  - status
  - capacity
  - declaration version and text
  - form configuration
- The public event route is always `/events/[slug]`.
- Adding a new edition means creating a new row from `/admin/events/new`.
- The same attendee email can register for a future edition because uniqueness is scoped to `(event_id, email_normalized)`.

## Why attendees do not use Supabase Auth

- Attendees do not need persistent accounts for v1.
- Registration trust is tied to a specific event registration attempt, not to a globally verified attendee account.
- Verification is done with a secure opaque token. Only the token hash is stored.
- Staff and admins still use Supabase Auth because those routes are protected operational tools.

## Features included

- Public event listing at `/events`
- Public event detail and registration at `/events/[slug]`
- Pending registration flow with email verification
- Final registration creation only after verification succeeds
- Confirmation email with server-generated QR image
- Protected scanner-first check-in page at `/check-in/[slug]`
- Datalogic keyboard-wedge support via a focused scan input
- Manual lookup and manual check-in fallback
- Admin dashboard with:
  - create/edit events
  - registration filters
  - resend QR
  - revoke registration
  - CSV export
  - analytics cards
  - scan analytics lists

## Environment variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`

Email delivery:

- `RESEND_API_KEY`
- `MAIL_FROM_NAME=Dubai Autodrome Events`
- `MAIL_FROM_EMAIL=info@example.com`
- `MAIL_REPLY_TO_EMAIL=info@example.com`

Optional seeding helpers:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_STAFF_EMAIL`
- `SEED_STAFF_PASSWORD`

If `RESEND_API_KEY` is missing, the mailer falls back to local mock mode and logs sends instead of calling Resend.

## Local development

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Run the Supabase migration in `supabase/migrations/20260409174500_init.sql`.
3. Install dependencies:

```bash
npm install
```

4. Seed sample events and optional staff/admin accounts:

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

## Supabase setup

- Apply the migration to create tables, enums, indexes, and RPC functions.
- Create staff/admin users with app metadata roles:
  - `{"role":"admin"}`
  - `{"role":"staff"}`
- The seed script can create those users automatically when the optional `SEED_*` variables are set.
- Store the service role key only in server-side environments.

## Resend setup

- The app uses the official Resend Node SDK.
- Create a Resend API key and set `RESEND_API_KEY`.
- Visible sender name is driven by `MAIL_FROM_NAME`; the underlying sender address and reply-to are driven by `MAIL_FROM_EMAIL` and `MAIL_REPLY_TO_EMAIL`.
- Verify the sending domain in Resend before using a production sender address.
- The current MVP sends HTML and text emails through `resend.emails.send`.
- QR images are rendered from the app’s own `/api/qr` route so email clients fetch a real server-generated image.

## Vercel deployment notes

- Deploy as a standard Next.js project.
- Set the environment variables in Vercel Project Settings.
- The route handlers and server components expect server-side access to:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - AWS secrets
- No separate backend server is required for v1.

## Event creation flow

1. Admin signs in with Supabase Auth.
2. Admin opens `/admin/events/new`.
3. Admin creates a new event edition row with its own slug, dates, declaration version, and form config.
4. The new edition becomes available automatically at `/events/[slug]`.

## Scanner workflow

- Staff open `/check-in/[slug]`.
- The large scan input stays focused for keyboard-wedge scanners.
- Datalogic scanners can emit the token and Enter/newline suffix directly into the input.
- The page auto-submits on Enter/newline and shows a large result state.
- Manual search by name/email/phone is available as fallback.

## Analytics design

The system records every scan attempt in `checkins`, including:

- `success`
- `already_checked_in`
- `invalid_token`
- `revoked`
- `wrong_event`

Dashboard metrics derive from:

- `registrations` for total registered and total checked in
- `checkins` for total scan attempts and result breakdowns
- grouped `checkins` for scans by gate and scans over time

## Duplicate prevention

- Email addresses are normalized server-side before use.
- The database enforces `unique(event_id, email_normalized)` in `registrations`.
- Confirmation re-checks uniqueness inside the transactional RPC before inserting the final row.
- That means two simultaneous verification attempts cannot both create final registrations for the same event edition.

## How one event edition differs from another

- New edition means new `events.id`
- New uniqueness boundary for registrations
- New registration window
- New declaration version and text
- New QR token pool
- New scan analytics timeline

## Tests

The repository includes unit tests for:

- opaque token generation and hashing
- duplicate registration rules across event editions

Run them with:

```bash
npm test
```

## Pragmatic MVP simplifications

- Rate limiting uses an in-memory scaffold in the app runtime. For production at larger scale, replace it with a shared store such as Redis or a durable edge cache.
- Email jobs are recorded in Postgres but processed inline in the request for v1.
- Scan analytics grouping is aggregated in application code for the current MVP.
