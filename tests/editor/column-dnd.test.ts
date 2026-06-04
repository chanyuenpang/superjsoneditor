import { test } from "vitest";
import { buildPreviewOrderFromSlots, resolveDropTarget } from "../../src/editor/column-dnd";

const slots = [
  { fieldName: "id", index: 1, left: 160, right: 280, center: 220, width: 120 },
  { fieldName: "hp", index: 2, left: 280, right: 400, center: 340, width: 120 },
];

test("dragging right swaps after crossing the adjacent border plus hysteresis", () => {
  expect(resolveDropTarget(["title", "id", "hp"], "title", 120, slots, 167)).toEqual(null);
  expect(resolveDropTarget(["title", "id", "hp"], "title", 120, slots, 169)).toEqual({ targetField: "id", placement: "after" });
  expect(buildPreviewOrderFromSlots(["title", "id", "hp"], "title", 120, slots, 169)).toEqual(["id", "title", "hp"]);
});

test("dragging left swaps after crossing the adjacent border plus hysteresis", () => {
  const leftwardSlots = [
    { fieldName: "title", index: 0, left: 40, right: 160, center: 100, width: 120 },
    { fieldName: "id", index: 1, left: 160, right: 280, center: 220, width: 120 },
  ];

  expect(resolveDropTarget(["title", "id", "hp"], "hp", 120, leftwardSlots, 273)).toEqual(null);
  expect(resolveDropTarget(["title", "id", "hp"], "hp", 120, leftwardSlots, 271)).toEqual({ targetField: "id", placement: "before" });
  expect(buildPreviewOrderFromSlots(["title", "id", "hp"], "hp", 120, leftwardSlots, 271)).toEqual(["title", "hp", "id"]);
});

test("dragging back across the same border uses the preview position, not the original index", () => {
  const initialSlots = [
    { fieldName: "title", index: 0, left: 40, right: 160, center: 100, width: 120 },
    { fieldName: "id", index: 1, left: 160, right: 280, center: 220, width: 120 },
  ];
  const movedLeftOrder = buildPreviewOrderFromSlots(["title", "id", "hp"], "hp", 120, initialSlots, 271);
  expect(movedLeftOrder).toEqual(["title", "hp", "id"]);

  const previewSlots = [
    { fieldName: "title", index: 0, left: 40, right: 160, center: 100, width: 120 },
    { fieldName: "id", index: 2, left: 280, right: 400, center: 340, width: 120 },
  ];
  expect(buildPreviewOrderFromSlots(movedLeftOrder, "hp", 120, previewSlots, 287)).toEqual(["title", "hp", "id"]);
  expect(buildPreviewOrderFromSlots(movedLeftOrder, "hp", 120, previewSlots, 289)).toEqual(["title", "id", "hp"]);
});

test("dragging a short column into a longer neighbor waits until the width gap is cleared", () => {
  const unequalSlots = [
    { fieldName: "bonus", index: 1, left: 130, right: 180, center: 155, width: 50 },
  ];

  expect(resolveDropTarget(["title", "bonus"], "title", 30, unequalSlots, 157)).toEqual(null);
  expect(resolveDropTarget(["title", "bonus"], "title", 30, unequalSlots, 159)).toEqual({ targetField: "bonus", placement: "after" });
  expect(buildPreviewOrderFromSlots(["title", "bonus"], "title", 30, unequalSlots, 159)).toEqual(["bonus", "title"]);
});

test("dragging back out of a longer neighbor needs to clear the width gap plus hysteresis", () => {
  const previewSlots = [
    { fieldName: "bonus", index: 0, left: 100, right: 150, center: 125, width: 50 },
  ];

  expect(buildPreviewOrderFromSlots(["bonus", "title"], "title", 30, previewSlots, 129)).toEqual(["bonus", "title"]);
  expect(buildPreviewOrderFromSlots(["bonus", "title"], "title", 30, previewSlots, 121)).toEqual(["title", "bonus"]);
});
