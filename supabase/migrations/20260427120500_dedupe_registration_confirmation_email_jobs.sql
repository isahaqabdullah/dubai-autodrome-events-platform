-- Prevent duplicate QR confirmation jobs for the same registration. This is
-- a safety net for webhook, reconcile, return-page polling, and admin retry
-- races all reaching fulfillment around the same time.

update public.email_jobs duplicate
set status = 'failed',
    last_error = 'Duplicate registration confirmation suppressed before unique index.',
    updated_at = now()
from (
  select id
  from (
    select
      id,
      row_number() over (
        partition by payload->>'registrationId'
        order by
          case status
            when 'sent' then 0
            when 'processing' then 1
            when 'queued' then 2
            else 3
          end,
          created_at,
          id
      ) as duplicate_rank
    from public.email_jobs
    where kind = 'registration_confirmed'
      and payload->>'registrationId' is not null
  ) ranked
  where duplicate_rank > 1
) duplicate_rows
where duplicate.id = duplicate_rows.id;

create unique index if not exists email_jobs_registration_confirmed_registration_unique
  on public.email_jobs ((payload->>'registrationId'))
  where kind = 'registration_confirmed'
    and payload->>'registrationId' is not null
    and status <> 'failed';
