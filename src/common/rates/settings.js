/**
 * App-wide settings from the App Management configuration form (businessConfig in
 * app.commerce.config.ts), read at the global scope. Missing or unreadable settings fall back to
 * the defaults, so a fresh install behaves predictably.
 */

export const DEFAULT_SETTINGS = {
  carrierCode: "tablerates",
  carrierTitle: "Table Rates",
  fallbackPrice: null,
  fallbackTitle: "Standard shipping",
  ratesEnabled: true,
  weightUnit: "kg",
};

const CARRIER_CODE = /^[a-z0-9_]{1,32}$/iu;

function toBool(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return fallback;
}

function toText(value, fallback, maxLength = 120) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return value.trim().slice(0, maxLength);
}

function toPrice(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

/** Turns stored config entries ([{ name, value }]) into typed settings. */
export function parseSettings(entries = []) {
  const raw = Object.fromEntries(
    entries
      .filter((entry) => entry?.value !== undefined && entry?.value !== null)
      .map((entry) => [entry.name, entry.value]),
  );
  const carrierCode = toText(raw.carrierCode, DEFAULT_SETTINGS.carrierCode, 32);
  const weightUnit = first(raw.weightUnit);
  return {
    carrierCode: CARRIER_CODE.test(carrierCode)
      ? carrierCode
      : DEFAULT_SETTINGS.carrierCode,
    carrierTitle: toText(raw.carrierTitle, DEFAULT_SETTINGS.carrierTitle),
    fallbackPrice: toPrice(raw.fallbackPrice),
    fallbackTitle: toText(raw.fallbackTitle, DEFAULT_SETTINGS.fallbackTitle),
    ratesEnabled: toBool(raw.ratesEnabled, DEFAULT_SETTINGS.ratesEnabled),
    weightUnit: weightUnit === "lbs" ? "lbs" : "kg",
  };
}

export async function loadSettings(logger = console) {
  try {
    const [{ default: appConfig }, libConfig] = await Promise.all([
      import("#app.commerce.config"),
      import("@adobe/aio-commerce-lib-config"),
    ]);
    await libConfig.initialize({ schema: appConfig.businessConfig.schema });
    const result = await libConfig.getConfiguration(
      libConfig.byCodeAndLevel("global", "global"),
    );
    return parseSettings(result?.config);
  } catch (error) {
    logger.warn(`Using default settings: ${error.message}`);
    return { ...DEFAULT_SETTINGS };
  }
}
