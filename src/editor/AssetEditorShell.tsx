import { useEffect, useMemo, useState } from "react";
import { EditorShell, type EditorShellProps } from "./EditorShell";
import type { EditorSchema, EditorSchemaHost } from "./schema";

export type AssetEditorEntry = {
  id: string;
  label: string;
  referenceUri: string;
};

export type AssetEditorSection = {
  id: string;
  title: string;
  entries: readonly AssetEditorEntry[];
};

export type AssetEditorShellProps = EditorShellProps & {
  title: string;
  subtitle?: string;
  sections: readonly AssetEditorSection[];
  registrySchema: EditorSchema;
  registrySourceId?: string;
  emptyLabel?: string;
  enableRawEditor?: boolean;
};

export function AssetEditorShell({
  title,
  subtitle,
  sections,
  registrySchema,
  registrySourceId = "editor/asset-registry",
  emptyLabel = "请选择一个资产类型。",
  enableRawEditor = true,
  documents,
  schemaHost,
  ...editorProps
}: AssetEditorShellProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];
  useEffect(() => {
    if (!activeSection && sections[0]) setActiveSectionId(sections[0].id);
  }, [activeSection, sections]);
  const registryDocuments = useMemo(() => ({
    ...(documents ?? {}),
    [registrySourceId]: activeSection?.entries.map((entry) => entry.referenceUri) ?? [],
  }), [activeSection, documents, registrySourceId]);
  const registrySchemaHost = useMemo<EditorSchemaHost>(() => ({
    getSchema(context) {
      return context.sourceId === registrySourceId ? registrySchema : schemaHost?.getSchema(context);
    },
    setRootSchema(schema, context) {
      if (context.sourceId === registrySourceId) return;
      return schemaHost?.setRootSchema?.(schema, context);
    },
    getNamedSchema: schemaHost?.getNamedSchema,
    setNamedSchema: schemaHost?.setNamedSchema,
  }), [registrySchema, registrySourceId, schemaHost]);

  return (
    <div className="sje-asset-workbench">
      <aside className="sje-asset-workbench__nav">
        <header className="sje-asset-workbench__heading">
          <p>资产库</p>
          <h1>{title}</h1>
          {subtitle ? <span>{subtitle}</span> : null}
        </header>
        <div className="sje-asset-workbench__sections" aria-label="资产分类">
          {sections.map((section) => (
            <button
              aria-pressed={section.id === activeSection?.id}
              className={`sje-asset-workbench__section ${section.id === activeSection?.id ? "is-active" : ""}`.trim()}
              key={section.id}
              type="button"
              onClick={() => setActiveSectionId(section.id)}
            >
              <span>{section.title}</span>
              <small>{section.entries.length}</small>
            </button>
          ))}
        </div>
      </aside>
      <main className="sje-asset-workbench__detail">
        {activeSection ? <EditorShell {...editorProps} documents={registryDocuments} enableRawEditor={enableRawEditor} rootPageTitle={activeSection.title} rootSourceId={registrySourceId} schemaHost={registrySchemaHost} /> : <div className="sje-asset-workbench__placeholder">{emptyLabel}</div>}
      </main>
    </div>
  );
}
