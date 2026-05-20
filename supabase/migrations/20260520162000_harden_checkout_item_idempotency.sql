-- Make checkout attendee item assignment idempotent under repeated payment requests.
--
-- A double-submitted payment request can race while replacing addon rows. The
-- fulfillment RPC joins category/addon rows per attendee, so duplicate addon rows
-- can duplicate the attendee in the insert loop and reuse the same QR hash.

with ranked_items as (
  select
    i.id,
    row_number() over (
      partition by i.booking_intent_id, i.attendee_id, i.item_type
      order by
        case
          when exists (
            select 1
            from public.booking_capacity_holds h
            where h.booking_intent_item_id = i.id
          ) then 0
          else 1
        end,
        i.created_at desc,
        i.id desc
    ) as duplicate_rank
  from public.booking_intent_items i
  where i.attendee_id is not null
)
delete from public.booking_intent_items i
using ranked_items r
where i.id = r.id
  and r.duplicate_rank > 1;

create unique index if not exists booking_intent_items_attendee_type_unique
  on public.booking_intent_items(booking_intent_id, attendee_id, item_type);
