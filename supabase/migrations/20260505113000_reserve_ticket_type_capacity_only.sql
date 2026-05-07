drop function if exists public.reserve_booking_capacity(uuid, integer, boolean);

create or replace function public.reserve_booking_capacity(
  p_booking_intent_id uuid,
  p_hold_minutes integer default 25,
  p_advance_payment_pending boolean default true
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
begin
  perform public.lock_checkout_capacity_buckets(p_booking_intent_id);

  select *
  into booking_row
  from public.booking_intents
  where id = p_booking_intent_id
  for update;

  if not found then
    return query select 'invalid'::text, null::timestamptz, 'Booking not found.'::text;
    return;
  end if;

  if booking_row.status not in ('otp_sent', 'email_verified', 'payment_failed', 'payment_pending') then
    return query select 'invalid_state_transition'::text, null::timestamptz, 'Booking is not ready for capacity reservation.'::text;
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

    select v_existing + coalesce(sum(h.quantity), 0)::integer
    into v_existing
    from public.booking_capacity_holds h
    where h.event_id = booking_row.event_id
      and h.item_type = 'category'
      and h.booking_intent_id <> p_booking_intent_id
      and h.released_at is null
      and h.held_until > now();

    select coalesce(sum(quantity), 0)::integer
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
      i.event_category_id,
      sum(i.quantity)::integer as quantity,
      c.public_id as category_public_id,
      c.capacity as category_capacity,
      c.sold_out as sold_out,
      c.active as active,
      c.title as title
    from public.booking_intent_items i
    join public.event_categories c on c.id = i.event_category_id
    where i.booking_intent_id = p_booking_intent_id
      and i.item_type = 'category'
    group by
      i.event_category_id,
      c.public_id,
      c.capacity,
      c.sold_out,
      c.active,
      c.title
    order by i.event_category_id::text
  loop
    if not item_row.active or item_row.sold_out then
      return query select 'capacity_exceeded'::text, null::timestamptz, format('%s is no longer available.', item_row.title)::text;
      return;
    end if;

    if item_row.category_capacity is not null then
      select coalesce(count(*), 0)
      into v_existing
      from public.registrations
      where event_id = booking_row.event_id
        and category_id = item_row.category_public_id
        and status not in ('revoked', 'cancelled');

      select v_existing + coalesce(sum(h.quantity), 0)::integer
      into v_existing
      from public.booking_capacity_holds h
      where h.event_category_id = item_row.event_category_id
        and h.booking_intent_id <> p_booking_intent_id
        and h.released_at is null
        and h.held_until > now();

      if v_existing + item_row.quantity > item_row.category_capacity then
        return query select 'capacity_exceeded'::text, null::timestamptz, format('%s capacity is no longer available.', item_row.title)::text;
        return;
      end if;
    end if;
  end loop;

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
  select
    p_booking_intent_id,
    i.id,
    booking_row.event_id,
    i.item_type,
    i.event_category_id,
    null,
    i.quantity,
    v_held_until
  from public.booking_intent_items i
  where i.booking_intent_id = p_booking_intent_id
    and i.item_type = 'category';

  update public.booking_intents
  set status = case
        when p_advance_payment_pending and total_minor > 0 then 'payment_pending'::booking_intent_status
        else status
      end,
      held_until = v_held_until
  where id = p_booking_intent_id;

  return query select 'reserved'::text, v_held_until, 'Capacity reserved.'::text;
end;
$$;

revoke execute on function public.reserve_booking_capacity(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_booking_capacity(uuid, integer, boolean) to service_role;
