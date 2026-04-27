-- Prevent duplicate QR confirmation jobs for the same registration. This is
-- a safety net for webhook, reconcile, return-page polling, and admin retry
-- races all reaching fulfillment around the same time.

create unique index if not exists email_jobs_registration_confirmed_registration_unique
  on public.email_jobs ((payload->>'registrationId'))
  where kind = 'registration_confirmed';
