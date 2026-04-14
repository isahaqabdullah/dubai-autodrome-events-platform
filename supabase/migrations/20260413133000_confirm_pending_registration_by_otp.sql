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
