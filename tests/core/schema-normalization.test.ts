import { expect, test } from "vitest";
import { normalizeValueBySchema, validateDocument, type EditorSchema } from "../../src/editor/schema";

const schema: EditorSchema = {
  type: "array",
  items: { type: "object", properties: {
    序号: { type: "integer", minimum: 1 },
    内容: { type: "string" },
    enabled: { type: "boolean" },
  } },
};

test("按 schema 递归规范化数字与布尔字符串，不修改源数据或文本字段", () => {
  const value = [{ 序号: "2", 内容: "003", enabled: "false" }];
  const normalized = normalizeValueBySchema(schema, value);
  expect(normalized).toEqual([{ 序号: 2, 内容: "003", enabled: false }]);
  expect(value[0].序号).toBe("2");
  expect(validateDocument(schema, normalized).valid).toBe(true);
});

test.each(["", " ", "two", "2x", "1.5", "NaN", "Infinity", "0x10", "9007199254740993", "1e-999", "2.000000000000000001"])("integer 不强转无效或不安全输入 %s", (value) => {
  expect(normalizeValueBySchema({ type: "integer" }, value)).toBe(value);
});

test("等价十进制表示可以转换，数值舍入和下溢不能伪装为成功", () => {
  expect(normalizeValueBySchema({ type: "integer" }, "2.0")).toBe(2);
  expect(normalizeValueBySchema({ type: "integer" }, "2e1")).toBe(20);
  expect(normalizeValueBySchema({ type: "number" }, "1.25")).toBe(1.25);
  expect(normalizeValueBySchema({ type: "number" }, "0.100000000000000001")).toBe("0.100000000000000001");
  expect(normalizeValueBySchema({ type: "number" }, "1e-999")).toBe("1e-999");
});

test("类型转换后仍执行最小值、必填、枚举等约束，不删字段补默认值", () => {
  const normalized = normalizeValueBySchema(schema, [{ 序号: "0", extra: "keep" }]);
  expect(normalized).toEqual([{ 序号: 0, extra: "keep" }]);
  expect(validateDocument(schema, normalized).valid).toBe(false);
  expect(normalizeValueBySchema({ type: "object", required: ["n"], properties: { n: { type: "integer", default: 4 } } }, {})).toEqual({});
  expect(validateDocument({ type: "integer", enum: [1] }, normalizeValueBySchema({ type: "integer", enum: [1] }, "2")).valid).toBe(false);
});

test("无类型约束和合法字符串联合分支不触发猜测转换", () => {
  expect(normalizeValueBySchema({ title: "序号" }, "2")).toBe("2");
  expect(normalizeValueBySchema({ type: ["integer", "string"] }, "2")).toBe("2");
  expect(normalizeValueBySchema({ type: ["integer", "null"] }, "2")).toBe(2);
  expect(normalizeValueBySchema({ type: ["integer", "null"] }, null)).toBeNull();
  expect(normalizeValueBySchema({ type: "boolean" }, "yes")).toBe("yes");
  expect(normalizeValueBySchema({ type: "object" }, '{"n":1}')).toBe('{"n":1}');
});

test("嵌套引用、动态属性和数组元素采用同一个规范化入口", () => {
  const withRefs: EditorSchema = {
    $defs: { counter: { type: "integer" } },
    type: "object",
    properties: { counts: { type: "array", items: { $ref: "#/$defs/counter" } } },
    patternProperties: { "^n_": { $ref: "#/$defs/counter" } },
    additionalProperties: { type: "boolean" },
  };
  const normalized = normalizeValueBySchema(withRefs, { counts: ["2"], n_first: "3", flag: "true" });
  expect(normalized).toEqual({ counts: [2], n_first: 3, flag: true });
  expect(validateDocument(withRefs, normalized).valid).toBe(true);
});
