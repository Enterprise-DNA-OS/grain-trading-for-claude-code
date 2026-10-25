---
description: What buyers owe us against their credit limits: invoiced, overdue, out-turned and not invoiced, and who is over their limit.
---

1. Run `npm run grain -- receivables`.
2. Lead with any buyer over their limit: out-turns to them are refused until they pay or the limit is raised (`npm run grain -- credit <buyer> <amount>`, only on the operator's say).
3. Then overdue invoices, oldest first. More than 14 days late is a phone call; draft the reminder with /draft-payment-reminder.
4. List of invoices: `npm run grain -- invoices [--status=issued]`.
