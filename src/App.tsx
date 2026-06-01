import { EditorShell } from "./editor/EditorShell";
const demoDocument = {
  id: "simple-demo",
  title: "Simple Demo Page",
  note: "This page stays intentionally small. Complex coverage lives in test fixtures.",
  profile: {
    owner: "Super JSON Editor",
    status: "prototype"
  }
};

export function App() {
  return <EditorShell value={demoDocument} />;
}
