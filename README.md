# Super JSON Editor

Super JSON Editor 是一个**可复用、可嵌入**的通用 JSON 编辑器。

它的产品目标很明确：

1. 提供一个可嵌入任意网页项目的通用 JSON 编辑器
2. 在交互与视觉质量上达到产品级水准
3. 通过宿主接口承接项目侧规则，而不是把业务逻辑写死在编辑器内核里

## 当前能力

当前版本已经具备以下核心能力：

- `object / array / primitive` 的结构化编辑
- 多文档编辑
- 跨文档引用跳转
- host 驱动的 `Save / Reload`
- 内存态 dirty tracking
- 可选只读模式
- 基于 `JSON Schema 2020-12` 的专业编辑增强
- 两种正式布局模式：
  - `stack-flow`
  - `pinned-root`

## 两种布局模式

### `stack-flow`

这是默认模式。

特点：

- 所有页面都按导航栈流动
- `push / pop / jump` 直接作用在当前整页
- 适合纯文档浏览、深层嵌套编辑、通用 JSON 场景

### `pinned-root`

这是面向“固定 root 工作台”场景的通用模式。

特点：

- root 页固定在左侧
- 右侧展示当前工作页
- 内部仍然沿用同一套导航栈与引用跳转模型
- 适合 registry 根页、资源入口页、固定目录工作台这类宿主形态

这个模式是**通用编辑器能力**，不是某个项目专用壳层。

## Schema 专业模式

当 host 提供 schema 时，编辑器会从自由 JSON 模式切换到**强约束 schema 模式**。

当前已支持的重点能力：

- `properties`
- `required`
- `additionalProperties`
- `patternProperties`
- `items`
- `enum`
- `const`
- `default`
- nullable multi-type
- `oneOf / anyOf`
- 常见字符串 / 数字 / 数组边界约束

当前交互原则：

- 有 schema 时，优先提供**合法编辑路径**
- `required` 字段不允许静默删除
- `const` 字段只读
- Raw 模式如果开启，也必须走同一套 schema 校验

## 包入口

```ts
import {
  EditorShell,
  type EditorDocuments,
  type EditorHost,
  type EditorSchemaHost,
} from "super-json-editor";
import "super-json-editor/styles.css";
```

## 最小 React 示例

```tsx
import { useState } from "react";
import { EditorShell, type EditorDocuments } from "super-json-editor";
import "super-json-editor/styles.css";

const initialDocuments: EditorDocuments = {
  main: {
    title: "Super JSON Editor",
    profile: {
      name: "Hero",
      stats: { hp: 10 },
    },
  },
};

export function JsonEditorHost() {
  const [documents, setDocuments] = useState(initialDocuments);

  return (
    <EditorShell
      documents={documents}
      rootSourceId="main"
      layoutMode="stack-flow"
      onSave={async (nextDocuments) => {
        await persistDocuments(nextDocuments);
        setDocuments(nextDocuments);
        return nextDocuments;
      }}
      onReload={async () => {
        const latest = await loadDocuments();
        setDocuments(latest);
        return latest;
      }}
    />
  );
}
```

## `pinned-root` 宿主示例

```tsx
<EditorShell
  documents={documents}
  rootSourceId="editor/registry/quest"
  rootPageTitle="任务"
  layoutMode="pinned-root"
  showDocumentTitle={false}
  host={editorHost}
  schemaHost={schemaHost}
  onSave={handleSave}
/>
```

这类宿主通常会：

- 把 root 文档作为固定入口页
- 让 root 字段值承载引用 URI
- 在宿主外层提供资源级 CRUD、类型切换、编译等工作流

## Host 职责

宿主需要负责：

- 提供 `documents`
- 通过 `rootSourceId` 选择真正的根文档
- 决定使用 `stack-flow` 还是 `pinned-root`
- 在 `onSave` 中实现真实持久化
- 在 `onReload` 中实现权威重载
- 通过 `EditorHost` 提供引用解析、标签增强等能力
- 在需要时通过 `EditorSchemaHost` 提供 schema

编辑器内核不负责：

- 项目专用资源类型规则
- 资源级 CRUD 语义
- 编译、发布、索引等宿主工作流

## 当前阶段

当前项目已经不再停留在纯 spec 阶段，而是进入了**通用编辑器能力收口阶段**。

现阶段的重点是：

- 打磨导航与布局模式语义
- 完善 schema 专业模式
- 稳定宿主接入边界

## 文档索引

- [项目定位](docs/specs/2026-06-01-project-scope.md)
- [第一版规格草案](docs/specs/2026-06-01-v1-spec-draft.md)
- [技术实现文档](docs/specs/2026-06-01-technical-design.md)
- [导航与动效规则](docs/specs/2026-06-01-navigation-motion-rules.md)
- [Schema 模式与 2020-12 支持设计](docs/specs/2026-06-03-schema-mode-and-2020-12-support.md)
- [Left Page Fullscreen 设计说明](docs/specs/2026-06-04-left-page-fullscreen-design.md)
- [Schema-Based CRUD 实施计划](docs/plans/2026-06-03-schema-based-crud-plan.md)
- [Left Page Fullscreen 实现计划](docs/plans/2026-06-04-left-page-fullscreen-implementation-plan.md)
- [产品路线图](docs/plans/2026-06-01-product-roadmap.md)
