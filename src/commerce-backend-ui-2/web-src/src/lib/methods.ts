import type { RateRow, ShippingMethod, TestCart, TestLine } from "./types.ts";

const LIST_SEPARATOR = /[,;|]/u;
const NON_CODE = /[^a-z0-9]+/gu;
const EDGE_UNDERSCORES = /^_+|_+$/gu;

export const SELECTION_LABELS = {
  cheapest: "Cheapest matching row",
  first: "First matching row (top to bottom)",
  highest: "Most expensive matching row",
} as const;

/** Short versions for the methods table. */
export const SELECTION_SHORT = {
  cheapest: "Cheapest",
  first: "First match",
  highest: "Highest",
} as const;

export const SUBTOTAL_BASIS_LABELS = {
  after_discount: "After discounts",
  before_discount: "Before discounts",
} as const;

/** The condition names the engine reports, in words. */
export const MISS_LABELS: Record<string, string> = {
  attribute: "attribute",
  country: "country",
  postcode: "postcode",
  quantity: "quantity",
  region: "region",
  sku: "SKU",
  subtotal: "subtotal",
  weight: "weight",
};

export function emptyMethod(): ShippingMethod {
  return {
    code: "",
    enabled: false,
    rows: [{ flat: 0 }],
    selection: "first",
    sortOrder: 0,
    title: "",
  };
}

/** A deep copy without database-only fields, safe to edit. */
export function editableCopy(method: ShippingMethod): ShippingMethod {
  const { updatedAt: _updated, ...rest } = structuredClone(method);
  return rest;
}

/** A method code from a title: "Next day (UK)" → "next_day_uk". */
export function toCode(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(NON_CODE, "_")
    .replace(EDGE_UNDERSCORES, "")
    .slice(0, 40);
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value)) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => !isEmpty(entry)),
  ) as T;
}

/** Drops empty fields so the stored method stays small and readable. */
export function cleanMethod(method: ShippingMethod): ShippingMethod {
  const handling = method.handling ? compact(method.handling) : undefined;
  return compact({
    ...method,
    handling: handling && Object.keys(handling).length ? handling : undefined,
    rows: method.rows.map((row) => compact(row)),
  });
}

/** Splits a typed list ("US, CA; MX") into entries. */
export function splitList(text: string): string[] {
  return text
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function joinList(values?: string[]): string {
  return (values ?? []).join(", ");
}

export function money(value: number): string {
  return value.toFixed(2);
}

function range(from?: number, to?: number, unit = ""): string | null {
  if (from === undefined && to === undefined) {
    return null;
  }
  if (to === undefined) {
    return `${from}${unit}+`;
  }
  return `${from ?? 0}–${to}${unit}`;
}

/** "US (CA, NV) 90000-96199" style summary of where a row applies. */
export function describeDestination(row: RateRow): string {
  const parts = [joinList(row.countries) || "Anywhere"];
  if (row.regions?.length) {
    parts.push(`(${joinList(row.regions)})`);
  }
  if (row.postcodes?.length) {
    parts.push(joinList(row.postcodes));
  }
  return parts.join(" ");
}

export function describeLimits(row: RateRow, weightUnit: string): string {
  const parts = [
    range(row.weightFrom, row.weightTo, ` ${weightUnit}`),
    row.subtotalFrom !== undefined || row.subtotalTo !== undefined
      ? `subtotal ${range(row.subtotalFrom, row.subtotalTo)}`
      : null,
    row.qtyFrom !== undefined || row.qtyTo !== undefined
      ? `qty ${range(row.qtyFrom, row.qtyTo)}`
      : null,
  ].filter(Boolean);
  return parts.join(", ") || "Any cart";
}

export function describeProducts(row: RateRow): string {
  const parts: string[] = [];
  if (row.skus?.length) {
    parts.push(`SKU ${joinList(row.skus)}`);
  }
  if (row.attribute) {
    parts.push(
      row.attributeValues?.length
        ? `${row.attribute} = ${joinList(row.attributeValues)}`
        : `has ${row.attribute}`,
    );
  }
  return parts.join("; ") || "Any products";
}

export function describePrice(row: RateRow, weightUnit: string): string {
  const parts: string[] = [];
  if (row.flat) {
    parts.push(money(row.flat));
  }
  if (row.perItem) {
    parts.push(`${money(row.perItem)} / item`);
  }
  if (row.perWeight) {
    parts.push(`${money(row.perWeight)} / ${weightUnit}`);
  }
  if (row.percent) {
    parts.push(`${row.percent}% of subtotal`);
  }
  return parts.join(" + ") || "Free";
}

export function describeMethodPricing(method: ShippingMethod): string {
  const parts: string[] = [];
  if (method.handling?.fixed || method.handling?.percent) {
    parts.push("handling");
  }
  if (method.minPrice !== undefined) {
    parts.push(`min ${money(method.minPrice)}`);
  }
  if (method.maxPrice !== undefined) {
    parts.push(`max ${money(method.maxPrice)}`);
  }
  if (method.freeOver !== undefined) {
    parts.push(`free from ${money(method.freeOver)}`);
  }
  return parts.join(", ") || "Table price only";
}

/** Moves the item at `from` by `step` places (for row order, which "first" selection uses). */
export function move<T>(items: T[], from: number, step: number): T[] {
  const to = from + step;
  if (to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

function parseAttributes(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(";")
      .map((pair) => pair.split("="))
      .filter(([code, value]) => code?.trim() && value !== undefined)
      .map(([code, value]) => [code?.trim() ?? "", value?.trim() ?? ""]),
  );
}

export const DEFAULT_TEST_CART: TestCart = {
  country: "US",
  customerGroupId: "1",
  discount: 0,
  freeShipping: false,
  lines: [
    {
      attributes: "shipping_class=standard",
      price: 30,
      qty: 2,
      sku: "TEE-RED-M",
      weight: 1.5,
    },
    { attributes: "", price: 60, qty: 1, sku: "MUG-01", weight: 1.5 },
  ],
  postcode: "90210",
  region: "CA",
  storeId: "1",
};

export const EMPTY_LINE: TestLine = {
  attributes: "",
  price: 0,
  qty: 1,
  sku: "",
  weight: 0,
};

/**
 * Builds the `rateRequest` Commerce would send for the test cart, so the tester runs the exact
 * path the webhook runs (normaliseRateRequest, then quoteCart).
 */
export function toRateRequest(cart: TestCart): Record<string, unknown> {
  const lines = cart.lines.filter((line) => line.qty > 0);
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  return {
    all_items: lines.map((line, index) => ({
      base_price: line.price,
      item_id: index + 1,
      product: { attributes: parseAttributes(line.attributes), sku: line.sku },
      qty: line.qty,
      sku: line.sku,
      weight: line.weight,
    })),
    customer: { group_id: cart.customerGroupId },
    dest_country_id: cart.country.trim().toUpperCase(),
    dest_postcode: cart.postcode,
    dest_region_code: cart.region.trim().toUpperCase(),
    free_shipping: cart.freeShipping,
    package_qty: lines.reduce((sum, line) => sum + line.qty, 0),
    package_value: subtotal,
    package_value_with_discount: Math.max(0, subtotal - cart.discount),
    package_weight: lines.reduce(
      (sum, line) => sum + line.weight * line.qty,
      0,
    ),
    store_id: cart.storeId,
  };
}

/** Saves text as a file in the browser (CSV export). */
export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
