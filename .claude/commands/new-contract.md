---
description: Record a new purchase from a grower or sale to a buyer: tonnes, grade, price, basis, site and window. Shows the position after it.
---

1. Get from the operator: buying or selling, who with, the grade, tonnes, price a tonne, basis (delivered site, free in store, port zone, FOB, delivered buyer), the site, the delivery window, payment terms, and whether a broker is on it.
2. Run `npm run grain -- add-contract --side=purchase|sale --org=<name> --grade=APW1 --tonnes=200 --price=365 --site=MG --from=<date> --to=<date> [--payment-days=14 --tolerance=5 --broker=<name> --brokerage=1 --export --season=2026-27]`.
   - `--export` marks a GST-free export sale.
   - Add `--confirmed` only if the written confirmation has already gone out or come back.
3. Say back the contract number and the position it leaves in that grade. If the position goes short, say so plainly.
4. Offer to draft the confirmation: /draft-confirmation. When it is signed or sent and not disputed: `npm run grain -- confirm <number> [--on=<date>]`.

If the counterparty is not on file, add them first: `npm run grain -- add-org "Name" --kind=grower|buyer --abn=.. --ngr=.. [--credit=250k]`.
