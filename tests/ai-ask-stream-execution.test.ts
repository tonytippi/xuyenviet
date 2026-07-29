import { describe, expect, test } from "vitest";

import { createAiAskStreamExecution } from "@xuyenviet/domain";

describe("AI Ask stream execution", () => {
  test("serializes the port events as byte-compatible NDJSON without correlation in the body", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return {
          kind: "admitted",
          execution: (async function* () {
            yield { type: "preparing" } as const;
            yield { type: "delta", content: "Xin chào" } as const;
            yield {
              type: "done",
              conversationId: "conversation-1",
              userMessage: { id: "user-message-1", content: "Đi đâu?" },
              assistantMessage: { id: "assistant-message-1", content: "Đi Huế." },
            } as const;
          })(),
        };
      },
    });

    const bytes: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) bytes.push(chunk);

    const body = new TextDecoder().decode(concatenate(bytes));
    expect(body).toBe('{"type":"preparing"}\n{"type":"delta","content":"Xin chào"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-message-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-message-1","content":"Đi Huế."}}\n');
    expect(body).not.toContain("request_1");
    expect(body).not.toContain("requestId");
  });

  test("writes a replay as its one retained event", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return { kind: "replay", event: { type: "in_progress", conversationId: "conversation-1" } };
      },
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);
    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"in_progress","conversationId":"conversation-1"}\n');
  });

  test("closes an admitted execution with one safe terminal event when its port ends early", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return {
          kind: "admitted",
          execution: (async function* () {
            yield { type: "preparing" } as const;
          })(),
        };
      },
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);

    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("emits preparing and exactly one safe terminal error when admission execution throws before preparing", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return { kind: "admitted", execution: (async function* () { throw new Error("setup failed"); })() };
      },
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);

    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });
});

function principal() {
  return { userId: "user-1", sessionId: "session-1", roles: ["traveler" as const], authorizationVersion: 1, issuer: "xuyenviet-web-bff" as const, tokenId: "token-1" };
}

function concatenate(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
