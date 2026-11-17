// The App Builder CLI writes web-src/src/config.json (action URLs) at build and dev time.
// Type checking runs before that, so create an empty one when it's missing.
import { existsSync, writeFileSync } from "node:fs";

const path = "src/commerce-backend-ui-2/web-src/src/config.json";
if (!existsSync(path)) {
  writeFileSync(path, "{}\n");
}
