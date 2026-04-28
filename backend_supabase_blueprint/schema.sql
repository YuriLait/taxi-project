create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null check (role in ('admin','dispatcher','driver')),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id bigserial primary key,
  full_name text not null default 'Без имени',
  phone text not null unique,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists drivers (
  id bigserial primary key,
  full_name text not null,
  phone text not null default '',
  car text not null default '',
  plate text not null default '',
  status text not null default 'free' check (status in ('free','busy','offline')),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id bigserial primary key,
  order_number text not null unique,
  client_id bigint references clients(id) on delete set null,
  driver_id bigint references drivers(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  client_name text not null default '',
  pickup text not null,
  reference_phone text not null default '',
  arrival_time timestamptz,
  end_time timestamptz,
  extra_points jsonb not null default '[]'::jsonb,
  final_point text not null,
  route_points jsonb not null default '[]'::jsonb,
  payment_mode text not null default 'Наличка',
  price numeric(10,2) not null default 0,
  cash numeric(10,2) not null default 0,
  card numeric(10,2) not null default 0,
  transfer numeric(10,2) not null default 0,
  total_paid numeric(10,2) not null default 0,
  remaining numeric(10,2) generated always as (greatest(price - total_paid, 0)) stored,
  overpayment numeric(10,2) generated always as (greatest(total_paid - price, 0)) stored,
  status text not null default 'new' check (status in ('new','accepted','car_assigned','on_the_way','in_progress','completed','cancelled')),
  comment text not null default '',
  cancel_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_history (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row execute function touch_updated_at();

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at desc);
create index if not exists idx_orders_client_id on orders(client_id);
create index if not exists idx_orders_driver_id on orders(driver_id);

insert into drivers (full_name, phone, car, plate, status)
values
  ('Алексей Волков', '+7 918 100-20-01', 'Kia Rio', 'А123ВС', 'free'),
  ('Марат Алиев', '+7 918 100-20-02', 'Hyundai Solaris', 'М777КМ', 'free'),
  ('Олег Морозов', '+7 918 100-20-03', 'Skoda Rapid', 'offline')
on conflict do nothing;
