/**
 * CSV import and export for rate tables, dependency-free so the Admin page runs it in the
 * browser. One line is one rate row; list cells (countries, regions, postcodes, SKUs, attribute
 * values) separate entries with ";" (a "," or "|" works too on import).
 *
 * Export guards against spreadsheet formula injection: a cell that starts with =, +, -, @, tab
 * or carriage return gets a leading apostrophe, which import strips again.
 */

export const COLUMNS = [
  { field: "countries", header: "country", list: true },
  { field: "regions", header: "region", list: true },
  { field: "postcodes", header: "postcode", list: true },
  { field: "weightFrom", header: "weight_from", number: true },
  { field: "weightTo", header: "weight_to", number: true },
  { field: "subtotalFrom", header: "subtotal_from", number: true },
  { field: "subtotalTo", header: "subtotal_to", number: true },
  { field: "qtyFrom", header: "qty_from", number: true },
  { field: "qtyTo", header: "qty_to", number: true },
  { field: "skus", header: "sku", list: true },
  { field: "attribute", header: "attribute" },
  { field: "attributeValues", header: "attribute_values", list: true },
  { field: "flat", header: "flat", number: true },
  { field: "perItem", header: "per_item", number: true },
  { field: "perWeight", header: "per_weight", number: true },
  { field: "percent", header: "percent", number: true },
  { field: "cost", header: "cost", number: true },
];

const BY_HEADER = new Map(COLUMNS.map((column) => [column.header, column]));
// Friendly aliases for column names common in Magento table rate CSV exports.
const ALIASES = {
  dest_country: "country",
  dest_region: "region",
  dest_zip: "postcode",
  price: "flat",
  shipping_price: "flat",
  zip: "postcode",
};
const FORMULA_START = /^[=+\-@\t\r]/u;
const NEEDS_QUOTES = /[",\r\n]/u;
const LIST_SEPARATOR = /[;,|]/u;
const BOM = "\uFEFF";

/** Reads one character inside quotes; returns how many characters it used. */
function readQuoted(state, source, i) {
  const char = source[i];
  if (char === '"' && source[i + 1] === '"') {
    state.cell += '"';
    return 2;
  }
  if (char === '"') {
    state.quoted = false;
  } else {
    state.cell += char;
  }
  return 1;
}

function endCell(state) {
  state.record.push(state.cell);
  state.cell = "";
}

function endRecord(state) {
  endCell(state);
  state.records.push(state.record);
  state.record = [];
}

/** Splits CSV text into records of raw cells (RFC 4180: quotes, doubled quotes, CRLF). */
export function parseCsvText(text) {
  const state = { cell: "", quoted: false, record: [], records: [] };
  let source = String(text ?? "");
  if (source.startsWith(BOM)) {
    source = source.slice(1);
  }
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the branches below and readQuoted change state.quoted
    if (state.quoted) {
      i += readQuoted(state, source, i);
      continue;
    }
    if (char === '"') {
      state.quoted = true;
    } else if (char === ",") {
      endCell(state);
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") {
        i += 1;
      }
      endRecord(state);
    } else {
      state.cell += char;
    }
    i += 1;
  }
  if (state.cell !== "" || state.record.length > 0) {
    endRecord(state);
  }
  return state.records.filter((cells) =>
    cells.some((value) => value.trim() !== ""),
  );
}

function unguard(value) {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}

function readCell(column, raw) {
  const value = unguard(raw.trim());
  if (value === "") {
    return { value: undefined };
  }
  if (column.list) {
    const entries = value
      .split(LIST_SEPARATOR)
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "" && entry !== "*");
    return { value: entries.length > 0 ? entries : undefined };
  }
  if (column.number) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return { error: `${column.header} "${value}" isn't a number` };
    }
    return { value: number };
  }
  return { value };
}

/**
 * Reads a rate table from CSV. Returns the rows and, for each line that couldn't be read, its
 * line number and why. The first line must be a header naming the columns (in any order).
 */
export function parseRatesCsv(text) {
  const records = parseCsvText(text);
  if (records.length === 0) {
    return { errors: [{ line: 1, message: "the file is empty" }], rows: [] };
  }

  const headers = records[0].map((header) => {
    const name = header.trim().toLowerCase().replaceAll(" ", "_");
    return ALIASES[name] ?? name;
  });
  const unknown = headers.filter((header) => header && !BY_HEADER.has(header));
  if (unknown.length > 0) {
    return {
      errors: [
        {
          line: 1,
          message: `unknown columns: ${unknown.join(", ")}. Expected: ${COLUMNS.map((c) => c.header).join(", ")}`,
        },
      ],
      rows: [],
    };
  }

  const rows = [];
  const errors = [];
  for (const [index, cells] of records.slice(1).entries()) {
    const row = {};
    const problems = [];
    for (const [position, header] of headers.entries()) {
      const column = BY_HEADER.get(header);
      if (!column) {
        continue;
      }
      const { value, error } = readCell(column, cells[position] ?? "");
      if (error) {
        problems.push(error);
      } else if (value !== undefined) {
        row[column.field] = value;
      }
    }
    if (problems.length > 0) {
      errors.push({ line: index + 2, message: problems.join("; ") });
    } else {
      rows.push(row);
    }
  }
  return { errors, rows };
}

function writeCell(value) {
  let text = "";
  if (Array.isArray(value)) {
    text = value.join(";");
  } else if (value !== undefined && value !== null) {
    text = String(value);
  }
  if (FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Writes rate rows as CSV with a header line, ready for a spreadsheet. */
export function ratesToCsv(rows) {
  const lines = [COLUMNS.map((column) => column.header).join(",")];
  for (const row of rows ?? []) {
    lines.push(COLUMNS.map((column) => writeCell(row[column.field])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
