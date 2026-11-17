import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

// Commerce asks for shipping rates with this webhook. The action checks the Commerce webhook
// signature itself (raw-http), so App Management registers it without Adobe IMS auth.
const ratesWebhook = {
  batch_name: "shipping_table_rates",
  fallback_error_message:
    "We couldn't load the shipping rates for your address. Please try again or contact the store.",
  fields: [{ name: "rateRequest" }],
  hook_name: "shipping_table_rates",
  method: "POST" as const,
  // Optional: if the app is unreachable, checkout carries on with the store's other carriers.
  required: false,
  soft_timeout: 1000,
  timeout: 5000,
  webhook_type: "after" as const,
};

export default defineConfig({
  adminUi: {
    menu: {
      aclProtected: true,
      description:
        "Create shipping methods and rate tables by destination, weight, subtotal, quantity and SKU.",
      id: "shipping_table_rates",
      label: "Shipping Table Rates",
    },
  },

  businessConfig: {
    schema: [
      {
        default: true,
        label: "Offer table rates at checkout",
        name: "ratesEnabled",
        type: "boolean",
      },
      {
        default: "tablerates",
        label:
          "Carrier code (letters, digits and underscores; must match the registered carrier)",
        name: "carrierCode",
        type: "text",
      },
      {
        default: "Table Rates",
        label: "Carrier title shown at checkout",
        name: "carrierTitle",
        type: "text",
      },
      {
        default: "kg",
        label: "Weight unit used by the store",
        name: "weightUnit",
        options: [
          { label: "Kilograms (kg)", value: "kg" },
          { label: "Pounds (lbs)", value: "lbs" },
        ],
        selectionMode: "single",
        type: "list",
      },
      {
        default: "",
        label:
          "Fallback price when the rate tables can't be read (empty: offer nothing)",
        name: "fallbackPrice",
        type: "text",
      },
      {
        default: "Standard shipping",
        label: "Fallback method title",
        name: "fallbackTitle",
        type: "text",
      },
    ],
  },

  installation: {
    customInstallationSteps: [
      {
        description:
          "Provision App Builder Database Storage and create the collection for shipping methods and rate tables.",
        name: "Set up database",
        script: "./scripts/setup-database.js",
      },
      {
        description:
          "Register the out-of-process shipping carrier in Commerce so its methods show at checkout.",
        name: "Register carrier",
        script: "./scripts/register-carrier.js",
      },
    ],
    messages: {
      postInstallation:
        "Shipping Table Rates is installed. Open Shipping Table Rates in the Commerce Admin, add a method and its rate table, then try it with Quote a cart. New methods start switched off.",
      preInstallation:
        "Shipping Table Rates stores rate tables in App Builder Database Storage and needs the Out-of-Process Shipping Methods module in Commerce (built into Adobe Commerce as a Cloud Service). Turn on webhook signatures in Commerce and paste its public key when asked.",
    },
  },

  metadata: {
    description:
      "Table rate shipping: methods and rate tables by country, region, postcode range, weight, subtotal, quantity and SKU, priced per order, item or weight unit, with handling fees, minimums, maximums and free shipping thresholds.",
    displayName: "Shipping Table Rates",
    id: "shipping-table-rates",
    version: "0.1.0",
  },

  webhooks: [
    {
      category: "append",
      description:
        "Adds table rate shipping methods to checkout (Adobe Commerce on cloud infrastructure and on-premises).",
      env: ["paas"],
      label: "Shipping Table Rates (PaaS)",
      requireAdobeAuth: false,
      runtimeAction: "shipping-table-rates/shipping-rates",
      webhook: {
        ...ratesWebhook,
        webhook_method:
          "plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
      },
    },
    {
      category: "append",
      description:
        "Adds table rate shipping methods to checkout (Adobe Commerce as a Cloud Service).",
      env: ["saas"],
      label: "Shipping Table Rates (SaaS)",
      requireAdobeAuth: false,
      runtimeAction: "shipping-table-rates/shipping-rates",
      webhook: {
        ...ratesWebhook,
        webhook_method:
          "plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
      },
    },
  ],
});
