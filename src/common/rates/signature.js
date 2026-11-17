/**
 * Verifies the signature Adobe Commerce puts on webhook requests.
 *
 * With signatures switched on (Stores > Configuration > Adobe Services > Webhooks > Digital
 * Signature Configuration), Commerce signs the request body with its private key (RSA with
 * SHA-256) and sends the signature, base64-encoded, in `x-adobe-commerce-webhook-signature`.
 * The action needs `raw-http: true` so it sees the exact body that was signed.
 *
 * OpenWhisk passes a raw body either as the text itself or base64-encoded, depending on the
 * content type, so both readings are tried. Verification fails closed: no key, no signature or
 * no body means "not verified".
 */

import { createPublicKey, createVerify } from "node:crypto";

export const SIGNATURE_HEADER = "x-adobe-commerce-webhook-signature";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const PEM_HEADER = /-----BEGIN [A-Z ]+-----/u;
const ESCAPED_NEWLINE = /\\n/gu;
const WHITESPACE = /\s+/gu;

/** Accepts a PEM key, a PEM key with literal "\n" (as .env files store it), or bare base64. */
export function normalisePublicKey(value) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.replace(ESCAPED_NEWLINE, "\n").trim();
  if (text === "" || text.startsWith("$")) {
    return null;
  }
  if (PEM_HEADER.test(text)) {
    return text;
  }
  const body = text.replace(WHITESPACE, "");
  const lines = body.match(/.{1,64}/gu) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

function header(params, name) {
  const headers = params?.__ow_headers ?? {};
  const key = Object.keys(headers).find(
    (entry) => entry.toLowerCase() === name,
  );
  return key ? headers[key] : undefined;
}

/** The body as Commerce sent it, plus its base64-decoded reading when that's plausible. */
export function bodyCandidates(raw) {
  if (typeof raw !== "string" || raw === "") {
    return [];
  }
  const candidates = [raw];
  const compact = raw.trim();
  if (compact.length % 4 === 0 && BASE64.test(compact)) {
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    if (decoded !== raw) {
      candidates.push(decoded);
    }
  }
  return candidates;
}

function verifies(body, signature, key) {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(body);
    verifier.end();
    return verifier.verify(key, signature, "base64");
  } catch {
    return false;
  }
}

/**
 * Checks a raw-http webhook call. Returns `{ ok: true, body }` with the verified body text, or
 * `{ ok: false, reason }`. The reason is for logs only; never send it back to the caller.
 */
export function verifyWebhook(params, publicKey) {
  const pem = normalisePublicKey(publicKey);
  if (!pem) {
    return { ok: false, reason: "no webhook public key is configured" };
  }
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    return { ok: false, reason: "the webhook public key can't be read" };
  }
  const signature = header(params, SIGNATURE_HEADER);
  if (typeof signature !== "string" || signature === "") {
    return { ok: false, reason: `the ${SIGNATURE_HEADER} header is missing` };
  }
  const candidates = bodyCandidates(params?.__ow_body);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "the request has no raw body (is raw-http on for the action?)",
    };
  }
  const body = candidates.find((candidate) =>
    verifies(candidate, signature, key),
  );
  return body === undefined
    ? { ok: false, reason: "the signature doesn't match the body" }
    : { body, ok: true };
}
