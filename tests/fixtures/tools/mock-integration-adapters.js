export function createMockEmailAdapter() {
  return {
    async search(request) {
      return {
        messages: [
          {
            id: "email-1",
            subject: `Result for ${request.query}`,
            from: "alerts@example.com",
            to: ["user@example.com"],
          },
        ],
        total: 1,
      };
    },
    async send() {
      return {
        message_id: "email-sent-1",
        status: "sent",
      };
    },
  };
}

export function createMockCalendarAdapter() {
  return {
    async list() {
      return {
        events: [{ id: "evt-1", title: "Standup" }],
        total: 1,
      };
    },
    async create() {
      return {
        event_id: "evt-created-1",
        status: "created",
      };
    },
    async update(request) {
      return {
        event_id: request.event_id,
        status: "updated",
      };
    },
  };
}

export function createMockChatAdapter() {
  return {
    async postMessage(request) {
      return {
        message_id: "chat-1",
        channel: request.channel,
        status: "posted",
      };
    },
  };
}

export function createMockConnectorAdapter() {
  return {
    async invoke(request) {
      return {
        ok: true,
        data: {
          connector: request.connector_name,
          operation: request.operation,
        },
      };
    },
  };
}

export function createMockTaskSpawnerAdapter() {
  return {
    async spawn() {
      return {
        task_id: "task-1",
        status: "queued",
        agent_id: "sub-agent",
      };
    },
  };
}
