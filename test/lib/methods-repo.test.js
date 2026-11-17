import { beforeEach, describe, expect, test } from "vitest";

import {
  findOneOrNull,
  METHODS,
  toMethod,
  withDb,
} from "../../src/common/rates/db.js";
import {
  clearMethodsCache,
  deleteMethod,
  listMethods,
  listMethodsCached,
  MethodValidationError,
  saveMethod,
} from "../../src/common/rates/methods-repo.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const METHOD = { code: "standard", rows: [{ flat: 5 }], title: "Standard" };

let db;
beforeEach(() => {
  db = createFakeDb();
  clearMethodsCache();
});

describe("methods repository", () => {
  test("saves, lists sorted and strips database ids", async () => {
    await saveMethod({ ...METHOD, sortOrder: 5 }, {}, { connect: db.connect });
    await saveMethod(
      { _id: "x", code: "express", rows: [], sortOrder: 1, title: "Express" },
      {},
      { connect: db.connect },
    );
    const methods = await listMethods({}, db.connect);
    expect(methods.map((method) => method.code)).toEqual([
      "express",
      "standard",
    ]);
    expect(methods[0]).not.toHaveProperty("_id");
    expect(methods[0].updatedAt).toEqual(expect.any(String));
    expect(db.calls.closed).toBe(3);
  });

  test("refuses invalid methods and duplicate codes", async () => {
    await expect(
      saveMethod({ code: "x" }, {}, { connect: db.connect }),
    ).rejects.toBeInstanceOf(MethodValidationError);
    await saveMethod(METHOD, {}, { connect: db.connect });
    await expect(
      saveMethod(METHOD, {}, { connect: db.connect }),
    ).rejects.toThrow('a method with code "standard" already exists');
  });

  test("updates in place and renames", async () => {
    await saveMethod(METHOD, {}, { connect: db.connect });
    await saveMethod(
      { ...METHOD, title: "Std" },
      {},
      {
        connect: db.connect,
        previousCode: "standard",
      },
    );
    await saveMethod(
      { ...METHOD, code: "ground" },
      {},
      {
        connect: db.connect,
        previousCode: "standard",
      },
    );
    const methods = await listMethods({}, db.connect);
    expect(methods.map((method) => [method.code, method.title])).toEqual([
      ["ground", "Standard"],
    ]);
  });

  test("deletes and says whether anything was deleted", async () => {
    await saveMethod(METHOD, {}, { connect: db.connect });
    expect(await deleteMethod("standard", {}, db.connect)).toBe(true);
    expect(await deleteMethod("standard", {}, db.connect)).toBe(false);
  });

  test("caches the webhook read until it expires or a save clears it", async () => {
    db.seed(METHODS, [METHOD]);
    const first = await listMethodsCached({}, db.connect, 1000);
    db.seed(METHODS, [{ ...METHOD, code: "late" }]);
    expect(await listMethodsCached({}, db.connect, 2000)).toBe(first);
    expect(await listMethodsCached({}, db.connect, 40_000)).toHaveLength(2);
  });
});

describe("db helpers", () => {
  test("findOneOrNull turns not-found into null and rethrows the rest", async () => {
    const client = await db.connect();
    expect(
      await findOneOrNull(client.collection(METHODS), { code: "x" }),
    ).toBeNull();
    const failing = {
      findOne: async () => {
        throw new Error("timeout");
      },
    };
    await expect(findOneOrNull(failing, {})).rejects.toThrow("timeout");
  });

  test("withDb closes the client when the work fails", async () => {
    await expect(
      withDb(
        {},
        async () => {
          throw new Error("fail");
        },
        db.connect,
      ),
    ).rejects.toThrow("fail");
    expect(db.calls.closed).toBe(1);
    expect(toMethod(null)).toBeNull();
  });
});
