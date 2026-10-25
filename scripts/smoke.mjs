#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database: migrate, seed, then every command
// that matters, asserting on the JSON. Passes on Windows and Linux. No network, no Postgres install.
// TEST_DATABASE_URL runs the same test against a real Postgres (CI does this).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'grain-smoke-'));
const exportDir = path.join(dataDir, 'export');
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) env.DATABASE_URL = process.env.TEST_DATABASE_URL;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status === 1 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try { return JSON.parse(res.stdout); } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}
function assert(cond, msg) { if (!cond) { console.error(`\nFAIL assertion: ${msg}`); process.exit(1); } }
const n = (v) => Number(v ?? 0);
const G = (...a) => ['grain.mjs', ...a];
const counts = (rows) => Object.fromEntries(rows.map((x) => [x.id, x.count]));
const ex = (f) => path.join(root, 'examples', f);

console.log(`smoke: ${env.DATABASE_URL ? 'Postgres' : 'embedded database in ' + dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the overview
  const stats = run('stats', G('stats'));
  assert(stats.open_purchases === 6 && stats.open_sales === 4 && stats.stock_t === 466.8 && stats.unsettled_loads === 8, `book ${JSON.stringify(stats)}`);
  assert(stats.compliance_breaches === 12 && stats.short.length === 1 && stats.short[0].grade === 'CAN1' && stats.short[0].net_t === -180, `rules and position ${JSON.stringify(stats)}`);
  const pos = run('position', G('position'));
  assert(n(pos.find((p) => p.grade === 'APW1').net_t) === 250.3 && n(pos.find((p) => p.grade === 'BAR1').stock_t) === 82.7, 'APW1 long 250.3 t, 82.7 t BAR1 in store');
  const mtm = run('marked to market', G('mtm'));
  assert(mtm.rows.find((r) => r.what === 'PC-0001').mtm_cents === -194150, `Hollis 176.5 t bought at $365, cash $354 (${mtm.rows.find((r) => r.what === 'PC-0001').mtm_cents})`);
  const book = run('open contracts', G('contracts'));
  assert(book.length === 10 && book.find((c) => c.number === 'PC-0005').flag.includes('72.6 t short'), 'Murray Plains is 72.6 t short');
  const card = run('contract card by grower name', G('contract', 'murray'));
  assert(card.loads.length === 4 && card.notes.length === 1, 'PC-0005 has four loads and a note');
  run('unknown contract exits 1', G('contract', 'XC-9999'), { json: false, expectFail: true });
  run('ambiguous org lists and exits 1', G('org', 'Farm'), { json: false, expectFail: true });
  const doyle = run('org by part name, any case', G('org', 'doyle'));
  assert(doyle.contracts.length === 1 && doyle.documents.length === 1, 'Doyle has one contract and one RCTI');
  const val = run('buyer card', G('org', 'Valley'));
  assert(n(val.exposure.owing_cents) + n(val.exposure.uninvoiced_cents) > n(val.exposure.credit_limit_cents), 'Valley Feedlot is over its limit');

  // ---- compliance and attention
  const c0 = counts(run('compliance', G('compliance')));
  assert(c0.R1 === 2 && c0.R2 === 3 && c0.R3 === 1 && c0.R4 === 1 && c0.R5 === 1 && c0.R6 === 1 && c0.R7 === 2 && c0.R8 === 1, `compliance counts ${JSON.stringify(c0)}`);
  const att = run('attention', G('attention'));
  assert(att[0].area === 'rules' && att.some((a) => a.area === 'money' && /credit limit/.test(a.what)) && att.some((a) => a.area === 'position' && a.who === 'CAN1 2026-27'), 'rules first, the credit limit and the short');
  const q = run('quality', G('quality'));
  assert(q.length === 2 && q.find((x) => x.ticket === 'T10012').fits_grade === 'ASW1', 'T10012 fits ASW1');

  // ---- weighbridge gates
  run('out-turn to a buyer over its credit limit is refused', G('ticket', '--contract=SC-0002', '--gross=62000', '--tare=21000'), { json: false, expectFail: true });
  run('out-turn of grain not in store at that site is refused', G('ticket', '--contract=SC-0003', '--site=NB', '--gross=62000', '--tare=21000'), { json: false, expectFail: true });
  run('more APW1 out than is in store is refused', G('ticket', '--side=out', '--org=Southern', '--grade=APW1', '--site=MG', '--gross=99000', '--tare=20000'), { json: false, expectFail: true });
  run('gross not more than tare is refused', G('ticket', '--contract=PC-0001', '--gross=20000', '--tare=20900'), { json: false, expectFail: true });
  run('a ticket recorded twice is refused', G('ticket', 'T10001', '--contract=PC-0001', '--gross=62000', '--tare=20900'), { json: false, expectFail: true });
  const dry = run('ticket dry run', G('ticket', '--contract=PC-0001', '--gross=62000', '--tare=20900', '--variety=Stockade', '--cvd', '--protein=11', '--moisture=11', '--dry-run'));
  assert(dry.dry_run && dry.net_t === 41.1 && dry.warnings.length === 0, `clean dry run ${JSON.stringify(dry)}`);
  const heavy = run('record a load, overweight and off spec', G('ticket', 'T10050', '--contract=PC-0001', '--gross=63800', '--tare=21000', '--limit=62500', '--protein=10.1', '--variety=Stockade', '--cvd'));
  assert(heavy.warnings.some((w) => /over the declared/.test(w)) && heavy.warnings.some((w) => /fails APW1/.test(w)), 'warns on mass and spec');
  run('regrade the new load', G('regrade', 'T10050'));

  // ---- fix what holds settlements, then settle
  const rg = run('regrade T10012 to what it fits', G('regrade', 'T10012'));
  assert(rg.to === 'ASW1' && rg.price_after === 35300, `regraded price ${JSON.stringify(rg)}`);
  run('regrade T10016', G('regrade', 'T10016'));
  run('record the CVD', G('cvd', 'T10019'));
  run('declare the variety', G('variety', 'T10015', 'Summit', 'Malt'));
  run('confirm PC-0007 from the broker note', G('confirm', 'PC-0007', '--on=-12'));
  const c1 = counts(run('compliance after fixes', G('compliance')));
  assert(c1.R4 === 0 && c1.R5 === 0 && c1.R6 === 0 && c1.R7 === 0, `fixed ${JSON.stringify(c1)}`);
  const srDry = run('settle-run dry run', G('settle-run', '--dry-run'));
  assert(srDry.settlements.length === 5 && srDry.held.length === 0, `five growers to settle (${srDry.settlements.length}), none held (${JSON.stringify(srDry.held)})`);
  const doyleRcti = srDry.settlements.find((s) => s.grower === 'Doyle Bros');
  assert(Math.abs(doyleRcti.gst_cents - doyleRcti.gross_cents * 0.1) <= 3 && Math.abs(doyleRcti.levy_cents - doyleRcti.gross_cents * 0.0102) <= 3, 'GST and levy on the RCTI');
  assert(run('dry run wrote nothing', G('settlements', '--status=draft')).length === 1, 'still only RCTI-0005 in draft');
  const sr = run('settle-run', G('settle-run'));
  assert(sr.settlements.length === 5, 'five RCTIs drafted');
  assert(run('settle-run again settles nothing twice', G('settle-run')).settlements.length === 0, 'nothing settled twice');
  run('issue refused without an RCTI agreement', G('issue', 'RCTI-0005'), { json: false, expectFail: true });
  run('record the RCTI agreement', G('rcti-agreement', 'Wendt', '--on=today'));
  run('issue RCTI-0005', G('issue', 'RCTI-0005'));
  const iss = run('issue a fresh RCTI', G('issue', sr.settlements[0].rcti));
  run('pay it', G('pay', iss.number));
  run('a paid RCTI cannot be issued again', G('issue', iss.number), { json: false, expectFail: true });
  const pay = run('payables', G('payables'));
  assert(pay.length > 0 && pay.every((p) => p.what.startsWith('RCTI')), 'only RCTIs left to pay');
  const lev = run('levy return this quarter', G('levies'));
  assert(lev.levies.length >= 2, 'levies by commodity');

  // ---- buyers
  const irDry = run('invoice-run dry run', G('invoice-run', '--dry-run'));
  assert(irDry.invoices.length === 2 && irDry.invoices.every((i) => i.gst_cents > 0), 'two sale invoices with GST');
  const ir = run('invoice-run', G('invoice-run'));
  assert(run('invoice-run again bills nothing twice', G('invoice-run')).invoices.length === 0, 'nothing invoiced twice');
  run('issue a sale invoice', G('issue', ir.invoices[0].invoice));
  run('overpaying is refused', G('pay', 'INV-0001', '999999'), { json: false, expectFail: true });
  const paid = run('Southern Mills pays INV-0001', G('pay', 'INV-0001'));
  assert(paid.owing_cents === 0, 'INV-0001 paid in full');
  const rec = run('receivables', G('receivables'));
  assert(rec.find((r) => r.name === 'Southern Mills Pty Ltd').overdue_cents === 0, 'Southern Mills no longer overdue');
  run('raise Valley Feedlot limit', G('credit', 'Valley', '80k'));
  const out = run('out-turn to Valley now goes', G('ticket', '--contract=SC-0002', '--gross=62000', '--tare=21000', '--cvd'));
  assert(out.net_t === 41, 'Valley load recorded');

  // ---- market
  const buy = run('buy canola to cover the short', G('add-contract', '--side=purchase', '--org=Hollis', '--grade=CAN1', '--tonnes=180', '--price=760', '--site=MG', '--confirmed'));
  assert(buy.position_after_t === 0, `canola flat after cover (${buy.position_after_t})`);
  run('a contract with a grower on the sale side is refused', G('add-contract', '--side=sale', '--org=Hollis', '--grade=APW1', '--tonnes=10', '--price=380'), { json: false, expectFail: true });
  run('post a price', G('post-price', 'APW1', '351', '--site=MG'));
  assert(n(run('prices', G('prices')).find((p) => p.grade === 'APW1').cents_per_t) === 35100, 'APW1 at $351');
  const mg = run('margin', G('margin'));
  assert(mg.find((m) => m.grade === 'APW1').margin_per_t_cents > 0, 'APW1 makes a margin');
  run('set the barley levy', G('commodity', 'BAR', '--levy=1.02'));
  run('log a note', G('log', 'PC-0005', 'Header back on Monday.'), { json: false });

  // ---- import, export, documents, views
  const imp1 = run('import organisations dry run', G('import', 'agridigital', ex('agridigital-organisations.csv'), '--kind=organisations', '--dry-run'));
  assert(imp1.added === 2 && imp1.unchanged === 1, `orgs dry run ${JSON.stringify(imp1)}`);
  run('import organisations', G('import', 'agridigital', ex('agridigital-organisations.csv')));
  const imp2 = run('import contracts', G('import', 'agridigital', ex('agridigital-contracts.csv'), '--kind=contracts'));
  assert(imp2.added === 2 && imp2.problems.length === 1, `contracts ${JSON.stringify(imp2)}`);
  const imp3 = run('import deliveries', G('import', 'agridigital', ex('agridigital-deliveries.csv'), '--kind=deliveries'));
  assert(imp3.added === 2 && imp3.problems.length === 1, `deliveries ${JSON.stringify(imp3)}`);
  assert(run('import again adds nothing', G('import', 'agridigital', ex('agridigital-deliveries.csv'), '--kind=deliveries')).added === 0, 'idempotent import');
  const exp = run('export', G('export', `--out=${exportDir}`));
  assert(exp.counts.deliveries >= 34 && existsSync(path.join(exportDir, 'contracts.csv')), 'export wrote the tables');
  run('documents', ['docs.mjs'], { json: false });
  assert(readdirSync(path.join(root, 'docs-out')).length >= 3, 'three document types rendered');
  run('views', ['view.mjs'], { json: false });
  assert(existsSync(path.join(root, 'views', 'week.html')), 'week view rendered');
  run('help', G('help'), { json: false });
  run('unknown command exits 1', G('nonsense'), { json: false, expectFail: true });
  console.log('\nPASS');
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
