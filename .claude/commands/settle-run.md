---
description: Draft RCTIs for every load received and not settled, one per grower, with GST, the levy and the end point royalty taken off. Holds back any load that is not ready, and says why.
---

1. Dry run first: `npm run grain -- settle-run --dry-run [--grower=<name>]`. It writes nothing.
2. Present the drafts by grower: loads, tonnes, grain value, GST, levy, royalty, the amount to pay and the pay-by date.
3. Present every held load and what clears it: no vendor declaration (`grain cvd <ticket>` once it is in hand), no variety (`grain variety <ticket> <variety>`), fails its grade (`grain regrade <ticket>`), contract not confirmed (`grain confirm`), no RCTI agreement in force, grower not GST registered or no ABN (they invoice you instead).
4. On a yes: `npm run grain -- settle-run`. Running it twice never settles a load twice.
5. Then /rcti to issue them.
