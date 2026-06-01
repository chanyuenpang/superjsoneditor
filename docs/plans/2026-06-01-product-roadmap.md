# Super JSON Editor Product Roadmap

## Purpose

This document defines the full product roadmap for `super-json-editor`, from the current prototype to a complete reusable product release.

It answers four questions:

1. What stage is the project in right now?
2. What is the next stage?
3. What does "done" mean for each stage?
4. What must be true before moving to the next stage?

This roadmap is for the `super-json-editor` product itself.
It does not include host-project-specific implementation work.

---

## Product Definition

`super-json-editor` is a reusable, embeddable JSON editor for web projects.

Its intended identity is:

- A generic JSON editor, not a project-specific asset tool
- A structured editor, not primarily a raw text editor
- A UI product that inherits the interaction quality and visual language of `Nocturne`'s `data-editor`
- A navigation-based editor that uses stack-style page transitions instead of a fixed right-side detail drawer
- A host-integrated editor that can work offline without requiring a dedicated backend service

The first complete product release should make it realistic for another project to embed the editor and ship a focused JSON editing workflow without patching its internals.

---

## Planning Principles

The roadmap follows these principles:

- The project is small enough that architecture should stay lightweight.
- The target quality is product-grade, not prototype-grade.
- Interaction quality is core scope, not a late polish phase.
- Generic editor boundaries must stay clean. Host-specific rules belong outside this repo.
- Every stage must end with a usable, testable result.

---

## Current Assessment

### Current stage

The project is currently in:

`Phase 1: Interaction Convergence`

This means:

- The core editor shell exists and is runnable.
- The nav stack model exists.
- Array and object pages already have working structure.
- Reference expansion exists in a basic host-resolved form.
- The biggest remaining risks are interaction correctness, motion quality, page semantics, and UI maturity.

This is no longer a pure concept/spec phase.
It is also not yet a stable product-foundation phase, because the main interaction model is still being corrected in response to real usage.

### Why this is the current stage

The most important open questions are still product questions:

- When should the left page move?
- When should only the right page update?
- How should push, replace, and back differ?
- How should array workspace width behave?
- What interaction details still feel like a prototype instead of a real editor?

As long as those questions are still being actively resolved, the project is still converging on its real interaction contract.

---

## Full Roadmap

## Phase 0: Product Definition

### Status

Mostly complete

### Goal

Define what `super-json-editor` is and is not.

### Scope

- Product positioning
- Scope boundaries
- Technical direction
- Core UI philosophy
- Host integration philosophy

### Deliverables

- Scope document
- Technical design document
- Initial implementation direction

### Exit criteria

- The product is clearly defined as a generic JSON editor.
- Host-specific rules are explicitly out of scope.
- The team agrees that the editor is modeled after `data-editor` UI quality, not a fresh visual redesign.

---

## Phase 1: Interaction Convergence

### Status

In progress

### Goal

Make the core editing experience feel correct, intentional, and stable in daily use.

### Why this phase matters

This phase defines the editor's real product behavior.
If the interaction model is wrong here, later engineering cleanup will only harden the wrong thing.

### Scope

- Stack-based navigation semantics
- Array page and object page role definition
- Page motion behavior
- Width and layout behavior
- Core editing behavior for primitive values
- Raw JSON fallback behavior
- Reference expansion behavior at the UX level
- Visual density and hierarchy alignment with `data-editor`

### Required product outcomes

#### 1. Navigation semantics are final enough to trust

- Deep navigation from the right page feels correct
- Replacing the right page from the left page feels correct
- Back behavior feels correct
- Breadcrumb and sidebar jumps behave intentionally rather than generically

#### 2. Page roles are clear

- Array pages behave like workspaces
- Object pages behave like detail editors
- Primitive pages behave like focused value editors
- Raw JSON is fallback-only, not a primary interaction surface

#### 3. Motion semantics match user intent

- Push, replace, and back are treated as different motion cases
- Only the pages that conceptually move should animate
- No flashing, slot-jumping, or fake movement caused by layout switching

#### 4. Layout rules are believable

- Array tables size by content, not by page partition
- Array overflow scrolls inside the page instead of expanding the whole layout
- Object editing regions stay readable and not overly wide

#### 5. Visual quality approaches the `data-editor` bar

- Information density is strong
- Spacing is disciplined
- Table and detail page rhythm feels mature
- The UI does not read like a debug tool or prototype

### Exit criteria

This phase is complete only when:

- The main editing paths no longer trigger repeated UX corrections
- Motion rules feel predictable and intentional
- Array/object page roles are stable
- The editor can be used continuously without obvious prototype smell
- Remaining work is mostly engineering hardening rather than interaction redesign

### Main risks

- Overfitting motion logic to special cases without defining a durable model
- Leaving too much behavior implicit inside `EditorShell`
- Chasing polish before interaction semantics are stable

---

## Phase 2: Product Foundation Hardening

### Status

Not started

### Goal

Turn the validated interaction model into a maintainable, reusable product foundation.

### Why this phase exists

Once Phase 1 behavior is good enough, the main risk changes.
The problem is no longer "what should the editor do?"
The problem becomes "can the codebase hold that behavior without becoming fragile?"

### Scope

- Refactor motion logic into explicit navigation and motion state
- Clarify page identity and lifecycle boundaries
- Reduce special-case logic inside React shell components
- Strengthen test coverage around navigation and editing
- Clean up component responsibilities
- Stabilize host interface boundaries

### Required product outcomes

#### 1. Navigation and motion logic have a durable model

- Push, replace, and back are explicit concepts in code
- Motion behavior is testable without relying on visual guesswork
- Page identity is stable enough to support future enhancement

#### 2. The editor shell is no longer doing too much

- Motion orchestration is separated from rendering concerns
- Page rendering responsibility is clearer
- Host integration boundaries are explicit

#### 3. Core editing pathways are harder to break

- Navigation regressions are covered by tests
- Reference expansion behavior is covered by tests
- Editing source values versus resolved reference values is covered by tests

### Exit criteria

- The interaction model from Phase 1 is preserved with cleaner internals
- New behavior can be added without repeated shell-level rewrites
- Motion logic is no longer a fragile pile of ad hoc class conditions

### Main risks

- Refactoring too early before interaction semantics are truly stable
- Keeping too much behavior coupled to rendered layout
- Letting temporary logic become the permanent architecture

---

## Phase 3: Generic Editor Capability Completion

### Status

Not started

### Goal

Make the editor capable enough to serve as a real generic JSON editing product, not just a strong shell.

### Scope

- Richer typed field editing
- Better array row summaries and object titles
- More complete raw JSON fallback behavior
- Better handling of empty states and edge structures
- Host-provided metadata enhancement
- Better reference display behavior

### Required product outcomes

#### 1. Generic editing is genuinely useful

- Common JSON structures can be edited comfortably without dropping to raw JSON
- Array rows are readable and identifiable
- Object fields have strong display defaults even without host metadata

#### 2. Host enhancement is supported but optional

- Hosts may supply labels, summaries, and reference resolution
- The editor still works without rich schema or project metadata

#### 3. Edge cases do not collapse the experience

- Empty arrays and empty objects render cleanly
- Mixed-type arrays degrade gracefully
- Large strings and nested values behave reasonably

### Exit criteria

- The editor is broadly usable for real structured JSON work
- Raw JSON is needed occasionally, not constantly
- Host integration adds value rather than being required to make the editor legible

### Main risks

- Accidentally introducing host-specific assumptions into generic behavior
- Expanding capability in a way that weakens UI density or clarity
- Adding too many editing modes before their interaction model is mature

---

## Phase 4: Embeddable Productization

### Status

Not started

### Goal

Prepare `super-json-editor` to be consumed by outside projects as a stable embedded product.

### Scope

- Public package boundaries
- Host API cleanup
- Documentation for integration
- Demo harness suitable for product evaluation
- Versioning and release readiness
- Stability expectations for consumers

### Required product outcomes

#### 1. The public surface is deliberate

- Clear entry points
- Stable host interface definitions
- Clear ownership of what is internal vs public

#### 2. Integration documentation is sufficient

- A host project can embed the editor without reading internal implementation files
- Reference integration is documented
- Value loading and saving responsibilities are documented

#### 3. The project is shippable

- Build output is stable
- Demo is representative
- Consumer setup is straightforward

### Exit criteria

- A separate project can integrate the editor through documented APIs
- The product can be versioned and released with confidence
- The repository reads like a real reusable product, not a single-project extraction experiment

### Main risks

- Treating internal implementation details as public API by accident
- Under-documenting integration assumptions
- Shipping before the public surface is coherent

---

## Phase 5: Version 1 Release

### Status

Not started

### Goal

Ship the first complete, reusable, product-grade release of `super-json-editor`.

### Scope

- Final release packaging
- Documentation pass
- Demo validation
- Regression pass on navigation, editing, and references
- Initial release notes

### Definition of complete product at this phase

The product should now be:

- Reusable
- Embeddable
- Generic
- Offline-capable
- Interaction-stable
- Documented
- Visually mature

It does not need to include every future feature.
It does need to feel coherent, trustworthy, and ready for another project to depend on.

### Exit criteria

- Public API is stable enough for initial external use
- Core interaction model no longer needs redesign
- Test coverage protects key regressions
- Documentation is sufficient for integration and usage
- The editor feels like a finished first product, not a prototype

---

## Release Gates

The product should not move to Version 1 release unless all of the following are true:

### Gate A: Interaction gate

- Push, replace, and back behavior are clearly separated
- Motion quality feels intentional
- Array and object page roles feel mature

### Gate B: Usability gate

- Real JSON documents can be edited mostly through structured controls
- Raw JSON is fallback-only
- Page layout is reliable under complex nested structures

### Gate C: Engineering gate

- Core tests are green
- Motion and navigation behavior have regression coverage
- Host API boundaries are explicit

### Gate D: Product gate

- Integration documentation exists
- Demo reflects product quality rather than internal experimentation
- The repository structure makes sense to an outside adopter

---

## What Counts As Product Complete

For this repo, product complete does not mean:

- every possible field type is supported
- every host use case is built
- every motion detail is perfect forever

It does mean:

- the product has a stable identity
- the primary workflows feel mature
- the architecture is strong enough to support consumers
- the editor can be integrated by another project without internal rewrites

---

## Immediate Next Priority

The highest priority remains finishing `Phase 1: Interaction Convergence`.

That means the near-term focus should continue to be:

1. Locking animation semantics to user intent
2. Aligning page behavior more closely with `data-editor`
3. Tightening array and object workspace quality
4. Removing remaining prototype-feeling interaction edges

The next phase should not begin until the interaction model stops changing in response to basic usage feedback.

---

## Planning Consequence

This roadmap changes how future decisions should be framed:

- If a proposal helps define or fix user-facing interaction semantics, it belongs in Phase 1.
- If a proposal mainly makes the existing behavior more maintainable, it belongs in Phase 2.
- If a proposal expands generic editing power, it belongs in Phase 3.
- If a proposal prepares outside adoption, it belongs in Phase 4.

This gives the project a concrete meaning for phrases like "current stage" and "next stage" and prevents stage labels from being used casually.

