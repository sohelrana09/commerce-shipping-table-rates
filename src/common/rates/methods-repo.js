/**
 * Shipping methods stored in App Builder Database Storage. Reads for the webhook are cached per
 * warm action container for METHODS_CACHE_MS, so checkout doesn't wait on the database for
 * every rate request.
 */

import { validateMethod } from "#engine";

import { findOneOrNull, METHODS, toMethod, withDb } from "./db.js";

export const METHODS_CACHE_MS = 30_000;

let cache = null;

export function clearMethodsCache() {
  cache = null;
}

export class MethodValidationError extends Error {
  // biome-ignore lint/style/useConsistentMemberAccessibility: plain JavaScript has no access modifiers
  constructor(errors) {
    super(`Invalid shipping method: ${errors.slice(0, 5).join("; ")}`);
    this.name = "MethodValidationError";
    this.errors = errors;
  }
}

export function listMethods(params, connect) {
  return withDb(
    params,
    async (client) => {
      const docs = await client
        .collection(METHODS)
        .find({})
        .sort({ sortOrder: 1, code: 1 })
        .toArray();
      return docs.map(toMethod);
    },
    connect,
  );
}

/** Methods for the webhook: cached per warm container. */
export async function listMethodsCached(params, connect, now = Date.now()) {
  if (cache && cache.expiresAt > now) {
    return cache.methods;
  }
  const methods = await listMethods(params, connect);
  cache = { expiresAt: now + METHODS_CACHE_MS, methods };
  return methods;
}

/**
 * Creates or replaces a method. When `previousCode` differs from `method.code` (a rename), the
 * old document is removed. Refuses to overwrite another method's code.
 */
// Async so validation failures reject like database failures do.
// biome-ignore lint/suspicious/useAwait: see comment above
export async function saveMethod(
  method,
  params,
  { previousCode, connect } = {},
) {
  const errors = validateMethod(method);
  if (errors.length > 0) {
    throw new MethodValidationError(errors);
  }
  const { _id: _ignored, ...clean } = method;
  const doc = { ...clean, updatedAt: new Date().toISOString() };

  return withDb(
    params,
    async (client) => {
      const methods = client.collection(METHODS);
      const renamed = previousCode && previousCode !== method.code;
      if (renamed || !previousCode) {
        const clash = await findOneOrNull(methods, { code: method.code });
        if (clash) {
          throw new MethodValidationError([
            `a method with code "${method.code}" already exists`,
          ]);
        }
      }
      if (renamed) {
        await methods.deleteOne({ code: previousCode });
      }
      await methods.replaceOne({ code: method.code }, doc, { upsert: true });
      clearMethodsCache();
      return doc;
    },
    connect,
  );
}

export function deleteMethod(code, params, connect) {
  return withDb(
    params,
    async (client) => {
      const result = await client.collection(METHODS).deleteOne({ code });
      clearMethodsCache();
      return (result?.deletedCount ?? 0) > 0;
    },
    connect,
  );
}
