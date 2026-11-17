/**
 * Where the webhook reads methods from. SHIPPING_METHODS (a JSON list in the action's inputs)
 * wins when it's set, which is handy for a first test without the database; otherwise the
 * methods saved in the Admin are read from App Builder Database Storage.
 */

import { listMethodsCached } from "./methods-repo.js";

export function methodsFromEnv(params) {
  const raw = params?.SHIPPING_METHODS;
  if (typeof raw !== "string" || raw.trim() === "" || raw.startsWith("$")) {
    return null;
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("SHIPPING_METHODS must be a JSON list of methods");
  }
  return parsed;
}

export function loadMethods(params, connect) {
  const fromEnv = methodsFromEnv(params);
  return fromEnv
    ? Promise.resolve(fromEnv)
    : listMethodsCached(params, connect);
}
