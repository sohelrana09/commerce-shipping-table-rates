/**
 * App Management installation step: provisions App Builder Database Storage for the workspace
 * and creates the indexes Shipping Table Rates needs. Uninstalling drops the app's collections.
 */

import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { generateAccessToken } from "@adobe/aio-lib-core-auth";
import libDb from "@adobe/aio-lib-db";

import { INDEXES } from "../src/common/rates/db.js";

const POLL_MS = 3000;
const TIMEOUT_MS = 120_000;
const IN_PROGRESS = new Set(["REQUESTED", "PROCESSING"]);
const FAILED = new Set(["FAILED", "REJECTED"]);
const EXISTS = /already exists|duplicate/iu;

async function dbBase(params) {
  const token = await generateAccessToken(params);
  return libDb.init({ token: token.access_token });
}

async function readStatus(base) {
  try {
    return (await base.provisionStatus())?.status?.toUpperCase();
  } catch {
    return "NOT_PROVISIONED";
  }
}

async function ensureProvisioned(base, logger) {
  let status = await readStatus(base);
  if (status === "PROVISIONED") {
    return;
  }
  if (!IN_PROGRESS.has(status)) {
    logger.info("Requesting database provisioning");
    status = (await base.provisionRequest())?.status?.toUpperCase();
  }
  const deadline = Date.now() + TIMEOUT_MS;
  while (status !== "PROVISIONED") {
    if (FAILED.has(status)) {
      throw new Error(`Database provisioning failed: ${status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Database provisioning timed out (last status: ${status})`,
      );
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling must wait between checks
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    status = await readStatus(base);
  }
}

export default defineCustomInstallationStep({
  install: async (_config, { logger, params }) => {
    const base = await dbBase(params);
    await ensureProvisioned(base, logger);
    const client = await base.connect();
    try {
      for (const [name, defs] of Object.entries(INDEXES)) {
        for (const def of defs) {
          try {
            // biome-ignore lint/performance/noAwaitInLoops: serial so an existing index is skipped on its own
            await client.collection(name).createIndex(def.key, def.options);
          } catch (error) {
            if (!EXISTS.test(error?.message ?? "")) {
              throw error;
            }
          }
        }
      }
    } finally {
      await client.close();
    }
    logger.info("Shipping Table Rates database is ready");
    return { status: "success" };
  },

  uninstall: async (_config, { logger, params }) => {
    const client = await (await dbBase(params)).connect();
    try {
      for (const name of Object.keys(INDEXES)) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: serial so one missing collection doesn't stop the others
          await client.collection(name).drop();
        } catch (error) {
          logger.warn(`Couldn't drop ${name}: ${error.message}`);
        }
      }
    } finally {
      await client.close();
    }
    logger.info("Shipping Table Rates collections removed");
  },
});
