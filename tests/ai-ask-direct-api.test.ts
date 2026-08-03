import { afterEach, describe, expect, test, vi } from "vitest";

import { loadTravelerShell, submitDirectAiAskStream } from "@/features/ai/direct-api-client";

describe("direct traveler API client", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test("uses relative cookie-authenticated shell reads", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ shell: { conversation: null, tripProject: null } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(loadTravelerShell("conversation-1")).resolves.toEqual({ shell: { conversation: null, tripProject: null } });
    expect(fetch).toHaveBeenCalledWith("/v1/conversations/shell?conversationId=conversation-1", expect.objectContaining({ credentials: "include" }));
  });

  test("obtains CSRF only for a direct stream mutation and preserves NDJSON events", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "a".repeat(43) }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"type":"preparing"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-1","content":"Đi Huế."}}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const events = await submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta: () => undefined });
    expect(events.map((event) => event.type)).toEqual(["preparing", "done"]);
    expect(fetch).toHaveBeenLastCalledWith("/v1/ai-ask/stream", expect.objectContaining({ credentials: "include", headers: expect.objectContaining({ "X-XuyenViet-CSRF": "a".repeat(43), "Idempotency-Key": "a".repeat(16) }) }));
  });

  test("delivers each validated NDJSON event once before the stream closes", async () => {
    const encoder = new TextEncoder();
    let releaseSecondChunk!: () => void;
    const secondChunk = new Promise<void>((resolve) => { releaseSecondChunk = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('{"type":"preparing"}\n{"type":"delta","content":"Xin"}\n'));
        await secondChunk;
        controller.enqueue(encoder.encode('{"type":"delta","content":" chào"}\n'));
        controller.close();
      },
    });
    const fetch = vi.fn().mockResolvedValueOnce(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const received: string[] = [];
    const submission = submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => received.push("preparing"), onDelta: (content) => received.push(content) });
    await vi.waitFor(() => expect(received).toEqual(["preparing", "Xin"]));
    releaseSecondChunk();
    await expect(submission).resolves.toMatchObject([{ type: "preparing" }, { type: "delta", content: "Xin" }, { type: "delta", content: " chào" }]);
    expect(received).toEqual(["preparing", "Xin", " chào"]);
  });

  test("rejects malformed NDJSON event shapes without delivering them", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"type":"delta","content":42}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const onDelta = vi.fn();
    await expect(submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta })).rejects.toThrow("Luồng trả lời bị gián đoạn trước khi hoàn tất.");
    expect(onDelta).not.toHaveBeenCalled();
  });
});
