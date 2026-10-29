import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EditorShell } from "../../src/editor/EditorShell";
import type { EditorSchema } from "../../src/editor/schema";

const scriptSchema: EditorSchema = { type: "array", items: { type: "object", properties: { 序号: { title: "序号" }, 内容: { type: "string", "x-editor": { fieldType: "textarea" } } }, additionalProperties: false } };
const needleSchema: EditorSchema = { type: "array", items: { type: "object", properties: { 费用: { type: "string" } } } };

test("修改脚本文字后保存，不校验未改动的预加载金针清单", async () => {
  const documents = {
    lists: ["asset://development-lists/game-opening-script.json"],
    "management-list/game-opening-script": [{ 序号: 1, 内容: "旧文案" }],
    "management-list/golden-needle-card-development": [{ 费用: 1 }, { 费用: 2 }],
  };
  const onSave = vi.fn(async (next: Record<string, unknown>) => next);
  render(<EditorShell documents={documents} rootSourceId="management-list/game-opening-script" schemaHost={{ getSchema: ({ sourceId }) => sourceId.includes("golden-needle") ? needleSchema : sourceId === "lists" ? { type: "array", items: { type: "string" } } : scriptSchema }} onSave={onSave} />);
  fireEvent.click(screen.getByRole("row", { name: /旧文案/ }));
  fireEvent.change(within(document.querySelector(".stack-page.is-current") as HTMLElement).getByLabelText("Field 内容"), { target: { value: "我只是填写了一段游戏脚本" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toEqual({ ...documents, "management-list/game-opening-script": [{ 序号: 1, 内容: "我只是填写了一段游戏脚本" }] });
  expect(screen.queryByText(/Schema validation failed/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("有改动文档在保存前schema变化仍拒绝，并展示来源路径而不是重复泛化提示", () => {
  let schema: EditorSchema = { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } };
  const onSave = vi.fn();
  render(<EditorShell value={{ a: "old", b: "old" }} rootSourceId="script" schemaHost={{ getSchema: () => schema }} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Field a"), { target: { value: "new" } });
  schema = { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } } };
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("script / a: Expected integer");
  expect(screen.getByRole("alert")).toHaveTextContent("script / b: Expected integer");
  expect(screen.getByRole("alert")).not.toHaveTextContent("Schema validation failed");
});
