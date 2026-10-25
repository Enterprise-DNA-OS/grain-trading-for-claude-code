-- Grain Trading for Claude Code: the schema.
-- What a grain trader, accumulator, broker or private storage site runs every week: the people it
-- trades with (growers with their NGR and RCTI agreement, buyers with a credit limit, carriers,
-- brokers), commodities with their levy rate, grades with their receival spec and price spread,
-- varieties with their end point royalty, sites, purchase and sale contracts, truck deliveries off
-- the weighbridge with their quality results, the cash prices it posts, grower settlements (RCTIs)
-- and sale invoices.
-- Plain Postgres. Runs the same on PGlite. Money is integer cents (AUD by default), weights are
-- whole kilograms off the weighbridge, tonnes are derived, dates are calendar dates.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- The business's own settings, one row. Change them by asking, or with `grain settings`.
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Your Grain Business',
  abn text,
  currency text not null default 'AUD',
  gst_rate numeric(5,4) not null default 0.10,
  rcti_days int not null default 28,            -- an RCTI goes to the grower within this many days of the value being set
  invoice_terms_days int not null default 14,   -- sale invoices fall due this many days after issue
  default_payment_days int not null default 14, -- grower payment terms when a contract does not say
  default_tolerance_pct numeric(5,2) not null default 5, -- contract tonnes may be delivered this much short or over
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- Everyone the business trades with.
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- G001 grower, B001 buyer, C001 carrier, K001 broker
  name text not null,
  kind text not null check (kind in ('grower', 'buyer', 'carrier', 'broker', 'site_operator')),
  abn text,
  ngr text,                                     -- National Grower Register number (growers)
  gst_registered boolean not null default true,
  rcti_agreed_on date,                          -- the written RCTI agreement (growers)
  rcti_ends_on date,                            -- null while it runs
  credit_limit_cents bigint,                    -- buyers: the most they may owe at once
  contact_name text,
  email text,
  phone text,
  address text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commodities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- WHT, BAR, CAN
  name text not null,
  levy_rate numeric(7,5) not null default 0,    -- statutory levy as a share of the net value, 0.0102 = 1.02%
  epr_applies boolean not null default false,   -- end point royalties apply to its protected varieties
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A grade, its receival spec, and its spread to the commodity's top grade.
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  commodity_id uuid not null references commodities(id),
  code text not null unique,                    -- APW1, ASW1, AGP1, BAR1, F1, CAN1
  name text,
  rank int not null default 1,                  -- 1 is the top grade
  spread_cents_per_t bigint not null default 0, -- discount to the top grade (0 for the top grade)
  protein_min numeric(5,2),
  moisture_max numeric(5,2),
  screenings_max numeric(5,2),
  test_weight_min numeric(5,1),                 -- kg per hectolitre
  oil_min numeric(5,2),                         -- canola
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists varieties (
  id uuid primary key default gen_random_uuid(),
  commodity_id uuid not null references commodities(id),
  name text not null unique,
  epr_cents_per_t bigint not null default 0,    -- end point royalty the breeder sets, deducted at first sale
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- MG, BUNK2, PORT
  name text not null,
  kind text not null default 'own' check (kind in ('own', 'bulk_handler', 'buyer', 'port', 'farm')),
  location text,
  port_zone text,
  capacity_t numeric(12,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A purchase from a grower or a sale to a buyer, for so many tonnes of a grade at a price.
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                  -- PC-0001 purchase, SC-0001 sale
  side text not null check (side in ('purchase', 'sale')),
  org_id uuid not null references orgs(id),
  broker_id uuid references orgs(id),
  brokerage_cents_per_t bigint not null default 0,
  commodity_id uuid not null references commodities(id),
  grade_id uuid not null references grades(id),
  season text not null,                         -- 2026-27
  tonnes numeric(12,3) not null check (tonnes > 0),
  tolerance_pct numeric(5,2) not null default 5,
  price_cents_per_t bigint not null check (price_cents_per_t >= 0),
  basis text not null default 'delivered site', -- delivered site, free in store, port zone, FOB, delivered buyer
  site_id uuid references sites(id),            -- where it is delivered or out-turned
  delivery_from date,
  delivery_to date,
  payment_days int not null default 14,         -- days after delivery the grower is paid, or the buyer pays
  gst_applies boolean not null default true,    -- false for export sales
  made_on date not null default current_date,
  confirmed_on date,                            -- the written contract confirmation, signed or sent and not disputed
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  notes text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One truck over the weighbridge: a receival in from a grower or an out-turn to a buyer.
create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique,                  -- the weighbridge ticket or weighnote number
  side text not null check (side in ('receival', 'outturn')),
  contract_id uuid references contracts(id),
  org_id uuid not null references orgs(id),     -- the grower who delivered or the buyer who took it
  site_id uuid not null references sites(id),
  delivered_on date not null,
  commodity_id uuid not null references commodities(id),
  grade_id uuid not null references grades(id), -- the grade it was received or out-turned at
  variety_id uuid references varieties(id),
  carrier_id uuid references orgs(id),
  truck_rego text,
  mass_limit_kg int,                            -- the gross mass the driver declared the vehicle may carry
  gross_kg int not null check (gross_kg > 0),
  tare_kg int not null check (tare_kg >= 0),
  net_kg int generated always as (gross_kg - tare_kg) stored,
  moisture numeric(5,2),
  protein numeric(5,2),
  screenings numeric(5,2),
  test_weight numeric(5,1),
  oil numeric(5,2),
  cvd_received boolean not null default false,  -- commodity vendor declaration on file
  freight_cents_per_t bigint not null default 0,
  notes text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_kg > tare_kg)
);

-- The cash prices the business posts (or the market it marks to), by grade and site.
create table if not exists cash_prices (
  id uuid primary key default gen_random_uuid(),
  posted_on date not null,
  site_id uuid references sites(id),
  grade_id uuid not null references grades(id),
  season text not null,
  cents_per_t bigint not null check (cents_per_t >= 0),
  created_at timestamptz not null default now(),
  unique (posted_on, site_id, grade_id, season)
);

-- Grower settlements: recipient created tax invoices.
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                  -- RCTI-0001
  org_id uuid not null references orgs(id),
  issued_on date,
  due_on date,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  delivery_id uuid not null unique references deliveries(id), -- a load is paid for once
  net_t numeric(12,3) not null,
  price_cents_per_t bigint not null,
  gross_cents bigint not null,
  gst_cents bigint not null default 0,
  levy_cents bigint not null default 0,
  epr_cents bigint not null default 0,
  other_cents bigint not null default 0,         -- other deductions (receival fees, freight the grower pays)
  created_at timestamptz not null default now()
);

-- Sale invoices to buyers.
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                  -- INV-0001
  org_id uuid not null references orgs(id),
  issued_on date,
  due_on date,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  paid_cents bigint not null default 0,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  delivery_id uuid not null unique references deliveries(id), -- a load is invoiced once
  net_t numeric(12,3) not null,
  price_cents_per_t bigint not null,
  amount_cents bigint not null,
  gst_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  contract_id uuid references contracts(id),
  body text not null,
  noted_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists deliveries_contract_idx on deliveries (contract_id);
create index if not exists deliveries_org_idx on deliveries (org_id);
create index if not exists contracts_org_idx on contracts (org_id);
create index if not exists cash_prices_grade_idx on cash_prices (grade_id, posted_on desc);

do $$
declare t text;
begin
  foreach t in array array['settings', 'orgs', 'commodities', 'grades', 'varieties', 'sites', 'contracts', 'deliveries', 'settlements', 'invoices'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- views

-- Each load priced: the contract price moved by the spread between the grade it came in at and
-- the contract grade. A load with no contract has no price yet (it is warehoused).
create or replace view delivery_values as
select d.id, d.ticket, d.side, d.delivered_on, d.org_id, o.name as org, d.contract_id, c.number as contract,
  d.site_id, s.code as site, d.commodity_id, cm.code as commodity, d.grade_id, g.code as grade, cg.code as contract_grade,
  c.season, round(d.net_kg / 1000.0, 3) as net_t,
  case when c.id is null then null else c.price_cents_per_t + (cg.spread_cents_per_t - g.spread_cents_per_t) end as price_cents_per_t,
  case when c.id is null then null else round((d.net_kg / 1000.0) * (c.price_cents_per_t + (cg.spread_cents_per_t - g.spread_cents_per_t)))::bigint end as value_cents,
  d.freight_cents_per_t, coalesce(c.payment_days, 14) as payment_days,
  d.delivered_on + coalesce(c.payment_days, 14) as pay_by,
  exists (select 1 from settlement_lines sl join settlements st on st.id = sl.settlement_id where sl.delivery_id = d.id and st.status <> 'void') as settled,
  exists (select 1 from invoice_lines il join invoices i on i.id = il.invoice_id where il.delivery_id = d.id and i.status <> 'void') as invoiced
from deliveries d
join orgs o on o.id = d.org_id
join sites s on s.id = d.site_id
join commodities cm on cm.id = d.commodity_id
join grades g on g.id = d.grade_id
left join contracts c on c.id = d.contract_id
left join grades cg on cg.id = c.grade_id;

-- Every contract with what has been delivered against it and what is still open.
create or replace view contract_book as
select c.id, c.number, c.side, o.code as org_code, o.name as org, cm.code as commodity, g.code as grade, c.season,
  c.tonnes, c.tolerance_pct, c.price_cents_per_t, c.basis, s.code as site, c.delivery_from, c.delivery_to, c.payment_days,
  c.confirmed_on, c.status, c.made_on, c.commodity_id, c.grade_id, c.org_id,
  coalesce(dl.delivered_t, 0) as delivered_t,
  greatest(c.tonnes - coalesce(dl.delivered_t, 0), 0) as open_t,
  case when c.status <> 'open' then 0 else round(greatest(c.tonnes * (1 - c.tolerance_pct / 100) - coalesce(dl.delivered_t, 0), 0), 3) end as short_of_tolerance_t,
  coalesce(dl.loads, 0) as loads,
  round(c.tonnes * c.price_cents_per_t)::bigint as value_cents,
  case when c.status = 'open' and c.delivery_to < current_date
        and coalesce(dl.delivered_t, 0) < c.tonnes * (1 - c.tolerance_pct / 100) then current_date - c.delivery_to else 0 end as days_past_window,
  dl.first_load_on
from contracts c
join orgs o on o.id = c.org_id
join commodities cm on cm.id = c.commodity_id
join grades g on g.id = c.grade_id
left join sites s on s.id = c.site_id
left join (select contract_id, round(sum(net_kg) / 1000.0, 3) as delivered_t, count(*) as loads, min(delivered_on) as first_load_on
           from deliveries where contract_id is not null group by contract_id) dl on dl.contract_id = c.id;

-- What is in store, by grade and site: everything received less everything out-turned.
create or replace view inventory as
select s.code as site, cm.code as commodity, g.code as grade, g.id as grade_id, cm.id as commodity_id,
  round(sum(case when d.side = 'receival' then d.net_kg else -d.net_kg end) / 1000.0, 3) as tonnes,
  count(*) filter (where d.side = 'receival') as loads_in, count(*) filter (where d.side = 'outturn') as loads_out
from deliveries d
join sites s on s.id = d.site_id
join commodities cm on cm.id = d.commodity_id
join grades g on g.id = d.grade_id
group by s.code, cm.code, g.code, g.id, cm.id;

-- The latest cash price for each grade and season.
create or replace view latest_prices as
select distinct on (p.grade_id, p.season) p.grade_id, g.code as grade, cm.code as commodity, p.season, p.posted_on, p.cents_per_t, s.code as site
from cash_prices p
join grades g on g.id = p.grade_id
join commodities cm on cm.id = g.commodity_id
left join sites s on s.id = p.site_id
order by p.grade_id, p.season, p.posted_on desc, p.created_at desc;

-- The position, by grade and season: stock plus open purchases less open sales.
create or replace view positions as
with stock as (
  select d.grade_id, coalesce(c.season, (select max(season) from contracts)) as season,
    sum(case when d.side = 'receival' then d.net_kg else -d.net_kg end) / 1000.0 as t
  from deliveries d left join contracts c on c.id = d.contract_id group by 1, 2
), openc as (
  select grade_id, season,
    sum(open_t) filter (where side = 'purchase') as open_purchase_t,
    sum(open_t) filter (where side = 'sale') as open_sale_t
  from contract_book where status = 'open' group by 1, 2
), keys as (select grade_id, season from stock union select grade_id, season from openc)
select cm.code as commodity, g.code as grade, k.season, k.grade_id,
  round(coalesce(st.t, 0), 3) as stock_t,
  round(coalesce(oc.open_purchase_t, 0), 3) as open_purchase_t,
  round(coalesce(oc.open_sale_t, 0), 3) as open_sale_t,
  round(coalesce(st.t, 0) + coalesce(oc.open_purchase_t, 0) - coalesce(oc.open_sale_t, 0), 3) as net_t
from keys k
join grades g on g.id = k.grade_id
join commodities cm on cm.id = g.commodity_id
left join stock st on st.grade_id = k.grade_id and st.season = k.season
left join openc oc on oc.grade_id = k.grade_id and oc.season = k.season;

-- Weighted average buy price of what has come in, by grade and season.
create or replace view purchase_cost as
select v.grade_id, v.season, round(sum(v.value_cents)::numeric / nullif(sum(v.net_t), 0))::bigint as avg_cents_per_t, sum(v.net_t) as bought_t
from delivery_values v
where v.side = 'receival' and v.value_cents is not null group by v.grade_id, v.season;

-- Grower settlements with their totals.
create or replace view settlement_totals as
select st.id, st.number, st.org_id, o.name as grower, o.code as org_code, st.issued_on, st.due_on, st.status, st.paid_on,
  count(sl.id) as loads, coalesce(sum(sl.net_t), 0) as net_t,
  coalesce(sum(sl.gross_cents), 0)::bigint as gross_cents, coalesce(sum(sl.gst_cents), 0)::bigint as gst_cents,
  coalesce(sum(sl.levy_cents), 0)::bigint as levy_cents, coalesce(sum(sl.epr_cents), 0)::bigint as epr_cents,
  coalesce(sum(sl.other_cents), 0)::bigint as other_cents,
  (coalesce(sum(sl.gross_cents + sl.gst_cents - sl.levy_cents - sl.epr_cents - sl.other_cents), 0))::bigint as pay_cents,
  min(d.delivered_on) as first_delivery_on
from settlements st
join orgs o on o.id = st.org_id
left join settlement_lines sl on sl.settlement_id = st.id
left join deliveries d on d.id = sl.delivery_id
group by st.id, o.name, o.code;

-- Sale invoices with their totals and how late they are.
create or replace view invoice_totals as
select i.id, i.number, i.org_id, o.name as buyer, o.code as org_code, i.issued_on, i.due_on, i.status, i.paid_cents, i.paid_on,
  count(il.id) as loads, coalesce(sum(il.net_t), 0) as net_t,
  coalesce(sum(il.amount_cents), 0)::bigint as net_cents, coalesce(sum(il.gst_cents), 0)::bigint as gst_cents,
  coalesce(sum(il.amount_cents + il.gst_cents), 0)::bigint as total_cents,
  case when i.status = 'issued' and i.due_on < current_date then current_date - i.due_on else 0 end as days_overdue
from invoices i
join orgs o on o.id = i.org_id
left join invoice_lines il on il.invoice_id = i.id
group by i.id, o.name, o.code;

-- What each buyer owes and could owe: unpaid invoices plus loads out-turned and not yet invoiced,
-- against their credit limit.
create or replace view buyer_exposure as
select o.id, o.code, o.name, o.credit_limit_cents,
  coalesce((select sum(total_cents - paid_cents) from invoice_totals t where t.org_id = o.id and t.status = 'issued'), 0)::bigint as owing_cents,
  coalesce((select sum(total_cents - paid_cents) from invoice_totals t where t.org_id = o.id and t.status = 'issued' and t.days_overdue > 0), 0)::bigint as overdue_cents,
  coalesce((select max(days_overdue) from invoice_totals t where t.org_id = o.id and t.status = 'issued' and t.total_cents > t.paid_cents), 0) as oldest_days_overdue,
  coalesce((select sum(round(v.value_cents * (1 + case when c.gst_applies then (select gst_rate from settings) else 0 end)))
            from delivery_values v join contracts c on c.id = v.contract_id
            where v.org_id = o.id and v.side = 'outturn' and not v.invoiced), 0)::bigint as uninvoiced_cents
from orgs o where o.kind = 'buyer';

-- Loads received and not yet settled, with when the grower is due to be paid.
create or replace view unsettled_receivals as
select v.id, v.ticket, v.delivered_on, v.org, v.org_id, v.contract, v.commodity, v.grade, v.net_t, v.price_cents_per_t, v.value_cents,
  v.pay_by, current_date - v.delivered_on as days_since, v.pay_by - current_date as days_to_pay
from delivery_values v
where v.side = 'receival' and not v.settled;

-- Loads whose quality results fail the spec of the grade they were received or out-turned at.
create or replace view off_spec as
select d.id, d.ticket, d.side, d.delivered_on, o.name as org, g.code as grade,
  concat_ws('; ',
    case when g.protein_min is not null and d.protein < g.protein_min then format('protein %s under %s', d.protein, g.protein_min) end,
    case when g.moisture_max is not null and d.moisture > g.moisture_max then format('moisture %s over %s', d.moisture, g.moisture_max) end,
    case when g.screenings_max is not null and d.screenings > g.screenings_max then format('screenings %s over %s', d.screenings, g.screenings_max) end,
    case when g.test_weight_min is not null and d.test_weight < g.test_weight_min then format('test weight %s under %s', d.test_weight, g.test_weight_min) end,
    case when g.oil_min is not null and d.oil < g.oil_min then format('oil %s under %s', d.oil, g.oil_min) end) as fails,
  (select g2.code from grades g2 where g2.commodity_id = g.commodity_id
     and (g2.protein_min is null or d.protein is null or d.protein >= g2.protein_min)
     and (g2.moisture_max is null or d.moisture is null or d.moisture <= g2.moisture_max)
     and (g2.screenings_max is null or d.screenings is null or d.screenings <= g2.screenings_max)
     and (g2.test_weight_min is null or d.test_weight is null or d.test_weight >= g2.test_weight_min)
     and (g2.oil_min is null or d.oil is null or d.oil >= g2.oil_min)
   order by g2.rank limit 1) as fits_grade
from deliveries d
join orgs o on o.id = d.org_id
join grades g on g.id = d.grade_id
where (g.protein_min is not null and d.protein < g.protein_min)
   or (g.moisture_max is not null and d.moisture > g.moisture_max)
   or (g.screenings_max is not null and d.screenings > g.screenings_max)
   or (g.test_weight_min is not null and d.test_weight < g.test_weight_min)
   or (g.oil_min is not null and d.oil < g.oil_min);
