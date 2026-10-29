import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EditorShell } from "../../src/editor/EditorShell";
import type { EditorSchema } from "../../src/editor/schema";
const schema: EditorSchema = { type: "object", required: ["n", "m"], properties: { n: { type: "integer", minimum: 1 }, m: { type: "integer" } } };
const host = { getSchema: () => schema };

test("半成品数字不通知宿主，逐字段完善后一次提交且保存只收到合法文档", async () => {
  const onChange = vi.fn(); const onSave = vi.fn();
  render(<EditorShell value={{ n: 1, m: 2 }} schemaHost={host} onChange={onChange} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "-" } });
  expect(screen.getByLabelText("Field n")).toHaveValue("-");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Field m"), { target: { value: "4" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "3" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith({ main: { n: 3, m: 4 } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ main: { n: 3, m: 4 } }));
});

test("Raw关闭重开保留文本，未Apply不能保存旧值", () => {
  const onChange = vi.fn(); const onSave = vi.fn();
  render(<EditorShell value={{ n: 1, m: 2 }} schemaHost={host} onChange={onChange} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"n":"3","m":"bad"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "返回字段（保留草稿）" }));
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  expect(screen.getByLabelText("JSON value editor")).toHaveValue('{"n":"3","m":"bad"}');
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"n":"3","m":"4"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: { n: 3, m: 4 } });
});

test("宿主回灌不会覆盖失败草稿，旧基准不能静默提交", () => {
  const onChange = vi.fn();
  const { rerender } = render(<EditorShell value={{ n: 1, m: 2 }} schemaHost={host} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "-" } });
  rerender(<EditorShell value={{ n: 9, m: 8 }} schemaHost={host} onChange={onChange} />);
  expect(screen.getByLabelText("Field n")).toHaveValue("-");
  onChange.mockClear();
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "3" } });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText(/草稿基准已变化/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "放弃 main 编辑草稿" }));
  expect(screen.getByLabelText("Field n")).toHaveValue("9");
});

test("保存返回只确认提交快照，不覆盖等待期间的新编辑", async () => {
  let finish!: (value: Record<string, unknown>) => void;
  const onSave = vi.fn(() => new Promise<Record<string, unknown>>((resolve) => { finish = resolve; }));
  render(<EditorShell value={{ n: 1, m: 2 }} schemaHost={host} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.change(screen.getByLabelText("Field n"), { target: { value: "4" } });
  await act(async () => finish({ main: { n: 3, m: 2 } }));
  expect(screen.getByLabelText("Field n")).toHaveValue("4");
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("新增缺少嵌套必填的行只形成可修复草稿", () => {
  const onChange = vi.fn();
  const rows: EditorSchema = { type: "array", items: { type: "object", required: ["nested"], properties: { nested: { type: "object", default: {}, required: ["n"], properties: { n: { type: "integer" } } } } } };
  render(<EditorShell value={[]} schemaHost={{ getSchema: () => rows }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Create row" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Required field");
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '[{"nested":{"n":"2"}}]' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: [{ nested: { n: 2 } }] });
});

test("新增行未Create的输入退出编辑后仍可恢复，不能被Save遗漏", () => {
  vi.useFakeTimers();
  try {
    const onSave = vi.fn();
    const rows: EditorSchema = { type: "array", items: { type: "object", properties: { n: { type: "integer" } } } };
    render(<EditorShell value={[{ n: 1 }]} schemaHost={{ getSchema: () => rows }} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Pending array item"), { target: { value: "2" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Pending array item")).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Create row" }));
    expect(screen.queryByRole("button", { name: "放弃新增行草稿" })).toBeNull();
  } finally { vi.useRealTimers(); }
});

test("没有显式schema时推断只指导展示，不变成隐藏类型约束", () => {
  const onChange = vi.fn();
  render(<EditorShell value={{ n: 1 }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"n":"自由文本"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: { n: "自由文本" } });
});

test("Raw父容器替换不能绕过只读与根引用", () => {
  const onChange = vi.fn();
  const referenced: EditorSchema = { $defs: { n: { type: "integer" } }, type: "object", properties: { data: { type: "object", properties: { id: { type: "string", readOnly: true }, n: { $ref: "#/$defs/n" } } } } };
  render(<EditorShell value={{ data: { id: "fixed", n: 1 } }} schemaHost={{ getSchema: () => referenced }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "data object 2 fields" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Raw" }).at(-1)!);
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"id":"changed","n":"2"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText("JSON value editor")).toHaveValue('{"id":"changed","n":"2"}');
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{"id":"fixed","n":"2"}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(onChange).toHaveBeenLastCalledWith({ main: { data: { id: "fixed", n: 2 } } });
});
