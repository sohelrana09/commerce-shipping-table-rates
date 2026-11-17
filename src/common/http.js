/** Small HTTP helpers shared by the Admin and webhook actions. */

export function json(statusCode, body) {
  return {
    body,
    headers: { "Content-Type": "application/json" },
    statusCode,
  };
}

/** The request body, whether the platform parsed it into params or passed it as a string. */
export function readBody(params = {}) {
  let { body } = params;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  if (body && typeof body === "object") {
    return body;
  }
  // Without raw-http, JSON body fields arrive as top-level params.
  const { __ow_headers: _h, __ow_method: _m, __ow_path: _p, ...rest } = params;
  return rest;
}
