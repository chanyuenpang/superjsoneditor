import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, vi } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";

test("renders a generic root document with the default title", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  expect(screen.getByText("JSON Document")).toBeInTheDocument();
  expect(screen.getAllByText("Root").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByLabelText("Field hello")).toHaveValue("world");
});

test("renders the demo shell without depending on demo-only chrome", () => {
  render(<App />);

  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getByDisplayValue("campaign-alpha")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "characters array 2 items" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "wideRecords array 3 items" })).toBeInTheDocument();
});

test("object pages edit primitive fields inline", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });

  expect(screen.getByDisplayValue("galaxy")).toBeInTheDocument();
});

test("host save receives the full document map and clears dirty state", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);
  render(<EditorShell documents={{ main: { hello: "world" } }} onSave={handleSave} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() => expect(handleSave).toHaveBeenCalledWith({ main: { hello: "galaxy" } }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
});

test("reload without a host callback reverts to the last saved snapshot", () => {
  render(<EditorShell documents={{ main: { hello: "world" } }} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reload" })[0]);

  expect(screen.getByDisplayValue("world")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("host reload can replace the in-memory documents", async () => {
  const handleReload = vi.fn(async () => ({ main: { hello: "reloaded" } }));
  render(<EditorShell documents={{ main: { hello: "world" } }} onReload={handleReload} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reload" })[0]);

  await waitFor(() => expect(handleReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByDisplayValue("reloaded")).toBeInTheDocument());
});

test("read only mode keeps navigation but disables mutation controls", () => {
  render(<EditorShell value={{ hello: "world", nested: { hp: 10 } }} readOnly />);

  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.getByLabelText("Field hello")).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "nested object 1 fields" }));

  expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("array pages render a table workspace", () => {
  render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide", hp: 6 }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "hp" })).toBeInTheDocument();
  expect(screen.getByText("hero")).toBeInTheDocument();
});

test("page back button and toolbar back both use pop animation", () => {
  vi.useFakeTimers();
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Go up one level" }).at(-1) as HTMLButtonElement);

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
  vi.useRealTimers();
});

test("back from a right page with root pinned on the left cuts without pop animation", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).toBeNull();
});

test("references can navigate into a different source document", () => {
  render(
    <EditorShell
      documents={{
        main: { profile: { companion: { $ref: "characters/hero" } } },
        "characters/hero": { id: "hero", stats: { hp: 10 } },
      }}
      host={{
        isReferenceNode(value) {
          return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
        },
        getReferenceLabel(value) {
          return String((value as { $ref: string }).$ref);
        },
        resolveReferenceTarget(value, documents) {
          const sourceId = String((value as { $ref: string }).$ref);
          return {
            sourceId,
            path: [],
            value: documents[sourceId],
          };
        },
      }}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference characters/hero" }));

  expect(screen.getByDisplayValue("hero")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Go up one level" }).length).toBeGreaterThan(0);
});

test("reference edits can be saved through the host contract", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);
  render(
    <EditorShell
      documents={{
        main: { profile: { companion: { $ref: "characters/hero" } } },
        "characters/hero": { id: "hero", stats: { hp: 10 } },
      }}
      host={{
        isReferenceNode(value) {
          return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
        },
        getReferenceLabel(value) {
          return String((value as { $ref: string }).$ref);
        },
        resolveReferenceTarget(value, documents) {
          const sourceId = String((value as { $ref: string }).$ref);
          return {
            sourceId,
            path: [],
            value: documents[sourceId],
          };
        },
      }}
      onSave={handleSave}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference characters/hero" }));
  fireEvent.change(screen.getByLabelText("Field id"), { target: { value: "hero-updated" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() =>
    expect(handleSave).toHaveBeenCalledWith({
      main: { profile: { companion: { $ref: "characters/hero" } } },
      "characters/hero": { id: "hero-updated", stats: { hp: 10 } },
    }),
  );
});
