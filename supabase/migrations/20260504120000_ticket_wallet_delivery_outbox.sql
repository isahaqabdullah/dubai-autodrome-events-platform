-- Durable ticket wallet links and confirmation delivery outbox.

alter table public.booking_intents
  add column if not exists ticket_access_nonce uuid;

update public.booking_intents
set ticket_access_nonce = gen_random_uuid()
where ticket_access_nonce is null;

alter table public.booking_intents
  alter column ticket_access_nonce set default gen_random_uuid(),
  alter column ticket_access_nonce set not null;

alter table public.registrations
  add column if not exists booking_attendee_id uuid references public.booking_attendees(id) on delete set null;

create index if not exists registrations_booking_attendee_idx
  on public.registrations(booking_attendee_id)
  where booking_attendee_id is not null;

create table if not exists public.ticket_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_intent_id uuid not null references public.booking_intents(id) on delete cascade,
  delivery_kind text not null check (delivery_kind in ('automatic', 'user_resend')),
  delivery_version integer not null default 1 check (delivery_version > 0),
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'accepted', 'failed', 'bounced', 'complained')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  provider_message_id text,
  accepted_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_intent_id, delivery_kind, delivery_version)
);

create unique index if not exists ticket_delivery_jobs_automatic_booking_unique
  on public.ticket_delivery_jobs(booking_intent_id)
  where delivery_kind = 'automatic';

create index if not exists ticket_delivery_jobs_pending_idx
  on public.ticket_delivery_jobs(next_attempt_at, created_at)
  where status = 'pending';

create index if not exists ticket_delivery_jobs_processing_idx
  on public.ticket_delivery_jobs(locked_at)
  where status = 'processing';

drop trigger if exists set_ticket_delivery_jobs_updated_at on public.ticket_delivery_jobs;
create trigger set_ticket_delivery_jobs_updated_at
before update on public.ticket_delivery_jobs
for each row execute function public.set_updated_at();

alter table public.ticket_delivery_jobs enable row level security;

create or replace function public.ensure_ticket_delivery_job(p_booking_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_intents%rowtype;
  v_job_id uuid;
begin
  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id;

  if not found then
    return null;
  end if;

  insert into public.ticket_delivery_jobs (
    booking_intent_id,
    delivery_kind,
    delivery_version,
    recipient_email,
    status,
    next_attempt_at
  )
  values (
    booking_row.id,
    'automatic',
    1,
    booking_row.payer_email_raw,
    'pending',
    now()
  )
  on conflict do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    return v_job_id;
  end if;

  select id
  into v_job_id
  from public.ticket_delivery_jobs
  where booking_intent_id = booking_row.id
    and delivery_kind = 'automatic'
  limit 1;

  return v_job_id;
end;
$$;

create or replace function public.create_ticket_delivery_job(
  p_booking_intent_id uuid,
  p_delivery_kind text,
  p_recipient_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.booking_intents%rowtype;
  v_version integer;
  v_job_id uuid;
begin
  if p_delivery_kind = 'automatic' then
    return public.ensure_ticket_delivery_job(p_booking_intent_id);
  end if;

  if p_delivery_kind <> 'user_resend' then
    raise exception 'Unsupported delivery kind: %', p_delivery_kind;
  end if;

  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if not found then
    return null;
  end if;

  select coalesce(max(delivery_version), 0) + 1
  into v_version
  from public.ticket_delivery_jobs
  where booking_intent_id = booking_row.id
    and delivery_kind = p_delivery_kind;

  insert into public.ticket_delivery_jobs (
    booking_intent_id,
    delivery_kind,
    delivery_version,
    recipient_email,
    status,
    next_attempt_at
  )
  values (
    booking_row.id,
    p_delivery_kind,
    v_version,
    coalesce(nullif(p_recipient_email, ''), booking_row.payer_email_raw),
    'pending',
    now()
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.claim_ticket_delivery_jobs(
  p_limit integer default 5,
  p_lock_ttl_seconds integer default 120
)
returns table (
  id uuid,
  booking_intent_id uuid,
  delivery_kind text,
  delivery_version integer,
  recipient_email text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.ticket_delivery_jobs j
    where (
        j.status = 'pending'
        and j.next_attempt_at <= now()
      )
      or (
        j.status = 'processing'
        and j.locked_at < now() - make_interval(secs => p_lock_ttl_seconds)
      )
    order by j.next_attempt_at, j.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.ticket_delivery_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      last_error = null
  from candidates
  where j.id = candidates.id
  returning
    j.id,
    j.booking_intent_id,
    j.delivery_kind,
    j.delivery_version,
    j.recipient_email,
    j.attempts;
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
  v_registration_id uuid;
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
    perform public.ensure_ticket_delivery_job(p_booking_intent_id);
    return query
    select
      'already_fulfilled'::text,
      r.id,
      coalesce(attendee_link.attendee_index, 0),
      r.full_name,
      r.email_raw,
      r.category_id,
      r.category_title,
      r.ticket_option_id,
      r.ticket_option_title,
      r.manual_checkin_code
    from public.registrations r
    left join lateral (
      select a.attendee_index
      from public.booking_attendees a
      where a.booking_intent_id = r.booking_intent_id
        and (
          a.id = r.booking_attendee_id
          or (r.booking_attendee_id is null and a.full_name = r.full_name)
        )
      order by case when a.id = r.booking_attendee_id then 0 else 1 end, a.attendee_index
      limit 1
    ) attendee_link on true
    where r.booking_intent_id = p_booking_intent_id
    order by coalesce(attendee_link.attendee_index, 0), r.created_at;
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

  select count(*)
  into v_existing_count
  from public.registrations
  where booking_intent_id = p_booking_intent_id;

  if v_existing_count > 0 then
    update public.booking_intents
    set status = 'fulfilled',
        manual_action_reason = null
    where id = p_booking_intent_id;

    if p_payment_attempt_id is not null then
      update public.payment_attempts
      set status = 'paid',
          last_error = null
      where id = p_payment_attempt_id
        and status = 'manual_action_required'
        and last_error = 'Payment succeeded after the capacity hold expired.';
    end if;

    perform public.ensure_ticket_delivery_job(p_booking_intent_id);

    return query
    select
      'already_fulfilled'::text,
      r.id,
      coalesce(attendee_link.attendee_index, 0),
      r.full_name,
      r.email_raw,
      r.category_id,
      r.category_title,
      r.ticket_option_id,
      r.ticket_option_title,
      r.manual_checkin_code
    from public.registrations r
    left join lateral (
      select a.attendee_index
      from public.booking_attendees a
      where a.booking_intent_id = r.booking_intent_id
        and (
          a.id = r.booking_attendee_id
          or (r.booking_attendee_id is null and a.full_name = r.full_name)
        )
      order by case when a.id = r.booking_attendee_id then 0 else 1 end, a.attendee_index
      limit 1
    ) attendee_link on true
    where r.booking_intent_id = p_booking_intent_id
    order by coalesce(attendee_link.attendee_index, 0), r.created_at;
    return;
  end if;

  if exists (
    select 1
    from public.booking_capacity_holds
    where booking_intent_id = p_booking_intent_id
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
      booking_attendee_id,
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
      attendee_row.id,
      p_payment_attempt_id,
      payment_row.ni_order_reference,
      case when booking_row.total_minor > 0 then booking_row.total_minor else null end,
      case when booking_row.total_minor > 0 then booking_row.currency_code else null end
    )
    returning id into v_registration_id;

    return query select
      'fulfilled'::text,
      v_registration_id,
      attendee_row.attendee_index,
      attendee_row.full_name,
      attendee_row.email_raw,
      attendee_row.category_public_id,
      attendee_row.category_title,
      attendee_row.addon_public_id,
      attendee_row.addon_title,
      v_manual_checkin_code;
  end loop;

  update public.booking_capacity_holds
  set released_at = now()
  where booking_intent_id = p_booking_intent_id
    and released_at is null;

  update public.booking_intents
  set status = 'fulfilled',
      manual_action_reason = null
  where id = p_booking_intent_id;

  perform public.ensure_ticket_delivery_job(p_booking_intent_id);
end;
$$;

revoke execute on function public.ensure_ticket_delivery_job(uuid) from public, anon, authenticated;
revoke execute on function public.create_ticket_delivery_job(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.claim_ticket_delivery_jobs(integer, integer) from public, anon, authenticated;
revoke execute on function public.fulfill_booking_intent(uuid, uuid, text[]) from public, anon, authenticated;

grant execute on function public.ensure_ticket_delivery_job(uuid) to service_role;
grant execute on function public.create_ticket_delivery_job(uuid, text, text) to service_role;
grant execute on function public.claim_ticket_delivery_jobs(integer, integer) to service_role;
grant execute on function public.fulfill_booking_intent(uuid, uuid, text[]) to service_role;
