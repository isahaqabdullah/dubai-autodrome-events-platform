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
