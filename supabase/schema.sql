-- Run once in a dedicated Supabase project's SQL editor.
-- This table is server-only. Never expose its payload or service role key to clients.
create table if not exists public.research_workspace (
  id text primary key check (id = 'main'),
  version bigint not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.research_workspace enable row level security;
revoke all on public.research_workspace from anon, authenticated;
grant select, insert, update on public.research_workspace to service_role;
-- No public policies: browser reads go through the sanitized Next.js API.
-- LangGraph PostgresSaver uses these checkpoint tables via DATABASE_URL.
-- Keep checkpoints in a private schema that is not exposed by the Data API.

-- Bootstrap the private LangGraph schema explicitly. This avoids requiring the
-- short-lived Vercel runtime connection to perform DDL during every research run.
create schema if not exists research_checkpoints;
revoke all on schema research_checkpoints from public, anon, authenticated;
grant usage, create on schema research_checkpoints to postgres;

create table if not exists research_checkpoints.checkpoint_migrations (
  v integer primary key
);
create table if not exists research_checkpoints.checkpoints (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb not null,
  metadata jsonb not null default '{}',
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);
create table if not exists research_checkpoints.checkpoint_blobs (
  thread_id text not null,
  checkpoint_ns text not null default '',
  channel text not null,
  version text not null,
  type text not null,
  blob bytea,
  primary key (thread_id, checkpoint_ns, channel, version)
);
create table if not exists research_checkpoints.checkpoint_writes (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id text not null,
  idx integer not null,
  channel text not null,
  type text,
  blob bytea not null,
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

insert into research_checkpoints.checkpoint_migrations (v)
values (0), (1), (2), (3), (4)
on conflict (v) do nothing;

revoke all on all tables in schema research_checkpoints
  from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema research_checkpoints
  to postgres;
