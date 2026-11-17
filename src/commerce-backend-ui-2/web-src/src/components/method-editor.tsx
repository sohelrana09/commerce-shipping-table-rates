import { AlertDialog } from "@react-spectrum/s2/AlertDialog";
import { Button } from "@react-spectrum/s2/Button";
import { ButtonGroup } from "@react-spectrum/s2/ButtonGroup";
import { Content } from "@react-spectrum/s2/Content";
import { DialogTrigger } from "@react-spectrum/s2/Dialog";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { Switch } from "@react-spectrum/s2/Switch";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Tab, TabList, TabPanel, Tabs } from "@react-spectrum/s2/Tabs";
import { TextField } from "@react-spectrum/s2/TextField";
import { useState } from "react";

import { ApiError } from "../lib/api-error.ts";
import {
  cleanMethod,
  SELECTION_LABELS,
  SUBTOTAL_BASIS_LABELS,
  toCode,
} from "../lib/methods.ts";
import { RatesTable } from "./rates-table.tsx";
import { ScopePicker } from "./scope-picker.tsx";

import type {
  Lookups,
  Selection,
  ShippingMethod,
  SubtotalBasis,
} from "../lib/types.ts";

const prose = style({ font: "body", margin: 0 });

export type MethodEditorProps = {
  initial: ShippingMethod;
  lookups: Lookups | null;
  onCancel: () => void;
  onDelete: (code: string) => Promise<void>;
  onSave: (method: ShippingMethod, previousCode?: string) => Promise<void>;
  /** The saved code when editing; undefined for a new method. */
  originalCode?: string;
  weightUnit: string;
};

const column = style({
  display: "flex",
  flexDirection: "column",
  gap: 16,
  paddingY: 16,
});
const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
});

function optional(value: number): number | undefined {
  return Number.isNaN(value) ? undefined : value;
}

export function MethodEditor({
  initial,
  originalCode,
  lookups,
  onSave,
  onDelete,
  onCancel,
  weightUnit,
}: MethodEditorProps) {
  const [method, setMethod] = useState<ShippingMethod>(initial);
  const [codeTouched, setCodeTouched] = useState(Boolean(initial.code));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const isNew = originalCode === undefined;
  const set = (patch: Partial<ShippingMethod>) =>
    setMethod((current) => ({ ...current, ...patch }));
  const setHandling = (patch: { fixed?: number; percent?: number }) =>
    set({ handling: { ...method.handling, ...patch } });

  const handleSave = async () => {
    setSaving(true);
    setErrors([]);
    try {
      await onSave(cleanMethod(method), originalCode);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.errors.length
          ? error.errors
          : [(error as Error).message],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 8 })}>
      <div
        className={style({
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        })}>
        <Heading level={1} styles={style({ flexGrow: 1 })}>
          {isNew ? "New shipping method" : method.title || originalCode}
        </Heading>
        <ButtonGroup>
          {!isNew && (
            <DialogTrigger>
              <Button variant="negative">Delete</Button>
              <AlertDialog
                onPrimaryAction={() => onDelete(originalCode)}
                primaryActionLabel="Delete"
                secondaryActionLabel="Cancel"
                title="Delete this shipping method?"
                variant="destructive">
                Shoppers stop seeing “{method.title}” at checkout within a
                minute. Orders already placed keep their shipping.
              </AlertDialog>
            </DialogTrigger>
          )}
          <Button onPress={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            isDisabled={!(method.code && method.title)}
            isPending={saving}
            onPress={handleSave}
            variant="accent">
            Save
          </Button>
        </ButtonGroup>
      </div>

      {errors.length > 0 && (
        <InlineAlert variant="negative">
          <Heading>The method wasn't saved</Heading>
          <Content>
            {errors.slice(0, 12).map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Content>
        </InlineAlert>
      )}

      <Tabs aria-label="Method settings" defaultSelectedKey="rates">
        <TabList>
          <Tab id="general">General</Tab>
          <Tab id="rates">{`Rate table (${method.rows.length})`}</Tab>
          <Tab id="pricing">Pricing</Tab>
          <Tab id="scope">Stores & groups</Tab>
        </TabList>

        <TabPanel id="general">
          <div className={column}>
            <div className={grid}>
              <TextField
                description="Shown to shoppers at checkout."
                isRequired
                label="Title"
                onChange={(title) =>
                  set(codeTouched ? { title } : { code: toCode(title), title })
                }
                value={method.title}
              />
              <TextField
                description="Lower-case letters, digits and underscores. Commerce stores it on orders."
                isRequired
                label="Method code"
                onChange={(code) => {
                  setCodeTouched(true);
                  set({ code: code.trim().toLowerCase() });
                }}
                value={method.code}
              />
              <NumberField
                description="Lower comes first at checkout."
                label="Sort order"
                onChange={(sortOrder) =>
                  set({ sortOrder: optional(sortOrder) })
                }
                value={method.sortOrder ?? Number.NaN}
              />
            </div>
            <Switch
              isSelected={method.enabled !== false}
              onChange={(enabled) => set({ enabled })}>
              Offer this method at checkout
            </Switch>
            <div className={grid}>
              <Picker
                description="Which row prices the cart when several match."
                label="Row selection"
                onChange={(selection) =>
                  set({ selection: selection as Selection })
                }
                value={method.selection ?? "first"}>
                {Object.entries(SELECTION_LABELS).map(([id, label]) => (
                  <PickerItem id={id} key={id}>
                    {label}
                  </PickerItem>
                ))}
              </Picker>
              <Picker
                description="The subtotal that row conditions, percent prices and the free threshold use."
                label="Subtotal"
                onChange={(subtotalBasis) =>
                  set({ subtotalBasis: subtotalBasis as SubtotalBasis })
                }
                value={method.subtotalBasis ?? "before_discount"}>
                {Object.entries(SUBTOTAL_BASIS_LABELS).map(([id, label]) => (
                  <PickerItem id={id} key={id}>
                    {label}
                  </PickerItem>
                ))}
              </Picker>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="rates">
          <div className={column}>
            <RatesTable
              methodCode={method.code}
              onChange={(rows) => set({ rows })}
              rows={method.rows}
              weightUnit={weightUnit}
            />
          </div>
        </TabPanel>

        <TabPanel id="pricing">
          <div className={column}>
            <p className={prose}>
              Applied after the row price, in this order: weight step, handling
              fee, minimum and maximum, then free shipping.
            </p>
            <div className={grid}>
              <NumberField
                description={`Round the cart weight up to a multiple of this before per-${weightUnit} prices (0.5, 1). Empty = exact weight.`}
                label={`Weight step (${weightUnit})`}
                minValue={0}
                onChange={(weightStep) =>
                  set({ weightStep: optional(weightStep) })
                }
                step={0.01}
                value={method.weightStep ?? Number.NaN}
              />
              <NumberField
                label="Handling fee"
                minValue={0}
                onChange={(fixed) => setHandling({ fixed: optional(fixed) })}
                step={0.01}
                value={method.handling?.fixed ?? Number.NaN}
              />
              <NumberField
                description="Percent of the row price."
                label="Handling percent"
                minValue={0}
                onChange={(percent) =>
                  setHandling({ percent: optional(percent) })
                }
                step={0.1}
                value={method.handling?.percent ?? Number.NaN}
              />
              <NumberField
                label="Minimum price"
                minValue={0}
                onChange={(minPrice) => set({ minPrice: optional(minPrice) })}
                step={0.01}
                value={method.minPrice ?? Number.NaN}
              />
              <NumberField
                label="Maximum price"
                minValue={0}
                onChange={(maxPrice) => set({ maxPrice: optional(maxPrice) })}
                step={0.01}
                value={method.maxPrice ?? Number.NaN}
              />
              <NumberField
                description="Free when the subtotal reaches this. Empty = never."
                label="Free shipping from"
                minValue={0}
                onChange={(freeOver) => set({ freeOver: optional(freeOver) })}
                step={0.01}
                value={method.freeOver ?? Number.NaN}
              />
            </div>
            <Switch
              isSelected={method.honourFreeShipping !== false}
              onChange={(honourFreeShipping) => set({ honourFreeShipping })}>
              Make it free when a cart price rule gives free shipping
            </Switch>
          </div>
        </TabPanel>

        <TabPanel id="scope">
          <div className={column}>
            <ScopePicker
              available={lookups?.storeViews ?? []}
              description="Leave empty to offer it in every store view."
              label="Store views"
              onChange={(storeIds) => set({ storeIds })}
              unavailable={lookups?.unavailable}
              value={method.storeIds ?? []}
            />
            <ScopePicker
              available={lookups?.customerGroups ?? []}
              description="Leave empty to offer it to every customer group, including guests (group 0)."
              label="Customer groups"
              onChange={(customerGroups) => set({ customerGroups })}
              unavailable={lookups?.unavailable}
              value={method.customerGroups ?? []}
            />
          </div>
        </TabPanel>
      </Tabs>
    </main>
  );
}
