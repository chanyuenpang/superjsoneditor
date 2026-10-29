import { expect, test } from "vitest";
import { decodeJsonDraft, prepareEdit, validationMessages } from "../../src/editor/edit-transaction";
import { createDefaultArrayItem, resolveSchemaAtPath, validateDocument, type EditorSchema } from "../../src/editor/schema";
const schema: EditorSchema = { type: "object", required: ["a", "b"], properties: { a: { type: "integer", minimum: 1 }, b: { type: "integer" }, id: { type: "string", readOnly: true } } };
const context = { sourceId: "main", rootSchema: schema };

test("校验提示去重并保留来源、数组路径和实际原因", () => {
  const error = { sourceId: "needle", path: [0, "费用"], message: "Expected string" };
  expect(validationMessages({ valid: false, documentErrors: ["Schema validation failed", "Schema validation failed"], fieldErrors: [error, error] })).toEqual(["needle / [0].费用: Expected string"]);
  expect(validationMessages({ valid: false, documentErrors: ["加载失败", "加载失败"], fieldErrors: [] })).toEqual(["加载失败"]);
});

test("转换和约束校验原子执行，失败返回草稿而不是部分成功", () => {
  const original = { a: 1, b: 2 };
  const failed = prepareEdit(context, original, original, [], { a: "3", b: "bad" });
  expect(failed.accepted).toBe(false);
  expect(failed.candidate).toEqual({ a: 3, b: "bad" });
  expect(original).toEqual({ a: 1, b: 2 });
  expect(prepareEdit(context, original, failed.candidate, ["b"], "4")).toMatchObject({ accepted: true, candidate: { a: 3, b: 4 } });
});

test("既有未修改的脏值不借另一字段编辑悄悄转换", () => {
  const original = { a: "1", b: 2 };
  expect(prepareEdit(context, original, original, ["b"], 3)).toMatchObject({ accepted: false, candidate: { a: "1", b: 3 } });
  expect(prepareEdit(context, original, original, [], original, { normalizeScope: true })).toMatchObject({ accepted: true, candidate: { a: 1, b: 2 } });
});

test("只读字段和父容器 Raw 替换及删除不能绕过保护", () => {
  const original = { a: 1, b: 2, id: "fixed" };
  expect(prepareEdit(context, original, original, [], { a: 1, b: 2, id: "changed" }).accepted).toBe(false);
  expect(prepareEdit(context, original, original, [], { a: 1, b: 2 }).accepted).toBe(false);
  expect(prepareEdit({ ...context, readOnly: true }, original, original, ["a"], 3).accepted).toBe(false);
});

test("联合外层约束、oneOf唯一分支和allOf合取不被展示合并抹掉", () => {
  expect(validateDocument({ type: "number", minimum: 5, anyOf: [{ type: "number" }] }, 2).valid).toBe(false);
  expect(validateDocument({ oneOf: [{ type: "number" }, { type: "integer" }] }, 2).valid).toBe(false);
  expect(validateDocument({ allOf: [{ type: "string", pattern: "^a" }, { type: "string", pattern: "z$" }] }, "xyz").valid).toBe(false);
  expect(validateDocument({ allOf: [{ type: "string" }, { type: "integer" }] }, 2).valid).toBe(false);
  expect(validateDocument({ type: "object", properties: { n: { minimum: 2 } }, patternProperties: { "^n": { maximum: 3 } } }, { n: 4 }).valid).toBe(false);
});

test("根引用上下文沿切片和新建保留，未知引用明确失败", () => {
  const root: EditorSchema = { $defs: { n: { type: "integer", default: 7 } }, type: "array", items: { type: "object", properties: { n: { $ref: "#/$defs/n" } } } };
  const row = resolveSchemaAtPath(root, [0], []);
  expect(createDefaultArrayItem(row)).toEqual({ n: 7 });
  expect(prepareEdit({ sourceId: "main", rootSchema: root }, [], [], [], [{ n: "2" }])).toMatchObject({ accepted: true, candidate: [{ n: 2 }] });
  expect(validateDocument({ $ref: "#/missing" }, 1).valid).toBe(false);
});

test.each(['{"n":9007199254740993}', '{"n":1e-999}', '{"n":0.100000000000000001}'])("Raw数字词法在JSON.parse舍入后不能伪装成功 %s", (text) => {
  expect(() => decodeJsonDraft(text)).toThrow("数字无法无损表示");
});
test("Raw转换判别字段后按新条件分支规范化其余字段", () => {
  const conditional: EditorSchema = { type: "object", properties: { enabled: { type: "boolean" } }, if: { properties: { enabled: { const: true } }, required: ["enabled"] }, then: { properties: { n: { type: "integer" } }, required: ["n"] } };
  expect(prepareEdit({ sourceId: "main", rootSchema: conditional }, {}, {}, [], { enabled: "true", n: "2" }, { normalizeScope: true })).toMatchObject({ accepted: true, candidate: { enabled: true, n: 2 } });
});

test("nullable容器及ref兄弟约束仍需完整校验", () => {
  expect(validateDocument({ type: ["object", "null"], properties: { n: { type: "integer" } } }, { n: "bad" }).valid).toBe(false);
  expect(validateDocument({ $defs: { n: { type: "integer" } }, $ref: "#/$defs/n", type: "string" }, "text").valid).toBe(false);
  expect(validateDocument({ oneOf: [{ type: "integer" }], anyOf: [{ minimum: 5 }] }, 2).valid).toBe(false);
});

test("追加行不顺便转换原有行的类型错误", () => {
  const rootSchema: EditorSchema = { type: "array", items: { type: "object", properties: { n: { type: "integer" } } } };
  const original = [{ n: "1" }];
  expect(prepareEdit({ sourceId: "main", rootSchema }, original, original, [], [...original, { n: "2" }])).toMatchObject({ accepted: false, candidate: [{ n: "1" }, { n: 2 }] });
});

test("数组复制约束不可绕过，但只读元素原样重排允许", () => {
  const arraySchema: EditorSchema = { type: "array", uniqueItems: true, items: { type: "object", properties: { id: { type: "string", readOnly: true } } } };
  const ctx = { sourceId: "main", rootSchema: arraySchema };
  const value = [{ id: "a" }, { id: "b" }];
  expect(prepareEdit(ctx, value, value, [], [...value, value[0]]).accepted).toBe(false);
  expect(prepareEdit(ctx, value, value, [], [value[1], value[0]]).accepted).toBe(true);
});

test("Raw字符串内容不扫描为数字，合法数字保持", () => {
  expect(decodeJsonDraft('{"text":"9007199254740993", "n":1.25}')).toEqual({ text: "9007199254740993", n: 1.25 });
});
