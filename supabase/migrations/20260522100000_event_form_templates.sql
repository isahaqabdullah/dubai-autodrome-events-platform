create table if not exists public.event_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  values jsonb not null default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_form_templates_name_nonempty check (length(btrim(name)) > 0),
  constraint event_form_templates_name_length check (length(name) <= 120)
);

create index if not exists event_form_templates_updated_idx
  on public.event_form_templates(updated_at desc, name);

drop trigger if exists set_event_form_templates_updated_at on public.event_form_templates;
create trigger set_event_form_templates_updated_at
before update on public.event_form_templates
for each row
execute function public.set_updated_at();

alter table public.event_form_templates enable row level security;
