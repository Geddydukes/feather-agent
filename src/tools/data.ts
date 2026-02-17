import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

export interface QuerySqlRequest {
  sql: string;
  params?: unknown[] | Record<string, unknown>;
  read_only?: boolean;
  max_rows?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface QuerySqlResult {
  rows: Array<Record<string, unknown>>;
  row_count?: number;
  columns?: string[];
  metadata?: Record<string, unknown>;
}

export interface SqlQueryAdapter {
  query(request: QuerySqlRequest): Promise<QuerySqlResult>;
}

export interface CreateDbQuerySqlToolOptions {
  name?: string;
  description?: string;
  defaultReadOnly?: boolean;
  defaultMaxRows?: number;
}

export function createDbQuerySqlTool(adapter: SqlQueryAdapter, options: CreateDbQuerySqlToolOptions = {}): Tool {
  if (!adapter || typeof adapter.query !== "function") {
    throw new Error("createDbQuerySqlTool requires an adapter with query(request)");
  }
  const name = options.name?.trim() || "db.query_sql";
  const description = options.description?.trim() || "Run parameterized SQL queries against approved databases.";
  const defaultReadOnly = options.defaultReadOnly ?? true;
  const defaultMaxRows = options.defaultMaxRows ?? 500;
  if (!Number.isInteger(defaultMaxRows) || defaultMaxRows <= 0) {
    throw new Error("defaultMaxRows must be a positive integer");
  }

  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["sql"],
        properties: {
          sql: { type: "string", minLength: 1 },
          params: {},
          read_only: { type: "boolean" },
          max_rows: { type: "integer", minimum: 1, maximum: 100000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["rows", "row_count"],
        properties: {
          rows: { type: "array", items: { type: "object" } },
          row_count: { type: "integer", minimum: 0 },
          columns: { type: "array", items: { type: "string" } },
          truncated: { type: "boolean" },
          metadata: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["database", "sql", "read-only-default"],
      scopes: {
        max_rows: defaultMaxRows,
      },
    }),
    async run(args: { sql: string; params?: unknown[] | Record<string, unknown>; read_only?: boolean; max_rows?: number }, ctx) {
      const sql = (args.sql ?? "").trim();
      if (!sql) {
        throw new Error("db.query_sql requires sql");
      }
      assertSingleStatement(sql);
      const readOnly = args.read_only ?? defaultReadOnly;
      if (readOnly && !isReadOnlySql(sql)) {
        throw new Error("Read-only mode only permits SELECT/CTE queries");
      }
      const maxRows = args.max_rows ?? defaultMaxRows;
      if (!Number.isInteger(maxRows) || maxRows <= 0) {
        throw new Error("max_rows must be a positive integer");
      }
      const result = await adapter.query({
        sql,
        params: args.params,
        read_only: readOnly,
        max_rows: maxRows,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return normalizeQueryResult(result, maxRows);
    },
  };
}

interface VectorRecord {
  source_id: string;
  text: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  updated_at: string;
}

export interface VectorUpsertItem {
  source_id: string;
  text: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface VectorSearchItem {
  source_id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export class InMemoryVectorStore {
  private readonly namespaces = new Map<string, Map<string, VectorRecord>>();

  upsert(namespace: string, items: VectorUpsertItem[]): number {
    const bucket = this.getNamespace(namespace);
    let count = 0;
    for (const item of items) {
      if (!item || typeof item.source_id !== "string" || item.source_id.trim() === "") {
        throw new Error("vector.upsert items require source_id");
      }
      if (typeof item.text !== "string" || item.text.trim() === "") {
        throw new Error("vector.upsert items require text");
      }
      if (item.embedding && !isValidEmbedding(item.embedding)) {
        throw new Error(`Invalid embedding for source_id "${item.source_id}"`);
      }
      bucket.set(item.source_id, {
        source_id: item.source_id,
        text: item.text,
        metadata: item.metadata,
        embedding: item.embedding,
        updated_at: new Date().toISOString(),
      });
      count += 1;
    }
    return count;
  }

  search(namespace: string, request: { query_text?: string; query_embedding?: number[]; top_k: number; filter?: Record<string, unknown> }): VectorSearchItem[] {
    const bucket = this.getNamespace(namespace);
    const candidates = Array.from(bucket.values())
      .filter((record) => matchFilter(record.metadata, request.filter))
      .map((record) => ({
        source_id: record.source_id,
        text: record.text,
        metadata: record.metadata,
        score: scoreVectorRecord(record, request),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, request.top_k)
      .map((entry) => ({ ...entry, score: Number(entry.score.toFixed(6)) }));
    return candidates;
  }

  private getNamespace(namespace: string): Map<string, VectorRecord> {
    if (!namespace || typeof namespace !== "string" || namespace.trim() === "") {
      throw new Error("Vector namespace is required");
    }
    const key = namespace.trim();
    let bucket = this.namespaces.get(key);
    if (!bucket) {
      bucket = new Map();
      this.namespaces.set(key, bucket);
    }
    return bucket;
  }
}

export function createVectorUpsertTool(store: InMemoryVectorStore): Tool {
  const name = "vector.upsert";
  const description = "Upsert vector chunks into an embedding store.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace", "items"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["source_id", "text"],
              properties: {
                source_id: { type: "string" },
                text: { type: "string" },
                metadata: { type: "object" },
                embedding: { type: "array", items: { type: "number" } },
              },
            },
          },
        },
      },
      output_schema: {
        type: "object",
        required: ["upserted"],
        properties: {
          upserted: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["vector", "retrieval", "write"],
    }),
    run(args: { namespace: string; items: VectorUpsertItem[] }) {
      const upserted = store.upsert(args.namespace, args.items);
      return { upserted };
    },
  };
}

export function createVectorSearchTool(store: InMemoryVectorStore): Tool {
  const name = "vector.search";
  const description = "Search vector chunks by query text or embedding.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          query_text: { type: "string" },
          query_embedding: { type: "array", items: { type: "number" } },
          top_k: { type: "integer", minimum: 1, maximum: 100 },
          filter: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["chunks"],
        properties: {
          chunks: {
            type: "array",
            items: {
              type: "object",
              required: ["source_id", "score", "text"],
              properties: {
                source_id: { type: "string" },
                score: { type: "number" },
                text: { type: "string" },
                metadata: { type: "object" },
              },
            },
          },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["vector", "retrieval", "read"],
    }),
    run(args: {
      namespace: string;
      query_text?: string;
      query_embedding?: number[];
      top_k?: number;
      filter?: Record<string, unknown>;
    }) {
      if (!args.query_text && !args.query_embedding) {
        throw new Error("vector.search requires query_text or query_embedding");
      }
      if (args.query_embedding && !isValidEmbedding(args.query_embedding)) {
        throw new Error("query_embedding must be a numeric vector");
      }
      const chunks = store.search(args.namespace, {
        query_text: args.query_text,
        query_embedding: args.query_embedding,
        top_k: args.top_k ?? 5,
        filter: args.filter,
      });
      return { chunks };
    },
  };
}

export interface CsvToolsOptions {
  workspaceRoots?: string[];
  maxReadBytes?: number;
  maxWriteBytes?: number;
}

export function createCsvReadTool(options: CsvToolsOptions = {}): Tool {
  const policy = createCsvPolicy(options);
  const name = "etl.csv_read";
  const description = "Read CSV files with schema validation and delimiter controls.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1 },
          delimiter: { type: "string", minLength: 1, maxLength: 1 },
          has_header: { type: "boolean" },
          max_rows: { type: "integer", minimum: 1, maximum: 100000 },
          schema: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["rows", "columns"],
        properties: {
          rows: { type: "array" },
          columns: { type: "array", items: { type: "string" } },
          row_count: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["csv", "etl", "read"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_bytes: policy.maxReadBytes,
      },
    }),
    async run(args: {
      path: string;
      delimiter?: string;
      has_header?: boolean;
      max_rows?: number;
      schema?: Record<string, "string" | "number" | "boolean">;
    }) {
      const filePath = ensureWithinWorkspace(path.resolve(args.path), policy.workspaceRoots);
      if (path.extname(filePath).toLowerCase() !== ".csv") {
        throw new Error("etl.csv_read only supports .csv files");
      }
      const raw = await readFile(filePath, "utf8");
      if (Buffer.byteLength(raw, "utf8") > policy.maxReadBytes) {
        throw new Error(`CSV exceeds maxReadBytes (${Buffer.byteLength(raw, "utf8")} > ${policy.maxReadBytes})`);
      }
      const delimiter = args.delimiter ?? ",";
      if (delimiter.length !== 1) {
        throw new Error("delimiter must be a single character");
      }
      const hasHeader = args.has_header ?? true;
      const parsed = parseCsv(raw, delimiter);
      const maxRows = args.max_rows ?? 5000;
      if (!Number.isInteger(maxRows) || maxRows <= 0) {
        throw new Error("max_rows must be a positive integer");
      }
      const rows = parsed.slice(0, maxRows);
      if (rows.length === 0) {
        return { rows: [], columns: [], row_count: 0 };
      }
      if (!hasHeader) {
        return {
          rows,
          columns: rows[0].map((_, index) => `col_${index + 1}`),
          row_count: rows.length,
        };
      }
      const headers = rows[0];
      const records = rows.slice(1).map((row) => toRecord(headers, row));
      if (args.schema) {
        validateCsvSchema(records, args.schema);
      }
      return {
        rows: records,
        columns: headers,
        row_count: records.length,
      };
    },
  };
}

export function createCsvWriteTool(options: CsvToolsOptions = {}): Tool {
  const policy = createCsvPolicy(options);
  const name = "etl.csv_write";
  const description = "Write CSV files with schema-safe escaping and injection protection.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "rows"],
        properties: {
          path: { type: "string", minLength: 1 },
          rows: { type: "array", minItems: 0 },
          delimiter: { type: "string", minLength: 1, maxLength: 1 },
          include_header: { type: "boolean" },
          headers: { type: "array", items: { type: "string" } },
          create_dirs: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "path", "rows_written", "bytes"],
        properties: {
          ok: { type: "boolean" },
          path: { type: "string" },
          rows_written: { type: "integer", minimum: 0 },
          bytes: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["csv", "etl", "write"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_bytes: policy.maxWriteBytes,
      },
    }),
    async run(args: {
      path: string;
      rows: Array<Record<string, unknown> | unknown[]>;
      delimiter?: string;
      include_header?: boolean;
      headers?: string[];
      create_dirs?: boolean;
    }) {
      const target = ensureWithinWorkspace(path.resolve(args.path), policy.workspaceRoots);
      if (path.extname(target).toLowerCase() !== ".csv") {
        throw new Error("etl.csv_write only supports .csv files");
      }
      if (args.create_dirs) {
        await mkdir(path.dirname(target), { recursive: true });
      }
      const delimiter = args.delimiter ?? ",";
      if (delimiter.length !== 1) {
        throw new Error("delimiter must be a single character");
      }
      const includeHeader = args.include_header ?? true;
      const rows = Array.isArray(args.rows) ? args.rows : [];

      const headers = resolveHeaders(rows, args.headers);
      const csvRows: string[] = [];
      if (includeHeader && headers.length > 0) {
        csvRows.push(headers.map((value) => encodeCsvCell(value, delimiter)).join(delimiter));
      }
      for (const row of rows) {
        const values = toCsvRowValues(row, headers);
        csvRows.push(values.map((value) => encodeCsvCell(value, delimiter)).join(delimiter));
      }
      const content = `${csvRows.join("\n")}${csvRows.length > 0 ? "\n" : ""}`;
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > policy.maxWriteBytes) {
        throw new Error(`CSV output exceeds maxWriteBytes (${bytes} > ${policy.maxWriteBytes})`);
      }
      await writeFile(target, content, "utf8");
      return {
        ok: true,
        path: target,
        rows_written: rows.length,
        bytes,
      };
    },
  };
}

function normalizeQueryResult(result: QuerySqlResult, maxRows: number): {
  rows: Array<Record<string, unknown>>;
  row_count: number;
  columns: string[];
  truncated: boolean;
  metadata?: Record<string, unknown>;
} {
  if (!result || typeof result !== "object" || !Array.isArray(result.rows)) {
    throw new Error("SQL adapter must return { rows: [] }");
  }
  const rows = result.rows.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>;
  const limited = rows.slice(0, maxRows);
  const columns = result.columns && Array.isArray(result.columns)
    ? result.columns
    : Array.from(new Set(limited.flatMap((row) => Object.keys(row))));
  return {
    rows: limited,
    row_count: typeof result.row_count === "number" ? result.row_count : limited.length,
    columns,
    truncated: rows.length > maxRows,
    metadata: result.metadata,
  };
}

function assertSingleStatement(sql: string): void {
  const stripped = sql.replace(/--.*$/gm, "").trim();
  if (stripped.includes(";")) {
    throw new Error("db.query_sql only permits single statements");
  }
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  return normalized.startsWith("select ") || normalized.startsWith("with ");
}

function isValidEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding) || embedding.length === 0) return false;
  return embedding.every((value) => typeof value === "number" && Number.isFinite(value));
}

function matchFilter(metadata: Record<string, unknown> | undefined, filter?: Record<string, unknown>): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }
  const target = metadata ?? {};
  return Object.entries(filter).every(([key, value]) => target[key] === value);
}

function scoreVectorRecord(
  record: VectorRecord,
  request: { query_text?: string; query_embedding?: number[] }
): number {
  if (request.query_embedding && record.embedding && record.embedding.length === request.query_embedding.length) {
    return cosineSimilarity(request.query_embedding, record.embedding);
  }
  if (request.query_text) {
    return tokenOverlapScore(request.query_text, record.text);
  }
  return 0;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function tokenOverlapScore(query: string, text: string): number {
  const q = tokenize(query);
  const t = tokenize(text);
  if (q.size === 0 || t.size === 0) return 0;
  let common = 0;
  for (const token of q) {
    if (t.has(token)) common += 1;
  }
  return common / Math.sqrt(q.size * t.size);
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  );
}

function createCsvPolicy(options: CsvToolsOptions): { workspaceRoots: string[]; maxReadBytes: number; maxWriteBytes: number } {
  return {
    workspaceRoots: (options.workspaceRoots ?? [process.cwd()]).map((entry) => path.resolve(entry)),
    maxReadBytes: options.maxReadBytes ?? 2_000_000,
    maxWriteBytes: options.maxWriteBytes ?? 2_000_000,
  };
}

function ensureWithinWorkspace(resolvedPath: string, workspaceRoots: string[]): string {
  for (const root of workspaceRoots) {
    if (resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`)) {
      return resolvedPath;
    }
  }
  throw new Error(`Path "${resolvedPath}" is outside allowed workspace roots`);
}

function parseCsv(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  const flushValue = () => {
    row.push(value);
    value = "";
  };
  const flushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (input[i + 1] === "\"") {
          value += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      flushValue();
      continue;
    }
    if (ch === "\n") {
      flushValue();
      flushRow();
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    value += ch;
  }
  if (value.length > 0 || row.length > 0) {
    flushValue();
    flushRow();
  }
  return rows.filter((entry) => !(entry.length === 1 && entry[0] === ""));
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i] || `col_${i + 1}`;
    record[header] = row[i] ?? "";
  }
  return record;
}

function validateCsvSchema(rows: Record<string, unknown>[], schema: Record<string, "string" | "number" | "boolean">): void {
  for (const [index, row] of rows.entries()) {
    for (const [column, kind] of Object.entries(schema)) {
      const value = row[column];
      if (value === undefined || value === null || value === "") continue;
      if (kind === "string") continue;
      if (kind === "number" && Number.isFinite(Number(value))) continue;
      if (kind === "boolean" && (String(value).toLowerCase() === "true" || String(value).toLowerCase() === "false")) continue;
      throw new Error(`CSV schema validation failed at row ${index + 1}, column "${column}"`);
    }
  }
}

function resolveHeaders(rows: Array<Record<string, unknown> | unknown[]>, explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (rows.length === 0) return [];
  const first = rows[0];
  if (Array.isArray(first)) {
    return first.map((_, index) => `col_${index + 1}`);
  }
  return Object.keys(first);
}

function toCsvRowValues(row: Record<string, unknown> | unknown[], headers: string[]): string[] {
  if (Array.isArray(row)) {
    return row.map((entry) => stringifyCell(entry));
  }
  return headers.map((header) => stringifyCell(row[header]));
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function encodeCsvCell(value: string, delimiter: string): string {
  const safe = sanitizeCsvCell(value);
  const mustQuote = safe.includes("\"") || safe.includes("\n") || safe.includes("\r") || safe.includes(delimiter);
  if (!mustQuote) {
    return safe;
  }
  return `"${safe.replace(/"/g, "\"\"")}"`;
}

function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@]/.test(value) || value.startsWith("\t")) {
    return `'${value}`;
  }
  return value;
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

