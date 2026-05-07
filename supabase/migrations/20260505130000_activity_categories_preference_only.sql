-- Activity categories are attendee preferences, not limited inventory.
-- Keep the existing event_addons table for compatibility, but clear capacity
-- so old admin values cannot affect future UI or reporting decisions.
update public.event_addons
set
  capacity = null,
  price_minor = 0,
  currency_code = 'AED',
  updated_at = now()
where capacity is not null
  or price_minor <> 0
  or currency_code is null;
