import AioLogger from "@adobe/aio-lib-core-logging";

import { createShippingRatesHandler } from "./handler.js";

const handler = createShippingRatesHandler();

/** Web action entry point (raw-http, no Adobe IMS auth: the Commerce signature is checked). */
export function main(params = {}) {
  const logger = AioLogger("shipping-table-rates-webhook", {
    level: params.LOG_LEVEL || "info",
  });
  return handler(params, logger);
}
