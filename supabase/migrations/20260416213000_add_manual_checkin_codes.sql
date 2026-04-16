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
