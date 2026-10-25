-- Demo data: Mallee Gate Grain Pty Ltd, a fictional grain accumulator and trader with its own
-- storage site and a bunker, buying wheat, barley and canola from growers off the header and
-- selling to a flour mill, a feedlot, a maltster and an exporter. Harvest is a month old.
-- People, businesses, ABNs, NGR numbers, varieties and their royalty rates are made up. Grade specs
-- are illustrative: load your season's receival standards before you rely on them.
-- Dates are relative to today, and every insert skips what is already there, so running it twice
-- is harmless.
--
-- Problems are planted on purpose so /attention and /compliance have something to say: a grower
-- settled with no RCTI agreement and another after theirs ended, an RCTI issued 31 days after the
-- load, a load 34 days unsettled, a wheat load settled with no levy, a load with no commodity
-- vendor declaration, a barley load with no variety declared, deliveries on an unconfirmed contract,
-- a load received as APW1 at 9.8% protein, a barley load at 13.1% moisture, a truck 1,600 kg over
-- its declared mass limit, a grower 72 tonnes short after their window closed, a buyer over their
-- credit limit, a mill invoice 15 days overdue, and canola sold well past what is bought.

update settings set business_name = 'Mallee Gate Grain Pty Ltd', abn = '12 345 678 901' where id = 1 and business_name = 'Your Grain Business';

insert into commodities (code, name, levy_rate, epr_applies) values
  ('WHT', 'Wheat', 0.0102, true),
  ('BAR', 'Barley', 0.0102, true),
  ('CAN', 'Canola', 0.0102, true)
on conflict (code) do nothing;

insert into grades (commodity_id, code, name, rank, spread_cents_per_t, protein_min, moisture_max, screenings_max, test_weight_min, oil_min)
select c.id, g.code, g.name, g.rank, g.spread, g.protein, g.moisture, g.screenings, g.tw, g.oil
from (values
  ('WHT', 'APW1', 'Australian Premium White', 1, 0, 10.5, 12.5, 5.0, 74.0, null),
  ('WHT', 'ASW1', 'Australian Standard White', 2, 1500, null, 12.5, 5.0, 74.0, null),
  ('WHT', 'AGP1', 'Australian General Purpose', 3, 3000, null, 12.5, 10.0, 68.0, null),
  ('BAR', 'BAR1', 'Barley 1', 1, 0, null, 12.5, 15.0, 65.0, null),
  ('BAR', 'F1', 'Feed barley 1', 2, 2500, null, 14.0, 30.0, 62.5, null),
  ('CAN', 'CAN1', 'Canola 1', 1, 0, null, 8.0, null, null, 40.0)
) as g(commodity, code, name, rank, spread, protein, moisture, screenings, tw, oil)
join commodities c on c.code = g.commodity
on conflict (code) do nothing;

insert into varieties (commodity_id, name, epr_cents_per_t)
select c.id, v.name, v.epr from (values
  ('WHT', 'Stockade', 330), ('WHT', 'Kestrel', 0), ('BAR', 'Summit Malt', 280), ('CAN', 'Dryland Gold', 150)
) as v(commodity, name, epr) join commodities c on c.code = v.commodity
on conflict (name) do nothing;

insert into sites (code, name, kind, location, port_zone, capacity_t) values
  ('MG', 'Mallee Gate site', 'own', 'Mallee Gate', 'Geelong', 40000),
  ('NB', 'North bunker', 'own', 'Mallee Gate north', 'Geelong', 15000),
  ('PORT', 'Geelong port terminal', 'port', 'Geelong', 'Geelong', null)
on conflict (code) do nothing;

insert into orgs (code, name, kind, abn, ngr, gst_registered, rcti_agreed_on, rcti_ends_on, credit_limit_cents, contact_name, email, phone) values
  ('G001', 'Hollis Farming Trust', 'grower', '21 600 100 001', '10000001', true, current_date - 400, null, null, 'Ray Hollis', 'ray@hollis.example.com.au', '0400 100 001'),
  ('G002', 'Doyle Bros', 'grower', '21 600 100 002', '10000002', true, current_date - 700, null, null, 'Pat Doyle', 'pat@doylebros.example.com.au', '0400 100 002'),
  ('G003', 'Kerrigan Ag', 'grower', '21 600 100 003', '10000003', true, current_date - 300, null, null, 'Siobhan Kerrigan', 'office@kerriganag.example.com.au', '0400 100 003'),
  ('G004', 'Patel Family Farms', 'grower', '21 600 100 004', '10000004', true, current_date - 200, null, null, 'Raj Patel', 'raj@patelfarms.example.com.au', '0400 100 004'),
  ('G005', 'Murray Plains Pastoral', 'grower', '21 600 100 005', '10000005', true, current_date - 500, null, null, 'Ann Murray', 'ann@murrayplains.example.com.au', '0400 100 005'),
  ('G006', 'Wendt and Sons', 'grower', '21 600 100 006', '10000006', true, null, null, null, 'Karl Wendt', 'karl@wendt.example.com.au', '0400 100 006'),
  ('G007', 'Sandy Creek Partnership', 'grower', '21 600 100 007', '10000007', true, current_date - 100, null, null, 'Jess Arnott', 'jess@sandycreek.example.com.au', '0400 100 007'),
  ('G008', 'Ellery Grain', 'grower', '21 600 100 008', '10000008', true, current_date - 730, current_date - 30, null, 'Tom Ellery', 'tom@ellerygrain.example.com.au', '0400 100 008'),
  ('B001', 'Southern Mills Pty Ltd', 'buyer', '31 700 200 001', null, true, null, null, 25000000, 'Grain desk', 'grain@southernmills.example.com.au', '03 5550 2001'),
  ('B002', 'Valley Feedlot Co', 'buyer', '31 700 200 002', null, true, null, null, 4000000, 'Linda Moss', 'linda@valleyfeedlot.example.com.au', '03 5550 2002'),
  ('B003', 'Coastal Export Grain', 'buyer', '31 700 200 003', null, true, null, null, 100000000, 'Execution team', 'execution@coastalexport.example.com.au', '03 5550 2003'),
  ('B004', 'Ridgeway Maltings', 'buyer', '31 700 200 004', null, true, null, null, 20000000, 'Malt intake', 'intake@ridgeway.example.com.au', '03 5550 2004'),
  ('C001', 'Kurrajong Haulage', 'carrier', '41 800 300 001', null, true, null, null, null, 'Dispatch', 'dispatch@kurrajong.example.com.au', '0400 300 001'),
  ('C002', 'Pine Ridge Transport', 'carrier', '41 800 300 002', null, true, null, null, null, 'Dispatch', 'jobs@pineridge.example.com.au', '0400 300 002'),
  ('K001', 'Grainline Brokers', 'broker', '51 900 400 001', null, true, null, null, null, 'Mick Grant', 'mick@grainline.example.com.au', '0400 400 001')
on conflict (code) do nothing;

insert into contracts (number, side, org_id, broker_id, brokerage_cents_per_t, commodity_id, grade_id, season, tonnes, tolerance_pct, price_cents_per_t, basis, site_id,
                       delivery_from, delivery_to, payment_days, gst_applies, made_on, confirmed_on, status, notes)
select c.number, c.side, o.id, k.id, c.brokerage, g.commodity_id, g.id, '2026-27', c.tonnes, 5, c.price, c.basis, s.id,
       current_date + c.from_d, current_date + c.to_d, c.pay, c.gst, current_date + c.made_d,
       case when c.conf_d is null then null else current_date + c.conf_d end, c.status, c.notes
from (values
  ('PC-0001', 'purchase', 'G001', null, 0, 'APW1', 300, 36500, 'delivered site', 'MG', -30, 20, 14, true, -42, -40, 'open', null),
  ('PC-0002', 'purchase', 'G002', null, 0, 'ASW1', 200, 35000, 'delivered site', 'MG', -35, 10, 14, true, -46, -45, 'open', null),
  ('PC-0003', 'purchase', 'G003', null, 0, 'APW1', 150, 36000, 'delivered site', 'MG', -40, -10, 7, true, -55, -54, 'completed', null),
  ('PC-0004', 'purchase', 'G004', null, 0, 'APW1', 100, 36800, 'delivered site', 'MG', -10, 20, 14, true, -21, -20, 'open', null),
  ('PC-0005', 'purchase', 'G005', null, 0, 'BAR1', 250, 31500, 'delivered site', 'NB', -30, -3, 14, true, -51, -50, 'open', 'Malt barley for Ridgeway if it makes spec'),
  ('PC-0006', 'purchase', 'G006', null, 0, 'CAN1', 120, 74000, 'delivered site', 'MG', -20, 10, 14, true, -31, -30, 'open', null),
  ('PC-0007', 'purchase', 'G007', 'K001', 100, 'BAR1', 120, 31800, 'delivered site', 'NB', -10, 20, 14, true, -12, null, 'open', 'Done on the phone through Grainline'),
  ('PC-0008', 'purchase', 'G008', null, 0, 'AGP1', 80, 33000, 'delivered site', 'MG', -40, -15, 14, true, -52, -50, 'completed', null),
  ('SC-0001', 'sale', 'B001', null, 0, 'APW1', 300, 39500, 'delivered buyer', 'MG', -35, 25, 14, true, -41, -40, 'open', 'Out-turn from Mallee Gate, delivered to the mill'),
  ('SC-0002', 'sale', 'B002', null, 0, 'BAR1', 160, 34500, 'delivered buyer', 'NB', -12, 30, 14, true, -14, -13, 'open', null),
  ('SC-0003', 'sale', 'B003', null, 0, 'CAN1', 300, 76500, 'FOB port', 'PORT', 20, 60, 21, false, -16, -15, 'open', 'Export, GST-free'),
  ('SC-0004', 'sale', 'B004', null, 0, 'BAR1', 200, 33500, 'delivered buyer', 'NB', 5, 45, 21, true, -3, null, 'open', 'Malt spec, confirmation not back yet')
) as c(number, side, org, broker, brokerage, grade, tonnes, price, basis, site, from_d, to_d, pay, gst, made_d, conf_d, status, notes)
join orgs o on o.code = c.org
left join orgs k on k.code = c.broker
join grades g on g.code = c.grade
join sites s on s.code = c.site
on conflict (number) do nothing;

insert into deliveries (ticket, side, contract_id, org_id, site_id, delivered_on, commodity_id, grade_id, variety_id, carrier_id, truck_rego, mass_limit_kg,
                        gross_kg, tare_kg, moisture, protein, screenings, test_weight, oil, cvd_received, freight_cents_per_t)
select d.ticket, d.side, c.id, c.org_id, s.id, current_date + d.day, g.commodity_id, g.id, v.id, k.id, d.rego, d.lim,
       d.gross, d.tare, d.moisture, d.protein, d.screenings, d.tw, d.oil, d.cvd, d.freight
from (values
  ('T10001', 'receival', 'PC-0001', 'MG', -24, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 62100, 20900, 10.8, 11.4, 2.1, 79.0, null, true, 0),
  ('T10002', 'receival', 'PC-0001', 'MG', -20, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 62300, 21000, 11.0, 11.1, 2.4, 78.5, null, true, 0),
  ('T10003', 'receival', 'PC-0001', 'MG', -6, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 61800, 20800, 11.2, 11.0, 2.8, 78.0, null, true, 0),
  ('T10004', 'receival', 'PC-0002', 'MG', -34, 'ASW1', 'Kestrel', null, 'DOY001', 42500, 42100, 15600, 11.5, 10.1, 3.0, 77.0, null, true, 0),
  ('T10005', 'receival', 'PC-0002', 'MG', -15, 'ASW1', 'Kestrel', null, 'DOY002', 62500, 62000, 21000, 11.3, 10.3, 2.9, 77.5, null, true, 0),
  ('T10006', 'receival', 'PC-0002', 'MG', -12, 'ASW1', 'Kestrel', null, 'DOY002', 62500, 61900, 20900, 11.4, 10.0, 3.2, 77.0, null, true, 0),
  ('T10007', 'receival', 'PC-0002', 'MG', -9, 'ASW1', 'Kestrel', 'C002', 'PR55TT', 62500, 64100, 21200, 11.1, 10.2, 3.1, 77.5, null, true, 0),
  ('T10008', 'receival', 'PC-0003', 'MG', -38, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 62400, 21000, 10.9, 11.6, 1.9, 79.5, null, true, 0),
  ('T10009', 'receival', 'PC-0003', 'MG', -36, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 62000, 21000, 11.0, 11.3, 2.2, 79.0, null, true, 0),
  ('T10010', 'receival', 'PC-0003', 'MG', -33, 'APW1', 'Stockade', 'C001', 'XQ12AB', 62500, 62300, 21000, 10.7, 11.5, 2.0, 79.0, null, true, 0),
  ('T10011', 'receival', 'PC-0003', 'MG', -30, 'APW1', 'Stockade', null, 'KER001', 42500, 42200, 15600, 10.8, 11.2, 2.3, 78.5, null, true, 0),
  ('T10012', 'receival', 'PC-0004', 'MG', -4, 'APW1', 'Kestrel', null, 'PAT001', 62500, 62000, 20900, 11.6, 9.8, 3.4, 76.5, null, true, 0),
  ('T10013', 'receival', 'PC-0005', 'NB', -27, 'BAR1', 'Summit Malt', 'C001', 'XQ12AB', 62500, 62400, 20900, 11.2, null, 6.5, 68.0, null, true, 0),
  ('T10014', 'receival', 'PC-0005', 'NB', -22, 'BAR1', 'Summit Malt', 'C001', 'XQ12AB', 62500, 62100, 20900, 11.5, null, 7.1, 67.5, null, true, 0),
  ('T10015', 'receival', 'PC-0005', 'NB', -18, 'BAR1', null, null, 'MUR001', 62500, 62000, 21000, 11.8, null, 8.0, 67.0, null, true, 0),
  ('T10016', 'receival', 'PC-0005', 'NB', -11, 'BAR1', 'Summit Malt', null, 'MUR001', 62500, 62200, 21000, 13.1, null, 9.5, 66.0, null, true, 0),
  ('T10017', 'receival', 'PC-0006', 'MG', -14, 'CAN1', 'Dryland Gold', null, 'WEN001', 62500, 62000, 21000, 6.5, null, null, null, 44.1, true, 0),
  ('T10018', 'receival', 'PC-0006', 'MG', -8, 'CAN1', 'Dryland Gold', null, 'WEN001', 62500, 62300, 21000, 6.8, null, null, null, 43.6, true, 0),
  ('T10019', 'receival', 'PC-0007', 'NB', -5, 'BAR1', 'Summit Malt', 'C002', 'PR21KL', 62500, 62400, 21000, 11.0, null, 6.0, 68.5, null, false, 0),
  ('T10020', 'receival', 'PC-0008', 'MG', -39, 'AGP1', 'Kestrel', null, 'ELL001', 62500, 62000, 21000, 11.9, 9.1, 6.5, 71.0, null, true, 0),
  ('T10021', 'receival', 'PC-0008', 'MG', -37, 'AGP1', 'Kestrel', null, 'ELL001', 62500, 62200, 21000, 12.0, 9.0, 6.8, 70.5, null, true, 0),
  ('O20001', 'outturn', 'SC-0001', 'MG', -32, 'APW1', null, 'C001', 'XQ34CD', 62500, 62000, 21000, 10.9, 11.4, 2.1, 79.0, null, true, 1800),
  ('O20002', 'outturn', 'SC-0001', 'MG', -30, 'APW1', null, 'C001', 'XQ34CD', 62500, 62200, 21000, 10.9, 11.4, 2.1, 79.0, null, true, 1800),
  ('O20003', 'outturn', 'SC-0001', 'MG', -29, 'APW1', null, 'C001', 'XQ34CD', 62500, 62100, 21000, 10.9, 11.4, 2.1, 79.0, null, true, 1800),
  ('O20004', 'outturn', 'SC-0001', 'MG', -14, 'APW1', null, 'C001', 'XQ34CD', 62500, 62000, 21000, 11.0, 11.3, 2.3, 78.5, null, true, 1800),
  ('O20005', 'outturn', 'SC-0001', 'MG', -13, 'APW1', null, 'C001', 'XQ34CD', 62500, 62300, 21000, 11.0, 11.3, 2.3, 78.5, null, true, 1800),
  ('O20006', 'outturn', 'SC-0001', 'MG', -2, 'APW1', null, 'C001', 'XQ34CD', 62500, 62100, 21000, 11.1, 11.2, 2.5, 78.5, null, true, 1800),
  ('O20007', 'outturn', 'SC-0002', 'NB', -10, 'BAR1', null, 'C002', 'PR21KL', 62500, 62400, 21000, 11.3, null, 6.8, 67.5, null, true, 2200),
  ('O20008', 'outturn', 'SC-0002', 'NB', -9, 'BAR1', null, 'C002', 'PR21KL', 62500, 62000, 21000, 11.3, null, 6.8, 67.5, null, true, 2200),
  ('O20009', 'outturn', 'SC-0002', 'NB', -4, 'BAR1', null, 'C002', 'PR21KL', 62500, 62200, 21000, 11.4, null, 7.0, 67.0, null, true, 2200)
) as d(ticket, side, contract, site, day, grade, variety, carrier, rego, lim, gross, tare, moisture, protein, screenings, tw, oil, cvd, freight)
join contracts c on c.number = d.contract
join sites s on s.code = d.site
join grades g on g.code = d.grade
left join varieties v on v.name = d.variety
left join orgs k on k.code = d.carrier
on conflict (ticket) do nothing;

-- Cash prices posted at Mallee Gate over the last week: wheat sliding, canola climbing.
insert into cash_prices (posted_on, site_id, grade_id, season, cents_per_t)
select current_date + p.day, s.id, g.id, '2026-27', p.cents
from (values
  (-7, 'APW1', 36600), (-3, 'APW1', 36000), (0, 'APW1', 35400),
  (-7, 'ASW1', 34200), (-3, 'ASW1', 33800), (0, 'ASW1', 33500),
  (-7, 'AGP1', 32000), (-3, 'AGP1', 31600), (0, 'AGP1', 31200),
  (-7, 'BAR1', 31800), (-3, 'BAR1', 31900), (0, 'BAR1', 32200),
  (-7, 'F1', 29800), (-3, 'F1', 30000), (0, 'F1', 30100),
  (-7, 'CAN1', 74500), (-3, 'CAN1', 75500), (0, 'CAN1', 76800)
) as p(day, grade, cents)
join grades g on g.code = p.grade
join sites s on s.code = 'MG'
on conflict (posted_on, site_id, grade_id, season) do nothing;

-- Grower settlements (RCTIs) already raised.
insert into settlements (number, org_id, issued_on, due_on, status, paid_on)
select r.number, o.id, case when r.issued is null then null else current_date + r.issued end,
       case when r.due is null then null else current_date + r.due end, r.status,
       case when r.paid is null then null else current_date + r.paid end
from (values
  ('RCTI-0001', 'G001', -10, -6, 'paid', -5),
  ('RCTI-0002', 'G002', -8, -1, 'issued', null),
  ('RCTI-0003', 'G003', -28, -23, 'paid', -21),
  ('RCTI-0004', 'G005', -12, -8, 'paid', -5),
  ('RCTI-0005', 'G006', null, null, 'draft', null),
  ('RCTI-0006', 'G008', -8, -1, 'issued', null)
) as r(number, org, issued, due, status, paid)
join orgs o on o.code = r.org
on conflict (number) do nothing;

insert into settlement_lines (settlement_id, delivery_id, net_t, price_cents_per_t, gross_cents, gst_cents, levy_cents, epr_cents)
select st.id, v.id, v.net_t, v.price_cents_per_t, v.value_cents,
       case when o.gst_registered then round(v.value_cents * 0.10)::bigint else 0 end,
       round(v.value_cents * cm.levy_rate)::bigint,
       round(v.net_t * coalesce(va.epr_cents_per_t, 0))::bigint
from (values
  ('RCTI-0001', 'T10001'), ('RCTI-0001', 'T10002'), ('RCTI-0002', 'T10005'),
  ('RCTI-0003', 'T10008'), ('RCTI-0003', 'T10009'), ('RCTI-0003', 'T10010'), ('RCTI-0003', 'T10011'),
  ('RCTI-0004', 'T10013'), ('RCTI-0004', 'T10014'), ('RCTI-0005', 'T10017'), ('RCTI-0005', 'T10018'),
  ('RCTI-0006', 'T10020'), ('RCTI-0006', 'T10021')
) as l(rcti, ticket)
join settlements st on st.number = l.rcti
join delivery_values v on v.ticket = l.ticket
join deliveries d on d.id = v.id
join orgs o on o.id = d.org_id
join commodities cm on cm.id = d.commodity_id
left join varieties va on va.id = d.variety_id
on conflict (delivery_id) do nothing;

-- One wheat load settled with no levy taken.
update settlement_lines set levy_cents = 0
where delivery_id = (select id from deliveries where ticket = 'T10009') and levy_cents <> 0;

-- Sale invoices already raised.
insert into invoices (number, org_id, issued_on, due_on, status, paid_cents)
select i.number, o.id, current_date + i.issued, current_date + i.due, i.status, 0
from (values
  ('INV-0001', 'B001', -29, -15, 'issued'),
  ('INV-0002', 'B001', -13, 1, 'issued'),
  ('INV-0003', 'B002', -9, 5, 'issued')
) as i(number, org, issued, due, status)
join orgs o on o.code = i.org
on conflict (number) do nothing;

insert into invoice_lines (invoice_id, delivery_id, net_t, price_cents_per_t, amount_cents, gst_cents)
select i.id, v.id, v.net_t, v.price_cents_per_t, v.value_cents, round(v.value_cents * 0.10)::bigint
from (values
  ('INV-0001', 'O20001'), ('INV-0001', 'O20002'), ('INV-0001', 'O20003'),
  ('INV-0002', 'O20004'), ('INV-0002', 'O20005'),
  ('INV-0003', 'O20007'), ('INV-0003', 'O20008')
) as l(inv, ticket)
join invoices i on i.number = l.inv
join delivery_values v on v.ticket = l.ticket
on conflict (delivery_id) do nothing;

insert into notes (org_id, contract_id, body, noted_on)
select o.id, c.id, n.body, current_date + n.day
from (values
  ('G005', 'PC-0005', 'Ann says the header is down for a week with a bearing. Rest of the barley after that.', -6),
  ('B002', 'SC-0002', 'Linda asked to push the next two loads out a week. Account is at its limit.', -3),
  ('G007', 'PC-0007', 'Mick at Grainline to send the broker note for this one.', -10)
) as n(org, contract, body, day)
join orgs o on o.code = n.org
left join contracts c on c.number = n.contract
where not exists (select 1 from notes x where x.body = n.body);
