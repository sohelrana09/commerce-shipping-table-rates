// Types for engine.js, so the Admin page (TypeScript) gets checked against the shared engine.

export type Selection = "first" | "cheapest" | "highest";
export type SubtotalBasis = "before_discount" | "after_discount";

export type RateRow = {
  countries?: string[];
  regions?: string[];
  postcodes?: string[];
  weightFrom?: number;
  weightTo?: number;
  subtotalFrom?: number;
  subtotalTo?: number;
  qtyFrom?: number;
  qtyTo?: number;
  skus?: string[];
  attribute?: string;
  attributeValues?: string[];
  flat?: number;
  perItem?: number;
  perWeight?: number;
  percent?: number;
  cost?: number;
};

export type ShippingMethod = {
  code: string;
  title: string;
  enabled?: boolean;
  sortOrder?: number;
  storeIds?: string[];
  customerGroups?: string[];
  selection?: Selection;
  subtotalBasis?: SubtotalBasis;
  weightStep?: number;
  handling?: { fixed?: number; percent?: number };
  minPrice?: number;
  maxPrice?: number;
  freeOver?: number;
  honourFreeShipping?: boolean;
  rows: RateRow[];
  updatedAt?: string;
};

export type CartItem = {
  sku: string;
  qty: number;
  weight: number;
  price: number;
  attributes: Record<string, unknown>;
  childOf: string | null;
  isVirtual: boolean;
};

export type Cart = {
  country: string;
  region: string;
  regionId: string;
  postcode: string;
  storeId: string;
  customerGroupId: string;
  currency: string;
  weight: number;
  qty: number;
  subtotal: number;
  subtotalWithDiscount: number;
  freeShipping: boolean;
  items: CartItem[];
};

export type Rate = {
  code: string;
  title: string;
  price: number;
  cost: number;
  row: number;
  sortOrder: number;
  free: "threshold" | "cart rule" | null;
};

export type Skipped = {
  code: string;
  title: string;
  reason: string;
  misses?: Record<string, number>;
};

export declare const SELECTIONS: Selection[];
export declare const SUBTOTAL_BASES: SubtotalBasis[];
export declare const MAX_ROWS: number;
export declare function roundMoney(value: number): number;
export declare function matchGlob(pattern: string, value: unknown): boolean;
export declare function normalisePostcode(value: unknown): string;
export declare function matchPostcode(
  patterns: string[] | string | undefined,
  value: unknown,
): boolean;
export declare function normaliseRateRequest(
  request?: Record<string, unknown>,
): Cart;
export declare function validateMethod(method: unknown): string[];
export declare function rowMismatch(
  row: RateRow,
  cart: Cart,
  method?: Partial<ShippingMethod>,
): string | null;
export declare function billableWeight(weight: number, step?: number): number;
export declare function rowPrice(
  row: RateRow,
  cart: Cart,
  method?: Partial<ShippingMethod>,
): number;
export declare function quoteMethod(
  method: ShippingMethod,
  cart: Cart,
): { rate?: Rate | null; reason?: string; misses?: Record<string, number> };
export declare function quoteCart(
  methods: ShippingMethod[],
  cart: Cart,
): { rates: Rate[]; skipped: Skipped[] };
