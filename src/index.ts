import "./styles.css";

export { EditorShell } from "./editor/EditorShell";
export type {
  EditorDocuments,
  EditorReloadHandler,
  EditorSaveHandler,
  EditorShellProps,
} from "./editor/EditorShell";
export type { EditorHost } from "./editor/host";
export type { NavigationPage, NavigationState, ReferenceResolver, ReferenceTarget } from "./core/navigation";
export { createNavigationState, goBack, jumpToPage, jumpToPath, openPath, samePath } from "./core/navigation";
export type { JsonPath, PathSegment } from "./core/path";
export { formatPath } from "./core/path";
export { getValueAtPath, setValueAtPath } from "./core/document";
