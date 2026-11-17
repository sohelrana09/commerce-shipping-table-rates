import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { createShippingRatesHandler } from "../../src/commerce-extensibility-1/actions/shipping-rates/handler.js";
import { main } from "../../src/commerce-extensibility-1/actions/shipping-rates/index.js";
import { DEFAULT_SETTINGS } from "../../src/common/rates/settings.js";
import { rateRequest } from "../fixtures/payloads.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = publicKey.export({ format: "pem", type: "spki" }).toString();

const STANDARD = {
  code: "standard",
  rows: [{ countries: ["US"], flat: 5, perItem: 1 }],
  title: "Standard",
};

function signedCall(payload, extra = {}) {
  const body = JSON.stringify(payload);
  return {
    __ow_body: Buffer.from(body).toString("base64"),
    __ow_headers: {
      "x-adobe-commerce-webhook-signature": sign(
        "sha256",
        Buffer.from(body),
        privateKey,
      ).toString("base64"),
    },
    COMMERCE_WEBHOOK_PUBLIC_KEY: PEM,
    ...extra,
  };
}

function logger() {
  return { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

function handler({ methods = [STANDARD], settings = {}, ...overrides } = {}) {
  return createShippingRatesHandler({
    loadMethods: vi.fn(async () => methods),
    loadSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS, ...settings })),
    ...overrides,
  });
}

function operations(response) {
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body);
}

describe("shipping-rates webhook", () => {
  test("adds one shipping method per matching rate", async () => {
    const response = await handler()(
      signedCall({ rateRequest: rateRequest() }),
      logger(),
    );
    expect(operations(response)).toEqual([
      {
        op: "add",
        path: "result",
        value: {
          additional_data: [
            { key: "table_rates_row", value: "0" },
            { key: "table_rates_free", value: "" },
          ],
          carrier_code: "tablerates",
          cost: 8,
          method: "standard",
          method_title: "Standard",
          price: 8,
        },
      },
    ]);
  });

  test("reads a payload wrapped in data and uses the configured carrier", async () => {
    const response = await handler({ settings: { carrierCode: "myrates" } })(
      signedCall({ data: { rateRequest: rateRequest() } }),
      logger(),
    );
    expect(operations(response)[0].value.carrier_code).toBe("myrates");
  });

  test("answers success with no rates when nothing matches", async () => {
    const log = logger();
    const response = await handler({ methods: [STANDARD, { code: "BAD" }] })(
      signedCall({ rateRequest: rateRequest({ dest_country_id: "FR" }) }),
      log,
    );
    expect(operations(response)).toEqual([{ op: "success" }]);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping method "BAD"'),
    );
  });

  test("offers nothing when rates are switched off", async () => {
    const loadMethods = vi.fn();
    const response = await handler({
      loadMethods,
      settings: { ratesEnabled: false },
    })(signedCall({ rateRequest: rateRequest() }), logger());
    expect(operations(response)).toEqual([{ op: "success" }]);
    expect(loadMethods).not.toHaveBeenCalled();
  });

  test("rejects unsigned and wrongly signed calls with 401 and no detail", async () => {
    const log = logger();
    const loadMethods = vi.fn();
    const call = signedCall({ rateRequest: rateRequest() });
    call.__ow_headers["x-adobe-commerce-webhook-signature"] = "bad";
    const response = await handler({ loadMethods })(call, log);
    expect(response).toEqual({
      body: { error: "Unauthorized" },
      headers: { "Content-Type": "application/json" },
      statusCode: 401,
    });
    expect(loadMethods).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("doesn't match"),
    );

    const noKey = await handler()(
      signedCall(
        { rateRequest: rateRequest() },
        { COMMERCE_WEBHOOK_PUBLIC_KEY: "" },
      ),
      logger(),
    );
    expect(noKey.statusCode).toBe(401);
  });

  test("falls back to the configured rate when the database fails", async () => {
    const log = logger();
    const response = await handler({
      loadMethods: vi.fn(async () => {
        throw new Error("database down");
      }),
      settings: { fallbackPrice: 9.999, fallbackTitle: "Standard shipping" },
    })(signedCall({ rateRequest: rateRequest() }), log);
    expect(operations(response)).toEqual([
      {
        op: "add",
        path: "result",
        value: expect.objectContaining({
          carrier_code: "tablerates",
          method: "fallback",
          method_title: "Standard shipping",
          price: 10,
        }),
      },
    ]);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("database down"),
    );
  });

  test("offers nothing when it fails without a fallback", async () => {
    const response = await handler()(signedCall({ nothing: true }), logger());
    expect(operations(response)).toEqual([{ op: "success" }]);

    const broken = await handler({
      loadSettings: vi.fn(async () => {
        throw new Error("boom");
      }),
    })(signedCall({ rateRequest: rateRequest() }), logger());
    expect(operations(broken)).toEqual([{ op: "success" }]);
  });

  test("main wires the real handler and rejects an unsigned call", async () => {
    const response = await main({ __ow_body: "{}", __ow_headers: {} });
    expect(response.statusCode).toBe(401);
    expect((await main()).statusCode).toBe(401);
  });

  test("main quotes methods from SHIPPING_METHODS with default settings", async () => {
    const response = await main(
      signedCall(
        { rateRequest: rateRequest() },
        { LOG_LEVEL: "error", SHIPPING_METHODS: JSON.stringify([STANDARD]) },
      ),
    );
    expect(operations(response)[0].value).toMatchObject({
      method: "standard",
      price: 8,
    });
  });
});
