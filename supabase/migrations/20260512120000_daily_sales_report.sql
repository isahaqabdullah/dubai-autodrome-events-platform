alter table public.payment_attempts
  add column if not exists paid_at timestamptz;

create or replace function public.set_payment_attempt_paid_at()
returns trigger
language plpgsql
as $$
begin
  if new.paid_at is null
    and (
      new.status = 'paid'
      or (
        new.status = 'manual_action_required'
        and new.last_error = 'Payment succeeded after the capacity hold expired.'
      )
    )
  then
    if tg_op = 'UPDATE' then
      new.paid_at := coalesce(old.paid_at, now());
    else
      new.paid_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_payment_attempt_paid_at on public.payment_attempts;
create trigger set_payment_attempt_paid_at
before insert or update of status, last_error on public.payment_attempts
for each row execute function public.set_payment_attempt_paid_at();

update public.payment_attempts pa
set paid_at = coalesce(
  (
    select min(r.created_at)
    from public.registrations r
    where r.payment_attempt_id = pa.id
  ),
  pa.updated_at,
  pa.created_at
)
where pa.paid_at is null
  and (
    pa.status = 'paid'
    or (
      pa.status = 'manual_action_required'
      and pa.last_error = 'Payment succeeded after the capacity hold expired.'
    )
  );

create index if not exists payment_attempts_paid_at_idx
  on public.payment_attempts(paid_at)
  where paid_at is not null;
