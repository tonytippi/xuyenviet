import { eq } from "drizzle-orm";
import { AiAskAdmissionValidationError, type AiAskStreamAdmission, type AiAskStreamExecutionPort } from "@xuyenviet/domain";
import { consoleOperationalTelemetrySink, emitOperationalTelemetry, type AiAskStreamInput, type OperationalTelemetrySink, type RequestPrincipal } from "@xuyenviet/contracts";

import { acquireAiAskCommand, finalizeAiAskCommand, readAiAskCommandTerminalResult, terminalizeAiAskCommand } from "./ai-ask-commands";
import { ensureAiAskFreshnessWarning, requiresAiAskAnswerFinalization } from "./answer-freshness";
import { getDb } from "./client";
import { streamInitialAiAskAnswer } from "./gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "./models";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose, buildAiAskMessages } from "./prompts";
import { persistAssistantAnswerProvenance, type AssistantMessageProvenanceItem } from "./provenance";
import { conversations, messages, tripAnswerContextSnapshots } from "./schema";
import { assembleContextPrioritySourceBundle, renderSourceBundlePromptSection } from "./source-bundle";
import { writeAiUsageEvent } from "./usage";

type AiAskStreamTestDependencies = {
  assembleContextPrioritySourceBundle: typeof assembleContextPrioritySourceBundle;
  renderSourceBundlePromptSection: typeof renderSourceBundlePromptSection;
  buildSourceBundlePromptSection?: (bundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) => string;
};

const aiAskStreamTestDependenciesKey = Symbol.for("xuyenviet.aiAskStreamTestDependencies");

export function setAiAskStreamTestDependencies(dependencies: Partial<AiAskStreamTestDependencies> | undefined) {
  (globalThis as typeof globalThis & { [aiAskStreamTestDependenciesKey]?: Partial<AiAskStreamTestDependencies> })[aiAskStreamTestDependenciesKey] = dependencies;
}

function getAiAskStreamDependencies(): AiAskStreamTestDependencies {
  const overrides = (globalThis as typeof globalThis & { [aiAskStreamTestDependenciesKey]?: Partial<AiAskStreamTestDependencies> })[aiAskStreamTestDependenciesKey];
  return { assembleContextPrioritySourceBundle, renderSourceBundlePromptSection, ...overrides };
}

type StreamEvent =
  | { type: "preparing" }
  | { type: "delta"; content: string }
  | { type: "in_progress"; conversationId?: string; userMessage?: { id: string; content: string } }
  | { type: "done"; conversationId: string; userMessage: { id: string; content: string }; assistantMessage: { id: string; content: string; provenance?: AssistantMessageProvenanceItem[] } }
  | { type: "error"; code?: "refresh_required"; conversationId?: string; userMessage?: { id: string; content: string }; errorMessage: string };

type AuthenticatedSession = { userId: string; email: string };

/** The HTTP adapters share this port; persistence remains in the original fenced command closure below. */
export function createAiAskStreamExecutionPort(telemetry: OperationalTelemetrySink = consoleOperationalTelemetrySink): AiAskStreamExecutionPort {
  return {
    async admit(input: AiAskStreamInput, principal: RequestPrincipal, correlationId: string, signal: AbortSignal): Promise<AiAskStreamAdmission> {
      const acquisition = await acquireAiAskCommand({
        userId: principal.userId,
        idempotencyKey: input.idempotencyKey,
        question: input.question,
        conversationId: input.conversationId,
        tripProjectId: input.tripProjectId,
        image: input.image ?? null,
      });
      if (acquisition.kind === "validation_failure") throw new AiAskAdmissionValidationError(acquisition.message);
      if (acquisition.kind === "key_reused") throw new AiAskAdmissionValidationError("Idempotency-Key đã được dùng với nội dung khác. Hãy gửi yêu cầu mới.");
      if (acquisition.kind === "pending_replay") return { kind: "replay", event: { type: "in_progress", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage } };
      if (acquisition.kind === "terminal_replay") return { kind: "replay", event: acquisition.result as StreamEvent };

      let selectedModel: NonNullable<Awaited<ReturnType<typeof selectActiveAiGatewayModel>>> | null;
      try {
        selectedModel = await selectActiveAiGatewayModel({ purpose: aiAskInitialAnswerPurpose, requiredCapabilities: { textInput: true, streaming: true, imageInput: Boolean(input.image) } });
      } catch {
        const result: StreamEvent = { type: "error", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage, errorMessage: "Không thể chuẩn bị luồng trả lời lúc này. Hãy thử lại sau." };
        return { kind: "admitted", execution: eventsFromTerminal(acquisition.commandId, "failed", result) };
      }
      if (!selectedModel) {
        const result: StreamEvent = { type: "error", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage, errorMessage: input.image ? "Selected AI model does not support streaming image input." : "No active streaming AI Ask model is configured." };
        return { kind: "admitted", execution: eventsFromTerminal(acquisition.commandId, "failed", result) };
      }
      const imageDataUrl = input.image ? `data:${input.image.mimeType};base64,${Buffer.from(input.image.bytes).toString("base64")}` : null;
      return { kind: "admitted", execution: streamEvents({ abortSignal: signal, session: { userId: principal.userId, email: "" }, question: acquisition.question, tripProjectId: acquisition.tripProjectId ?? undefined, imageDataUrl, selectedModel, command: acquisition, correlationId, telemetry }) };
    },
  };
}

export const createLegacyAiAskStreamExecutionPort = createAiAskStreamExecutionPort;

async function* eventsFromTerminal(commandId: string, status: "failed", result: Extract<StreamEvent, { type: "error" }>): AsyncGenerator<StreamEvent> {
  yield { type: "preparing" };
  yield await terminalizeAiAskCommand(commandId, status, result) as StreamEvent;
}

async function* streamEvents(input: Omit<Parameters<typeof streamAnswer>[0], "sink">): AsyncGenerator<StreamEvent> {
  let event: StreamEvent | null = null;
  let finished = false;
  let cancelled = false;
  let wakeConsumer: (() => void) | null = null;
  let wakeProducer: (() => void) | null = null;
  const sink = {
    async emit(next: StreamEvent) {
      while (!cancelled && event !== null) await new Promise<void>((resolve) => { wakeProducer = resolve; });
      if (cancelled) return;
      event = next;
      wakeConsumer?.();
    },
    close() {
      finished = true;
      wakeConsumer?.();
    },
  };
  const producer = streamAnswer({
    ...input,
    sink,
  });
  // Keep the producer observed: a setup failure cannot become an unhandled rejection.
  void producer.catch(() => sink.close());
  try {
    while (!finished || event !== null) {
      if (event !== null) {
        const next = event;
        event = null;
        notify(wakeProducer);
        wakeProducer = null;
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => { wakeConsumer = resolve; });
      wakeConsumer = null;
    }
  } finally {
    cancelled = true;
    notify(wakeProducer);
    wakeProducer = null;
  }
}

function notify(wake: (() => void) | null) {
  if (wake) wake();
}

async function streamAnswer({
  sink,
  abortSignal,
  session,
  question,
  tripProjectId,
  imageDataUrl,
  selectedModel,
  command,
  correlationId,
  telemetry,
}: {
  sink: { emit(event: StreamEvent): Promise<void>; close(): void };
  abortSignal: AbortSignal;
  session: AuthenticatedSession;
  question: string;
  tripProjectId?: string;
  imageDataUrl: string | null;
  selectedModel: NonNullable<Awaited<ReturnType<typeof selectActiveAiGatewayModel>>>;
  command: Extract<Awaited<ReturnType<typeof acquireAiAskCommand>>, { kind: "admitted" }>;
  correlationId: string;
  telemetry: OperationalTelemetrySink;
}) {
  const db = getDb();
  const dependencies = getAiAskStreamDependencies();
  let saved: {
    conversationId: string;
    history: { role: "user" | "assistant"; content: string }[];
    userMessage: { id: string; content: string };
  } | null = null;

  try {
    saved = { conversationId: command.conversationId, history: command.history, userMessage: command.userMessage };

    await sink.emit({ type: "preparing" });

    const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);
    const sourceBundle = await dependencies.assembleContextPrioritySourceBundle({
      userId: session.userId,
      conversationId: saved.conversationId,
      tripProjectId,
      question,
      userMessageId: saved.userMessage.id,
      webSearchUsageContext: { userId: session.userId, conversationId: saved.conversationId, userMessageId: saved.userMessage.id, tripProjectId: tripProjectId ?? null },
      abortSignal,
    });
    const renderedSourceBundle = dependencies.buildSourceBundlePromptSection
      ? { section: dependencies.buildSourceBundlePromptSection(sourceBundle), tripContext: { version: 1 as const, aggregateVersion: null, included: [], excluded: [], conflicts: [], serialization: "{}", promptDigest: "0".repeat(64) }, promptUsage: { tripProjectFactIndexes: [], chatFactIndexes: [], knowledgeCardIds: [], webRanks: [], generalReasoningUsed: false } }
      : dependencies.renderSourceBundlePromptSection(sourceBundle);
    const contextSection = renderedSourceBundle.section;
    const gatewayMessages = buildAiAskMessages({ question, history: saved.history, contextSection });
    const finalGatewayMessages = imageDataUrl ? attachImageToFinalUserMessage(gatewayMessages, imageDataUrl) : gatewayMessages;
    const finalPolicyValidationRequired = requiresAiAskAnswerFinalization(sourceBundle);
    const gatewayResult = await streamInitialAiAskAnswer({
      model: selectedModel.gatewayModelName,
      messages: finalGatewayMessages,
      abortSignal,
      onDelta: async (content) => {
        // Policy-constrained material must pass final answer guards before it reaches the traveler.
        if (!finalPolicyValidationRequired) await sink.emit({ type: "delta", content });
      },
    });

    if (!gatewayResult.ok) {
      emitAiAskTelemetry(telemetry, correlationId, command.commandId, "failure", gatewayResult.latencyMs, gatewayResult.requestMetadata.providerRequestId ?? undefined);
      await writeAiUsageEvent(db, {
        initiatedByUserId: session.userId,
        executorSystem: "system-ai-orchestration",
        tripProjectId: tripProjectId ?? null,
        conversationId: saved.conversationId,
        userMessageId: saved.userMessage.id,
        purpose: aiAskInitialAnswerPurpose,
        provider: gatewayResult.provider,
        model: gatewayResult.model,
        aiGatewayModelId: selectedModel.id,
        promptVersion: aiAskInitialAnswerPromptVersion,
        status: "failure",
        latencyMs: gatewayResult.latencyMs,
        pricingSnapshot,
        errorCode: gatewayResult.errorCode,
        providerRequestId: gatewayResult.requestMetadata.providerRequestId,
      });

      const aborted = abortSignal.aborted || gatewayResult.errorCode === "client_stream_aborted";
      const result: StreamEvent = {
        type: "error",
        conversationId: saved.conversationId,
        userMessage: saved.userMessage,
        errorMessage: aborted
          ? "Luồng trả lời đã bị dừng. Tin nhắn của bạn đã được lưu nhưng chưa có câu trả lời trợ lý cho lượt này."
          : "Mình chưa tạo được câu trả lời hoàn chỉnh. Tin nhắn của bạn đã được lưu nhưng chưa có câu trả lời trợ lý cho lượt này.",
      };
      await sink.emit(await terminalizeAiAskCommand(command.commandId, aborted ? "aborted" : "failed", result) as StreamEvent);
      return;
    }

    if (abortSignal.aborted) {
      emitAiAskTelemetry(telemetry, correlationId, command.commandId, "failure", gatewayResult.latencyMs, gatewayResult.requestMetadata.providerRequestId ?? undefined);
      await writeAiUsageEvent(db, {
        initiatedByUserId: session.userId,
        executorSystem: "system-ai-orchestration",
        tripProjectId: tripProjectId ?? null,
        conversationId: saved.conversationId,
        userMessageId: saved.userMessage.id,
        purpose: aiAskInitialAnswerPurpose,
        provider: gatewayResult.provider,
        model: gatewayResult.model,
        aiGatewayModelId: selectedModel.id,
        promptVersion: aiAskInitialAnswerPromptVersion,
        status: "failure",
        latencyMs: gatewayResult.latencyMs,
        promptTokens: gatewayResult.usage.promptTokens,
        completionTokens: gatewayResult.usage.completionTokens,
        totalTokens: gatewayResult.usage.totalTokens,
        cachedPromptTokens: gatewayResult.usage.cachedPromptTokens,
        cacheWritePromptTokens: gatewayResult.usage.cacheWritePromptTokens,
        pricingSnapshot,
        errorCode: "client_stream_aborted",
        providerRequestId: gatewayResult.requestMetadata.providerRequestId,
      });
      const result: StreamEvent = {
        type: "error",
        conversationId: saved.conversationId,
        userMessage: saved.userMessage,
        errorMessage: "Luồng trả lời đã bị dừng. Tin nhắn của bạn đã được lưu nhưng chưa có câu trả lời trợ lý cho lượt này.",
      };
      await sink.emit(await terminalizeAiAskCommand(command.commandId, "aborted", result) as StreamEvent);
      return;
    }

    if (!saved) {
      throw new Error("Stream state was not initialized.");
    }

    const savedTurn = saved;
    const assistantContent = ensureAiAskFreshnessWarning(gatewayResult.content, sourceBundle);
    if (finalPolicyValidationRequired) {
      await sink.emit({ type: "delta", content: assistantContent.content });
    } else if (assistantContent.appendedWarning) {
      await sink.emit({ type: "delta", content: assistantContent.appendedWarning });
    }
    const finalization = await finalizeAiAskCommand(command.commandId, async (transaction, fencedCommand) => {
        const [assistantMessage] = await transaction
          .insert(messages)
          .values({ conversationId: fencedCommand.conversationId, userId: fencedCommand.userId, role: "assistant", content: assistantContent.content })
          .returning({ id: messages.id });

        await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, fencedCommand.conversationId));

        const [snapshot] = await transaction.insert(tripAnswerContextSnapshots).values({
          userId: fencedCommand.userId,
          conversationId: fencedCommand.conversationId,
          assistantMessageId: assistantMessage.id,
          tripProjectId: fencedCommand.tripProjectId,
          contextVersion: renderedSourceBundle.tripContext.version,
          aggregateVersion: renderedSourceBundle.tripContext.aggregateVersion,
          includedReferences: renderedSourceBundle.tripContext.included,
          excludedReferences: renderedSourceBundle.tripContext.excluded,
          conflicts: renderedSourceBundle.tripContext.conflicts,
          serialization: renderedSourceBundle.tripContext.serialization,
          promptDigest: renderedSourceBundle.tripContext.promptDigest,
        }).returning({ id: tripAnswerContextSnapshots.id });

        const provenance = await persistAssistantAnswerProvenance(transaction, {
          userId: fencedCommand.userId,
          conversationId: fencedCommand.conversationId,
          userMessageId: fencedCommand.userMessageId,
          assistantMessageId: assistantMessage.id,
          tripAnswerContextSnapshotId: snapshot.id,
          sourceBundle,
          promptUsage: renderedSourceBundle.promptUsage,
        });

        await writeAiUsageEvent(transaction, {
          initiatedByUserId: fencedCommand.userId,
          executorSystem: "system-ai-orchestration",
          tripProjectId: fencedCommand.tripProjectId,
          conversationId: fencedCommand.conversationId,
          userMessageId: fencedCommand.userMessageId,
          assistantMessageId: assistantMessage.id,
          tripAnswerContextSnapshotId: snapshot.id,
          purpose: aiAskInitialAnswerPurpose,
          provider: gatewayResult.provider,
          model: gatewayResult.model,
          aiGatewayModelId: selectedModel.id,
          promptVersion: aiAskInitialAnswerPromptVersion,
          status: "success",
          latencyMs: gatewayResult.latencyMs,
          promptTokens: gatewayResult.usage.promptTokens,
          completionTokens: gatewayResult.usage.completionTokens,
          totalTokens: gatewayResult.usage.totalTokens,
          cachedPromptTokens: gatewayResult.usage.cachedPromptTokens,
          cacheWritePromptTokens: gatewayResult.usage.cacheWritePromptTokens,
          pricingSnapshot,
          providerRequestId: gatewayResult.requestMetadata.providerRequestId,
        });
        const completed = { id: assistantMessage.id, content: assistantContent.content, provenance };
        return { assistantMessageId: assistantMessage.id, tripAnswerContextSnapshotId: snapshot.id, result: { type: "done" as const, conversationId: fencedCommand.conversationId, userMessage: savedTurn.userMessage, assistantMessage: completed }, completed };
      });

    if (!("discarded" in finalization)) {
          await sink.emit(await readAiAskCommandTerminalResult(command.commandId) as StreamEvent);
    } else {
       await sink.emit(finalization.result as StreamEvent);
    }
    emitAiAskTelemetry(telemetry, correlationId, command.commandId, "success", gatewayResult.latencyMs, gatewayResult.requestMetadata.providerRequestId ?? undefined);
  } catch {
    emitAiAskTelemetry(telemetry, correlationId, command.commandId, "failure", 0);
    console.error("AI Ask stream answer failed", {
      conversationId: saved?.conversationId,
      userMessageId: saved?.userMessage?.id,
    });

    const result: StreamEvent = {
      type: "error",
      conversationId: saved?.conversationId,
      userMessage: saved?.userMessage,
      errorMessage: "Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau.",
    };
    await sink.emit(await terminalizeAiAskCommand(command.commandId, abortSignal.aborted ? "aborted" : "failed", result) as StreamEvent);
  } finally {
    try {
      sink.close();
    } catch {
      // The client may have already closed the stream.
    }
  }
}

function emitAiAskTelemetry(sink: OperationalTelemetrySink, correlationId: string, commandId: string, resultCode: "success" | "failure", latencyMs: number, providerRequestId?: string, capability = "ai_ask.provider") {
  emitOperationalTelemetry(sink, { correlationId, capability, principalClass: "user", resultCode, latencyMs: Math.min(Math.max(0, Math.trunc(latencyMs)), 86_400_000), durableId: commandId, ...(providerRequestId ? { providerRequestId } : {}) });
}

function attachImageToFinalUserMessage(messagesForGateway: ReturnType<typeof buildAiAskMessages>, imageDataUrl: string) {
  return messagesForGateway.map((message, index) => {
    if (index !== messagesForGateway.length - 1 || message.role !== "user") {
      return message;
    }

    return {
      ...message,
      content: [
        { type: "text" as const, text: message.content },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ],
    };
  });
}
