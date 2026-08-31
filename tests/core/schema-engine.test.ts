import { expect, test } from "vitest";
import {
  createDefaultArrayItem,
  createDefaultPropertyValue,
  createDefaultValue,
  resolveNode,
  resolveSchemaAtPath,
  switchUnionBranch,
  validateDocument,
  type EditorSchema,
} from "../../src/editor/schema";

test("createDefaultValue prioritizes default then const then enum", () => {
  expect(createDefaultValue({ type: "string", default: "draft" })).toBe("draft");
  expect(createDefaultValue({ type: "string", const: "fixed" })).toBe("fixed");
  expect(createDefaultValue({ type: "string", enum: ["rare", "common"] })).toBe("rare");
});

test("createDefaultValue builds object and array defaults from schema", () => {
  const schema: EditorSchema = {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", default: "Quest" },
      tags: { type: "array", items: { type: "string" } },
    },
  };

  expect(createDefaultValue(schema)).toEqual({
    title: "Quest",
  });
  expect(createDefaultArrayItem({ type: "object", properties: { hp: { type: "integer", default: 10 } } })).toEqual({ hp: 10 });
});

test("createDefaultValue supports nullable and oneOf defaults", () => {
  expect(createDefaultValue({ type: ["string", "null"] })).toBeNull();

  expect(createDefaultValue({
    oneOf: [
      { type: "string", default: "text" },
      { type: "integer", default: 3 },
    ],
  })).toBe("text");
});

test("resolveNode reports object capabilities and union state", () => {
  const schema: EditorSchema = {
    type: "object",
    required: ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      rarity: { enum: ["common", "rare"] },
      target: {
        oneOf: [
          { type: "string", title: "ID" },
          { type: "null", title: "None" },
        ],
      },
    },
  };

  const rootNode = resolveNode({
    rootSchema: schema,
    documents: { main: { title: "Quest" } },
    sourceId: "main",
    path: [],
    value: { title: "Quest" },
  });

  expect(rootNode.nodeKind).toBe("object");
  expect(rootNode.objectCapabilities?.addablePropertyKeys).toEqual(["rarity", "target"]);
  expect(rootNode.objectCapabilities?.additionalPropertyPolicy).toBe("forbid");

  const unionNode = resolveNode({
    rootSchema: schema,
    documents: { main: { title: "Quest", target: null } },
    sourceId: "main",
    path: ["target"],
    value: null,
  });

  expect(unionNode.nodeKind).toBe("union");
  expect(unionNode.unionCapabilities?.activeOptionIndex).toBe(1);
});

test("validateDocument enforces required and additionalProperties", () => {
  const schema: EditorSchema = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
    },
  };

  const result = validateDocument(schema, { extra: true });
  expect(result.valid).toBe(false);
  expect(result.fieldErrors?.some((error) => error.path.join(".") === "id")).toBe(true);
  expect(result.documentErrors?.length).toBeGreaterThan(0);
});

test("switchUnionBranch recreates value from target branch defaults", () => {
  const schema: EditorSchema = {
    oneOf: [
      { type: "string", default: "alpha" },
      { type: "object", properties: { hp: { type: "integer", default: 5 } } },
    ],
  };

  expect(switchUnionBranch("old", schema, 1)).toEqual({ hp: 5 });
});

test("resolveSchemaAtPath follows local $ref nodes", () => {
  const schema: EditorSchema = {
    type: "object",
    properties: {
      root: { $ref: "#/$defs/root_node" },
    },
    $defs: {
      root_node: {
        oneOf: [
          { $ref: "#/$defs/selector_node" },
          { $ref: "#/$defs/action_node" },
        ],
      },
      selector_node: {
        type: "object",
        properties: {
          node_type: { const: "selector" },
          children: {
            type: "array",
            items: { $ref: "#/$defs/action_node" },
          },
        },
      },
      action_node: {
        type: "object",
        properties: {
          node_type: { const: "action" },
          script: { type: "string", minLength: 1 },
        },
      },
    },
  };

  const resolved = resolveSchemaAtPath(schema, ["root", "children", 0, "script"], {
    root: {
      node_type: "selector",
      children: [
        {
          node_type: "action",
          script: "attack",
        },
      ],
    },
  });

  expect(resolved).toMatchObject({
    type: "string",
    minLength: 1,
  });
});

test("resolveSchemaAtPath does not reuse an object schema for an undeclared array field", () => {
  const schema: EditorSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      additionalProperties: true,
    },
  };
  const value = [{ id: "card-needle-reversal", 标签: ["功法", "暗器", "虚弱", "减伤"] }];

  expect(resolveSchemaAtPath(schema, [], value)).toMatchObject({ type: "array" });
  expect(resolveSchemaAtPath(schema, [0], value)).toMatchObject({ type: "object" });
  expect(resolveSchemaAtPath(schema, [0, "id"], value)).toMatchObject({ type: "string" });
  expect(resolveSchemaAtPath(schema, [0, "标签"], value)).toBeUndefined();
});

test("validateDocument enforces local $ref branches", () => {
  const schema: EditorSchema = {
    type: "object",
    properties: {
      root: { $ref: "#/$defs/root_node" },
    },
    $defs: {
      root_node: {
        oneOf: [
          { $ref: "#/$defs/selector_node" },
          { $ref: "#/$defs/action_node" },
        ],
      },
      selector_node: {
        type: "object",
        required: ["node_type", "children"],
        properties: {
          node_type: { const: "selector" },
          children: {
            type: "array",
            items: { $ref: "#/$defs/action_node" },
          },
        },
      },
      action_node: {
        type: "object",
        required: ["node_type", "script"],
        properties: {
          node_type: { const: "action" },
          script: { type: "string", minLength: 1 },
        },
      },
    },
  };

  const result = validateDocument(schema, {
    root: {
      node_type: "selector",
      children: [
        {
          node_type: "action",
          script: "",
        },
      ],
    },
  });

  expect(result.valid).toBe(false);
  expect(result.fieldErrors?.some((error) => error.path.join(".") === "root.children.0.script")).toBe(true);
});
