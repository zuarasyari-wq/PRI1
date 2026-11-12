-- Jalankan di Supabase: SQL Editor > New query > paste > Run
-- Aman dijalankan berulang kali (tidak menghapus data).
create table if not exists transaksi (
  id bigint primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('in','out')),   -- in = uang masuk, out = uang keluar
  who text, note text, cat text,
  amt numeric not null check (amt >= 0),
  paid boolean not null default true,                -- false = piutang
  created_at timestamptz default now()
);
create table if not exists produksi (
  id bigint primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  ikan numeric not null, tap numeric not null, "out" numeric not null,  -- kg
  created_at timestamptz default now()
);
create table if not exists pengaturan (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  cfg jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists transaksi_user_date on transaksi (user_id, date);
create index if not exists produksi_user_date on produksi (user_id, date);

-- Keamanan: setiap pengguna hanya bisa melihat dan mengubah datanya sendiri
alter table transaksi enable row level security;
alter table produksi enable row level security;
alter table pengaturan enable row level security;
drop policy if exists "transaksi milik sendiri" on transaksi;
create policy "transaksi milik sendiri" on transaksi for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "produksi milik sendiri" on produksi;
create policy "produksi milik sendiri" on produksi for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "pengaturan milik sendiri" on pengaturan;
create policy "pengaturan milik sendiri" on pengaturan for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- MIGRASI V1.1: jangan hapus tabel; simpan tanggal pelunasan terpisah dari tanggal penjualan.
-- Pada transaksi lama dengan paid=true dan paid_at NULL, aplikasi menganggap
-- transaksi lunas sejak tanggal awal (karena riwayat pembayaran lama tidak tersedia).
alter table public.transaksi add column if not exists paid_at date;
create index if not exists transaksi_user_paid_date on public.transaksi (user_id,paid_at);
