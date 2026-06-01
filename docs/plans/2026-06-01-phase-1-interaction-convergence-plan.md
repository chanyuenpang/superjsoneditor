# Phase 1 Interaction Convergence Plan

## Purpose

This plan turns `Phase 1: Interaction Convergence` from the product roadmap into an execution-ready checklist.

It is intentionally narrower than the full roadmap.
Its job is to answer one question:

What exactly has to be completed before `super-json-editor` can leave the interaction-convergence stage and move into product-foundation hardening?

---

## Phase 1 Goal

Make the editor's core interaction model feel correct, mature, and predictable in daily use.

At the end of Phase 1:

- the main navigation semantics should feel stable
- array and object pages should have clearly differentiated roles
- page motion should match user intent
- the UI should feel much closer to `Nocturne data-editor` than to a prototype

Phase 1 is complete when remaining work is mostly engineering cleanup and capability extension, not repeated correction of basic interaction behavior.

---

## Current Snapshot

The project already has:

- a running editor shell
- stack-based page navigation
- array, object, primitive, and reference pages
- structured primitive editing
- raw JSON fallback
- host-driven reference resolution
- basic motion differentiation between push, replace, and back

The main remaining issues are not "missing editor existence."
They are about quality:

- interaction edge cases are still being refined
- motion is not fully settled
- array workspace behavior still needs more `data-editor` borrowing
- object-page editing density and rhythm still need to tighten
- the demo and main product surface are not yet convincing enough as a mature product

---

## Exit Criteria

Phase 1 is complete only when all of the following are true:

1. The editor's page navigation semantics stop changing in response to basic usage feedback.
2. The user can predict which page moves in each navigation case.
3. Array pages feel like a real workspace, not a generic JSON table.
4. Object pages feel like a real structured detail editor, not a lightly skinned inspector.
5. Raw JSON is clearly secondary in the main experience.
6. The editor no longer reads as a prototype in normal use.

If any of those are still false, the project remains in Phase 1.

---

## Workstreams

Phase 1 should be executed through five workstreams.

## Workstream A: Navigation Semantics

### Goal

Lock the behavioral rules for page transitions and page replacement.

### Required outcomes

- Deep navigation from the right page is stable.
- Replacing the right page from the left page is stable.
- Top-level switching with root still visible behaves intentionally.
- Breadcrumb jumps behave intentionally.
- Sidebar jumps behave intentionally.
- Back behavior feels correct from all visible stack states.

### Open cases to finalize

1. Root -> top-level open
2. Left page -> open a sibling child
3. Right page -> open a deeper child
4. Breadcrumb jump to root
5. Breadcrumb jump to left visible page
6. Breadcrumb jump across multiple levels
7. Sidebar jump when only one page is visible
8. Sidebar jump when two pages are visible
9. Back from one visible page
10. Back from two visible pages

### Done means

- Each case above has an intentional rule
- The rule is covered by tests where appropriate
- No case is still handled by accident through generic fallback behavior

---

## Workstream B: Motion Semantics

### Goal

Make page motion visually match navigation intent.

### Required outcomes

- Push, replace, and back are distinct motion types
- Only the pages that conceptually move should animate
- No fake movement caused by slot reassignment
- No flicker or jump during two-page transitions
- Motion timing feels deliberate rather than arbitrary

### Key questions to finish

1. Should right-page promotion use transform-based motion instead of layout-driven motion?
2. Should replace transitions use the same duration as deep push transitions?
3. Should back transitions be lighter than push transitions?
4. Do breadcrumb jumps animate, partially animate, or cut directly depending on distance?
5. Do sidebar jumps always animate, or only when the visible stack meaningfully persists?

### Done means

- Motion rules are documented in code-level terms
- The current animation system no longer needs repeated correction from obvious user feedback
- There is no remaining case where the UI appears to "jump" when it should "move"

---

## Workstream C: Array Workspace Quality

### Goal

Bring array pages much closer to `data-editor`'s table-workspace maturity.

### Required outcomes

- Column widths are content-driven
- Horizontal overflow scrolls inside the page
- Table density feels intentional
- Headers feel like real workspace headers, not placeholders
- Row click behavior is clear
- The table reads as the primary surface for array data

### Likely remaining improvements

1. Better header styling and rhythm
2. Better row selected/active state
3. Better row identity display for object items
4. Better handling for mixed-type arrays
5. Better handling for wide nested summaries
6. Clearer first-column treatment for identity/title-like fields

### Done means

- Complex arrays feel natural to browse
- The table does not look like a temporary renderer
- The workspace interaction quality is recognizably inherited from `data-editor`

---

## Workstream D: Object Page Quality

### Goal

Bring object pages closer to a mature detail-editor experience.

### Required outcomes

- Field rows feel structured and readable
- Primitive editing feels direct and low-friction
- Nested values are clearly presented as navigable child pages
- Page width stays appropriate for detail editing
- Visual density feels closer to `data-editor`

### Likely remaining improvements

1. Better grouping and spacing rhythm
2. Stronger field label/value hierarchy
3. Better summaries for nested arrays, objects, and references
4. Better handling of long text and multiline values
5. Better visual treatment for empty objects and small objects

### Done means

- Object pages feel like the detail-editor half of the product
- The current page is easy to scan and edit without looking improvised
- Raw JSON no longer competes visually with the structured surface

---

## Workstream E: Demo and Product Surface Credibility

### Goal

Make the demo and visible product surface representative of the intended product.

### Required outcomes

- The demo uses a sufficiently complex JSON structure
- The demo highlights the real editor, not internal debug affordances
- The visible experience reflects product goals
- The repository entrypoint does not misrepresent current stage

### Likely remaining improvements

1. Improve the default demo dataset presentation
2. Ensure the starting path showcases the product well
3. Remove any remaining awkward prototype copy or visual artifacts
4. Keep README and roadmap aligned with actual state

### Done means

- A first-time viewer can understand the intended product quality from the demo
- The demo is usable as a product-evaluation artifact

---

## Execution Order

Phase 1 should be executed in this order:

1. Navigation semantics
2. Motion semantics
3. Array workspace quality
4. Object page quality
5. Demo and product-surface credibility

This order matters because:

- motion depends on navigation rules
- page polish depends on stable motion and layout rules
- demo credibility depends on the editor actually being convincing

---

## Deliverables Before Phase Exit

Before Phase 1 is considered complete, the repo should contain:

- updated navigation and motion tests for finalized semantics
- a cleaner and more stable `EditorShell` behavior model
- array pages that feel plausibly product-grade
- object pages that feel plausibly product-grade
- a demo surface that reflects real product quality

---

## Transition Condition To Phase 2

The project should move to `Phase 2: Product Foundation Hardening` only when:

1. The user is no longer giving repeated feedback that changes basic interaction semantics.
2. The editor's main workflows feel right often enough that cleanup becomes more valuable than redesign.
3. The main remaining concerns sound like:
   - "this logic should be cleaner"
   - "this should be easier to maintain"
   - "this should be split into clearer modules"

The project should stay in Phase 1 if the main feedback still sounds like:

- "this should not move"
- "this should animate differently"
- "this layout still feels wrong"
- "this page does not feel like the intended editor"

---

## Immediate Next Step

The next concrete task after writing this plan should be:

Document the current navigation and motion rules explicitly, then close the remaining Phase 1 animation issues before moving on to more visual polish.

