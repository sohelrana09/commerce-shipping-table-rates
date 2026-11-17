# Shipping webhook

Commerce asks for rates through the **out-of-process shipping methods** webhook. This page describes the contract the `shipping-table-rates/shipping-rates` action implements, following Adobe's [checkout starter kit](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-reference/).

## Registration

App Management subscribes the webhook from `app.commerce.config.ts`:

| | PaaS | SaaS |
|---|---|---|
| Webhook method | `plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` | `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` |
| Type | `after` | `after` |
| Hook | `shipping_table_rates` in batch `shipping_table_rates` | same |
| Fields | `rateRequest` | same |
| Timeouts | soft 1000 ms, hard 5000 ms | same |
| Required | no: if the app fails, checkout continues with other carriers | same |

Confirm the method names on your instance with `GET /V1/webhooks/supportedList`.

Commerce shows webhook methods only for a **registered carrier**. The install step `scripts/register-carrier.js` creates it with `POST /V1/oope_shipping_carrier` (or updates it with `PUT` when it exists), using the carrier code and title from App Management. Uninstalling switches the carrier off.

## Request

Commerce sends the cart as `rateRequest`. The app reads:

| Field | Used for |
|---|---|
| `dest_country_id`, `dest_region_code`, `dest_region_id`, `dest_postcode` | Destination conditions. |
| `package_weight`, `package_qty`, `package_value`, `package_value_with_discount` | Weight, quantity and subtotal conditions and prices. |
| `free_shipping` | Free shipping from cart price rules. |
| `store_id`, `customer.group_id` | Store view and customer group limits. |
| `all_items[]`: `sku`, `qty`, `weight`, `price`/`base_price`, `parent_item_id`, `is_virtual`, `product.attributes` / `product.custom_attributes` | SKU and attribute conditions, and fallbacks when package totals are missing. |

## Response

One JSON Patch operation per method offered:

```json
[
  {
    "op": "add",
    "path": "result",
    "value": {
      "carrier_code": "tablerates",
      "method": "standard",
      "method_title": "Standard (3 to 5 days)",
      "price": 6.99,
      "cost": 5.99,
      "additional_data": [
        { "key": "table_rates_row", "value": "0" },
        { "key": "table_rates_free", "value": "" }
      ]
    }
  }
]
```

When no method applies, or rates are switched off, the answer is `[{"op": "success"}]`: checkout shows the store's other carriers.

## Signatures

The action runs with `raw-http: true` and `require-adobe-auth: false`: Commerce can't send an Adobe IMS token, so it proves itself with a signature instead.

1. In Commerce, open **Stores → Settings → Configuration → Adobe Services → Webhooks**, enable **Digital Signature Configuration** and choose **Regenerate key pair**.
2. Copy the public key into App Management (**Commerce webhook public key**) or `COMMERCE_WEBHOOK_PUBLIC_KEY` in `.env`. PEM with real or `\n` line breaks, or the bare base64 body, all work.
3. Commerce signs the request body with RSA-SHA256 and sends the base64 signature in `x-adobe-commerce-webhook-signature`. The action verifies it against the exact raw body (as text, or base64-decoded, depending on how I/O Runtime passes it).

Regenerating the key pair in Commerce invalidates the old key: update the app's key at the same time.

## Failure policy

| Situation | Answer |
|---|---|
| No key configured, no signature, no raw body or a wrong signature | HTTP 401 `{"error": "Unauthorized"}`, no rates. The reason is logged, never returned. |
| Rates switched off in App Management | `[{"op": "success"}]` |
| Invalid method in the database | That method is skipped and logged; the others are offered. |
| Database, settings or payload error | The **fallback price** as one method, if set; otherwise `[{"op": "success"}]`. The error is logged. |

So a broken table or an outage costs a method, never a checkout.
