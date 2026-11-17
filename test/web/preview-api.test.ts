// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "#web/lib/api-error.ts";
import {
  createPreviewApi,
  PREVIEW_LOOKUPS,
  resetPreview,
  seedMethods,
} from "#web/lib/preview-api.ts";

const METHOD = { code: "local", rows: [{ flat: 4 }], title: "Local" };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetPreview();
});

describe("preview API", () => {
  test("starts from the examples, switched on", async () => {
    const api = createPreviewApi();
    const { methods, examples, settings } = await api.listMethods();
    expect(methods.map((method) => method.code)).toEqual(
      seedMethods().map((method) => method.code),
    );
    expect(methods.every((method) => method.enabled)).toBe(true);
    expect(examples.every((method) => method.enabled === false)).toBe(true);
    expect(settings.carrierCode).toBe("tablerates");
    expect(await api.lookups()).toEqual(PREVIEW_LOOKUPS);
  });

  test("saves, renames, refuses duplicates and invalid methods, and deletes", async () => {
    const api = createPreviewApi();
    await api.saveMethod(METHOD);
    await expect(api.saveMethod(METHOD)).rejects.toBeInstanceOf(ApiError);
    await expect(
      api.saveMethod({ code: "Bad", rows: [], title: "" }),
    ).rejects.toMatchObject({
      errors: expect.arrayContaining(["title is required"]),
    });
    await api.saveMethod({ ...METHOD, code: "local2" }, "local");

    // A fresh API reads what the last one stored.
    const again = createPreviewApi();
    const codes = (await again.listMethods()).methods.map(
      (method) => method.code,
    );
    expect(codes).toContain("local2");
    expect(codes).not.toContain("local");
    expect(await again.deleteMethod("local2")).toEqual({ deleted: true });
    expect(await again.deleteMethod("local2")).toEqual({ deleted: false });
  });

  test("falls back to the examples when storage is corrupt or blocked", async () => {
    localStorage.setItem("shipping-table-rates-preview:methods", "{not json");
    expect((await createPreviewApi().listMethods()).methods).toHaveLength(4);

    const blocked = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    await expect(createPreviewApi().saveMethod(METHOD)).resolves.toBeTruthy();
    blocked.mockRestore();
  });
});
