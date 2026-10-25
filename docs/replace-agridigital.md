# Moving off AgriDigital

A day or two for one person, done in this order. Keep AgriDigital running until a full contract book, the position and one settlement run from this system match it, load by load.

## 1. Set up the business

Short lists, quicker to enter by asking Claude Code than to export:

- **Settings.** Business name, ABN, the RCTI window, default payment terms and contract tolerance: `npm run grain -- settings --name=".." --abn=".." --rcti-days=28 --payment-days=14 --tolerance=5`.
- **Sites.** Each of your sites, bunkers and the port or buyer sites you deliver to, with a short code.
- **Commodities and grades.** Each commodity with its levy rate, and each grade with its spec (protein, moisture, screenings, test weight, oil) and its spread to the top grade. Load the season's receival standards; the demo specs are illustrative.
- **Varieties.** Each variety you receive and its end point royalty a tonne, from the EPR managers' rate lists.

## 2. Export from AgriDigital

AgriDigital says it makes it easy to export all your data in a CSV file. Export three reports, in this order:

1. **Organisations report.** Your connected organisations with their unique ID, legal name, ABN or NGR, address, credit limits and notes.
2. **Open contracts.** One row per contract: number, purchase or sale, counterparty, grade, season, tonnes, price, basis, site, the delivery window and the acceptance date.
3. **Purchase deliveries and sale deliveries.** One row per load: ticket, contract, date, site, grade, variety, weights, quality results and whether the vendor declaration was received.

Report layouts vary by site and by what your account has switched on. We have matched the importer to the column names AgriDigital and other grain systems use (below); a column under a different name is mapped by asking Claude Code.

## 3. Import

```
npm run grain -- import agridigital organisations.csv --kind=organisations --dry-run
npm run grain -- import agridigital organisations.csv --kind=organisations
npm run grain -- import agridigital contracts.csv --kind=contracts
npm run grain -- import agridigital deliveries.csv --kind=deliveries
```

The dry run writes nothing and reports every row it could not read. Running an import twice is harmless: an organisation, contract or ticket already here is matched and left alone. The `examples/` folder has one file of each kind to try first.

## What maps

| AgriDigital column (any of) | Here |
|---|---|
| Legal Name, Organisation, Name | `orgs.name` |
| Unique ID, ID, Organisation ID | `orgs.external_ref` |
| Type, Role (grower, buyer, carrier, broker) | `orgs.kind` |
| ABN, NGR, GST Registered, Credit Limit, Email, Phone, Address | the same fields on `orgs` |
| Contract No, Contract Number | `contracts.number` |
| Contract Type (purchase, sale) | `contracts.side` |
| Counterparty, Grower, Buyer | the organisation on the contract |
| Grade, Season, Tonnes, Price ($/t), Price Basis, Site | the same fields on `contracts` |
| Delivery Start, Delivery End, Accepted Date | `delivery_from`, `delivery_to`, `confirmed_on` |
| Ticket No, Docket, Delivery No | `deliveries.ticket` |
| Gross (kg), Tare (kg), or Net (mt) | `gross_kg`, `tare_kg` (a net-only row is stored as gross with no tare) |
| Moisture %, Protein %, Screenings %, Test Weight, Oil % | the quality results on the load |
| Variety, CVD Received | `variety_id`, `cvd_received` |

## What does not carry over

- **Settled loads and their RCTIs.** Old RCTIs stay in AgriDigital and your accounts. Import open contracts and the loads not yet settled; run the first settle run here.
- **Cash price history.** Post today's prices and carry on (`npm run grain -- post-price`).
- **The grower portal, NGR and NHVR connections, and the Xero export.** They are integrations, not records. Enterprise DNA builds the ones you use into your version.
- **Funding through Digital Commodity Finance.** That is AgriDigital's partnership, not a record.

## 4. Check before you switch

- `npm run grain -- contracts` against AgriDigital's Open Contracts and Inventory report.
- `npm run grain -- position` and `npm run grain -- stock` against its position and inventory.
- `npm run grain -- settle-run --dry-run` against the RCTIs AgriDigital would raise for the same loads. Levy and royalty should match to the cent.
- `npm run grain -- compliance`: anything it finds was already true in AgriDigital.
