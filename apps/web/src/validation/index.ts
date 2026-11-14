// Validarea a ce scrie agentul (C5, specs/02): funcții pure, folosite de motorul de rețete (B5, apply_css) și de
// elementele generate (B3, insertHtml). Nu aruncă: întorc ce a rămas și ce s-a scos, cu motivul pentru model.

export { OUR_INTERFACE_MARKERS, validateCss } from "./css";
export { validateHtml } from "./html";
export { truncateRunJsText, validateRunJs, type RunJsValidation } from "./run-js";
export { DEFAULT_SCOPE, effectiveScope, requestedScope, type RequestScope } from "./scope";
export { recipeWithoutRequest, requestHistory, UNDO_RUN_PREFIX, undoneRequests } from "./undo-request";
export type { RecipeWithoutRequest, RequestEntry, UndoRequestResult } from "./undo-request";
export type { CssValidation, HtmlValidation } from "./result";
