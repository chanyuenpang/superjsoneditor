# View File Schema Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-optional view file support so a schema-authored JSON can switch between default schema and a per-file view override, with demo-site controls that show the feature end to end.

**Architecture:** Keep the current schema-first editing flow, but teach the schema host contract about a resolved schema layer and a write target layer. The editor will keep rendering a merged schema while directing schema edits into either the default schema or the active view file schema, and the demo app will provide an in-memory host that simulates view files plus a toolbar toggle beside `Raw` and `Edit`.

**Tech Stack:** React, TypeScript, Vitest, existing `EditorShell` schema authoring flow, demo-site app state.

---

### Task 1: Extend Schema Host Types For View Files

**Files:**
- Modify: `src/editor/schema.ts`
- Test: `tests/react/editor-shell.test.tsx`

- [ ] Add schema host view-file types and write-target context to the public schema contract.
- [ ] Keep the old `setRootSchema` / `setNamedSchema` behavior working for hosts that do not implement view files.
- [ ] Define a write target shape that lets the editor say whether the current schema edit should hit the default schema or the active view file.

### Task 2: Teach EditorShell To Read Resolved Schema And Write To Active Layer

**Files:**
- Modify: `src/editor/EditorShell.tsx`
- Test: `tests/react/editor-shell.test.tsx`

- [ ] Resolve the current page schema through the schema host exactly once per lookup, using the active view-aware host path when available.
- [ ] Route schema authoring writes through the new host write-target context so edits in default mode still update the default schema, while edits in view mode update the active view schema only.
- [ ] Preserve current behavior for hosts that only implement the existing default schema APIs.

### Task 3: Add A Small Merge Utility For Default Schema Plus View Schema

**Files:**
- Create: `src/editor/view-schema.ts`
- Modify: `src/index.ts`
- Test: `tests/react/editor-shell.test.tsx`

- [ ] Add a focused merge helper that produces a resolved schema from a base schema and a view schema override.
- [ ] Use a simple recursive object merge strategy that prefers the view schema wherever it provides a value, which matches the agreed “default + view override” model.
- [ ] Export the helper so hosts can reuse the same merge semantics if they want to manage view files outside the demo site later.

### Task 4: Build Demo-Site View File Support

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/react/editor-shell.test.tsx`

- [ ] Replace the demo’s mutable schema host with a view-aware mutable host that can hold a default schema plus zero or more view files keyed by JSON path.
- [ ] Add in-memory demo view files for the schema-authoring scenario and expose a current mode toggle between default and view.
- [ ] Ensure schema edits while the demo is in view mode only change the active view file, while switching back to default still shows the untouched default schema plus any inherited fields.

### Task 5: Add Toolbar View Toggle Beside Raw And Edit

**Files:**
- Modify: `src/editor/ValueInspector.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.tsx`
- Test: `tests/react/editor-shell.test.tsx`

- [ ] Add a host-provided toggle button rendered beside `Raw` and `Edit` in the current page action row.
- [ ] Only show the toggle in the demo scenario that supports view files.
- [ ] Label the two states clearly as `Default` and `View`, with the button switching between them.

### Task 6: Verify End-To-End Behavior

**Files:**
- Modify: `tests/react/editor-shell.test.tsx`

- [ ] Add focused tests for resolved-schema inheritance, default-vs-view write targeting, and demo toggle behavior.
- [ ] Add a demo test that edits schema in view mode, switches back to default to confirm isolation, then switches into view again to confirm persistence.
- [ ] Run targeted Vitest coverage for the touched flows.
