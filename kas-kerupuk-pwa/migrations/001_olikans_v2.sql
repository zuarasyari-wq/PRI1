-- OLIKANS V2 - Migration 001
-- Menambah fondasi master produk, pelanggan, pesanan, detail pesanan, dan mutasi stok.
-- Aman untuk V1.1: tidak menghapus tabel/data transaksi, produksi, atau pengaturan.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  weight_grams numeric not null default 0 check (weight_grams >= 0),
  selling_price numeric not null default 0 check (selling_price >= 0),
  cost_price numeric not null default 0 check (cost_price >= 0),
  stock numeric not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, sku)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_number text not null,
  source text not null default 'Manual',
  marketplace_order_id text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  order_date date not null default current_date,
  status text not null default 'NEW' check (status in ('NEW','CONFIRMED','PROCESSING','READY_TO_SHIP','SHIPPED','COMPLETED','CANCELLED')),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PAID','REFUNDED')),
  subtotal numeric not null default 0 check (subtotal >= 0),
  shipping_cost numeric not null default 0 check (shipping_cost >= 0),
  discount numeric not null default 0 check (discount >= 0),
  total numeric not null default 0 check (total >= 0),
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, order_number)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  subtotal numeric not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('INITIAL','PRODUCTION','ORDER','ADJUSTMENT','RETURN')),
  quantity numeric not null check (quantity <> 0),
  reference_type text,
  reference_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists products_user_name on public.products(user_id, name);
create index if not exists customers_user_name on public.customers(user_id, name);
create index if not exists orders_user_date on public.orders(user_id, order_date desc);
create index if not exists orders_user_status on public.orders(user_id, status);
create index if not exists order_items_order on public.order_items(order_id);
create index if not exists inventory_product_created on public.inventory_movements(product_id, created_at desc);

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "products milik sendiri" on public.products;
create policy "products milik sendiri" on public.products for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "customers milik sendiri" on public.customers;
create policy "customers milik sendiri" on public.customers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "orders milik sendiri" on public.orders;
create policy "orders milik sendiri" on public.orders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "order_items milik sendiri" on public.order_items;
create policy "order_items milik sendiri" on public.order_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "inventory milik sendiri" on public.inventory_movements;
create policy "inventory milik sendiri" on public.inventory_movements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
