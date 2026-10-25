---
description: Mark the book to today's cash prices: every open contract and the stock in store, gain or loss against our price.
---

1. Check the prices are today's: `npm run grain -- prices`. If they are stale, ask for today's numbers and post them first: `npm run grain -- post-price <grade> <$/t> [--site=MG]`.
2. Run `npm run grain -- mtm`.
3. Present the total, then the three biggest losses and the three biggest gains, with the contract, the tonnes and the price gap.
4. Stock is marked against its average buy price, so a loss on stock is grain bought above today's market.

This marks to the cash prices the business posts. It is a desk number, not an accounting valuation.
