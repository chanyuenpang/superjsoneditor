# Super JSON Editor

Super JSON Editor 是一个独立的、可复用的通用 JSON 编辑器项目。

当前目标分为两层：

1. 构建一个可被任意网页项目引用的通用 JSON 编辑器内核与 UI 组件。
2. 基于这个通用编辑器，为 `tiny-world` 构建一个专用的资产编辑器。

## 当前阶段

当前仓库处于规格澄清阶段，优先沉淀设计文档，不急着进入实现。

已确认的方向：

- 项目显示名使用 `Super JSON Editor`
- 项目目录和仓库名使用 `super-json-editor`
- 优先做“可被各种项目引用”的通用编辑器，而不是先做桌面壳
- `tiny-world` 作为第一批落地宿主项目之一
- 通用编辑器与项目专用资产编辑器拆成两层，而不是混成一个应用

## 文档

- [项目定位与范围](G:\Projects\super-json-editor\docs\specs\2026-06-01-project-scope.md)
- [第一版规格草案](G:\Projects\super-json-editor\docs\specs\2026-06-01-v1-spec-draft.md)
- [技术实现文档](G:\Projects\super-json-editor\docs\specs\2026-06-01-technical-design.md)
