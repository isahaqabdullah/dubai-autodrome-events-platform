drop function if exists public.reserve_booking_capacity(uuid, integer);
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
  v_capacity integer;
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
      i.item_type,
      i.event_category_id,
      i.event_addon_id,
      sum(i.quantity)::integer as quantity,
      c.public_id as category_public_id,
      a.public_id as addon_public_id,
      c.capacity as category_capacity,
      a.capacity as addon_capacity,
      coalesce(c.sold_out, a.sold_out, false) as sold_out,
      coalesce(c.active, a.active, false) as active,
      coalesce(c.title, a.title, max(i.title)) as title
    from public.booking_intent_items i
    left join public.event_categories c on c.id = i.event_category_id
    left join public.event_addons a on a.id = i.event_addon_id
    where i.booking_intent_id = p_booking_intent_id
    group by
      i.item_type,
      i.event_category_id,
      i.event_addon_id,
      c.public_id,
      a.public_id,
      c.capacity,
      a.capacity,
      c.sold_out,
      a.sold_out,
      c.active,
      a.active,
      c.title,
      a.title
    order by i.item_type, coalesce(i.event_category_id::text, i.event_addon_id::text)
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
          and category_id = item_row.category_public_id
          and status not in ('revoked', 'cancelled');

        select v_existing + coalesce(sum(h.quantity), 0)::integer
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
          and ticket_option_id = item_row.addon_public_id
          and status not in ('revoked', 'cancelled');

        select v_existing + coalesce(sum(h.quantity), 0)::integer
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
    i.event_addon_id,
    i.quantity,
    v_held_until
  from public.booking_intent_items i
  where i.booking_intent_id = p_booking_intent_id;

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
