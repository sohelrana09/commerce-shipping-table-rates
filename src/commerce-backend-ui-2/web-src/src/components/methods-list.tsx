import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Refresh from "@react-spectrum/s2/icons/Refresh";
import { Menu, MenuItem, MenuTrigger } from "@react-spectrum/s2/Menu";
import { ProgressCircle } from "@react-spectrum/s2/ProgressCircle";
import { StatusLight } from "@react-spectrum/s2/StatusLight";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { useCallback } from "react";

import { describeMethodPricing, SELECTION_SHORT } from "../lib/methods.ts";

import type { Key } from "react-aria-components";
import type { ShippingMethod } from "../lib/types.ts";

export type MethodsListProps = {
  error: string | null;
  examples: ShippingMethod[];
  loading: boolean;
  methods: ShippingMethod[];
  onCreate: (template?: ShippingMethod) => void;
  onEdit: (code: string) => void;
  onReload: () => void;
};

export function MethodsList({
  methods,
  examples,
  loading,
  error,
  onReload,
  onEdit,
  onCreate,
}: MethodsListProps) {
  const handleRowAction = useCallback(
    (key: Key) => onEdit(String(key)),
    [onEdit],
  );
  const handleNew = useCallback(() => onCreate(), [onCreate]);
  const handleTemplate = useCallback(
    (key: Key) => {
      const example = examples.find((method) => method.code === key);
      if (example) {
        onCreate(example);
      }
    },
    [examples, onCreate],
  );

  const renderEmptyState = useCallback(
    () => (
      <IllustratedMessage>
        <Heading>No shipping methods yet</Heading>
        <Content>Add a method, or start from an example.</Content>
      </IllustratedMessage>
    ),
    [],
  );

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <div
        className={style({
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        })}>
        <Heading
          level={1}
          styles={style({ flexGrow: 1, font: "heading-lg", margin: 0 })}>
          Shipping methods
        </Heading>
        <ActionButton
          aria-label="Reload"
          isDisabled={loading}
          onPress={onReload}>
          <Refresh />
        </ActionButton>
        <MenuTrigger>
          <Button variant="secondary">Start from example</Button>
          <Menu items={examples} onAction={handleTemplate}>
            {(example) => (
              <MenuItem id={example.code}>{example.title}</MenuItem>
            )}
          </Menu>
        </MenuTrigger>
        <Button onPress={handleNew} variant="accent">
          Add method
        </Button>
      </div>

      {error && (
        <InlineAlert variant="negative">
          <Heading>Couldn't load shipping methods</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {loading ? (
        <div
          className={style({
            display: "flex",
            justifyContent: "center",
            marginTop: 32,
          })}>
          <ProgressCircle
            aria-label="Loading shipping methods"
            isIndeterminate
            size="L"
          />
        </div>
      ) : (
        <TableView
          aria-label="Shipping methods"
          onAction={handleRowAction}
          selectionMode="none"
          styles={style({ minHeight: 320, width: "full" })}>
          <TableHeader>
            <Column isRowHeader minWidth={220}>
              Title
            </Column>
            <Column>Code</Column>
            <Column>Rows</Column>
            <Column>Picks</Column>
            <Column>Pricing</Column>
            <Column>Sort</Column>
            <Column>Status</Column>
          </TableHeader>
          <TableBody items={methods} renderEmptyState={renderEmptyState}>
            {(method) => (
              <Row id={method.code}>
                <Cell>{method.title}</Cell>
                <Cell>{method.code}</Cell>
                <Cell>{String(method.rows.length)}</Cell>
                <Cell>{SELECTION_SHORT[method.selection ?? "first"]}</Cell>
                <Cell>{describeMethodPricing(method)}</Cell>
                <Cell>{String(method.sortOrder ?? 0)}</Cell>
                <Cell>
                  <StatusLight
                    size="S"
                    variant={method.enabled === false ? "neutral" : "positive"}>
                    {method.enabled === false ? "Off" : "On"}
                  </StatusLight>
                </Cell>
              </Row>
            )}
          </TableBody>
        </TableView>
      )}
    </main>
  );
}
