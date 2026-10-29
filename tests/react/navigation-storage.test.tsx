import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EditorShell } from "../../src/editor/EditorShell";
import { readNavigation, writeNavigation } from "../../src/editor/navigation-storage";

const key = "test.tasklist.navigation";
const documents = { main: { profile: { hp: 10 } }, list: [{ name: "清单内容" }] };
const root = { sourceId: "main", path: [] };
const profile = { sourceId: "main", path: ["profile"] };
afterEach(() => { window.localStorage.removeItem(key); vi.restoreAllMocks(); });

function seed() {
  writeNavigation(key, { version: 1, rootSourceId: "main", pages: [root, profile], pinnedAnchor: profile, closedStackFlowPage: null });
}

test("重新挂载恢复打开位置与固定页，StrictMode 不会覆盖记录", () => {
  seed();
  const props = { documents, navigationStorageKey: key, reloadBehavior: "preserve-current-source" as const };
  const first = render(<StrictMode><EditorShell {...props} /></StrictMode>);
  expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();
  expect(screen.getByLabelText("Field hp")).toHaveValue("10");
  first.unmount();
  render(<EditorShell {...props} />);
  expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();
  expect(screen.getByLabelText("Field hp")).toHaveValue("10");
});

test("实际导航与固定操作写入位置，重挂载读取最新数据而不是旧文档", async () => {
  const first = render(<EditorShell documents={documents} navigationStorageKey={key} leftPageFullscreen />);
  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Pin left page" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Pin left page" }));
  const saved = readNavigation(key, "main", documents).navigation;
  expect(saved?.pinnedAnchor?.path).toEqual([]);
  expect(saved?.pages.at(-1)?.path).toEqual(["profile"]);
  first.unmount();
  render(<EditorShell documents={{ ...documents, main: { profile: { hp: 20 } } }} navigationStorageKey={key} />);
  expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();
  expect(screen.getByLabelText("Field hp")).toHaveValue("20");
});

test("宿主数据同步在保留模式下不取消固定或当前导航", () => {
  seed();
  const props = { navigationStorageKey: key, reloadBehavior: "preserve-current-source" as const };
  const view = render(<EditorShell documents={documents} {...props} />);
  view.rerender(<EditorShell documents={{ ...documents, main: { profile: { hp: 30 } } }} {...props} />);
  expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();
  expect(screen.getByLabelText("Field hp")).toHaveValue("30");
});

test("引用清单与关闭右页状态可恢复；只存导航元数据", () => {
  const reference = { sourceId: "list", path: [], navLabel: "清单", isReference: true, value: documents.list, sourceValue: "secret" };
  writeNavigation(key, { version: 1, rootSourceId: "main", pages: [root, reference], pinnedAnchor: reference, closedStackFlowPage: reference });
  const raw = window.localStorage.getItem(key)!;
  expect(raw).not.toContain("清单内容");
  expect(raw).not.toContain("secret");
  const saved = readNavigation(key, "main", documents);
  expect(saved.error).toBeUndefined();
  expect(saved.navigation?.pages[1]).toEqual({ sourceId: "list", path: [], navLabel: "清单", isReference: true });
  expect(saved.navigation?.closedStackFlowPage?.sourceId).toBe("list");
  render(<EditorShell documents={documents} navigationStorageKey={key} />);
  expect(screen.getByRole("row", { name: "清单内容" })).toBeInTheDocument();
});

test("未启用存储的宿主不读取 Tasklist 状态，默认数据同步仍取消固定", () => {
  seed();
  const view = render(<EditorShell documents={documents} />);
  fireEvent.click(screen.getByRole("button", { name: "Pin left page" }));
  view.rerender(<EditorShell documents={{ main: { updated: true } }} />);
  expect(screen.getByRole("button", { name: "Pin left page" })).toBeInTheDocument();
  expect(window.localStorage.getItem(key)).toContain('"profile"');
});

test("失效的目标明确提示恢复失败，不静默覆盖原记录", () => {
  seed();
  const original = window.localStorage.getItem(key);
  render(<EditorShell documents={{ main: {} }} navigationStorageKey={key} />);
  expect(screen.getByRole("alert")).toHaveTextContent("页面位置恢复失败");
  expect(window.localStorage.getItem(key)).toBe(original);
});

test("损坏记录和存储权限失败显式提示", () => {
  window.localStorage.setItem(key, "bad-json");
  expect(readNavigation(key, "main", documents).error).toContain("页面位置恢复失败");
  window.localStorage.removeItem(key);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("存储不可用"); });
  render(<EditorShell documents={documents} navigationStorageKey={key} />);
  expect(screen.getByRole("alert")).toHaveTextContent("页面位置保存失败：存储不可用");
});
