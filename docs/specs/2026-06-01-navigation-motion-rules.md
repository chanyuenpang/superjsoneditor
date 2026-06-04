# Super JSON Editor Navigation Motion Rules

## Goal

This document defines the motion semantics for `super-json-editor`.

The purpose of the animation system is not "to animate every navigation". Its job is to make page-role changes readable:

- which page stays
- which page disappears
- which page becomes the new context page
- which page appears on the right

The motion system must serve those meanings, not override them.

---

## Core Model

We use three distinct concepts during animation:

### `real-left-page`

The page that would occupy the left slot if there were **no animation**.

Rules:

- It is part of the final layout.
- It should be rendered in its final place as early as possible.
- It must not be moved just because an animation is playing.
- Its header/footer shape should already match the final state.

### `real-right-page`

The page that would occupy the right slot if there were **no animation**.

Rules:

- It is also part of the final layout.
- It should not be used as a temporary moving prop.
- It may be hidden during animation if the motion semantics require the right slot to appear empty or be replaced by an animation page.

### `animation-page`

A temporary visual page used only to express movement.

Rules:

- It is not the final page state.
- It may move, fade, or be clipped.
- Its **first frame must already use the final intended chrome** for the role it is animating into.
- We do not animate the real page when an animation page can carry the motion.

---

## Four Atomic Motion Semantics

All editor motion should be described using these four atomic semantics.

### 1. `push-in`

Meaning:

- the old right page moves left
- it becomes the new left-side context page

Visual reading:

- a right page is sliding into the left slot
- the previous left page stays in place and reads as being "behind"

Important:

- the moving thing is an `animation-page`
- while that movement is visible, the `real-right-page` that it came from must already disappear, otherwise the motion breaks

### 2. `pop-out`

Meaning:

- the old left page moves right
- it becomes the new right-side page
- the new left page is revealed underneath it

Visual reading:

- a left-looking page slides to the right
- it exposes the page that was already prepared beneath it

Important:

- before the animation starts, the `real-left-page` for the target state must already be prepared underneath
- the moving thing is an `animation-page`, not the real left page itself

### 3. `fade-in`

Meaning:

- the right slot is replaced by a new page

Visual reading:

- a page appears on the right

### 4. `fade-out`

Meaning:

- the right slot is replaced by empty space

Visual reading:

- the current right page disappears

---

## Layout Mapping

The same navigation stack can be shown with two layout modes:

- `stack-flow`
- `pinned-root`

The navigation semantics and the motion semantics are related, but not identical.

---

## Pinned Root

### Mental Model

In `pinned-root`, the left page is structurally pinned. Therefore:

- there is no visual "right page becomes left page" transition
- there is no visual "left page becomes right page" transition

So `pinned-root` only needs:

- `fade-in`
- `fade-out`

It must never use:

- `push-in`
- `pop-out`

### Rules

#### Open first right page

Use:

- `fade-in`

#### Replace current right page

Use:

- `fade-in`

#### Close current right page

Use:

- `fade-out`

---

## Stack Flow

### Mental Model

`stack-flow` supports both:

- root-like states where the right side is empty
- dual-page states where both left and right roles are active

Because of that, `stack-flow` sometimes behaves like `pinned-root`, and sometimes needs full left/right role transitions.

### Non-Negotiable Constraint

The `real-left-page` is fixed.

That means:

- if the left side appears to move, that must be an `animation-page`
- not the real left page

---

## Stack Flow: Push

### Case A: Root state

State shape:

- left exists
- right is empty

A push from this state does **not** mean "right page pushes into left", because there is no existing right page.

Use:

- `fade-in`

Do not use:

- `push-in`

Why:

- the semantic work here is only "a new right page appears"

### Case B: Dual-page state

State shape:

- left exists
- right exists

A push from this state means:

1. old right page becomes the new left context page
2. a new right page appears

Use:

- `push-in`
- `fade-in`

Execution requirements:

1. `real-left-page` stays fixed
2. `real-right-page` must disappear immediately once the moving right-page animation begins
3. the moving `animation-page` should use the **final left-page chrome on frame one**
4. the new right page should arrive as `fade-in`, typically delayed slightly after the `push-in` starts

---

## Stack Flow: Pop

### Case A: Root-like pop

State shape:

- left is root
- right exists

Even though the navigation semantic is still "pop", visually root behaves like a pinned page.

Use:

- `fade-out`

Do not use:

- `pop-out`

Why:

- root should not visually move to the right

### Case B: Non-root dual-page pop

State shape:

- left exists and is not root-like pinned behavior
- right exists

This pop means:

1. the left page visually moves to the right
2. the new left page is revealed underneath

Use:

- `pop-out`
- `fade-in`

Execution requirements:

1. before animation starts, the target state's `real-left-page` must already be prepared underneath
2. the right slot should visually read as empty while the old left page is moving right
3. the moving `animation-page` should use the **final right-page chrome on frame one**
4. once the animation completes, the right slot is replaced by the final page state

---

## Navigation-to-Motion Mapping

This section defines how navigation semantics map into motion semantics.

### Shared navigation semantics

The editor still has these navigation meanings:

- `push`
- `pop`
- `replace`

But they do not directly map 1:1 to CSS classes. We first convert them into atomic motion semantics.

### `replace`

For both layout modes:

- right page replaced by another right page -> `fade-in`
- right page replaced by empty -> `fade-out`

### `push`

#### `pinned-root`

- always `fade-in`

#### `stack-flow`

- root state -> `fade-in`
- dual-page state -> `push-in + fade-in`

### `pop`

#### `pinned-root`

- right remains after pop -> `fade-in`
- right disappears after pop -> `fade-out`

#### `stack-flow`

- root-like state -> `fade-out`
- non-root dual-page state -> `pop-out + fade-in`

---

## Rendering Constraints

These are implementation constraints, not optional polish.

### Constraint 1

Do not let real pages and animation pages express the same role at the same time.

Example:

- if a right-looking page is currently moving left as `push-in`
- the old `real-right-page` must already be gone

### Constraint 2

The first frame of an animation page must already use the target role's chrome.

Examples:

- `push-in`: the moving page must already look like the final left page
- `pop-out`: the moving page must already look like the final right page

### Constraint 3

If a motion depends on revealing a page underneath, that page must already exist in the final structure before the animation begins.

Example:

- `pop-out` requires the new left page to already be rendered underneath

### Constraint 4

The motion layer must not rewrite navigation semantics.

Its job is:

- read current visible roles
- read target visible roles
- choose atomic motion semantics
- render animation pages accordingly

Its job is **not**:

- invent a different target structure just to make animation easier

---

## Recommended Refactor Direction

When reworking the motion system, use a two-stage pipeline:

### Stage 1: Resolve target layout roles

Given current state and next state, decide:

- target `real-left-page`
- target `real-right-page`
- whether the right slot ends occupied or empty
- whether current state is root-like or dual-page

### Stage 2: Resolve atomic motion semantics

Based on stage 1, produce only:

- `push-in?`
- `pop-out?`
- `fade-in?`
- `fade-out?`

Then render:

- stable real pages
- temporary animation pages

This keeps:

- navigation semantics clean
- layout semantics explicit
- animation semantics composable

---

## Final Principle

The animation system should optimize for:

- correct page-role meaning
- correct first frame
- correct final frame
- no visual leaks between real pages and animation pages

The goal is not "more animation coverage".

The goal is:

- no semantic confusion
- no premature real-page replacement
- no duplicated page-role exposure during motion
