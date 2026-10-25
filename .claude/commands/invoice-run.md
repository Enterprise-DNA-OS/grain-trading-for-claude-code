---
description: Draft one sale invoice per buyer for every load out-turned and not yet invoiced, priced off the contract and the grade spread, GST added unless the contract is an export sale.
---

1. Dry run first: `npm run grain -- invoice-run --dry-run`. It writes nothing. Present the drafts by buyer.
2. On a yes: `npm run grain -- invoice-run`. Running it twice never invoices a load twice.
3. Look at one: `npm run grain -- invoice <INV>`. Issue it: `npm run grain -- issue <INV>`. Issuing sets the due date; it sends nothing.
4. Render for sending: `npm run docs -- tax-invoice`. A person sends them.
5. Payment in: `npm run grain -- pay <INV> [amount including GST] [--on=<date>]`. With no amount it records the balance as paid.
