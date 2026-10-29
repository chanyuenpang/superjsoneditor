import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EditorShell } from "../../src/editor/EditorShell";
import type { EditorSchema } from "../../src/editor/schema";

const schema: EditorSchema = {
  type: "array",
  "x-editor": { table: { autoColumns: false, columns: [{ key: "序号" }, { key: "内容" }] } },
  items: { type: "object", properties: {
    序号: { type: "integer", minimum: 1 },
    内容: { type: "string", "x-editor": { fieldType: "textarea" } },
  } },
};
const schemaHost = { getSchema: () => schema };

test("没有 default 的 integer 新建字段仍使用数值编辑器并提交 number", () => {
  const onChange = vi.fn();
  render(<EditorShell value={[{ 序号: 1, 内容: "开场" }]} schemaHost={schemaHost} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const row = document.querySelector('[data-row-index="pending"]') as HTMLElement;
  const number = within(row).getByRole("spinbutton");
  expect(number).toHaveValue("");
  fireEvent.change(number, { target: { value: "2" } });
  fireEvent.change(within(row).getByRole("textbox"), { target: { value: "下一步\n探索" } });
  fireEvent.click(within(row).getByRole("button", { name: "Create row" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: [{ 序号: 1, 内容: "开场" }, { 序号: 2, 内容: "下一步\n探索" }] });
});

test("存量数字字符串按 integer 编辑，清空不自动变成零", () => {
  const onChange = vi.fn();
  render(<EditorShell value={{ n: "2" }} schemaHost={{ getSchema: () => ({ type: "object", properties: { n: { type: "integer" } } }) }} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Field n" });
  fireEvent.change(input, { target: { value: "3" } });
  expect(onChange).toHaveBeenLastCalledWith({ main: { n: 3 } });
  fireEvent.change(input, { target: { value: "" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith({ main: { n: 3 } });
  expect(input).toHaveValue("");
  expect(screen.getByRole("alert")).toHaveTextContent("草稿未提交");
});

test("只有标题的序号字段不强制转换或拒绝字符串", () => {
  const onChange = vi.fn();
  render(<EditorShell value={{ 序号: 1 }} schemaHost={{ getSchema: () => ({ type: "object", properties: { 序号: { title: "序号" } } }) }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"序号":"第二步"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: { 序号: "第二步" } });
});

test("Raw Apply 将嵌套 integer 字符串规范化后提交", () => {
  const onChange = vi.fn();
  render(<EditorShell value={[{ 序号: 1, 内容: "开场" }]} schemaHost={schemaHost} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '[{"序号":"2","内容":"保留脚本"}]' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: [{ 序号: 2, 内容: "保留脚本" }] });
  expect(screen.queryByLabelText("JSON value editor")).toBeNull();
});

test.each(["不是数字", "1.5", "0"])("Raw Apply 对不可转换或约束不满足的值 %s 保留完整草稿", (序号) => {
  const onChange = vi.fn();
  render(<EditorShell value={[{ 序号: 1, 内容: "开场" }]} schemaHost={schemaHost} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  const draft = JSON.stringify([{ 序号, 内容: "不能丢失" }]);
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: draft } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText("JSON value editor")).toHaveValue(draft);
  expect(screen.getByRole("alert")).toHaveTextContent("序号");
});
