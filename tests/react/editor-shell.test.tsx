import { fireEvent, render, screen } from "@testing-library/react";
import { test } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";

test("renders editor shell title and root path", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getAllByText("Root")).toHaveLength(2);
  expect(screen.getByText("object")).toBeInTheDocument();
});

test("renders the demo document title field", () => {
  render(<App />);
  expect(screen.getByText("starter-document")).toBeInTheDocument();
});

test("applies JSON text edits to the current node", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  const textarea = screen.getByLabelText("JSON value editor");
  fireEvent.change(textarea, { target: { value: "\"galaxy\"" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(screen.getByText("galaxy")).toBeInTheDocument();
});
