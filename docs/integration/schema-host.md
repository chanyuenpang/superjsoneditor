# Schema Host 接入指南

本指南面向把 `super-json-editor` 嵌入新项目的宿主。目标是让 schema 编辑能力从第一次接入起就正确持久化，而不需要通过调试反推行为。

## 先区分两类写入

| 用户操作 | 归属 | 宿主入口 | 推荐存储位置 |
| --- | --- | --- | --- |
| 编辑字段值、增加或删除数组项、拖动数组行 | 业务文档 | `onChange`、`onSave` | 业务 JSON / 后端内容 API |
| 列左移、右移、标题栏拖拽、隐藏列、改列名、宽度、换行、可排序状态 | schema 元数据 | `setRootSchema` 或 `setNamedSchema` | 独立 schema 文件 / schema API |

这两类写入必须分开。把列布局写入业务 JSON 会污染运行时数据；只在 `onSave` 中保存业务文档则会让标题栏操作无法持久化。

## 数组与对象 schema 的职责

`object` schema 描述一条对象的字段；`array` schema 描述列表本身及其元素。表格列配置属于数组，而不是元素对象。

```ts
const assetListSchema: EditorSchema = {
  type: "array",
  "x-editor": {
    table: {
      columns: [
        { field: "id", label: "ID", sortable: true },
        { field: "title", label: "名称", sortable: true, width: 240 },
      ],
    },
  },
  items: {
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: "string", title: "ID" },
      title: { type: "string", title: "名称" },
    },
  },
};
```

不要把数组的 `x-editor.table` 放在 `items` 上。`items` 的 object schema 只服务单行字段编辑；列表的列顺序、可见性及标题栏操作必须写在数组根 schema 的 `x-editor.table`。

## 最小可写宿主

下面的例子将业务文档和 schema 分别由 API 保存。`setRootSchema` 完成后，必须把服务端返回的权威 schema 写回 React 状态；否则下一次渲染会覆盖刚刚调整的列配置。

```tsx
import { useMemo, useState } from "react";
import {
  EditorShell,
  type EditorDocuments,
  type EditorSchema,
  type EditorSchemaHost,
} from "super-json-editor";

type SourceId = "assets";

export function AssetEditor() {
  const [documents, setDocuments] = useState<EditorDocuments>({ assets: [] });
  const [schemas, setSchemas] = useState<Record<SourceId, EditorSchema>>({
    assets: assetListSchema,
  });

  const schemaHost = useMemo<EditorSchemaHost>(() => ({
    getSchema({ sourceId }) {
      return schemas[sourceId as SourceId];
    },
    async setRootSchema(schema, context) {
      const sourceId = context.sourceId as SourceId;
      const saved = await api.saveSchema(sourceId, schema);
      setSchemas((current) => ({ ...current, [sourceId]: saved }));
    },
  }), [schemas]);

  return (
    <EditorShell
      documents={documents}
      rootSourceId="assets"
      schemaHost={schemaHost}
      onChange={setDocuments}
      onSave={async (nextDocuments) => {
        const saved = await api.saveDocuments(nextDocuments);
        setDocuments(saved);
        return saved;
      }}
    />
  );
}
```

## 持久化建议

- 业务内容与 schema 都是版本化资产时：为每份业务文档保存对应 schema 文件。
- schema 只服务编辑器界面时：保存独立的 `editor-schemas.json` 或等价的 schema API 记录，不加入运行时导出和内容完整性哈希。
- 服务器端必须校验 `sourceId`，避免客户端任意写入路径。
- 保存后使用服务端响应更新状态；不要假定客户端提交的 schema 就是最终权威版本。

## 接入检查清单

- [ ] 每个 object 节点有自己的 `properties` schema。
- [ ] 每个 array 节点有自己的 `items` schema；对象数组的列配置在 array 根的 `x-editor.table`。
- [ ] `schemaHost.getSchema` 为每个 `sourceId` 返回根 schema。
- [ ] 可编辑标题栏时，`schemaHost.setRootSchema` 已接到真实持久化。
- [ ] 使用命名 schema 时，`getNamedSchema` 与 `setNamedSchema` 成对提供。
- [ ] 业务文档的 `onSave` 与 schema 的 setter 分别保存，且分别回读权威状态。
- [ ] 已验证：移动一列、刷新页面、列顺序保持不变。
