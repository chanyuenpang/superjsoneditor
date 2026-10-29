import { useEffect, useMemo, useState } from "react";
import { EditorShell, type EditorShellProps } from "./EditorShell";
import type { EditorSchema, EditorSchemaHost, EditorTableColumn } from "./schema";

export type AssetEditorEntry = {
  id: string;
  label: string;
  referenceUri: string;
};

export type AssetEditorSection = {
  id: string;
  title: string;
  entries: readonly AssetEditorEntry[];
  /** 将多个资源页归入同一个顶层资产类型。未声明时本页自身就是顶层类型。 */
  parentId?: string;
  /** 顶层资产类型的玩家可见名称。 */
  parentTitle?: string;
  /**
   * 直接编辑已有文档时使用其 sourceId，而不是创建只读的引用目录。
   * 适用于需要在数组表与对象页都编辑同一份 schema 的资产类别。
   */
  documentSourceId?: string;
  /**
   * 引用列表的行投影 schema。它描述目标对象哪些字段可被“筛选字段”显示，
   * 不拥有也不修改引用目标的数据 schema。
   */
  referenceProjectionSchema?: EditorSchema;
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
  const navigationGroups = useMemo(() => groupSections(sections), [sections]);
  const activeGroup = navigationGroups.find((group) => group.sections.some((section) => section.id === activeSection?.id)) ?? navigationGroups[0];
  useEffect(() => {
    if (!activeSection && sections[0]) setActiveSectionId(sections[0].id);
  }, [activeSection, sections]);
  const activeSourceId = activeSection?.documentSourceId ?? (activeSection
    ? `${registrySourceId}/${encodeURIComponent(activeSection.id)}`
    : registrySourceId);
  const activeRegistrySchema = useMemo(
    () => createReferenceRegistrySchema(registrySchema, activeSection?.referenceProjectionSchema),
    [activeSection?.referenceProjectionSchema, registrySchema],
  );
  const registryDocuments = useMemo(() => activeSection?.documentSourceId
    ? documents ?? {}
    : {
      ...(documents ?? {}),
      [activeSourceId]: activeSection?.entries.map((entry) => entry.referenceUri) ?? [],
    }, [activeSection?.documentSourceId, activeSection?.entries, activeSourceId, documents]);
  const registrySchemaHost = useMemo<EditorSchemaHost>(() => ({
    getSchema(context) {
      if (context.sourceId !== activeSourceId) return schemaHost?.getSchema(context);
      if (activeSection?.documentSourceId) return schemaHost?.getSchema(context);
      return mergeReferenceRegistryViewSchema(
        activeRegistrySchema,
        activeSection?.referenceProjectionSchema,
        schemaHost?.getSchema(context),
      );
    },
    setRootSchema(schema, context) {
      return schemaHost?.setRootSchema?.(schema, context);
    },
    getNamedSchema(name, context) {
      return (name === "content_asset_reference_row" || name === "content-asset") && activeSection?.referenceProjectionSchema
        ? activeSection.referenceProjectionSchema
        : schemaHost?.getNamedSchema?.(name, context);
    },
    setNamedSchema: schemaHost?.setNamedSchema,
  }), [activeRegistrySchema, activeSourceId, activeSection?.referenceProjectionSchema, schemaHost]);

  return (
    <div className="sje-asset-workbench">
      <aside className="sje-asset-workbench__nav">
        <header className="sje-asset-workbench__heading">
          <p>资产库</p>
          <h1>{title}</h1>
          {subtitle ? <span>{subtitle}</span> : null}
        </header>
        <div className="sje-asset-workbench__sections" aria-label="资产分类">
          {navigationGroups.map((group) => {
            const groupIsActive = group.id === activeGroup?.id;
            const selectedSection = group.sections.find((section) => section.id === activeSection?.id) ?? group.sections[0];
            return <div className="sje-asset-workbench__section-group" key={group.id}>
              <button
                aria-pressed={groupIsActive}
                className={`sje-asset-workbench__section ${groupIsActive ? "is-active" : ""}`.trim()}
                type="button"
                onClick={() => setActiveSectionId(selectedSection?.id ?? group.sections[0]!.id)}
              >
                <span>{group.title}</span>
                <small>{group.sections.reduce((total, section) => total + section.entries.length, 0)}</small>
              </button>
              {groupIsActive && group.sections.length > 1 ? <div className="sje-asset-workbench__subsections" aria-label={`${group.title}子页`}>
                {group.sections.map((section) => <button
                  aria-pressed={section.id === activeSection?.id}
                  className={`sje-asset-workbench__subsection ${section.id === activeSection?.id ? "is-active" : ""}`.trim()}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span>{section.title}</span>
                  <small>{section.entries.length}</small>
                </button>)}
              </div> : null}
            </div>;
          })}
        </div>
      </aside>
      <main className="sje-asset-workbench__detail">
        {activeSection ? <EditorShell key={activeSourceId} {...editorProps} documents={registryDocuments} enableRawEditor={enableRawEditor} rootPageTitle={activeSection.title} rootSourceId={activeSourceId} schemaHost={registrySchemaHost} /> : <div className="sje-asset-workbench__placeholder">{emptyLabel}</div>}
      </main>
    </div>
  );
}

type AssetEditorNavigationGroup = { id: string; title: string; sections: readonly AssetEditorSection[] };

function groupSections(sections: readonly AssetEditorSection[]): readonly AssetEditorNavigationGroup[] {
  const groups = new Map<string, { title: string; sections: AssetEditorSection[] }>();
  for (const section of sections) {
    const id = section.parentId ?? section.id;
    const title = section.parentTitle ?? section.title;
    const group = groups.get(id) ?? { title, sections: [] };
    group.sections.push(section);
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, title: group.title, sections: group.sections }));
}

function createReferenceRegistrySchema(registrySchema: EditorSchema, projectionSchema: EditorSchema | undefined): EditorSchema {
  const projectionColumns = Object.keys(projectionSchema?.properties ?? {});
  if (projectionColumns.length === 0) return registrySchema;
  return {
    ...registrySchema,
    "x-editor": {
      ...registrySchema["x-editor"],
      table: {
        ...registrySchema["x-editor"]?.table,
        columns: projectionColumns.map((key) => ({ key })),
      },
    },
  };
}

/**
 * 引用列表的字段候选集始终来自引用目标；已保存 schema 只能保留仍有效列的视图状态。
 * 这样历史 registry 的 assetId / assetKind 等通用列不会遮蔽目标对象的字段。
 */
function mergeReferenceRegistryViewSchema(
  registrySchema: EditorSchema,
  projectionSchema: EditorSchema | undefined,
  savedSchema: EditorSchema | undefined,
): EditorSchema {
  const projectionKeys = Object.keys(projectionSchema?.properties ?? {});
  if (projectionKeys.length === 0 || !savedSchema?.["x-editor"]?.table) return registrySchema;
  const savedColumns = savedSchema["x-editor"].table.columns;
  const recognizedColumns = savedColumns.filter((column) => {
    const key = tableColumnKey(column);
    return key != null && projectionKeys.includes(key);
  });
  const columns = recognizedColumns.length > 0 || savedColumns.length === 0
    ? recognizedColumns
    : registrySchema["x-editor"]?.table?.columns ?? [];
  return {
    ...registrySchema,
    "x-editor": {
      ...registrySchema["x-editor"],
      table: {
        ...registrySchema["x-editor"]?.table,
        columns,
      },
    },
  };
}

function tableColumnKey(column: EditorTableColumn): string | undefined {
  return column.key ?? (typeof column.field === "string" ? column.field : undefined);
}
