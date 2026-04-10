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
