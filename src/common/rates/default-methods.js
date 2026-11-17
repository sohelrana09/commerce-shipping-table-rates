/**
 * Example methods the Admin offers as starting points ("Start from example"). They're never
 * applied on their own: a merchant copies one, adjusts it and switches it on.
 */

export const DEFAULT_METHODS = [
  {
    code: "standard",
    enabled: false,
    freeOver: 75,
    handling: { fixed: 1 },
    rows: [
      { countries: ["US"], flat: 5.99, weightTo: 5 },
      { countries: ["US"], flat: 8.99, weightFrom: 5, weightTo: 20 },
      { countries: ["US"], flat: 8.99, perWeight: 0.5, weightFrom: 20 },
      { countries: ["CA"], flat: 14.99 },
    ],
    selection: "first",
    sortOrder: 10,
    title: "Standard (3 to 5 days)",
    weightStep: 1,
  },
  {
    code: "express_zones",
    enabled: false,
    maxPrice: 60,
    minPrice: 12,
    rows: [
      {
        countries: ["US"],
        flat: 12,
        perWeight: 1.25,
        postcodes: ["90000-96199"],
      },
      { countries: ["US"], flat: 18, perWeight: 1.75, regions: ["AK", "HI"] },
      { countries: ["US"], flat: 15, perWeight: 1.5 },
    ],
    selection: "first",
    sortOrder: 20,
    title: "Express (1 to 2 days)",
    weightStep: 0.5,
  },
  {
    code: "uk_per_item",
    enabled: false,
    rows: [
      {
        countries: ["GB"],
        flat: 9.95,
        perItem: 2,
        postcodes: ["BT*", "HS*", "IV*", "KW*", "ZE*"],
      },
      { countries: ["GB"], flat: 3.95, perItem: 0.75 },
    ],
    selection: "first",
    sortOrder: 30,
    title: "UK delivery (per item)",
  },
  {
    code: "freight",
    enabled: false,
    handling: { percent: 10 },
    rows: [
      { attribute: "shipping_class", attributeValues: ["oversize"], flat: 49 },
      { flat: 89, skus: ["FURN-*"] },
    ],
    selection: "highest",
    sortOrder: 40,
    title: "Freight (oversize items)",
  },
];
