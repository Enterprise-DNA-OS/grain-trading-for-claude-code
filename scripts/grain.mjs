#!/usr/bin/env node
// grain-trading-for-claude-code: the one CLI. The slash commands call this; so can you.
//
//   node scripts/grain.mjs <command> [args] [--flags] [--json]
//   npm run grain -- <command> ...
//
// Run with no arguments (or `help`) for the command list.
//
// This records what a grain trader, accumulator, broker or private storage site runs every week:
// growers, buyers, carriers and brokers; purchase and sale contracts; truck loads over the
// weighbridge with their quality results; the cash prices it posts; the position and what it is
// worth today; grower settlements on recipient created tax invoices (levies and end point royalties
// deducted); and sale invoices. It sends nothing and talks to no other system: contract
// confirmations, RCTIs and reminders are drafted here, a person sends them.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, isoDate, heading, money as fmtMoney, price as fmtPrice, truncate } from './lib/format.mjs';

// ---------------------------------------------------------------- settings

// How far ahead "coming up" looks for delivery windows and payments.
const SOON_DAYS = 14;
// A sale invoice this many days past due needs a call, not a reminder.
const CALL_DAYS = 14;

const RULES = [
  { id: 'R1', rule: 'An RCTI agreement in force, and the grower GST registered with an ABN, for every RCTI' },
  { id: 'R2', rule: 'Every RCTI issued within 28 days of the load' },
  { id: 'R3', rule: 'The statutory levy deducted on every settled load' },
  { id: 'R4', rule: 'A commodity vendor declaration on file for every load received' },
  { id: 'R5', rule: 'The variety declared on every load of a commodity with end point royalties' },
  { id: 'R6', rule: 'A written contract confirmation before the first load' },
  { id: 'R7', rule: 'Every load meets the spec of the grade it was received or out-turned at' },
  { id: 'R8', rule: 'No truck over the mass limit its driver declared' },
];

// ---------------------------------------------------------------- arguments

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'open', 'cvd', 'no-cvd', 'force', 'export', 'unsettled', 'uninvoiced', 'confirmed', 'not-gst']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name, value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const n = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const t1 = (v) => (v === null || v === undefined || v === '' ? '' : n(v).toFixed(1));
const t3 = (v) => Math.round(n(v) * 1000) / 1000;

let SETTINGS = { currency: 'AUD' };
const money = (c) => fmtMoney(c, SETTINGS.currency);
const pt = (c) => (c === null || c === undefined ? '' : fmtPrice(c, SETTINGS.currency));

function today() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.toLowerCase() === 'today') return today();
  if (s.toLowerCase() === 'tomorrow') return addDays(today(), 1);
  if (s.toLowerCase() === 'yesterday') return addDays(today(), -1);
  const rel = s.match(/^([+-]\d+)d?$/);
  if (rel) return addDays(today(), Number(rel[1]));
  // Australian exports write DD/MM/YYYY.
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
}

function parseNum(v, what) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const x = Number(String(v).trim().replace(/[,\s%]/g, '').replace(/(t|kg|mt)$/i, ''));
  if (!Number.isFinite(x) || x < 0) throw new CliError(`"${v}" is not a number of ${what}.`);
  return x;
}
// Dollars in, cents stored. "365", "$365.50", "1,250,000", "40k" all work.
function parseCents(v, what = 'dollars') {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim().toLowerCase().replace(/[,$\s]/g, '').replace(/^aud/, '').replace(/\/t$/, '');
  const mult = s.endsWith('m') ? 1e6 : s.endsWith('k') ? 1e3 : 1;
  const x = Number(mult === 1 ? s : s.slice(0, -1)) * mult;
  if (!Number.isFinite(x) || x < 0) throw new CliError(`"${v}" is not an amount of ${what}.`);
  return Math.round(x * 100);
}
// Weighbridge weights: "62,100", "62100kg" or "62.1t" are all kilograms stored.
function parseKg(v, what) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim().toLowerCase().replace(/[,\s]/g, '');
  const x = s.endsWith('t') ? Number(s.slice(0, -1)) * 1000 : Number(s.replace(/kg$/, ''));
  if (!Number.isFinite(x) || x < 0) throw new CliError(`"${v}" is not a ${what} in kilograms.`);
  return Math.round(x);
}

// ---------------------------------------------------------------- lookups

let db;
let JSON_OUT = false;

function ambiguous(what, rows, label) {
  return new CliError(`More than one ${what} matches. Be more specific:\n${rows.map((r) => `  ${label(r)}`).join('\n')}`);
}

async function findOne(what, ref, sql, exactKey, label, hint) {
  if (!ref || ref === true) throw new CliError(`Which ${what}? ${hint}`);
  const rows = await db.query(sql, [String(ref), `%${ref}%`]);
  const exact = rows.filter((r) => exactKey(r).some((k) => k && k.toLowerCase() === String(ref).toLowerCase()));
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No ${what} "${ref}". ${hint}`);
  throw ambiguous(what, exact.length ? exact : rows, label);
}

const findOrg = (ref, kind) => findOne(kind || 'grower, buyer or carrier', ref,
  `select * from orgs where (lower(code) = lower($1) or name ilike $2 or abn = $1 or ngr = $1)${kind ? ` and kind = '${kind}'` : ''} order by code`,
  (r) => [r.code, r.name, r.ngr], (r) => `${r.code}  ${r.name}  (${r.kind})`, 'Give the name, code (G004) or NGR. Run: grain orgs');
const findContract = (ref) => findOne('contract', ref, `select c.*, o.name as org from contracts c join orgs o on o.id = c.org_id
  where lower(c.number) = lower($1) or c.number ilike $2 or o.name ilike $2 order by c.number`,
  (r) => [r.number], (r) => `${r.number}  ${r.side} ${r.org}`, 'Give its number, for example PC-0004. Run: grain contracts');
const findTicket = (ref) => findOne('load', ref, `select * from deliveries where lower(ticket) = lower($1) or ticket ilike $2 order by ticket`,
  (r) => [r.ticket], (r) => r.ticket, 'Give the weighbridge ticket number. Run: grain deliveries');
const findGrade = (ref) => findOne('grade', ref, `select g.*, c.code as commodity from grades g join commodities c on c.id = g.commodity_id where lower(g.code) = lower($1) or g.code ilike $2 order by g.code`,
  (r) => [r.code], (r) => r.code, 'Give the grade code, for example APW1. Run: grain grades');
const findSite = (ref) => findOne('site', ref, `select * from sites where lower(code) = lower($1) or name ilike $2 order by code`,
  (r) => [r.code], (r) => `${r.code}  ${r.name}`, 'Give the site code, for example MG. Run: grain sites');
const findVariety = (ref) => findOne('variety', ref, `select * from varieties where lower(name) = lower($1) or name ilike $2 order by name`,
  (r) => [r.name], (r) => r.name, 'Give the variety name. Run: grain varieties');
const findCommodity = (ref) => findOne('commodity', ref, `select * from commodities where lower(code) = lower($1) or name ilike $2 order by code`,
  (r) => [r.code, r.name], (r) => r.code, 'Give its code, for example WHT.');

async function findByNumber(tbl, ref, what, prefix) {
  if (!ref || ref === true) throw new CliError(`Which ${what}? Give its number, for example ${prefix}0004.`);
  const s = String(ref).toUpperCase();
  const want = /^\d+$/.test(s) ? `${prefix}${s.padStart(4, '0')}` : s;
  const rows = await db.query(`select * from ${tbl} where upper(number) = $1 or upper(number) like $2 order by number`, [want, `%${s}%`]);
  const exact = rows.filter((r) => r.number.toUpperCase() === want);
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No ${what} "${ref}".`);
  throw ambiguous(what, rows, (r) => r.number);
}

async function nextNumber(tbl, prefix, col = 'number') {
  const [r] = await db.query(`select coalesce(max(substring(${col} from '[0-9]+$')::int), 0) + 1 as next from ${tbl} where ${col} like $1`, [`${prefix}%`]);
  return `${prefix}${String(r.next).padStart(4, '0')}`;
}

function out(data, human) {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(typeof human === 'function' ? human(data) : human);
}

// ---------------------------------------------------------------- overview

async function stats() {
  const [s] = await db.query(`select
      (select count(*) from contracts where status = 'open' and side = 'purchase') as open_purchases,
      (select count(*) from contracts where status = 'open' and side = 'sale') as open_sales,
      (select coalesce(sum(tonnes), 0) from inventory) as stock_t,
      (select count(*) from deliveries where delivered_on > current_date - 7) as loads_7d,
      (select coalesce(sum(net_kg), 0) / 1000.0 from deliveries where side = 'receival' and delivered_on > current_date - 7) as received_7d_t,
      (select count(*) from unsettled_receivals) as unsettled_loads,
      (select coalesce(sum(value_cents), 0) from unsettled_receivals) as unsettled_cents,
      (select coalesce(sum(pay_cents), 0) from settlement_totals where status = 'issued') as rcti_unpaid_cents,
      (select coalesce(sum(owing_cents), 0) from buyer_exposure) as owed_to_us_cents,
      (select coalesce(sum(overdue_cents), 0) from buyer_exposure) as overdue_cents`);
  const mtm = await mtmRows();
  const comp = await complianceRows();
  const short = (await db.query(`select commodity, grade, net_t from positions where net_t < 0 order by net_t`)).map((r) => ({ ...r, net_t: t3(r.net_t) }));
  const r = {
    open_purchases: n(s.open_purchases), open_sales: n(s.open_sales), stock_t: t3(s.stock_t), loads_7d: n(s.loads_7d), received_7d_t: t3(s.received_7d_t),
    unsettled_loads: n(s.unsettled_loads), unsettled_cents: n(s.unsettled_cents), rcti_unpaid_cents: n(s.rcti_unpaid_cents),
    owed_to_us_cents: n(s.owed_to_us_cents), overdue_cents: n(s.overdue_cents), mtm_cents: mtm.reduce((a, x) => a + x.mtm_cents, 0),
    short, compliance_breaches: comp.reduce((a, c) => a + c.count, 0),
  };
  out(r, (x) => [heading(`${SETTINGS.business_name}: the book today`),
    `  Contracts   ${x.open_purchases} open purchases, ${x.open_sales} open sales`,
    `  Grain       ${x.stock_t.toLocaleString('en-AU')} t in store; ${x.loads_7d} loads over the weighbridge in 7 days, ${x.received_7d_t.toLocaleString('en-AU')} t received`,
    `  Position    ${x.short.length ? x.short.map((p) => `short ${Math.abs(p.net_t)} t ${p.grade}`).join(', ') : 'nothing short'}; marked to today's prices ${x.mtm_cents < 0 ? 'down' : 'up'} ${money(Math.abs(x.mtm_cents))}`,
    `  Growers     ${x.unsettled_loads} loads not yet settled (${money(x.unsettled_cents)} before GST), ${money(x.rcti_unpaid_cents)} on issued RCTIs not yet paid`,
    `  Buyers      ${money(x.owed_to_us_cents)} owed to us, ${money(x.overdue_cents)} of it overdue`,
    `  Rules       ${x.compliance_breaches} breaches. Run: grain compliance`].join('\n'));
}

// ---------------------------------------------------------------- contracts

const CONTRACT_COLS = [{ key: 'number', label: 'Contract' }, { key: 'org', label: 'With', width: 24 }, { key: 'grade', label: 'Grade' },
  { key: 'tonnes', label: 'Tonnes', align: 'right', format: t1 }, { key: 'delivered_t', label: 'Delivered', align: 'right', format: t1 },
  { key: 'open_t', label: 'Open', align: 'right', format: t1 }, { key: 'price_cents_per_t', label: '$/t', align: 'right', format: pt },
  { key: 'delivery_to', label: 'Window ends', format: isoDate }, { key: 'flag', label: '' }];

function contractFlag(c) {
  const f = [];
  if (n(c.days_past_window) > 0) f.push(`${t1(c.short_of_tolerance_t)} t short, window closed ${c.days_past_window}d ago`);
  if (!c.confirmed_on && c.status === 'open') f.push('not confirmed');
  return f.join('; ');
}

async function contracts(flags) {
  const where = [];
  const params = [];
  if (flags.side) { params.push(str(flags.side).startsWith('s') ? 'sale' : 'purchase'); where.push(`side = $${params.length}`); }
  if (!flags.all) where.push(`status = 'open'`);
  if (flags.org) { const o = await findOrg(flags.org); params.push(o.id); where.push(`org_id = $${params.length}`); }
  if (flags.commodity) { const c = await findCommodity(flags.commodity); params.push(c.id); where.push(`commodity_id = $${params.length}`); }
  if (flags.season) { params.push(str(flags.season)); where.push(`season = $${params.length}`); }
  const rows = (await db.query(`select * from contract_book ${where.length ? 'where ' + where.join(' and ') : ''} order by side, number`, params)).map((r) => ({ ...r, flag: contractFlag(r) }));
  out(rows, (d) => ['purchase', 'sale'].filter((s) => d.some((r) => r.side === s)).map((s) =>
    heading(s === 'purchase' ? 'Purchase contracts' : 'Sale contracts') + '\n' + table(d.filter((r) => r.side === s), CONTRACT_COLS)).join('\n') || '  (no contracts)');
}

async function contractCard(args) {
  const c = await findContract(args[0]);
  const [b] = await db.query(`select * from contract_book where id = $1`, [c.id]);
  const loads = await db.query(`select v.ticket, v.delivered_on, v.site, v.grade, v.net_t, v.price_cents_per_t, v.value_cents, v.settled, v.invoiced from delivery_values v where v.contract_id = $1 order by v.delivered_on, v.ticket`, [c.id]);
  const notes = await db.query(`select noted_on, body from notes where contract_id = $1 order by noted_on desc`, [c.id]);
  out({ contract: b, loads, notes }, (d) => [heading(`${b.number}: ${b.side === 'purchase' ? 'buying from' : 'selling to'} ${b.org}`),
    `  ${t1(b.tonnes)} t ${b.grade} ${b.season} at ${pt(b.price_cents_per_t)} a tonne, ${b.basis}${b.site ? ' ' + b.site : ''}, plus or minus ${n(b.tolerance_pct)}%`,
    `  Window ${isoDate(b.delivery_from) || '?'} to ${isoDate(b.delivery_to) || '?'}. Paid ${b.payment_days} days after delivery. ${b.confirmed_on ? `Confirmed ${isoDate(b.confirmed_on)}.` : 'NOT CONFIRMED in writing.'} Status ${b.status}.`,
    `  Delivered ${t1(b.delivered_t)} t in ${b.loads} loads, ${t1(b.open_t)} t open${n(b.days_past_window) ? `, ${t1(b.short_of_tolerance_t)} t short and the window closed ${b.days_past_window} days ago` : ''}.`,
    '', table(d.loads, [{ key: 'ticket', label: 'Ticket' }, { key: 'delivered_on', label: 'Date', format: isoDate }, { key: 'site', label: 'Site' }, { key: 'grade', label: 'Grade' },
      { key: 'net_t', label: 'Net t', align: 'right', format: (v) => n(v).toFixed(2) }, { key: 'price_cents_per_t', label: '$/t', align: 'right', format: pt },
      { key: 'value_cents', label: 'Value', align: 'right', format: money }, { key: 'settled', label: b.side === 'purchase' ? 'Settled' : 'Invoiced', format: (v, r) => ((b.side === 'purchase' ? r.settled : r.invoiced) ? 'yes' : '') }]),
    d.notes.length ? '\n  Notes\n' + d.notes.map((x) => `    ${isoDate(x.noted_on)}  ${x.body}`).join('\n') : ''].join('\n'));
}

async function addContract(args, flags) {
  const side = str(flags.side || args[0]).toLowerCase().startsWith('s') ? 'sale' : str(flags.side || args[0]).toLowerCase().startsWith('p') ? 'purchase' : null;
  if (!side) throw new CliError('Buying or selling? grain add-contract --side=purchase|sale --org=<name> --grade=APW1 --tonnes=200 --price=365 [--site --from --to --season]');
  const org = await findOrg(flags.org, side === 'purchase' ? 'grower' : 'buyer');
  const grade = await findGrade(flags.grade);
  const tonnes = parseNum(flags.tonnes, 'tonnes');
  const priceC = parseCents(flags.price, 'dollars a tonne');
  if (!tonnes || priceC === null) throw new CliError('A contract needs --tonnes and --price (dollars a tonne).');
  const site = flags.site ? await findSite(flags.site) : null;
  const broker = flags.broker ? await findOrg(flags.broker, 'broker') : null;
  const [season] = flags.season ? [str(flags.season)] : (await db.query(`select coalesce(max(season), to_char(current_date, 'YYYY') || '-' || to_char(current_date + 365, 'YY')) as s from contracts`)).map((r) => r.s);
  const number = await nextNumber('contracts', side === 'purchase' ? 'PC-' : 'SC-');
  const [c] = await db.query(`insert into contracts (number, side, org_id, broker_id, brokerage_cents_per_t, commodity_id, grade_id, season, tonnes, tolerance_pct, price_cents_per_t, basis, site_id,
      delivery_from, delivery_to, payment_days, gst_applies, made_on, confirmed_on, notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,coalesce($18::date, current_date),$19,$20) returning *`,
    [number, side, org.id, broker?.id || null, parseCents(flags.brokerage) || 0, grade.commodity_id, grade.id, season, tonnes, parseNum(flags.tolerance, 'percent') ?? n(SETTINGS.default_tolerance_pct), priceC,
      str(flags.basis) || (side === 'purchase' ? 'delivered site' : 'delivered buyer'), site?.id || null, parseDate(flags.from), parseDate(flags.to),
      parseNum(flags['payment-days'], 'days') ?? n(SETTINGS.default_payment_days), !flags.export, parseDate(flags.on), flags.confirmed ? today() : parseDate(flags['confirmed-on']), str(flags.notes) || null]);
  const [pos] = await db.query(`select net_t from positions where grade_id = $1 and season = $2`, [grade.id, season]);
  out({ contract: c, position_after_t: t3(pos?.net_t) }, (x) => [`  ${number}: ${side === 'purchase' ? 'buying' : 'selling'} ${tonnes} t ${grade.code} ${season} ${side === 'purchase' ? 'from' : 'to'} ${org.name} at ${pt(priceC)} a tonne.`,
    `  Position in ${grade.code} ${season} is now ${x.position_after_t >= 0 ? 'long' : 'SHORT'} ${Math.abs(x.position_after_t)} t.`,
    c.confirmed_on ? '' : `  Not confirmed yet. Draft the confirmation with /draft-confirmation, then: grain confirm ${number}`].filter(Boolean).join('\n'));
}

async function confirm(args, flags) {
  const c = await findContract(args[0]);
  const on = parseDate(flags.on) || today();
  await db.query(`update contracts set confirmed_on = $2 where id = $1`, [c.id, on]);
  out({ contract: c.number, confirmed_on: on }, `  ${c.number} confirmed in writing on ${on}.`);
}

async function setStatus(args, status) {
  const c = await findContract(args[0]);
  await db.query(`update contracts set status = $2 where id = $1`, [c.id, status]);
  out({ contract: c.number, status }, `  ${c.number} is now ${status}.`);
}

// ---------------------------------------------------------------- loads

const LOAD_COLS = [{ key: 'ticket', label: 'Ticket' }, { key: 'delivered_on', label: 'Date', format: isoDate }, { key: 'side', label: 'In/out', format: (v) => (v === 'receival' ? 'in' : 'out') },
  { key: 'org', label: 'Grower or buyer', width: 24 }, { key: 'contract', label: 'Contract' }, { key: 'site', label: 'Site' }, { key: 'grade', label: 'Grade' },
  { key: 'net_t', label: 'Net t', align: 'right', format: (v) => n(v).toFixed(2) }, { key: 'value_cents', label: 'Value', align: 'right', format: money }];

async function deliveries(flags) {
  const where = [];
  const params = [];
  if (flags.side) { params.push(str(flags.side).startsWith('o') ? 'outturn' : 'receival'); where.push(`side = $${params.length}`); }
  if (flags.contract) { const c = await findContract(flags.contract); params.push(c.id); where.push(`contract_id = $${params.length}`); }
  if (flags.org) { const o = await findOrg(flags.org); params.push(o.id); where.push(`org_id = $${params.length}`); }
  if (flags.days) { params.push(parseNum(flags.days, 'days')); where.push(`delivered_on > current_date - $${params.length}::int`); }
  if (flags.unsettled) where.push(`side = 'receival' and not settled`);
  if (flags.uninvoiced) where.push(`side = 'outturn' and not invoiced`);
  const rows = await db.query(`select * from delivery_values ${where.length ? 'where ' + where.join(' and ') : ''} order by delivered_on desc, ticket desc limit 200`, params);
  out(rows, (d) => heading(`Loads${flags.unsettled ? ' received and not settled' : flags.uninvoiced ? ' out-turned and not invoiced' : ''}`) + '\n' + table(d, LOAD_COLS) +
    `\n\n  ${d.length} loads, ${t1(d.reduce((a, r) => a + n(r.net_t), 0))} t.`);
}

// Record one load off the weighbridge. Refuses what should never be recorded: a load on the wrong
// side of a contract or of the wrong commodity, an out-turn of grain that is not in store at that
// site, and an out-turn to a buyer already over their credit limit (unless --force).
async function ticket(args, flags) {
  const contract = flags.contract ? await findContract(flags.contract) : null;
  const side = contract ? (contract.side === 'purchase' ? 'receival' : 'outturn') : str(flags.side).startsWith('o') ? 'outturn' : 'receival';
  if (flags.side && contract && (str(flags.side).startsWith('o') ? 'outturn' : 'receival') !== side) throw new CliError(`${contract.number} is a ${contract.side} contract: its loads are ${side === 'receival' ? 'received in' : 'out-turned'}, not the other way.`);
  const org = contract ? (await db.query(`select * from orgs where id = $1`, [contract.org_id]))[0] : await findOrg(flags.org);
  const grade = flags.grade ? await findGrade(flags.grade) : contract ? (await db.query(`select g.*, c.code as commodity from grades g join commodities c on c.id = g.commodity_id where g.id = $1`, [contract.grade_id]))[0] : null;
  if (!grade) throw new CliError('Which grade? --grade=APW1');
  if (contract && grade.commodity_id !== contract.commodity_id) throw new CliError(`${grade.code} is not the commodity on ${contract.number}.`);
  const site = flags.site ? await findSite(flags.site) : contract?.site_id ? (await db.query(`select * from sites where id = $1`, [contract.site_id]))[0] : null;
  if (!site) throw new CliError('Which site? --site=MG');
  const gross = parseKg(flags.gross, 'gross weight');
  const tare = parseKg(flags.tare, 'tare weight');
  if (!gross || tare === null) throw new CliError('A load needs --gross and --tare off the weighbridge, in kilograms.');
  if (gross <= tare) throw new CliError(`Gross ${gross} kg is not more than tare ${tare} kg. Check the weighbridge ticket.`);
  const netT = (gross - tare) / 1000;
  const on = parseDate(flags.on) || today();
  const variety = flags.variety ? await findVariety(flags.variety) : null;
  const carrier = flags.carrier ? await findOrg(flags.carrier, 'carrier') : null;
  const warnings = [];
  if (side === 'outturn') {
    const [inv] = await db.query(`select coalesce(sum(tonnes), 0) as t from inventory where grade_id = $1 and site = $2`, [grade.id, site.code]);
    if (n(inv.t) < netT) throw new CliError(`Only ${t1(inv.t)} t of ${grade.code} is in store at ${site.code}. This load is ${netT.toFixed(2)} t. Record the receivals first, or out-turn at another grade or site.`);
    const [ex] = await db.query(`select * from buyer_exposure where id = $1`, [org.id]);
    if (ex && ex.credit_limit_cents !== null && n(ex.owing_cents) + n(ex.uninvoiced_cents) >= n(ex.credit_limit_cents) && !flags.force) {
      throw new CliError(`${org.name} owes and has on the road ${money(n(ex.owing_cents) + n(ex.uninvoiced_cents))} against a ${money(ex.credit_limit_cents)} credit limit. No more grain out until they pay or the limit is raised (or --force with a reason in --notes).`);
    }
  }
  const limit = parseKg(flags.limit, 'mass limit');
  if (limit && gross > limit) warnings.push(`gross ${gross.toLocaleString('en-AU')} kg is ${(gross - limit).toLocaleString('en-AU')} kg over the declared ${limit.toLocaleString('en-AU')} kg limit: follow your overload procedure`);
  const spec = [];
  const q = { moisture: parseNum(flags.moisture, 'percent'), protein: parseNum(flags.protein, 'percent'), screenings: parseNum(flags.screenings, 'percent'), test_weight: parseNum(flags.tw ?? flags['test-weight'], 'kg/hl'), oil: parseNum(flags.oil, 'percent') };
  if (grade.protein_min !== null && q.protein !== null && q.protein < n(grade.protein_min)) spec.push(`protein ${q.protein} under ${n(grade.protein_min)}`);
  if (grade.moisture_max !== null && q.moisture !== null && q.moisture > n(grade.moisture_max)) spec.push(`moisture ${q.moisture} over ${n(grade.moisture_max)}`);
  if (grade.screenings_max !== null && q.screenings !== null && q.screenings > n(grade.screenings_max)) spec.push(`screenings ${q.screenings} over ${n(grade.screenings_max)}`);
  if (grade.test_weight_min !== null && q.test_weight !== null && q.test_weight < n(grade.test_weight_min)) spec.push(`test weight ${q.test_weight} under ${n(grade.test_weight_min)}`);
  if (grade.oil_min !== null && q.oil !== null && q.oil < n(grade.oil_min)) spec.push(`oil ${q.oil} under ${n(grade.oil_min)}`);
  if (spec.length) warnings.push(`fails ${grade.code}: ${spec.join(', ')}. Regrade it: grain regrade <ticket>`);
  const [cm] = await db.query(`select * from commodities where id = $1`, [grade.commodity_id]);
  if (side === 'receival' && !flags.cvd) warnings.push('no commodity vendor declaration recorded: get it before this load is settled');
  if (side === 'receival' && cm.epr_applies && !variety) warnings.push('no variety declared: the end point royalty cannot be deducted');
  if (contract) {
    const [b] = await db.query(`select * from contract_book where id = $1`, [contract.id]);
    if (n(b.delivered_t) + netT > n(b.tonnes) * (1 + n(b.tolerance_pct) / 100)) warnings.push(`takes ${contract.number} past its tonnes plus tolerance`);
    if (!contract.confirmed_on) warnings.push(`${contract.number} has no written confirmation`);
  }
  const tk = str(flags.ticket || args[0]) || await nextNumber('deliveries', side === 'receival' ? 'T' : 'O', 'ticket');
  if ((await db.query(`select 1 from deliveries where lower(ticket) = lower($1)`, [tk])).length) throw new CliError(`Ticket ${tk} is already recorded. Every weighbridge ticket is recorded once.`);
  const row = { ticket: tk, side, contract: contract?.number || null, org: org.name, site: site.code, delivered_on: on, grade: grade.code, net_t: t3(netT), variety: variety?.name || null, warnings };
  if (flags['dry-run']) return out({ ...row, dry_run: true }, (x) => [`  Dry run: would record ${x.ticket}, ${x.net_t} t ${x.grade} ${side === 'receival' ? 'in from' : 'out to'} ${x.org} at ${x.site} on ${x.delivered_on}.`, ...x.warnings.map((w) => `  ! ${w}`), '  Nothing written.'].join('\n'));
  await db.query(`insert into deliveries (ticket, side, contract_id, org_id, site_id, delivered_on, commodity_id, grade_id, variety_id, carrier_id, truck_rego, mass_limit_kg, gross_kg, tare_kg,
      moisture, protein, screenings, test_weight, oil, cvd_received, freight_cents_per_t, notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [tk, side, contract?.id || null, org.id, site.id, on, grade.commodity_id, grade.id, variety?.id || null, carrier?.id || null, str(flags.rego) || null, limit, gross, tare,
      q.moisture, q.protein, q.screenings, q.test_weight, q.oil, !!flags.cvd, parseCents(flags.freight) || 0, str(flags.notes) || null]);
  out(row, (x) => [`  Recorded ${x.ticket}: ${x.net_t} t ${x.grade} ${side === 'receival' ? 'in from' : 'out to'} ${x.org} at ${x.site}${x.contract ? ` on ${x.contract}` : ''}.`, ...x.warnings.map((w) => `  ! ${w}`)].join('\n'));
}

async function regrade(args, flags) {
  const d = await findTicket(args[0]);
  let to = flags.to ? await findGrade(flags.to) : null;
  if (!to) {
    const [o] = await db.query(`select fits_grade from off_spec where id = $1`, [d.id]);
    if (!o) throw new CliError(`${d.ticket} meets the spec of its grade. Give --to=<grade> to regrade it anyway.`);
    if (!o.fits_grade) throw new CliError(`${d.ticket} fits no grade on file. Record it as rejected, or give --to=<grade>.`);
    to = await findGrade(o.fits_grade);
  }
  if (to.commodity_id !== d.commodity_id) throw new CliError(`${to.code} is a different commodity.`);
  const [settled] = await db.query(`select 1 as x from settlement_lines sl join settlements s on s.id = sl.settlement_id where sl.delivery_id = $1 and s.status <> 'void'
    union all select 1 from invoice_lines il join invoices i on i.id = il.invoice_id where il.delivery_id = $1 and i.status <> 'void'`, [d.id]);
  if (settled) throw new CliError(`${d.ticket} is already settled or invoiced. Void that document first; never change a load someone has been paid for.`);
  const [before] = await db.query(`select grade, price_cents_per_t from delivery_values where id = $1`, [d.id]);
  await db.query(`update deliveries set grade_id = $2, notes = concat_ws('; ', notes, $3::text) where id = $1`, [d.id, to.id, `regraded ${before.grade} to ${to.code} on ${today()}`]);
  const [after] = await db.query(`select grade, price_cents_per_t from delivery_values where id = $1`, [d.id]);
  out({ ticket: d.ticket, from: before.grade, to: after.grade, price_before: n(before.price_cents_per_t), price_after: n(after.price_cents_per_t) },
    (x) => `  ${x.ticket} regraded ${x.from} to ${x.to}.${x.price_before ? ` Price ${pt(x.price_before)} to ${pt(x.price_after)} a tonne (the grade spread).` : ''}`);
}

async function cvd(args) {
  const d = await findTicket(args[0]);
  await db.query(`update deliveries set cvd_received = true where id = $1`, [d.id]);
  out({ ticket: d.ticket, cvd_received: true }, `  Commodity vendor declaration recorded for ${d.ticket}.`);
}

async function declareVariety(args) {
  const d = await findTicket(args[0]);
  const v = await findVariety(args.slice(1).join(' '));
  if (v.commodity_id !== d.commodity_id) throw new CliError(`${v.name} is not a variety of this load's commodity.`);
  await db.query(`update deliveries set variety_id = $2 where id = $1`, [d.id, v.id]);
  out({ ticket: d.ticket, variety: v.name }, `  ${d.ticket} declared as ${v.name}${n(v.epr_cents_per_t) ? ` (end point royalty ${pt(v.epr_cents_per_t)} a tonne)` : ''}.`);
}

async function quality() {
  const rows = await db.query(`select * from off_spec order by delivered_on desc`);
  out(rows, (d) => heading('Loads that fail the spec of their grade') + '\n' + table(d, [{ key: 'ticket', label: 'Ticket' }, { key: 'delivered_on', label: 'Date', format: isoDate },
    { key: 'side', label: 'In/out', format: (v) => (v === 'receival' ? 'in' : 'out') }, { key: 'org', label: 'Grower or buyer' }, { key: 'grade', label: 'Recorded' }, { key: 'fails', label: 'Fails on' },
    { key: 'fits_grade', label: 'Fits', format: (v) => v || 'nothing on file' }]) + (d.length ? '\n\n  Regrade with: grain regrade <ticket>. Settlements hold these loads until they are.' : ''));
}

// ---------------------------------------------------------------- people

async function orgs(flags) {
  const kind = str(flags.kind);
  const rows = await db.query(`select code, name, kind, abn, ngr, gst_registered, rcti_agreed_on, rcti_ends_on, credit_limit_cents, phone from orgs ${kind ? 'where kind = $1' : ''} order by kind, code`, kind ? [kind] : []);
  out(rows, (d) => heading('Growers, buyers, carriers and brokers') + '\n' + table(d, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'kind', label: 'Kind' },
    { key: 'ngr', label: 'NGR' }, { key: 'abn', label: 'ABN' }, { key: 'rcti_agreed_on', label: 'RCTI agreed', format: (v, r) => (r.kind !== 'grower' ? '' : v ? `${isoDate(v)}${r.rcti_ends_on ? ' to ' + isoDate(r.rcti_ends_on) : ''}` : 'none') },
    { key: 'credit_limit_cents', label: 'Credit limit', align: 'right', format: (v) => (v === null ? '' : money(v)) }]));
}

async function orgCard(args) {
  const o = await findOrg(args.join(' '));
  const cs = await db.query(`select * from contract_book where org_id = $1 order by number`, [o.id]);
  const loads = await db.query(`select ticket, delivered_on, side, contract, grade, net_t, value_cents, settled, invoiced from delivery_values where org_id = $1 order by delivered_on desc limit 20`, [o.id]);
  const docs = o.kind === 'grower' ? await db.query(`select number, status, issued_on, due_on, pay_cents as total_cents from settlement_totals where org_id = $1 order by number`, [o.id])
    : await db.query(`select number, status, issued_on, due_on, total_cents, days_overdue from invoice_totals where org_id = $1 order by number`, [o.id]);
  const [exposure] = o.kind === 'buyer' ? await db.query(`select * from buyer_exposure where id = $1`, [o.id]) : [null];
  const notes = await db.query(`select noted_on, body from notes where org_id = $1 order by noted_on desc limit 10`, [o.id]);
  out({ org: o, contracts: cs, loads, documents: docs, exposure, notes }, (d) => [heading(`${o.name} (${o.code}, ${o.kind})`),
    `  ABN ${o.abn || 'not recorded'}${o.ngr ? `, NGR ${o.ngr}` : ''}, ${o.gst_registered ? 'GST registered' : 'NOT registered for GST'}. ${o.contact_name || ''} ${o.email || ''} ${o.phone || ''}`.trimEnd(),
    o.kind === 'grower' ? `  RCTI agreement: ${o.rcti_agreed_on ? `signed ${isoDate(o.rcti_agreed_on)}${o.rcti_ends_on ? `, ended ${isoDate(o.rcti_ends_on)}` : ', in force'}` : 'NONE ON FILE'}` : '',
    exposure ? `  Owes ${money(exposure.owing_cents)} (${money(exposure.overdue_cents)} overdue) plus ${money(exposure.uninvoiced_cents)} out-turned and not invoiced, against a ${exposure.credit_limit_cents === null ? 'no' : money(exposure.credit_limit_cents)} limit` : '',
    '\n  Contracts', table(d.contracts, CONTRACT_COLS.filter((c) => c.key !== 'org')),
    '\n  ' + (o.kind === 'grower' ? 'RCTIs' : 'Invoices'), table(d.documents, [{ key: 'number', label: 'Number' }, { key: 'status', label: 'Status' }, { key: 'issued_on', label: 'Issued', format: isoDate },
      { key: 'due_on', label: 'Due', format: isoDate }, { key: 'total_cents', label: 'Total', align: 'right', format: money }]),
    d.notes.length ? '\n  Notes\n' + d.notes.map((x) => `    ${isoDate(x.noted_on)}  ${x.body}`).join('\n') : ''].filter((x) => x !== '').join('\n'));
}

async function addOrg(args, flags) {
  const name = args.join(' ').trim() || str(flags.name);
  const kind = str(flags.kind) || 'grower';
  if (!name) throw new CliError('grain add-org "Name" --kind=grower|buyer|carrier|broker [--abn --ngr --credit=250k --email --phone --rcti-agreed=date]');
  if (!['grower', 'buyer', 'carrier', 'broker', 'site_operator'].includes(kind)) throw new CliError(`--kind is grower, buyer, carrier, broker or site_operator.`);
  const prefix = { grower: 'G', buyer: 'B', carrier: 'C', broker: 'K', site_operator: 'S' }[kind];
  const [last] = await db.query(`select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 as next from orgs where code like $1`, [`${prefix}%`]);
  const code = `${prefix}${String(last.next).padStart(3, '0')}`;
  const [o] = await db.query(`insert into orgs (code, name, kind, abn, ngr, gst_registered, rcti_agreed_on, credit_limit_cents, contact_name, email, phone, address) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [code, name, kind, str(flags.abn) || null, str(flags.ngr) || null, !flags['not-gst'], parseDate(flags['rcti-agreed']), parseCents(flags.credit), str(flags.contact) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.address) || null]);
  out(o, (x) => `  Added ${x.code} ${x.name} (${x.kind}).${x.kind === 'grower' && !x.rcti_agreed_on ? ' No RCTI agreement yet: record it before you settle (grain rcti-agreement ' + x.code + ' --on=<date>).' : ''}`);
}

async function rctiAgreement(args, flags) {
  const o = await findOrg(args.join(' '), 'grower');
  const on = parseDate(flags.on) || today();
  await db.query(`update orgs set rcti_agreed_on = $2, rcti_ends_on = $3 where id = $1`, [o.id, on, parseDate(flags.ends)]);
  out({ org: o.name, rcti_agreed_on: on, rcti_ends_on: parseDate(flags.ends) }, `  RCTI agreement with ${o.name} recorded from ${on}${flags.ends ? ' to ' + parseDate(flags.ends) : ''}.`);
}

async function credit(args) {
  const o = await findOrg(args[0], 'buyer');
  const c = parseCents(args[1], 'credit limit');
  if (c === null) throw new CliError('grain credit <buyer> <amount>');
  await db.query(`update orgs set credit_limit_cents = $2 where id = $1`, [o.id, c]);
  out({ org: o.name, credit_limit_cents: c }, `  ${o.name} credit limit is now ${money(c)}.`);
}

// ---------------------------------------------------------------- prices, position, value

async function prices(flags) {
  const rows = await db.query(`select lp.*, (select p.cents_per_t from cash_prices p where p.grade_id = lp.grade_id and p.season = lp.season and p.posted_on < lp.posted_on order by p.posted_on desc limit 1) as previous_cents
    from latest_prices lp order by commodity, grade`);
  out(rows, (d) => heading('Cash prices, latest posted') + '\n' + table(d, [{ key: 'commodity', label: 'Commodity' }, { key: 'grade', label: 'Grade' }, { key: 'season', label: 'Season' },
    { key: 'site', label: 'Site' }, { key: 'posted_on', label: 'Posted', format: isoDate }, { key: 'cents_per_t', label: '$/t', align: 'right', format: pt },
    { key: 'previous_cents', label: 'Change', align: 'right', format: (v, r) => (v === null ? '' : `${n(r.cents_per_t) >= n(v) ? '+' : '-'}${pt(Math.abs(n(r.cents_per_t) - n(v)))}`) }]));
}

async function postPrice(args, flags) {
  const g = await findGrade(args[0]);
  const c = parseCents(args[1], 'dollars a tonne');
  if (c === null) throw new CliError('grain post-price <grade> <dollars a tonne> [--site=MG --on=date --season=2026-27]');
  const site = flags.site ? await findSite(flags.site) : (await db.query(`select * from sites where kind = 'own' order by code limit 1`))[0];
  const [season] = flags.season ? [str(flags.season)] : (await db.query(`select coalesce(max(season), '') as s from contracts`)).map((r) => r.s);
  const on = parseDate(flags.on) || today();
  await db.query(`insert into cash_prices (posted_on, site_id, grade_id, season, cents_per_t) values ($1,$2,$3,$4,$5)
    on conflict (posted_on, site_id, grade_id, season) do update set cents_per_t = excluded.cents_per_t`, [on, site?.id || null, g.id, season, c]);
  out({ grade: g.code, season, site: site?.code, posted_on: on, cents_per_t: c }, `  ${g.code} ${season} posted at ${pt(c)} a tonne${site ? ' at ' + site.code : ''} on ${on}.`);
}

async function position() {
  const rows = (await db.query(`select p.*, lp.cents_per_t as market_cents from positions p left join latest_prices lp on lp.grade_id = p.grade_id and lp.season = p.season order by commodity, grade`))
    .map((r) => ({ ...r, stock_t: t3(r.stock_t), open_purchase_t: t3(r.open_purchase_t), open_sale_t: t3(r.open_sale_t), net_t: t3(r.net_t) }));
  out(rows, (d) => heading('The position: stock plus open purchases less open sales') + '\n' + table(d, [{ key: 'commodity', label: 'Commodity' }, { key: 'grade', label: 'Grade' }, { key: 'season', label: 'Season' },
    { key: 'stock_t', label: 'In store', align: 'right', format: t1 }, { key: 'open_purchase_t', label: 'Bought, to come', align: 'right', format: t1 },
    { key: 'open_sale_t', label: 'Sold, to go', align: 'right', format: t1 }, { key: 'net_t', label: 'Net', align: 'right', format: (v) => `${n(v) < 0 ? 'SHORT ' : ''}${t1(Math.abs(n(v)))}` },
    { key: 'market_cents', label: 'Cash $/t', align: 'right', format: pt }]));
}

async function mtmRows() {
  const contractsOpen = await db.query(`select b.number, b.side, b.org, b.grade, b.season, b.open_t, b.price_cents_per_t, lp.cents_per_t as market_cents
    from contract_book b left join latest_prices lp on lp.grade_id = b.grade_id and lp.season = b.season where b.status = 'open' and b.open_t > 0`);
  const stock = await db.query(`select p.grade, p.season, p.stock_t, pc.avg_cents_per_t, lp.cents_per_t as market_cents from positions p
    left join purchase_cost pc on pc.grade_id = p.grade_id and pc.season = p.season
    left join latest_prices lp on lp.grade_id = p.grade_id and lp.season = p.season where p.stock_t > 0`);
  const rows = [];
  for (const c of contractsOpen) {
    if (c.market_cents === null) continue;
    const diff = c.side === 'purchase' ? n(c.market_cents) - n(c.price_cents_per_t) : n(c.price_cents_per_t) - n(c.market_cents);
    rows.push({ what: c.number, side: c.side, with: c.org, grade: c.grade, tonnes: t3(c.open_t), at_cents: n(c.price_cents_per_t), market_cents: n(c.market_cents), mtm_cents: Math.round(diff * n(c.open_t)) });
  }
  for (const s of stock) {
    if (s.market_cents === null || s.avg_cents_per_t === null) continue;
    rows.push({ what: 'in store', side: 'stock', with: '', grade: s.grade, tonnes: t3(s.stock_t), at_cents: n(s.avg_cents_per_t), market_cents: n(s.market_cents), mtm_cents: Math.round((n(s.market_cents) - n(s.avg_cents_per_t)) * n(s.stock_t)) });
  }
  return rows.sort((a, b) => a.mtm_cents - b.mtm_cents);
}

async function mtm() {
  const rows = await mtmRows();
  const total = rows.reduce((a, r) => a + r.mtm_cents, 0);
  out({ rows, total_cents: total }, (d) => heading("Marked to today's cash prices") + '\n' + table(d.rows, [{ key: 'what', label: 'Contract' }, { key: 'side', label: 'Side' }, { key: 'with', label: 'With', width: 22 },
    { key: 'grade', label: 'Grade' }, { key: 'tonnes', label: 'Tonnes', align: 'right', format: t1 }, { key: 'at_cents', label: 'Our $/t', align: 'right', format: pt },
    { key: 'market_cents', label: 'Cash $/t', align: 'right', format: pt }, { key: 'mtm_cents', label: 'Gain or loss', align: 'right', format: (v) => `${v < 0 ? '-' : '+'}${money(Math.abs(v))}` }]) +
    `\n\n  Total ${d.total_cents < 0 ? '-' : '+'}${money(Math.abs(d.total_cents))}. Stock is marked against its average buy price. Cash prices are the ones you posted: grain post-price.`);
}

async function stock() {
  const rows = (await db.query(`select * from inventory where tonnes <> 0 order by site, commodity, grade`)).map((r) => ({ ...r, tonnes: t3(r.tonnes) }));
  out(rows, (d) => heading('In store, by site and grade') + '\n' + table(d, [{ key: 'site', label: 'Site' }, { key: 'commodity', label: 'Commodity' }, { key: 'grade', label: 'Grade' },
    { key: 'tonnes', label: 'Tonnes', align: 'right', format: t1 }, { key: 'loads_in', label: 'Loads in', align: 'right' }, { key: 'loads_out', label: 'Loads out', align: 'right' }]));
}

async function margin() {
  const rows = await db.query(`select v.grade, v.season, sum(v.net_t) as sold_t, round(sum(v.value_cents)::numeric / nullif(sum(v.net_t), 0))::bigint as sell_cents,
      pc.avg_cents_per_t as buy_cents, round(sum(v.net_t * v.freight_cents_per_t)::numeric / nullif(sum(v.net_t), 0))::bigint as freight_cents
    from delivery_values v left join purchase_cost pc on pc.grade_id = v.grade_id and pc.season = v.season
    where v.side = 'outturn' and v.value_cents is not null group by v.grade, v.season, pc.avg_cents_per_t order by v.grade`);
  const res = rows.map((r) => { const per = n(r.sell_cents) - n(r.buy_cents) - n(r.freight_cents); return { ...r, sold_t: t3(r.sold_t), margin_per_t_cents: per, margin_cents: Math.round(per * n(r.sold_t)) }; });
  out(res, (d) => heading('Trading margin on grain out-turned') + '\n' + table(d, [{ key: 'grade', label: 'Grade' }, { key: 'season', label: 'Season' }, { key: 'sold_t', label: 'Sold t', align: 'right', format: t1 },
    { key: 'sell_cents', label: 'Sold $/t', align: 'right', format: pt }, { key: 'buy_cents', label: 'Bought $/t', align: 'right', format: pt }, { key: 'freight_cents', label: 'Freight $/t', align: 'right', format: pt },
    { key: 'margin_per_t_cents', label: 'Margin $/t', align: 'right', format: pt }, { key: 'margin_cents', label: 'Margin', align: 'right', format: money }]) +
    '\n\n  Bought $/t is the average paid for that grade and season, after grade spreads. Levies and royalties come out of the grower, not the margin.');
}

// ---------------------------------------------------------------- grower settlements (RCTIs)

// Why a load cannot be settled yet. Every reason is something a person fixes, then the run picks it up.
function holdReasons(l) {
  const r = [];
  if (!l.cvd_received) r.push('no vendor declaration');
  if (l.epr_applies && !l.variety_id) r.push('no variety declared');
  if (l.fails) r.push(`fails ${l.grade}: ${l.fails}`);
  if (!l.contract_id) r.push('no contract (warehoused)');
  else if (!l.confirmed_on) r.push(`${l.contract} not confirmed`);
  if (!l.rcti_agreed_on || (l.rcti_ends_on && isoDate(l.rcti_ends_on) < today())) r.push('no RCTI agreement in force');
  if (!l.gst_registered || !l.abn) r.push('grower not GST registered or no ABN: they invoice you instead');
  return r;
}

async function settleRun(flags) {
  const grower = flags.grower ? await findOrg(flags.grower, 'grower') : null;
  const loads = await db.query(`select v.*, d.cvd_received, d.variety_id, cm.epr_applies, cm.levy_rate, coalesce(va.epr_cents_per_t, 0) as epr_cents_per_t, c.confirmed_on,
      o.rcti_agreed_on, o.rcti_ends_on, o.gst_registered, o.abn, os.fails
    from delivery_values v join deliveries d on d.id = v.id join commodities cm on cm.id = d.commodity_id join orgs o on o.id = d.org_id
    left join varieties va on va.id = d.variety_id left join contracts c on c.id = d.contract_id left join off_spec os on os.id = d.id
    where v.side = 'receival' and not v.settled ${grower ? 'and d.org_id = $1' : ''} order by v.org, v.delivered_on, v.ticket`, grower ? [grower.id] : []);
  const held = [];
  const byGrower = new Map();
  for (const l of loads) {
    const why = holdReasons(l);
    if (why.length) { held.push({ ticket: l.ticket, grower: l.org, delivered_on: l.delivered_on, why: why.join('; ') }); continue; }
    if (!byGrower.has(l.org_id)) byGrower.set(l.org_id, []);
    byGrower.get(l.org_id).push(l);
  }
  const result = [];
  await db.exec('BEGIN');
  try {
    for (const [orgId, ls] of byGrower) {
      let [st] = await db.query(`select id, number from settlements where org_id = $1 and status = 'draft' order by created_at limit 1`, [orgId]);
      if (!st) {
        const number = await nextNumber('settlements', 'RCTI-');
        [st] = await db.query(`insert into settlements (number, org_id, status) values ($1,$2,'draft') returning id, number`, [number, orgId]);
      }
      let gross = 0, gst = 0, levy = 0, epr = 0;
      for (const l of ls) {
        const g = n(l.value_cents);
        const line = { gross: g, gst: Math.round(g * n(SETTINGS.gst_rate)), levy: Math.round(g * n(l.levy_rate)), epr: Math.round(n(l.net_t) * n(l.epr_cents_per_t)) };
        await db.query(`insert into settlement_lines (settlement_id, delivery_id, net_t, price_cents_per_t, gross_cents, gst_cents, levy_cents, epr_cents) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [st.id, l.id, l.net_t, l.price_cents_per_t, line.gross, line.gst, line.levy, line.epr]);
        gross += line.gross; gst += line.gst; levy += line.levy; epr += line.epr;
      }
      const due = ls.map((l) => isoDate(l.pay_by)).sort().pop();
      await db.query(`update settlements set due_on = $2 where id = $1`, [st.id, due]);
      result.push({ rcti: st.number, grower: ls[0].org, loads: ls.length, net_t: t3(ls.reduce((a, l) => a + n(l.net_t), 0)), gross_cents: gross, gst_cents: gst, levy_cents: levy, epr_cents: epr, pay_cents: gross + gst - levy - epr, due_on: due });
    }
    await db.exec(flags['dry-run'] ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  result.sort((a, b) => a.rcti.localeCompare(b.rcti));
  out({ dry_run: !!flags['dry-run'], settlements: result, held }, (d) => [heading(`${d.dry_run ? 'Dry run: would draft' : 'Drafted'} ${d.settlements.length} RCTIs`),
    table(d.settlements, [{ key: 'rcti', label: 'RCTI' }, { key: 'grower', label: 'Grower' }, { key: 'loads', label: 'Loads', align: 'right' }, { key: 'net_t', label: 'Tonnes', align: 'right', format: t1 },
      { key: 'gross_cents', label: 'Grain', align: 'right', format: money }, { key: 'gst_cents', label: 'GST', align: 'right', format: money }, { key: 'levy_cents', label: 'Levy', align: 'right', format: money },
      { key: 'epr_cents', label: 'EPR', align: 'right', format: money }, { key: 'pay_cents', label: 'To pay', align: 'right', format: money }, { key: 'due_on', label: 'Pay by', format: isoDate }]),
    d.held.length ? '\n  Held back until fixed:\n' + d.held.map((h) => `    ${h.ticket}  ${h.grower}: ${h.why}`).join('\n') : '',
    `\n  ${d.dry_run ? 'Nothing written.' : 'Drafts only: check them, then grain issue <RCTI>. Nothing is sent or paid.'}`].join('\n'));
}

async function settlements(flags) {
  const status = str(flags.status);
  const rows = await db.query(`select * from settlement_totals ${status ? 'where status = $1' : `where status in ('draft', 'issued')`} order by number`, status ? [status] : []);
  out(rows, (d) => heading(`RCTIs${status ? `, ${status}` : ', draft and unpaid'}`) + '\n' + table(d, [{ key: 'number', label: 'RCTI' }, { key: 'grower', label: 'Grower' }, { key: 'status', label: 'Status' },
    { key: 'issued_on', label: 'Issued', format: isoDate }, { key: 'due_on', label: 'Pay by', format: isoDate }, { key: 'net_t', label: 'Tonnes', align: 'right', format: t1 },
    { key: 'gross_cents', label: 'Grain', align: 'right', format: money }, { key: 'levy_cents', label: 'Levy', align: 'right', format: money }, { key: 'epr_cents', label: 'EPR', align: 'right', format: money },
    { key: 'pay_cents', label: 'To pay', align: 'right', format: money }]));
}

async function documentCard(args) {
  const ref = str(args[0]).toUpperCase();
  if (ref.startsWith('INV')) {
    const i = await findByNumber('invoices', ref, 'invoice', 'INV-');
    const [t] = await db.query(`select * from invoice_totals where id = $1`, [i.id]);
    const lines = await db.query(`select d.ticket, d.delivered_on, il.net_t, il.price_cents_per_t, il.amount_cents, il.gst_cents from invoice_lines il join deliveries d on d.id = il.delivery_id where il.invoice_id = $1 order by d.delivered_on`, [i.id]);
    return out({ invoice: t, lines }, (d) => [heading(`${t.number} to ${t.buyer}, ${t.status}`), table(d.lines, [{ key: 'ticket', label: 'Ticket' }, { key: 'delivered_on', label: 'Date', format: isoDate },
      { key: 'net_t', label: 'Tonnes', align: 'right', format: (v) => n(v).toFixed(2) }, { key: 'price_cents_per_t', label: '$/t', align: 'right', format: pt }, { key: 'amount_cents', label: 'Amount', align: 'right', format: money }]),
      `\n  ${money(t.net_cents)} plus GST ${money(t.gst_cents)} = ${money(t.total_cents)}. Paid ${money(t.paid_cents)}. Due ${isoDate(t.due_on) || 'when issued'}.`].join('\n'));
  }
  const s = await findByNumber('settlements', ref, 'RCTI', 'RCTI-');
  const [t] = await db.query(`select * from settlement_totals where id = $1`, [s.id]);
  const lines = await db.query(`select d.ticket, d.delivered_on, g.code as grade, sl.net_t, sl.price_cents_per_t, sl.gross_cents, sl.levy_cents, sl.epr_cents from settlement_lines sl
    join deliveries d on d.id = sl.delivery_id join grades g on g.id = d.grade_id where sl.settlement_id = $1 order by d.delivered_on`, [s.id]);
  out({ rcti: t, lines }, (d) => [heading(`${t.number} for ${t.grower}, ${t.status}`), table(d.lines, [{ key: 'ticket', label: 'Ticket' }, { key: 'delivered_on', label: 'Date', format: isoDate }, { key: 'grade', label: 'Grade' },
    { key: 'net_t', label: 'Tonnes', align: 'right', format: (v) => n(v).toFixed(2) }, { key: 'price_cents_per_t', label: '$/t', align: 'right', format: pt }, { key: 'gross_cents', label: 'Grain', align: 'right', format: money },
    { key: 'levy_cents', label: 'Levy', align: 'right', format: money }, { key: 'epr_cents', label: 'EPR', align: 'right', format: money }]),
    `\n  Grain ${money(t.gross_cents)} plus GST ${money(t.gst_cents)}, less levy ${money(t.levy_cents)} and royalties ${money(t.epr_cents)}: ${money(t.pay_cents)} to pay by ${isoDate(t.due_on) || '?'}.`].join('\n'));
}

// Issue an RCTI or an invoice. An RCTI is refused when the RCTI rules would be broken by issuing it.
async function issue(args, flags) {
  const ref = str(args[0]).toUpperCase();
  const on = parseDate(flags.on) || today();
  if (ref.startsWith('INV')) {
    const i = await findByNumber('invoices', ref, 'invoice', 'INV-');
    if (i.status !== 'draft') throw new CliError(`${i.number} is ${i.status}, not a draft.`);
    await db.query(`update invoices set status = 'issued', issued_on = $2, due_on = $3 where id = $1`, [i.id, on, addDays(on, n(SETTINGS.invoice_terms_days))]);
    return out({ number: i.number, issued_on: on }, `  ${i.number} issued ${on}, due ${addDays(on, n(SETTINGS.invoice_terms_days))}. Render it with: npm run docs -- tax-invoice`);
  }
  const s = await findByNumber('settlements', ref, 'RCTI', 'RCTI-');
  if (s.status !== 'draft') throw new CliError(`${s.number} is ${s.status}, not a draft.`);
  const [o] = await db.query(`select * from orgs where id = $1`, [s.org_id]);
  const problems = [];
  if (!o.rcti_agreed_on || isoDate(o.rcti_agreed_on) > on || (o.rcti_ends_on && isoDate(o.rcti_ends_on) < on)) problems.push(`no RCTI agreement with ${o.name} in force on ${on}`);
  if (!o.gst_registered) problems.push(`${o.name} is not registered for GST`);
  if (!o.abn) problems.push(`no ABN recorded for ${o.name}`);
  if (problems.length) throw new CliError(`${s.number} cannot be issued: ${problems.join('; ')}. Record the agreement (grain rcti-agreement) or have the grower invoice you instead.`);
  const [late] = await db.query(`select max($2::date - d.delivered_on) as days from settlement_lines sl join deliveries d on d.id = sl.delivery_id where sl.settlement_id = $1`, [s.id, on]);
  await db.query(`update settlements set status = 'issued', issued_on = $2 where id = $1`, [s.id, on]);
  out({ number: s.number, issued_on: on, oldest_load_days: n(late.days) }, (x) => [`  ${x.number} issued ${on}. Render it with: npm run docs -- rcti`,
    x.oldest_load_days > n(SETTINGS.rcti_days) ? `  ! its oldest load is ${x.oldest_load_days} days old, past the ${SETTINGS.rcti_days} days the RCTI rules allow` : ''].filter(Boolean).join('\n'));
}

async function pay(args, flags) {
  const ref = str(args[0]).toUpperCase();
  const on = parseDate(flags.on) || today();
  if (ref.startsWith('INV')) {
    const i = await findByNumber('invoices', ref, 'invoice', 'INV-');
    const [t] = await db.query(`select * from invoice_totals where id = $1`, [i.id]);
    if (t.status !== 'issued') throw new CliError(`${i.number} is ${t.status}. Only an issued invoice takes a payment.`);
    const amt = parseCents(args[1], 'payment') ?? n(t.total_cents) - n(t.paid_cents);
    const paid = n(t.paid_cents) + amt;
    if (paid > n(t.total_cents)) throw new CliError(`That is more than the ${money(n(t.total_cents) - n(t.paid_cents))} still owing on ${i.number}.`);
    await db.query(`update invoices set paid_cents = $2::bigint, status = case when $2::bigint >= $3::bigint then 'paid' else status end, paid_on = case when $2::bigint >= $3::bigint then $4::date else paid_on end where id = $1`, [i.id, paid, n(t.total_cents), on]);
    return out({ number: i.number, paid_cents: paid, owing_cents: n(t.total_cents) - paid }, (x) => `  ${money(amt)} received on ${x.number}. ${x.owing_cents ? money(x.owing_cents) + ' still owing.' : 'Paid in full.'}`);
  }
  const s = await findByNumber('settlements', ref, 'RCTI', 'RCTI-');
  if (s.status !== 'issued') throw new CliError(`${s.number} is ${s.status}. Issue it before you record the payment.`);
  await db.query(`update settlements set status = 'paid', paid_on = $2 where id = $1`, [s.id, on]);
  out({ number: s.number, paid_on: on }, `  ${s.number} recorded as paid on ${on}.`);
}

async function payables() {
  const rows = await db.query(`select 'RCTI ' || number as what, grower as who, due_on, pay_cents as amount_cents, case when due_on < current_date then current_date - due_on else 0 end as days_late
      from settlement_totals where status = 'issued'
    union all select 'not settled: ' || ticket, org, pay_by, round(value_cents * 1.0)::bigint, case when pay_by < current_date then current_date - pay_by else 0 end
      from unsettled_receivals
    order by 3, 2`);
  out(rows, (d) => heading('What we owe growers, by when') + '\n' + table(d, [{ key: 'what', label: 'For' }, { key: 'who', label: 'Grower' }, { key: 'due_on', label: 'Pay by', format: isoDate },
    { key: 'amount_cents', label: 'Amount', align: 'right', format: money }, { key: 'days_late', label: 'Late', align: 'right', format: (v) => (n(v) ? `${v}d` : '') }]) +
    '\n\n  RCTI amounts are what is paid after levies and royalties. Loads not settled show the grain value before GST and deductions.');
}

async function receivables() {
  const rows = await db.query(`select e.*, (select string_agg(t.number || ' ' || t.days_overdue || 'd', ', ' order by t.number) from invoice_totals t where t.org_id = e.id and t.status = 'issued' and t.days_overdue > 0) as late_invoices
    from buyer_exposure e where e.owing_cents > 0 or e.uninvoiced_cents > 0 order by e.overdue_cents desc, e.owing_cents desc`);
  const res = rows.map((r) => ({ ...r, exposure_cents: n(r.owing_cents) + n(r.uninvoiced_cents), over_limit: r.credit_limit_cents !== null && n(r.owing_cents) + n(r.uninvoiced_cents) > n(r.credit_limit_cents) }));
  out(res, (d) => heading('What buyers owe us, against their credit limit') + '\n' + table(d, [{ key: 'name', label: 'Buyer' }, { key: 'owing_cents', label: 'Invoiced', align: 'right', format: money },
    { key: 'overdue_cents', label: 'Overdue', align: 'right', format: money }, { key: 'uninvoiced_cents', label: 'Not invoiced', align: 'right', format: money },
    { key: 'exposure_cents', label: 'Exposure', align: 'right', format: money }, { key: 'credit_limit_cents', label: 'Limit', align: 'right', format: (v) => (v === null ? 'none' : money(v)) },
    { key: 'over_limit', label: '', format: (v) => (v ? 'OVER LIMIT' : '') }, { key: 'late_invoices', label: 'Late invoices', format: (v) => v || '' }]));
}

async function invoiceRun(flags) {
  const loads = await db.query(`select v.*, c.gst_applies from delivery_values v join contracts c on c.id = v.contract_id where v.side = 'outturn' and not v.invoiced and v.value_cents is not null order by v.org, v.delivered_on`);
  const byBuyer = new Map();
  for (const l of loads) { if (!byBuyer.has(l.org_id)) byBuyer.set(l.org_id, []); byBuyer.get(l.org_id).push(l); }
  const result = [];
  await db.exec('BEGIN');
  try {
    for (const [orgId, ls] of byBuyer) {
      let [inv] = await db.query(`select id, number from invoices where org_id = $1 and status = 'draft' order by created_at limit 1`, [orgId]);
      if (!inv) {
        const number = await nextNumber('invoices', 'INV-');
        [inv] = await db.query(`insert into invoices (number, org_id, status) values ($1,$2,'draft') returning id, number`, [number, orgId]);
      }
      let net = 0, gst = 0;
      for (const l of ls) {
        const g = l.gst_applies ? Math.round(n(l.value_cents) * n(SETTINGS.gst_rate)) : 0;
        await db.query(`insert into invoice_lines (invoice_id, delivery_id, net_t, price_cents_per_t, amount_cents, gst_cents) values ($1,$2,$3,$4,$5,$6)`, [inv.id, l.id, l.net_t, l.price_cents_per_t, l.value_cents, g]);
        net += n(l.value_cents); gst += g;
      }
      result.push({ invoice: inv.number, buyer: ls[0].org, loads: ls.length, net_t: t3(ls.reduce((a, l) => a + n(l.net_t), 0)), net_cents: net, gst_cents: gst });
    }
    await db.exec(flags['dry-run'] ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  result.sort((a, b) => a.invoice.localeCompare(b.invoice));
  out({ dry_run: !!flags['dry-run'], invoices: result }, (d) => heading(`${d.dry_run ? 'Dry run: would draft' : 'Drafted'} ${d.invoices.length} sale invoices`) + '\n' +
    table(d.invoices, [{ key: 'invoice', label: 'Invoice' }, { key: 'buyer', label: 'Buyer' }, { key: 'loads', label: 'Loads', align: 'right' }, { key: 'net_t', label: 'Tonnes', align: 'right', format: t1 },
      { key: 'net_cents', label: 'Net', align: 'right', format: money }, { key: 'gst_cents', label: 'GST', align: 'right', format: money }]) +
    `\n\n  ${d.dry_run ? 'Nothing written.' : 'Drafts only: check them, then grain issue <INV>. Nothing is sent.'}`);
}

async function invoices(flags) {
  const status = str(flags.status);
  const rows = await db.query(`select * from invoice_totals ${status ? 'where status = $1' : `where status in ('draft', 'issued')`} order by number`, status ? [status] : []);
  out(rows, (d) => heading(`Sale invoices${status ? `, ${status}` : ', draft and unpaid'}`) + '\n' + table(d, [{ key: 'number', label: 'Invoice' }, { key: 'buyer', label: 'Buyer' }, { key: 'status', label: 'Status' },
    { key: 'issued_on', label: 'Issued', format: isoDate }, { key: 'due_on', label: 'Due', format: isoDate }, { key: 'total_cents', label: 'Total', align: 'right', format: money },
    { key: 'paid_cents', label: 'Paid', align: 'right', format: money }, { key: 'days_overdue', label: 'Late', align: 'right', format: (v) => (n(v) > 0 ? `${v}d` : '') }]));
}

// The levy return and the royalty remittance, from issued and paid RCTIs in a period.
async function levies(flags) {
  let from = parseDate(flags.from), to = parseDate(flags.to);
  const qm = str(flags.quarter).match(/^(\d{4})-?q([1-4])$/i);
  if (qm) { const m = (Number(qm[2]) - 1) * 3 + 1; from = `${qm[1]}-${String(m).padStart(2, '0')}-01`; to = addDays(m === 10 ? `${Number(qm[1]) + 1}-01-01` : `${qm[1]}-${String(m + 3).padStart(2, '0')}-01`, -1); }
  if (!from) { const d = new Date(`${today()}T00:00:00Z`); const m = Math.floor(d.getUTCMonth() / 3) * 3; from = new Date(Date.UTC(d.getUTCFullYear(), m, 1)).toISOString().slice(0, 10); }
  if (!to) to = today();
  const lev = await db.query(`select cm.code as commodity, cm.levy_rate, count(*) as loads, sum(sl.net_t) as tonnes, sum(sl.gross_cents) as value_cents, sum(sl.levy_cents) as levy_cents,
      round(sum(sl.gross_cents) * cm.levy_rate)::bigint as expected_cents
    from settlement_lines sl join settlements s on s.id = sl.settlement_id join deliveries d on d.id = sl.delivery_id join commodities cm on cm.id = d.commodity_id
    where s.status in ('issued', 'paid') and s.issued_on between $1 and $2 group by cm.code, cm.levy_rate order by cm.code`, [from, to]);
  const epr = await db.query(`select coalesce(va.name, 'not declared') as variety, cm.code as commodity, count(*) as loads, sum(sl.net_t) as tonnes, sum(sl.epr_cents) as epr_cents
    from settlement_lines sl join settlements s on s.id = sl.settlement_id join deliveries d on d.id = sl.delivery_id join commodities cm on cm.id = d.commodity_id left join varieties va on va.id = d.variety_id
    where s.status in ('issued', 'paid') and s.issued_on between $1 and $2 and cm.epr_applies group by 1, 2 order by 2, 1`, [from, to]);
  out({ from, to, levies: lev, royalties: epr }, (d) => [heading(`Levies and royalties withheld, RCTIs issued ${d.from} to ${d.to}`),
    table(d.levies, [{ key: 'commodity', label: 'Commodity' }, { key: 'levy_rate', label: 'Rate', align: 'right', format: (v) => `${(n(v) * 100).toFixed(3)}%` }, { key: 'loads', label: 'Loads', align: 'right' },
      { key: 'tonnes', label: 'Tonnes', align: 'right', format: t1 }, { key: 'value_cents', label: 'Value', align: 'right', format: money }, { key: 'levy_cents', label: 'Levy withheld', align: 'right', format: money },
      { key: 'expected_cents', label: 'At the rate', align: 'right', format: money }]),
    '\n  End point royalties by variety', table(d.royalties, [{ key: 'commodity', label: 'Commodity' }, { key: 'variety', label: 'Variety' }, { key: 'loads', label: 'Loads', align: 'right' },
      { key: 'tonnes', label: 'Tonnes', align: 'right', format: t1 }, { key: 'epr_cents', label: 'Royalty withheld', align: 'right', format: money }]),
    '\n  A levy withheld below "At the rate" is money still owed on the return. Lodge with the department; remit royalties to each variety\'s EPR manager.'].join('\n'));
}

// ---------------------------------------------------------------- compliance and attention

async function complianceRows() {
  const q = async (sql) => db.query(sql);
  const checks = {
    R1: await q(`select st.number || ' ' || o.name || ': ' || case when o.rcti_agreed_on is null then 'no RCTI agreement on file'
          when o.rcti_ends_on is not null and o.rcti_ends_on < coalesce(st.issued_on, current_date) then 'agreement ended ' || o.rcti_ends_on
          when not o.gst_registered then 'grower not GST registered' else 'no ABN' end as example, st.issued_on as at
        from settlements st join orgs o on o.id = st.org_id where st.status in ('draft', 'issued', 'paid')
          and (o.rcti_agreed_on is null or o.rcti_agreed_on > coalesce(st.issued_on, current_date) or (o.rcti_ends_on is not null and o.rcti_ends_on < coalesce(st.issued_on, current_date)) or not o.gst_registered or o.abn is null)
        order by st.number`),
    R2: await q(`select * from (
          select d.ticket || ' ' || o.name || ': ' || (current_date - d.delivered_on) || ' days, no RCTI yet' as example, current_date - d.delivered_on as days
            from deliveries d join orgs o on o.id = d.org_id where d.side = 'receival' and d.contract_id is not null and current_date - d.delivered_on > (select rcti_days from settings)
              and not exists (select 1 from settlement_lines sl join settlements s on s.id = sl.settlement_id where sl.delivery_id = d.id and s.status in ('issued', 'paid'))
          union all
          select d.ticket || ' ' || o.name || ': on ' || st.number || ', issued ' || (st.issued_on - d.delivered_on) || ' days after the load', st.issued_on - d.delivered_on
            from settlement_lines sl join settlements st on st.id = sl.settlement_id join deliveries d on d.id = sl.delivery_id join orgs o on o.id = st.org_id
            where st.status in ('issued', 'paid') and st.issued_on - d.delivered_on > (select rcti_days from settings)) x order by days desc`),
    R3: await q(`select d.ticket || ' on ' || st.number || ': levy ' || to_char(sl.levy_cents / 100.0, 'FM$999,990.00') || ', should be ' || to_char(round(sl.gross_cents * cm.levy_rate) / 100.0, 'FM$999,990.00') as example
        from settlement_lines sl join settlements st on st.id = sl.settlement_id join deliveries d on d.id = sl.delivery_id join commodities cm on cm.id = d.commodity_id
        where st.status <> 'void' and cm.levy_rate > 0 and sl.levy_cents < round(sl.gross_cents * cm.levy_rate) - 1 order by d.delivered_on`),
    R4: await q(`select d.ticket || ' ' || o.name || ': received ' || d.delivered_on || ', no declaration' as example from deliveries d join orgs o on o.id = d.org_id where d.side = 'receival' and not d.cvd_received order by d.delivered_on`),
    R5: await q(`select d.ticket || ' ' || o.name || ': ' || lower(cm.name) || ' received ' || d.delivered_on || ', no variety' as example from deliveries d join orgs o on o.id = d.org_id join commodities cm on cm.id = d.commodity_id
        where d.side = 'receival' and cm.epr_applies and d.variety_id is null order by d.delivered_on`),
    R6: await q(`select b.number || ' ' || b.org || ': ' || b.loads || case when b.loads = 1 then ' load' else ' loads' end || ' from ' || b.first_load_on || ', ' || coalesce('confirmed ' || b.confirmed_on, 'never confirmed') as example
        from contract_book b where b.loads > 0 and (b.confirmed_on is null or b.confirmed_on > b.first_load_on) order by b.number`),
    R7: await q(`select ticket || ' ' || org || ' at ' || grade || ': ' || fails || coalesce(', fits ' || fits_grade, ', fits nothing on file') as example from off_spec order by delivered_on`),
    R8: await q(`select d.ticket || ' ' || coalesce(d.truck_rego, 'no rego') || ' for ' || o.name || ': ' || to_char(d.gross_kg, 'FM999,999') || ' kg on a ' || to_char(d.mass_limit_kg, 'FM999,999') || ' kg limit' as example
        from deliveries d join orgs o on o.id = d.org_id where d.mass_limit_kg is not null and d.gross_kg > d.mass_limit_kg order by d.delivered_on`),
  };
  return RULES.map((r) => ({ ...r, count: checks[r.id].length, examples: checks[r.id].map((x) => x.example) }));
}

async function compliance() {
  const rows = await complianceRows();
  out(rows, (d) => heading('Compliance: the records against the rules in docs/compliance.md') + '\n' + table(d, [{ key: 'id', label: 'Rule' }, { key: 'rule', label: 'Check' },
    { key: 'count', label: 'Breaches', align: 'right' }, { key: 'examples', label: 'Worst example', format: (v) => truncate(v[0] || '', 72) }]) +
    '\n\n  A records check, not legal or tax advice. Sources are in docs/compliance.md.');
}

async function attention() {
  const items = [];
  const add = (area, rank, who, what, action) => items.push({ area, rank, who, what, action });
  const FIX = { R1: 'record the agreement, or the grower invoices you', R2: '/settle-run', R3: 'adjustment note for the levy', R4: 'get the CVD, then grain cvd', R5: 'get the variety, then grain variety',
    R6: '/draft-confirmation', R7: 'grain regrade <ticket>', R8: 'overload procedure; tell the carrier' };
  for (const r of await complianceRows()) for (const e of r.examples) { const i = e.indexOf(': '); add('rules', 1, i > 0 ? e.slice(0, i) : e, `${r.id} ${i > 0 ? e.slice(i + 2) : e}`, FIX[r.id]); }
  for (const b of await db.query(`select * from buyer_exposure`)) {
    const exp = n(b.owing_cents) + n(b.uninvoiced_cents);
    if (b.credit_limit_cents !== null && exp > n(b.credit_limit_cents)) add('money', 2, b.name, `${money(exp)} owed or on the road against a ${money(b.credit_limit_cents)} credit limit`, 'hold out-turns until paid, or raise the limit');
    if (n(b.overdue_cents) > 0) add('money', n(b.oldest_days_overdue) >= CALL_DAYS ? 2 : 3, b.name, `${money(b.overdue_cents)} overdue, oldest ${b.oldest_days_overdue} days`, n(b.oldest_days_overdue) >= CALL_DAYS ? 'call them; /draft-payment-reminder' : '/draft-payment-reminder');
  }
  for (const s of await db.query(`select * from settlement_totals where status = 'issued' and due_on < current_date order by due_on`)) add('money', 2, s.grower, `${s.number} for ${money(s.pay_cents)} was due ${isoDate(s.due_on)} and is not paid`, 'pay it, then grain pay ' + s.number);
  for (const u of await db.query(`select * from unsettled_receivals where days_to_pay < 0 order by days_to_pay`)) add('money', 2, u.org, `${u.ticket} (${t1(u.net_t)} t) was due to be paid ${-u.days_to_pay} days ago and has no RCTI`, '/settle-run');
  for (const s of await db.query(`select * from settlement_totals where status = 'draft'`)) add('money', 3, s.grower, `${s.number} for ${money(s.pay_cents)} drafted and not issued`, 'check it, then grain issue ' + s.number);
  for (const c of await db.query(`select * from contract_book where days_past_window > 0 order by days_past_window desc`)) add('contracts', 2, c.org, `${c.number} ${c.side === 'purchase' ? 'from' : 'to'} them is ${t1(c.short_of_tolerance_t)} t short and the window closed ${c.days_past_window} days ago`, c.side === 'purchase' ? '/draft-delivery-chase' : 'agree new dates with the buyer');
  for (const c of await db.query(`select * from contract_book where status = 'open' and confirmed_on is null and loads = 0`)) add('contracts', 3, c.org, `${c.number} (${t1(c.tonnes)} t ${c.grade}) has no written confirmation yet`, '/draft-confirmation');
  for (const p of await db.query(`select * from positions where net_t < 0 order by net_t`)) add('position', 2, `${p.grade} ${p.season}`, `short ${t1(Math.abs(n(p.net_t)))} t: sold more than is in store or bought`, 'buy to cover; /position');
  for (const c of await db.query(`select * from contract_book where status = 'open' and delivery_to between current_date and current_date + ${SOON_DAYS} and short_of_tolerance_t > 0 order by delivery_to`)) add('coming up', 4, c.org, `${c.number} window closes ${isoDate(c.delivery_to)} with ${t1(c.short_of_tolerance_t)} t still to come`, 'check in with them');
  items.sort((a, b) => a.rank - b.rank);
  out(items, (d) => heading(`What wants a decision: ${d.length} items, worst first`) + '\n' + table(d, [{ key: 'area', label: 'Area' }, { key: 'who', label: 'Who', width: 26 }, { key: 'what', label: 'What', width: 90 }, { key: 'action', label: 'Next' }]));
}

// ---------------------------------------------------------------- data in and out

// Bring AgriDigital report exports across. Column names vary by report and by site, so every field
// is matched against the names AgriDigital and other grain systems use; anything else is mapped by
// asking Claude Code. --kind picks the report: organisations, contracts or deliveries.
async function importCmd(args, flags) {
  const source = str(args[0]).toLowerCase();
  const file = args[1];
  if (!['agridigital', 'csv'].includes(source) || !file) throw new CliError('grain import agridigital <file.csv> --kind=organisations|contracts|deliveries [--dry-run]');
  const rows = parseCsv(readFileSync(path.resolve(file), 'utf8'));
  const head = rows.length ? Object.keys(rows[0]).join(' ').toLowerCase() : '';
  const kind = str(flags.kind) || (/ticket|weigh|gross|tare/.test(head) ? 'deliveries' : /contract|price|tonnes/.test(head) ? 'contracts' : 'organisations');
  const problems = [];
  const s = { kind, rows: rows.length, added: 0, unchanged: 0, problems };
  await db.exec('BEGIN');
  try {
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      if (kind === 'organisations') {
        const name = pick(r, 'Legal Name', 'Organisation', 'Organisation Name', 'Name', 'Business Name', 'Trading Name');
        if (!name) { problems.push(`row ${line}: no name`); continue; }
        const ref = pick(r, 'Unique ID', 'ID', 'Organisation ID', 'Code');
        if ((await db.query(`select 1 from orgs where lower(name) = lower($1) or (external_ref = $2 and $2 <> '')`, [name, ref])).length) { s.unchanged++; continue; }
        const typ = pick(r, 'Type', 'Organisation Type', 'Role', 'Relationship').toLowerCase();
        const kindOf = /buyer|customer|consumer|processor/.test(typ) ? 'buyer' : /carrier|transport|freight/.test(typ) ? 'carrier' : /broker/.test(typ) ? 'broker' : 'grower';
        const prefix = { grower: 'G', buyer: 'B', carrier: 'C', broker: 'K' }[kindOf];
        const [last] = await db.query(`select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 as next from orgs where code like $1`, [`${prefix}%`]);
        await db.query(`insert into orgs (code, name, kind, abn, ngr, gst_registered, credit_limit_cents, email, phone, address, external_ref) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [`${prefix}${String(last.next).padStart(3, '0')}`, name, kindOf, pick(r, 'ABN') || null, pick(r, 'NGR', 'NGR Number', 'NGR No') || null, yesNo(pick(r, 'GST Registered', 'GST'), true),
            parseCents(pick(r, 'Credit Limit', 'Credit') || null), pick(r, 'Email', 'Email Address') || null, pick(r, 'Phone', 'Mobile') || null, pick(r, 'Address', 'Postal Address') || null, ref || null]);
        s.added++;
      } else if (kind === 'contracts') {
        const number = pick(r, 'Contract No', 'Contract Number', 'Contract', 'Contract ID', 'Reference');
        const orgName = pick(r, 'Counterparty', 'Grower', 'Buyer', 'Seller', 'Organisation', 'Customer');
        const gradeCode = pick(r, 'Grade', 'Grade Code');
        const tonnes = parseNum(pick(r, 'Tonnes', 'Quantity', 'Contract Tonnes', 'Qty (mt)', 'Quantity (mt)'), 'tonnes');
        const priceC = parseCents(pick(r, 'Price', 'Price ($/t)', 'Price per tonne', 'Contract Price') || null);
        if (!number || !orgName || !gradeCode || !tonnes || priceC === null) { problems.push(`row ${line}: needs a contract number, counterparty, grade, tonnes and price`); continue; }
        if ((await db.query(`select 1 from contracts where number = $1 or external_ref = $1`, [number])).length) { s.unchanged++; continue; }
        const [o] = await db.query(`select * from orgs where lower(name) = lower($1) or external_ref = $1 limit 1`, [orgName]);
        const [g] = await db.query(`select * from grades where lower(code) = lower($1)`, [gradeCode]);
        if (!o) { problems.push(`row ${line}: ${orgName} is not on file. Import organisations first.`); continue; }
        if (!g) { problems.push(`row ${line}: grade ${gradeCode} is not on file. Add it first.`); continue; }
        const sideRaw = pick(r, 'Type', 'Contract Type', 'Side', 'Direction').toLowerCase();
        const side = /sale|sell/.test(sideRaw) ? 'sale' : /purchase|buy/.test(sideRaw) ? 'purchase' : o.kind === 'buyer' ? 'sale' : 'purchase';
        const [site] = await db.query(`select id from sites where lower(code) = lower($1) or lower(name) = lower($1)`, [pick(r, 'Site', 'Location', 'Delivery Point', 'Delivery Site')]);
        await db.query(`insert into contracts (number, side, org_id, commodity_id, grade_id, season, tonnes, price_cents_per_t, basis, site_id, delivery_from, delivery_to, confirmed_on, external_ref, notes)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Imported from AgriDigital')`,
          [number, side, o.id, g.commodity_id, g.id, pick(r, 'Season') || String(new Date().getFullYear()), tonnes, priceC, pick(r, 'Basis', 'Price Basis', 'Delivery Terms') || 'delivered site', site?.id || null,
            parseDate(pick(r, 'Delivery Start', 'Start Date', 'From', 'Delivery From')), parseDate(pick(r, 'Delivery End', 'End Date', 'To', 'Delivery To')),
            parseDate(pick(r, 'Accepted', 'Accepted Date', 'Confirmed', 'Signed')) || null, number]);
        s.added++;
      } else {
        const tk = pick(r, 'Ticket', 'Ticket No', 'Ticket Number', 'Weighbridge Ticket', 'Docket', 'Delivery No', 'Delivery Number');
        if (!tk) { problems.push(`row ${line}: no ticket number`); continue; }
        if ((await db.query(`select 1 from deliveries where ticket = $1`, [tk])).length) { s.unchanged++; continue; }
        const [c] = await db.query(`select * from contracts where number = $1 or external_ref = $1`, [pick(r, 'Contract No', 'Contract Number', 'Contract')]);
        const [g] = await db.query(`select * from grades where lower(code) = lower($1)`, [pick(r, 'Grade', 'Grade Code')]);
        const [site] = await db.query(`select * from sites where lower(code) = lower($1) or lower(name) = lower($1)`, [pick(r, 'Site', 'Location', 'Site Name')]);
        let gross = parseKg(pick(r, 'Gross', 'Gross (kg)', 'Gross Weight') || null, 'gross'), tare = parseKg(pick(r, 'Tare', 'Tare (kg)', 'Tare Weight') || null, 'tare');
        const netT = parseNum(pick(r, 'Net', 'Net (mt)', 'Net Weight', 'Net Tonnes', 'Tonnes', 'Quantity (mt)'), 'tonnes');
        if ((!gross || tare === null) && netT) { tare = 0; gross = Math.round(netT * 1000); }
        if (!g || !site || !gross) { problems.push(`row ${line}: ticket ${tk} needs a grade, a site and a weight on file`); continue; }
        const orgName = pick(r, 'Grower', 'Buyer', 'Organisation', 'Counterparty', 'Customer');
        const [o] = c ? await db.query(`select * from orgs where id = $1`, [c.org_id]) : await db.query(`select * from orgs where lower(name) = lower($1)`, [orgName]);
        if (!o) { problems.push(`row ${line}: ticket ${tk} has no contract or grower on file`); continue; }
        const side = c ? (c.side === 'purchase' ? 'receival' : 'outturn') : /out/i.test(pick(r, 'Type', 'Movement', 'Direction')) ? 'outturn' : 'receival';
        const [v] = await db.query(`select id from varieties where lower(name) = lower($1)`, [pick(r, 'Variety', 'Declared Variety')]);
        await db.query(`insert into deliveries (ticket, side, contract_id, org_id, site_id, delivered_on, commodity_id, grade_id, variety_id, truck_rego, gross_kg, tare_kg, moisture, protein, screenings, test_weight, oil, cvd_received, external_ref)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$1)`,
          [tk, side, c?.id || null, o.id, site.id, parseDate(pick(r, 'Date', 'Delivery Date', 'Processed Date', 'Weighed')) || today(), g.commodity_id, g.id, v?.id || null, pick(r, 'Rego', 'Truck Rego', 'Vehicle') || null,
            gross, tare, parseNum(pick(r, 'Moisture', 'Moisture %'), 'percent'), parseNum(pick(r, 'Protein', 'Protein %'), 'percent'), parseNum(pick(r, 'Screenings', 'Screenings %'), 'percent'),
            parseNum(pick(r, 'Test Weight', 'Test Weight (kg/hl)', 'Hectolitre'), 'kg/hl'), parseNum(pick(r, 'Oil', 'Oil %'), 'percent'), yesNo(pick(r, 'CVD', 'Vendor Declaration', 'CVD Received'))]);
        s.added++;
      }
    }
    await db.exec(flags['dry-run'] ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  out(s, (x) => [`  ${flags['dry-run'] ? 'Dry run: would import' : 'Imported'} ${x.kind} from ${x.rows} rows: ${x.added} new, ${x.unchanged} already here.`,
    problems.length ? '  Not imported:\n' + problems.map((p) => `    - ${p}`).join('\n') : '',
    flags['dry-run'] ? '  Nothing written.' : '  Check the contract book against AgriDigital before you rely on it: grain contracts'].filter(Boolean).join('\n'));
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(';') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCmd(flags) {
  const dir = path.resolve(REPO_ROOT, str(flags.out) || 'exports');
  mkdirSync(dir, { recursive: true });
  const tables = ['orgs', 'commodities', 'grades', 'varieties', 'sites', 'contracts', 'deliveries', 'cash_prices', 'settlements', 'settlement_lines', 'invoices', 'invoice_lines', 'notes'];
  const counts = {};
  for (const t of tables) {
    const rows = await db.query(`select * from ${t} order by created_at`);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
    counts[t] = rows.length;
  }
  out({ dir, counts }, () => `  Exported ${tables.length} tables to ${path.relative(REPO_ROOT, dir) || dir}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

async function log(args) {
  const ref = args[0];
  const body = args.slice(1).join(' ').trim();
  if (!body) throw new CliError('What happened? grain log <grower, buyer or contract> "note text"');
  const c = /^[ps]c-?\d/i.test(String(ref)) ? await findContract(ref) : null;
  const o = c ? null : await findOrg(ref);
  await db.query(`insert into notes (org_id, contract_id, body) values ($1,$2,$3)`, [c ? c.org_id : o.id, c ? c.id : null, body]);
  out({ on: c ? c.number : o.name, body }, (x) => `  Noted on ${x.on}.`);
}

async function grades() {
  const rows = await db.query(`select c.code as commodity, g.code, g.name, g.rank, g.spread_cents_per_t, g.protein_min, g.moisture_max, g.screenings_max, g.test_weight_min, g.oil_min from grades g join commodities c on c.id = g.commodity_id order by c.code, g.rank`);
  out(rows, (d) => heading('Grades, their spec and their spread') + '\n' + table(d, [{ key: 'commodity', label: 'Commodity' }, { key: 'code', label: 'Grade' }, { key: 'spread_cents_per_t', label: 'Spread $/t', align: 'right', format: pt },
    { key: 'protein_min', label: 'Protein min', align: 'right', format: t1 }, { key: 'moisture_max', label: 'Moisture max', align: 'right', format: t1 }, { key: 'screenings_max', label: 'Screenings max', align: 'right', format: t1 },
    { key: 'test_weight_min', label: 'Test wt min', align: 'right', format: t1 }, { key: 'oil_min', label: 'Oil min', align: 'right', format: t1 }]));
}

async function commodity(args, flags) {
  const c = await findCommodity(args[0]);
  if (flags.levy !== undefined) {
    const pct = parseNum(flags.levy, 'percent');
    await db.query(`update commodities set levy_rate = $2 where id = $1`, [c.id, pct / 100]);
  }
  if (flags.epr !== undefined) await db.query(`update commodities set epr_applies = $2 where id = $1`, [c.id, yesNo(flags.epr)]);
  const [x] = await db.query(`select * from commodities where id = $1`, [c.id]);
  out(x, (r) => `  ${r.code} ${r.name}: levy ${(n(r.levy_rate) * 100).toFixed(3)}% of net value, end point royalties ${r.epr_applies ? 'apply' : 'do not apply'}.`);
}

async function settings(flags) {
  const map = { name: ['business_name', str], abn: ['abn', str], 'rcti-days': ['rcti_days', (v) => parseNum(v, 'days')], terms: ['invoice_terms_days', (v) => parseNum(v, 'days')],
    'payment-days': ['default_payment_days', (v) => parseNum(v, 'days')], tolerance: ['default_tolerance_pct', (v) => parseNum(v, 'percent')] };
  for (const [flag, [col, conv]] of Object.entries(map)) if (flags[flag] !== undefined) await db.query(`update settings set ${col} = $1 where id = 1`, [conv(flags[flag])]);
  const [s] = await db.query(`select * from settings where id = 1`);
  out(s, (x) => [heading('Settings'), `  ${x.business_name}, ABN ${x.abn || 'not set'}, ${x.currency} at ${n(x.gst_rate) * 100}% GST`,
    `  RCTIs within ${x.rcti_days} days of the load. Growers paid ${x.default_payment_days} days after delivery unless the contract says otherwise. Sale invoices due in ${x.invoice_terms_days} days.`,
    `  Contract tolerance ${n(x.default_tolerance_pct)}% unless the contract says otherwise.`].join('\n'));
}

// ---------------------------------------------------------------- dispatch table

const HELP = `grain: the grain trading and storage CLI. Add --json to any read for machine output.

  Overview    stats | attention | compliance | settings [--name --abn --rcti-days --terms --payment-days --tolerance]
  Contracts   contracts [--side=purchase|sale] [--all] [--org --commodity --season] | contract <number>
              add-contract --side=purchase|sale --org --grade --tonnes --price [--site --from --to --season --basis --payment-days --tolerance --broker --brokerage --export --confirmed]
              confirm <contract> [--on] | complete <contract> | cancel <contract>
  Loads       deliveries [--side --contract --org --days --unsettled --uninvoiced] | quality
              ticket [<number>] --contract=<PC-0001> --gross=62100 --tare=20900 [--grade --site --on --variety --carrier --rego --limit --moisture --protein --screenings --tw --oil --cvd --freight --dry-run --force]
              regrade <ticket> [--to=ASW1] | cvd <ticket> | variety <ticket> <variety>
  People      orgs [--kind] | org <name> | add-org "name" --kind [--abn --ngr --credit --rcti-agreed] | rcti-agreement <grower> --on [--ends] | credit <buyer> <amount> | log <who|contract> "note"
  Market      prices | post-price <grade> <$/t> [--site --on --season] | position | mtm | stock | margin | grades | commodity <code> [--levy=1.02 --epr=yes]
  Growers     settle-run [--grower] [--dry-run] | settlements [--status] | rcti <RCTI> | issue <RCTI> | pay <RCTI> | payables | levies [--quarter=2026-Q4 | --from --to]
  Buyers      invoice-run [--dry-run] | invoices [--status] | invoice <INV> | issue <INV> | pay <INV> [amount] | receivables
  Data        import agridigital <file.csv> --kind=organisations|contracts|deliveries [--dry-run] | export [--out=dir]`;

const COMMANDS = {
  stats: () => stats(), attention: () => attention(), compliance: () => compliance(), settings: (a, f) => settings(f),
  contracts: (a, f) => contracts(f), contract: (a) => contractCard(a), 'add-contract': (a, f) => addContract(a, f), confirm: (a, f) => confirm(a, f),
  complete: (a) => setStatus(a, 'completed'), cancel: (a) => setStatus(a, 'cancelled'),
  deliveries: (a, f) => deliveries(f), quality: () => quality(), ticket: (a, f) => ticket(a, f), regrade: (a, f) => regrade(a, f), cvd: (a) => cvd(a), variety: (a) => declareVariety(a),
  orgs: (a, f) => orgs(f), org: (a) => orgCard(a), 'add-org': (a, f) => addOrg(a, f), 'rcti-agreement': (a, f) => rctiAgreement(a, f), credit: (a) => credit(a), log: (a) => log(a),
  prices: (a, f) => prices(f), 'post-price': (a, f) => postPrice(a, f), position: () => position(), mtm: () => mtm(), stock: () => stock(), margin: () => margin(), grades: () => grades(), commodity: (a, f) => commodity(a, f),
  'settle-run': (a, f) => settleRun(f), settlements: (a, f) => settlements(f), rcti: (a) => documentCard(a), issue: (a, f) => issue(a, f), pay: (a, f) => pay(a, f), payables: () => payables(), levies: (a, f) => levies(f),
  'invoice-run': (a, f) => invoiceRun(f), invoices: (a, f) => invoices(f), invoice: (a) => documentCard(a), receivables: () => receivables(),
  import: (a, f) => importCmd(a, f), export: (a, f) => exportCmd(f),
};

const { args, flags } = parseArgv(process.argv.slice(2));
JSON_OUT = !!flags.json;
const cmd = args.shift();
if (!cmd || cmd === 'help' || flags.help || !COMMANDS[cmd]) {
  console.log(HELP);
  process.exit(cmd && cmd !== 'help' && !COMMANDS[cmd] ? 1 : 0);
}
db = await getDb();
try {
  [SETTINGS] = await db.query(`select * from settings where id = 1`);
  await COMMANDS[cmd](args, flags);
} catch (e) {
  if (e instanceof CliError) { console.error(e.message); process.exitCode = e.code; }
  else { console.error(e.stack || e.message); process.exitCode = 2; }
} finally {
  await db.close();
}
