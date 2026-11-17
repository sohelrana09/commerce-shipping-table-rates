import { useIms } from "@adobe/aio-commerce-lib-admin-ui/web";
import { createContext, useCallback, useContext, useMemo } from "react";

import actionUrls from "../config.json";
import { ApiError } from "../lib/api-error.ts";

import type { Lookups, PageSettings, ShippingMethod } from "../lib/types.ts";

const PACKAGE = "ShippingTableRatesAdmin";

export { ApiError } from "../lib/api-error.ts";

export type MethodsResponse = {
  methods: ShippingMethod[];
  examples: ShippingMethod[];
  settings: PageSettings;
};

/** What the Admin page needs from the backend. The preview supplies an in-browser version. */
export type RatesApi = {
  deleteMethod: (code: string) => Promise<{ deleted: boolean }>;
  listMethods: () => Promise<MethodsResponse>;
  lookups: () => Promise<Lookups>;
  saveMethod: (
    method: ShippingMethod,
    previousCode?: string,
  ) => Promise<{ method: ShippingMethod }>;
};

/**
 * Calls the app's Admin web actions with the signed-in admin's IMS token. Action URLs come from
 * `config.json`, which the App Builder CLI writes at build and dev time.
 */
export function useActionsApi(): RatesApi {
  const ims = useIms();
  if (ims.error) {
    throw ims.error;
  }
  const { imsToken, imsOrgId } = ims.data;

  const invoke = useCallback(
    async <T>(action: string, payload: object = {}): Promise<T> => {
      const url = (actionUrls as Record<string, string>)[
        `${PACKAGE}/${action}`
      ];
      const response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: {
          authorization: `Bearer ${imsToken}`,
          "Content-Type": "application/json",
          "x-gw-ims-org-id": imsOrgId,
        },
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiError(
          body?.error ?? `Request failed (${response.status})`,
          body?.errors ?? [],
        );
      }
      return body as T;
    },
    [imsOrgId, imsToken],
  );

  return useMemo(
    () => ({
      deleteMethod: (code: string) =>
        invoke<{ deleted: boolean }>("method-delete", { code }),
      listMethods: () => invoke<MethodsResponse>("methods-list"),
      lookups: () => invoke<Lookups>("lookups"),
      saveMethod: (method: ShippingMethod, previousCode?: string) =>
        invoke<{ method: ShippingMethod }>("method-save", {
          method,
          previousCode,
        }),
    }),
    [invoke],
  );
}

export const RatesApiContext = createContext<RatesApi | null>(null);

/** The backend the page talks to: the App Builder actions, or the preview's in-browser store. */
export function useRatesApi(): RatesApi {
  const api = useContext(RatesApiContext);
  if (!api) {
    throw new Error("RatesApiContext is missing");
  }
  return api;
}
