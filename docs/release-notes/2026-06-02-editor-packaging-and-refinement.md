# Super JSON Editor Release Notes

Date: 2026-06-02

## Overview

This release turns Super JSON Editor into a reusable React editor package while also tightening the day-to-day editing experience across navigation, references, mobile layout, and raw JSON editing.

## Highlights

- Packaged the editor for React embedding with a public entrypoint, typed exports, library build output, and integration documentation.
- Moved persistence to a host-driven model so save and reload behavior can be supplied by the embedding application.
- Completed multi-source reference navigation so ref pages behave like real source-backed pages instead of temporary resolved snapshots.
- Refined page-stack motion so push, replace, cut, and pop behavior better match the editor's two-panel mental model.
- Improved mobile behavior with a single-page mode and compact path navigation.

## Embedding And Host Integration

- Added a reusable package entrypoint for the editor and related host types.
- Split the reusable editor surface from the demo application shell.
- Added library build output and type declarations for integration into other React projects.
- Documented the embedding model in [react-embedding.md](/D:/Users/chany/Documents/super-json-editor/docs/integration/react-embedding.md).

## Editing Experience

- Added persistent `Edit` / `Done` editing flows for object and array pages.
- Added inline object key creation and array row creation flows designed for iterative editing.
- Added row copy and delete actions for arrays and key delete actions for objects.
- Added dirty-state tracking so `Save` and `Reload` only appear when there are unsaved changes.
- Added changed-field highlighting to make modified keys easier to spot.
- Moved `Raw` editing into the footer and unified raw-mode behavior across object, array, and primitive pages.
- `Apply JSON` now exits raw mode on success and shows parse errors inline on failure.

## References

- Reference navigation now edits the true target source, even through long ref chains.
- Ref pages now keep normal navigation semantics instead of falling back to generic root-like labels.
- Ref pages now show the source file name in the header.
- Added ref-scope header tinting, with scope depth based on file-to-file reference transitions rather than nested keys inside the same file.

## Navigation And Layout

- Desktop now uses a cleaner two-panel model with equal-width left and right panes.
- Mobile automatically switches to a single-page mode below `768px`.
- Mobile path navigation now uses a dropdown instead of a multi-segment breadcrumb.
- Toolbar and in-page back behavior were aligned so page exits match panel-stack semantics more closely.
- Root-level back behavior now removes the right page without incorrectly pulling the root page into a pop animation.
- Long breadcrumbs now stay on one line and keep the rightmost context visible.

## Visual Refinements

- Kept the overall white, minimal visual language while adding soft type-color recognition for arrays, objects, and references.
- Unified button treatments across toolbar, footer, and destructive actions.
- Centered object content when it reaches max width without centering the footer controls.
- Added a wide-table demo dataset to exercise large array/object rendering and horizontal overflow behavior.

## Known Limitations

- Object key ordering still follows JavaScript object semantics. Integer-like keys may appear before normal string keys during enumeration and serialization.
- The current package target is React embedding. A framework-agnostic core or Web Component build is not included in this release.
