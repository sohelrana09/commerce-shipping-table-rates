# Rate tables

A **shipping method** is what shoppers pick at checkout. Each method has a **rate table**: rows of conditions and prices. For a cart, the engine finds the rows that match, picks one, then applies the method's handling fee, limits and free shipping. This page describes every field, as the Admin page, CSV files and `SHIPPING_METHODS` use them.

## A method

```json
{
  "code": "standard",
  "title": "Standard (3 to 5 days)",
  "enabled": true,
  "sortOrder": 10,
  "selection": "first",
  "subtotalBasis": "before_discount",
  "weightStep": 1,
  "handling": { "fixed": 1, "percent": 0 },
  "minPrice": 4,
  "maxPrice": 40,
  "freeOver": 75,
  "honourFreeShipping": true,
  "storeIds": ["1"],
  "customerGroups": [],
  "rows": [
    { "countries": ["US"], "weightTo": 5, "flat": 5.99 },
    { "countries": ["US"], "weightFrom": 5, "flat": 8.99, "perWeight": 0.5 }
  ]
}
```

| Field | Default | Meaning |
|---|---|---|
| `code` | required | 1 to 40 lower-case letters, digits or underscores. Commerce stores it on orders as the method code, so keep it stable. |
| `title` | required | What shoppers see. |
| `enabled` | `true` | Off: the method is never offered. New methods start off in the Admin. |
| `sortOrder` | `0` | Lower comes first at checkout; equal sort orders show the cheaper method first. |
| `selection` | `first` | Which matching row prices the cart: `first` (top to bottom), `cheapest` or `highest`. |
| `subtotalBasis` | `before_discount` | The subtotal that row conditions, percent prices and `freeOver` use: `before_discount` or `after_discount`. |
| `weightStep` | none | Rounds the cart weight **up** to a multiple of this before per-weight prices: with `0.5`, 1.2 kg is billed as 1.5 kg. |
| `handling.fixed` | none | Added to the row price. |
| `handling.percent` | none | Percent of the row price, added to it. |
| `minPrice`, `maxPrice` | none | Clamp the price after handling. |
| `freeOver` | none | Price is 0 when the subtotal is at least this. |
| `honourFreeShipping` | `true` | Price is 0 when a cart price rule gives the cart free shipping. |
| `storeIds` | all | Store view IDs the method is offered in. |
| `customerGroups` | all | Customer group IDs (0 = guests). |
| `rows` | required | The rate table, up to 5,000 rows. |

The order of operations is: **row price → handling → minimum and maximum → free shipping**, rounded to cents.

## A row

Every condition is optional; an empty condition matches any cart.

| Field | CSV column | Meaning |
|---|---|---|
| `countries` | `country` | Two-letter country codes. `*` or empty = any. |
| `regions` | `region` | Region codes (`CA`) or IDs (`12`). |
| `postcodes` | `postcode` | Patterns, see [Postcodes](#postcodes). |
| `weightFrom`, `weightTo` | `weight_from`, `weight_to` | Cart weight, in the store's weight unit. |
| `subtotalFrom`, `subtotalTo` | `subtotal_from`, `subtotal_to` | Cart subtotal (see `subtotalBasis`). |
| `qtyFrom`, `qtyTo` | `qty_from`, `qty_to` | Number of items. |
| `skus` | `sku` | SKU patterns with `*` and `?`. The row applies when **at least one** item matches. |
| `attribute`, `attributeValues` | `attribute`, `attribute_values` | A product attribute code, and the values that match (case-insensitive). No values = the item just needs the attribute. |
| `flat` | `flat` | Price per order. |
| `perItem` | `per_item` | Price per item (times the quantity). |
| `perWeight` | `per_weight` | Price per weight unit (times the billable weight). |
| `percent` | `percent` | Percent of the subtotal, 0 to 100. |
| `cost` | `cost` | What the method costs you, sent to Commerce as `cost`. Defaults to the row price. |

**Ranges include "from" and exclude "to"** (`from ≤ value < to`), so 0–5 and 5–10 never overlap and a 5 kg cart lands in the second row.

The row price is `flat + perItem × qty + perWeight × billable weight + percent × subtotal / 100`.

Totals come from Commerce's `rateRequest`: `package_weight`, `package_qty`, `package_value` and `package_value_with_discount`. Child items of configurable and bundle products, and virtual items, aren't counted twice when Commerce leaves totals out.

## Postcodes

| Pattern | Matches |
|---|---|
| `10001` | That postcode. Spaces and case don't matter: `sw1a 1aa` = `SW1A1AA`. |
| `SW1*`, `9021?` | Wildcards: `*` any characters, `?` one character. |
| `90000-96199` | A range. Both bounds must be the same length; the postcode's first characters (that many) are compared, so ZIP+4 codes such as `90210-1234` fall inside. Numeric bounds compare as numbers, others alphabetically (`AB10-AB16`). |
| `!BT*` | Excludes. A postcode matches when it matches any include (or there are none) and no exclude. |

A row with postcode includes doesn't match a cart without a postcode; a row with only excludes does.

## Choosing the row

With `first`, put specific rows above general ones: a remote-postcode row above the country-wide row. With `cheapest` or `highest`, order doesn't matter. The Admin's **Quote a cart** shows which row priced each method and, for methods not offered, how many rows failed on each condition.

## CSV

The first line names the columns, in any order (`country`, `region`, `postcode`, `weight_from`, `weight_to`, `subtotal_from`, `subtotal_to`, `qty_from`, `qty_to`, `sku`, `attribute`, `attribute_values`, `flat`, `per_item`, `per_weight`, `percent`, `cost`). Lists in one cell are separated with `;` (`,` and `|` also work when the cell is quoted).

```csv
country,region,postcode,weight_from,weight_to,flat,per_weight
US,,90000-96199,0,10,11,1
US,AK;HI,,,,19,2
US,,,,,16,1.5
```

- Magento table rate headers are accepted too: `dest_country`, `dest_region`, `dest_zip`, `price` and `shipping_price`. Rename Magento's condition column to `weight_from` or `subtotal_from`.
- Import reports each line it couldn't read, with the reason, and keeps the others. Choose **Replace all rows** or **Add to the end** first. Nothing is stored until you save the method.
- Export protects spreadsheets from formula injection: a cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, which import removes.

## Examples

The Admin's **Start from example** offers four templates (all switched off): weight bands with a free shipping threshold, express zones by postcode range with a minimum and maximum, UK per item with Highlands and Islands surcharges, and freight for oversize items by attribute or SKU. They live in [`src/common/rates/default-methods.js`](../src/common/rates/default-methods.js).
