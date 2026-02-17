import type { Tool, ToolRunContext } from "./types.js";
import type { ToolManifest } from "./manifest.js";

export interface ParsedPdfPage {
  page_no: number;
  text: string;
  tables?: Array<Record<string, unknown>>;
  figures?: Array<Record<string, unknown>>;
}

export interface ParsePdfRequest {
  path?: string;
  content_base64?: string;
  max_pages?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface ParsePdfResult {
  pages: ParsedPdfPage[];
  metadata?: Record<string, unknown>;
}

export interface PdfParserAdapter {
  parse(request: ParsePdfRequest): Promise<ParsePdfResult>;
}

export interface CreateDocParsePdfToolOptions {
  name?: string;
  description?: string;
  defaultMaxPages?: number;
}

export interface OcrBlock {
  text: string;
  confidence?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface OcrImageRequest {
  image_base64: string;
  mime_type?: string;
  page_no?: number;
  language?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface OcrImageResult {
  text: string;
  page_no?: number;
  blocks?: OcrBlock[];
  metadata?: Record<string, unknown>;
}

export interface OcrAdapter {
  ocr(request: OcrImageRequest): Promise<OcrImageResult>;
}

export interface CreateDocOcrImageToolOptions {
  name?: string;
  description?: string;
  maxImageBytes?: number;
}

const DEFAULT_DOC_PARSE_NAME = "doc.parse_pdf";
const DEFAULT_DOC_PARSE_DESCRIPTION = "Extract text and structure from PDF documents with page references.";
const DEFAULT_MAX_PAGES = 200;

const DEFAULT_OCR_NAME = "doc.ocr_image";
const DEFAULT_OCR_DESCRIPTION = "Run OCR on image content and return extracted text with optional blocks.";
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function createDocParsePdfTool(
  adapter: PdfParserAdapter,
  options: CreateDocParsePdfToolOptions = {}
): Tool {
  if (!adapter || typeof adapter.parse !== "function") {
    throw new Error("createDocParsePdfTool requires an adapter with parse(request)");
  }
  const name = options.name?.trim() || DEFAULT_DOC_PARSE_NAME;
  const description = options.description?.trim() || DEFAULT_DOC_PARSE_DESCRIPTION;
  const defaultMaxPages = options.defaultMaxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(defaultMaxPages) || defaultMaxPages <= 0) {
    throw new Error("defaultMaxPages must be a positive integer");
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
        properties: {
          path: { type: "string", minLength: 1 },
          content_base64: { type: "string", minLength: 1 },
          max_pages: { type: "integer", minimum: 1, maximum: 2000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["pages"],
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              required: ["page_no", "text"],
              properties: {
                page_no: { type: "integer", minimum: 1 },
                text: { type: "string" },
                tables: { type: "array" },
                figures: { type: "array" },
              },
            },
          },
          metadata: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["document", "untrusted-content", "read"],
    }),
    async run(args: { path?: string; content_base64?: string; max_pages?: number }, ctx: ToolRunContext) {
      const maxPages = args.max_pages ?? defaultMaxPages;
      if (!Number.isInteger(maxPages) || maxPages <= 0) {
        throw new Error("max_pages must be a positive integer");
      }
      if (!args.path && !args.content_base64) {
        throw new Error("doc.parse_pdf requires either path or content_base64");
      }
      const result = await adapter.parse({
        path: args.path,
        content_base64: args.content_base64,
        max_pages: maxPages,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return normalizePdfResult(result, maxPages);
    },
  };
}

export function createDocOcrImageTool(adapter: OcrAdapter, options: CreateDocOcrImageToolOptions = {}): Tool {
  if (!adapter || typeof adapter.ocr !== "function") {
    throw new Error("createDocOcrImageTool requires an adapter with ocr(request)");
  }
  const name = options.name?.trim() || DEFAULT_OCR_NAME;
  const description = options.description?.trim() || DEFAULT_OCR_DESCRIPTION;
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  if (!Number.isInteger(maxImageBytes) || maxImageBytes <= 0) {
    throw new Error("maxImageBytes must be a positive integer");
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
        required: ["image_base64"],
        properties: {
          image_base64: { type: "string", minLength: 1 },
          mime_type: { type: "string" },
          page_no: { type: "integer", minimum: 1 },
          language: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string" },
          page_no: { type: "integer" },
          blocks: { type: "array" },
          metadata: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["document", "untrusted-content", "ocr"],
      scopes: {
        max_bytes: maxImageBytes,
      },
    }),
    async run(
      args: { image_base64: string; mime_type?: string; page_no?: number; language?: string },
      ctx: ToolRunContext
    ) {
      if (!args.image_base64 || typeof args.image_base64 !== "string") {
        throw new Error("doc.ocr_image requires image_base64");
      }
      const imageBytes = Buffer.byteLength(args.image_base64, "base64");
      if (imageBytes > maxImageBytes) {
        throw new Error(`Image exceeds max bytes (${imageBytes} > ${maxImageBytes})`);
      }
      const result = await adapter.ocr({
        image_base64: args.image_base64,
        mime_type: args.mime_type,
        page_no: args.page_no,
        language: args.language,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return normalizeOcrResult(result);
    },
  };
}

export function createCitationFormatTool(): Tool {
  const name = "citation.format";
  const description = "Format evidence pointers into standardized citation records and markdown output.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["evidence"],
        properties: {
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                page: { type: "integer", minimum: 1 },
                quote: { type: "string" },
                source_id: { type: "string" },
                quote_start: { type: "integer", minimum: 0 },
                quote_end: { type: "integer", minimum: 0 },
              },
            },
          },
          style: { type: "string", enum: ["markdown", "json"] },
        },
      },
      output_schema: {
        type: "object",
        required: ["citations", "formatted"],
        properties: {
          citations: { type: "array" },
          formatted: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["citation", "formatting"],
    }),
    run(args: { evidence: Array<Record<string, unknown>>; style?: "markdown" | "json" }) {
      const evidence = Array.isArray(args.evidence) ? args.evidence : [];
      const citations = evidence.map((entry, index) => normalizeCitation(entry, index + 1));
      const style = args.style ?? "markdown";
      return {
        citations,
        formatted: style === "json" ? JSON.stringify(citations, null, 2) : formatCitationsMarkdown(citations),
      };
    },
  };
}

function normalizePdfResult(result: ParsePdfResult, maxPages: number): ParsePdfResult {
  if (!result || typeof result !== "object" || !Array.isArray(result.pages)) {
    throw new Error("PDF parser adapter must return { pages: [] }");
  }
  const pages = result.pages.slice(0, maxPages).map((page) => {
    const pageNo = Number(page.page_no);
    if (!Number.isInteger(pageNo) || pageNo <= 0) {
      throw new Error("PDF parser pages require positive integer page_no");
    }
    if (typeof page.text !== "string") {
      throw new Error("PDF parser pages require text strings");
    }
    return {
      page_no: pageNo,
      text: page.text,
      tables: Array.isArray(page.tables) ? page.tables : undefined,
      figures: Array.isArray(page.figures) ? page.figures : undefined,
    } satisfies ParsedPdfPage;
  });
  return {
    pages,
    metadata: result.metadata,
  };
}

function normalizeOcrResult(result: OcrImageResult): OcrImageResult {
  if (!result || typeof result !== "object") {
    throw new Error("OCR adapter must return an object");
  }
  if (typeof result.text !== "string") {
    throw new Error("OCR result must include text");
  }
  if (result.page_no !== undefined && (!Number.isInteger(result.page_no) || result.page_no <= 0)) {
    throw new Error("OCR page_no must be a positive integer");
  }
  if (result.blocks && !Array.isArray(result.blocks)) {
    throw new Error("OCR blocks must be an array");
  }
  return {
    text: result.text,
    page_no: result.page_no,
    blocks: result.blocks,
    metadata: result.metadata,
  };
}

function normalizeCitation(entry: Record<string, unknown>, index: number) {
  const url = typeof entry.url === "string" && entry.url.trim() ? entry.url.trim() : undefined;
  const page = toPositiveInt(entry.page);
  const quote = typeof entry.quote === "string" && entry.quote.trim() ? entry.quote.trim() : undefined;
  const sourceId = typeof entry.source_id === "string" && entry.source_id.trim() ? entry.source_id.trim() : undefined;
  const quoteStart = toNonNegativeInt(entry.quote_start);
  const quoteEnd = toNonNegativeInt(entry.quote_end);

  return {
    id: `c${index}`,
    url,
    page,
    quote,
    source_id: sourceId,
    quote_start: quoteStart,
    quote_end: quoteEnd,
  };
}

function formatCitationsMarkdown(citations: Array<Record<string, unknown>>): string {
  return citations
    .map((citation, index) => {
      const id = index + 1;
      const url = typeof citation.url === "string" ? citation.url : "n/a";
      const page = typeof citation.page === "number" ? ` p.${citation.page}` : "";
      const quote = typeof citation.quote === "string" ? `\n> ${citation.quote}` : "";
      return `[${id}] ${url}${page}${quote}`;
    })
    .join("\n");
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

