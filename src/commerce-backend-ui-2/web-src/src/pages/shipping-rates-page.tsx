import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Content } from "@react-spectrum/s2/Content";
import { Divider } from "@react-spectrum/s2/Divider";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Text } from "@react-spectrum/s2/Text";
import { ToggleButton } from "@react-spectrum/s2/ToggleButton";
import { useCallback, useEffect, useState } from "react";

import { MethodEditor } from "../components/method-editor.tsx";
import { MethodsList } from "../components/methods-list.tsx";
import { QuoteTester } from "../components/quote-tester.tsx";
import { useRatesApi } from "../hooks/use-rates-api.ts";
import {
  DEFAULT_TEST_CART,
  editableCopy,
  emptyMethod,
} from "../lib/methods.ts";

import type {
  Lookups,
  PageSettings,
  ShippingMethod,
  TestCart,
} from "../lib/types.ts";

type View = "methods" | "quote";
type Editing = { method: ShippingMethod; originalCode?: string } | null;

export function ShippingRatesPage() {
  const api = useRatesApi();
  const [view, setView] = useState<View>("methods");
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [examples, setExamples] = useState<ShippingMethod[]>([]);
  const [settings, setSettings] = useState<PageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [testCart, setTestCart] = useState<TestCart>(DEFAULT_TEST_CART);
  const weightUnit = settings?.weightUnit ?? "kg";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listMethods();
      setMethods(data.methods);
      setExamples(data.examples);
      setSettings(data.settings);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    api.lookups().then(setLookups, () =>
      setLookups({
        countries: [],
        customerGroups: [],
        storeViews: [],
        unavailable: true,
      }),
    );
  }, [api, load]);

  const handleEdit = useCallback(
    (code: string) => {
      const method = methods.find((entry) => entry.code === code);
      if (method) {
        setEditing({ method: editableCopy(method), originalCode: code });
      }
    },
    [methods],
  );

  const handleCreate = useCallback((template?: ShippingMethod) => {
    setEditing({
      method: template
        ? { ...editableCopy(template), enabled: false }
        : emptyMethod(),
    });
  }, []);

  const handleSave = async (method: ShippingMethod, previousCode?: string) => {
    await api.saveMethod(method, previousCode);
    setEditing(null);
    setNotice(
      `Saved “${method.title}”. Checkout uses the change within a minute.`,
    );
    await load();
  };

  const handleDelete = async (code: string) => {
    await api.deleteMethod(code);
    setEditing(null);
    setNotice("Shipping method deleted.");
    await load();
  };

  const page = style({
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 24,
  });

  if (editing) {
    return (
      <div className={page}>
        <MethodEditor
          initial={editing.method}
          key={editing.originalCode ?? "new"}
          lookups={lookups}
          onCancel={() => setEditing(null)}
          onDelete={handleDelete}
          onSave={handleSave}
          originalCode={editing.originalCode}
          weightUnit={weightUnit}
        />
      </div>
    );
  }

  return (
    <div className={page}>
      <div className={style({ display: "flex", gap: 8 })}>
        <ToggleButton
          isSelected={view === "methods"}
          onChange={() => setView("methods")}>
          Methods
        </ToggleButton>
        <ToggleButton
          isSelected={view === "quote"}
          onChange={() => setView("quote")}>
          Quote a cart
        </ToggleButton>
      </div>
      <Divider />

      {settings && !settings.ratesEnabled && (
        <InlineAlert variant="notice">
          <Heading>Table rates are switched off</Heading>
          <Content>
            Checkout shows none of these methods until “Offer table rates at
            checkout” is switched on in App Management.
          </Content>
        </InlineAlert>
      )}

      {notice && (
        <InlineAlert variant="positive">
          <Heading>Done</Heading>
          <Content>
            <div
              className={style({
                alignItems: "center",
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              })}>
              <Text>{notice}</Text>
              <ActionButton isQuiet onPress={() => setNotice(null)}>
                Dismiss
              </ActionButton>
            </div>
          </Content>
        </InlineAlert>
      )}

      {view === "methods" ? (
        <MethodsList
          error={error}
          examples={examples}
          loading={loading}
          methods={methods}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onReload={load}
        />
      ) : (
        <QuoteTester
          cart={testCart}
          methods={methods}
          onCartChange={setTestCart}
          weightUnit={weightUnit}
        />
      )}

      {settings && (
        <Text styles={style({ color: "gray-600", font: "ui-sm" })}>
          {`Carrier “${settings.carrierTitle}” (${settings.carrierCode}). Weights in ${weightUnit}. Change these in App Management.`}
        </Text>
      )}
    </div>
  );
}
