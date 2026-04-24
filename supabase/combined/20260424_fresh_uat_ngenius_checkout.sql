-- Combined fresh-database schema for N-Genius checkout UAT.
-- Generated from supabase/migrations in timestamp order.
-- Apply only to the separate fresh Supabase project/database, not production.

-- ============================================================
-- Source: supabase/migrations/20260409174500_init.sql
-- ============================================================
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type event_status as enum ('draft', 'open', 'closed', 'live', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'registration_status') then
    create type registration_status as enum ('registered', 'checked_in', 'cancelled', 'revoked');
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_result') then
    create type checkin_result as enum ('success', 'already_checked_in', 'invalid_token', 'revoked', 'wrong_event');
  end if;

  if not exists (select 1 from pg_type where typname = 'email_job_kind') then
    create type email_job_kind as enum ('verify_email', 'registration_confirmed', 'resend_qr');
  end if;

  if not exists (select 1 from pg_type where typname = 'email_job_status') then
    create type email_job_status as enum ('queued', 'processing', 'sent', 'failed');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  venue text,
  timezone text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status event_status not null default 'draft',
  capacity integer,
  declaration_version integer not null default 1,
  declaration_text text not null,
  form_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_capacity_positive check (capacity is null or capacity > 0),
  constraint events_time_range check (end_at > start_at)
);

create table if not exists public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  email_raw text not null,
  email_normalized text not null,
  phone text,
  company text,
  emergency_contact_name text,
  emergency_contact_phone text,
  declaration_version integer not null,
  declaration_accepted boolean not null default false,
  verification_token_hash text not null,
  verification_expires_at timestamptz not null,
  verified_at timestamptz,
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  email_raw text not null,
  email_normalized text not null,
  phone text,
  company text,
  emergency_contact_name text,
  emergency_contact_phone text,
  declaration_version integer not null,
  declaration_accepted_at timestamptz not null,
  email_verified_at timestamptz not null,
  status registration_status not null default 'registered',
  qr_token_hash text not null unique,
  qr_token_last_rotated_at timestamptz not null default now(),
  confirmation_email_sent_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_event_email_unique unique (event_id, email_normalized)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  result checkin_result not null,
  gate_name text,
  device_id text,
  staff_user_id uuid,
  scanned_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind email_job_kind not null,
  payload jsonb not null default '{}'::jsonb,
  status email_job_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_status_start_idx on public.events(status, start_at);
create index if not exists events_slug_idx on public.events(slug);
create index if not exists pending_registrations_event_email_idx on public.pending_registrations(event_id, email_normalized);
create index if not exists pending_registrations_token_idx on public.pending_registrations(verification_token_hash);
create index if not exists registrations_event_status_idx on public.registrations(event_id, status);
create index if not exists registrations_lookup_idx on public.registrations(event_id, email_normalized, full_name);
create index if not exists checkins_event_scanned_idx on public.checkins(event_id, scanned_at desc);
create index if not exists checkins_event_result_idx on public.checkins(event_id, result);
create index if not exists email_jobs_status_idx on public.email_jobs(status, created_at);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

drop trigger if exists set_registrations_updated_at on public.registrations;
create trigger set_registrations_updated_at
before update on public.registrations
for each row
execute function public.set_updated_at();

drop trigger if exists set_email_jobs_updated_at on public.email_jobs;
create trigger set_email_jobs_updated_at
before update on public.email_jobs
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.pending_registrations enable row level security;
alter table public.registrations enable row level security;
alter table public.checkins enable row level security;
alter table public.audit_logs enable row level security;
alter table public.email_jobs enable row level security;

create or replace function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    company,
    emergency_contact_name,
    emergency_contact_phone,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.company,
    pending_row.emergency_contact_name,
    pending_row.emergency_contact_phone,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

create or replace function public.perform_checkin_scan(
  p_event_id uuid,
  p_qr_token_hash text,
  p_gate_name text default null,
  p_device_id text default null,
  p_staff_user_id uuid default null
)
returns table (
  result text,
  registration_id uuid,
  full_name text,
  event_id uuid,
  checked_in_at timestamptz,
  registration_status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_row public.registrations%rowtype;
  event_registration_status text;
  scan_time timestamptz := now();
begin
  select *
  into registration_row
  from public.registrations
  where qr_token_hash = p_qr_token_hash
  limit 1
  for update;

  if not found then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      null,
      p_event_id,
      'invalid_token',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      scan_time
    );

    return query
    select
      'invalid_token'::text,
      null::uuid,
      null::text,
      p_event_id,
      null::timestamptz,
      null::text,
      'Token not recognized'::text;
    return;
  end if;

  if registration_row.event_id <> p_event_id then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'wrong_event',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      scan_time
    );

    return query
    select
      'wrong_event'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Registration belongs to a different event'::text;
    return;
  end if;

  if registration_row.status in ('revoked', 'cancelled') then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'revoked',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      scan_time
    );

    return query
    select
      'revoked'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Registration is revoked or cancelled'::text;
    return;
  end if;

  if registration_row.checked_in_at is not null or registration_row.status = 'checked_in' then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'already_checked_in',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      scan_time
    );

    return query
    select
      'already_checked_in'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Attendee was already checked in'::text;
    return;
  end if;

  update public.registrations
  set
    status = 'checked_in',
    checked_in_at = scan_time,
    updated_at = scan_time
  where id = registration_row.id;

  insert into public.checkins (
    registration_id,
    event_id,
    result,
    gate_name,
    device_id,
    staff_user_id,
    scanned_at
  )
  values (
    registration_row.id,
    p_event_id,
    'success',
    p_gate_name,
    p_device_id,
    p_staff_user_id,
    scan_time
  );

  event_registration_status := 'checked_in';

  return query
  select
    'success'::text,
    registration_row.id,
    registration_row.full_name,
    p_event_id,
    scan_time,
    event_registration_status,
    'Check-in accepted'::text;
end;
$$;

create or replace function public.manual_checkin_registration(
  p_event_id uuid,
  p_registration_id uuid,
  p_gate_name text default null,
  p_device_id text default null,
  p_staff_user_id uuid default null
)
returns table (
  result text,
  registration_id uuid,
  full_name text,
  event_id uuid,
  checked_in_at timestamptz,
  registration_status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_row public.registrations%rowtype;
  action_time timestamptz := now();
begin
  select *
  into registration_row
  from public.registrations
  where id = p_registration_id
  limit 1
  for update;

  if not found then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      null,
      p_event_id,
      'invalid_token',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      action_time
    );

    return query
    select
      'invalid_token'::text,
      null::uuid,
      null::text,
      p_event_id,
      null::timestamptz,
      null::text,
      'Registration not found'::text;
    return;
  end if;

  if registration_row.event_id <> p_event_id then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'wrong_event',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      action_time
    );

    return query
    select
      'wrong_event'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Registration belongs to a different event'::text;
    return;
  end if;

  if registration_row.status in ('revoked', 'cancelled') then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'revoked',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      action_time
    );

    return query
    select
      'revoked'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Registration is revoked or cancelled'::text;
    return;
  end if;

  if registration_row.checked_in_at is not null or registration_row.status = 'checked_in' then
    insert into public.checkins (
      registration_id,
      event_id,
      result,
      gate_name,
      device_id,
      staff_user_id,
      scanned_at
    )
    values (
      registration_row.id,
      p_event_id,
      'already_checked_in',
      p_gate_name,
      p_device_id,
      p_staff_user_id,
      action_time
    );

    return query
    select
      'already_checked_in'::text,
      registration_row.id,
      registration_row.full_name,
      p_event_id,
      registration_row.checked_in_at,
      registration_row.status::text,
      'Attendee was already checked in'::text;
    return;
  end if;

  update public.registrations
  set
    status = 'checked_in',
    checked_in_at = action_time,
    updated_at = action_time
  where id = registration_row.id;

  insert into public.checkins (
    registration_id,
    event_id,
    result,
    gate_name,
    device_id,
    staff_user_id,
    scanned_at
  )
  values (
    registration_row.id,
    p_event_id,
    'success',
    p_gate_name,
    p_device_id,
    p_staff_user_id,
    action_time
  );

  return query
  select
    'success'::text,
    registration_row.id,
    registration_row.full_name,
    p_event_id,
    action_time,
    'checked_in'::text,
    'Manual check-in accepted'::text;
end;
$$;

create or replace function public.rotate_registration_qr_token(
  p_registration_id uuid,
  p_qr_token_hash text
)
returns table (
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_row public.registrations%rowtype;
begin
  update public.registrations
  set
    qr_token_hash = p_qr_token_hash,
    qr_token_last_rotated_at = now(),
    updated_at = now(),
    confirmation_email_sent_at = null
  where id = p_registration_id
  returning *
  into registration_row;

  if not found then
    return;
  end if;

  return query
  select
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.status::text;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260410121500_fix_confirm_pending_registration_ambiguity.sql
-- ============================================================
create or replace function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    company,
    emergency_contact_name,
    emergency_contact_phone,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.company,
    pending_row.emergency_contact_name,
    pending_row.emergency_contact_phone,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260413120000_add_ticket_options_to_registrations.sql
-- ============================================================
alter table public.pending_registrations
add column if not exists ticket_option_id text,
add column if not exists ticket_option_title text;

alter table public.registrations
add column if not exists ticket_option_id text,
add column if not exists ticket_option_title text;

create or replace function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    company,
    emergency_contact_name,
    emergency_contact_phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.company,
    pending_row.emergency_contact_name,
    pending_row.emergency_contact_phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260413133000_confirm_pending_registration_by_otp.sql
-- ============================================================
create or replace function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and pending_registration.verification_token_hash = p_verification_code_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    company,
    emergency_contact_name,
    emergency_contact_phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.company,
    pending_row.emergency_contact_name,
    pending_row.emergency_contact_phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260413160000_drop_company_and_emergency_fields.sql
-- ============================================================
-- Drop company and emergency contact columns from pending_registrations
alter table public.pending_registrations drop column if exists company;
alter table public.pending_registrations drop column if exists emergency_contact_name;
alter table public.pending_registrations drop column if exists emergency_contact_phone;

-- Drop company and emergency contact columns from registrations
alter table public.registrations drop column if exists company;
alter table public.registrations drop column if exists emergency_contact_name;
alter table public.registrations drop column if exists emergency_contact_phone;

-- Rebuild confirm_pending_registration to stop referencing dropped columns
create or replace function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- Rebuild confirm_pending_registration_by_otp to stop referencing dropped columns
create or replace function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and pending_registration.verification_token_hash = p_verification_code_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now()
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260413180000_add_age_and_uae_resident.sql
-- ============================================================
-- Add age and uae_resident to pending_registrations
alter table public.pending_registrations add column if not exists age integer;
alter table public.pending_registrations add column if not exists uae_resident boolean not null default false;

-- Add age and uae_resident to registrations
alter table public.registrations add column if not exists age integer;
alter table public.registrations add column if not exists uae_resident boolean not null default false;

-- Rebuild confirm_pending_registration to copy new columns
create or replace function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at,
    age,
    uae_resident
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now(),
    pending_row.age,
    pending_row.uae_resident
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- Rebuild confirm_pending_registration_by_otp to copy new columns
create or replace function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and pending_registration.verification_token_hash = p_verification_code_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at,
    age,
    uae_resident
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now(),
    pending_row.age,
    pending_row.uae_resident
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    select *
    into registration_row
    from public.registrations as registration_record
    where registration_record.event_id = pending_row.event_id
      and registration_record.email_normalized = pending_row.email_normalized
    limit 1;

    if found then
      return query
      select
        'already_registered'::text,
        registration_row.id,
        registration_row.event_id,
        registration_row.full_name,
        registration_row.email_raw,
        registration_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260414120000_email_jobs_queue.sql
-- ============================================================
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

-- ============================================================
-- Source: supabase/migrations/20260415120000_multi_attendee_booking.sql
-- ============================================================
-- =============================================================================
-- Multi-attendee booking: schema changes + group confirmation stored procedure
-- =============================================================================

-- 1. Drop email uniqueness constraint (same email can now book multiple times)
ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_event_email_unique;

-- 2. Add new columns to registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS category_title text,
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registered_by_email text;

-- Backfill: existing rows get "general-admission" as category
UPDATE public.registrations
  SET category_id = 'general-admission', category_title = 'General Admission'
  WHERE category_id IS NULL;

CREATE INDEX IF NOT EXISTS registrations_booking_id_idx
  ON public.registrations(booking_id) WHERE booking_id IS NOT NULL;

-- 3. Add new columns to pending_registrations
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS category_title text,
  ADD COLUMN IF NOT EXISTS attendees jsonb;

-- 4. Update the existing single-attendee stored procedure:
--    - Add category fields to the INSERT
--    - Remove the hard "already_registered" check (now a soft warning in app layer)
create or replace function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and pending_registration.verification_token_hash = p_verification_code_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  -- Soft dedup: no longer block on already_registered.
  -- The application layer warns the user but allows proceeding.

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    company,
    emergency_contact_name,
    emergency_contact_phone,
    category_id,
    category_title,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at,
    is_primary,
    booking_id
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.company,
    pending_row.emergency_contact_name,
    pending_row.emergency_contact_phone,
    coalesce(pending_row.category_id, 'general-admission'),
    coalesce(pending_row.category_title, 'General Admission'),
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    now(),
    'registered',
    p_qr_token_hash,
    now(),
    true,
    null
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    -- With the email unique constraint dropped, this can only occur from
    -- qr_token_hash collision (astronomically unlikely). Re-raise.
    raise;
end;
$$;

-- 5. New stored procedure for group bookings
create or replace function public.confirm_pending_registration_group_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hashes text[],
  p_attendees jsonb
)
returns table (
  outcome text,
  registration_id uuid,
  booking_id uuid,
  full_name text,
  email_raw text,
  category_title text,
  ticket_option_title text,
  attendee_index int,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  event_row public.events%rowtype;
  v_booking_id uuid;
  v_attendee jsonb;
  v_attendee_index int;
  v_full_name text;
  v_email_raw text;
  v_email_normalized text;
  v_category_id text;
  v_category_title text;
  v_ticket_option_id text;
  v_ticket_option_title text;
  v_is_primary boolean;
  v_registered_by_email text;
  v_registration_id uuid;
  v_current_count int;
  v_attendee_count int;
  v_ticket_config jsonb;
  v_category_config jsonb;
  v_ticket_id text;
  v_ticket_capacity int;
  v_ticket_count int;
  v_cat_id text;
  v_cat_capacity int;
  v_cat_count int;
begin
  v_attendee_count := jsonb_array_length(p_attendees);

  -- Validate: array lengths must match
  if array_length(p_qr_token_hashes, 1) <> v_attendee_count then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::int, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  -- Find and lock the pending registration
  select *
  into pending_row
  from public.pending_registrations as pr
  where pr.event_id = p_event_id
    and pr.email_normalized = p_email_normalized
    and pr.verification_token_hash = p_verification_code_hash
  order by pr.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::int, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  -- Load event
  select * into event_row
  from public.events where id = pending_row.event_id;

  -- Check expiry
  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid, null::uuid,
      pending_row.full_name, pending_row.email_raw, null::text,
      null::text, null::int,
      event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
    return;
  end if;

  -- Check already verified
  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid, null::uuid,
      pending_row.full_name, pending_row.email_raw, null::text,
      null::text, null::int,
      event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
    return;
  end if;

  -- Atomic overall capacity check
  if event_row.capacity is not null then
    select count(*) into v_current_count
    from public.registrations r
    where r.event_id = p_event_id;

    if v_current_count + v_attendee_count > event_row.capacity then
      return query
      select
        'capacity_exceeded'::text,
        null::uuid, null::uuid,
        pending_row.full_name, pending_row.email_raw, null::text,
        null::text, null::int,
        event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
      return;
    end if;
  end if;

  -- Per-bootcamp (ticketOption) capacity check
  -- Build a count of how many of each ticket_option_id the group requests
  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_ticket_id := v_attendee->>'ticketOptionId';
    if v_ticket_id is not null and v_ticket_id <> '' then
      -- Find the ticket config from event form_config
      v_ticket_config := null;
      if event_row.form_config is not null and event_row.form_config->'ticketOptions' is not null then
        select elem into v_ticket_config
        from jsonb_array_elements(event_row.form_config->'ticketOptions') as elem
        where elem->>'id' = v_ticket_id
        limit 1;
      end if;

      if v_ticket_config is not null and (v_ticket_config->>'capacity')::int is not null then
        v_ticket_capacity := (v_ticket_config->>'capacity')::int;

        -- Count existing registrations for this ticket
        select count(*) into v_ticket_count
        from public.registrations r
        where r.event_id = p_event_id
          and r.ticket_option_id = v_ticket_id;

        -- Count how many in THIS group want this ticket (including current)
        select count(*) into v_cat_count
        from jsonb_array_elements(p_attendees) as a
        where a->>'ticketOptionId' = v_ticket_id;

        if v_ticket_count + v_cat_count > v_ticket_capacity then
          return query
          select
            'capacity_exceeded'::text,
            null::uuid, null::uuid,
            pending_row.full_name, pending_row.email_raw, null::text,
            null::text, null::int,
            event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
          return;
        end if;
      end if;
    end if;
  end loop;

  -- Per-category capacity check
  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_cat_id := v_attendee->>'categoryId';
    if v_cat_id is not null and v_cat_id <> '' then
      v_category_config := null;
      if event_row.form_config is not null and event_row.form_config->'categories' is not null then
        select elem into v_category_config
        from jsonb_array_elements(event_row.form_config->'categories') as elem
        where elem->>'id' = v_cat_id
        limit 1;
      end if;

      if v_category_config is not null and (v_category_config->>'capacity')::int is not null then
        v_cat_capacity := (v_category_config->>'capacity')::int;

        select count(*) into v_cat_count
        from public.registrations r
        where r.event_id = p_event_id
          and r.category_id = v_cat_id;

        -- Count how many in THIS group want this category
        select count(*) into v_ticket_count
        from jsonb_array_elements(p_attendees) as a
        where a->>'categoryId' = v_cat_id;

        if v_cat_count + v_ticket_count > v_cat_capacity then
          return query
          select
            'capacity_exceeded'::text,
            null::uuid, null::uuid,
            pending_row.full_name, pending_row.email_raw, null::text,
            null::text, null::int,
            event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
          return;
        end if;
      end if;
    end if;
  end loop;

  -- All checks passed — generate booking_id and insert N rows
  v_booking_id := gen_random_uuid();
  v_registered_by_email := pending_row.email_raw;

  v_attendee_index := 0;
  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_full_name := v_attendee->>'fullName';
    v_category_id := coalesce(v_attendee->>'categoryId', 'general-admission');
    v_category_title := coalesce(v_attendee->>'categoryTitle', 'General Admission');
    v_ticket_option_id := nullif(v_attendee->>'ticketOptionId', '');
    v_ticket_option_title := nullif(v_attendee->>'ticketOptionTitle', '');
    v_is_primary := (v_attendee_index = 0);

    if v_is_primary then
      v_email_raw := pending_row.email_raw;
      v_email_normalized := pending_row.email_normalized;
    else
      v_email_raw := coalesce(nullif(v_attendee->>'email', ''), 'noemail+' || v_booking_id || '-' || v_attendee_index || '@placeholder.internal');
      v_email_normalized := lower(trim(v_email_raw));
    end if;

    insert into public.registrations (
      event_id,
      full_name,
      email_raw,
      email_normalized,
      phone,
      age,
      uae_resident,
      category_id,
      category_title,
      ticket_option_id,
      ticket_option_title,
      declaration_version,
      declaration_accepted_at,
      email_verified_at,
      status,
      qr_token_hash,
      qr_token_last_rotated_at,
      booking_id,
      is_primary,
      registered_by_email
    )
    values (
      pending_row.event_id,
      v_full_name,
      v_email_raw,
      v_email_normalized,
      case when v_is_primary then pending_row.phone else null end,
      (v_attendee->>'age')::int,
      case when v_is_primary then pending_row.uae_resident else false end,
      v_category_id,
      v_category_title,
      v_ticket_option_id,
      v_ticket_option_title,
      pending_row.declaration_version,
      now(),
      now(),
      'registered',
      p_qr_token_hashes[v_attendee_index + 1],
      now(),
      v_booking_id,
      v_is_primary,
      case when v_is_primary then null else v_registered_by_email end
    )
    returning id into v_registration_id;

    return query
    select
      'confirmed'::text,
      v_registration_id,
      v_booking_id,
      v_full_name,
      v_email_raw,
      v_category_title,
      v_ticket_option_title,
      v_attendee_index,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;

    v_attendee_index := v_attendee_index + 1;
  end loop;

  -- Mark pending as verified
  update public.pending_registrations as pr
  set verified_at = now()
  where pr.id = pending_row.id;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260416120000_event_assets_storage.sql
-- ============================================================
-- Create storage bucket for event assets (poster images, disclaimer PDFs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-assets',
  'event-assets',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
);

-- Allow public read access to event assets
create policy "Public read access for event assets"
  on storage.objects for select
  using (bucket_id = 'event-assets');

-- Allow authenticated users with service role to manage assets (handled via admin client)
-- No insert/update/delete policies needed since we use the service role key

-- ============================================================
-- Source: supabase/migrations/20260416143000_fix_confirm_pending_registration_by_otp_schema.sql
-- ============================================================
-- Fix single-attendee OTP confirmation to match the current registrations schema.
-- The multi-attendee migration reintroduced dropped company/emergency columns and
-- also stopped copying age and uae_resident into final registrations.
alter table public.pending_registrations
add column if not exists email_verified_at timestamptz;

create or replace function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
  v_current_count integer;
  v_category_config jsonb;
  v_ticket_config jsonb;
  v_category_capacity integer;
  v_category_count integer;
  v_ticket_capacity integer;
  v_ticket_count integer;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and (
      (
        p_verification_code_hash is not null
        and pending_registration.verification_token_hash = p_verification_code_hash
      )
      or (
        p_verification_code_hash is null
        and pending_registration.email_verified_at is not null
        and pending_registration.verified_at is null
      )
    )
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if p_verification_code_hash is not null and pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if event_row.capacity is not null then
    select count(*)
    into v_current_count
    from public.registrations as registration_record
    where registration_record.event_id = p_event_id;

    if v_current_count + 1 > event_row.capacity then
      return query
      select
        'capacity_exceeded'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;
  end if;

  if event_row.form_config is not null and event_row.form_config->'categories' is not null then
    select elem
    into v_category_config
    from jsonb_array_elements(event_row.form_config->'categories') as elem
    where elem->>'id' = coalesce(pending_row.category_id, 'general-admission')
    limit 1;

    if v_category_config is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if coalesce((v_category_config->>'soldOut')::boolean, false) then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if nullif(v_category_config->>'capacity', '') is not null then
      v_category_capacity := (v_category_config->>'capacity')::integer;

      select count(*)
      into v_category_count
      from public.registrations as registration_record
      where registration_record.event_id = p_event_id
        and registration_record.category_id = coalesce(pending_row.category_id, 'general-admission');

      if v_category_count + 1 > v_category_capacity then
        return query
        select
          'capacity_exceeded'::text,
          null::uuid,
          pending_row.event_id,
          pending_row.full_name,
          pending_row.email_raw,
          pending_row.email_normalized,
          event_row.title,
          event_row.start_at,
          event_row.timezone,
          event_row.venue;
        return;
      end if;
    end if;
  end if;

  if pending_row.ticket_option_id is not null then
    if event_row.form_config is null or event_row.form_config->'ticketOptions' is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    select elem
    into v_ticket_config
    from jsonb_array_elements(event_row.form_config->'ticketOptions') as elem
    where elem->>'id' = pending_row.ticket_option_id
    limit 1;

    if v_ticket_config is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if coalesce((v_ticket_config->>'soldOut')::boolean, false) then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if nullif(v_ticket_config->>'capacity', '') is not null then
      v_ticket_capacity := (v_ticket_config->>'capacity')::integer;

      select count(*)
      into v_ticket_count
      from public.registrations as registration_record
      where registration_record.event_id = p_event_id
        and registration_record.ticket_option_id = pending_row.ticket_option_id;

      if v_ticket_count + 1 > v_ticket_capacity then
        return query
        select
          'capacity_exceeded'::text,
          null::uuid,
          pending_row.event_id,
          pending_row.full_name,
          pending_row.email_raw,
          pending_row.email_normalized,
          event_row.title,
          event_row.start_at,
          event_row.timezone,
          event_row.venue;
        return;
      end if;
    end if;
  end if;

  insert into public.registrations (
    event_id,
    full_name,
    email_raw,
    email_normalized,
    phone,
    age,
    uae_resident,
    category_id,
    category_title,
    ticket_option_id,
    ticket_option_title,
    declaration_version,
    declaration_accepted_at,
    email_verified_at,
    status,
    qr_token_hash,
    qr_token_last_rotated_at,
    is_primary,
    booking_id,
    registered_by_email
  )
  values (
    pending_row.event_id,
    pending_row.full_name,
    pending_row.email_raw,
    pending_row.email_normalized,
    pending_row.phone,
    pending_row.age,
    pending_row.uae_resident,
    coalesce(pending_row.category_id, 'general-admission'),
    coalesce(pending_row.category_title, 'General Admission'),
    pending_row.ticket_option_id,
    pending_row.ticket_option_title,
    pending_row.declaration_version,
    now(),
    coalesce(pending_row.email_verified_at, now()),
    'registered',
    p_qr_token_hash,
    now(),
    true,
    null,
    null
  )
  returning *
  into registration_row;

  update public.pending_registrations as pending_registration
  set
    email_verified_at = coalesce(pending_registration.email_verified_at, now()),
    verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
exception
  when unique_violation then
    -- After dropping the event/email uniqueness constraint, a collision here
    -- should only be possible on qr_token_hash.
    raise;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260416201528_api_performance_summary_and_indexes.sql
-- ============================================================
create index if not exists pending_registrations_event_email_token_created_idx
on public.pending_registrations(event_id, email_normalized, verification_token_hash, created_at desc);

create index if not exists pending_registrations_verified_reuse_idx
on public.pending_registrations(event_id, email_normalized, created_at desc)
where verified_at is null and email_verified_at is not null;

create index if not exists registrations_event_category_idx
on public.registrations(event_id, category_id)
where category_id is not null;

create index if not exists registrations_event_ticket_option_idx
on public.registrations(event_id, ticket_option_id)
where ticket_option_id is not null;

create or replace function public.get_registration_summary(p_event_id uuid)
returns table (
  registration_count bigint,
  ticket_counts jsonb,
  category_counts jsonb
)
language sql
security definer
set search_path = public
as $$
  with event_rows as materialized (
    select category_id, ticket_option_id
    from public.registrations
    where event_id = p_event_id
  ),
  ticket_summary as (
    select coalesce(jsonb_object_agg(ticket_option_id, ticket_count), '{}'::jsonb) as data
    from (
      select ticket_option_id, count(*)::bigint as ticket_count
      from event_rows
      where ticket_option_id is not null
      group by ticket_option_id
    ) grouped_tickets
  ),
  category_summary as (
    select coalesce(jsonb_object_agg(category_id, category_count), '{}'::jsonb) as data
    from (
      select category_id, count(*)::bigint as category_count
      from event_rows
      where category_id is not null
      group by category_id
    ) grouped_categories
  )
  select
    (select count(*)::bigint from event_rows) as registration_count,
    (select data from ticket_summary) as ticket_counts,
    (select data from category_summary) as category_counts;
$$;

-- ============================================================
-- Source: supabase/migrations/20260416213000_add_manual_checkin_codes.sql
-- ============================================================
alter table public.registrations
add column if not exists manual_checkin_code text;

create or replace function public.random_manual_checkin_code(p_length integer default 4)
returns text
language plpgsql
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated text := '';
  idx integer;
begin
  if p_length < 1 then
    raise exception 'Manual check-in code length must be positive.';
  end if;

  for idx in 1..p_length loop
    generated := generated || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;

  return generated;
end;
$$;

create or replace function public.generate_unique_manual_checkin_code(p_event_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  candidate text;
  attempt_count integer := 0;
begin
  loop
    attempt_count := attempt_count + 1;

    if attempt_count > 64 then
      raise exception 'Unable to allocate a unique manual check-in code for event %.', p_event_id;
    end if;

    candidate := public.random_manual_checkin_code(4);

    if not exists (
      select 1
      from public.registrations as registration_record
      where registration_record.event_id = p_event_id
        and registration_record.manual_checkin_code = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

do $$
declare
  registration_row record;
begin
  for registration_row in
    select id, event_id
    from public.registrations
    where manual_checkin_code is null
    order by created_at asc, id asc
  loop
    update public.registrations
    set manual_checkin_code = public.generate_unique_manual_checkin_code(registration_row.event_id)
    where id = registration_row.id;
  end loop;
end;
$$;

create unique index if not exists registrations_event_manual_checkin_code_idx
on public.registrations(event_id, manual_checkin_code);

alter table public.registrations
alter column manual_checkin_code set not null;

drop function if exists public.confirm_pending_registration(text, text);

create function public.confirm_pending_registration(
  p_verification_token_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  manual_checkin_code text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
  v_insert_attempts integer := 0;
  v_constraint_name text;
  v_manual_checkin_code text;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.verification_token_hash = p_verification_token_hash
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      null::text,
      null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      null::text,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  select *
  into registration_row
  from public.registrations as registration_record
  where registration_record.event_id = pending_row.event_id
    and registration_record.email_normalized = pending_row.email_normalized
  limit 1;

  if found then
    update public.pending_registrations as pending_registration
    set verified_at = coalesce(verified_at, now())
    where pending_registration.id = pending_row.id;

    return query
    select
      'already_registered'::text,
      registration_row.id,
      registration_row.event_id,
      registration_row.full_name,
      registration_row.email_raw,
      registration_row.email_normalized,
      registration_row.manual_checkin_code,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      null::text,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  loop
    begin
      v_insert_attempts := v_insert_attempts + 1;

      if v_insert_attempts > 32 then
        raise exception 'Unable to assign a manual check-in code for event %.', pending_row.event_id;
      end if;

      v_manual_checkin_code := public.generate_unique_manual_checkin_code(pending_row.event_id);

      insert into public.registrations (
        event_id,
        full_name,
        email_raw,
        email_normalized,
        phone,
        company,
        emergency_contact_name,
        emergency_contact_phone,
        declaration_version,
        declaration_accepted_at,
        email_verified_at,
        status,
        qr_token_hash,
        qr_token_last_rotated_at,
        manual_checkin_code
      )
      values (
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        pending_row.phone,
        pending_row.company,
        pending_row.emergency_contact_name,
        pending_row.emergency_contact_phone,
        pending_row.declaration_version,
        now(),
        now(),
        'registered',
        p_qr_token_hash,
        now(),
        v_manual_checkin_code
      )
      returning *
      into registration_row;

      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
        if v_constraint_name = 'registrations_event_manual_checkin_code_idx' then
          continue;
        end if;
        raise;
    end;
  end loop;

  update public.pending_registrations as pending_registration
  set verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    registration_row.manual_checkin_code,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
end;
$$;

drop function if exists public.confirm_pending_registration_by_otp(uuid, text, text, text);

create function public.confirm_pending_registration_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hash text
)
returns table (
  outcome text,
  registration_id uuid,
  event_id uuid,
  full_name text,
  email_raw text,
  email_normalized text,
  manual_checkin_code text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_row public.pending_registrations%rowtype;
  registration_row public.registrations%rowtype;
  event_row public.events%rowtype;
  v_current_count integer;
  v_category_config jsonb;
  v_ticket_config jsonb;
  v_category_capacity integer;
  v_category_count integer;
  v_ticket_capacity integer;
  v_ticket_count integer;
  v_insert_attempts integer := 0;
  v_constraint_name text;
  v_manual_checkin_code text;
begin
  select *
  into pending_row
  from public.pending_registrations as pending_registration
  where pending_registration.event_id = p_event_id
    and pending_registration.email_normalized = p_email_normalized
    and (
      (
        p_verification_code_hash is not null
        and pending_registration.verification_token_hash = p_verification_code_hash
      )
      or (
        p_verification_code_hash is null
        and pending_registration.email_verified_at is not null
        and pending_registration.verified_at is null
      )
    )
  order by pending_registration.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  select *
  into event_row
  from public.events as event_record
  where event_record.id = pending_row.event_id;

  if p_verification_code_hash is not null and pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      null::text,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid,
      pending_row.event_id,
      pending_row.full_name,
      pending_row.email_raw,
      pending_row.email_normalized,
      null::text,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;
    return;
  end if;

  if event_row.capacity is not null then
    select count(*)
    into v_current_count
    from public.registrations as registration_record
    where registration_record.event_id = p_event_id;

    if v_current_count + 1 > event_row.capacity then
      return query
      select
        'capacity_exceeded'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;
  end if;

  if event_row.form_config is not null and event_row.form_config->'categories' is not null then
    select elem
    into v_category_config
    from jsonb_array_elements(event_row.form_config->'categories') as elem
    where elem->>'id' = coalesce(pending_row.category_id, 'general-admission')
    limit 1;

    if v_category_config is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if coalesce((v_category_config->>'soldOut')::boolean, false) then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if nullif(v_category_config->>'capacity', '') is not null then
      v_category_capacity := (v_category_config->>'capacity')::integer;

      select count(*)
      into v_category_count
      from public.registrations as registration_record
      where registration_record.event_id = p_event_id
        and registration_record.category_id = coalesce(pending_row.category_id, 'general-admission');

      if v_category_count + 1 > v_category_capacity then
        return query
        select
          'capacity_exceeded'::text,
          null::uuid,
          pending_row.event_id,
          pending_row.full_name,
          pending_row.email_raw,
          pending_row.email_normalized,
          null::text,
          event_row.title,
          event_row.start_at,
          event_row.timezone,
          event_row.venue;
        return;
      end if;
    end if;
  end if;

  if pending_row.ticket_option_id is not null then
    if event_row.form_config is null or event_row.form_config->'ticketOptions' is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    select elem
    into v_ticket_config
    from jsonb_array_elements(event_row.form_config->'ticketOptions') as elem
    where elem->>'id' = pending_row.ticket_option_id
    limit 1;

    if v_ticket_config is null then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if coalesce((v_ticket_config->>'soldOut')::boolean, false) then
      return query
      select
        'invalid'::text,
        null::uuid,
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        null::text,
        event_row.title,
        event_row.start_at,
        event_row.timezone,
        event_row.venue;
      return;
    end if;

    if nullif(v_ticket_config->>'capacity', '') is not null then
      v_ticket_capacity := (v_ticket_config->>'capacity')::integer;

      select count(*)
      into v_ticket_count
      from public.registrations as registration_record
      where registration_record.event_id = p_event_id
        and registration_record.ticket_option_id = pending_row.ticket_option_id;

      if v_ticket_count + 1 > v_ticket_capacity then
        return query
        select
          'capacity_exceeded'::text,
          null::uuid,
          pending_row.event_id,
          pending_row.full_name,
          pending_row.email_raw,
          pending_row.email_normalized,
          null::text,
          event_row.title,
          event_row.start_at,
          event_row.timezone,
          event_row.venue;
        return;
      end if;
    end if;
  end if;

  loop
    begin
      v_insert_attempts := v_insert_attempts + 1;

      if v_insert_attempts > 32 then
        raise exception 'Unable to assign a manual check-in code for event %.', pending_row.event_id;
      end if;

      v_manual_checkin_code := public.generate_unique_manual_checkin_code(pending_row.event_id);

      insert into public.registrations (
        event_id,
        full_name,
        email_raw,
        email_normalized,
        phone,
        age,
        uae_resident,
        category_id,
        category_title,
        ticket_option_id,
        ticket_option_title,
        declaration_version,
        declaration_accepted_at,
        email_verified_at,
        status,
        qr_token_hash,
        qr_token_last_rotated_at,
        manual_checkin_code,
        is_primary,
        booking_id,
        registered_by_email
      )
      values (
        pending_row.event_id,
        pending_row.full_name,
        pending_row.email_raw,
        pending_row.email_normalized,
        pending_row.phone,
        pending_row.age,
        pending_row.uae_resident,
        coalesce(pending_row.category_id, 'general-admission'),
        coalesce(pending_row.category_title, 'General Admission'),
        pending_row.ticket_option_id,
        pending_row.ticket_option_title,
        pending_row.declaration_version,
        now(),
        coalesce(pending_row.email_verified_at, now()),
        'registered',
        p_qr_token_hash,
        now(),
        v_manual_checkin_code,
        true,
        null,
        null
      )
      returning *
      into registration_row;

      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
        if v_constraint_name = 'registrations_event_manual_checkin_code_idx' then
          continue;
        end if;
        raise;
    end;
  end loop;

  update public.pending_registrations as pending_registration
  set
    email_verified_at = coalesce(pending_registration.email_verified_at, now()),
    verified_at = now()
  where pending_registration.id = pending_row.id;

  return query
  select
    'confirmed'::text,
    registration_row.id,
    registration_row.event_id,
    registration_row.full_name,
    registration_row.email_raw,
    registration_row.email_normalized,
    registration_row.manual_checkin_code,
    event_row.title,
    event_row.start_at,
    event_row.timezone,
    event_row.venue;
end;
$$;

drop function if exists public.confirm_pending_registration_group_by_otp(uuid, text, text, text[], jsonb);

create function public.confirm_pending_registration_group_by_otp(
  p_event_id uuid,
  p_email_normalized text,
  p_verification_code_hash text,
  p_qr_token_hashes text[],
  p_attendees jsonb
)
returns table (
  outcome text,
  registration_id uuid,
  booking_id uuid,
  full_name text,
  email_raw text,
  category_title text,
  ticket_option_title text,
  attendee_index int,
  manual_checkin_code text,
  event_title text,
  event_start_at timestamptz,
  event_timezone text,
  venue text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pending_row public.pending_registrations%rowtype;
  event_row public.events%rowtype;
  v_booking_id uuid;
  v_attendee jsonb;
  v_attendee_index int;
  v_full_name text;
  v_email_raw text;
  v_email_normalized text;
  v_category_id text;
  v_category_title text;
  v_ticket_option_id text;
  v_ticket_option_title text;
  v_is_primary boolean;
  v_registered_by_email text;
  v_registration_id uuid;
  v_current_count int;
  v_attendee_count int;
  v_ticket_config jsonb;
  v_category_config jsonb;
  v_ticket_id text;
  v_ticket_capacity int;
  v_ticket_count int;
  v_cat_id text;
  v_cat_capacity int;
  v_cat_count int;
  v_insert_attempts integer;
  v_constraint_name text;
  v_manual_checkin_code text;
begin
  v_attendee_count := jsonb_array_length(p_attendees);

  if array_length(p_qr_token_hashes, 1) <> v_attendee_count then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::int, null::text, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  select *
  into pending_row
  from public.pending_registrations as pr
  where pr.event_id = p_event_id
    and pr.email_normalized = p_email_normalized
    and pr.verification_token_hash = p_verification_code_hash
  order by pr.created_at desc
  limit 1
  for update;

  if not found then
    return query
    select
      'invalid'::text,
      null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::int, null::text, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;

  select *
  into event_row
  from public.events
  where id = pending_row.event_id;

  if pending_row.verification_expires_at < now() then
    return query
    select
      'expired'::text,
      null::uuid, null::uuid,
      pending_row.full_name, pending_row.email_raw, null::text,
      null::text, null::int, null::text,
      event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
    return;
  end if;

  if pending_row.verified_at is not null then
    return query
    select
      'already_verified'::text,
      null::uuid, null::uuid,
      pending_row.full_name, pending_row.email_raw, null::text,
      null::text, null::int, null::text,
      event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
    return;
  end if;

  if event_row.capacity is not null then
    select count(*)
    into v_current_count
    from public.registrations as r
    where r.event_id = p_event_id;

    if v_current_count + v_attendee_count > event_row.capacity then
      return query
      select
        'capacity_exceeded'::text,
        null::uuid, null::uuid,
        pending_row.full_name, pending_row.email_raw, null::text,
        null::text, null::int, null::text,
        event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
      return;
    end if;
  end if;

  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_ticket_id := v_attendee->>'ticketOptionId';
    if v_ticket_id is not null and v_ticket_id <> '' then
      v_ticket_config := null;
      if event_row.form_config is not null and event_row.form_config->'ticketOptions' is not null then
        select elem into v_ticket_config
        from jsonb_array_elements(event_row.form_config->'ticketOptions') as elem
        where elem->>'id' = v_ticket_id
        limit 1;
      end if;

      if v_ticket_config is not null and (v_ticket_config->>'capacity')::int is not null then
        v_ticket_capacity := (v_ticket_config->>'capacity')::int;

        select count(*) into v_ticket_count
        from public.registrations as r
        where r.event_id = p_event_id
          and r.ticket_option_id = v_ticket_id;

        select count(*) into v_cat_count
        from jsonb_array_elements(p_attendees) as a
        where a->>'ticketOptionId' = v_ticket_id;

        if v_ticket_count + v_cat_count > v_ticket_capacity then
          return query
          select
            'capacity_exceeded'::text,
            null::uuid, null::uuid,
            pending_row.full_name, pending_row.email_raw, null::text,
            null::text, null::int, null::text,
            event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
          return;
        end if;
      end if;
    end if;
  end loop;

  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_cat_id := v_attendee->>'categoryId';
    if v_cat_id is not null and v_cat_id <> '' then
      v_category_config := null;
      if event_row.form_config is not null and event_row.form_config->'categories' is not null then
        select elem into v_category_config
        from jsonb_array_elements(event_row.form_config->'categories') as elem
        where elem->>'id' = v_cat_id
        limit 1;
      end if;

      if v_category_config is not null and (v_category_config->>'capacity')::int is not null then
        v_cat_capacity := (v_category_config->>'capacity')::int;

        select count(*) into v_cat_count
        from public.registrations as r
        where r.event_id = p_event_id
          and r.category_id = v_cat_id;

        select count(*) into v_ticket_count
        from jsonb_array_elements(p_attendees) as a
        where a->>'categoryId' = v_cat_id;

        if v_cat_count + v_ticket_count > v_cat_capacity then
          return query
          select
            'capacity_exceeded'::text,
            null::uuid, null::uuid,
            pending_row.full_name, pending_row.email_raw, null::text,
            null::text, null::int, null::text,
            event_row.title, event_row.start_at, event_row.timezone, event_row.venue;
          return;
        end if;
      end if;
    end if;
  end loop;

  v_booking_id := gen_random_uuid();
  v_registered_by_email := pending_row.email_raw;

  v_attendee_index := 0;
  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_full_name := v_attendee->>'fullName';
    v_category_id := coalesce(v_attendee->>'categoryId', 'general-admission');
    v_category_title := coalesce(v_attendee->>'categoryTitle', 'General Admission');
    v_ticket_option_id := nullif(v_attendee->>'ticketOptionId', '');
    v_ticket_option_title := nullif(v_attendee->>'ticketOptionTitle', '');
    v_is_primary := (v_attendee_index = 0);

    if v_is_primary then
      v_email_raw := pending_row.email_raw;
      v_email_normalized := pending_row.email_normalized;
    else
      v_email_raw := coalesce(nullif(v_attendee->>'email', ''), 'noemail+' || v_booking_id || '-' || v_attendee_index || '@placeholder.internal');
      v_email_normalized := lower(trim(v_email_raw));
    end if;

    v_insert_attempts := 0;
    loop
      begin
        v_insert_attempts := v_insert_attempts + 1;

        if v_insert_attempts > 32 then
          raise exception 'Unable to assign a manual check-in code for event %.', pending_row.event_id;
        end if;

        v_manual_checkin_code := public.generate_unique_manual_checkin_code(pending_row.event_id);

        insert into public.registrations (
          event_id,
          full_name,
          email_raw,
          email_normalized,
          phone,
          age,
          uae_resident,
          category_id,
          category_title,
          ticket_option_id,
          ticket_option_title,
          declaration_version,
          declaration_accepted_at,
          email_verified_at,
          status,
          qr_token_hash,
          qr_token_last_rotated_at,
          manual_checkin_code,
          booking_id,
          is_primary,
          registered_by_email
        )
        values (
          pending_row.event_id,
          v_full_name,
          v_email_raw,
          v_email_normalized,
          case when v_is_primary then pending_row.phone else null end,
          (v_attendee->>'age')::int,
          case when v_is_primary then pending_row.uae_resident else false end,
          v_category_id,
          v_category_title,
          v_ticket_option_id,
          v_ticket_option_title,
          pending_row.declaration_version,
          now(),
          now(),
          'registered',
          p_qr_token_hashes[v_attendee_index + 1],
          now(),
          v_manual_checkin_code,
          v_booking_id,
          v_is_primary,
          case when v_is_primary then null else v_registered_by_email end
        )
        returning id into v_registration_id;

        exit;
      exception
        when unique_violation then
          get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
          if v_constraint_name = 'registrations_event_manual_checkin_code_idx' then
            continue;
          end if;
          raise;
      end;
    end loop;

    return query
    select
      'confirmed'::text,
      v_registration_id,
      v_booking_id,
      v_full_name,
      v_email_raw,
      v_category_title,
      v_ticket_option_title,
      v_attendee_index,
      v_manual_checkin_code,
      event_row.title,
      event_row.start_at,
      event_row.timezone,
      event_row.venue;

    v_attendee_index := v_attendee_index + 1;
  end loop;

  update public.pending_registrations as pr
  set verified_at = now()
  where pr.id = pending_row.id;
end;
$$;

-- ============================================================
-- Source: supabase/migrations/20260416214000_fix_manual_code_extension_resolution.sql
-- ============================================================
create or replace function public.random_manual_checkin_code(p_length integer default 4)
returns text
language plpgsql
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated text := '';
  idx integer;
begin
  if p_length < 1 then
    raise exception 'Manual check-in code length must be positive.';
  end if;

  for idx in 1..p_length loop
    generated := generated || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;

  return generated;
end;
$$;

alter function public.generate_unique_manual_checkin_code(uuid)
set search_path = public;

alter function public.confirm_pending_registration_group_by_otp(uuid, text, text, text[], jsonb)
set search_path = public, extensions;

-- ============================================================
-- Source: supabase/migrations/20260424120000_ngenius_paid_checkout.sql
-- ============================================================
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_intent_status') then
    create type booking_intent_status as enum (
      'draft',
      'otp_sent',
      'email_verified',
      'payment_pending',
      'paid',
      'fulfilled',
      'payment_failed',
      'expired',
      'manual_action_required',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_item_type') then
    create type booking_item_type as enum ('category', 'addon');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_attempt_status') then
    create type payment_attempt_status as enum (
      'created',
      'order_create_pending',
      'payment_pending',
      'paid',
      'failed',
      'cancelled',
      'expired',
      'manual_action_required'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_job_status') then
    create type payment_job_status as enum ('queued', 'processing', 'done', 'failed');
  end if;
end
$$;

create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  public_id text not null,
  title text not null,
  description text not null default '',
  note text,
  badge text,
  capacity integer,
  price_minor integer not null default 0,
  currency_code text not null default 'AED',
  active boolean not null default true,
  sold_out boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_categories_capacity_positive check (capacity is null or capacity > 0),
  constraint event_categories_price_nonnegative check (price_minor >= 0),
  constraint event_categories_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint event_categories_event_public_unique unique (event_id, public_id)
);

create table if not exists public.event_addons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  public_id text not null,
  title text not null,
  description text not null default '',
  note text,
  badge text,
  capacity integer,
  price_minor integer not null default 0,
  currency_code text not null default 'AED',
  active boolean not null default true,
  sold_out boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_addons_capacity_positive check (capacity is null or capacity > 0),
  constraint event_addons_price_nonnegative check (price_minor >= 0),
  constraint event_addons_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint event_addons_event_public_unique unique (event_id, public_id)
);

create table if not exists public.booking_intents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  public_reference text not null unique,
  status booking_intent_status not null default 'draft',
  payer_email_raw text not null,
  payer_email_normalized text not null,
  payer_full_name text not null,
  payer_phone text,
  payer_age integer,
  payer_uae_resident boolean not null default false,
  declaration_version integer not null,
  declaration_accepted_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  email_verified_at timestamptz,
  total_minor integer not null default 0,
  currency_code text not null default 'AED',
  attempt_count integer not null default 0,
  held_until timestamptz,
  manual_action_reason text,
  reviewed_at timestamptz,
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_intents_total_nonnegative check (total_minor >= 0),
  constraint booking_intents_attempt_count_nonnegative check (attempt_count >= 0),
  constraint booking_intents_currency_format check (currency_code ~ '^[A-Z]{3}$')
);

create table if not exists public.booking_attendees (
  id uuid primary key default gen_random_uuid(),
  booking_intent_id uuid not null references public.booking_intents(id) on delete cascade,
  attendee_index integer not null,
  full_name text not null,
  email_raw text,
  email_normalized text,
  phone text,
  age integer,
  uae_resident boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint booking_attendees_index_nonnegative check (attendee_index >= 0),
  constraint booking_attendees_booking_index_unique unique (booking_intent_id, attendee_index)
);

create table if not exists public.booking_intent_items (
  id uuid primary key default gen_random_uuid(),
  booking_intent_id uuid not null references public.booking_intents(id) on delete cascade,
  attendee_id uuid references public.booking_attendees(id) on delete cascade,
  item_type booking_item_type not null,
  event_category_id uuid references public.event_categories(id) on delete restrict,
  event_addon_id uuid references public.event_addons(id) on delete restrict,
  public_id text not null,
  title text not null,
  description text not null default '',
  quantity integer not null default 1,
  unit_price_minor integer not null,
  total_price_minor integer not null,
  currency_code text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint booking_items_quantity_positive check (quantity > 0),
  constraint booking_items_price_nonnegative check (unit_price_minor >= 0 and total_price_minor >= 0),
  constraint booking_items_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint booking_items_one_catalog_ref check (
    (item_type = 'category' and event_category_id is not null and event_addon_id is null)
    or
    (item_type = 'addon' and event_addon_id is not null and event_category_id is null)
  )
);

create table if not exists public.booking_capacity_holds (
  id uuid primary key default gen_random_uuid(),
  booking_intent_id uuid not null references public.booking_intents(id) on delete cascade,
  booking_intent_item_id uuid not null references public.booking_intent_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete restrict,
  item_type booking_item_type not null,
  event_category_id uuid references public.event_categories(id) on delete restrict,
  event_addon_id uuid references public.event_addons(id) on delete restrict,
  quantity integer not null default 1,
  held_until timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_holds_quantity_positive check (quantity > 0),
  constraint booking_holds_one_catalog_ref check (
    (item_type = 'category' and event_category_id is not null and event_addon_id is null)
    or
    (item_type = 'addon' and event_addon_id is not null and event_category_id is null)
  ),
  constraint booking_holds_item_unique unique (booking_intent_item_id)
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_intent_id uuid not null references public.booking_intents(id) on delete restrict,
  attempt_number integer not null,
  status payment_attempt_status not null default 'created',
  provider text not null default 'ngenius',
  ni_order_reference text,
  ni_payment_reference text,
  merchant_order_reference text not null unique,
  payment_href text,
  amount_minor integer not null,
  currency_code text not null,
  raw_order_response jsonb,
  last_order_status jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_attempt_positive check (attempt_number > 0),
  constraint payment_attempts_amount_nonnegative check (amount_minor >= 0),
  constraint payment_attempts_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint payment_attempts_booking_attempt_unique unique (booking_intent_id, attempt_number)
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'ngenius',
  event_id text,
  event_name text,
  ni_order_reference text,
  ni_payment_reference text,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  booking_intent_id uuid references public.booking_intents(id) on delete set null,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  raw_body text,
  encrypted boolean not null default false,
  source_ip text,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_event_unique unique (provider, event_id)
);

create table if not exists public.payment_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payment_event_id uuid references public.payment_events(id) on delete cascade,
  payment_attempt_id uuid references public.payment_attempts(id) on delete cascade,
  booking_intent_id uuid references public.booking_intents(id) on delete cascade,
  status payment_job_status not null default 'queued',
  attempts integer not null default 0,
  attempts_max integer not null default 5,
  locked_at timestamptz,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_jobs_attempts_nonnegative check (attempts >= 0 and attempts_max > 0)
);

create table if not exists public.checkout_throttle_events (
  id uuid primary key default gen_random_uuid(),
  throttle_key text not null,
  action text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.registrations
  add column if not exists booking_intent_id uuid references public.booking_intents(id) on delete restrict,
  add column if not exists payment_attempt_id uuid references public.payment_attempts(id) on delete restrict,
  add column if not exists ni_order_reference text,
  add column if not exists paid_amount_minor integer,
  add column if not exists paid_currency_code text;

create index if not exists event_categories_event_sort_idx on public.event_categories(event_id, sort_order, created_at);
create index if not exists event_addons_event_sort_idx on public.event_addons(event_id, sort_order, created_at);
create index if not exists booking_intents_event_status_idx on public.booking_intents(event_id, status, created_at desc);
create index if not exists booking_intents_email_idx on public.booking_intents(event_id, payer_email_normalized, created_at desc);
create index if not exists booking_items_booking_idx on public.booking_intent_items(booking_intent_id);
create index if not exists booking_holds_active_event_idx
  on public.booking_capacity_holds(event_id, held_until)
  where released_at is null;
create index if not exists payment_attempts_booking_idx on public.payment_attempts(booking_intent_id, attempt_number desc);
create index if not exists payment_attempts_ni_order_idx on public.payment_attempts(ni_order_reference) where ni_order_reference is not null;
create index if not exists payment_jobs_status_run_idx on public.payment_jobs(status, run_after, created_at);
create index if not exists checkout_throttle_events_key_idx on public.checkout_throttle_events(throttle_key, action, expires_at);
create index if not exists registrations_booking_intent_idx on public.registrations(booking_intent_id) where booking_intent_id is not null;
create index if not exists registrations_payment_attempt_idx on public.registrations(payment_attempt_id) where payment_attempt_id is not null;

drop trigger if exists set_event_categories_updated_at on public.event_categories;
create trigger set_event_categories_updated_at
before update on public.event_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_event_addons_updated_at on public.event_addons;
create trigger set_event_addons_updated_at
before update on public.event_addons
for each row execute function public.set_updated_at();

drop trigger if exists set_booking_intents_updated_at on public.booking_intents;
create trigger set_booking_intents_updated_at
before update on public.booking_intents
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_attempts_updated_at on public.payment_attempts;
create trigger set_payment_attempts_updated_at
before update on public.payment_attempts
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_jobs_updated_at on public.payment_jobs;
create trigger set_payment_jobs_updated_at
before update on public.payment_jobs
for each row execute function public.set_updated_at();

alter table public.event_categories enable row level security;
alter table public.event_addons enable row level security;
alter table public.booking_intents enable row level security;
alter table public.booking_attendees enable row level security;
alter table public.booking_intent_items enable row level security;
alter table public.booking_capacity_holds enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_jobs enable row level security;
alter table public.checkout_throttle_events enable row level security;

insert into public.event_categories (
  event_id,
  public_id,
  title,
  description,
  note,
  badge,
  capacity,
  sold_out,
  sort_order
)
select
  e.id,
  coalesce(category_item.value->>'id', 'general-admission'),
  coalesce(category_item.value->>'title', 'General Admission'),
  coalesce(category_item.value->>'description', 'Free general admission'),
  nullif(category_item.value->>'note', ''),
  nullif(category_item.value->>'badge', ''),
  nullif(category_item.value->>'capacity', '')::integer,
  coalesce((category_item.value->>'soldOut')::boolean, false),
  category_item.ordinality::integer - 1
from public.events e
cross join lateral jsonb_array_elements(
  case
    when e.form_config is not null and jsonb_typeof(e.form_config->'categories') = 'array' and jsonb_array_length(e.form_config->'categories') > 0
      then e.form_config->'categories'
    else '[{"id":"general-admission","title":"General Admission","description":"Free general admission"}]'::jsonb
  end
) with ordinality as category_item(value, ordinality)
on conflict (event_id, public_id) do nothing;

insert into public.event_addons (
  event_id,
  public_id,
  title,
  description,
  note,
  badge,
  capacity,
  sold_out,
  sort_order
)
select
  e.id,
  addon_item.value->>'id',
  addon_item.value->>'title',
  coalesce(addon_item.value->>'description', ''),
  nullif(addon_item.value->>'note', ''),
  nullif(addon_item.value->>'badge', ''),
  nullif(addon_item.value->>'capacity', '')::integer,
  coalesce((addon_item.value->>'soldOut')::boolean, false),
  addon_item.ordinality::integer - 1
from public.events e
cross join lateral jsonb_array_elements(
  case
    when e.form_config is not null and jsonb_typeof(e.form_config->'ticketOptions') = 'array'
      then e.form_config->'ticketOptions'
    else '[]'::jsonb
  end
) with ordinality as addon_item(value, ordinality)
where addon_item.value ? 'id'
on conflict (event_id, public_id) do nothing;

create or replace function public.check_checkout_rate_limit(
  p_throttle_key text,
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_retry_after integer;
begin
  if p_throttle_key is null or length(trim(p_throttle_key)) = 0 then
    p_throttle_key := 'unknown';
  end if;

  perform pg_advisory_xact_lock(hashtext('checkout-rate:' || p_action || ':' || p_throttle_key));

  delete from public.checkout_throttle_events
  where expires_at <= now();

  select count(*)
  into v_count
  from public.checkout_throttle_events
  where throttle_key = p_throttle_key
    and action = p_action
    and expires_at > now();

  if v_count >= p_max_requests then
    select greatest(1, ceil(extract(epoch from min(expires_at) - now()))::integer)
    into v_retry_after
    from public.checkout_throttle_events
    where throttle_key = p_throttle_key
      and action = p_action
      and expires_at > now();

    return query select false, v_count, coalesce(v_retry_after, p_window_seconds);
    return;
  end if;

  insert into public.checkout_throttle_events (
    throttle_key,
    action,
    expires_at
  )
  values (
    p_throttle_key,
    p_action,
    now() + make_interval(secs => p_window_seconds)
  );

  return query select true, v_count + 1, 0;
end;
$$;

create or replace function public.lock_checkout_capacity_buckets(p_booking_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  bucket text;
begin
  select event_id
  into v_event_id
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if not found then
    raise exception 'Booking intent % not found', p_booking_intent_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('event:' || v_event_id::text));

  for bucket in
    select 'category:' || event_category_id::text
    from public.booking_intent_items
    where booking_intent_id = p_booking_intent_id
      and item_type = 'category'
      and event_category_id is not null
    group by event_category_id
    order by event_category_id::text
  loop
    perform pg_advisory_xact_lock(hashtext(bucket));
  end loop;

  for bucket in
    select 'addon:' || event_addon_id::text
    from public.booking_intent_items
    where booking_intent_id = p_booking_intent_id
      and item_type = 'addon'
      and event_addon_id is not null
    group by event_addon_id
    order by event_addon_id::text
  loop
    perform pg_advisory_xact_lock(hashtext(bucket));
  end loop;
end;
$$;

create or replace function public.reserve_booking_capacity(
  p_booking_intent_id uuid,
  p_hold_minutes integer default 25
)
returns table (
  outcome text,
  held_until timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_intents%rowtype;
  event_row public.events%rowtype;
  v_held_until timestamptz := now() + make_interval(mins => p_hold_minutes);
  item_row record;
  v_existing integer;
  v_requested integer;
  v_capacity integer;
begin
  perform public.lock_checkout_capacity_buckets(p_booking_intent_id);

  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if booking_row.status not in ('email_verified', 'payment_failed', 'payment_pending') then
    return query select 'invalid_state_transition'::text, null::timestamptz, 'Booking is not ready for payment.'::text;
    return;
  end if;

  select *
  into event_row
  from public.events
  where id = booking_row.event_id
  for update;

  delete from public.booking_capacity_holds
  where booking_intent_id = p_booking_intent_id;

  if event_row.capacity is not null then
    select coalesce(count(*), 0)
    into v_existing
    from public.registrations
    where event_id = booking_row.event_id
      and status not in ('revoked', 'cancelled');

    select coalesce(sum(quantity), 0)
    into v_existing
    from (
      select v_existing as quantity
      union all
      select coalesce(sum(h.quantity), 0)::integer
      from public.booking_capacity_holds h
      where h.event_id = booking_row.event_id
        and h.item_type = 'category'
        and h.booking_intent_id <> p_booking_intent_id
        and h.released_at is null
        and h.held_until > now()
    ) totals;

    select coalesce(sum(quantity), 0)
    into v_requested
    from public.booking_intent_items
    where booking_intent_id = p_booking_intent_id
      and item_type = 'category';

    if v_existing + v_requested > event_row.capacity then
      return query select 'capacity_exceeded'::text, null::timestamptz, 'Event capacity is no longer available.'::text;
      return;
    end if;
  end if;

  for item_row in
    select
      i.id,
      i.item_type,
      i.event_category_id,
      i.event_addon_id,
      i.quantity,
      c.capacity as category_capacity,
      a.capacity as addon_capacity,
      coalesce(c.sold_out, a.sold_out, false) as sold_out,
      coalesce(c.active, a.active, false) as active,
      coalesce(c.title, a.title, i.title) as title
    from public.booking_intent_items i
    left join public.event_categories c on c.id = i.event_category_id
    left join public.event_addons a on a.id = i.event_addon_id
    where i.booking_intent_id = p_booking_intent_id
    order by i.item_type, coalesce(i.event_category_id::text, i.event_addon_id::text), i.id::text
  loop
    if not item_row.active or item_row.sold_out then
      return query select 'capacity_exceeded'::text, null::timestamptz, format('%s is no longer available.', item_row.title)::text;
      return;
    end if;

    v_capacity := case when item_row.item_type = 'category' then item_row.category_capacity else item_row.addon_capacity end;

    if v_capacity is not null then
      if item_row.item_type = 'category' then
        select coalesce(count(*), 0)
        into v_existing
        from public.registrations
        where event_id = booking_row.event_id
          and category_id = (select public_id from public.event_categories where id = item_row.event_category_id)
          and status not in ('revoked', 'cancelled');

        select v_existing + coalesce(sum(h.quantity), 0)
        into v_existing
        from public.booking_capacity_holds h
        where h.event_category_id = item_row.event_category_id
          and h.booking_intent_id <> p_booking_intent_id
          and h.released_at is null
          and h.held_until > now();
      else
        select coalesce(count(*), 0)
        into v_existing
        from public.registrations
        where event_id = booking_row.event_id
          and ticket_option_id = (select public_id from public.event_addons where id = item_row.event_addon_id)
          and status not in ('revoked', 'cancelled');

        select v_existing + coalesce(sum(h.quantity), 0)
        into v_existing
        from public.booking_capacity_holds h
        where h.event_addon_id = item_row.event_addon_id
          and h.booking_intent_id <> p_booking_intent_id
          and h.released_at is null
          and h.held_until > now();
      end if;

      if v_existing + item_row.quantity > v_capacity then
        return query select 'capacity_exceeded'::text, null::timestamptz, format('%s capacity is no longer available.', item_row.title)::text;
        return;
      end if;
    end if;

    insert into public.booking_capacity_holds (
      booking_intent_id,
      booking_intent_item_id,
      event_id,
      item_type,
      event_category_id,
      event_addon_id,
      quantity,
      held_until
    )
    values (
      p_booking_intent_id,
      item_row.id,
      booking_row.event_id,
      item_row.item_type,
      item_row.event_category_id,
      item_row.event_addon_id,
      item_row.quantity,
      v_held_until
    );
  end loop;

  update public.booking_intents
  set status = case when total_minor > 0 then 'payment_pending'::booking_intent_status else status end,
      held_until = v_held_until
  where id = p_booking_intent_id;

  return query select 'reserved'::text, v_held_until, 'Capacity reserved.'::text;
end;
$$;

create or replace function public.prepare_checkout_payment_attempt(
  p_booking_intent_id uuid,
  p_hold_minutes integer default 25,
  p_max_attempts integer default 5
)
returns table (
  outcome text,
  payment_attempt_id uuid,
  attempt_number integer,
  merchant_order_reference text,
  payment_href text,
  held_until timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_intents%rowtype;
  attempt_row public.payment_attempts%rowtype;
  reservation_row record;
  v_attempt_number integer;
  v_merchant_order_reference text;
begin
  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::integer, null::text, null::text, null::timestamptz, 'Booking not found.'::text;
    return;
  end if;

  if booking_row.total_minor <= 0 then
    return query select 'invalid_state_transition'::text, null::uuid, null::integer, null::text, null::text, null::timestamptz, 'Free bookings do not require payment.'::text;
    return;
  end if;

  if booking_row.status not in ('email_verified', 'payment_failed', 'payment_pending') then
    return query select 'invalid_state_transition'::text, null::uuid, null::integer, null::text, null::text, null::timestamptz, 'Booking is not ready for payment.'::text;
    return;
  end if;

  if booking_row.status = 'payment_pending' then
    select *
    into attempt_row
    from public.payment_attempts pa
    where pa.booking_intent_id = p_booking_intent_id
    order by pa.attempt_number desc
    limit 1
    for update;

    if found and attempt_row.status = 'payment_pending' and attempt_row.payment_href is not null then
      return query select 'existing_payment'::text, attempt_row.id, attempt_row.attempt_number, attempt_row.merchant_order_reference, attempt_row.payment_href, booking_row.held_until, 'Payment is already ready.'::text;
      return;
    end if;

    if found and attempt_row.status = 'order_create_pending' and attempt_row.created_at > now() - interval '2 minutes' then
      return query select 'order_create_pending'::text, attempt_row.id, attempt_row.attempt_number, attempt_row.merchant_order_reference, null::text, booking_row.held_until, 'Payment is being prepared. Try again in a moment.'::text;
      return;
    end if;
  end if;

  if booking_row.attempt_count >= p_max_attempts then
    update public.booking_intents
    set status = 'expired'
    where id = p_booking_intent_id;

    return query select 'attempt_limit_exceeded'::text, null::uuid, null::integer, null::text, null::text, null::timestamptz, 'Payment attempts exceeded. Start a new booking.'::text;
    return;
  end if;

  select *
  into reservation_row
  from public.reserve_booking_capacity(p_booking_intent_id, p_hold_minutes)
  limit 1;

  if reservation_row.outcome is distinct from 'reserved' then
    return query select reservation_row.outcome::text, null::uuid, null::integer, null::text, null::text, reservation_row.held_until::timestamptz, reservation_row.message::text;
    return;
  end if;

  v_attempt_number := booking_row.attempt_count + 1;
  v_merchant_order_reference := regexp_replace(
    booking_row.public_reference || '-' || v_attempt_number::text,
    '[^a-zA-Z0-9-]',
    '-',
    'g'
  );

  insert into public.payment_attempts (
    booking_intent_id,
    attempt_number,
    status,
    merchant_order_reference,
    amount_minor,
    currency_code
  )
  values (
    p_booking_intent_id,
    v_attempt_number,
    'order_create_pending',
    v_merchant_order_reference,
    booking_row.total_minor,
    booking_row.currency_code
  )
  returning *
  into attempt_row;

  update public.booking_intents
  set status = 'payment_pending',
      attempt_count = v_attempt_number,
      declaration_accepted_at = coalesce(declaration_accepted_at, now()),
      held_until = reservation_row.held_until
  where id = p_booking_intent_id;

  return query select 'prepared'::text, attempt_row.id, attempt_row.attempt_number, attempt_row.merchant_order_reference, null::text, reservation_row.held_until::timestamptz, 'Payment attempt prepared.'::text;
end;
$$;

create or replace function public.fulfill_booking_intent(
  p_booking_intent_id uuid,
  p_payment_attempt_id uuid,
  p_qr_token_hashes text[]
)
returns table (
  outcome text,
  registration_id uuid,
  attendee_index integer,
  full_name text,
  email_raw text,
  category_id text,
  category_title text,
  ticket_option_id text,
  ticket_option_title text,
  manual_checkin_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_intents%rowtype;
  payment_row public.payment_attempts%rowtype;
  attendee_row record;
  v_expected_count integer;
  v_manual_checkin_code text;
  v_existing_count integer;
begin
  perform public.lock_checkout_capacity_buckets(p_booking_intent_id);

  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  if booking_row.status = 'fulfilled' then
    return query
    select
      'already_fulfilled'::text,
      r.id,
      coalesce(a.attendee_index, 0),
      r.full_name,
      r.email_raw,
      r.category_id,
      r.category_title,
      r.ticket_option_id,
      r.ticket_option_title,
      r.manual_checkin_code
    from public.registrations r
    left join public.booking_attendees a on a.booking_intent_id = r.booking_intent_id and a.full_name = r.full_name
    where r.booking_intent_id = p_booking_intent_id
    order by coalesce(a.attendee_index, 0), r.created_at;
    return;
  end if;

  if booking_row.total_minor > 0 then
    if p_payment_attempt_id is null then
      return query select 'invalid_state_transition'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
      return;
    end if;

    select *
    into payment_row
    from public.payment_attempts
    where id = p_payment_attempt_id
      and booking_intent_id = p_booking_intent_id
    for update;

    if not found or payment_row.status <> 'paid' then
      return query select 'invalid_state_transition'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
      return;
    end if;
  elsif booking_row.status not in ('email_verified', 'paid') then
    return query select 'invalid_state_transition'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.booking_capacity_holds
    where booking_intent_id = p_booking_intent_id
      and released_at is null
      and held_until <= now()
  ) then
    update public.booking_intents
    set status = 'manual_action_required',
        manual_action_reason = 'Payment succeeded after the capacity hold expired.'
    where id = p_booking_intent_id;

    update public.payment_attempts
    set status = 'manual_action_required',
        last_error = 'Payment succeeded after the capacity hold expired.'
    where id = p_payment_attempt_id;

    return query select 'manual_action_required'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  select count(*)
  into v_expected_count
  from public.booking_attendees
  where booking_intent_id = p_booking_intent_id;

  if array_length(p_qr_token_hashes, 1) is distinct from v_expected_count then
    return query select 'invalid'::text, null::uuid, null::integer, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  select count(*)
  into v_existing_count
  from public.registrations
  where booking_intent_id = p_booking_intent_id;

  if v_existing_count > 0 then
    update public.booking_intents
    set status = 'fulfilled'
    where id = p_booking_intent_id;

    return query
    select
      'already_fulfilled'::text,
      r.id,
      coalesce(a.attendee_index, 0),
      r.full_name,
      r.email_raw,
      r.category_id,
      r.category_title,
      r.ticket_option_id,
      r.ticket_option_title,
      r.manual_checkin_code
    from public.registrations r
    left join public.booking_attendees a on a.booking_intent_id = r.booking_intent_id and a.full_name = r.full_name
    where r.booking_intent_id = p_booking_intent_id
    order by coalesce(a.attendee_index, 0), r.created_at;
    return;
  end if;

  for attendee_row in
    select
      a.id,
      a.attendee_index,
      a.full_name,
      coalesce(a.email_raw, booking_row.payer_email_raw) as email_raw,
      coalesce(a.email_normalized, booking_row.payer_email_normalized) as email_normalized,
      coalesce(a.phone, booking_row.payer_phone) as phone,
      coalesce(a.age, booking_row.payer_age) as age,
      coalesce(a.uae_resident, booking_row.payer_uae_resident) as uae_resident,
      cat.public_id as category_public_id,
      cat.title as category_title,
      addon.public_id as addon_public_id,
      addon.title as addon_title
    from public.booking_attendees a
    left join public.booking_intent_items cat_item
      on cat_item.booking_intent_id = a.booking_intent_id
      and cat_item.attendee_id = a.id
      and cat_item.item_type = 'category'
    left join public.event_categories cat on cat.id = cat_item.event_category_id
    left join public.booking_intent_items addon_item
      on addon_item.booking_intent_id = a.booking_intent_id
      and addon_item.attendee_id = a.id
      and addon_item.item_type = 'addon'
    left join public.event_addons addon on addon.id = addon_item.event_addon_id
    where a.booking_intent_id = p_booking_intent_id
    order by a.attendee_index
  loop
    v_manual_checkin_code := public.generate_unique_manual_checkin_code(booking_row.event_id);

    insert into public.registrations (
      event_id,
      full_name,
      email_raw,
      email_normalized,
      phone,
      age,
      uae_resident,
      category_id,
      category_title,
      ticket_option_id,
      ticket_option_title,
      declaration_version,
      declaration_accepted_at,
      email_verified_at,
      status,
      qr_token_hash,
      qr_token_last_rotated_at,
      manual_checkin_code,
      booking_id,
      is_primary,
      registered_by_email,
      booking_intent_id,
      payment_attempt_id,
      ni_order_reference,
      paid_amount_minor,
      paid_currency_code
    )
    values (
      booking_row.event_id,
      attendee_row.full_name,
      attendee_row.email_raw,
      attendee_row.email_normalized,
      attendee_row.phone,
      attendee_row.age,
      attendee_row.uae_resident,
      attendee_row.category_public_id,
      attendee_row.category_title,
      attendee_row.addon_public_id,
      attendee_row.addon_title,
      booking_row.declaration_version,
      coalesce(booking_row.declaration_accepted_at, now()),
      coalesce(booking_row.email_verified_at, now()),
      'registered',
      p_qr_token_hashes[attendee_row.attendee_index + 1],
      now(),
      v_manual_checkin_code,
      booking_row.id,
      attendee_row.attendee_index = 0,
      booking_row.payer_email_raw,
      booking_row.id,
      p_payment_attempt_id,
      payment_row.ni_order_reference,
      case when booking_row.total_minor > 0 then booking_row.total_minor else null end,
      case when booking_row.total_minor > 0 then booking_row.currency_code else null end
    )
    returning
      'fulfilled'::text,
      id,
      attendee_row.attendee_index,
      full_name,
      email_raw,
      category_id,
      category_title,
      ticket_option_id,
      ticket_option_title,
      manual_checkin_code
    into outcome, registration_id, attendee_index, full_name, email_raw, category_id, category_title, ticket_option_id, ticket_option_title, manual_checkin_code;

    return next;
  end loop;

  update public.booking_capacity_holds
  set released_at = now()
  where booking_intent_id = p_booking_intent_id
    and released_at is null;

  update public.booking_intents
  set status = 'fulfilled'
  where id = p_booking_intent_id;
end;
$$;

create or replace function public.claim_payment_jobs(
  p_limit integer default 10,
  p_lock_ttl_seconds integer default 120
)
returns table (
  id uuid,
  kind text,
  payment_event_id uuid,
  payment_attempt_id uuid,
  booking_intent_id uuid,
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
    from public.payment_jobs j
    where (
      j.status = 'queued'
      or (
        j.status = 'processing'
        and j.locked_at is not null
        and j.locked_at < now() - make_interval(secs => p_lock_ttl_seconds)
      )
    )
      and j.run_after <= now()
      and j.attempts < j.attempts_max
    order by j.created_at
    limit p_limit
    for update skip locked
  )
  update public.payment_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      last_error = null
  from candidates
  where j.id = candidates.id
  returning j.id, j.kind, j.payment_event_id, j.payment_attempt_id, j.booking_intent_id, j.attempts, j.attempts_max;
end;
$$;

create or replace function public.release_expired_booking_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.booking_capacity_holds
  set released_at = now()
  where released_at is null
    and held_until <= now();

  get diagnostics v_count = row_count;

  update public.booking_intents
  set status = 'expired'
  where status in ('otp_sent', 'email_verified', 'payment_pending', 'payment_failed')
    and held_until is not null
    and held_until <= now()
    and total_minor = 0;

  return v_count;
end;
$$;

