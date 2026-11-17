export type {
  Cart,
  Rate,
  RateRow,
  Selection,
  ShippingMethod,
  Skipped,
  SubtotalBasis,
} from "#engine";

export type Option = { id: string; label: string };

export type Country = Option & {
  regions: { code: string; id: string; label: string }[];
};

export type Lookups = {
  storeViews: (Option & { code?: string })[];
  customerGroups: Option[];
  countries: Country[];
  unavailable?: boolean;
};

/** The App Management settings the page shows (read-only here). */
export type PageSettings = {
  carrierCode: string;
  carrierTitle: string;
  ratesEnabled: boolean;
  weightUnit: "kg" | "lbs";
};

/** One line of the "Quote a cart" tester. */
export type TestLine = {
  sku: string;
  qty: number;
  weight: number;
  price: number;
  /** `code=value` pairs separated by ";". */
  attributes: string;
};

export type TestCart = {
  country: string;
  region: string;
  postcode: string;
  storeId: string;
  customerGroupId: string;
  discount: number;
  freeShipping: boolean;
  lines: TestLine[];
};
