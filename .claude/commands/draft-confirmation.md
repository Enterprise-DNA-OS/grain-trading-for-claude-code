---
description: Draft the written contract confirmation for a purchase or sale: the parties, grade, tonnes, tolerance, price and basis, the window, payment terms and the trade rules that apply.
---

1. Run `npm run grain -- contract <number> --json` and `npm run grain -- org <counterparty> --json`.
2. Render the confirmation page: `npm run docs -- contract-confirmation <contract id prefix>`, and write a short covering note in `drafts/confirmation-<number>.md`: what was agreed, on what date, and that they should check it now and say straight away if anything differs.
3. Use only the terms on the contract. If a term the operator mentions is not on it (a quality premium, a different window), stop and ask them to update the contract first.
4. Never send it. When the signed copy comes back, or it has gone out and nothing is disputed: `npm run grain -- confirm <number> --on=<date>`.
