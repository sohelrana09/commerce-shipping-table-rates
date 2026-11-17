import { describe, expect, test } from "vitest";

import { COLUMNS, parseCsvText, parseRatesCsv, ratesToCsv } from "#csv";

const UNKNOWN_COLUMNS = /^unknown columns: colour\. Expected: country/u;

describe("parseCsvText", () => {
  test("handles quotes, doubled quotes, CRLF, BOM and blank lines", () => {
    expect(
      parseCsvText('﻿a,"b,c","say ""hi"""\r\n\r\n1,2,3\n4,"multi\nline",6'),
    ).toEqual([
      ["a", "b,c", 'say "hi"'],
      ["1", "2", "3"],
      ["4", "multi\nline", "6"],
    ]);
    expect(parseCsvText("")).toEqual([]);
    expect(parseCsvText(undefined)).toEqual([]);
    expect(parseCsvText("a,b\n")).toEqual([["a", "b"]]);
  });
});

describe("parseRatesCsv", () => {
  test("reads rows by header, in any order, with lists and numbers", () => {
    const { rows, errors } = parseRatesCsv(
      [
        "Postcode,country,weight_from,weight_to,flat,per_weight,sku,attribute,attribute_values",
        '"90000-96199; 97*",US,0,5,5.99,0.5,TEE-*|MUG-*,shipping_class,"standard,small"',
        "*,*,,,,,,,",
        "'-5,GB,,,3,,,,",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        attribute: "shipping_class",
        attributeValues: ["standard", "small"],
        countries: ["US"],
        flat: 5.99,
        perWeight: 0.5,
        postcodes: ["90000-96199", "97*"],
        skus: ["TEE-*", "MUG-*"],
        weightFrom: 0,
        weightTo: 5,
      },
      {},
      { countries: ["GB"], flat: 3, postcodes: ["-5"] },
    ]);
  });

  test("accepts Magento table rate header names", () => {
    const { rows } = parseRatesCsv(
      "dest_country,dest_zip,shipping price\nUS,10001,4",
    );
    expect(rows).toEqual([
      { countries: ["US"], flat: 4, postcodes: ["10001"] },
    ]);
  });

  test("reports bad numbers with their line and keeps good rows", () => {
    const { rows, errors } = parseRatesCsv(
      "country,flat,per_item\nUS,abc,x\nCA,4,",
    );
    expect(errors).toEqual([
      {
        line: 2,
        message: 'flat "abc" isn\'t a number; per_item "x" isn\'t a number',
      },
    ]);
    expect(rows).toEqual([{ countries: ["CA"], flat: 4 }]);
  });

  test("rejects unknown columns and empty files", () => {
    expect(parseRatesCsv("country,colour\nUS,red").errors[0].message).toMatch(
      UNKNOWN_COLUMNS,
    );
    expect(parseRatesCsv("  \n")).toEqual({
      errors: [{ line: 1, message: "the file is empty" }],
      rows: [],
    });
  });

  test("ignores blank header cells", () => {
    expect(parseRatesCsv("country,,flat\nUS,zzz,2").rows).toEqual([
      { countries: ["US"], flat: 2 },
    ]);
  });
});

describe("ratesToCsv", () => {
  test("writes every column and round-trips", () => {
    const rows = [
      {
        countries: ["US"],
        flat: 5,
        postcodes: ["90000-96199", "!902*"],
        regions: ["CA", "NV"],
        title: "ignored",
      },
      { attribute: 'odd "name", here', skus: ["=SUM(A1)"] },
    ];
    const csv = ratesToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(COLUMNS.map((column) => column.header).join(","));
    expect(lines[1]).toBe("US,CA;NV,90000-96199;!902*,,,,,,,,,,5,,,,");
    expect(lines[2]).toContain('"odd ""name"", here"');
    expect(lines[2]).toContain("'=SUM(A1)");
    expect(parseRatesCsv(csv)).toEqual({
      errors: [],
      rows: [
        {
          countries: ["US"],
          flat: 5,
          postcodes: ["90000-96199", "!902*"],
          regions: ["CA", "NV"],
        },
        { attribute: 'odd "name", here', skus: ["=SUM(A1)"] },
      ],
    });
    expect(ratesToCsv(undefined)).toBe(`${lines[0]}\r\n`);
  });
});
