import { EditorShell } from "./editor/EditorShell";

const demoDocument = {
  id: "starter-document",
  meta: {
    kind: "demo",
    version: 1,
  },
  nodes: [
    {
      id: "hero",
      stats: { hp: 10, mp: 4 },
    },
  ],
};

export function App() {
  return <EditorShell value={demoDocument} />;
}
