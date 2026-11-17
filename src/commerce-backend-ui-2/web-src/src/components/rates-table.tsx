import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { FileTrigger } from "@react-spectrum/s2/FileTrigger";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import ChevronDown from "@react-spectrum/s2/icons/ChevronDown";
import ChevronUp from "@react-spectrum/s2/icons/ChevronUp";
import Delete from "@react-spectrum/s2/icons/Delete";
import Duplicate from "@react-spectrum/s2/icons/Duplicate";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { useState } from "react";

import { parseRatesCsv, ratesToCsv } from "#csv";
import { MAX_ROWS } from "#engine";

import {
  describeDestination,
  describeLimits,
  describePrice,
  describeProducts,
  downloadText,
  move,
} from "../lib/methods.ts";
import { RowEditor } from "./row-editor.tsx";

import type { Selection } from "react-aria-components";
import type { RateRow } from "../lib/types.ts";

const prose = style({ font: "body", margin: 0 });

export type RatesTableProps = {
  methodCode: string;
  onChange: (rows: RateRow[]) => void;
  rows: RateRow[];
  weightUnit: string;
};

type ImportMode = "replace" | "append";
type ImportReport = {
  added: number;
  errors: { line: number; message: string }[];
  mode: ImportMode;
};

const toolbar = style({
  alignItems: "end",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
});

/** The method's rate table: a list of rows, an editor for the selected one, CSV in and out. */
export function RatesTable({
  rows,
  onChange,
  weightUnit,
  methodCode,
}: RatesTableProps) {
  const [selected, setSelected] = useState<number | null>(
    rows.length ? 0 : null,
  );
  const [mode, setMode] = useState<ImportMode>("replace");
  const [report, setReport] = useState<ImportReport | null>(null);
  // Bumped whenever rows are replaced or reordered, so the row editor starts fresh.
  const [version, setVersion] = useState(0);
  const current = selected === null ? undefined : rows[selected];

  const update = (next: RateRow[], select: number | null) => {
    onChange(next);
    setSelected(select);
    setVersion((value) => value + 1);
  };

  const handleSelection = (keys: Selection) => {
    const [key] = keys === "all" ? [] : [...keys];
    setSelected(key === undefined ? null : Number(key));
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const { rows: imported, errors } = parseRatesCsv(await file.text());
    const next = mode === "replace" ? imported : [...rows, ...imported];
    if (imported.length > 0) {
      update(next.slice(0, MAX_ROWS), 0);
    }
    setReport({ added: imported.length, errors, mode });
  };

  const renderEmptyState = () => (
    <IllustratedMessage>
      <Heading>No rows</Heading>
      <Content>Add a row or import a CSV file.</Content>
    </IllustratedMessage>
  );

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <p className={prose}>
        Each row is a set of conditions and a price. Leave a condition empty to
        match any cart. Ranges include “from” and exclude “below”, so 0–5 and
        5–10 don't overlap.
      </p>

      <div className={toolbar}>
        <Button
          onPress={() => update([...rows, { flat: 0 }], rows.length)}
          variant="secondary">
          Add row
        </Button>
        <Picker
          label="On import"
          onChange={(key) => setMode(key as ImportMode)}
          styles={style({ width: 200 })}
          value={mode}>
          <PickerItem id="replace">Replace all rows</PickerItem>
          <PickerItem id="append">Add to the end</PickerItem>
        </Picker>
        <FileTrigger
          acceptedFileTypes={[".csv", "text/csv"]}
          onSelect={handleFiles}>
          <Button variant="secondary">Import CSV</Button>
        </FileTrigger>
        <Button
          isDisabled={rows.length === 0}
          onPress={() =>
            downloadText(
              `${methodCode || "rates"}-rates.csv`,
              ratesToCsv(rows),
              "text/csv;charset=utf-8",
            )
          }
          variant="secondary">
          Export CSV
        </Button>
      </div>

      {report && (
        <InlineAlert variant={report.errors.length ? "notice" : "positive"}>
          <Heading>
            {report.mode === "replace"
              ? `Imported ${report.added} row(s), replacing the table`
              : `Added ${report.added} row(s)`}
          </Heading>
          <Content>
            {report.errors.length === 0
              ? "Save the method to keep them."
              : report.errors.slice(0, 10).map((error) => (
                  <div key={error.line}>
                    Line {error.line}: {error.message}
                  </div>
                ))}
          </Content>
        </InlineAlert>
      )}

      <TableView
        aria-label="Rate rows"
        density="compact"
        disallowEmptySelection={false}
        onSelectionChange={handleSelection}
        selectedKeys={selected === null ? [] : [String(selected)]}
        selectionMode="single"
        selectionStyle="highlight"
        styles={style({ maxHeight: 360, minHeight: 200, width: "full" })}>
        <TableHeader>
          <Column width={48}>#</Column>
          <Column isRowHeader>Destination</Column>
          <Column>Cart</Column>
          <Column>Products</Column>
          <Column>Price</Column>
        </TableHeader>
        <TableBody
          items={rows.map((row, index) => ({ id: String(index), index, row }))}
          renderEmptyState={renderEmptyState}>
          {(item) => (
            <Row id={item.id}>
              <Cell>{String(item.index + 1)}</Cell>
              <Cell>{describeDestination(item.row)}</Cell>
              <Cell>{describeLimits(item.row, weightUnit)}</Cell>
              <Cell>{describeProducts(item.row)}</Cell>
              <Cell>{describePrice(item.row, weightUnit)}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>

      {current && selected !== null && (
        <section
          aria-label={`Row ${selected + 1}`}
          className={style({
            borderColor: "gray-200",
            borderRadius: "lg",
            borderStyle: "solid",
            borderWidth: 1,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 16,
          })}>
          <div
            className={style({
              alignItems: "center",
              display: "flex",
              gap: 8,
            })}>
            <Heading level={3} styles={style({ flexGrow: 1, margin: 0 })}>
              Row {selected + 1}
            </Heading>
            <ActionButton
              aria-label="Move row up"
              isDisabled={selected === 0}
              onPress={() => update(move(rows, selected, -1), selected - 1)}>
              <ChevronUp />
            </ActionButton>
            <ActionButton
              aria-label="Move row down"
              isDisabled={selected === rows.length - 1}
              onPress={() => update(move(rows, selected, 1), selected + 1)}>
              <ChevronDown />
            </ActionButton>
            <ActionButton
              aria-label="Duplicate row"
              onPress={() =>
                update(
                  [
                    ...rows.slice(0, selected + 1),
                    structuredClone(current),
                    ...rows.slice(selected + 1),
                  ],
                  selected + 1,
                )
              }>
              <Duplicate />
            </ActionButton>
            <ActionButton
              aria-label="Delete row"
              onPress={() =>
                update(
                  rows.filter((_, index) => index !== selected),
                  rows.length > 1 ? Math.max(0, selected - 1) : null,
                )
              }>
              <Delete />
            </ActionButton>
          </div>
          <RowEditor
            key={`${selected}-${version}`}
            onChange={(row) =>
              onChange(
                rows.map((entry, index) => (index === selected ? row : entry)),
              )
            }
            row={current}
            weightUnit={weightUnit}
          />
        </section>
      )}
    </div>
  );
}
