# Grain Trading for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing, what is wrong, what is late | `/attention` |
| The Monday review | `/weekly-review` |
| A truck over the weighbridge, a ticket to record | `/weighbridge` |
| A load off spec, a regrade | `/quality` |
| Contracts: what is open, short, unconfirmed; one contract | `/contracts` |
| A new purchase or sale | `/new-contract` |
| Long or short, what is in store | `/position` |
| What the book is worth today | `/mtm` |
| Today's cash prices | `/prices` |
| Margin a tonne | `/margin` |
| One grower, buyer, carrier or broker; a new one; an RCTI agreement; a credit limit | `/who` |
| Grower settlements to raise | `/settle-run` |
| An RCTI to show, issue or mark paid | `/rcti` |
| What we owe growers | `/payables` |
| Sale invoices to raise, issue or mark paid | `/invoice-run` |
| Who owes us, credit limits | `/receivables` |
| The levy return, royalties | `/levies` |
| Are we compliant | `/compliance` |
| RCTIs, invoices, confirmations to print | `/documents` |
| A dashboard | `/view`, `/new-view` |
| A contract confirmation | `/draft-confirmation` |
| A grower behind on a contract | `/draft-delivery-chase` |
| A buyer behind on paying | `/draft-payment-reminder` |
| Data from AgriDigital | `/import` |
| All the data out | `/export` |
| A note on a grower, buyer or contract | `/log` |
| Change a field, a rule, a grade, a rate | `/customise` |

If an ask fits nothing here, run the CLI directly (`npm run grain -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never change a weighbridge weight or a quality result the ticket shows. A wrong load is regraded or noted, never rewritten.
- Never record a vendor declaration, a variety, an RCTI agreement or a contract confirmation you have not been shown. Say back what you recorded.
- Never issue an RCTI around a refusal from the CLI (no agreement in force, grower not GST registered, no ABN). Tell the operator what is needed.
- Never out-turn to a buyer over their credit limit with `--force` unless the operator gives the reason, and record it in `--notes`.
- Never issue RCTIs or invoices without a dry run the operator has seen in this session, and never record a payment the operator has not confirmed.
- Never decide what a contract allows (a wash-out, a default, a price difference). Quote the contract and the trade rules, or ask.

## Where things live

- `scripts/grain.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the compliance rules with their sources, and the guide for moving off AgriDigital.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/agridigital
