# Changelog

## v0.1.0 (2026-11-17)

The first release: table rate shipping for Adobe Commerce as a Cloud Service and PaaS, built as an App Builder app.

- **Rate engine:** one dependency-free module (`src/common/rates/engine.js`) shared by the webhook, the Admin actions and the Admin page. Conditions on country, region, postcode (exact, wildcard, range and exclusion), weight, subtotal (before or after discounts), quantity, SKU and product attribute; prices per order, per item, per weight unit (with a rounding step) and percent of subtotal; first, cheapest or highest matching row; handling fee and percent, minimum and maximum, free shipping threshold and cart-rule free shipping; store views and customer groups ([docs/rate-tables.md](docs/rate-tables.md)).
- **Shipping webhook:** the `shipping-table-rates/shipping-rates` action answers Commerce's out-of-process shipping method webhook with one method per matching rate. It verifies Commerce's RSA-SHA256 webhook signature, rejects anything unsigned, and never breaks checkout: errors give the fallback rate or no table rates ([docs/webhook.md](docs/webhook.md)).
- **Admin page:** list, start from examples, edit and delete methods in the Commerce Admin (Admin UI SDK, React Spectrum 2); a rate table editor with row reordering, CSV import (replace or append, with Magento table rate headers) and export; and **Quote a cart**, which prices any cart with the same engine as checkout and explains why methods weren't offered.
- **App Management:** settings for the master switch, carrier code and title, weight unit and fallback rate; install steps that set up App Builder Database Storage and register the out-of-process carrier; webhook subscriptions for SaaS and PaaS.
- **Methods in code:** `SHIPPING_METHODS` serves methods from `.env` instead of the database.
- **Local Admin preview:** `npm run admin:preview` serves the real Admin page at http://localhost:4344/preview.html with an in-browser store, without Commerce, App Builder or an Adobe account.
