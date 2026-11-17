/**
 * Local preview of the Admin page, without Commerce or App Builder: `npm run admin:preview`.
 * The page is the same; only its backend is swapped for methods kept in this browser.
 */
import "@react-spectrum/s2/page.css";

import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { Provider } from "@react-spectrum/s2/Provider";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { RatesApiContext } from "./hooks/use-rates-api.ts";
import { createPreviewApi, resetPreview } from "./lib/preview-api.ts";
import { ShippingRatesPage } from "./pages/shipping-rates-page.tsx";

function PreviewApp() {
  const api = useMemo(() => createPreviewApi(), []);
  return (
    <Provider background="base" styles={style({ minHeight: "screen" })}>
      <div className={style({ paddingTop: 24, paddingX: 24 })}>
        <InlineAlert variant="informative">
          <Heading>Local preview</Heading>
          <Content>
            <div
              className={style({
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "space-between",
              })}>
              <span>
                This is the Shipping Table Rates Admin page running without
                Commerce or App Builder. Methods are kept in this browser only.
              </span>
              <Button
                onPress={() => {
                  resetPreview();
                  window.location.reload();
                }}
                size="S"
                variant="secondary">
                Reset to examples
              </Button>
            </div>
          </Content>
        </InlineAlert>
      </div>
      <RatesApiContext value={api}>
        <ShippingRatesPage />
      </RatesApiContext>
    </Provider>
  );
}

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PreviewApp />
    </StrictMode>,
  );
}
