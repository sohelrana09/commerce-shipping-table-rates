import { describe, expect, test } from "vitest";

import {
  billableWeight,
  matchGlob,
  matchPostcode,
  normalisePostcode,
  normaliseRateRequest,
  quoteCart,
  quoteMethod,
  roundMoney,
  rowMismatch,
  rowPrice,
  validateMethod,
} from "#engine";

import { DEFAULT_METHODS } from "../../src/common/rates/default-methods.js";
import { rateRequest } from "../fixtures/payloads.js";

function cart(overrides = {}) {
  return normaliseRateRequest(rateRequest(overrides));
}

function method(overrides = {}) {
  return {
    code: "standard",
    rows: [{ flat: 5 }],
    title: "Standard",
    ...overrides,
  };
}

describe("postcodes", () => {
  test("normalises case and spaces", () => {
    expect(normalisePostcode(" sw1a 1aa ")).toBe("SW1A1AA");
    expect(normalisePostcode(undefined)).toBe("");
  });

  test.each([
    [["10001"], "10001", true],
    [["10001"], "10002", false],
    [["SW1*"], "sw1a 1aa", true],
    [["9021?"], "90210", true],
    [["9021?"], "902100", false],
    [["90000-96199"], "90210", true],
    [["90000-96199"], "90210-1234", true],
    [["90000-96199"], "97000", false],
    [["90000-96199"], "900", false],
    [["AB10-AB16"], "AB12 3CD", true],
    [["AB10-AB16"], "AB17 1AA", false],
    [["90210-1234"], "902101234", true],
    [["!BT*"], "BT1 1AA", false],
    [["!BT*"], "SW1A 1AA", true],
    [["SW*", "!SW1*"], "SW1A 1AA", false],
    [["SW*", "!SW1*"], "SW2 1AA", true],
    [[], "anything", true],
    [[], "", true],
    [["10001"], "", false],
    [["!BT*"], "", true],
    ["10001; 10002", "10002", true],
  ])("%j matches %s: %s", (patterns, postcode, expected) => {
    expect(matchPostcode(patterns, postcode)).toBe(expected);
  });
});

describe("globs", () => {
  test("matches SKUs case-insensitively and escapes regex characters", () => {
    expect(matchGlob("FURN-*", "furn-chair")).toBe(true);
    expect(matchGlob("A.B", "AXB")).toBe(false);
    expect(matchGlob("A.B", "A.B")).toBe(true);
    expect(matchGlob("*", "")).toBe(false);
  });
});

describe("normaliseRateRequest", () => {
  test("reads destination, package totals and items", () => {
    const result = cart();
    expect(result).toMatchObject({
      country: "US",
      currency: "USD",
      customerGroupId: "1",
      postcode: "90210",
      qty: 3,
      region: "CA",
      regionId: "12",
      storeId: "1",
      subtotal: 120,
      subtotalWithDiscount: 100,
      weight: 4.5,
    });
    expect(result.items[0]).toMatchObject({
      attributes: { color: "red", shipping_class: "standard" },
      sku: "TEE-RED-M",
    });
  });

  test("falls back to item sums and skips children and virtual items", () => {
    const result = normaliseRateRequest({
      all_items: [
        { price: 10, qty: 2, sku: "A", weight: 1 },
        { parent_item_id: 1, price: 10, qty: 2, sku: "A-CHILD", weight: 1 },
        { is_virtual: true, price: 50, qty: 1, sku: "GIFT" },
        {
          product: {
            custom_attributes: [{ attribute_code: "size", value: "L" }],
            price: 5,
            sku: "B",
            weight: 0.5,
          },
        },
      ],
      dest_country_id: "gb",
    });
    expect(result).toMatchObject({
      country: "GB",
      customerGroupId: "0",
      qty: 3,
      regionId: "",
      storeId: "",
      subtotal: 25,
      subtotalWithDiscount: 25,
      weight: 2.5,
    });
    expect(result.items[3]).toMatchObject({
      attributes: { size: "L" },
      qty: 1,
      sku: "B",
    });
  });

  test("copes with an empty request", () => {
    expect(normaliseRateRequest()).toMatchObject({
      country: "",
      items: [],
      qty: 0,
      subtotal: 0,
      weight: 0,
    });
  });

  test("reads attributes given as a list", () => {
    const result = normaliseRateRequest({
      all_items: [
        {
          product: {
            attributes: [
              { attribute_code: "shipping_class", value: "oversize" },
              { code: "empty", value: "" },
            ],
          },
          sku: "X",
        },
      ],
    });
    expect(result.items[0].attributes).toEqual({ shipping_class: "oversize" });
  });
});

describe("validateMethod", () => {
  test("accepts the examples", () => {
    for (const example of DEFAULT_METHODS) {
      expect(validateMethod(example)).toEqual([]);
    }
  });

  test("reports every problem", () => {
    const errors = validateMethod({
      code: "Bad Code",
      freeOver: -1,
      handling: { fixed: "x" },
      maxPrice: 5,
      minPrice: 10,
      rows: [
        null,
        {
          attributeValues: ["a"],
          countries: ["USA", "*"],
          percent: 150,
          weightFrom: 5,
          weightTo: 5,
        },
      ],
      selection: "random",
      subtotalBasis: "gross",
      title: " ",
    });
    expect(errors).toEqual([
      "code must be 1 to 40 lower-case letters, digits or underscores",
      "title is required",
      "selection must be one of: first, cheapest, highest",
      "subtotalBasis must be one of: before_discount, after_discount",
      "method: freeOver can't be negative",
      "method: handling fee must be a number",
      "method: minimum price can't be above the maximum price",
      "row 1: must be an object",
      'row 2: "USA" isn\'t a two-letter country code (use * for any)',
      "row 2: weight from must be below weight to",
      "row 2: percent can't be over 100",
      "row 2: attribute values need an attribute code",
    ]);
  });

  test("rejects non-objects, missing rows and huge tables", () => {
    expect(validateMethod(null)).toEqual(["method must be an object"]);
    expect(validateMethod({ code: "a", title: "A" })).toEqual([
      "rows must be a list",
    ]);
    expect(
      validateMethod(
        method({ rows: Array.from({ length: 5001 }, () => ({})) }),
      ),
    ).toEqual(["a method can have at most 5000 rows"]);
  });
});

describe("rowMismatch", () => {
  test.each([
    [{ countries: ["CA"] }, "country"],
    [{ countries: ["*"] }, null],
    [{ countries: ["us"] }, null],
    [{ regions: ["NY"] }, "region"],
    [{ regions: ["ca"] }, null],
    [{ regions: ["12"] }, null],
    [{ regions: ["*"] }, null],
    [{ postcodes: ["10001"] }, "postcode"],
    [{ weightFrom: 5 }, "weight"],
    [{ weightTo: 4.5 }, "weight"],
    [{ weightFrom: 4.5, weightTo: 5 }, null],
    [{ subtotalFrom: 150 }, "subtotal"],
    [{ qtyTo: 3 }, "quantity"],
    [{ skus: ["NOPE-*"] }, "sku"],
    [{ skus: ["TEE-*"] }, null],
    [
      { attribute: "shipping_class", attributeValues: ["oversize"] },
      "attribute",
    ],
    [{ attribute: "shipping_class", attributeValues: ["Standard"] }, null],
    [{ attribute: "shipping_class" }, null],
    [{ attribute: "missing" }, "attribute"],
    [{ attribute: "tags", attributeValues: ["gift"] }, null],
    [{ attribute: "tags", attributeValues: ["none"] }, "attribute"],
  ])("%j → %s", (row, expected) => {
    expect(rowMismatch(row, cart())).toBe(expected);
  });

  test("uses the discounted subtotal when the method says so", () => {
    const row = { subtotalFrom: 110 };
    expect(rowMismatch(row, cart())).toBeNull();
    expect(rowMismatch(row, cart(), { subtotalBasis: "after_discount" })).toBe(
      "subtotal",
    );
  });
});

describe("pricing", () => {
  test("rounds money and billable weight", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(billableWeight(4.5, 0)).toBe(4.5);
    expect(billableWeight(4.2, 1)).toBe(5);
    expect(billableWeight(1.5, 0.5)).toBe(1.5);
    expect(billableWeight(1.51, 0.5)).toBe(2);
  });

  test("adds flat, per item, per weight unit and percent", () => {
    const row = { flat: 2, percent: 10, perItem: 1, perWeight: 0.5 };
    // 2 + 3 items × 1 + 5 kg (4.5 rounded up) × 0.5 + 10% of 120
    expect(rowPrice(row, cart(), { weightStep: 1 })).toBe(19.5);
    expect(rowPrice({}, cart())).toBe(0);
  });
});

describe("quoteMethod", () => {
  test("skips switched-off methods, other stores and other groups", () => {
    expect(quoteMethod(method({ enabled: false }), cart())).toEqual({
      rate: null,
      reason: "switched off",
    });
    expect(quoteMethod(method({ storeIds: ["2"] }), cart()).reason).toBe(
      "not offered in this store view",
    );
    expect(quoteMethod(method({ customerGroups: ["0"] }), cart()).reason).toBe(
      "not offered to this customer group",
    );
    expect(quoteMethod(method({ storeIds: ["1"] }), cart()).rate).toBeTruthy();
  });

  test("counts why rows missed", () => {
    expect(
      quoteMethod(
        method({
          rows: [{ countries: ["CA"] }, { countries: ["GB"] }, { weightTo: 1 }],
        }),
        cart(),
      ),
    ).toEqual({
      misses: { country: 2, weight: 1 },
      rate: null,
      reason: "no row matches this cart",
    });
    expect(quoteMethod({ code: "x", title: "X" }, cart()).reason).toBe(
      "no row matches this cart",
    );
  });

  test("picks the first, cheapest or highest matching row", () => {
    const rows = [
      { countries: ["CA"], flat: 1 },
      { flat: 9 },
      { flat: 4 },
      { flat: 12 },
    ];
    expect(quoteMethod(method({ rows }), cart()).rate).toMatchObject({
      price: 9,
      row: 1,
    });
    expect(
      quoteMethod(method({ rows, selection: "cheapest" }), cart()).rate,
    ).toMatchObject({ price: 4, row: 2 });
    expect(
      quoteMethod(method({ rows, selection: "highest" }), cart()).rate,
    ).toMatchObject({ price: 12, row: 3 });
  });

  test("applies handling, minimum and maximum", () => {
    const quote = (overrides) =>
      quoteMethod(
        method({ rows: [{ cost: 3, flat: 10 }], ...overrides }),
        cart(),
      ).rate;
    expect(quote({ handling: { fixed: 2, percent: 10 } })).toMatchObject({
      cost: 3,
      price: 13,
    });
    expect(quote({ minPrice: 15 }).price).toBe(15);
    expect(quote({ maxPrice: 8 }).price).toBe(8);
  });

  test("makes shipping free over the threshold or for a free-shipping cart", () => {
    expect(quoteMethod(method({ freeOver: 100 }), cart()).rate).toMatchObject({
      cost: 5,
      free: "threshold",
      price: 0,
    });
    expect(
      quoteMethod(
        method({ freeOver: 110, subtotalBasis: "after_discount" }),
        cart(),
      ).rate.free,
    ).toBeNull();
    const freeCart = cart({ free_shipping: true });
    expect(quoteMethod(method(), freeCart).rate.free).toBe("cart rule");
    expect(
      quoteMethod(method({ honourFreeShipping: false }), freeCart).rate.price,
    ).toBe(5);
  });
});

describe("quoteCart", () => {
  test("sorts rates and explains skipped methods", () => {
    const result = quoteCart(
      [
        method({ code: "b", rows: [{ flat: 9 }], sortOrder: 2, title: "B" }),
        method({ code: "a", rows: [{ flat: 7 }], sortOrder: 2, title: "A" }),
        method({ code: "c", rows: [{ flat: 20 }], sortOrder: 1, title: "C" }),
        method({ code: "d", rows: [{ flat: 7 }], sortOrder: 2, title: "D" }),
        method({ code: "off", enabled: false, title: "Off" }),
        { code: "BAD" },
        null,
      ],
      cart(),
    );
    expect(result.rates.map((rate) => rate.code)).toEqual(["c", "a", "d", "b"]);
    expect(result.skipped).toEqual([
      { code: "off", misses: undefined, reason: "switched off", title: "Off" },
      {
        code: "BAD",
        reason:
          "invalid: code must be 1 to 40 lower-case letters, digits or underscores",
        title: "",
      },
      { code: "", reason: "invalid: method must be an object", title: "" },
    ]);
    expect(quoteCart(undefined, cart())).toEqual({ rates: [], skipped: [] });
  });

  test("quotes the examples for a US, a Californian and a UK cart", () => {
    const methods = DEFAULT_METHODS.map((example) => ({
      ...example,
      enabled: true,
    }));
    const us = quoteCart(methods, cart({ package_value: 60 }));
    expect(us.rates.map((rate) => [rate.code, rate.price])).toEqual([
      ["standard", 6.99],
      ["express_zones", 17.63],
    ]);
    const uk = quoteCart(
      methods,
      cart({
        dest_country_id: "GB",
        dest_postcode: "BT1 1AA",
        dest_region_code: "",
      }),
    );
    expect(uk.rates.map((rate) => [rate.code, rate.price])).toEqual([
      ["uk_per_item", 15.95],
    ]);
  });
});
