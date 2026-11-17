/**
 * The out-of-process shipping method webhook: Commerce sends the cart (`rateRequest`) and gets
 * back one JSON Patch `add` operation on `result` per shipping method to offer.
 *
 * Security: the request must carry a valid Commerce webhook signature (see signature.js).
 * Anything unsigned gets a 401 and no rates.
 *
 * Failure policy: once a request is verified, this webhook never breaks checkout. If settings,
 * the database or a method fail, it logs the error and answers with the fallback rate from App
 * Management (or no rates), so the store's other carriers still show.
 *
 * Dependencies are injectable for tests.
 */

import { normaliseRateRequest, quoteCart, roundMoney } from "#engine";

import { loadSettings } from "../../../common/rates/settings.js";
import { verifyWebhook } from "../../../common/rates/signature.js";
import { loadMethods } from "../../../common/rates/sources.js";

const realDeps = { loadMethods, loadSettings, verifyWebhook };

function respond(operations) {
  return {
    body: JSON.stringify(operations),
    headers: { "Content-Type": "application/json" },
    statusCode: 200,
  };
}

/** One shipping method, as the out-of-process shipping module expects it. */
export function shippingOperation(carrierCode, rate) {
  return {
    op: "add",
    path: "result",
    value: {
      additional_data: [
        { key: "table_rates_row", value: String(rate.row) },
        { key: "table_rates_free", value: rate.free ?? "" },
      ],
      carrier_code: carrierCode,
      cost: rate.cost,
      method: rate.code,
      method_title: rate.title,
      price: rate.price,
    },
  };
}

function fallbackOperations(settings) {
  if (
    settings?.fallbackPrice === null ||
    settings?.fallbackPrice === undefined
  ) {
    return [{ op: "success" }];
  }
  return [
    shippingOperation(settings.carrierCode, {
      code: "fallback",
      cost: 0,
      free: null,
      price: roundMoney(settings.fallbackPrice),
      row: -1,
      title: settings.fallbackTitle,
    }),
  ];
}

function readRequest(body) {
  const payload = JSON.parse(body);
  const request = payload?.rateRequest ?? payload?.data?.rateRequest;
  if (!request || typeof request !== "object") {
    throw new Error("the payload has no rateRequest");
  }
  return request;
}

export function createShippingRatesHandler(overrides = {}) {
  const deps = { ...realDeps, ...overrides };

  return async function shippingRates(params, logger) {
    const verified = deps.verifyWebhook(
      params,
      params.COMMERCE_WEBHOOK_PUBLIC_KEY,
    );
    if (!verified.ok) {
      logger.warn(`Rejected shipping rate request: ${verified.reason}`);
      return {
        body: { error: "Unauthorized" },
        headers: { "Content-Type": "application/json" },
        statusCode: 401,
      };
    }

    let settings = null;
    try {
      settings = await deps.loadSettings(logger);
      if (!settings.ratesEnabled) {
        return respond([{ op: "success" }]);
      }
      const cart = normaliseRateRequest(readRequest(verified.body));
      const methods = await deps.loadMethods(params);
      const { rates, skipped } = quoteCart(methods, cart);
      for (const entry of skipped) {
        if (entry.reason.startsWith("invalid")) {
          logger.warn(`Skipping method "${entry.code}": ${entry.reason}`);
        }
      }
      logger.debug(
        `Offering ${rates.length} rate(s) to ${cart.country || "?"} for ${cart.weight} weight, ${cart.qty} item(s)`,
      );
      return respond(
        rates.length > 0
          ? rates.map((rate) => shippingOperation(settings.carrierCode, rate))
          : [{ op: "success" }],
      );
    } catch (error) {
      logger.error(
        `Shipping rates failed, using the fallback: ${error.message}`,
      );
      return respond(fallbackOperations(settings));
    }
  };
}
