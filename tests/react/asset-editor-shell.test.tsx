import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetEditorShell } from "../../src/editor/AssetEditorShell";

describe("AssetEditorShell", () => {
  it("按分类筛选资产，并把选择交给宿主", () => {
    render(
      <AssetEditorShell
        documents={{}}
        registrySchema={{ type: "array", items: { type: "string" } }}
        sections={[
          { id: "cards", title: "卡牌", entries: [{ id: "card.basic", label: "基础拳", referenceUri: "asset://card/basic.json" }] },
          { id: "actors", title: "角色", entries: [{ id: "actor.xiaoya", label: "小芽", referenceUri: "asset://actor/xiaoya.json" }] },
        ]}
        title="内容资产"
      />,
    );

    expect(screen.getByText("卡牌")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /角色/ }));
    expect(screen.getByText("角色")).toBeInTheDocument();
  });
});
