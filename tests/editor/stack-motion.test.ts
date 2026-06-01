import { test } from "vitest";
import type { NavigationPage } from "../../src/core/navigation";
import { determineBackAnimation, determineJumpAnimation, determineNavigateAnimation } from "../../src/editor/stack-motion";

function page(path: Array<string | number>): NavigationPage {
  return { path };
}

test("navigate from a single visible foreground page opens a push animation", () => {
  const animation = determineNavigateAnimation([page([])], [page([]), page(["profile"])], 0, 1);
  expect(animation).toEqual({ direction: "push", key: 1 });
});

test("navigate deeper from the visible right page promotes the previous right page and exits the left page", () => {
  const animation = determineNavigateAnimation(
    [page([]), page(["profile"])],
    [page(["profile"]), page(["profile", "stats"])],
    1,
    2,
  );

  expect(animation).toEqual({ direction: "push", key: 2, exitingPage: page([]) });
});

test("navigate from the left visible page replaces only the right page", () => {
  const animation = determineNavigateAnimation(
    [page(["profile"]), page(["profile", "stats"])],
    [page(["profile"]), page(["profile", "equipment"])],
    0,
    3,
  );

  expect(animation).toEqual({ direction: "replace", key: 3, exitingPage: page(["profile", "stats"]) });
});

test("jumping to a sibling right page while keeping the same left page uses replace animation", () => {
  const animation = determineJumpAnimation(
    [page(["profile"]), page(["profile", "stats"])],
    [page(["profile"]), page(["profile", "equipment"])],
    4,
  );

  expect(animation).toEqual({ direction: "replace", key: 4, exitingPage: page(["profile", "stats"]) });
});

test("jumping to root from a two-page state does not force a generic animation", () => {
  const animation = determineJumpAnimation(
    [page(["profile"]), page(["profile", "stats"])],
    [page([])],
    5,
  );

  expect(animation).toBeNull();
});

test("back from a two-page state uses pop animation", () => {
  const animation = determineBackAnimation(
    [page(["profile"]), page(["profile", "stats"])],
    [page(["profile"])],
    6,
  );

  expect(animation).toEqual({ direction: "pop", key: 6, exitingPage: page(["profile", "stats"]) });
});
