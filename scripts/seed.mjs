#!/usr/bin/env node
// Loads supabase/seed.sql: Mallee Gate Grain Pty Ltd, a fictional grain accumulator and trader with
// growers, buyers, carriers and a broker, twelve contracts, thirty loads over the weighbridge, a week
// of cash prices, grower settlements and sale invoices. Dates are relative to today and every insert
// skips what is already there, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  const [c] = await db.query(`
    select (select count(*) from orgs) as orgs, (select count(*) from contracts) as contracts,
           (select count(*) from deliveries) as deliveries, (select count(*) from cash_prices) as prices,
           (select count(*) from settlements) as settlements, (select count(*) from invoices) as invoices`);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(`seed: ${n.orgs} growers, buyers and carriers, ${n.contracts} contracts, ${n.deliveries} loads, ${n.prices} cash prices, ${n.settlements} RCTIs, ${n.invoices} invoices`);
  } finally {
    await db.close();
  }
}
