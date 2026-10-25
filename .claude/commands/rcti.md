---
description: RCTIs: list drafts and unpaid ones, show one, issue it, record it paid. Issuing is refused when the RCTI rules would be broken.
---

1. List: `npm run grain -- settlements [--status=draft|issued|paid]`. One in full: `npm run grain -- rcti <RCTI-0004>`.
2. Issue: `npm run grain -- issue <RCTI>`. The CLI refuses when there is no RCTI agreement in force with the grower, or the grower is not GST registered or has no ABN. Never work around it: record the agreement once the operator has it, or the grower invoices you instead.
3. If issuing warns the oldest load is past 28 days, say so. It is a breach to raise with the accountant, not hide.
4. Render it: `npm run docs -- rcti`. A person sends it to the grower.
5. Paid: `npm run grain -- pay <RCTI> [--on=<date>]`. Record a payment only once the operator says it has gone.
