# Architecture

```text
 Commerce Admin                          App Builder (I/O Runtime)                 Commerce checkout
 ┌──────────────────────────┐            ┌───────────────────────────────┐          ┌────────────────────────────┐
 │ Shipping Table Rates     │  IMS auth  │ ShippingTableRatesAdmin/*     │          │ Out-of-process shipping    │
 │ page (Admin UI SDK,      ├───────────►│ methods-list, method-save,    │          │ methods (carrier           │
 │ React Spectrum 2)        │            │ method-delete, lookups        │          │ "tablerates")              │
 │  ├ CSV import / export   │            └──────────────┬────────────────┘          └─────────────┬──────────────┘
 │  └ Quote a cart ─────────┼──┐                        │ App Builder Database                    │ signed rateRequest
 └──────────────────────────┘  │                        ▼ (shipping_methods)                      ▼
                               │         ┌───────────────────────────────┐   add "result"   ┌──────────────┐
                               │         │ shipping-table-rates/         │◄─────────────────┤  webhook     │
                               │         │ shipping-rates                ├─────────────────►│  response    │
                               │         │ verify → quote → respond      │                  └──────────────┘
                               │         └───────────────────────────────┘
                               │
                               └── src/common/rates/engine.js  (one module, imported by all three)
```

## One engine

`src/common/rates/engine.js` is plain ES2022 with no imports. The webhook, the Admin actions (validation) and the Admin page (**Quote a cart**) import it as `#engine`, a `package.json` subpath import, with types in `engine.d.ts`. The tester builds the same `rateRequest` Commerce sends and runs it through `normaliseRateRequest` and `quoteCart`, so a quote in the Admin is the price at checkout.

`src/common/rates/csv.js` (imported as `#csv`) reads and writes rate tables in the browser. The server never parses CSV: an import becomes rows in the editor, and only a save sends them, through the same validation as any other change.

## Data

| Collection | Holds | Kept for |
|---|---|---|
| `shipping_methods` | One document per method, keyed by `code` (unique index), with its rate rows embedded | Until deleted, or until the app is uninstalled |

Embedding the rows makes a save one atomic replace and a webhook read one query for all methods. A method can hold 5,000 rows. The webhook caches the list per warm container for 30 seconds, and every save clears that cache in the container that handled it, so changes reach checkout within a minute.

No shopper data is stored: carts are priced and forgotten.

## Security

- **Admin actions** use `require-adobe-auth: true`: only signed-in admins with the app's ACL reach them. Validation errors come back as a list; anything else is a generic 500 with details in the logs.
- **The webhook** uses `raw-http: true` and verifies Commerce's RSA-SHA256 signature on the exact raw body with the key the merchant configured. It fails closed: no key means no rates.
- **CSV export** prefixes cells that start with `=`, `+`, `-` or `@`, so a rate table can't carry spreadsheet formulas.
- **Codes and numbers** are validated before anything is stored: method codes match `^[a-z0-9_]{1,40}$`, countries are two letters, prices are finite and not negative.

## Failure

Checkout must never wait on, or fail because of, this app. The webhook is registered as not required with a 1 second soft timeout, and once a request is verified every error is turned into the fallback rate or an empty answer. See [webhook.md](webhook.md#failure-policy).
