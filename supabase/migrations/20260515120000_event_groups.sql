create table if not exists public.event_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_groups_name_nonempty check (length(btrim(name)) > 0),
  constraint event_groups_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

insert into public.event_groups (name, slug, description, sort_order)
values ('General', 'general', 'Default group for existing events.', 0)
on conflict (slug) do nothing;

alter table public.events
  add column if not exists event_group_id uuid references public.event_groups(id) on delete restrict;

update public.events
set event_group_id = (
  select id
  from public.event_groups
  where slug = 'general'
  limit 1
)
where event_group_id is null;

alter table public.events
  alter column event_group_id set not null;

create index if not exists event_groups_sort_idx on public.event_groups(sort_order, name);
create index if not exists events_event_group_start_idx on public.events(event_group_id, start_at);

drop trigger if exists set_event_groups_updated_at on public.event_groups;
create trigger set_event_groups_updated_at
before update on public.event_groups
for each row execute function public.set_updated_at();

alter table public.event_groups enable row level security;
