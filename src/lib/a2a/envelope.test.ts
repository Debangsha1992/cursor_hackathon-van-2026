import { describe, it, expect } from "vitest";
import {
  JsonRpcRequest,
  Message,
  SendMessageParams,
  StreamEvent,
  Task,
  TaskState,
  TERMINAL_STATES,
  INTERRUPTED_STATES,
} from "./envelope";

describe("envelope - TaskState classification", () => {
  it("identifies terminal states", () => {
    expect(TERMINAL_STATES.has("TASK_STATE_COMPLETED")).toBe(true);
    expect(TERMINAL_STATES.has("TASK_STATE_FAILED")).toBe(true);
    expect(TERMINAL_STATES.has("TASK_STATE_CANCELED")).toBe(true);
    expect(TERMINAL_STATES.has("TASK_STATE_REJECTED")).toBe(true);
  });

  it("identifies interrupted states", () => {
    expect(INTERRUPTED_STATES.has("TASK_STATE_INPUT_REQUIRED")).toBe(true);
    expect(INTERRUPTED_STATES.has("TASK_STATE_AUTH_REQUIRED")).toBe(true);
  });

  it("rejects unknown states", () => {
    const parsed = TaskState.safeParse("TASK_STATE_NONSENSE");
    expect(parsed.success).toBe(false);
  });
});

describe("envelope - JsonRpcRequest", () => {
  it("accepts a well-formed request", () => {
    const parsed = JsonRpcRequest.safeParse({
      jsonrpc: "2.0",
      method: "message/send",
      params: { foo: "bar" },
      id: "abc",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a wrong jsonrpc version", () => {
    const parsed = JsonRpcRequest.safeParse({
      jsonrpc: "1.0",
      method: "message/send",
      id: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing method", () => {
    const parsed = JsonRpcRequest.safeParse({
      jsonrpc: "2.0",
      id: 1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("envelope - Message parts", () => {
  it("accepts a mixed text + data parts payload", () => {
    const parsed = Message.safeParse({
      messageId: "m1",
      role: "ROLE_USER",
      parts: [
        { kind: "text", text: "submit my trade" },
        { kind: "data", data: { symbol: "BTC" } },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown part kind", () => {
    const parsed = Message.safeParse({
      messageId: "m1",
      role: "ROLE_USER",
      parts: [{ kind: "image", url: "..." }],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires at least one part", () => {
    const parsed = Message.safeParse({
      messageId: "m1",
      role: "ROLE_USER",
      parts: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("envelope - StreamEvent discriminated union", () => {
  it("round-trips a status-update event", () => {
    const event = {
      kind: "status-update" as const,
      taskId: "t1",
      contextId: "c1",
      status: { state: "TASK_STATE_WORKING" as const },
      final: false,
    };
    const parsed = StreamEvent.safeParse(event);
    expect(parsed.success).toBe(true);
  });

  it("round-trips an artifact-update event", () => {
    const event = {
      kind: "artifact-update" as const,
      taskId: "t1",
      contextId: "c1",
      artifact: {
        artifactId: "a1",
        parts: [{ kind: "text" as const, text: "hello" }],
      },
      final: true,
    };
    const parsed = StreamEvent.safeParse(event);
    expect(parsed.success).toBe(true);
  });
});

describe("envelope - SendMessageParams", () => {
  it("accepts a minimal valid payload", () => {
    const parsed = SendMessageParams.safeParse({
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [{ kind: "text", text: "hi" }],
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("envelope - Task", () => {
  it("rejects a Task with malformed status state", () => {
    const parsed = Task.safeParse({
      id: "t1",
      contextId: "c1",
      status: { state: "TASK_STATE_BANANA" },
      artifacts: [],
      history: [],
    });
    expect(parsed.success).toBe(false);
  });
});
