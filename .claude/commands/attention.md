---
description: Everything that wants a decision today, worst first: rules breached, buyers over their limit or overdue, growers owed money, contracts short after their window closed, positions short, drafts waiting.
---

1. Run `npm run grain -- attention`.
2. Read it in order:
   - **Rules** first. Each line breaks a rule in `docs/compliance.md`: an RCTI with no agreement in force, an RCTI late or still to raise, a levy not withheld, a load with no vendor declaration or no variety, a contract with loads and no written confirmation, a load that fails its grade, a truck over its mass limit. Say which load or document, and the one thing that clears it.
   - **Money.** Buyers over their credit limit (hold out-turns), buyer invoices overdue, RCTIs past their pay-by date, loads past their pay-by date with no RCTI, RCTIs drafted and not issued.
   - **Contracts.** Purchase contracts short after the window closed, contracts with no written confirmation.
   - **Position.** Any grade sold beyond what is in store and bought.
   - **Coming up.** Delivery windows closing in the next 14 days with tonnes still to come.
3. For each item give the action and who owns it (the trading desk, the site, accounts).
4. Anything that needs a letter or email is drafted to `drafts/`, never sent.

If the operator asks "what should I do today", pick the top three and say why those three.
