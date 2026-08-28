-- ============================================================
-- NIRBHAYA SANCHAR — Supabase QA Control Table Migration
-- Run this ONCE in the Supabase SQL Editor:
-- https://supabase.com/dashboard ? your project ? SQL Editor
-- ============================================================

-- 1. Create qa_control table
CREATE TABLE IF NOT EXISTS public.qa_control (
  id TEXT PRIMARY KEY DEFAULT 'global_qa',
  enabled BOOLEAN NOT NULL DEFAULT false,
  scenario TEXT NOT NULL DEFAULT 'LOW' CHECK (scenario IN (''LOW'', ''MEDIUM'', ''HIGH'')),
  score FLOAT NOT NULL DEFAULT 15.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Insert the single global row (idempotent)
INSERT INTO public.qa_control (id, enabled, scenario, score, updated_at)
VALUES (''global_qa'', false, ''LOW'', 15.0, now())
ON CONFLICT (id) DO NOTHING;

-- 3. Enable Row Level Security
ALTER TABLE public.qa_control ENABLE ROW LEVEL SECURITY;

-- 4. Allow anon read
DROP POLICY IF EXISTS "Allow anon read qa_control" ON public.qa_control;
CREATE POLICY "Allow anon read qa_control" ON public.qa_control FOR SELECT USING (true);

-- 5. Allow anon upsert
DROP POLICY IF EXISTS "Allow anon upsert qa_control" ON public.qa_control;
CREATE POLICY "Allow anon upsert qa_control" ON public.qa_control FOR ALL USING (true) WITH CHECK (true);

-- 6. Enable Realtime (also enable in Dashboard ? Database ? Replication)
ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_control;

-- Verify: SELECT * FROM public.qa_control;
