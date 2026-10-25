---
description: Bring growers, buyers, contracts and loads across from AgriDigital (or any grain system) from its report exports saved as CSV.
---

1. Read `docs/replace-agridigital.md` with the operator: which reports to export and in what order (organisations, then contracts, then deliveries).
2. Make sure the sites, commodities and grades on the export exist here (`npm run grain -- grades`); add missing ones with /customise.
3. Dry run each file: `npm run grain -- import agridigital <file.csv> --kind=organisations|contracts|deliveries --dry-run`. It writes nothing and lists every row it could not read.
4. If the columns are named differently, map them: compare the header to the names in the guide, then rename the header in a copy or extend the `pick(...)` lists in `scripts/grain.mjs` (`importCmd`).
5. Import for real. Running it twice changes nothing.
6. Check: `npm run grain -- contracts` against AgriDigital's open contracts report, and `npm run grain -- position` against its position, before the first settle run.
