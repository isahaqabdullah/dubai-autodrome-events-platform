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

alter function public.generate_unique_manual_checkin_code(uuid)
set search_path = public;

alter function public.confirm_pending_registration_group_by_otp(uuid, text, text, text[], jsonb)
set search_path = public, extensions;
