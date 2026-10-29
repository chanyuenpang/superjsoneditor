import { getValueAtPath, setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { normalizeValueBySchema, resolveSchemaAtPath, validateDocument, type EditorSchema, type EditorValidationResult } from "./schema";

export type RawEditDraft = { text: string; baseSnapshot: string; schemaSnapshot: string };
export type EditOptions = { normalizeScope?: boolean };
export type EditOutcome = { accepted: boolean; staged?: boolean; validation: EditorValidationResult };
export type PreparedEdit = EditOutcome & { candidate: unknown };
export type EditContext = { sourceId: string; rootSchema?: EditorSchema; readOnly?: boolean };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** 提交前检查原始数字词法，避免把 JSON.parse 的舍入结果伪装为成功。 */
export function decodeJsonDraft(text: string): unknown {
  // 先确认 JSON 语法；尚不将解析结果提交到任何文档。
  const value: unknown = JSON.parse(text);
  const tokens = /"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  for (const match of text.matchAll(tokens)) {
    if (!match[1]) continue;
    const normalized = normalizeValueBySchema({ type: "number" }, match[1]);
    if (typeof normalized !== "number") throw new Error(`数字无法无损表示（字符 ${match.index}）：${match[1]}`);
  }
  return value;
}

/** 只规范化本次修改；其余存量问题交给校验暴露，不借编辑顺便迁移数据。 */
function normalizeChanges(context: EditContext, before: unknown, after: unknown, path: JsonPath, candidateRoot: unknown): unknown {
  if (same(before, after)) return after;
  if (object(before) && object(after)) {
    return Object.fromEntries(Object.entries(after).map(([key, child]) => [key, normalizeChanges(context, before[key], child, [...path, key], candidateRoot)]));
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const unchangedItems = new Set(before.map((item) => JSON.stringify(item)));
    return after.map((child, index) => unchangedItems.has(JSON.stringify(child))
      ? child
      : normalizeChanges(context, before[index], child, [...path, index], candidateRoot));
  }
  const schema = resolveSchemaAtPath(context.rootSchema, path, candidateRoot);
  const inputSchema = !schema?.type && typeof before === "number" ? { ...schema, type: "number" as const } : schema;
  return normalizeValueBySchema(inputSchema, after, context.rootSchema ?? inputSchema);
}

/** 所有输入入口共用的纯准备事务；失败也返回候选草稿，但不赋予提交权限。 */
export function prepareEdit(context: EditContext, previous: unknown, draft: unknown, path: JsonPath, input: unknown, options?: EditOptions): PreparedEdit {
  let candidate = setValueAtPath(draft, path, input);
  try {
    // 转换仅将字符串变为明确标量，单调收敛；条件分支按更新后的候选值重新解析。
    for (;;) {
      const normalized = options?.normalizeScope
        ? setValueAtPath(candidate, path, normalizeValueBySchema(resolveSchemaAtPath(context.rootSchema, path, candidate), getValueAtPath(candidate, path), context.rootSchema))
        : normalizeChanges(context, previous, candidate, [], candidate);
      if (same(normalized, candidate)) break;
      candidate = normalized;
    }
    const validation = validateDocument(context.rootSchema, candidate, { sourceId: context.sourceId });
    const protectedErrors: NonNullable<EditorValidationResult["fieldErrors"]> = [];
    const checkProtected = (before: unknown, after: unknown, currentPath: JsonPath) => {
      if (same(before, after)) return;
      const schema = resolveSchemaAtPath(context.rootSchema, currentPath, previous);
      if (before !== undefined && (schema?.readOnly || (schema?.const !== undefined && after === undefined))) {
        protectedErrors.push({ sourceId: context.sourceId, path: currentPath, message: "只读或 const 字段不能被修改或删除" });
        return;
      }
      if (object(before)) {
        for (const key of Object.keys(before)) checkProtected(before[key], object(after) ? after[key] : undefined, [...currentPath, key]);
      } else if (Array.isArray(before)) {
        // 原样移动的元素不按新下标误判为修改；其余变化继续检查字段保护。
        const nextItems = Array.isArray(after) ? after : [];
        const remaining = new Map<string | undefined, number>();
        for (const item of nextItems) { const key = JSON.stringify(item); remaining.set(key, (remaining.get(key) ?? 0) + 1); }
        before.forEach((item, index) => {
          const key = JSON.stringify(item);
          const count = remaining.get(key) ?? 0;
          if (count > 0) remaining.set(key, count - 1);
          else checkProtected(item, nextItems[index], [...currentPath, index]);
        });
      }
    };
    if (context.readOnly && !same(previous, candidate)) protectedErrors.push({ sourceId: context.sourceId, path: [], message: "文档只读" });
    else checkProtected(previous, candidate, []);
    if (protectedErrors.length) {
      validation.valid = false;
      validation.fieldErrors = [...(validation.fieldErrors ?? []), ...protectedErrors];
      validation.documentErrors = [...(validation.documentErrors ?? []), "受保护字段发生变更"];
    }
    return { accepted: validation.valid, candidate, validation };
  } catch (error) {
    return { accepted: false, candidate, validation: { valid: false, documentErrors: ["无法准备编辑"], fieldErrors: [{ sourceId: context.sourceId, path, message: error instanceof Error ? error.message : "Schema 解析失败" }] } };
  }
}

/** 所有反馈复用来源、路径和原因；通用失败标记不能淹没真正的字段错误。 */
export function validationMessages(validation: EditorValidationResult): string[] {
  const fields = (validation.fieldErrors ?? []).map((error) => {
    const source = error.sourceId ? `${error.sourceId} / ` : "";
    const path = error.path.length ? error.path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".") : "$";
    return `${source}${path}: ${error.message}`;
  });
  const documents = (validation.documentErrors ?? []).filter((message) => !fields.length || message !== "Schema validation failed");
  return [...new Set([...fields, ...documents])];
}

export function firstEditError(result: EditOutcome): string {
  return validationMessages(result.validation)[0] ?? "编辑尚未通过校验";
}
