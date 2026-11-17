import { createExtensionApp } from "@adobe/aio-commerce-lib-admin-ui/web";
import "@react-spectrum/s2/page.css";

import config from "#app.commerce.config";

import { RatesApiContext, useActionsApi } from "./hooks/use-rates-api.ts";
import { ShippingRatesPage } from "./pages/shipping-rates-page.tsx";

function AdminPage() {
  const api = useActionsApi();
  return (
    <RatesApiContext value={api}>
      <ShippingRatesPage />
    </RatesApiContext>
  );
}

createExtensionApp({
  menu: <AdminPage />,
  metadata: {
    extensionId: config.metadata.id,
  },
});
