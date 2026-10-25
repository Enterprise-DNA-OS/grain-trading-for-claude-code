---
description: The contract book: open purchase and sale contracts with tonnes delivered, tonnes open, the price and the window, and any contract short or unconfirmed.
---

1. Run `npm run grain -- contracts` (add `--side=purchase` or `--side=sale`, `--org=<name>`, `--commodity=WHT`, `--season=2026-27`, or `--all` for completed and cancelled ones).
2. Present purchases and sales separately. Lead with any contract flagged short after its window or not confirmed.
3. For one contract in full (its loads, what is settled or invoiced, notes): `npm run grain -- contract <number or name>`.
4. When a contract is filled within tolerance and every load is settled or invoiced, offer to close it: `npm run grain -- complete <number>`. A contract called off: `npm run grain -- cancel <number>`.
