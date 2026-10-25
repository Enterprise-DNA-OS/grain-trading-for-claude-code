---
description: What we owe growers and by when: issued RCTIs not yet paid, and loads received with no RCTI yet, in pay-by order.
---

1. Run `npm run grain -- payables`.
2. Present in pay-by order. Lead with anything already late, then what falls due this week.
3. Loads with no RCTI yet show the grain value before GST and deductions: run /settle-run to turn them into RCTIs.
4. Never mark anything paid from here unless the operator says the payment has gone: `npm run grain -- pay <RCTI>`.
