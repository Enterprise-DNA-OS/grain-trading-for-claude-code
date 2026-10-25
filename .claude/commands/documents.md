---
description: Render the paperwork from the records in the business's brand: RCTIs, sale tax invoices and contract confirmations, as printable pages.
---

1. Check `brand.json` has the business name, logo and colours. If not, ask for them and fill it in.
2. Render: `npm run docs` (everything), or one type: `npm run docs -- rcti`, `npm run docs -- tax-invoice`, `npm run docs -- contract-confirmation`. Add a record id prefix to render one.
3. Files land in `docs-out/<type>/`. Open one and check it before anyone sends it. Print to PDF from the browser.
4. Drafts are marked DRAFT, NOT ISSUED on the page. Issue first (/rcti, /invoice-run) for the final version.

To add a document type or a field on one, edit `documents.json` (or ask with /customise).
