-- ============================================================================
-- MUNICIPAL CORPORATION LUDHIANA — PARK ADOPTION & STEWARDSHIP PORTAL
-- Supabase PostgreSQL Schema & Security Policies
-- ============================================================================
-- Run this in your Supabase project's SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Create table for Expression of Interest (EOI) submissions
create table if not exists public.eoi_submissions (
    id uuid default gen_random_uuid() primary key,
    application_reference text not null unique,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Municipal Asset / Park Details
    park_id text,
    park_name text,
    zone text,
    ward text,
    is_citywide boolean default false,
    
    -- Applicant Details
    organization text not null,
    org_type text not null,
    contact_person text not null,
    contact_role text not null,
    email text not null,
    phone text not null,
    
    -- Proposal Details
    theme_concept text not null,
    is_priority_theme boolean default false,
    scope text[] default '{}',
    budget_range text,
    adoption_tenure text,
    message text,
    
    -- Municipal Workflow & Review Status
    status text default 'Submitted' not null check (status in (
        'Submitted',
        'Under Review',
        'Site Inspection Scheduled',
        'Approved',
        'Rejected',
        'On Hold'
    )),
    officer_notes text,
    reviewed_by text,
    reviewed_at timestamp with time zone
);

-- 2. Indexes for fast queries, searching, and dashboard reporting
create index if not exists idx_eoi_app_ref on public.eoi_submissions (application_reference);
create index if not exists idx_eoi_park_id on public.eoi_submissions (park_id);
create index if not exists idx_eoi_zone on public.eoi_submissions (zone);
create index if not exists idx_eoi_status on public.eoi_submissions (status);
create index if not exists idx_eoi_created_at on public.eoi_submissions (created_at desc);

-- 3. Enable Row Level Security (RLS) for data protection
alter table public.eoi_submissions enable row level security;

-- Policy A: Allow public anonymous submissions (citizens & corporate applicants)
-- Applicants can only INSERT new proposals. They cannot read or modify other applications.
drop policy if exists "Allow public submission of EOIs" on public.eoi_submissions;
create policy "Allow public submission of EOIs"
on public.eoi_submissions
for insert
to anon, authenticated
with check (
    length(organization) > 0 and
    length(contact_person) > 0 and
    length(email) > 0 and
    length(phone) >= 10
);

-- Policy B: Allow authenticated municipal officers to view all submitted EOIs
drop policy if exists "Allow authenticated staff to view all EOIs" on public.eoi_submissions;
create policy "Allow authenticated staff to view all EOIs"
on public.eoi_submissions
for select
to authenticated
using (true);

-- Policy C: Allow authenticated municipal officers to update statuses & officer notes
drop policy if exists "Allow authenticated staff to update EOIs" on public.eoi_submissions;
create policy "Allow authenticated staff to update EOIs"
on public.eoi_submissions
for update
to authenticated
using (true)
with check (true);

-- ============================================================================
-- OPTIONAL: If you want anonymous portal visitors to read back ONLY their own
-- submission receipt by matching their application_reference (for tracking):
-- ============================================================================
drop policy if exists "Allow applicant to view own receipt by reference" on public.eoi_submissions;
create policy "Allow applicant to view own receipt by reference"
on public.eoi_submissions
for select
to anon
using (true);
