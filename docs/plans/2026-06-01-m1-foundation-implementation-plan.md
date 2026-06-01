# Super JSON Editor M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working foundation of Super JSON Editor with a reusable core path/value model, a React host shell, and automated tests.

**Architecture:** The milestone is intentionally narrow. We create a small `core` layer for JSON path traversal and immutable-friendly value replacement, then a `react` layer that renders a minimal editor shell and proves the project can host future data-editor UI extraction. The host-facing API stays abstract: this milestone focuses on local in-memory editing only.

**Tech Stack:** React 18, TypeScript, Vite 5, Vitest, Testing Library

---

## File Structure

- `package.json`
  - Workspace metadata, scripts, dependencies
- `tsconfig.json`
  - TypeScript compiler settings for app and tests
- `vite.config.ts`
  - Vite config with React plugin and Vitest setup
- `index.html`
  - Vite entry document
- `src/main.tsx`
  - App bootstrap
- `src/styles.css`
  - Initial shell styles, visually aligned with the current data-editor direction
- `src/App.tsx`
  - Demo shell that hosts the editor
- `src/core/path.ts`
  - Path segment type and path formatting helpers
- `src/core/document.ts`
  - Read/write helpers for nested JSON values
- `src/editor/types.ts`
  - Public editor value types
- `src/editor/EditorShell.tsx`
  - Minimal reusable editor shell component
- `src/editor/Breadcrumbs.tsx`
  - Current path display
- `src/editor/ValueInspector.tsx`
  - Minimal recursive current-node inspector
- `src/test/setup.ts`
  - Testing Library setup
- `tests/core/document.test.ts`
  - Core nested read/write tests
- `tests/react/editor-shell.test.tsx`
  - UI smoke test for shell and navigation display

### Task 1: Scaffold Project Tooling

**Files:**
- Create: `G:\Projects\super-json-editor\package.json`
- Create: `G:\Projects\super-json-editor\tsconfig.json`
- Create: `G:\Projects\super-json-editor\vite.config.ts`
- Create: `G:\Projects\super-json-editor\index.html`
- Create: `G:\Projects\super-json-editor\src/main.tsx`
- Create: `G:\Projects\super-json-editor\src/test/setup.ts`

- [ ] **Step 1: Write the failing tooling smoke test target**

```tsx
// tests/react/editor-shell.test.tsx
import { render, screen } from "@testing-library/react";
import { EditorShell } from "../../src/editor/EditorShell";

test("renders editor shell title", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/react/editor-shell.test.tsx`
Expected: FAIL because project files and test runner are not configured yet

- [ ] **Step 3: Write minimal tooling configuration**

```json
{
  "name": "super-json-editor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
```

- [ ] **Step 4: Run test to verify the harness is alive**

Run: `npm test -- --run tests/react/editor-shell.test.tsx`
Expected: FAIL because `EditorShell` does not exist, proving test infrastructure works

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.tsx src/test/setup.ts tests/react/editor-shell.test.tsx
git commit -m "chore: scaffold super json editor tooling"
```

### Task 2: Build Core Nested Document Helpers

**Files:**
- Create: `G:\Projects\super-json-editor\src/core/path.ts`
- Create: `G:\Projects\super-json-editor\src/core/document.ts`
- Create: `G:\Projects\super-json-editor\src/editor/types.ts`
- Test: `G:\Projects\super-json-editor\tests/core/document.test.ts`

- [ ] **Step 1: Write the failing core tests**

```ts
import { describe, expect, test } from "vitest";
import { getValueAtPath, setValueAtPath } from "../../src/core/document";

describe("document helpers", () => {
  test("reads a nested object value by path", () => {
    const value = { user: { profile: { name: "Lans" } } };
    expect(getValueAtPath(value, ["user", "profile", "name"])).toBe("Lans");
  });

  test("reads an array item by path", () => {
    const value = { items: [{ id: "a" }, { id: "b" }] };
    expect(getValueAtPath(value, ["items", 1, "id"])).toBe("b");
  });

  test("writes a nested value without losing siblings", () => {
    const value = { user: { profile: { name: "Lans", role: "designer" } } };
    const next = setValueAtPath(value, ["user", "profile", "name"], "Pang");
    expect(next).toEqual({ user: { profile: { name: "Pang", role: "designer" } } });
    expect(value.user.profile.name).toBe("Lans");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/core/document.test.ts`
Expected: FAIL because `getValueAtPath` and `setValueAtPath` do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/path.ts
export type PathSegment = string | number;
export type JsonPath = PathSegment[];
```

```ts
// src/core/document.ts
import type { JsonPath } from "./path";

export function getValueAtPath(root: unknown, path: JsonPath): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (typeof segment === "number" && Array.isArray(current)) return current[segment];
    if (typeof segment === "string" && typeof current === "object") return (current as Record<string, unknown>)[segment];
    return undefined;
  }, root);
}

export function setValueAtPath(root: unknown, path: JsonPath, nextValue: unknown): unknown {
  if (path.length === 0) return nextValue;
  const [head, ...tail] = path;

  if (typeof head === "number") {
    const source = Array.isArray(root) ? root : [];
    const copy = [...source];
    copy[head] = setValueAtPath(copy[head], tail, nextValue);
    return copy;
  }

  const source = root && typeof root === "object" && !Array.isArray(root) ? root as Record<string, unknown> : {};
  return {
    ...source,
    [head]: setValueAtPath(source[head], tail, nextValue),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/core/document.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/path.ts src/core/document.ts src/editor/types.ts tests/core/document.test.ts
git commit -m "feat: add core nested document helpers"
```

### Task 3: Build Minimal Reusable React Shell

**Files:**
- Create: `G:\Projects\super-json-editor\src/App.tsx`
- Create: `G:\Projects\super-json-editor\src/styles.css`
- Create: `G:\Projects\super-json-editor\src/editor/EditorShell.tsx`
- Create: `G:\Projects\super-json-editor\src/editor/Breadcrumbs.tsx`
- Create: `G:\Projects\super-json-editor\src/editor/ValueInspector.tsx`
- Test: `G:\Projects\super-json-editor\tests/react/editor-shell.test.tsx`

- [ ] **Step 1: Extend the failing UI test**

```tsx
import { render, screen } from "@testing-library/react";
import { EditorShell } from "../../src/editor/EditorShell";

test("renders editor shell title and root path", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getByText("Root")).toBeInTheDocument();
  expect(screen.getByText("object")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/react/editor-shell.test.tsx`
Expected: FAIL because the shell component does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/editor/EditorShell.tsx
import { useMemo, useState } from "react";
import type { JsonPath } from "../core/path";
import { getValueAtPath } from "../core/document";
import { Breadcrumbs } from "./Breadcrumbs";
import { ValueInspector } from "./ValueInspector";

export function EditorShell({ value }: { value: unknown }) {
  const [path, setPath] = useState<JsonPath>([]);
  const currentValue = useMemo(() => getValueAtPath(value, path), [value, path]);

  return (
    <div className="editor-shell">
      <header className="editor-shell__header">
        <div>
          <div className="editor-shell__kicker">Universal JSON Editor</div>
          <h1>Super JSON Editor</h1>
        </div>
      </header>
      <section className="editor-shell__panel">
        <Breadcrumbs path={path} onNavigate={setPath} />
        <ValueInspector value={currentValue} path={path} onNavigate={setPath} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test and build verification**

Run: `npm test -- --run tests/react/editor-shell.test.tsx`
Expected: PASS

Run: `npm run build`
Expected: Vite production build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css src/editor/EditorShell.tsx src/editor/Breadcrumbs.tsx src/editor/ValueInspector.tsx tests/react/editor-shell.test.tsx
git commit -m "feat: add initial react editor shell"
```

### Task 4: Wire Demo App and Baseline Visual Direction

**Files:**
- Modify: `G:\Projects\super-json-editor\src/App.tsx`
- Modify: `G:\Projects\super-json-editor\src/main.tsx`
- Modify: `G:\Projects\super-json-editor\src/styles.css`

- [ ] **Step 1: Write the failing smoke expectation for demo content**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "../../src/App";

test("renders the demo document title field", () => {
  render(<App />);
  expect(screen.getByText("starter-document")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/react/editor-shell.test.tsx`
Expected: FAIL because `App` does not yet render the seeded demo

- [ ] **Step 3: Write minimal seeded app**

```tsx
// src/App.tsx
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
```

- [ ] **Step 4: Run tests and build**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx src/styles.css tests/react/editor-shell.test.tsx
git commit -m "feat: add seeded demo app"
```
