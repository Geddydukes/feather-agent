import { describe, expect, it } from "vitest";

import {
  createCalendarCreateTool,
  createCalendarListTool,
  createCalendarUpdateTool,
  createChatPostMessageTool,
  createEmailSearchTool,
  createEmailSendTool,
} from "../../src/tools/communication.js";

describe("communication tools", () => {
  it("searches email through adapter", async () => {
    const tool = createEmailSearchTool({
      search: async (request) => ({
        messages: [{ id: "email-1", subject: request.query }],
      }),
      send: async () => ({ message_id: "unused" }),
    });
    const result = await tool.run(
      { query: "inbox alerts" },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { messages: Array<{ subject: string }> }).messages[0].subject).toBe("inbox alerts");
  });

  it("requires confirmation and allowlisted recipients for email.send", async () => {
    const tool = createEmailSendTool(
      {
        search: async () => ({ messages: [] }),
        send: async () => ({ message_id: "sent-1" }),
      },
      {
        allowedRecipients: ["owner@example.com"],
      }
    );

    await expect(
      tool.run(
        {
          to: ["owner@example.com"],
          subject: "Hello",
          body: "World",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/human_confirmed=true/);

    await expect(
      tool.run(
        {
          to: ["other@example.com"],
          subject: "Hello",
          body: "World",
          human_confirmed: true,
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowlisted/);
  });

  it("lists, creates, and updates calendar entries with guardrails", async () => {
    const adapter = {
      list: async () => ({ events: [{ id: "evt-1" }], total: 1 }),
      create: async () => ({ event_id: "evt-created" }),
      update: async ({ event_id }: { event_id: string }) => ({ event_id }),
    };
    const listTool = createCalendarListTool(adapter);
    const createTool = createCalendarCreateTool(adapter, {
      allowedRecipients: ["owner@example.com"],
    });
    const updateTool = createCalendarUpdateTool(adapter, {
      allowedRecipients: ["owner@example.com"],
    });

    const listed = await listTool.run({}, { metadata: undefined, signal: undefined });
    expect((listed as { total: number }).total).toBe(1);

    const created = await createTool.run(
      {
        title: "Review",
        start: "2026-02-11T10:00:00Z",
        end: "2026-02-11T10:30:00Z",
        attendees: ["owner@example.com"],
        human_confirmed: true,
      },
      { metadata: undefined, signal: undefined }
    );
    expect((created as { event_id: string }).event_id).toBe("evt-created");

    const updated = await updateTool.run(
      {
        event_id: "evt-created",
        attendees: ["owner@example.com"],
        human_confirmed: true,
      },
      { metadata: undefined, signal: undefined }
    );
    expect((updated as { event_id: string }).event_id).toBe("evt-created");
  });

  it("enforces channel allowlist for chat.post_message", async () => {
    const tool = createChatPostMessageTool(
      {
        postMessage: async (request) => ({ message_id: "chat-1", channel: request.channel }),
      },
      {
        allowedChannels: ["team-internal"],
      }
    );

    await expect(
      tool.run(
        {
          channel: "external",
          text: "Hello",
          human_confirmed: true,
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowlisted/);

    const result = await tool.run(
      {
        channel: "team-internal",
        text: "Hello",
        human_confirmed: true,
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
