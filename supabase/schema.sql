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
-- LangGraph PostgresSaver.setup creates checkpoint tables via DATABASE_URL.
-- Use a private connection role and do not add checkpoints to an exposed API schema.
