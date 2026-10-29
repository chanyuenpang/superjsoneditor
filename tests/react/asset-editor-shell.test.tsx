import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("直接编辑卡牌资源数组时保留对象行 schema", () => {
    const sourceId = "card-resource/cards/encounters.json";
    render(
      <AssetEditorShell
        documents={{
          [sourceId]: [{ cardId: "card.encounter.strike", displayName: "试炼一击" }],
        }}
        registrySchema={{ type: "array", items: { type: "string" } }}
        schemaHost={{
          getSchema(context) {
            return context.sourceId === sourceId ? {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cardId: { type: "string" },
                  displayName: { type: "string" },
                },
              },
            } : undefined;
          },
        }}
        sections={[
          {
            id: "cards/encounters",
            title: "遭遇卡",
            documentSourceId: sourceId,
            entries: [{ id: "card.encounter.strike", label: "试炼一击", referenceUri: "asset://card/encounter-strike.json" }],
          },
        ]}
        title="内容资产"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "cardId" })).toBeInTheDocument();
    expect(screen.queryByText("Expected string")).toBeNull();
  });

  it("资产工作台为嵌入式编辑器维持确定高度链", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toMatch(/\.main-content\s*\{[^}]*display: grid;[^}]*grid-template-rows: minmax\(0, 1fr\);[^}]*height: 100%;/);
    expect(styles).toMatch(/\.page-stack\s*\{[^}]*height: 100%;/);
    expect(styles).toMatch(/\.sje-asset-workbench__detail\s*\{[^}]*display: grid;[^}]*height: 100%;/);
    expect(styles).toMatch(/\.sje-asset-workbench \.node-page--array > \.node-page__content\s*\{\s*grid-row: 2;/);
  });
});
