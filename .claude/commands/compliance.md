---
description: Check the records against the rules a grain trader works under (RCTI agreements and the 28 days, levies, vendor declarations, varieties for royalties, contract confirmations, grade specs, truck mass) and report every breach with the rule cited.
---

1. Run `npm run grain -- compliance`. Each rule, its source and what a breach looks like are in `docs/compliance.md`.
2. Report as a table: rule, count, the worst example (load or document and detail), the source. Breached first.
3. For each breach give the fix the operator can approve: the agreement to get signed, the RCTI to raise (/settle-run), the levy adjustment, the declaration or variety to record, the confirmation to send (/draft-confirmation), the load to regrade (/quality), the overload to report to the carrier.
4. If a rule in `docs/compliance.md` does not match how this business trades (a different RCTI determination, another levy rate, a state mass scheme), say so and stop. The operator confirms the rule, then you update the setting or the doc and the check together.

Nothing here is legal or tax advice. The doc records the rules the operator has told the system to enforce, with sources, and this command checks the data against them.
