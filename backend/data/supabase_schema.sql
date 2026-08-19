-- ===================================================
-- SUBLYX STUDIO — SUPABASE DATABASE & STORAGE SCHEMA
-- Run this in your Supabase SQL Editor
-- ===================================================

-- 1. Create Projects Table
create table if not exists public.projects (
  id text primary key,
  name text not null default 'Untitled Video Project',
  video_filename text,
  duration numeric,
  captions jsonb default '[]'::jsonb,
  style_config jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS) & Public Access Policies
alter table public.projects enable row level security;

create policy "Allow public read access"
  on public.projects for select
  using (true);

create policy "Allow public insert/update access"
  on public.projects for all
  using (true)
  with check (true);

-- 3. Create Storage Bucket for Uploads & Exports (Optional)
insert into storage.buckets (id, name, public)
values ('sublyx-media', 'sublyx-media', true)
on conflict (id) do nothing;

create policy "Public Access Policy"
  on storage.objects for select
  using ( bucket_id = 'sublyx-media' );

create policy "Public Upload Policy"
  on storage.objects for insert
  with check ( bucket_id = 'sublyx-media' );
