import type { JsonSchema } from "./manifest.js";

export interface JsonSchemaValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateJsonSchemaValue(value: unknown, schema: JsonSchema): JsonSchemaValidationResult {
  if (!schema || Object.keys(schema).length === 0) {
    return { ok: true, errors: [] };
  }
  const errors: string[] = [];
  validateNode(value, schema, "$", errors);
  return { ok: errors.length === 0, errors };
}

function validateNode(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (Array.isArray((schema as { enum?: unknown[] }).enum)) {
    const allowed = (schema as { enum: unknown[] }).enum;
    if (!allowed.some((entry) => isSame(entry, value))) {
      errors.push(`${path}: value is not in enum`);
      return;
    }
  }

  const type = (schema as { type?: unknown }).type;
  if (typeof type === "string") {
    if (!matchesType(value, type)) {
      errors.push(`${path}: expected type "${type}"`);
      return;
    }
  }

  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    validateObject(value as Record<string, unknown>, schema, path, errors);
  }

  if (type === "array" && Array.isArray(value)) {
    validateArray(value, schema, path, errors);
  }

  if (type === "string" && typeof value === "string") {
    validateString(value, schema, path, errors);
  }

  if ((type === "number" || type === "integer") && typeof value === "number") {
    validateNumber(value, schema, path, errors);
  }
}

function validateObject(value: Record<string, unknown>, schema: JsonSchema, path: string, errors: string[]): void {
  const required = (schema as { required?: unknown }).required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        errors.push(`${path}.${key}: is required`);
      }
    }
  }

  const properties = (schema as { properties?: unknown }).properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, childSchema] of Object.entries(properties as Record<string, JsonSchema>)) {
      if (!(key in value)) {
        continue;
      }
      validateNode(value[key], childSchema, `${path}.${key}`, errors);
    }
  }

  const additional = (schema as { additionalProperties?: unknown }).additionalProperties;
  if (additional === false && properties && typeof properties === "object" && !Array.isArray(properties)) {
    const allowed = new Set(Object.keys(properties as Record<string, unknown>));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        errors.push(`${path}.${key}: additional properties are not allowed`);
      }
    }
  } else if (additional && typeof additional === "object") {
    const props = properties && typeof properties === "object" ? new Set(Object.keys(properties as Record<string, unknown>)) : undefined;
    for (const [key, entryValue] of Object.entries(value)) {
      if (props?.has(key)) {
        continue;
      }
      validateNode(entryValue, additional as JsonSchema, `${path}.${key}`, errors);
    }
  }
}

function validateArray(value: unknown[], schema: JsonSchema, path: string, errors: string[]): void {
  const minItems = (schema as { minItems?: unknown }).minItems;
  if (typeof minItems === "number" && value.length < minItems) {
    errors.push(`${path}: expected at least ${minItems} items`);
  }
  const maxItems = (schema as { maxItems?: unknown }).maxItems;
  if (typeof maxItems === "number" && value.length > maxItems) {
    errors.push(`${path}: expected at most ${maxItems} items`);
  }
  const items = (schema as { items?: unknown }).items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    value.forEach((entry, index) => validateNode(entry, items as JsonSchema, `${path}[${index}]`, errors));
  }
}

function validateString(value: string, schema: JsonSchema, path: string, errors: string[]): void {
  const minLength = (schema as { minLength?: unknown }).minLength;
  if (typeof minLength === "number" && value.length < minLength) {
    errors.push(`${path}: expected minimum length ${minLength}`);
  }
  const maxLength = (schema as { maxLength?: unknown }).maxLength;
  if (typeof maxLength === "number" && value.length > maxLength) {
    errors.push(`${path}: expected maximum length ${maxLength}`);
  }
  const pattern = (schema as { pattern?: unknown }).pattern;
  if (typeof pattern === "string") {
    const regex = new RegExp(pattern);
    if (!regex.test(value)) {
      errors.push(`${path}: string does not match required pattern`);
    }
  }
}

function validateNumber(value: number, schema: JsonSchema, path: string, errors: string[]): void {
  const integerType = (schema as { type?: unknown }).type === "integer";
  if (integerType && !Number.isInteger(value)) {
    errors.push(`${path}: expected integer`);
  }
  const minimum = (schema as { minimum?: unknown }).minimum;
  if (typeof minimum === "number" && value < minimum) {
    errors.push(`${path}: expected minimum ${minimum}`);
  }
  const maximum = (schema as { maximum?: unknown }).maximum;
  if (typeof maximum === "number" && value > maximum) {
    errors.push(`${path}: expected maximum ${maximum}`);
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function isSame(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

