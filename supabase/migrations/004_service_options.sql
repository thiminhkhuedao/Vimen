-- 004_service_options.sql

-- ── Catalogue table ──────────────────────────────────────────────────
create table if not exists service_options (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  title        text not null,
  description  text,
  price        numeric(10,2),
  image_url    text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists service_options_profile_id_idx on service_options(profile_id);

-- ── Custom-request support on booking_requests ──────────────────────
alter table booking_requests
  add column if not exists selected_option_id uuid references service_options(id) on delete set null,
  add column if not exists is_custom_request boolean not null default false,
  add column if not exists custom_description text,
  add column if not exists custom_image_url text,
  add column if not exists custom_budget numeric(10,2);

-- ── RLS: catalogue ───────────────────────────────────────────────────
alter table service_options enable row level security;

-- Owners fully manage their own options.
create policy "Owners manage their own service options"
  on service_options for all
  using (profile_id in (select id from profiles where clerk_id = auth.jwt() ->> 'sub'))
  with check (profile_id in (select id from profiles where clerk_id = auth.jwt() ->> 'sub'));

-- Anonymous public-booking-page visitors can read active options only —
-- mirrors the public_profiles view pattern used elsewhere.
create policy "Anyone can read active service options"
  on service_options for select
  using (active = true);

-- ── Storage bucket for catalogue + custom-request images ────────────
insert into storage.buckets (id, name, public)
values ('booking-images', 'booking-images', true)
on conflict (id) do nothing;

-- Owners can upload/replace/delete only under options/{their profile id}/...
create policy "Owners manage their own option images"
  on storage.objects for all
  using (
    bucket_id = 'booking-images'
    and (storage.foldername(name))[1] = 'options'
    and (storage.foldername(name))[2] in (select id::text from profiles where clerk_id = auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'booking-images'
    and (storage.foldername(name))[1] = 'options'
    and (storage.foldername(name))[2] in (select id::text from profiles where clerk_id = auth.jwt() ->> 'sub')
  );

-- Anonymous clients can upload ONLY into requests/{slug}/... — a
-- separate folder from options/, so a client can never overwrite or
-- touch the owner's actual catalogue images.
create policy "Anyone can upload a custom request image"
  on storage.objects for insert
  with check (
    bucket_id = 'booking-images'
    and (storage.foldername(name))[1] = 'requests'
  );

create policy "Anyone can read booking images"
  on storage.objects for select
  using (bucket_id = 'booking-images');
