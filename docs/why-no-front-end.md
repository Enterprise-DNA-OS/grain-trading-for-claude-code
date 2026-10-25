# Why there is no front end

AgriDigital is a database with a subscription. The tables underneath it are ordinary: growers and buyers, contracts, loads off the weighbridge, cash prices, settlements and invoices. What you pay for is the layer on top that lets the desk find a contract, a load or a balance without writing a query. Screens, filters, dashboards, a grower portal.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, ask "which growers are short on their contracts?" or "what is the book worth at today's prices?", and it runs the query and answers. Ask a question the vendor never built a report for and you still get an answer.

## What you gain

- **Better answers.** Your own questions, in your own words, against your own records.
- **No volume pricing.** The bill does not grow with the tonnes you trade.
- **Your data in your own database.** Back it up, query it from anything, leave any time.
- **Your rules.** Grade specs, levy rates, royalties, payment terms, credit limits: change them by asking.

## What a screen gives that this does not

- **A grower portal.** Growers logging in to see their own loads and RCTIs is a front end on these tables.
- **The weighbridge connection.** Here a load is recorded from the ticket. Reading the scale head directly is an integration.
- **Connections to the industry registers.** NGR lookups, ABN lookups and NHVR data are connections a vendor maintains.
- **A phone at the site.** It runs where Claude Code runs. A site operator recording loads at the pit wants an app.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

Every one of these can be built on top of the same database. That is what Enterprise DNA does when a business wants it: https://enterprisedna.co/omni/instead-of/agridigital
