import { describe, expect, test, vi } from "vitest";

import {
  carrierPayload,
  upsertCarrier,
} from "../../src/common/rates/carrier.js";
import { clearMethodsCache } from "../../src/common/rates/methods-repo.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
} from "../../src/common/rates/settings.js";
import { loadMethods, methodsFromEnv } from "../../src/common/rates/sources.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const config = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
}));

vi.mock("@adobe/aio-commerce-lib-config", () => ({
  byCodeAndLevel: (code, level) => ({ code, level }),
  getConfiguration: config.getConfiguration,
  initialize: vi.fn(async () => undefined),
}));

describe("parseSettings", () => {
  test("falls back to defaults", () => {
    expect(parseSettings()).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([null, { name: "carrierCode", value: null }])).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  test("reads and cleans every setting", () => {
    expect(
      parseSettings([
        { name: "ratesEnabled", value: "no" },
        { name: "carrierCode", value: " my_rates " },
        { name: "carrierTitle", value: "  Our rates " },
        { name: "weightUnit", value: ["lbs"] },
        { name: "fallbackPrice", value: "7.5" },
        { name: "fallbackTitle", value: "" },
      ]),
    ).toEqual({
      carrierCode: "my_rates",
      carrierTitle: "Our rates",
      fallbackPrice: 7.5,
      fallbackTitle: "Standard shipping",
      ratesEnabled: false,
      weightUnit: "lbs",
    });
  });

  test("rejects a bad carrier code, a negative fallback and odd types", () => {
    expect(
      parseSettings([
        { name: "carrierCode", value: "bad code!" },
        { name: "fallbackPrice", value: "-1" },
        { name: "ratesEnabled", value: 1 },
        { name: "weightUnit", value: "stone" },
      ]),
    ).toMatchObject({
      carrierCode: "tablerates",
      fallbackPrice: null,
      ratesEnabled: true,
      weightUnit: "kg",
    });
    expect(
      parseSettings([{ name: "ratesEnabled", value: false }]).ratesEnabled,
    ).toBe(false);
  });

  test("loadSettings reads the global App Management config", async () => {
    config.getConfiguration.mockResolvedValueOnce({
      config: [{ name: "carrierCode", value: "zone_rates" }],
    });
    expect((await loadSettings()).carrierCode).toBe("zone_rates");
  });

  test("loadSettings uses defaults when App Management config can't be read", async () => {
    config.getConfiguration.mockRejectedValueOnce(new Error("no config"));
    const warn = vi.fn();
    expect(await loadSettings({ warn })).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Using default settings"),
    );
  });
});

describe("sources", () => {
  test("SHIPPING_METHODS wins when it's set", async () => {
    const methods = [{ code: "a" }];
    expect(
      await loadMethods({ SHIPPING_METHODS: JSON.stringify(methods) }),
    ).toEqual(methods);
    expect(
      methodsFromEnv({ SHIPPING_METHODS: "$SHIPPING_METHODS" }),
    ).toBeNull();
    expect(methodsFromEnv({ SHIPPING_METHODS: " " })).toBeNull();
    expect(methodsFromEnv(undefined)).toBeNull();
    expect(() => methodsFromEnv({ SHIPPING_METHODS: "{}" })).toThrow(
      "must be a JSON list",
    );
  });

  test("otherwise reads the database", async () => {
    clearMethodsCache();
    const db = createFakeDb();
    db.seed("shipping_methods", [{ code: "db" }]);
    expect(await loadMethods({}, db.connect)).toEqual([{ code: "db" }]);
  });
});

describe("carrier registration", () => {
  const settings = { carrierCode: "tablerates", carrierTitle: "Table Rates" };

  function client({ post, put }) {
    return {
      post: vi.fn(() => ({ json: post })),
      put: vi.fn(() => ({ json: put })),
    };
  }

  test("builds the carrier body", () => {
    expect(carrierPayload(settings, false)).toEqual({
      carrier: {
        active: false,
        code: "tablerates",
        shipping_labels_available: false,
        sort_order: 10,
        title: "Table Rates",
        tracking_available: false,
      },
    });
  });

  test("creates, then updates when it already exists", async () => {
    const fresh = client({ post: async () => ({}), put: async () => ({}) });
    expect(await upsertCarrier(fresh, settings)).toBe("created");
    expect(fresh.post).toHaveBeenCalledWith("oope_shipping_carrier", {
      json: carrierPayload(settings, true),
    });

    const existing = client({
      post: async () => {
        throw new Error("exists");
      },
      put: async () => ({}),
    });
    expect(await upsertCarrier(existing, settings, { active: false })).toBe(
      "updated",
    );
  });

  test("reports the create error when both calls fail", async () => {
    const down = client({
      post: async () => {
        throw new Error("create failed");
      },
      put: async () => {
        throw new Error("update failed");
      },
    });
    await expect(upsertCarrier(down, settings)).rejects.toThrow(
      "create failed",
    );
  });
});
