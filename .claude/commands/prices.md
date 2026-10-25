---
description: Post today's cash prices by grade and site, and show the latest posted with the change.
---

1. Post: `npm run grain -- post-price <grade> <dollars a tonne> [--site=MG --on=<date> --season=2026-27]`. Posting twice on one day replaces that day's price.
2. Show: `npm run grain -- prices`. Present by commodity with the move since the last posting.
3. If the operator gives a list ("APW1 352, ASW1 335, BAR1 322"), post each one, then show the table once.
