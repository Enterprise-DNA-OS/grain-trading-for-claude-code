---
description: Draft a payment reminder to a buyer with an overdue invoice, firm when it is more than 14 days late or they are over their limit.
---

1. Run `npm run grain -- receivables --json` and `npm run grain -- org <buyer> --json`.
2. Write `drafts/payment-<buyer>.md`: each overdue invoice with its number, date, amount and days late, the total, how to pay, and (if they are over their limit) that further out-turns wait until the account is under it.
3. Polite under 14 days. Firm and specific over 14 days. No threats the operator has not named.
4. Never send it. A person reads it and sends it.
