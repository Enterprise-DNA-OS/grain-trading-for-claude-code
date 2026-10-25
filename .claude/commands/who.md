---
description: One grower, buyer, carrier or broker in full: details, NGR and ABN, RCTI agreement or credit limit, contracts, recent loads, RCTIs or invoices, notes. Add or change one.
---

1. Run `npm run grain -- org <name, code or NGR>`. If the name matches more than one, the CLI lists them: ask which.
2. Present: who they are, their RCTI agreement (growers) or their credit position (buyers), open contracts, the last loads, what is owed either way, and the notes.
3. Changes:
   - New: `npm run grain -- add-org "Name" --kind=grower|buyer|carrier|broker [--abn --ngr --credit=250k --email --phone --rcti-agreed=<date>]`.
   - RCTI agreement signed: `npm run grain -- rcti-agreement <grower> --on=<date> [--ends=<date>]`. Only record an agreement the operator has seen signed.
   - Credit limit: `npm run grain -- credit <buyer> <amount>`.
4. The full list: `npm run grain -- orgs [--kind=grower]`.
