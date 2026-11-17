/**
 * Helpers for the Admin web actions. They run as `require-adobe-auth` web actions called by the
 * Admin page with the signed-in admin's IMS token; the platform rejects unauthenticated calls
 * before they reach this code.
 */

import AioLogger from "@adobe/aio-lib-core-logging";

import { json, readBody } from "../../common/http.js";

/**
 * Wraps an Admin action: logging, a 400 for validation errors (they carry an `errors` list) and
 * a generic 500 for anything else. Error details go to the logs, not to the browser.
 */
export function adminAction(name, handler) {
  return async (params = {}) => {
    const logger = AioLogger(`shipping-table-rates-${name}`, {
      level: params.LOG_LEVEL || "info",
    });
    try {
      return await handler(readBody(params), params, logger);
    } catch (error) {
      if (Array.isArray(error.errors)) {
        return json(400, { error: error.message, errors: error.errors });
      }
      logger.error(`${name} failed: ${error.message}`);
      return json(500, { error: "Something went wrong. Check the app logs." });
    }
  };
}
