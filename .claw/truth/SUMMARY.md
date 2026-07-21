# Truth Summary

<!-- state: current -->
## Current index

- `nullable-inline-null-button.md`: records the nullable primitive editor heading-level `null` action, the shared `renderNullableTypeButton(...)` entrypoint, the removal of the bottom `Set null` control from `withNullableControls(...)`, and the associated test/style anchors.
- `array-view-edit-mode-row-drag-sort-and-icon-actions.md`: records array edit-mode row drag sorting, `copy` / `delete` icon actions, visible / hidden column grouping, reorder persistence, and the empty `table.columns` restore path.
- `array-view-visible-menu-column-order-and-empty-columns.md`: records the `array` visibility menu's `visible-first` / `hidden` order and the empty `columns` retention rule.
- `claw-ignore-boundary.md`: records the `.claw` version boundary that keeps only `.claw/project.json` and `.claw/truth/**`, plus the cleanup checks for the tracked set.
- `view-file-schema-override-and-demo-toggle.md`: records the resolved default + view schema layering model, object/detail page schema authoring alignment, field-order signature sync, title fallback, `EditorSchemaViewFile`/`EditorSchemaLayerTarget` write routing, and the `schema-authoring` demo's stable View on/off toggle behavior.
- `repo-sync-and-submodule-update.md`: records the fetch-first sync flow for the main repo and `vendor/data-editor`, plus the detached-HEAD caution and submodule gitlink update rule.
- `data-editor-interaction-patterns.md`: records the current `super-json-editor` interaction baseline and version-bound reusable editing, saving, keyboard, selection, filtering, feedback, dense-layout, table-scanning, detail-rail, and semantic-token patterns from `vendor/data-editor@fe2e3a8`.
- `adr/data-editor-interaction-adoption-priority.md`: records the accepted order to establish the shared draft/flush/save-coordination protocol before keyboard, selection, filtering, and feedback enhancements.
- `adr/adopt-complementary-data-editor-layout.md`: records the accepted decision to preserve stack/pinned deep navigation while adding compact array tables, an independent filter rail, editor-mode tokens, and an overlay right-side detail rail as complementary capabilities.
