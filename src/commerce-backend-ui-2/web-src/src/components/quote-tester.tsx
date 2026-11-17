import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Checkbox } from "@react-spectrum/s2/Checkbox";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Delete from "@react-spectrum/s2/icons/Delete";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { TextField } from "@react-spectrum/s2/TextField";
import { useMemo, useState } from "react";

import { normaliseRateRequest, quoteCart } from "#engine";

import {
  EMPTY_LINE,
  MISS_LABELS,
  money,
  toRateRequest,
} from "../lib/methods.ts";

import type {
  ShippingMethod,
  Skipped,
  TestCart,
  TestLine,
} from "../lib/types.ts";

const prose = style({ font: "body", margin: 0 });

export type QuoteTesterProps = {
  cart: TestCart;
  methods: ShippingMethod[];
  onCartChange: (cart: TestCart) => void;
  weightUnit: string;
};

const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
});
const line = style({
  alignItems: "end",
  display: "grid",
  gap: 12,
  gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto",
});

const FREE_NOTES = {
  "cart rule": "Free: cart price rule",
  threshold: "Free: over the threshold",
} as const;

function num(value: number): number {
  return Number.isNaN(value) ? 0 : value;
}

function explain(entry: Skipped): string {
  const misses = Object.entries(entry.misses ?? {});
  if (misses.length === 0) {
    return entry.reason;
  }
  const detail = misses
    .map(
      ([field, count]) =>
        `${count} row${count === 1 ? "" : "s"} on ${MISS_LABELS[field] ?? field}`,
    )
    .join(", ");
  return `${entry.reason} (missed: ${detail})`;
}

/** Quotes a made-up cart with the saved methods, using the same engine as the webhook. */
export function QuoteTester({
  methods,
  cart,
  onCartChange,
  weightUnit,
}: QuoteTesterProps) {
  const [includeOff, setIncludeOff] = useState(false);
  const set = (patch: Partial<TestCart>) => onCartChange({ ...cart, ...patch });
  const setLine = (index: number, patch: Partial<TestLine>) =>
    set({
      lines: cart.lines.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    });

  const { normalised, result } = useMemo(() => {
    const normalisedCart = normaliseRateRequest(toRateRequest(cart));
    const candidates = includeOff
      ? methods.map((method) => ({ ...method, enabled: true }))
      : methods;
    return {
      normalised: normalisedCart,
      result: quoteCart(candidates, normalisedCart),
    };
  }, [cart, includeOff, methods]);

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <Heading level={1} styles={style({ font: "heading-lg", margin: 0 })}>
        Quote a cart
      </Heading>
      <p className={prose}>
        Describe a cart to see which methods and prices checkout would show,
        with the saved rate tables and the same engine as the webhook. Nothing
        is sent to Commerce.
      </p>

      <div className={grid}>
        <TextField
          label="Country"
          onChange={(country) => set({ country })}
          value={cart.country}
        />
        <TextField
          label="Region code"
          onChange={(region) => set({ region })}
          value={cart.region}
        />
        <TextField
          label="Postcode"
          onChange={(postcode) => set({ postcode })}
          value={cart.postcode}
        />
        <TextField
          label="Store view ID"
          onChange={(storeId) => set({ storeId })}
          value={cart.storeId}
        />
        <TextField
          description="0 = guest"
          label="Customer group ID"
          onChange={(customerGroupId) => set({ customerGroupId })}
          value={cart.customerGroupId}
        />
        <NumberField
          label="Discount"
          minValue={0}
          onChange={(discount) => set({ discount: num(discount) })}
          step={0.01}
          value={cart.discount}
        />
      </div>

      <Heading level={2} styles={style({ font: "title", margin: 0 })}>
        Items
      </Heading>
      {cart.lines.map((entry, index) => (
        <div className={line} key={index}>
          <TextField
            label="SKU"
            onChange={(sku) => setLine(index, { sku })}
            value={entry.sku}
          />
          <NumberField
            label="Qty"
            minValue={0}
            onChange={(qty) => setLine(index, { qty: num(qty) })}
            value={entry.qty}
          />
          <NumberField
            label={`Weight (${weightUnit})`}
            minValue={0}
            onChange={(weight) => setLine(index, { weight: num(weight) })}
            step={0.01}
            value={entry.weight}
          />
          <NumberField
            label="Price"
            minValue={0}
            onChange={(price) => setLine(index, { price: num(price) })}
            step={0.01}
            value={entry.price}
          />
          <TextField
            label="Attributes"
            onChange={(attributes) => setLine(index, { attributes })}
            placeholder="shipping_class=oversize"
            value={entry.attributes}
          />
          <ActionButton
            aria-label="Remove item"
            isDisabled={cart.lines.length === 1}
            onPress={() =>
              set({ lines: cart.lines.filter((_, i) => i !== index) })
            }>
            <Delete />
          </ActionButton>
        </div>
      ))}
      <div
        className={style({
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
        })}>
        <Button
          onPress={() => set({ lines: [...cart.lines, { ...EMPTY_LINE }] })}
          variant="secondary">
          Add item
        </Button>
        <Checkbox
          isSelected={cart.freeShipping}
          onChange={(freeShipping) => set({ freeShipping })}>
          A cart price rule gives free shipping
        </Checkbox>
        <Checkbox isSelected={includeOff} onChange={setIncludeOff}>
          Include switched-off methods
        </Checkbox>
      </div>

      <p className={prose}>
        {`Cart: ${normalised.qty} item(s), ${normalised.weight} ${weightUnit}, subtotal ${money(normalised.subtotal)} (${money(normalised.subtotalWithDiscount)} after discount).`}
      </p>

      {result.rates.length === 0 ? (
        <InlineAlert variant="notice">
          <Heading>No table rates for this cart</Heading>
          <Content>
            Checkout would show only the store's other carriers.
          </Content>
        </InlineAlert>
      ) : (
        <TableView aria-label="Rates offered" styles={style({ width: "full" })}>
          <TableHeader>
            <Column isRowHeader>Method</Column>
            <Column>Price</Column>
            <Column>Cost</Column>
            <Column>Row</Column>
            <Column>Note</Column>
          </TableHeader>
          <TableBody
            items={result.rates.map((rate) => ({ ...rate, id: rate.code }))}>
            {(rate) => (
              <Row id={rate.id}>
                <Cell>{`${rate.title} (${rate.code})`}</Cell>
                <Cell>{money(rate.price)}</Cell>
                <Cell>{money(rate.cost)}</Cell>
                <Cell>{String(rate.row + 1)}</Cell>
                <Cell>{rate.free ? FREE_NOTES[rate.free] : ""}</Cell>
              </Row>
            )}
          </TableBody>
        </TableView>
      )}

      {result.skipped.length > 0 && (
        <section aria-label="Methods not offered">
          <Heading level={2} styles={style({ font: "title", margin: 0 })}>
            Not offered
          </Heading>
          <ul>
            {result.skipped.map((entry) => (
              <li className={prose} key={entry.code}>
                {`${entry.title || entry.code}: ${explain(entry)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
