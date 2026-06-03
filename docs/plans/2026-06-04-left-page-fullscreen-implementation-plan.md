# Left Page Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `EditorShell` 增加 `leftPageFullscreen` 开关，让单页时自动铺满编辑器，并在存在右页时为右页提供关闭按钮。

**Architecture:** 该能力是一个独立的显示行为开关，不新增新的 `layoutMode`。实现集中落在 `EditorShell` 的可见页宽度分配、`ValueInspector/PageHeader` 的右页关闭入口，以及对应的样式和回归测试。

**Tech Stack:** React、TypeScript、Vitest、现有 `EditorShell / ValueInspector / styles.css`

---

### Task 1: 扩展 `EditorShellProps` 并接入单页全屏判定

**Files:**
- Modify: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/src/editor/EditorShell.tsx`
- Test: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/tests/react/editor-shell.test.tsx`

- [ ] **Step 1: 先补一个失败测试，覆盖 `stack-flow + leftPageFullscreen=true` 的单页全屏场景**

在测试里渲染只有 root 的 `EditorShell`，传入：

```tsx
<EditorShell
  value={{ title: "demo" }}
  layoutMode="stack-flow"
  leftPageFullscreen
/>
```

断言：

- 当前只渲染一页
- 单页节点带有新的全屏 class 或 style 标记

- [ ] **Step 2: 运行单测，确认当前测试失败**

Run:

```bash
npm test -- --run tests/react/editor-shell.test.tsx
```

Expected:

- 新增断言失败，因为当前还没有 `leftPageFullscreen` 能力

- [ ] **Step 3: 在 `EditorShellProps` 中增加 `leftPageFullscreen?: boolean`**

修改 `EditorShell.tsx` 的 props：

```ts
export type EditorShellProps = {
  documents?: Record<string, unknown>;
  rootSourceId?: string;
  rootPageTitle?: string;
  showDocumentTitle?: boolean;
  layoutMode?: "stack-flow" | "pinned-root";
  leftPageFullscreen?: boolean;
  compactBreakpoint?: number;
  value?: unknown;
  // ...
};
```

并给默认值：

```ts
leftPageFullscreen = false,
```

- [ ] **Step 4: 在 `EditorShell` 中抽出“当前是否只有左页”的统一判断**

新增统一布尔值，类似：

```ts
const hasVisibleRightPage = visiblePages.length > 1;
const useFullscreenLeftPage = leftPageFullscreen && !hasVisibleRightPage;
```

要求：

- `stack-flow` 和 `pinned-root` 共用这套判断
- 不改变不开开关时的行为

- [ ] **Step 5: 调整单页场景下的页宽分配**

在 `EditorShell` 的渲染逻辑中：

- 当 `useFullscreenLeftPage` 为 `true` 时
  - 单页渲染不再使用默认左槽宽
  - 直接让唯一可见页占满编辑器宽度

实现要求：

- 不新增新的 `layoutMode`
- 不改现有多页场景的布局语义

- [ ] **Step 6: 重新运行单测，确认新增场景通过**

Run:

```bash
npm test -- --run tests/react/editor-shell.test.tsx
```

Expected:

- 新增 `leftPageFullscreen` 单页测试通过


### Task 2: 为右页增加关闭按钮

**Files:**
- Modify: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/src/editor/ValueInspector.tsx`
- Modify: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/src/editor/EditorShell.tsx`
- Test: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/tests/react/editor-shell.test.tsx`

- [ ] **Step 1: 先补失败测试，覆盖“有右页时显示关闭按钮”**

在测试里分别覆盖：

- `stack-flow + leftPageFullscreen`
- `pinned-root + leftPageFullscreen`

断言：

- 打开第二页后，右页 header 出现关闭按钮

- [ ] **Step 2: 运行单测，确认关闭按钮场景先失败**

Run:

```bash
npm test -- --run tests/react/editor-shell.test.tsx
```

Expected:

- 找不到关闭按钮

- [ ] **Step 3: 为 `ValueInspectorProps` 增加 `onClosePage?: () => void`**

在 `ValueInspector.tsx` 中为页头动作区增加可选关闭动作：

```ts
type ValueInspectorProps = {
  // ...
  onClosePage?: () => void;
};
```

要求：

- 这是可选能力
- 左页默认不显示

- [ ] **Step 4: 在 `PageHeader` actions 区渲染关闭按钮**

当 `onClosePage` 存在时，在右页 header actions 中渲染一个紧凑按钮，例如：

```tsx
<button
  className="ghost-button compact-button"
  type="button"
  onClick={props.onClosePage}
>
  Close
</button>
```

要求：

- 放在现有 actions 区
- 不挤掉已有 `Raw / Edit`

- [ ] **Step 5: 在 `EditorShell` 中只给右页传 `onClosePage`**

规则：

- 仅当 `leftPageFullscreen = true`
- 且当前存在右页
- 才给右页 `ValueInspector` 传入 `onClosePage`

行为：

- `stack-flow`：关闭后回到上一页单页态
- `pinned-root`：关闭后回到 root-only 单页态

实现建议：

```ts
onClosePage={() => {
  const nextState = goBack({
    documents: documentsBySourceId,
    rootSourceId,
    pages,
  });
  setPages(nextState.pages);
  setStackAnimation(determineBackAnimation(pages, nextState.pages, layoutMode));
}}
```

如果现有 `goBack` + 动画判定不足以区分，可先复用现有 back 逻辑，不新增第四套语义。

- [ ] **Step 6: 运行测试，确认关闭按钮显示与关闭行为正确**

Run:

```bash
npm test -- --run tests/react/editor-shell.test.tsx
```

Expected:

- 打开第二页后能找到关闭按钮
- 点击后回到单页


### Task 3: 补样式并让单页全屏视觉稳定

**Files:**
- Modify: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/src/styles.css`
- Test: `D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor/tests/react/editor-shell.test.tsx`

- [ ] **Step 1: 为单页全屏增加样式 class**

在 `EditorShell` 单页全屏场景下给页容器增加额外 class，例如：

```ts
"stack-page--fullscreen-left"
```

并在 `styles.css` 中声明：

```css
.stack-page--fullscreen-left {
  left: 0;
  right: 0;
  width: 100%;
}
```

- [ ] **Step 2: 确保 `pinned-root` 下没有右页时不再渲染空右页占位**

当 `leftPageFullscreen = true` 且只有 root 时：

- 不再渲染当前的 empty-state 右页
- 直接让 root 独占内容区

- [ ] **Step 3: 为关闭按钮补最小样式校验**

确保关闭按钮：

- 不会和现有 header actions 冲突
- 在 object / array / primitive 右页中都能正常显示

如需要，可复用现有：

```css
.page-header__actions
.ghost-button.compact-button
```

不新增复杂皮肤。

- [ ] **Step 4: 运行构建，确认样式改动无类型/打包问题**

Run:

```bash
npm run build
```

Expected:

- `super-json-editor` 构建通过


### Task 4: 为宿主示例接上开关

**Files:**
- Modify: `D:/Users/chany/Documents/tiny-world/tools/web/json-editor-host/src/App.tsx`
- Test: `D:/Users/chany/Documents/tiny-world/tools/web/json-editor-host/tests/app-root-content.test.tsx`

- [ ] **Step 1: 在 host 示例中显式开启 `leftPageFullscreen`**

在 `App.tsx` 的 `EditorShell` 调用上增加：

```tsx
leftPageFullscreen
```

- [ ] **Step 2: 补宿主集成测试断言**

在 `app-root-content.test.tsx` 中增加：

- `EditorShell` props 含有 `leftPageFullscreen: true`

- [ ] **Step 3: 运行宿主构建**

Run:

```bash
npm run build
```

Working directory:

```bash
D:/Users/chany/Documents/tiny-world/tools/web/json-editor-host
```

Expected:

- `json-editor-host` 构建通过


### Task 5: 最终回归

**Files:**
- Verify only

- [ ] **Step 1: 运行 editor 相关测试**

Run:

```bash
npm test -- --run tests/react/editor-shell.test.tsx
```

Working directory:

```bash
D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor
```

Expected:

- 全部通过

- [ ] **Step 2: 运行 editor 构建**

Run:

```bash
npm run build
```

Working directory:

```bash
D:/Users/chany/Documents/tiny-world/tools/web/super-json-editor
```

Expected:

- 构建通过

- [ ] **Step 3: 运行 host 构建**

Run:

```bash
npm run build
```

Working directory:

```bash
D:/Users/chany/Documents/tiny-world/tools/web/json-editor-host
```

Expected:

- 构建通过

- [ ] **Step 4: 浏览器人工检查**

检查以下场景：

1. `stack-flow + leftPageFullscreen`
   - 单页时铺满
   - 进入第二页后恢复
   - 关闭按钮可用

2. `pinned-root + leftPageFullscreen`
   - root-only 时铺满
   - 打开右页后恢复双栏
   - 关闭按钮回到 root-only

3. 未开启开关的宿主
   - 行为完全不变
