-- Ensure paid fulfillment rejects expired holds even after the maintenance
-- cron has released them from active capacity counts.

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
  set status = 'fulfilled'
  where id = p_booking_intent_id;
end;
$$;
