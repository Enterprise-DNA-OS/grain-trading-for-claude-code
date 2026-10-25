---
description: The Monday review, written from three commands: the book in numbers, what needs a decision, and the position against today's prices.
---

Run these three and write the review from what they return. Nothing they do not support goes in.

```
npm run grain -- stats
npm run grain -- attention
npm run grain -- mtm
```

Then, no more than a page:

1. **The week in one line.** Tonnes in store, loads over the weighbridge, growers owed, buyers owing and how much is overdue.
2. **Rules.** Every compliance breach with the load and the fix. These lead because they are the business's risk with the tax office, the levy return, the breeders and the regulator.
3. **Position.** Each grade long or short, and what the book is worth at today's cash prices. Name the biggest loss and the biggest gain.
4. **Growers.** Contracts short or closing, RCTIs to raise and pay.
5. **Buyers.** Who is over their limit, who is overdue and by how much.
6. **Five things to do this week**, from the attention list, with why each made it.
7. **One thing to decide.** The single item that needs the principal, not the office.

`npm run view -- week`, `npm run view -- position` and `npm run view -- money` render the same numbers as printable pages.
