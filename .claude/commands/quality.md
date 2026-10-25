---
description: Loads whose quality results fail the spec of the grade they were received or out-turned at, what they fit instead, and regrading them.
---

1. Run `npm run grain -- quality`.
2. For each load: the grade it was recorded at, what fails (protein, moisture, screenings, test weight, oil) and the best grade it fits.
3. Offer to regrade: `npm run grain -- regrade <ticket>` (to the grade it fits) or `--to=<grade>`. The price moves by the spread between the grades. Say the old and new price a tonne.
4. A load already on an issued RCTI or invoice cannot be regraded here. Say so: it needs an adjustment note, and the operator decides.
5. If the grade specs themselves look wrong for this season, show `npm run grain -- grades` and change them with /customise.
