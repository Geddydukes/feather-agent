import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

export interface EmailSearchRequest {
  query: string;
  limit?: number;
  include_body?: boolean;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface EmailSearchResult {
  messages: Array<Record<string, unknown>>;
  total?: number;
}

export interface EmailSendRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  message_id: string;
  status?: string;
}

export interface EmailAdapter {
  search(request: EmailSearchRequest): Promise<EmailSearchResult>;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

export interface CalendarAdapter {
  list(request: {
    calendar_id?: string;
    start?: string;
    end?: string;
    limit?: number;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
  }): Promise<{ events: Array<Record<string, unknown>>; total?: number }>;
  create(request: {
    calendar_id?: string;
    title: string;
    start: string;
    end: string;
    attendees?: string[];
    location?: string;
    description?: string;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
  }): Promise<{ event_id: string; status?: string }>;
  update(request: {
    calendar_id?: string;
    event_id: string;
    title?: string;
    start?: string;
    end?: string;
    attendees?: string[];
    location?: string;
    description?: string;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
  }): Promise<{ event_id: string; status?: string }>;
}

export interface ChatAdapter {
  postMessage(request: {
    channel: string;
    text: string;
    thread_id?: string;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
  }): Promise<{ message_id: string; channel: string; status?: string }>;
}

export interface CommunicationToolOptions {
  allowedRecipients?: string[];
  allowedChannels?: string[];
  requireHumanConfirmation?: boolean;
}

export function createEmailSearchTool(adapter: EmailAdapter): Tool {
  if (!adapter || typeof adapter.search !== "function") {
    throw new Error("createEmailSearchTool requires an adapter with search(request)");
  }
  const name = "email.search";
  const description = "Search mailbox messages with metadata-rich results.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          include_body: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["messages"],
        properties: {
          messages: { type: "array", items: { type: "object" } },
          total: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: true, filesystem: false, write: false, side_effects: false },
      safety_tags: ["communication", "email", "read"],
    }),
    async run(args: { query: string; limit?: number; include_body?: boolean }, ctx) {
      const query = (args.query ?? "").trim();
      if (!query) {
        throw new Error("email.search requires query");
      }
      return adapter.search({
        query,
        limit: args.limit,
        include_body: args.include_body,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
    },
  };
}

export function createEmailSendTool(adapter: EmailAdapter, options: CommunicationToolOptions = {}): Tool {
  if (!adapter || typeof adapter.send !== "function") {
    throw new Error("createEmailSendTool requires an adapter with send(request)");
  }
  const name = "email.send";
  const description = "Send email with recipient allowlists and confirmation guardrails.";
  const requireConfirmation = options.requireHumanConfirmation ?? true;
  const allowedRecipients = normalizeList(options.allowedRecipients);
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["to", "subject", "body"],
        properties: {
          to: { type: "array", minItems: 1, items: { type: "string", minLength: 3 } },
          cc: { type: "array", items: { type: "string" } },
          bcc: { type: "array", items: { type: "string" } },
          subject: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          human_confirmed: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "message_id"],
        properties: {
          ok: { type: "boolean" },
          message_id: { type: "string" },
          status: { type: "string" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["communication", "email", "send", "human-confirmation"],
    }),
    async run(
      args: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string; human_confirmed?: boolean },
      ctx
    ) {
      if (requireConfirmation && !args.human_confirmed) {
        throw new Error("email.send requires human_confirmed=true");
      }
      const recipients = [...(args.to ?? []), ...(args.cc ?? []), ...(args.bcc ?? [])];
      ensureAllowedRecipients(recipients, allowedRecipients, "email.send");
      const result = await adapter.send({
        to: args.to ?? [],
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        body: args.body,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return {
        ok: true,
        message_id: result.message_id,
        status: result.status ?? "sent",
      };
    },
  };
}

export function createCalendarListTool(adapter: CalendarAdapter): Tool {
  if (!adapter || typeof adapter.list !== "function") {
    throw new Error("createCalendarListTool requires an adapter with list(request)");
  }
  const name = "calendar.list";
  const description = "List calendar events in a time range.";
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
          calendar_id: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
      },
      output_schema: {
        type: "object",
        required: ["events"],
        properties: {
          events: { type: "array", items: { type: "object" } },
          total: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: true, filesystem: false, write: false, side_effects: false },
      safety_tags: ["communication", "calendar", "read"],
    }),
    async run(args: { calendar_id?: string; start?: string; end?: string; limit?: number }, ctx) {
      return adapter.list({
        calendar_id: args.calendar_id,
        start: args.start,
        end: args.end,
        limit: args.limit,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
    },
  };
}

export function createCalendarCreateTool(adapter: CalendarAdapter, options: CommunicationToolOptions = {}): Tool {
  if (!adapter || typeof adapter.create !== "function") {
    throw new Error("createCalendarCreateTool requires an adapter with create(request)");
  }
  const name = "calendar.create";
  const description = "Create calendar events with confirmation and attendee allowlists.";
  const requireConfirmation = options.requireHumanConfirmation ?? true;
  const allowedRecipients = normalizeList(options.allowedRecipients);
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "start", "end"],
        properties: {
          calendar_id: { type: "string" },
          title: { type: "string", minLength: 1 },
          start: { type: "string", minLength: 1 },
          end: { type: "string", minLength: 1 },
          attendees: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          description: { type: "string" },
          human_confirmed: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "event_id"],
        properties: {
          ok: { type: "boolean" },
          event_id: { type: "string" },
          status: { type: "string" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["communication", "calendar", "write", "human-confirmation"],
    }),
    async run(
      args: {
        calendar_id?: string;
        title: string;
        start: string;
        end: string;
        attendees?: string[];
        location?: string;
        description?: string;
        human_confirmed?: boolean;
      },
      ctx
    ) {
      if (requireConfirmation && !args.human_confirmed) {
        throw new Error("calendar.create requires human_confirmed=true");
      }
      ensureAllowedRecipients(args.attendees ?? [], allowedRecipients, "calendar.create");
      const result = await adapter.create({
        calendar_id: args.calendar_id,
        title: args.title,
        start: args.start,
        end: args.end,
        attendees: args.attendees,
        location: args.location,
        description: args.description,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return {
        ok: true,
        event_id: result.event_id,
        status: result.status ?? "created",
      };
    },
  };
}

export function createCalendarUpdateTool(adapter: CalendarAdapter, options: CommunicationToolOptions = {}): Tool {
  if (!adapter || typeof adapter.update !== "function") {
    throw new Error("createCalendarUpdateTool requires an adapter with update(request)");
  }
  const name = "calendar.update";
  const description = "Update existing calendar events with confirmation and attendee allowlists.";
  const requireConfirmation = options.requireHumanConfirmation ?? true;
  const allowedRecipients = normalizeList(options.allowedRecipients);
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["event_id"],
        properties: {
          calendar_id: { type: "string" },
          event_id: { type: "string", minLength: 1 },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          description: { type: "string" },
          human_confirmed: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "event_id"],
        properties: {
          ok: { type: "boolean" },
          event_id: { type: "string" },
          status: { type: "string" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["communication", "calendar", "write", "human-confirmation"],
    }),
    async run(
      args: {
        calendar_id?: string;
        event_id: string;
        title?: string;
        start?: string;
        end?: string;
        attendees?: string[];
        location?: string;
        description?: string;
        human_confirmed?: boolean;
      },
      ctx
    ) {
      if (requireConfirmation && !args.human_confirmed) {
        throw new Error("calendar.update requires human_confirmed=true");
      }
      ensureAllowedRecipients(args.attendees ?? [], allowedRecipients, "calendar.update");
      const result = await adapter.update({
        calendar_id: args.calendar_id,
        event_id: args.event_id,
        title: args.title,
        start: args.start,
        end: args.end,
        attendees: args.attendees,
        location: args.location,
        description: args.description,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return {
        ok: true,
        event_id: result.event_id,
        status: result.status ?? "updated",
      };
    },
  };
}

export function createChatPostMessageTool(adapter: ChatAdapter, options: CommunicationToolOptions = {}): Tool {
  if (!adapter || typeof adapter.postMessage !== "function") {
    throw new Error("createChatPostMessageTool requires an adapter with postMessage(request)");
  }
  const name = "chat.post_message";
  const description = "Post chat messages to allowlisted channels with confirmation guardrails.";
  const requireConfirmation = options.requireHumanConfirmation ?? true;
  const allowedChannels = normalizeList(options.allowedChannels);
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "text"],
        properties: {
          channel: { type: "string", minLength: 1 },
          text: { type: "string", minLength: 1 },
          thread_id: { type: "string" },
          human_confirmed: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "message_id", "channel"],
        properties: {
          ok: { type: "boolean" },
          message_id: { type: "string" },
          channel: { type: "string" },
          status: { type: "string" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["communication", "chat", "write", "human-confirmation"],
    }),
    async run(args: { channel: string; text: string; thread_id?: string; human_confirmed?: boolean }, ctx) {
      if (requireConfirmation && !args.human_confirmed) {
        throw new Error("chat.post_message requires human_confirmed=true");
      }
      ensureAllowedChannel(args.channel, allowedChannels);
      const result = await adapter.postMessage({
        channel: args.channel,
        text: args.text,
        thread_id: args.thread_id,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return {
        ok: true,
        message_id: result.message_id,
        channel: result.channel,
        status: result.status ?? "posted",
      };
    },
  };
}

function normalizeList(values?: string[]): Set<string> {
  return new Set((values ?? []).map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0));
}

function ensureAllowedRecipients(recipients: string[], allowlist: Set<string>, toolName: string): void {
  if (allowlist.size === 0) {
    return;
  }
  for (const entry of recipients) {
    const normalized = entry.trim().toLowerCase();
    if (!allowlist.has(normalized)) {
      throw new Error(`${toolName} recipient "${entry}" is not allowlisted`);
    }
  }
}

function ensureAllowedChannel(channel: string, allowlist: Set<string>): void {
  if (allowlist.size === 0) {
    return;
  }
  const normalized = channel.trim().toLowerCase();
  if (!allowlist.has(normalized)) {
    throw new Error(`chat.post_message channel "${channel}" is not allowlisted`);
  }
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}
