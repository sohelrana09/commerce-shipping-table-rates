/**
 * Admin action handlers: manage shipping methods and load the store views, customer groups and
 * countries the method editor offers. CSV import and export and the "Quote a cart" tester run
 * in the browser with the same engine as the webhook, so they need no actions of their own.
 * Dependencies are injectable for tests.
 */

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

import { json } from "../../common/http.js";
import { DEFAULT_METHODS } from "../../common/rates/default-methods.js";
import {
  deleteMethod,
  listMethods,
  MethodValidationError,
  saveMethod,
} from "../../common/rates/methods-repo.js";
import { loadSettings } from "../../common/rates/settings.js";

function getCommerce(params) {
  return getCommerceClient(resolveImsAuthParams(params));
}

const realDeps = {
  deleteMethod,
  getCommerce,
  listMethods,
  loadSettings,
  saveMethod,
};

function requireCode(code) {
  if (typeof code !== "string" || !code) {
    throw new MethodValidationError(["code is required"]);
  }
  return code;
}

async function settle(promise, fallback, logger, what) {
  try {
    return await promise;
  } catch (error) {
    logger.warn(`${what} unavailable: ${error.message}`);
    return fallback;
  }
}

export function createHandlers(overrides = {}) {
  const deps = { ...realDeps, ...overrides };

  return {
    async lookups(_body, params, logger) {
      let commerce;
      try {
        commerce = await deps.getCommerce(params);
      } catch (error) {
        // The editor still works with typed codes when Commerce can't be reached.
        logger.warn(`lookups unavailable: ${error.message}`);
        return json(200, {
          countries: [],
          customerGroups: [],
          storeViews: [],
          unavailable: true,
        });
      }
      const [storeViews, groups, countries] = await Promise.all([
        settle(
          commerce.get("store/storeViews").json(),
          null,
          logger,
          "store views",
        ),
        settle(
          commerce
            .get("customerGroups/search", {
              searchParams: { "searchCriteria[pageSize]": 200 },
            })
            .json(),
          null,
          logger,
          "customer groups",
        ),
        settle(
          commerce.get("directory/countries").json(),
          null,
          logger,
          "countries",
        ),
      ]);
      return json(200, {
        countries: (countries ?? []).map((country) => ({
          id: country.id,
          label: country.full_name_english ?? country.id,
          regions: (country.available_regions ?? []).map((region) => ({
            code: region.code,
            id: String(region.id),
            label: region.name,
          })),
        })),
        customerGroups: (groups?.items ?? []).map((group) => ({
          id: String(group.id),
          label: group.code,
        })),
        storeViews: (storeViews ?? [])
          .filter((store) => Number(store.id) !== 0)
          .map((store) => ({
            code: store.code,
            id: String(store.id),
            label: store.name,
          })),
        unavailable: !(storeViews && groups && countries),
      });
    },

    async methodDelete(body, params) {
      const deleted = await deps.deleteMethod(requireCode(body.code), params);
      return deleted
        ? json(200, { deleted: true })
        : json(404, { error: "Method not found" });
    },

    async methodSave(body, params) {
      if (!body.method || typeof body.method !== "object") {
        throw new MethodValidationError(["method is required"]);
      }
      const saved = await deps.saveMethod(body.method, params, {
        previousCode: body.previousCode,
      });
      return json(200, { method: saved });
    },

    async methodsList(_body, params, logger) {
      const [methods, settings] = await Promise.all([
        deps.listMethods(params),
        deps.loadSettings(logger),
      ]);
      return json(200, {
        examples: DEFAULT_METHODS,
        methods,
        settings: {
          carrierCode: settings.carrierCode,
          carrierTitle: settings.carrierTitle,
          ratesEnabled: settings.ratesEnabled,
          weightUnit: settings.weightUnit,
        },
      });
    },
  };
}

export const handlers = createHandlers();
