import type { JsonPath } from "../core/path";

export type EditorSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export type EditorReferenceSchema = {
  kind?: "resource" | "document" | "uri";
  types?: string[];
  sources?: string[];
  target?: {
    schemaRef?: string;
  };
  view?: {
    layout?: "inline" | "stack";
    schemaRef?: string;
    fields?: Array<
      | JsonPath
      | {
        path: JsonPath;
        label?: string;
      }
    >;
  };
};

export type EditorViewOptionColor = "red" | "orange" | "yellow" | "green" | "blue" | "gray" | "gold";

export type EditorViewOption = {
  value: string | number;
  label?: string;
  color?: EditorViewOptionColor;
};

export type EditorViewOptionsSource = {
  kind: "json-file";
  uri: string;
  valueField: string;
  labelField?: string;
  colorField?: string;
  descriptionField?: string;
  previewField?: string;
};

export type EditorTableColumn = {
  key?: string;
  field?: string | JsonPath;
  label?: string;
  sortable?: boolean;
  width?: number;
  wrap?: boolean;
};

export type EditorImageDisplayPreset = "icon" | "large-icon" | "portrait" | "banner" | "image";
export type EditorObjectPreset = "xy" | "xyz" | "rgba";

export type EditorSchemaUi = {
  className?: string | string[];
  group?: string;
  fieldType?: "select" | "multi-select" | "textarea" | "asset-picker";
  options?: EditorViewOption[];
  optionsSource?: EditorViewOptionsSource;
  reference?: EditorReferenceSchema;
  projection?: {
    path: JsonPath;
  };
  display?: {
    kind?: "image";
    preset?: EditorImageDisplayPreset;
    preview?: {
      width?: number;
      height?: number;
      fit?: "contain" | "cover";
    };
    text?: {
      sentenceLimit?: number;
    };
  };
  object?: {
    preset?: EditorObjectPreset;
  };
  column?: {
    sortable?: boolean;
  };
  table?: {
    columns: EditorTableColumn[];
    /** 排序仅改变当前视图，还是将排序后的行顺序写回数组。默认仅改变视图。 */
    sort?: "view" | "persist";
    objectValueSchema?: EditorSchema;
    objectValueMetadataByKey?: Record<string, Record<string, unknown>>;
  };
};

export type EditorSchema = {
  $id?: string;
  $ref?: string;
  $defs?: Record<string, EditorSchema>;
  $comment?: string;
  type?: EditorSchemaType | EditorSchemaType[];
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  readOnly?: boolean;
  required?: string[];
  properties?: Record<string, EditorSchema>;
  patternProperties?: Record<string, EditorSchema>;
  items?: EditorSchema;
  additionalProperties?: boolean | EditorSchema;
  oneOf?: EditorSchema[];
  anyOf?: EditorSchema[];
  allOf?: EditorSchema[];
  if?: EditorSchema;
  then?: EditorSchema;
  else?: EditorSchema;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, EditorSchema>;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  "x-editor"?: EditorSchemaUi;
};

export type EditorSchemaContext = {
  sourceId: string;
  path: JsonPath;
  value: unknown;
  documents: Record<string, unknown>;
  activeViewPath?: string | null;
};

export type EditorSchemaLayerTarget =
  | {
    mode: "default";
  }
  | {
    mode: "view";
    path: string;
  };

export type EditorSchemaWriteContext = {
  sourceId: string;
  documents: Record<string, unknown>;
  activeViewPath?: string | null;
  writeTarget?: EditorSchemaLayerTarget;
};

export type EditorSchemaViewFile = {
  target: string;
  schema: EditorSchema;
  namedSchemas?: Record<string, EditorSchema>;
  name?: string;
  description?: string;
};

export type EditorSchemaHost = {
  getSchema: (context: EditorSchemaContext) => EditorSchema | undefined;
  getNamedSchema?: (name: string, context?: EditorSchemaWriteContext) => EditorSchema | undefined;
  setRootSchema?: (schema: EditorSchema, context: EditorSchemaWriteContext) => void | Promise<void>;
  setNamedSchema?: (name: string, schema: EditorSchema, context: EditorSchemaWriteContext) => void | Promise<void>;
};

export type EditorValidationError = {
  sourceId?: string;
  path: JsonPath;
  message: string;
};

export type EditorValidationResult = {
  valid: boolean;
  documentErrors?: string[];
  fieldErrors?: EditorValidationError[];
};

export type EditorValidationHandler = (
  documents: Record<string, unknown>,
) => EditorValidationResult | Promise<EditorValidationResult>;

export type EditorMode = "free" | "schema";

export type ResolvedSchemaNode = {
  mode: EditorMode;
  effectiveSchema?: EditorSchema;
  nodeKind: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null" | "union" | "unknown";
  valid: boolean;
  errors: EditorValidationError[];
  constraints: {
    required?: boolean;
    readOnly?: boolean;
    const?: unknown;
    enum?: unknown[];
    nullable?: boolean;
    additionalProperties?: boolean;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
  };
  objectCapabilities?: {
    allowedProperties: Array<{ key: string; schema?: EditorSchema; required: boolean; title?: string; description?: string; group?: string }>;
    requiredKeys: string[];
    additionalPropertyPolicy: "allow" | "forbid" | "schema";
    addablePropertyKeys: string[];
    patternPropertyEntries: Array<{ pattern: string; schema: EditorSchema }>;
    supportsDynamicKeys: boolean;
  };
  arrayCapabilities?: {
    itemSchema?: EditorSchema;
    canAddItem: boolean;
    defaultNewItem?: unknown;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
  };
  unionCapabilities?: {
    kind: "oneOf" | "anyOf" | "multiType";
    options: Array<{ index: number; schema: EditorSchema; title: string }>;
    activeOptionIndex: number | null;
  };
  defaultValue?: unknown;
};

type ValidationAccumulator = {
  documentErrors: string[];
  fieldErrors: EditorValidationError[];
};

export function resolveNode(context: {
  rootSchema?: EditorSchema;
  documents: Record<string, unknown>;
  sourceId: string;
  path: JsonPath;
  value: unknown;
}): ResolvedSchemaNode {
  const schema = resolveSchemaAtPath(context.rootSchema, context.path, context.documents[context.sourceId]);
  if (!schema) {
    return {
      mode: "free",
      nodeKind: inferNodeKind(context.value),
      valid: true,
      errors: [],
      constraints: {},
    };
  }

  const effectiveSchema = materializeSchema(schema, context.value, context.rootSchema ?? schema);
  const validation = validateDocument(effectiveSchema, context.value, { sourceId: context.sourceId });
  const union = resolveUnionCapabilities(effectiveSchema, context.value, context.rootSchema);
  const nodeKind = union ? "union" : inferSchemaNodeKind(effectiveSchema, context.value);
  const objectCapabilities = getObjectCapabilities(effectiveSchema, context.value);
  const arrayCapabilities = getArrayCapabilities(effectiveSchema);

  return {
    mode: "schema",
    effectiveSchema,
    nodeKind,
    valid: validation.valid,
    errors: validation.fieldErrors ?? [],
    constraints: {
      const: effectiveSchema.const,
      enum: effectiveSchema.enum,
      nullable: isNullableSchema(effectiveSchema),
      additionalProperties: typeof effectiveSchema.additionalProperties === "boolean" ? effectiveSchema.additionalProperties : undefined,
      readOnly: effectiveSchema.readOnly === true || effectiveSchema.const !== undefined,
      minItems: effectiveSchema.minItems,
      maxItems: effectiveSchema.maxItems,
      uniqueItems: effectiveSchema.uniqueItems,
      minLength: effectiveSchema.minLength,
      maxLength: effectiveSchema.maxLength,
      pattern: effectiveSchema.pattern,
      format: effectiveSchema.format,
      minimum: effectiveSchema.minimum,
      maximum: effectiveSchema.maximum,
      exclusiveMinimum: effectiveSchema.exclusiveMinimum,
      exclusiveMaximum: effectiveSchema.exclusiveMaximum,
      multipleOf: effectiveSchema.multipleOf,
    },
    objectCapabilities,
    arrayCapabilities,
    unionCapabilities: union,
    defaultValue: createDefaultValue(effectiveSchema),
  };
}

export function validateDocument(
  schema: EditorSchema | undefined,
  document: unknown,
  options?: { sourceId?: string },
): EditorValidationResult {
  return validateDocumentWithRoot(schema, document, options, schema);
}

function validateDocumentWithRoot(
  schema: EditorSchema | undefined,
  document: unknown,
  options: { sourceId?: string } | undefined,
  rootSchema: EditorSchema | undefined,
): EditorValidationResult {
  if (!schema) {
    return { valid: true, documentErrors: [], fieldErrors: [] };
  }

  const issues: ValidationAccumulator = {
    documentErrors: [],
    fieldErrors: [],
  };

  validateAgainstSchema(schema, document, [], options?.sourceId, issues, rootSchema ?? schema);
  return {
    valid: issues.documentErrors.length === 0 && issues.fieldErrors.length === 0,
    documentErrors: issues.documentErrors,
    fieldErrors: issues.fieldErrors,
  };
}

export function createDefaultValue(schema: EditorSchema | undefined): unknown {
  if (!schema) return "";

  const effectiveSchema = materializeSchema(schema, undefined, schema);
  if (effectiveSchema.default !== undefined) return cloneJsonValue(effectiveSchema.default);
  if (effectiveSchema.const !== undefined) return cloneJsonValue(effectiveSchema.const);
  if (effectiveSchema.enum?.length) return cloneJsonValue(effectiveSchema.enum[0]);

  if (effectiveSchema.oneOf?.length) {
    return createDefaultValue(resolveSchemaReference(effectiveSchema.oneOf[0], effectiveSchema));
  }
  if (effectiveSchema.anyOf?.length) {
    return createDefaultValue(resolveSchemaReference(effectiveSchema.anyOf[0], effectiveSchema));
  }

  const types = normalizeSchemaTypes(effectiveSchema.type);
  if (types.includes("null")) {
    return null;
  }

  const primaryType = types[0];
  if (primaryType === "object") {
    const nextValue: Record<string, unknown> = {};
    for (const [key, propertySchema] of Object.entries(effectiveSchema.properties ?? {})) {
      if (!shouldCreatePropertyByDefault(propertySchema)) {
        continue;
      }
      nextValue[key] = createDefaultValue(propertySchema);
    }
    return nextValue;
  }

  if (primaryType === "array") {
    return [];
  }
  if (primaryType === "integer" || primaryType === "number") {
    return 0;
  }
  if (primaryType === "boolean") {
    return false;
  }
  if (primaryType === "null") {
    return null;
  }
  return "";
}

export function createDefaultPropertyValue(parentSchema: EditorSchema | undefined, key: string): unknown {
  if (!parentSchema) {
    return "";
  }

  const effectiveSchema = materializeSchema(parentSchema, undefined, parentSchema);
  const directSchema = effectiveSchema.properties?.[key];
  if (directSchema) {
    return createDefaultValue(resolveSchemaReference(directSchema, effectiveSchema));
  }

  const patternSchema = findPatternPropertySchema(effectiveSchema, key);
  if (patternSchema) {
    return createDefaultValue(resolveSchemaReference(patternSchema, effectiveSchema));
  }

  if (isEditorSchema(effectiveSchema.additionalProperties)) {
    return createDefaultValue(resolveSchemaReference(effectiveSchema.additionalProperties, effectiveSchema));
  }

  return "";
}

export function createDefaultArrayItem(itemsSchema: EditorSchema | undefined): unknown {
  return createDefaultValue(itemsSchema ? resolveSchemaReference(itemsSchema, itemsSchema) : itemsSchema);
}

export function switchUnionBranch(currentValue: unknown, schema: EditorSchema | undefined, targetIndex: number): unknown {
  void currentValue;
  const options = getUnionOptions(schema, schema);
  const target = options[targetIndex];
  return createDefaultValue(target);
}

export function resolveSchemaAtPath(rootSchema: EditorSchema | undefined, path: JsonPath, rootValue?: unknown): EditorSchema | undefined {
  let currentSchema = rootSchema;
  let currentValue = rootValue;

  for (const segment of path) {
    if (!currentSchema) return undefined;

    currentSchema = materializeSchema(currentSchema, currentValue, rootSchema ?? currentSchema);

    const unionOptions = getUnionOptions(currentSchema, rootSchema ?? currentSchema);
    if (unionOptions.length > 0) {
      currentSchema = unionOptions[resolveUnionOptionIndex(currentSchema, currentValue, rootSchema ?? currentSchema) ?? 0];
    }

    if (typeof segment === "number") {
      currentSchema = currentSchema?.items;
      currentValue = Array.isArray(currentValue) ? currentValue[segment] : undefined;
      continue;
    }

    const propertySchema = currentSchema?.properties?.[segment];
    if (propertySchema) {
      currentSchema = propertySchema;
      currentValue = isPlainObject(currentValue) ? currentValue[segment] : undefined;
      continue;
    }

    const patternSchema = findPatternPropertySchema(currentSchema, segment);
    if (patternSchema) {
      currentSchema = patternSchema;
      currentValue = isPlainObject(currentValue) ? currentValue[segment] : undefined;
      continue;
    }

    currentSchema = isEditorSchema(currentSchema?.additionalProperties) ? currentSchema.additionalProperties : undefined;
    currentValue = isPlainObject(currentValue) ? currentValue[segment] : undefined;
  }

  return currentSchema ? materializeSchema(currentSchema, currentValue, rootSchema ?? currentSchema) : undefined;
}

export function updateSchemaAtDocumentPath(
  rootSchema: EditorSchema,
  path: JsonPath,
  target: "self" | "items",
  updater: (schema: EditorSchema) => EditorSchema,
): EditorSchema {
  return visitSchemaPath(cloneSchema(rootSchema), path, target, updater);
}

function visitSchemaPath(
  schema: EditorSchema,
  path: JsonPath,
  target: "self" | "items",
  updater: (schema: EditorSchema) => EditorSchema,
): EditorSchema {
  if (path.length === 0) {
    if (target === "self") {
      return updater(cloneSchema(schema));
    }
    if (schema.items) {
      return {
        ...schema,
        items: updater(cloneSchema(schema.items)),
      };
    }
    return schema;
  }

  const [segment, ...rest] = path;
  if (typeof segment === "number") {
    if (!schema.items) return schema;
    return {
      ...schema,
      items: visitSchemaPath(schema.items, rest, target, updater),
    };
  }

  if (schema.properties?.[segment]) {
    return {
      ...schema,
      properties: {
        ...schema.properties,
        [segment]: visitSchemaPath(schema.properties[segment], rest, target, updater),
      },
    };
  }

  if (isEditorSchema(schema.additionalProperties)) {
    return {
      ...schema,
      additionalProperties: visitSchemaPath(schema.additionalProperties, rest, target, updater),
    };
  }

  return schema;
}

function validateAgainstSchema(
  originalSchema: EditorSchema,
  value: unknown,
  path: JsonPath,
  sourceId: string | undefined,
  issues: ValidationAccumulator,
  rootSchema: EditorSchema,
) {
  const schema = materializeSchema(originalSchema, value, rootSchema);
  const unionOptions = getUnionOptions(schema, rootSchema);
  if (unionOptions.length > 0) {
    const unionResult = validateUnion(schema, value, path, sourceId, rootSchema);
    if (!unionResult.valid) {
      issues.documentErrors.push(...(unionResult.documentErrors ?? []));
      issues.fieldErrors.push(...(unionResult.fieldErrors ?? []));
      return;
    }
    return;
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    pushIssue(issues, sourceId, path, "Value must match const");
  }

  if (schema.enum?.length && !schema.enum.some((option) => deepEqual(option, value))) {
    pushIssue(issues, sourceId, path, "Value must match enum");
  }

  if (!matchesSchemaType(schema, value)) {
    pushIssue(issues, sourceId, path, `Expected ${describeExpectedType(schema)}`);
    return;
  }

  validateScalarConstraints(schema, value, path, sourceId, issues);

  const primaryType = inferSchemaNodeKind(schema, value);
  if (primaryType === "object") {
    validateObject(schema, value, path, sourceId, issues, rootSchema);
    return;
  }
  if (primaryType === "array") {
    validateArray(schema, value, path, sourceId, issues, rootSchema);
  }
}

function validateScalarConstraints(
  schema: EditorSchema,
  value: unknown,
  path: JsonPath,
  sourceId: string | undefined,
  issues: ValidationAccumulator,
) {
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      pushIssue(issues, sourceId, path, `String must have at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      pushIssue(issues, sourceId, path, `String must have at most ${schema.maxLength} characters`);
    }
    if (schema.pattern) {
      const matcher = safelyCreateRegExp(schema.pattern);
      if (matcher && !matcher.test(value)) {
        pushIssue(issues, sourceId, path, `String must match pattern ${schema.pattern}`);
      }
    }
    if (schema.format && !matchesStringFormat(schema.format, value)) {
      pushIssue(issues, sourceId, path, `String must match format ${schema.format}`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      pushIssue(issues, sourceId, path, `Number must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      pushIssue(issues, sourceId, path, `Number must be <= ${schema.maximum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      pushIssue(issues, sourceId, path, `Number must be > ${schema.exclusiveMinimum}`);
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      pushIssue(issues, sourceId, path, `Number must be < ${schema.exclusiveMaximum}`);
    }
    if (schema.multipleOf !== undefined && schema.multipleOf !== 0) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
        pushIssue(issues, sourceId, path, `Number must be a multiple of ${schema.multipleOf}`);
      }
    }
  }
}

function validateObject(
  schema: EditorSchema,
  value: unknown,
  path: JsonPath,
  sourceId: string | undefined,
  issues: ValidationAccumulator,
  rootSchema: EditorSchema,
) {
  if (!isPlainObject(value)) return;
  const requiredKeys = schema.required ?? [];
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      pushIssue(issues, sourceId, [...path, key], "Required field is missing");
    }
  }

  for (const [driverKey, dependentKeys] of Object.entries(schema.dependentRequired ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(value, driverKey)) continue;
    for (const dependentKey of dependentKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, dependentKey)) {
        pushIssue(issues, sourceId, [...path, dependentKey], `Field is required when ${driverKey} is present`);
      }
    }
  }

  for (const [driverKey, dependentSchema] of Object.entries(schema.dependentSchemas ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(value, driverKey)) continue;
    validateAgainstSchema(dependentSchema, value, path, sourceId, issues, rootSchema);
  }

  const properties = schema.properties ?? {};
  for (const [key, childValue] of Object.entries(value)) {
    const propertySchema = properties[key];
    if (propertySchema) {
      validateAgainstSchema(propertySchema, childValue, [...path, key], sourceId, issues, rootSchema);
      continue;
    }

    const patternSchema = findPatternPropertySchema(schema, key);
    if (patternSchema) {
      validateAgainstSchema(patternSchema, childValue, [...path, key], sourceId, issues, rootSchema);
      continue;
    }

    if (schema.additionalProperties === false) {
      pushIssue(issues, sourceId, [...path, key], "Additional properties are not allowed");
      continue;
    }

    if (isEditorSchema(schema.additionalProperties)) {
      validateAgainstSchema(schema.additionalProperties, childValue, [...path, key], sourceId, issues, rootSchema);
    }
  }
}

function validateArray(
  schema: EditorSchema,
  value: unknown,
  path: JsonPath,
  sourceId: string | undefined,
  issues: ValidationAccumulator,
  rootSchema: EditorSchema,
) {
  if (!Array.isArray(value)) return;

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    pushIssue(issues, sourceId, path, `Array must contain at least ${schema.minItems} items`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    pushIssue(issues, sourceId, path, `Array must contain at most ${schema.maxItems} items`);
  }
  if (schema.uniqueItems) {
    const seen = new Set<string>();
    for (const item of value) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        pushIssue(issues, sourceId, path, "Array items must be unique");
        break;
      }
      seen.add(key);
    }
  }

  const itemSchema = schema.items;
  if (!itemSchema) return;
  value.forEach((item, index) => validateAgainstSchema(itemSchema, item, [...path, index], sourceId, issues, rootSchema));
}

function validateUnion(
  schema: EditorSchema,
  value: unknown,
  path: JsonPath,
  sourceId: string | undefined,
  rootSchema: EditorSchema,
): EditorValidationResult {
  const options = getUnionOptions(schema, rootSchema);
  let bestCandidate: EditorValidationResult | undefined;
  for (const option of options) {
    const candidate = validateDocumentWithRoot(option, value, { sourceId }, rootSchema);
    if (candidate.valid) {
      return candidate;
    }
    if (!bestCandidate || isBetterUnionCandidate(candidate, bestCandidate)) {
      bestCandidate = candidate;
    }
  }

  if (bestCandidate?.fieldErrors?.length) {
    return {
      valid: false,
      documentErrors: bestCandidate.documentErrors,
      fieldErrors: bestCandidate.fieldErrors.map((error) => ({
        ...error,
        sourceId,
        path: [...path, ...error.path],
      })),
    };
  }

  return {
    valid: false,
    documentErrors: ["Schema validation failed"],
    fieldErrors: [
      {
        sourceId,
        path,
        message: "Value does not match any allowed schema branch",
      },
    ],
  };
}

function isBetterUnionCandidate(candidate: EditorValidationResult, currentBest: EditorValidationResult): boolean {
  const candidateCount = candidate.fieldErrors?.length ?? 0;
  const currentCount = currentBest.fieldErrors?.length ?? 0;
  if (candidateCount !== currentCount) {
    return candidateCount < currentCount;
  }

  const candidateDepth = Math.max(...(candidate.fieldErrors?.map((error) => error.path.length) ?? [0]));
  const currentDepth = Math.max(...(currentBest.fieldErrors?.map((error) => error.path.length) ?? [0]));
  return candidateDepth > currentDepth;
}

function getObjectCapabilities(schema: EditorSchema, value: unknown) {
  if (!normalizeSchemaTypes(schema.type).includes("object") && !schema.properties && !schema.patternProperties) {
    return undefined;
  }

  const record = isPlainObject(value) ? value : {};
  const allowedEntries = Object.entries(schema.properties ?? {}).map(([key, propertySchema]) => [
    key,
    resolveSchemaReference(propertySchema, schema) ?? propertySchema,
  ] as const);
  const patternEntries = Object.entries(schema.patternProperties ?? {}).map(([pattern, patternSchema]) => ({
    pattern,
    schema: resolveSchemaReference(patternSchema, schema) ?? patternSchema,
  }));
  const supportsDynamicKeys = patternEntries.length > 0 || isEditorSchema(schema.additionalProperties) || schema.additionalProperties !== false;
  return {
    allowedProperties: allowedEntries.map(([key, propertySchema]) => ({
      key,
      schema: propertySchema,
      required: schema.required?.includes(key) ?? false,
      title: propertySchema.title,
      description: propertySchema.description,
      group: propertySchema["x-editor"]?.group,
    })),
    requiredKeys: [...(schema.required ?? [])],
    additionalPropertyPolicy:
      schema.additionalProperties === false ? "forbid" : isEditorSchema(schema.additionalProperties) || patternEntries.length > 0 ? "schema" : "allow",
    addablePropertyKeys: allowedEntries
      .map(([key]) => key)
      .filter((key) => !Object.prototype.hasOwnProperty.call(record, key)),
    patternPropertyEntries: patternEntries,
    supportsDynamicKeys,
  } satisfies ResolvedSchemaNode["objectCapabilities"];
}

function getArrayCapabilities(schema: EditorSchema) {
  if (!normalizeSchemaTypes(schema.type).includes("array") && !schema.items) {
    return undefined;
  }

  const itemSchema = schema.items ? resolveSchemaReference(schema.items, schema) ?? schema.items : undefined;

  return {
    itemSchema,
    canAddItem: schema.maxItems === undefined || schema.maxItems > 0,
    defaultNewItem: createDefaultArrayItem(itemSchema),
    minItems: schema.minItems,
    maxItems: schema.maxItems,
    uniqueItems: schema.uniqueItems,
  } satisfies ResolvedSchemaNode["arrayCapabilities"];
}

function resolveUnionCapabilities(
  schema: EditorSchema,
  value: unknown,
  rootSchema: EditorSchema = schema,
): ResolvedSchemaNode["unionCapabilities"] | undefined {
  const options = getUnionOptions(schema, rootSchema);
  if (options.length === 0) return undefined;

  return {
    kind: schema.oneOf?.length ? "oneOf" : schema.anyOf?.length ? "anyOf" : "multiType",
    options: options.map((option, index) => ({
      index,
      schema: option,
      title: option.title ?? describeExpectedType(option),
    })),
    activeOptionIndex: resolveUnionOptionIndex(schema, value, rootSchema),
  };
}

function inferSchemaNodeKind(schema: EditorSchema, value: unknown): ResolvedSchemaNode["nodeKind"] {
  const types = normalizeSchemaTypes(schema.type);
  if (types.length > 1 || schema.oneOf?.length || schema.anyOf?.length) {
    return "union";
  }
  const primaryType = types[0];
  if (primaryType) {
    return primaryType;
  }
  return inferNodeKind(value);
}

function inferNodeKind(value: unknown): ResolvedSchemaNode["nodeKind"] {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (isPlainObject(value)) return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

function materializeSchema(schema: EditorSchema, value: unknown, rootSchema: EditorSchema): EditorSchema {
  let next = resolveSchemaReference(cloneSchema(schema), rootSchema) ?? cloneSchema(schema);

  if (next.allOf?.length) {
    for (const partial of next.allOf) {
      next = mergeSchemas(next, materializeSchema(partial, value, rootSchema));
    }
    delete next.allOf;
  }

  if (next.if) {
    const conditionPassed = validateDocumentWithRoot(resolveSchemaReference(next.if, rootSchema), value, undefined, rootSchema).valid;
    const branch = conditionPassed ? next.then : next.else;
    if (branch) {
      next = mergeSchemas(next, materializeSchema(branch, value, rootSchema));
    }
    delete next.if;
    delete next.then;
    delete next.else;
  }

  if (isPlainObject(value)) {
    for (const [driverKey, dependentSchema] of Object.entries(next.dependentSchemas ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, driverKey)) {
        next = mergeSchemas(next, materializeSchema(dependentSchema, value, rootSchema));
      }
    }
  }

  return next;
}

function mergeSchemas(baseSchema: EditorSchema, extensionSchema: EditorSchema): EditorSchema {
  const mergedRequired = uniqueStrings([...(baseSchema.required ?? []), ...(extensionSchema.required ?? [])]);
  const mergedType = mergeSchemaTypes(baseSchema.type, extensionSchema.type);
  const merged: EditorSchema = {
    ...baseSchema,
    ...extensionSchema,
    type: mergedType,
    required: mergedRequired.length > 0 ? mergedRequired : undefined,
    properties: {
      ...(baseSchema.properties ?? {}),
      ...(extensionSchema.properties ?? {}),
    },
    patternProperties: {
      ...(baseSchema.patternProperties ?? {}),
      ...(extensionSchema.patternProperties ?? {}),
    },
    dependentRequired: mergeDependentRequired(baseSchema.dependentRequired, extensionSchema.dependentRequired),
    dependentSchemas: {
      ...(baseSchema.dependentSchemas ?? {}),
      ...(extensionSchema.dependentSchemas ?? {}),
    },
    items: extensionSchema.items ?? baseSchema.items,
    additionalProperties: mergeAdditionalProperties(baseSchema.additionalProperties, extensionSchema.additionalProperties),
    oneOf: extensionSchema.oneOf ?? baseSchema.oneOf,
    anyOf: extensionSchema.anyOf ?? baseSchema.anyOf,
    enum: mergeScalarConstraint(baseSchema.enum, extensionSchema.enum),
    const: extensionSchema.const ?? baseSchema.const,
    default: extensionSchema.default ?? baseSchema.default,
    minItems: chooseMax(baseSchema.minItems, extensionSchema.minItems),
    maxItems: chooseMin(baseSchema.maxItems, extensionSchema.maxItems),
    uniqueItems: Boolean(baseSchema.uniqueItems || extensionSchema.uniqueItems) || undefined,
    minLength: chooseMax(baseSchema.minLength, extensionSchema.minLength),
    maxLength: chooseMin(baseSchema.maxLength, extensionSchema.maxLength),
    minimum: chooseMax(baseSchema.minimum, extensionSchema.minimum),
    maximum: chooseMin(baseSchema.maximum, extensionSchema.maximum),
    exclusiveMinimum: chooseMax(baseSchema.exclusiveMinimum, extensionSchema.exclusiveMinimum),
    exclusiveMaximum: chooseMin(baseSchema.exclusiveMaximum, extensionSchema.exclusiveMaximum),
    multipleOf: extensionSchema.multipleOf ?? baseSchema.multipleOf,
    pattern: extensionSchema.pattern ?? baseSchema.pattern,
    format: extensionSchema.format ?? baseSchema.format,
    "x-editor": {
      ...(baseSchema["x-editor"] ?? {}),
      ...(extensionSchema["x-editor"] ?? {}),
    },
  };

  if (Object.keys(merged.properties ?? {}).length === 0) delete merged.properties;
  if (Object.keys(merged.patternProperties ?? {}).length === 0) delete merged.patternProperties;
  if (Object.keys(merged.dependentRequired ?? {}).length === 0) delete merged.dependentRequired;
  if (Object.keys(merged.dependentSchemas ?? {}).length === 0) delete merged.dependentSchemas;
  return merged;
}

function getUnionOptions(schema: EditorSchema | undefined, rootSchema: EditorSchema | undefined = schema) {
  if (!schema) return [];
  if (schema.oneOf?.length) {
    return schema.oneOf.map((option) => resolveSchemaReference(option, rootSchema ?? schema) ?? option);
  }
  if (schema.anyOf?.length) {
    return schema.anyOf.map((option) => resolveSchemaReference(option, rootSchema ?? schema) ?? option);
  }
  const types = normalizeSchemaTypes(schema.type);
  if (types.length > 1) {
    return types.map((type) => ({ ...schema, type, oneOf: undefined, anyOf: undefined }));
  }
  return [];
}

function resolveUnionOptionIndex(schema: EditorSchema | undefined, value: unknown, rootSchema: EditorSchema | undefined = schema) {
  const options = getUnionOptions(schema, rootSchema);
  if (options.length === 0) return null;
  const activeIndex = options.findIndex((option) => validateDocumentWithRoot(option, value, undefined, rootSchema).valid);
  return activeIndex >= 0 ? activeIndex : null;
}

function matchesSchemaType(schema: EditorSchema, value: unknown) {
  const types = normalizeSchemaTypes(schema.type);
  if (types.length === 0) {
    return true;
  }
  return types.some((type) => matchesSingleType(type, value));
}

function matchesSingleType(type: EditorSchemaType, value: unknown) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "null") return value === null;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function normalizeSchemaTypes(type: EditorSchema["type"]): EditorSchemaType[] {
  if (!type) return [];
  return Array.isArray(type) ? type : [type];
}

function describeExpectedType(schema: EditorSchema) {
  const types = normalizeSchemaTypes(schema.type);
  if (types.length > 0) {
    return types.join(" | ");
  }
  if (schema.oneOf?.length) return "oneOf";
  if (schema.anyOf?.length) return "anyOf";
  return "valid value";
}

function isNullableSchema(schema: EditorSchema) {
  return normalizeSchemaTypes(schema.type).includes("null");
}

function shouldCreatePropertyByDefault(schema: EditorSchema | undefined): boolean {
  if (!schema) return false;
  const effectiveSchema = materializeSchema(schema, undefined, schema);
  if (effectiveSchema.default !== undefined || effectiveSchema.const !== undefined || effectiveSchema.enum?.length) {
    return true;
  }
  const types = normalizeSchemaTypes(effectiveSchema.type);
  if (types.includes("object")) {
    return Object.keys(effectiveSchema.properties ?? {}).some((key) => shouldCreatePropertyByDefault(effectiveSchema.properties?.[key]));
  }
  return false;
}

function pushIssue(
  issues: ValidationAccumulator,
  sourceId: string | undefined,
  path: JsonPath,
  message: string,
) {
  issues.documentErrors.push("Schema validation failed");
  issues.fieldErrors.push({ sourceId, path, message });
}

function findPatternPropertySchema(schema: EditorSchema | undefined, key: string) {
  if (!schema?.patternProperties) return undefined;
  for (const [pattern, patternSchema] of Object.entries(schema.patternProperties)) {
    const matcher = safelyCreateRegExp(pattern);
    if (matcher?.test(key)) {
      return patternSchema;
    }
  }
  return undefined;
}

function matchesStringFormat(format: string, value: string) {
  if (format === "uri") {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  if (format === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  return true;
}

function safelyCreateRegExp(pattern: string) {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function chooseMax(left?: number, right?: number) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function chooseMin(left?: number, right?: number) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function mergeAdditionalProperties(
  left: EditorSchema["additionalProperties"],
  right: EditorSchema["additionalProperties"],
): EditorSchema["additionalProperties"] {
  if (right === false) return false;
  if (isEditorSchema(left) && isEditorSchema(right)) {
    return mergeSchemas(left, right);
  }
  return right ?? left;
}

function mergeDependentRequired(
  left: EditorSchema["dependentRequired"],
  right: EditorSchema["dependentRequired"],
) {
  const merged: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(left ?? {})) {
    merged[key] = [...values];
  }
  for (const [key, values] of Object.entries(right ?? {})) {
    merged[key] = uniqueStrings([...(merged[key] ?? []), ...values]);
  }
  return merged;
}

function mergeSchemaTypes(left: EditorSchema["type"], right: EditorSchema["type"]): EditorSchema["type"] {
  const leftTypes = normalizeSchemaTypes(left);
  const rightTypes = normalizeSchemaTypes(right);
  if (leftTypes.length === 0) return right;
  if (rightTypes.length === 0) return left;
  const intersection = leftTypes.filter((type) => rightTypes.includes(type));
  if (intersection.length === 0) {
    return right;
  }
  return intersection.length === 1 ? intersection[0] : intersection;
}

function mergeScalarConstraint<T>(left: T | undefined, right: T | undefined) {
  return right ?? left;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function resolveSchemaReference(schema: EditorSchema | undefined, rootSchema: EditorSchema | undefined): EditorSchema | undefined {
  if (!schema) return undefined;
  let current = schema;
  const seen = new Set<string>();

  while (current.$ref) {
    const ref = current.$ref;
    if (seen.has(ref)) {
      break;
    }
    seen.add(ref);
    const target = lookupLocalSchemaRef(rootSchema ?? schema, ref);
    if (!target) {
      break;
    }
    current = mergeSchemas(target, {
      ...current,
      $ref: undefined,
    });
  }

  return current;
}

function lookupLocalSchemaRef(rootSchema: EditorSchema, ref: string): EditorSchema | undefined {
  if (!ref.startsWith("#/")) {
    return undefined;
  }

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: unknown = rootSchema;
  for (const segment of segments) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return isEditorSchema(current) ? cloneSchema(current) : undefined;
}

function cloneSchema(schema: EditorSchema): EditorSchema {
  return JSON.parse(JSON.stringify(schema)) as EditorSchema;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEditorSchema(value: unknown): value is EditorSchema {
  return isPlainObject(value);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
