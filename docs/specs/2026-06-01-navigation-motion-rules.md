# Navigation And Motion Rules

## Purpose

This document defines the intended navigation and motion semantics for the `super-json-editor` page stack.

It exists to stop the editor from treating all page changes as the same generic animation.

The guiding principle is:

- motion should express user intent
- only the pages that conceptually move should animate
- unrelated pages should stay still

---

## Mental Model

The editor keeps a full internal navigation stack, but visually shows at most the last two pages.

Those two visible pages have roles:

- left page: context page
- right page: current working page

Not every navigation event changes both roles.
That is why motion cannot be handled by one universal push animation.

---

## Motion Types

There are two allowed motion types:

### 1. Push

Use when the current right page opens a deeper child page.

Visual meaning:

- the old left page exits
- the old right page moves left and becomes the new context page
- a new page enters from the right

This is the most expressive transition and should be reserved for real deeper navigation.

### 2. Replace

Use when the left page remains the same, but the right page changes.

Visual meaning:

- the left page stays completely still
- the old right page exits
- the new right page enters

This should be used for:

- opening a sibling child from the left page
- switching top-level entries while root remains the left page
- other cases where the visual context stays but the active right page changes

## Navigation Rules

## Rule A: Single page to two pages

If only one page is visible and the current page opens a child:

- use `push`

Reason:

- the existing page becomes context
- the new child becomes current

---

## Rule B: Right page opens a deeper child

If two pages are visible and the current right page opens a deeper child:

- use `push`

Reason:

- the current right page is being promoted into the left context role
- the old left page is leaving the visible window
- a new right page is being created

---

## Rule C: Left page opens a sibling child

If two pages are visible and the user clicks a nested item inside the left page:

- use `replace`

Reason:

- the left page remains the same context page
- only the right page changes

The left page must not slide, flicker, or re-enter.

---

## Rule D: Sidebar or top-level switch with root still visible

If the left page remains `root` and the user switches to another top-level item:

- use `replace`

Reason:

- `root` remains the context page
- only the right page changes

---

## Rule E: Back from two visible pages to one page

If the user goes back and the visible stack shrinks from two pages to one:

- use a direct `cut`

Reason:

- back should not imply a rightward page-exit animation
- the visible state should update immediately

---

## Rule F: Back from two visible pages to another two-page pair

If the user goes back and the old left page becomes the new right page:

- use a direct `cut`

Reason:

- this is still a contraction of visible history
- direct replacement is preferable to a misleading exit animation

---

## Rule G: Jump that keeps the same left page but changes the right page

If a breadcrumb or other jump keeps the left visible page unchanged but replaces the right page:

- use `replace`

Reason:

- visual context is preserved
- only the active page changes

---

## Rule H: Large discontinuous jumps

If a jump changes the visible state in a way that does not preserve a clear push or replace relationship:

- do not force a generic animation
- allow a direct cut

Examples:

- jump from a deep nested two-page state directly to root
- jump to a distant page that does not preserve either visible role

Reason:

- forcing an unrelated motion makes the UI feel fake
- direct cuts are preferable to misleading animation

---

## Product Constraint

The motion system should always prefer:

- no animation

over:

- a misleading animation

This is especially important in a small product like `super-json-editor`.
The goal is not maximal animation coverage.
The goal is trustworthy interaction semantics.

