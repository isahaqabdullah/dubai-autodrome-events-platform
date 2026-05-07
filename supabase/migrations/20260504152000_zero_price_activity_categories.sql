-- Activity categories are operational classifications, not paid add-ons.
-- Keep the existing event_addons table, but prevent legacy prices from leaking into checkout.
update public.event_addons
set
  price_minor = 0,
  currency_code = 'AED',
  updated_at = now()
where price_minor <> 0
  or currency_code is null;
