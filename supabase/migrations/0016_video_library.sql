-- BEAST FEAST — video library (uploaded files + links to YouTube / Shorts / Vimeo / Dailymotion / Instagram /
-- Facebook / X), one table for both kinds.
--   * Only administrators add, edit, publish or delete videos (RLS + storage policies; checked in the database).
--   * Signed-in students see published videos only. Uploaded files live in the PRIVATE bucket lesson-videos and
--     are played through short-lived signed URLs; a file can be read only while its video is published.
--   * The links' embed addresses are built by the app from fixed official templates; the table stores the original
--     link and the detected provider/id, never raw iframe HTML.
--   * The existing videos in app_content ('content'.videos) are copied in once (idempotent); the old copy is left
--     untouched.

create table if not exists public.video_items (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{3,64}$'),
  title text not null check (length(trim(title)) between 2 and 140),
  description text not null default '' check (length(description) <= 2000),
  source text not null check (source in ('upload', 'url')),
  provider text not null check (provider in ('upload', 'youtube', 'youtube-shorts', 'vimeo', 'dailymotion', 'instagram', 'facebook', 'x')),
  url text not null default '' check (url = '' or (url ~ '^https://' and length(url) <= 500)),
  provider_id text check (provider_id is null or length(provider_id) <= 200),
  storage_path text check (storage_path is null or storage_path ~ '^videos/[A-Za-z0-9_-]{3,64}/[A-Za-z0-9._-]{1,100}$'),
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^https://' and length(thumbnail_url) <= 500)),
  thumbnail_path text check (thumbnail_path is null or thumbnail_path ~ '^thumbs/[A-Za-z0-9_-]{3,64}/[A-Za-z0-9._-]{1,100}$'),
  mime text check (mime is null or mime in ('video/mp4', 'video/webm', 'video/quicktime')),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 52428800),
  vertical boolean not null default false,
  category text not null default 'Electronics',
  competition text not null default 'all' check (competition in ('all', 'race', 'line', 'sumo')),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  topic_id text check (topic_id is null or length(topic_id) <= 80),
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'upload' and provider = 'upload' and storage_path is not null) or (source = 'url' and provider <> 'upload' and url <> ''))
);
create index if not exists video_items_published on public.video_items (published, created_at desc);

alter table public.video_items enable row level security;
drop policy if exists video_items_read on public.video_items;
create policy video_items_read on public.video_items for select to authenticated using (published or public.is_admin());
drop policy if exists video_items_admin on public.video_items;
create policy video_items_admin on public.video_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.video_items from anon;
grant select, insert, update, delete on public.video_items to authenticated;
grant all on public.video_items to service_role;

create or replace function public.video_items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists video_items_touch on public.video_items;
create trigger video_items_touch before insert or update on public.video_items for each row execute function public.video_items_touch();

-- ── private bucket for uploaded files (50 MB each, video + thumbnail types only) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-videos', 'lesson-videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists lesson_videos_admin_write on storage.objects;
create policy lesson_videos_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-videos' and public.is_admin() and (name ~ '^videos/[A-Za-z0-9_-]{3,64}/[A-Za-z0-9._-]{1,100}$' or name ~ '^thumbs/[A-Za-z0-9_-]{3,64}/[A-Za-z0-9._-]{1,100}$'));
drop policy if exists lesson_videos_admin_update on storage.objects;
create policy lesson_videos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin()) with check (bucket_id = 'lesson-videos' and public.is_admin());
drop policy if exists lesson_videos_admin_delete on storage.objects;
create policy lesson_videos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin());
-- reading (and so signing a URL) needs a published video that uses the file, or an administrator
drop policy if exists lesson_videos_read on storage.objects;
create policy lesson_videos_read on storage.objects for select to authenticated
  using (bucket_id = 'lesson-videos' and (public.is_admin() or exists (
    select 1 from public.video_items v where v.published and (v.storage_path = name or v.thumbnail_path = name))));

-- ── one-time copy of the earlier YouTube list (app_content) ──
insert into public.video_items (id, title, description, source, provider, url, provider_id, thumbnail_url, category, competition, difficulty, topic_id, published, created_at)
select left(regexp_replace(coalesce(v->>'id', md5(v::text)), '[^A-Za-z0-9_-]', '-', 'g'), 64),
       left(coalesce(nullif(trim(v->>'title'), ''), 'Video'), 140),
       left(coalesce(v->>'description', ''), 2000),
       'url',
       case when (v->>'url') ~ '/shorts/' then 'youtube-shorts' else 'youtube' end,
       left(regexp_replace(v->>'url', '^http://', 'https://'), 500),
       substring(v->>'url' from '(?:v=|youtu\.be/|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})'),
       case when (v->>'thumbnail') ~ '^https://' then left(v->>'thumbnail', 500) end,
       coalesce(nullif(v->>'category', ''), 'Electronics'),
       case when v->>'competition' in ('all', 'race', 'line', 'sumo') then v->>'competition' else 'all' end,
       case when v->>'difficulty' in ('beginner', 'intermediate', 'advanced') then v->>'difficulty' else 'beginner' end,
       nullif(v->>'topicId', ''),
       true,
       now() - (row_number() over ())::int * interval '1 second'
from public.app_content c, jsonb_array_elements(coalesce(c.value->'videos', '[]'::jsonb)) v
where c.key = 'content'
  and (v->>'url') ~ '^https?://([a-z]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/'
  and substring(v->>'url' from '(?:v=|youtu\.be/|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})') is not null
  and length(coalesce(nullif(v->>'id', ''), md5(v::text))) >= 3
on conflict (id) do nothing;
