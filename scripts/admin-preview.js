// Serves the Admin page with an in-browser backend at http://localhost:4344 (npm run admin:preview).
// It uses its own browser target, so it doesn't change how `aio app build` bundles the real page.
import { Parcel } from "@parcel/core";

const port = Number(process.env.PORT) || 4344;

const bundler = new Parcel({
  defaultConfig: "@parcel/config-default",
  defaultTargetOptions: { shouldOptimize: false },
  entries: "src/commerce-backend-ui-2/web-src/preview.html",
  serveOptions: { port },
  shouldAutoInstall: false,
  targets: {
    preview: {
      context: "browser",
      distDir: ".preview-dist",
      engines: {
        browsers:
          "last 2 Chrome versions, last 2 Firefox versions, last 2 Safari versions",
      },
      includeNodeModules: true,
    },
  },
});

await bundler.watch((error, event) => {
  if (error) {
    console.error(error);
    return;
  }
  if (event.type === "buildSuccess") {
    console.log(
      `Admin preview: http://localhost:${port}/preview.html (built in ${event.buildTime} ms)`,
    );
  } else if (event.type === "buildFailure") {
    console.error(event.diagnostics.map((d) => d.message).join("\n"));
  }
});
