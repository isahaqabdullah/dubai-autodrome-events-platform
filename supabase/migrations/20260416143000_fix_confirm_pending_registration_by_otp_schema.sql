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
