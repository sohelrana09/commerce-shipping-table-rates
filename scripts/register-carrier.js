/**
 * App Management installation step: registers the Shipping Table Rates carrier in Commerce so
 * the webhook's methods show at checkout. Uninstalling switches the carrier off.
 */

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

import { upsertCarrier } from "../src/common/rates/carrier.js";
import { loadSettings } from "../src/common/rates/settings.js";

function commerceFor(params) {
  return getCommerceClient(resolveImsAuthParams(params));
}

export default defineCustomInstallationStep({
  install: async (_config, { logger, params }) => {
    const settings = await loadSettings(logger);
    const outcome = await upsertCarrier(await commerceFor(params), settings);
    logger.info(`Carrier "${settings.carrierCode}" ${outcome}`);
    return { carrierCode: settings.carrierCode, status: "success" };
  },

  uninstall: async (_config, { logger, params }) => {
    const settings = await loadSettings(logger);
    try {
      await upsertCarrier(await commerceFor(params), settings, {
        active: false,
      });
      logger.info(`Carrier "${settings.carrierCode}" switched off`);
    } catch (error) {
      logger.warn(`Couldn't switch off the carrier: ${error.message}`);
    }
  },
});
