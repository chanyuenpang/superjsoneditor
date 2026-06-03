# Super JSON Editor Schema-Based CRUD 实施计划

## 摘要

本计划用于推进 `super-json-editor` 的 **schema-based CRUD** 能力。

这里的 CRUD 只指 **节点级 CRUD**：

- 对象字段新增 / 删除
- 数组项新增 / 删除 / 复制
- primitive 值修改
- `nullable` / `oneOf` / `anyOf` 分支切换

资源级 CRUD 例如：

- 新建资源文件
- 复制资源文件
- 重命名资源文件
- 删除资源文件

这些继续属于 host，不下沉到编辑器内核。

## 目标与完成标准

### 目标

把 `super-json-editor` 从“已有基础 schema 支持的 JSON 编辑器”推进到“对象、数组、分支都能按 schema 专业编辑”的通用编辑器。

### 完成标准

- `stack-flow` 与 `pinned-root` 两种模式下都能工作
- 有 schema 时，主要编辑路径优先提供合法操作
- Raw 模式继续参与同一套 schema 校验
- 节点级 CRUD 的约束逻辑留在 editor
- 资源级 CRUD 的工作流仍由 host 负责

## 第一阶段：对象 CRUD schema 化

### 目标

让对象字段编辑彻底受 schema 驱动，而不是“部分受控 + 保存时报错”。

### 要求

- 删除 `required` 字段时，UI 直接拦截并说明原因
- `const` 字段统一只读
- `additionalProperties: false` 时，只允许新增已声明字段
- `additionalProperties: {schema}` 时，允许动态 key，但值必须按该 schema 生成
- `patternProperties` 支持动态 key，并在新增区提示匹配规则
- 字段顺序继续优先按 `properties`，动态字段追加在后

### 不做

- 不做业务专用字段控件
- 不把对象 CRUD 和资源文件 CRUD 混在一起

## 第二阶段：数组 CRUD schema 化

### 目标

让数组新增、删除、复制都以 `items` 和数组约束为准。

### 要求

- 新增数组项完全由 `items` schema 决定
- 复制数组项沿用当前值
- 新增空项必须走 schema 默认值生成
- `minItems / maxItems` 接入新增删除限制
- `uniqueItems` 先以校验与保存拦截为主，不做复杂交互引导
- 对象数组列头继续优先按 `items.properties`
- 混合数组继续保持当前退化处理

## 第三阶段：类型分支 CRUD

### 目标

让 `nullable` 与联合分支从“能校验”升级到“能编辑”。

### 要求

- `nullable` 提供显式切换
- `oneOf / anyOf` 提供统一分支切换器
- 切换分支时，值按目标分支 schema 重建
- 分支切换与 Raw 模式共享同一套校验闭环

### 不做

- 不做业务专用智能推断
- 不做复杂组合语义的定制交互器

## 第四阶段：宿主回接与验收

### 目标

用通用 host 验证 editor 内核能力，而不是把宿主逻辑塞回内核。

### 要求

- `json-editor-host` 继续作为通用 host 示例
- 宿主负责资源级 CRUD、类型切换、保存后编译、错误整合
- `pinned-root` 作为宿主默认形态继续使用
- 真实样本只作为验收，不作为内核规则来源

## 接口边界

### `EditorShellProps`

- 保持现有 `layoutMode?: "stack-flow" | "pinned-root"`
- 不新增资源级 CRUD API

### `EditorSchema`

- 继续以 `JSON Schema 2020-12` 为主
- 对象、数组、联合类型能力继续下沉到 schema 解释层与 UI 解释层

### `EditorHost`

- 不扩成资源管理 API
- 继续只负责引用解析、标签增强、候选项等宿主增强能力

## 测试要求

### 核心测试

- `required` 字段删除拦截
- `const` 字段只读
- `additionalProperties: false` 下新增字段受控
- `additionalProperties: {schema}` 下动态字段默认值正确
- `patternProperties` 动态 key 创建与提示
- 数组项按 `items` schema 生成
- `minItems / maxItems` 限制生效
- `nullable` 切换
- `oneOf / anyOf` 分支切换
- Raw 编辑后 schema 校验拦截

### 集成测试

- `pinned-root` 宿主形态下 root registry 能稳定进入资源详情
- 节点级 schema CRUD 生效时，保存与错误回落正确

## 默认决策

- 本轮以 **对象 CRUD 优先** 作为第一执行阶段
- `uniqueItems`、复杂组合语义、复杂 format 控件先按“校验优先，交互后补”处理
- 不把资源级 CRUD 下沉到 `super-json-editor`
- `pinned-root` 继续视为正式通用能力，而不是宿主特例
