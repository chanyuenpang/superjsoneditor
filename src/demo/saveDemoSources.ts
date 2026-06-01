import type { EditorDocuments } from "../editor/EditorShell";

export async function saveDemoSources(documents: EditorDocuments) {
  const response = await fetch("/__save-demo-sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documents }),
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }
}
