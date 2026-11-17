import { describe, expect, test } from "vitest";

import { normaliseRateRequest, quoteCart } from "#engine";
import {
  cleanMethod,
  DEFAULT_TEST_CART,
  describeDestination,
  describeLimits,
  describeMethodPricing,
  describePrice,
  describeProducts,
  editableCopy,
  emptyMethod,
  joinList,
  money,
  move,
  splitList,
  toCode,
  toRateRequest,
} from "#web/lib/methods.ts";

import { DEFAULT_METHODS } from "../../src/common/rates/default-methods.js";

import type { ShippingMethod } from "#web/lib/types.ts";

describe("method helpers", () => {
  test("makes codes from titles", () => {
    expect(toCode("Next day (UK) — Zone 2!")).toBe("next_day_uk_zone_2");
    expect(toCode("x".repeat(50))).toHaveLength(40);
  });

  test("splits and joins typed lists", () => {
    expect(splitList(" US, CA; MX|,")).toEqual(["US", "CA", "MX"]);
    expect(joinList(["US", "CA"])).toBe("US, CA");
    expect(joinList(undefined)).toBe("");
  });

  test("cleans empty fields but keeps zeros", () => {
    const method: ShippingMethod = {
      code: "a",
      customerGroups: [],
      handling: { fixed: Number.NaN },
      minPrice: 0,
      rows: [{ countries: [], flat: 0, perItem: Number.NaN }],
      title: "A",
    };
    expect(cleanMethod(method)).toEqual({
      code: "a",
      minPrice: 0,
      rows: [{ flat: 0 }],
      title: "A",
    });
    expect(
      cleanMethod({ ...method, handling: { percent: 5 } }).handling,
    ).toEqual({ percent: 5 });
  });

  test("copies without updatedAt and starts new methods switched off", () => {
    const copy = editableCopy({ ...emptyMethod(), updatedAt: "x" });
    expect(copy).not.toHaveProperty("updatedAt");
    expect(emptyMethod()).toMatchObject({
      enabled: false,
      rows: [{ flat: 0 }],
    });
  });

  test("moves rows within bounds", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  test("describes rows and methods", () => {
    expect(money(3)).toBe("3.00");
    expect(
      describeDestination({
        countries: ["US"],
        postcodes: ["9*"],
        regions: ["CA"],
      }),
    ).toBe("US (CA) 9*");
    expect(describeDestination({})).toBe("Anywhere");
    expect(
      describeLimits({ qtyFrom: 2, subtotalTo: 50, weightFrom: 5 }, "kg"),
    ).toBe("5 kg+, subtotal 0–50, qty 2+");
    expect(describeLimits({ weightFrom: 1, weightTo: 5 }, "lbs")).toBe(
      "1–5 lbs",
    );
    expect(describeLimits({}, "kg")).toBe("Any cart");
    expect(describeProducts({ attribute: "a", skus: ["X*"] })).toBe(
      "SKU X*; has a",
    );
    expect(describeProducts({ attribute: "a", attributeValues: ["b"] })).toBe(
      "a = b",
    );
    expect(describeProducts({})).toBe("Any products");
    expect(
      describePrice({ flat: 1, percent: 5, perItem: 2, perWeight: 3 }, "kg"),
    ).toBe("1.00 + 2.00 / item + 3.00 / kg + 5% of subtotal");
    expect(describePrice({}, "kg")).toBe("Free");
    expect(
      describeMethodPricing({
        code: "a",
        freeOver: 50,
        handling: { fixed: 1 },
        maxPrice: 9,
        minPrice: 2,
        rows: [],
        title: "A",
      }),
    ).toBe("handling, min 2.00, max 9.00, free from 50.00");
    expect(describeMethodPricing(emptyMethod())).toBe("Table price only");
  });
});

describe("toRateRequest", () => {
  test("builds the payload the webhook reads, so the tester matches checkout", () => {
    const request = toRateRequest({
      ...DEFAULT_TEST_CART,
      country: " gb ",
      discount: 200,
      lines: [
        ...DEFAULT_TEST_CART.lines,
        { attributes: "bad; =x", price: 5, qty: 0, sku: "ZERO", weight: 1 },
      ],
    });
    const cart = normaliseRateRequest(request);
    expect(cart).toMatchObject({
      country: "GB",
      customerGroupId: "1",
      qty: 3,
      subtotal: 120,
      subtotalWithDiscount: 0,
      weight: 4.5,
    });
    expect(cart.items[0]?.attributes).toEqual({ shipping_class: "standard" });

    const methods = DEFAULT_METHODS.map((method) => ({
      ...method,
      enabled: true,
    })) as ShippingMethod[];
    const us = quoteCart(
      methods,
      normaliseRateRequest(toRateRequest(DEFAULT_TEST_CART)),
    );
    expect(us.rates.map((rate) => rate.code)).toEqual([
      "standard",
      "express_zones",
    ]);
  });
});
