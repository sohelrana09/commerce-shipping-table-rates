// Types for csv.js (rate table import and export).
import type { RateRow } from "./engine.js";

export type CsvColumn = {
  field: keyof RateRow;
  header: string;
  list?: boolean;
  number?: boolean;
};

export declare const COLUMNS: CsvColumn[];
export declare function parseCsvText(text: string): string[][];
export declare function parseRatesCsv(text: string): {
  rows: RateRow[];
  errors: { line: number; message: string }[];
};
export declare function ratesToCsv(rows: RateRow[]): string;
