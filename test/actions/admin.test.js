import { describe, expect, test, vi } from "vitest";

import { createHandlers } from "../../src/commerce-backend-ui-2/actions/handlers.js";
import { adminAction } from "../../src/commerce-backend-ui-2/actions/http.js";
import { main as lookupsMain } from "../../src/commerce-backend-ui-2/actions/lookups/index.js";
import { main as deleteMain } from "../../src/commerce-backend-ui-2/actions/method-delete/index.js";
import { main as saveMain } from "../../src/commerce-backend-ui-2/actions/method-save/index.js";
import { main as listMain } from "../../src/commerce-backend-ui-2/actions/methods-list/index.js";
import { DEFAULT_METHODS } from "../../src/common/rates/default-methods.js";
import { MethodValidationError } from "../../src/common/rates/methods-repo.js";
import { DEFAULT_SETTINGS } from "../../src/common/rates/settings.js";

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

function commerce(responses) {
  return {
    get: vi.fn((path) => ({
      json: async () => {
        const value = responses[path];
        if (value instanceof Error) {
          throw value;
        }
        return value;
      },
    })),
  };
}

describe("Admin handlers", () => {
  test("methodsList returns methods, examples and the settings the page shows", async () => {
    const handlers = createHandlers({
      listMethods: vi.fn(async () => [{ code: "a" }]),
      loadSettings: vi.fn(async () => DEFAULT_SETTINGS),
    });
    const response = await handlers.methodsList({}, {}, logger);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      examples: DEFAULT_METHODS,
      methods: [{ code: "a" }],
      settings: {
        carrierCode: "tablerates",
        carrierTitle: "Table Rates",
        ratesEnabled: true,
        weightUnit: "kg",
      },
    });
  });

  test("methodSave passes the method and the previous code", async () => {
    const saveMethod = vi.fn(async (method) => ({ ...method, saved: true }));
    const handlers = createHandlers({ saveMethod });
    const response = await handlers.methodSave(
      { method: { code: "b" }, previousCode: "a" },
      { p: 1 },
    );
    expect(saveMethod).toHaveBeenCalledWith(
      { code: "b" },
      { p: 1 },
      {
        previousCode: "a",
      },
    );
    expect(response.body).toEqual({ method: { code: "b", saved: true } });
    await expect(handlers.methodSave({}, {})).rejects.toBeInstanceOf(
      MethodValidationError,
    );
  });

  test("methodDelete answers 404 for a missing method and needs a code", async () => {
    const deleteMethod = vi.fn(async (code) => code === "a");
    const handlers = createHandlers({ deleteMethod });
    expect((await handlers.methodDelete({ code: "a" }, {})).body).toEqual({
      deleted: true,
    });
    expect((await handlers.methodDelete({ code: "z" }, {})).statusCode).toBe(
      404,
    );
    await expect(handlers.methodDelete({}, {})).rejects.toBeInstanceOf(
      MethodValidationError,
    );
  });

  test("lookups maps store views, customer groups and countries", async () => {
    const handlers = createHandlers({
      getCommerce: vi.fn(async () =>
        commerce({
          "customerGroups/search": { items: [{ code: "General", id: 1 }] },
          "directory/countries": [
            {
              available_regions: [{ code: "CA", id: 12, name: "California" }],
              full_name_english: "United States",
              id: "US",
            },
            { id: "XK" },
          ],
          "store/storeViews": [
            { code: "admin", id: 0, name: "Admin" },
            { code: "default", id: 1, name: "Default Store View" },
          ],
        }),
      ),
    });
    const response = await handlers.lookups({}, {}, logger);
    expect(response.body).toEqual({
      countries: [
        {
          id: "US",
          label: "United States",
          regions: [{ code: "CA", id: "12", label: "California" }],
        },
        { id: "XK", label: "XK", regions: [] },
      ],
      customerGroups: [{ id: "1", label: "General" }],
      storeViews: [{ code: "default", id: "1", label: "Default Store View" }],
      unavailable: false,
    });
  });

  test("lookups degrade when Commerce or one call fails", async () => {
    const partial = createHandlers({
      getCommerce: vi.fn(async () =>
        commerce({
          "customerGroups/search": new Error("403"),
          "directory/countries": [],
          "store/storeViews": [],
        }),
      ),
    });
    expect((await partial.lookups({}, {}, logger)).body).toMatchObject({
      customerGroups: [],
      unavailable: true,
    });

    const offline = createHandlers({
      getCommerce: vi.fn(async () => {
        throw new Error("not associated");
      }),
    });
    expect((await offline.lookups({}, {}, logger)).body).toEqual({
      countries: [],
      customerGroups: [],
      storeViews: [],
      unavailable: true,
    });
  });
});

describe("adminAction", () => {
  test("turns validation errors into 400 and anything else into a generic 500", async () => {
    const invalid = adminAction("x", () => {
      throw new MethodValidationError(["title is required"]);
    });
    expect(await invalid({ body: "{}" })).toMatchObject({
      body: {
        error: "Invalid shipping method: title is required",
        errors: ["title is required"],
      },
      statusCode: 400,
    });
    const broken = adminAction("x", () => {
      throw new Error("secret detail");
    });
    const response = await broken({ LOG_LEVEL: "error" });
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  test("the entry points are wired to the handlers", async () => {
    // Without credentials each one fails the same safe way.
    for (const main of [listMain, saveMain, deleteMain]) {
      // biome-ignore lint/performance/noAwaitInLoops: one at a time keeps the logs readable
      const response = await main({ LOG_LEVEL: "error", body: { code: "a" } });
      expect([400, 500]).toContain(response.statusCode);
    }
    expect((await lookupsMain({ LOG_LEVEL: "error" })).body.unavailable).toBe(
      true,
    );
  });
});
