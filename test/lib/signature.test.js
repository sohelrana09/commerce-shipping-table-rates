import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  bodyCandidates,
  normalisePublicKey,
  SIGNATURE_HEADER,
  verifyWebhook,
} from "../../src/common/rates/signature.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = publicKey.export({ format: "pem", type: "spki" }).toString();
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });

const BODY = JSON.stringify({ rateRequest: { dest_country_id: "US" } });

function signed(body, key = privateKey) {
  return sign("sha256", Buffer.from(body), key).toString("base64");
}

function call(body, signature, headerName = SIGNATURE_HEADER) {
  return {
    __ow_body: body,
    __ow_headers: signature === undefined ? {} : { [headerName]: signature },
  };
}

describe("normalisePublicKey", () => {
  test("accepts PEM, escaped newlines and bare base64", () => {
    expect(normalisePublicKey(PEM)).toBe(PEM.trim());
    expect(normalisePublicKey(PEM.replaceAll("\n", "\\n"))).toBe(PEM.trim());
    const bare = PEM.split("\n").slice(1, -2).join("");
    expect(normalisePublicKey(bare)).toBe(PEM.trim());
  });

  test("returns null for nothing or an unresolved $VARIABLE", () => {
    expect(normalisePublicKey(undefined)).toBeNull();
    expect(normalisePublicKey("  ")).toBeNull();
    expect(normalisePublicKey("$COMMERCE_WEBHOOK_PUBLIC_KEY")).toBeNull();
  });
});

describe("bodyCandidates", () => {
  test("adds the base64-decoded reading only when plausible", () => {
    const encoded = Buffer.from(BODY).toString("base64");
    expect(bodyCandidates(encoded)).toEqual([encoded, BODY]);
    expect(bodyCandidates(BODY)).toEqual([BODY]);
    expect(bodyCandidates("")).toEqual([]);
    expect(bodyCandidates(undefined)).toEqual([]);
  });
});

describe("verifyWebhook", () => {
  test("accepts a correctly signed text body", () => {
    expect(verifyWebhook(call(BODY, signed(BODY)), PEM)).toEqual({
      body: BODY,
      ok: true,
    });
  });

  test("accepts a base64 raw body and any header case", () => {
    const encoded = Buffer.from(BODY).toString("base64");
    expect(
      verifyWebhook(
        call(encoded, signed(BODY), "X-Adobe-Commerce-Webhook-Signature"),
        PEM,
      ),
    ).toEqual({ body: BODY, ok: true });
  });

  test.each([
    ["no key", call(BODY, signed(BODY)), undefined, "no webhook public key"],
    ["a broken key", call(BODY, signed(BODY)), "not a key", "can't be read"],
    ["no signature", call(BODY, undefined), PEM, "header is missing"],
    ["no raw body", call(undefined, signed(BODY)), PEM, "no raw body"],
    [
      "a tampered body",
      call(BODY.replace("US", "CA"), signed(BODY)),
      PEM,
      "doesn't match",
    ],
    [
      "another key",
      call(BODY, signed(BODY, other.privateKey)),
      PEM,
      "doesn't match",
    ],
    ["a junk signature", call(BODY, "%%%"), PEM, "doesn't match"],
  ])("rejects %s", (_name, params, key, reason) => {
    const result = verifyWebhook(params, key);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(reason);
  });

  test("rejects a call without headers", () => {
    expect(verifyWebhook({ __ow_body: BODY }, PEM).ok).toBe(false);
    expect(verifyWebhook(undefined, PEM).ok).toBe(false);
  });
});
