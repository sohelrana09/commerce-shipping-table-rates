import { NumberField } from "@react-spectrum/s2/NumberField";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { TextField } from "@react-spectrum/s2/TextField";

import { ListField } from "./list-field.tsx";

import type { RateRow } from "../lib/types.ts";

export type RowEditorProps = {
  onChange: (row: RateRow) => void;
  row: RateRow;
  weightUnit: string;
};

const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
});
const section = style({ font: "title-sm", marginBottom: 0, marginTop: 8 });

function optional(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

type NumberKey =
  | "weightFrom"
  | "weightTo"
  | "subtotalFrom"
  | "subtotalTo"
  | "qtyFrom"
  | "qtyTo"
  | "flat"
  | "perItem"
  | "perWeight"
  | "percent"
  | "cost";

/** Edits one rate row. "From" values are included, "to" values are not (from ≤ x < to). */
export function RowEditor({ row, onChange, weightUnit }: RowEditorProps) {
  const set = (patch: Partial<RateRow>) => onChange({ ...row, ...patch });
  const number = (key: NumberKey, label: string, description?: string) => (
    <NumberField
      description={description}
      label={label}
      minValue={0}
      onChange={(value) => set({ [key]: optional(value) })}
      step={0.01}
      value={row[key] ?? Number.NaN}
    />
  );

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 8 })}>
      <h3 className={section}>Destination</h3>
      <div className={grid}>
        <ListField
          description="Two-letter codes. Empty or * = any country."
          label="Countries"
          onChange={(countries) => set({ countries })}
          placeholder="US, CA"
          value={row.countries}
        />
        <ListField
          description="Region codes or IDs. Empty = any region."
          label="Regions"
          onChange={(regions) => set({ regions })}
          placeholder="CA, NV"
          value={row.regions}
        />
        <ListField
          description="Exact (10001), wildcard (SW1*), range (90000-96199). Start with ! to exclude."
          label="Postcodes"
          onChange={(postcodes) => set({ postcodes })}
          placeholder="90000-96199, !902*"
          value={row.postcodes}
        />
      </div>

      <h3 className={section}>Cart</h3>
      <div className={grid}>
        {number("weightFrom", `Weight from (${weightUnit})`)}
        {number("weightTo", `Weight below (${weightUnit})`)}
        {number("subtotalFrom", "Subtotal from")}
        {number("subtotalTo", "Subtotal below")}
        {number("qtyFrom", "Quantity from")}
        {number("qtyTo", "Quantity below")}
      </div>

      <h3 className={section}>Products</h3>
      <div className={grid}>
        <ListField
          description="The row applies when at least one item matches. * is a wildcard."
          label="SKUs"
          onChange={(skus) => set({ skus })}
          placeholder="FURN-*, TV-65"
          value={row.skus}
        />
        <TextField
          description="Attribute code sent with the cart items."
          label="Attribute"
          onChange={(attribute) =>
            set({ attribute: attribute.trim() || undefined })
          }
          placeholder="shipping_class"
          value={row.attribute ?? ""}
        />
        <ListField
          description="Empty = any value."
          label="Attribute values"
          onChange={(attributeValues) => set({ attributeValues })}
          placeholder="oversize, fragile"
          value={row.attributeValues}
        />
      </div>

      <h3 className={section}>Price</h3>
      <div className={grid}>
        {number("flat", "Per order")}
        {number("perItem", "Per item")}
        {number(
          "perWeight",
          `Per ${weightUnit}`,
          "Uses the method's weight step.",
        )}
        {number("percent", "Percent of subtotal")}
        {number(
          "cost",
          "Your cost",
          "Optional, for reports. Defaults to the price.",
        )}
      </div>
    </div>
  );
}
