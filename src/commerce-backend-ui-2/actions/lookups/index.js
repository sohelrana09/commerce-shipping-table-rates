import { handlers } from "../handlers.js";
import { adminAction } from "../http.js";

export const main = adminAction("lookups", handlers.lookups);
