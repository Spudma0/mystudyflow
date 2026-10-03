-- The shared content cache.
--
-- Textbook contents and the teaching of a topic are the same for every student
-- using that book, so they are generated once and shared. Holding them here
-- rather than on the container's disk is what makes that true across a
-- redeploy: Railway throws the filesystem away on every deploy, and without
-- this table the next student to open a textbook pays for a lesson that was
-- already generated and paid for.
--
-- Run once, in the Supabase SQL editor.

create table if not exists public.content_cache (
  namespace  text        not null,
  key        text        not null,
  value      jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (namespace, key)
);

-- Entries are read back by exact namespace and key; the index the primary key
-- already provides is the one every lookup uses.

-- Nothing here is personal — it is generated teaching material, keyed by book
-- and topic with nothing about the student in it. Row level security is on all
-- the same, with no policies at all, so the table is reachable only by the
-- backend's service role and never by a signed-in client.
alter table public.content_cache enable row level security;

-- Age is enforced in the application (CACHE_MAX_AGE_DAYS, 90 by default), so
-- old rows are ignored rather than deleted. To reclaim the space:
--   delete from public.content_cache where created_at < now() - interval '90 days';
