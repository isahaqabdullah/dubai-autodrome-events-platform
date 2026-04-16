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
