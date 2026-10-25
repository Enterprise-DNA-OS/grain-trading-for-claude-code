<h1 align="center">Grain Trading for Claude Code</h1>

<p align="center">
  <strong>The open-source grain trading and storage system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your AgriDigital data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=agridigital">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/agridigital?utm_source=github&utm_medium=readme&utm_campaign=agridigital">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-agridigital">Instead of AgriDigital</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Grain Trading for Claude Code does the job you pay AgriDigital for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the AgriDigital dashboard cannot.

AgriDigital publishes no price for traders, site operators or brokers: it says pricing is customised on trade volumes, data requirements and support needs, so the bill grows with the tonnes you move (agridigital.io FAQ, checked 25 October 2026). This costs nothing, or a setup fee and a retainer if Enterprise DNA runs it for you.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=agridigital).

It is built for an Australian grain trader, accumulator, broker or private storage site moving a few thousand to a few hundred thousand tonnes a year: growers with their NGR, ABN and RCTI agreement, buyers with a credit limit, carriers and brokers; purchase and sale contracts with tonnes, tolerance, grade, price, basis and window; loads over the weighbridge with gross, tare, quality results, variety and the vendor declaration; the cash prices you post; the position and what it is worth today; grower settlements on recipient created tax invoices with GST added and the levy and end point royalty withheld; sale invoices; and the levy return. The words are the words a grain desk already uses.

**Nothing sends or talks to another system on its own.** Contract confirmations, RCTIs, invoices and reminders are drafted here and a person sends them. The gates are real, though: a load out-turned to a buyer at their credit limit is refused, so is more grain out than is in store at that site, a weighbridge ticket recorded twice, and an RCTI issued with no RCTI agreement in force. The settle run holds back any load with no vendor declaration, no variety, a failed grade spec or an unconfirmed contract, and says why. Nothing is ever settled or invoiced twice.

```
/attention                 everything that wants a decision, worst first
/weighbridge               record a load: weights, quality, variety, vendor declaration, mass limit
/contracts                 the contract book: delivered, open, short, unconfirmed
/position                  stock plus open purchases less open sales, long or short by grade
/mtm                       the book marked to today's cash prices
/settle-run                draft RCTIs with GST, levy and royalty, holding back loads that are not ready
/invoice-run               draft sale invoices for every load out-turned
/compliance                eight rules: RCTI agreements and the 28 days, levies, vendor declarations, varieties, confirmations, grade specs, truck mass
/weekly-review             the Monday review, written from three commands
```

Every price on a load reads one view, `delivery_values`: the contract price moved by the spread between the grade it came in at and the contract grade. The position, the settlement run, the invoice run and the margin can never disagree about what a load is worth.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats and no volume pricing: the bill does not grow with the tonnes you trade. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/grain-trading-for-claude-code.git
cd grain-trading-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database and loads Mallee Gate Grain (a made-up accumulator and trader with its own site and a bunker, eight growers, four buyers, twelve contracts and thirty loads a month into harvest; with a grower settled with no RCTI agreement and another after theirs ended, a load 34 days with no RCTI, a wheat load settled with no levy, a load with no vendor declaration, a barley load with no variety, deliveries on a contract done on the phone and never confirmed, a load received as APW1 at 9.8% protein, barley at 13.1% moisture, a truck 1,600 kg over its declared limit, a grower 72 tonnes short after the window closed, a feedlot over its credit limit, a mill invoice 15 days overdue, and canola sold 180 tonnes past what is bought), then prints the book in six lines, the position and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/position`, `/mtm`, `/settle-run`, `/receivables`, `/quality`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), put your name, logo and colours in [brand.json](brand.json), and set your rules (`npm run grain -- settings --abn=.. --rcti-days=28`, each commodity's levy and each grade's spec) so the RCTIs, invoices and checks carry them.

## Your first hour: ten things to ask for

1. "What needs attention today?"
2. "Here is this morning's weighbridge ticket." (paste it)
3. "Today's prices: APW1 352, ASW1 335, BAR1 322, canola 768."
4. "Where are we long and short, and what is the book worth at today's prices?"
5. "Which growers are behind on their contracts?"
6. "Run the grower settlements, dry run first."
7. "Who owes us money, and is anyone over their limit?"
8. "Draft the confirmation for the Ridgeway malt barley contract."
9. "What levy and royalties do we owe for this quarter?"
10. "Bring in this AgriDigital contracts export."

## Ten questions answered from your own records

Every one is a real command or query on the demo data today.

1. Which grades are we short, and by how many tonnes? (`position`)
2. What is every open contract and the stock in store worth at today's cash prices? (`mtm`)
3. Which growers are short on a contract after the delivery window closed, and by how much? (`contracts`, `attention`)
4. Which loads are ready to settle, and which are held back and why? (`settle-run --dry-run`)
5. Which RCTIs went to growers with no RCTI agreement in force, or more than 28 days after the load? (`compliance` R1 and R2)
6. Which settled loads had no levy withheld, and how much is still owed on the return? (`compliance` R3, `levies`)
7. Which loads failed the spec of the grade they were paid at, and what grade do they fit? (`quality`)
8. Which buyers are over their credit limit once you count loads out-turned and not invoiced? (`receivables`)
9. What margin did we make a tonne on each grade we sold, after freight? (`margin`)
10. Which trucks crossed our weighbridge over the mass limit their driver declared? (`compliance` R8)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-tonne or per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: rules, money, contracts, the position, what is coming up. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/weighbridge` | Record a load in or out, with the gates and warnings. |
| `/quality` | Loads that fail their grade, what they fit, and regrading them. |
| `/contracts` | The contract book; one contract in full; close or cancel one. |
| `/new-contract` | Record a purchase or a sale and see the position after it. |
| `/position` | Stock, bought to come, sold to go, net long or short by grade. |
| `/mtm` | Every open contract and the stock marked to today's cash prices. |
| `/prices` | Post today's cash prices and see the moves. |
| `/margin` | The trading margin a tonne by grade, after freight. |
| `/who` | One grower, buyer, carrier or broker in full; add one; record an RCTI agreement or a credit limit. |
| `/settle-run` | Draft RCTIs for every load ready to settle, with GST, levy and royalty. |
| `/rcti` | List, show, issue and pay RCTIs. Issuing is refused without an agreement in force. |
| `/payables` | What we owe growers and by when. |
| `/invoice-run` | Draft sale invoices for every load out-turned. |
| `/receivables` | What buyers owe against their credit limits. |
| `/levies` | Levies and royalties withheld in a quarter, against the rate. |
| `/compliance` | Eight rules checked against the records, each with its source. |
| `/documents` | RCTIs, tax invoices and contract confirmations in your brand. |
| `/view` | The week, the position and money dashboards as printable pages. |
| `/new-view` | Add a dashboard in plain language. |
| `/draft-confirmation` | Draft the written contract confirmation. |
| `/draft-delivery-chase` | Draft a note to a grower behind on a contract. |
| `/draft-payment-reminder` | Draft a reminder to a buyer with an overdue invoice. |
| `/import` | Bring organisations, contracts and loads across from AgriDigital exports. |
| `/export` | Every table to CSV. |
| `/log` | A dated note on a grower, buyer or contract. |
| `/customise` | Change a field, a rule, a grade or a rate in plain language. |

Every command is a short recipe over one CLI: `npm run grain -- help` lists it all.

## Instead of AgriDigital

Set up your sites, grades, levy rates and varieties by asking for them, export the Organisations report, your open contracts and your deliveries from AgriDigital as CSV, then:

```
npm run grain -- import agridigital organisations.csv --kind=organisations --dry-run
npm run grain -- import agridigital organisations.csv --kind=organisations
npm run grain -- import agridigital contracts.csv --kind=contracts
npm run grain -- import agridigital deliveries.csv --kind=deliveries
```

Put the contract book next to AgriDigital's Open Contracts and Inventory report, and a dry run of the settle run next to the RCTIs it would raise, before you switch. The full guide, what maps and what does not: [docs/replace-agridigital.md](docs/replace-agridigital.md). The rules the compliance check uses, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
grain-trading-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/grain.mjs         the one CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis, the compliance rules and the AgriDigital guide
  documents.json, views.json  the paperwork and dashboards, as SQL
  examples/                 one AgriDigital-style export of each kind, to try the import
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Grain Trading for Claude Code for your business, migrates your AgriDigital data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=agridigital)
- Read more: [enterprisedna.co/omni/instead-of/agridigital](https://enterprisedna.co/omni/instead-of/agridigital?utm_source=github&utm_medium=readme&utm_campaign=agridigital)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
