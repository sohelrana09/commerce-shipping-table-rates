/**
 * Shipping Table Rates engine. Dependency-free: the shipping webhook, the Admin actions and the
 * Admin page's "Quote a cart" tester all run this same file.
 *
 * A method is a rate table: rows with conditions (destination, weight, subtotal, quantity, SKU or
 * attribute) and prices (flat, per item, per weight unit, percent of subtotal). For a cart, the
 * engine finds the matching rows, picks one (first, cheapest or highest), then applies the
 * method's handling fee, minimum, maximum and free-shipping threshold.
 *
 * Ranges include their lower bound and exclude their upper bound (from <= value < to), so
 * adjacent rows (0-5, 5-10) never overlap.
 */

export const SELECTIONS = ["first", "cheapest", "highest"];
export const SUBTOTAL_BASES = ["before_discount", "after_discount"];
export const MAX_ROWS = 5000;

const CODE_PATTERN = /^[a-z0-9_]{1,40}$/u;
const COUNTRY_PATTERN = /^[A-Z]{2}$/u;
const RANGE_PATTERN = /^(?<from>[A-Z0-9]+)-(?<to>[A-Z0-9]+)$/u;
const LIST_SEPARATOR = /[,;|]/u;
const DIGITS = /^\d+$/u;
const WHITESPACE = /\s+/gu;
const GLOB_SPECIAL = /[.+^${}()|[\]\\]/gu;

const RANGES = [
  ["weightFrom", "weightTo", "weight"],
  ["subtotalFrom", "subtotalTo", "subtotal"],
  ["qtyFrom", "qtyTo", "quantity"],
];

const PRICE_FIELDS = ["flat", "perItem", "perWeight", "percent", "cost"];

/* ------------------------------------------------------------------ helpers */

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

function toNumber(value, fallback = 0) {
  if (isBlank(value)) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Rounds money to cents without the usual 1.005 floating point surprise. */
export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function list(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry !== "");
  }
  if (isBlank(value)) {
    return [];
  }
  return String(value)
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** Turns a `*` and `?` pattern into an anchored, case-insensitive regular expression. */
function globToRegExp(pattern) {
  const source = pattern
    .replace(GLOB_SPECIAL, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${source}$`, "iu");
}

export function matchGlob(pattern, value) {
  if (isBlank(value)) {
    return false;
  }
  return globToRegExp(String(pattern)).test(String(value));
}

/* --------------------------------------------------------------- postcodes */

/** Upper case without spaces: "sw1a 1aa" and "SW1A1AA" are the same postcode. */
export function normalisePostcode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(WHITESPACE, "");
}

function inPostcodeRange(from, to, postcode) {
  // A range compares as many leading characters as its bounds have: 90000-96199 checks the
  // first five characters, so ZIP+4 codes (90210-1234) fall inside it too.
  const head = postcode.replaceAll("-", "").slice(0, from.length);
  if (head.length < from.length) {
    return false;
  }
  if (DIGITS.test(from) && DIGITS.test(to) && DIGITS.test(head)) {
    return Number(head) >= Number(from) && Number(head) <= Number(to);
  }
  return head >= from && head <= to;
}

function matchOnePostcode(pattern, postcode) {
  const range = RANGE_PATTERN.exec(pattern)?.groups;
  if (range && range.from.length === range.to.length) {
    return inPostcodeRange(range.from, range.to, postcode);
  }
  if (pattern.includes("*") || pattern.includes("?")) {
    return matchGlob(pattern, postcode);
  }
  return (
    pattern === postcode ||
    pattern.replaceAll("-", "") === postcode.replaceAll("-", "")
  );
}

/**
 * Whether a postcode matches a list of patterns. A pattern is an exact code (10001), a wildcard
 * (SW1*, 9021?) or a range of equal-length bounds (90000-96199, AB10-AB16). Patterns starting
 * with "!" exclude. An empty list matches every postcode, including a missing one.
 */
export function matchPostcode(patterns, value) {
  const all = list(patterns).map(normalisePostcode);
  if (all.length === 0) {
    return true;
  }
  const postcode = normalisePostcode(value);
  const include = all.filter((pattern) => !pattern.startsWith("!"));
  const exclude = all
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  if (!postcode) {
    return include.length === 0;
  }
  if (exclude.some((pattern) => matchOnePostcode(pattern, postcode))) {
    return false;
  }
  return (
    include.length === 0 ||
    include.some((pattern) => matchOnePostcode(pattern, postcode))
  );
}

/* --------------------------------------------------------------------- cart */

function readAttributes(product = {}) {
  const attributes = {};
  const add = (code, value) => {
    if (code && !isBlank(value)) {
      attributes[String(code)] = value;
    }
  };
  const source = product?.attributes;
  if (Array.isArray(source)) {
    for (const entry of source) {
      add(entry?.attribute_code ?? entry?.code ?? entry?.name, entry?.value);
    }
  } else if (source && typeof source === "object") {
    for (const [code, value] of Object.entries(source)) {
      add(code, value);
    }
  }
  for (const entry of product?.custom_attributes ?? []) {
    add(entry?.attribute_code, entry?.value);
  }
  return attributes;
}

function normaliseItem(item = {}) {
  const product = item.product ?? {};
  const attributes = readAttributes(product);
  return {
    attributes,
    childOf: isBlank(item.parent_item_id) ? null : String(item.parent_item_id),
    isVirtual: Boolean(item.is_virtual ?? product.is_virtual),
    price: toNumber(item.base_price ?? item.price ?? product.price),
    qty: toNumber(item.qty ?? item.qty_ordered ?? item.quantity, 1),
    sku: String(item.sku ?? product.sku ?? ""),
    weight: toNumber(item.weight ?? product.weight ?? attributes.weight),
  };
}

/**
 * Turns the webhook's `rateRequest` into the cart the engine works with. Package totals from
 * Commerce win; item sums are the fallback when Commerce leaves them out. Child items of
 * configurable and bundle products are kept for SKU and attribute matching but not counted
 * twice.
 */
export function normaliseRateRequest(request = {}) {
  const items = (request.all_items ?? request.items ?? []).map(normaliseItem);
  const counted = items.filter((item) => !(item.childOf || item.isVirtual));
  const sum = (pick) =>
    counted.reduce((total, item) => total + pick(item) * item.qty, 0);

  const subtotal = toNumber(
    request.package_value ?? request.base_subtotal_incl_tax,
    sum((item) => item.price),
  );
  return {
    country: String(request.dest_country_id ?? "").toUpperCase(),
    currency:
      request.package_currency?.currency_code ??
      request.base_currency?.currency_code ??
      "",
    customerGroupId: isBlank(request.customer?.group_id)
      ? "0"
      : String(request.customer.group_id),
    freeShipping: Boolean(request.free_shipping),
    items,
    postcode: String(request.dest_postcode ?? ""),
    qty: toNumber(
      request.package_qty,
      sum(() => 1),
    ),
    region: String(request.dest_region_code ?? ""),
    regionId: isBlank(request.dest_region_id)
      ? ""
      : String(request.dest_region_id),
    storeId: isBlank(request.store_id) ? "" : String(request.store_id),
    subtotal,
    subtotalWithDiscount: toNumber(
      request.package_value_with_discount,
      subtotal,
    ),
    weight: toNumber(
      request.package_weight,
      sum((item) => item.weight),
    ),
  };
}

/* --------------------------------------------------------------- validation */

function checkNumber(errors, where, field, value) {
  if (isBlank(value)) {
    return;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    errors.push(`${where}: ${field} must be a number`);
  } else if (number < 0) {
    errors.push(`${where}: ${field} can't be negative`);
  }
}

function validateRow(row, index, errors) {
  const where = `row ${index + 1}`;
  if (!row || typeof row !== "object") {
    errors.push(`${where}: must be an object`);
    return;
  }
  for (const country of list(row.countries)) {
    if (country !== "*" && !COUNTRY_PATTERN.test(country.toUpperCase())) {
      errors.push(
        `${where}: "${country}" isn't a two-letter country code (use * for any)`,
      );
    }
  }
  for (const [from, to, label] of RANGES) {
    checkNumber(errors, where, `${label} from`, row[from]);
    checkNumber(errors, where, `${label} to`, row[to]);
    if (
      !(isBlank(row[from]) || isBlank(row[to])) &&
      Number(row[from]) >= Number(row[to])
    ) {
      errors.push(`${where}: ${label} from must be below ${label} to`);
    }
  }
  for (const field of PRICE_FIELDS) {
    checkNumber(errors, where, field, row[field]);
  }
  if (toNumber(row.percent) > 100) {
    errors.push(`${where}: percent can't be over 100`);
  }
  if (list(row.attributeValues).length > 0 && isBlank(row.attribute)) {
    errors.push(`${where}: attribute values need an attribute code`);
  }
}

/** Every problem with a method, as plain sentences. An empty list means it's valid. */
export function validateMethod(method) {
  const errors = [];
  if (!method || typeof method !== "object") {
    return ["method must be an object"];
  }
  if (!CODE_PATTERN.test(String(method.code ?? ""))) {
    errors.push(
      "code must be 1 to 40 lower-case letters, digits or underscores",
    );
  }
  if (isBlank(method.title) || String(method.title).trim() === "") {
    errors.push("title is required");
  }
  if (!(isBlank(method.selection) || SELECTIONS.includes(method.selection))) {
    errors.push(`selection must be one of: ${SELECTIONS.join(", ")}`);
  }
  if (
    !(
      isBlank(method.subtotalBasis) ||
      SUBTOTAL_BASES.includes(method.subtotalBasis)
    )
  ) {
    errors.push(`subtotalBasis must be one of: ${SUBTOTAL_BASES.join(", ")}`);
  }
  for (const field of [
    "weightStep",
    "minPrice",
    "maxPrice",
    "freeOver",
    "sortOrder",
  ]) {
    checkNumber(errors, "method", field, method[field]);
  }
  checkNumber(errors, "method", "handling fee", method.handling?.fixed);
  checkNumber(errors, "method", "handling percent", method.handling?.percent);
  if (
    !(isBlank(method.minPrice) || isBlank(method.maxPrice)) &&
    Number(method.minPrice) > Number(method.maxPrice)
  ) {
    errors.push("method: minimum price can't be above the maximum price");
  }
  if (Array.isArray(method.rows)) {
    if (method.rows.length > MAX_ROWS) {
      errors.push(`a method can have at most ${MAX_ROWS} rows`);
    }
    for (const [index, row] of method.rows.entries()) {
      validateRow(row, index, errors);
    }
  } else {
    errors.push("rows must be a list");
  }
  return errors;
}

/* ----------------------------------------------------------------- matching */

function inRange(value, from, to) {
  return (
    (isBlank(from) || value >= Number(from)) &&
    (isBlank(to) || value < Number(to))
  );
}

function subtotalFor(method, cart) {
  return method.subtotalBasis === "after_discount"
    ? cart.subtotalWithDiscount
    : cart.subtotal;
}

function itemMatches(row, item) {
  const skus = list(row.skus);
  if (
    skus.length > 0 &&
    !skus.some((pattern) => matchGlob(pattern, item.sku))
  ) {
    return false;
  }
  if (isBlank(row.attribute)) {
    return true;
  }
  const value = item.attributes[row.attribute];
  if (isBlank(value)) {
    return false;
  }
  const wanted = list(row.attributeValues).map((entry) => entry.toLowerCase());
  if (wanted.length === 0) {
    return true;
  }
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.some((entry) =>
    wanted.includes(String(entry).trim().toLowerCase()),
  );
}

/**
 * Why a row doesn't apply to the cart, or null when it does. The reasons feed the Admin tester.
 */
export function rowMismatch(row, cart, method = {}) {
  const countries = list(row.countries).map((entry) => entry.toUpperCase());
  if (
    countries.length > 0 &&
    !countries.includes("*") &&
    !countries.includes(cart.country)
  ) {
    return "country";
  }
  const regions = list(row.regions).map((entry) => entry.toUpperCase());
  if (
    regions.length > 0 &&
    !regions.includes("*") &&
    !regions.includes(cart.region.toUpperCase()) &&
    !(cart.regionId && regions.includes(cart.regionId))
  ) {
    return "region";
  }
  if (!matchPostcode(row.postcodes, cart.postcode)) {
    return "postcode";
  }
  if (!inRange(cart.weight, row.weightFrom, row.weightTo)) {
    return "weight";
  }
  if (!inRange(subtotalFor(method, cart), row.subtotalFrom, row.subtotalTo)) {
    return "subtotal";
  }
  if (!inRange(cart.qty, row.qtyFrom, row.qtyTo)) {
    return "quantity";
  }
  const filtersItems = list(row.skus).length > 0 || !isBlank(row.attribute);
  if (filtersItems && !cart.items.some((item) => itemMatches(row, item))) {
    return list(row.skus).length > 0 ? "sku" : "attribute";
  }
  return null;
}

/** Billable weight: the cart weight rounded up to the method's weight step (0 = exact). */
export function billableWeight(weight, step) {
  const size = toNumber(step);
  if (size <= 0) {
    return weight;
  }
  // The small tolerance keeps 1.5 / 0.5 at 3 steps despite floating point.
  const steps = Math.ceil(weight / size - 1e-9);
  return Math.round(steps * size * 1e6) / 1e6;
}

/** The row's own price for the cart, before handling, limits and free shipping. */
export function rowPrice(row, cart, method = {}) {
  const weight = billableWeight(cart.weight, method.weightStep);
  return (
    toNumber(row.flat) +
    toNumber(row.perItem) * cart.qty +
    toNumber(row.perWeight) * weight +
    (toNumber(row.percent) / 100) * subtotalFor(method, cart)
  );
}

function pickRow(candidates, selection) {
  if (selection === "cheapest") {
    return candidates.reduce((best, next) =>
      next.base < best.base ? next : best,
    );
  }
  if (selection === "highest") {
    return candidates.reduce((best, next) =>
      next.base > best.base ? next : best,
    );
  }
  return candidates[0];
}

function inList(values, value) {
  const wanted = list(values);
  return wanted.length === 0 || wanted.includes(String(value));
}

/** The rows that apply (just the first one for "first"), and why the others didn't. */
function matchRows(method, cart) {
  const misses = {};
  const candidates = [];
  const firstOnly = (method.selection ?? "first") === "first";
  for (const [index, row] of (method.rows ?? []).entries()) {
    const miss = rowMismatch(row, cart, method);
    if (miss) {
      misses[miss] = (misses[miss] ?? 0) + 1;
    } else {
      candidates.push({ base: rowPrice(row, cart, method), index, row });
      if (firstOnly) {
        break;
      }
    }
  }
  return { candidates, misses };
}

/** Adds the handling fee, applies the minimum and maximum, then free shipping. */
function finalPrice(method, cart, base) {
  const handling = method.handling ?? {};
  let price =
    base + toNumber(handling.fixed) + (base * toNumber(handling.percent)) / 100;
  if (!isBlank(method.minPrice)) {
    price = Math.max(price, Number(method.minPrice));
  }
  if (!isBlank(method.maxPrice)) {
    price = Math.min(price, Number(method.maxPrice));
  }
  let free = null;
  if (
    !isBlank(method.freeOver) &&
    subtotalFor(method, cart) >= Number(method.freeOver)
  ) {
    free = "threshold";
  } else if (cart.freeShipping && method.honourFreeShipping !== false) {
    free = "cart rule";
  }
  return { free, price: free ? 0 : roundMoney(Math.max(0, price)) };
}

/**
 * Quotes one method for a cart. Returns `{ rate }` when the method applies, or `{ reason }`
 * (and, for the tester, how many rows failed on each condition) when it doesn't.
 */
export function quoteMethod(method, cart) {
  if (method.enabled === false) {
    return { rate: null, reason: "switched off" };
  }
  if (!inList(method.storeIds, cart.storeId)) {
    return { rate: null, reason: "not offered in this store view" };
  }
  if (!inList(method.customerGroups, cart.customerGroupId)) {
    return { rate: null, reason: "not offered to this customer group" };
  }
  const { candidates, misses } = matchRows(method, cart);
  if (candidates.length === 0) {
    return { misses, rate: null, reason: "no row matches this cart" };
  }
  const chosen = pickRow(candidates, method.selection ?? "first");
  const { free, price } = finalPrice(method, cart, chosen.base);
  return {
    rate: {
      code: method.code,
      cost: roundMoney(
        isBlank(chosen.row.cost) ? chosen.base : Number(chosen.row.cost),
      ),
      free,
      price,
      row: chosen.index,
      sortOrder: toNumber(method.sortOrder),
      title: method.title,
    },
  };
}

/**
 * Quotes every method for a cart: the rates to offer, sorted by sort order then price, and why
 * the others were left out. Invalid methods are skipped (and reported), never thrown on.
 */
export function quoteCart(methods, cart) {
  const rates = [];
  const skipped = [];
  for (const method of methods ?? []) {
    const errors = validateMethod(method);
    if (errors.length > 0) {
      skipped.push({
        code: method?.code ?? "",
        reason: `invalid: ${errors[0]}`,
        title: method?.title ?? "",
      });
      continue;
    }
    const { rate, ...result } = quoteMethod(method, cart);
    if (rate) {
      rates.push(rate);
    } else {
      skipped.push({
        code: method.code,
        misses: result.misses,
        reason: result.reason,
        title: method.title,
      });
    }
  }
  rates.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.price - b.price ||
      a.code.localeCompare(b.code),
  );
  return { rates, skipped };
}
