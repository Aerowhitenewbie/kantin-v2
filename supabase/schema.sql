-- School Canteen: run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'admin');
create type public.payment_status as enum ('success', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  student_number text unique,
  class_name text,
  role public.user_role not null default 'student',
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  price integer not null check (price > 0),
  category text not null default 'Lainnya',
  is_available boolean not null default true,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items add column if not exists stock_quantity integer not null default 0 check (stock_quantity >= 0);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  student_name text not null,
  transaction_date date not null,
  transaction_time time not null,
  total_price integer not null check (total_price > 0),
  status public.payment_status not null default 'success',
  created_at timestamptz not null default now()
);
create index transactions_student_date_idx on public.transactions(student_id, transaction_date desc);
create index transactions_date_idx on public.transactions(transaction_date desc);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price > 0),
  created_at timestamptz not null default now()
);
create index transaction_items_transaction_idx on public.transaction_items(transaction_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger menu_items_updated before update on public.menu_items for each row execute function public.set_updated_at();

-- Create a student profile whenever a user is created. Name can be supplied as Auth metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, student_number, class_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          new.raw_user_meta_data ->> 'student_number', new.raw_user_meta_data ->> 'class_name');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Atomic checkout. Price and availability are always read from the database.
create or replace function public.create_purchase(p_items jsonb, p_date date, p_time time)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype; v_transaction_id uuid; v_total integer;
  v_item jsonb; v_menu public.menu_items%rowtype; v_qty integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  select * into v_profile from public.profiles where id = auth.uid() and role = 'student' for update;
  if not found then raise exception 'Student profile not found'; end if;
  select coalesce(sum(m.price * (x.value->>'quantity')::integer), 0) into v_total
  from jsonb_array_elements(p_items) x(value)
  join public.menu_items m on m.id = (x.value->>'menu_item_id')::uuid and m.is_available and m.stock_quantity >= (x.value->>'quantity')::integer
  where (x.value->>'quantity')::integer > 0;
  if v_total <= 0 then
    raise exception 'Invalid cart';
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(*) from jsonb_array_elements(p_items) x join public.menu_items m on m.id=(x.value->>'menu_item_id')::uuid and m.is_available and m.stock_quantity >= (x.value->>'quantity')::integer) then raise exception 'Some menu items are unavailable or out of stock'; end if;
  if v_profile.balance < v_total then raise exception 'Insufficient balance'; end if;
  insert into public.transactions(student_id, student_name, transaction_date, transaction_time, total_price)
  values (v_profile.id, v_profile.full_name, p_date, p_time, v_total) returning id into v_transaction_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_menu from public.menu_items where id=(v_item->>'menu_item_id')::uuid and is_available and stock_quantity >= v_qty for update;
    if not found then raise exception 'Item is out of stock'; end if;
    insert into public.transaction_items(transaction_id, menu_item_id, item_name, quantity, unit_price)
    values(v_transaction_id, v_menu.id, v_menu.name, v_qty, v_menu.price);
    update public.menu_items set stock_quantity = stock_quantity - v_qty where id = v_menu.id;
  end loop;
  update public.profiles set balance = balance - v_total where id = v_profile.id;
  return v_transaction_id;
end; $$;

create or replace view public.daily_transaction_reports with (security_invoker = true) as
select t.transaction_date, count(*)::integer as total_transactions,
       coalesce(sum(t.total_price), 0)::integer as total_income,
       coalesce(sum(item_totals.total_items), 0)::integer as total_items_sold
from public.transactions t
left join lateral (select sum(quantity)::integer as total_items from public.transaction_items where transaction_id = t.id) item_totals on true
where t.status = 'success' and public.is_admin() group by t.transaction_date;

alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

create policy "profile self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin profiles update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy "menu anyone authenticated" on public.menu_items for select using (auth.uid() is not null);
create policy "admin menu write" on public.menu_items for all using (public.is_admin()) with check (public.is_admin());
create policy "transactions own or admin" on public.transactions for select using (student_id = auth.uid() or public.is_admin());
create policy "items own or admin" on public.transaction_items for select using (exists(select 1 from public.transactions t where t.id = transaction_id and (t.student_id = auth.uid() or public.is_admin())));
grant select on public.daily_transaction_reports to authenticated;
revoke all on function public.create_purchase(jsonb, date, time) from public;
grant execute on function public.create_purchase(jsonb, date, time) to authenticated;
