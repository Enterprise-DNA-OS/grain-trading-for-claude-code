---
description: The levy return and royalty remittance: levies and end point royalties withheld on RCTIs issued in a quarter, by commodity and by variety, against the rate.
---

1. Run `npm run grain -- levies --quarter=2026-Q4` (or `--from=<date> --to=<date>`; with nothing it is the quarter to date).
2. Present levies by commodity: tonnes, value, levy withheld, and the levy at the rate. Any gap is levy still owed on the return: name the RCTI and load behind it (`npm run grain -- compliance` rule R3).
3. Present royalties by variety for each EPR manager. A row "not declared" means loads with no variety: they need declaring before the remittance.
4. Check the rates are current before lodging: `npm run grain -- commodity WHT` shows the rate; set it with `--levy=1.02` (percent). The source is in `docs/compliance.md`.
