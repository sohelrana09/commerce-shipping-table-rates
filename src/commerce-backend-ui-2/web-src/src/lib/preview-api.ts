import { validateMethod } from "#engine";

import { DEFAULT_METHODS } from "../../../../common/rates/default-methods.js";
import { ApiError } from "./api-error.ts";

import type { RatesApi } from "../hooks/use-rates-api.ts";
import type { Lookups, ShippingMethod } from "./types.ts";

const STORAGE_KEY = "shipping-table-rates-preview:methods";

/** The examples, switched on, so the preview opens with something to look at. */
export function seedMethods(): ShippingMethod[] {
  return (DEFAULT_METHODS as ShippingMethod[]).map((method) => ({
    ...structuredClone(method),
    enabled: true,
  }));
}

function read(): ShippingMethod[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as ShippingMethod[];
    }
  } catch {
    // Storage blocked or corrupt: start from the examples.
  }
  return seedMethods();
}

function write(methods: ShippingMethod[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
  } catch {
    // Storage blocked: changes last until the page reloads.
  }
}

function sorted(methods: ShippingMethod[]): ShippingMethod[] {
  return [...methods].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code),
  );
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 150));

export const PREVIEW_LOOKUPS: Lookups = {
  countries: [
    {
      id: "US",
      label: "United States",
      regions: [
        { code: "AK", id: "2", label: "Alaska" },
        { code: "CA", id: "12", label: "California" },
        { code: "HI", id: "21", label: "Hawaii" },
        { code: "NY", id: "43", label: "New York" },
        { code: "TX", id: "57", label: "Texas" },
      ],
    },
    { id: "CA", label: "Canada", regions: [] },
    { id: "GB", label: "United Kingdom", regions: [] },
  ],
  customerGroups: [
    { id: "0", label: "NOT LOGGED IN" },
    { id: "1", label: "General" },
    { id: "2", label: "Wholesale" },
  ],
  storeViews: [
    { code: "default", id: "1", label: "Default Store View" },
    { code: "uk", id: "2", label: "UK Store View" },
  ],
};

/**
 * The Admin API without App Builder: methods live in this browser's localStorage and are
 * checked with the same validateMethod as the method-save action. For local preview only.
 */
export function createPreviewApi(): RatesApi {
  let methods = read();

  return {
    async deleteMethod(code) {
      await wait();
      const before = methods.length;
      methods = methods.filter((method) => method.code !== code);
      write(methods);
      return { deleted: methods.length < before };
    },

    async listMethods() {
      await wait();
      return {
        examples: structuredClone(DEFAULT_METHODS as ShippingMethod[]),
        methods: sorted(structuredClone(methods)),
        settings: {
          carrierCode: "tablerates",
          carrierTitle: "Table Rates",
          ratesEnabled: true,
          weightUnit: "kg",
        },
      };
    },

    async lookups() {
      await wait();
      return structuredClone(PREVIEW_LOOKUPS);
    },

    async saveMethod(method, previousCode) {
      await wait();
      const errors = validateMethod(method);
      if (errors.length) {
        throw new ApiError(
          `Invalid shipping method: ${errors.slice(0, 5).join("; ")}`,
          errors,
        );
      }
      const renamed = previousCode && previousCode !== method.code;
      if (
        (renamed || !previousCode) &&
        methods.some((existing) => existing.code === method.code)
      ) {
        throw new ApiError("Invalid shipping method", [
          `a method with code "${method.code}" already exists`,
        ]);
      }
      const saved = { ...method, updatedAt: new Date().toISOString() };
      methods = [
        ...methods.filter(
          (existing) =>
            existing.code !== method.code && existing.code !== previousCode,
        ),
        saved,
      ];
      write(methods);
      return { method: saved };
    },
  };
}

/** Puts the examples back and forgets the preview's changes. */
export function resetPreview() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
