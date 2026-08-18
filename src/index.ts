import "./styles.css";

export { EditorShell } from "./editor/EditorShell";
export { AssetEditorShell } from "./editor/AssetEditorShell";
export type {
  EditorChangeHandler,
  EditorDocuments,
  EditorReloadHandler,
  EditorSaveHandler,
  EditorShellProps,
} from "./editor/EditorShell";
export type { AssetEditorEntry, AssetEditorSection, AssetEditorShellProps } from "./editor/AssetEditorShell";
export type { EditorHost } from "./editor/host";
export type {
  EditorSchema,
  EditorSchemaContext,
  EditorSchemaHost,
  EditorSchemaLayerTarget,
  EditorSchemaViewFile,
  EditorMode,
  ResolvedSchemaNode,
  EditorValidationError,
  EditorValidationHandler,
  EditorValidationResult,
} from "./editor/schema";
export {
  createDefaultArrayItem,
  createDefaultPropertyValue,
  createDefaultValue,
  resolveNode,
  resolveSchemaAtPath,
  switchUnionBranch,
  validateDocument,
} from "./editor/schema";
export { resolveViewSchema } from "./editor/view-schema";
export type { NavigationPage, NavigationState } from "./core/navigation";
export { createNavigationState, goBack, jumpToPage, jumpToPath, openPath, samePath } from "./core/navigation";
export type { JsonPath, PathSegment } from "./core/path";
export { formatPath } from "./core/path";
export { getValueAtPath, setValueAtPath } from "./core/document";
