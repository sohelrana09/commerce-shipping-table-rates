import { handlers } from "../handlers.js";
import { adminAction } from "../http.js";

export const main = adminAction("method-save", handlers.methodSave);
