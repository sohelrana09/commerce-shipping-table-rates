/** A shipping webhook `rateRequest` like the ones Commerce sends, trimmed to what the app reads. */
export function rateRequest(overrides = {}) {
  return {
    all_items: [
      {
        base_price: 30,
        item_id: 1,
        price: 30,
        product: {
          attributes: {
            color: "red",
            shipping_class: "standard",
            tags: "gift, new",
          },
          sku: "TEE-RED-M",
          type_id: "simple",
        },
        qty: 2,
        sku: "TEE-RED-M",
        weight: 1.5,
      },
      {
        base_price: 60,
        item_id: 2,
        price: 60,
        product: { sku: "MUG-01", type_id: "simple" },
        qty: 1,
        sku: "MUG-01",
        weight: 1.5,
      },
    ],
    base_currency: { currency_code: "USD" },
    customer: { group_id: 1 },
    dest_city: "Beverly Hills",
    dest_country_id: "US",
    dest_postcode: "90210",
    dest_region_code: "CA",
    dest_region_id: 12,
    free_shipping: false,
    package_currency: { currency_code: "USD" },
    package_qty: 3,
    package_value: 120,
    package_value_with_discount: 100,
    package_weight: 4.5,
    store_id: 1,
    website_id: "1",
    ...overrides,
  };
}
