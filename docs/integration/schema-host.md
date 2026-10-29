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

## 统一编辑事务、草稿与校验

`EditorShell` 是已接受文档的唯一写入 owner。表格、详情、新增行／属性、复制、删除、重排、引用选取和 Raw 都调用同一 `prepareEdit`：

```text
输入草稿 → 完整根 schema＋sourceId＋绝对路径 → 安全规范化
         → 候选文档约束与只读检查 → 原子应用 → onChange → 宿主保存
```

- **schema 权威**：`title`、`x-editor` 是展示信息；`type`、`required` 等是数据约束。显式根 schema 不再因现值类型不兼容而被忽略。页面仍可展示错误数据，但不能用推断类型取消约束；仅没有宿主声明时使用推断。切片 schema 保留根引用上下文，校验保留 `allOf` 合取、`oneOf` 唯一分支及联合外层约束，而非把展示用合并结果当作完整合同。
- **草稿不等于文档**：数值输入用保留原文的文本控件，`-`、空串、暂时违反 minimum/required 的内容只留在 Shell 草稿。可以逐字段修正；全部满足当前源文档约束后一次应用。`onChange` 只通知成功的编辑事务，不再表示每次按键、宿主加载或保存回执。只想显示序号而不限定类型时可声明 `{ title: "序号" }`。
- **创建**：没有 default 的字段可以缺省；创建得到的 0、空对象等是候选，不保证满足所有约束。联合类型没有明确 default 时不自动选第一分支，待新增值提供分支选择。新增行输入可暂存，退出编辑模式后可恢复；Create 后不合格的行转入会话草稿，可继续补齐嵌套字段，不向宿主提交半成品。
- **转换范围**：普通修改只规范化实际变化部分，不借编辑顺便迁移其它存量数据；Raw Apply 明确规范化当前替换范围。数字／布尔字符串仅在类型明确且转换无歧义时转换。字符串联合合法分支保持原值；不把空串当零、不截断小数、不删字段补默认值。Raw 解码同时检查原始数字 token，避免 JSON.parse 已舍入后才检查精度。
- **失败与保护**：Raw 和父容器替换也检查 readOnly、const 删除等保护；约束失败不部分应用。Raw 文本按 source/path 留在 Shell 会话缓存，关闭页面后可恢复，显式放弃才删除；结构化草稿也有显式放弃入口。草稿期间宿主或 schema 变化时保留草稿并阻止旧基准静默覆盖新数据，需要复制保留内容后重新应用。缓存仅存当前编辑会话，不是持久化草稿系统。
- **保存边界**：保存前检查未解决草稿，并仅对相对已保存快照有变更的 source 检查当前 schema 下的提交资格；预加载但未改动的其它资产不属于本次保存校验范围。本次修改的文档仍须通过校验，不能因只改一个字段而绕过其约束。不做转换、自动补值或修复；真正 I/O 仍由宿主 `onSave` 承担。保存失败不清草稿；异步保存返回只确认当时提交的快照，不覆盖等待期间的后续编辑。宿主应只持久化 `onSave` 收到的参数，不能自行从控件草稿取值。

校验反馈使用 `sourceId / 字段路径: 原因`，相同错误去重；有字段详情时不再重复展示 `Schema validation failed` 通用标记。Raw 和结构化草稿使用各自错误展示，保存资格失败集中展示来源与全部具体字段问题。

核心实现为 `src/editor/edit-transaction.ts` 与 `src/editor/schema.ts`；会话与显示适配分别在 `EditorShell.tsx`、`ValueInspector.tsx`。宿主无需新增转换器。读取文档、纯校验和 schema 展示都不改写用户数据。

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
