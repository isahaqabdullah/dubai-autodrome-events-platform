alter table public.booking_intents
add column if not exists payer_marketing_opt_in boolean not null default false;

alter table public.registrations
add column if not exists marketing_opt_in boolean not null default false;

create or replace function public.apply_registration_marketing_opt_in()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payer_marketing_opt_in boolean;
begin
  if new.booking_intent_id is not null then
    if coalesce(new.is_primary, false) then
      select booking_intent.payer_marketing_opt_in
      into v_payer_marketing_opt_in
      from public.booking_intents as booking_intent
      where booking_intent.id = new.booking_intent_id;

      new.marketing_opt_in := coalesce(v_payer_marketing_opt_in, false);
    else
      new.marketing_opt_in := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_apply_marketing_opt_in on public.registrations;

create trigger registrations_apply_marketing_opt_in
before insert or update of booking_intent_id, is_primary
on public.registrations
for each row
execute function public.apply_registration_marketing_opt_in();
