-- Turn email_jobs into a real queue: locked_at + attempts_max + claim RPC.

alter table public.email_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists attempts_max integer not null default 3;

-- Existing index (status, created_at) stays; add a partial index for the
-- hot-path worker scan (queued rows + reclaimable in-flight rows).
create index if not exists email_jobs_pending_idx
  on public.email_jobs (created_at)
  where status in ('queued', 'processing');

-- Atomically claim a batch of jobs. Returns rows transitioned to 'processing'.
-- A job is claimable if:
--   1) status = 'queued', OR
--   2) status = 'processing' and locked_at is older than p_lock_ttl_seconds
--      (a prior attempt crashed or timed out mid-send).
-- attempts is incremented; rows that have exhausted attempts_max are left
-- alone for the sweeper to mark failed.
create or replace function public.claim_email_jobs(
  p_limit integer default 5,
  p_lock_ttl_seconds integer default 120
)
returns table (
  id uuid,
  kind email_job_kind,
  payload jsonb,
  attempts integer,
  attempts_max integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.email_jobs j
    where (
      j.status = 'queued'
      or (
        j.status = 'processing'
        and j.locked_at is not null
        and j.locked_at < now() - make_interval(secs => p_lock_ttl_seconds)
      )
    )
    and j.attempts < j.attempts_max
    order by j.created_at asc
    for update skip locked
    limit p_limit
  )
  update public.email_jobs j
  set
    status = 'processing',
    attempts = j.attempts + 1,
    locked_at = now(),
    last_error = null
  from candidates c
  where j.id = c.id
  returning j.id, j.kind, j.payload, j.attempts, j.attempts_max;
end;
$$;

-- Mark rows still stuck in 'processing' past their attempts_max as failed.
-- Called by the worker so operators see them in the table rather than silent.
create or replace function public.fail_exhausted_email_jobs(
  p_lock_ttl_seconds integer default 120
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.email_jobs
  set status = 'failed',
      last_error = coalesce(last_error, 'exceeded attempts_max with stale lock')
  where status = 'processing'
    and attempts >= attempts_max
    and locked_at is not null
    and locked_at < now() - make_interval(secs => p_lock_ttl_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
