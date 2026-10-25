---
description: Record a truck over the weighbridge, in from a grower or out to a buyer: gross, tare, quality results, variety, vendor declaration and the declared mass limit.
---

1. Get the ticket details from the operator (or the weighbridge ticket they paste): ticket number, contract, gross and tare in kg, moisture, protein, screenings, test weight or oil, the variety, the truck rego, the carrier, the declared mass limit, and whether the commodity vendor declaration came with the load.
2. Dry run: `npm run grain -- ticket <ticket> --contract=PC-0001 --gross=62100 --tare=20900 --moisture=11 --protein=11.2 --screenings=2.1 --tw=78 --variety=<name> --rego=<rego> --limit=62500 [--cvd] [--carrier=<name>] [--on=<date>] --dry-run`.
3. Read back the net tonnes and every warning: over the mass limit, fails the grade spec (and what it fits), no vendor declaration, no variety, past the contract's tonnes plus tolerance, contract not confirmed.
4. On a yes, run it without `--dry-run`.

The CLI refuses, and you never work around it: a load out-turned to a buyer at or over their credit limit (`--force` only when the operator gives the reason, recorded in `--notes`), more grain out than is in store at that site, gross not above tare, a ticket already recorded, a load on the wrong side of its contract.

A truck over its declared limit: record it as weighed and follow the site's overload procedure. Never change the weights.
