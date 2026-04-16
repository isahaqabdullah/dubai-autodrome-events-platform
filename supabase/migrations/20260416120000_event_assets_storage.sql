-- Create storage bucket for event assets (poster images, disclaimer PDFs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-assets',
  'event-assets',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
);

-- Allow public read access to event assets
create policy "Public read access for event assets"
  on storage.objects for select
  using (bucket_id = 'event-assets');

-- Allow authenticated users with service role to manage assets (handled via admin client)
-- No insert/update/delete policies needed since we use the service role key
