import { eq } from "drizzle-orm";
import { after } from "next/server";

import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { acquireAiAskCommand, finalizeAiAskCommand, readAiAskCommandTerminalResult, terminalizeAiAskCommand, updateCompletedAiAskCommandTerminalResult } from "@/features/ai/ai-ask-commands";
import { buildValidatedAnswerAnnotations, sanitizeStoredAnswerAnnotations, type AnswerAnnotation } from "@/features/ai/answer-annotations";
import { ensureAiAskFreshnessWarning, requiresAiAskAnswerFinalization } from "@/features/ai/answer-freshness";
import { streamInitialAiAskAnswer } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "@/features/ai/models";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose, buildAiAskMessages } from "@/features/ai/prompts";
import { draftTripChangeProposal, recordTripChangeProposalDraftUsage, type UntrustedTripChangeProposalDraft } from "@/features/ai/trip-proposal-draft";
import { extractChatTripContext } from "@/features/chat-trips/context-extraction";
import { persistAiTripChangeProposalDraft } from "@/features/chat-trips/trip-change-proposals";
import { persistAssistantAnswerProvenance, type AssistantMessageProvenanceItem } from "@/features/retrieval/provenance";
import { assembleContextPrioritySourceBundle, buildSourceBundlePromptSection } from "@/features/retrieval/source-bundle";
import { writeAiUsageEvent } from "@/features/audit/usage";
import { getAuthenticatedSession, type AuthenticatedSession } from "@/server/auth";

const maxQuestionLength = 2_000;
const maxImageByteSize = 5 * 1024 * 1024;
const maxMultipartBodySize = 6 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const proposalDraftTimeoutMs = 20_000;

type ProposalDoneSummary = {
  proposalId: string;
  rationale: string;
  affectedItems: Array<{ itemId: string; kind: string; label: string; change: string }>;
  beforeAfter: Array<{ operation: string; before: string | null; after: string | null }>;
  alternatives: Array<{ summary: string }>;
  hasAlternatives: boolean;
  expiresAt: Date | null;
  status: string;
};

type StreamEvent =
  | { type: "preparing" }
  | { type: "delta"; content: string }
  | { type: "in_progress"; conversationId?: string; userMessage?: { id: string; content: string } }
  | { type: "done"; conversationId: string; userMessage: { id: string; content: string }; assistantMessage: { id: string; content: string; provenance?: AssistantMessageProvenanceItem[]; annotations?: AnswerAnnotation[] }; proposal?: ProposalDoneSummary }
  | { type: "error"; code?: "refresh_required"; conversationId?: string; userMessage?: { id: string; content: string }; errorMessage: string };

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maxMultipartBodySize) {
    return Response.json({ error: "AI Ask submissions must be 6MB or smaller." }, { status: 413 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const question = String(formData.get("question") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "").trim() || undefined;
  const tripProjectId = String(formData.get("tripProjectId") ?? "").trim() || undefined;
  const image = formData.get("image");

  if (!question || question.length > maxQuestionLength) {
    return Response.json({ error: "AI Ask question must be between 1 and 2000 characters." }, { status: 400 });
  }

  if (image !== null && !(image instanceof File)) {
    return Response.json({ error: "Invalid image attachment." }, { status: 400 });
  }

  const imageFile = image instanceof File ? image : null;
  const imageValidationError = validateImageFileMetadata(imageFile);

  if (imageValidationError) {
    return Response.json({ error: imageValidationError }, { status: 400 });
  }

  const imageDataUrlResult = imageFile ? await getValidatedImageDataUrl(imageFile) : { ok: true as const, dataUrl: null };

  if (!imageDataUrlResult.ok) {
    return Response.json({ error: imageDataUrlResult.error }, { status: 400 });
  }

  const acquisition = await acquireAiAskCommand({
    userId: session.userId,
    idempotencyKey: request.headers.get("idempotency-key"),
    question,
    conversationId,
    tripProjectId,
    image: imageFile ? { fileName: sanitizeOriginalFileName(imageFile.name), mimeType: imageFile.type, byteSize: imageFile.size, bytes: new Uint8Array(await imageFile.arrayBuffer()) } : null,
  });

  if (acquisition.kind === "validation_failure") return Response.json({ error: acquisition.message }, { status: 400 });
  if (acquisition.kind === "key_reused") return Response.json({ error: "Idempotency-Key đã được dùng với nội dung khác. Hãy gửi yêu cầu mới." }, { status: 409 });
  if (acquisition.kind === "pending_replay") return streamSingleEvent({ type: "in_progress", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage });
  if (acquisition.kind === "terminal_replay") return streamSingleEvent(acquisition.result as StreamEvent);

  let selectedModel: NonNullable<Awaited<ReturnType<typeof selectActiveAiGatewayModel>>> | null;
  try {
    selectedModel = await selectActiveAiGatewayModel({
      purpose: aiAskInitialAnswerPurpose,
      requiredCapabilities: { textInput: true, streaming: true, imageInput: Boolean(imageFile) },
    });
  } catch {
    const result: StreamEvent = { type: "error", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage, errorMessage: "Không thể chuẩn bị luồng trả lời lúc này. Hãy thử lại sau." };
    return streamPreparingThenTerminal(await terminalizeAiAskCommand(acquisition.commandId, "failed", result) as StreamEvent);
  }

  if (!selectedModel) {
    const result: StreamEvent = { type: "error", conversationId: acquisition.conversationId, userMessage: acquisition.userMessage, errorMessage: imageFile ? "Selected AI model does not support streaming image input." : "No active streaming AI Ask model is configured." };
    return streamPreparingThenTerminal(await terminalizeAiAskCommand(acquisition.commandId, "failed", result) as StreamEvent);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void streamAnswer({ controller, encoder, abortSignal: request.signal, session, question: acquisition.question, tripProjectId: acquisition.tripProjectId ?? undefined, imageDataUrl: imageDataUrlResult.dataUrl, selectedModel, command: acquisition });
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}

async function streamAnswer({
  controller,
  encoder,
  abortSignal,
  session,
  question,
  tripProjectId,
  imageDataUrl,
  selectedModel,
  command,
}: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  abortSignal: AbortSignal;
  session: AuthenticatedSession;
  question: string;
  tripProjectId?: string;
  imageDataUrl: string | null;
  selectedModel: NonNullable<Awaited<ReturnType<typeof selectActiveAiGatewayModel>>>;
  command: Extract<Awaited<ReturnType<typeof acquireAiAskCommand>>, { kind: "admitted" }>;
}) {
  const db = getDb();
  let saved: {
    conversationId: string;
    history: { role: "user" | "assistant"; content: string }[];
    userMessage: { id: string; content: string };
  } | null = null;

  try {
    saved = { conversationId: command.conversationId, history: command.history, userMessage: command.userMessage };

    sendEvent(controller, encoder, { type: "preparing" });

    const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);
    const sourceBundle = await assembleContextPrioritySourceBundle({
      userId: session.userId,
      conversationId: saved.conversationId,
      tripProjectId,
      question,
      userMessageId: saved.userMessage.id,
      webSearchUsageContext: { userId: session.userId, conversationId: saved.conversationId, userMessageId: saved.userMessage.id, tripProjectId: tripProjectId ?? null },
      abortSignal,
    });
    const contextSection = buildSourceBundlePromptSection(sourceBundle);
    const gatewayMessages = buildAiAskMessages({ question, history: saved.history, contextSection });
    const finalGatewayMessages = imageDataUrl ? attachImageToFinalUserMessage(gatewayMessages, imageDataUrl) : gatewayMessages;
    const finalPolicyValidationRequired = requiresAiAskAnswerFinalization(sourceBundle);
    const gatewayResult = await streamInitialAiAskAnswer({
      model: selectedModel.gatewayModelName,
      messages: finalGatewayMessages,
      abortSignal,
      onDelta: (content) => {
        // Policy-constrained material must pass final answer guards before it reaches the traveler.
        if (!finalPolicyValidationRequired) sendEvent(controller, encoder, { type: "delta", content });
      },
    });

    if (!gatewayResult.ok) {
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
      sendEvent(controller, encoder, await terminalizeAiAskCommand(command.commandId, aborted ? "aborted" : "failed", result) as StreamEvent);
      return;
    }

    if (abortSignal.aborted) {
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
      sendEvent(controller, encoder, await terminalizeAiAskCommand(command.commandId, "aborted", result) as StreamEvent);
      return;
    }

    if (!saved) {
      throw new Error("Stream state was not initialized.");
    }

    const savedTurn = saved;
    const assistantContent = ensureAiAskFreshnessWarning(gatewayResult.content, sourceBundle);
    if (finalPolicyValidationRequired) {
      sendEvent(controller, encoder, { type: "delta", content: assistantContent.content });
    } else if (assistantContent.appendedWarning) {
      sendEvent(controller, encoder, { type: "delta", content: assistantContent.appendedWarning });
    }
    const finalization = await finalizeAiAskCommand(command.commandId, async (transaction, fencedCommand) => {
        const [assistantMessage] = await transaction
          .insert(messages)
          .values({ conversationId: fencedCommand.conversationId, userId: fencedCommand.userId, role: "assistant", content: assistantContent.content })
          .returning({ id: messages.id });

        await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, fencedCommand.conversationId));

        const provenance = await persistAssistantAnswerProvenance(transaction, {
          userId: fencedCommand.userId,
          conversationId: fencedCommand.conversationId,
          userMessageId: fencedCommand.userMessageId,
          assistantMessageId: assistantMessage.id,
          sourceBundle,
          promptSection: contextSection,
        });

        await writeAiUsageEvent(transaction, {
          initiatedByUserId: fencedCommand.userId,
          executorSystem: "system-ai-orchestration",
          tripProjectId: fencedCommand.tripProjectId,
          conversationId: fencedCommand.conversationId,
          userMessageId: fencedCommand.userMessageId,
          assistantMessageId: assistantMessage.id,
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
        const completed = { id: assistantMessage.id, content: assistantContent.content, provenance, annotations: [] as AnswerAnnotation[] };
        return { assistantMessageId: assistantMessage.id, result: { type: "done" as const, conversationId: fencedCommand.conversationId, userMessage: savedTurn.userMessage, assistantMessage: completed }, completed };
      });

      if (!("discarded" in finalization)) {
       const completed = finalization.completed;
       let terminalResult = finalization.result as Extract<StreamEvent, { type: "done" }>;
        const extractionInput = savedTurn;
        after(() => extractChatTripContext({
          session,
          conversationId: extractionInput.conversationId,
          tripProjectId,
          userMessage: extractionInput.userMessage,
          history: extractionInput.history,
        }).catch((error) => {
          console.warn("Chat context extraction skipped after failure", {
            conversationId: extractionInput.conversationId,
            userMessageId: extractionInput.userMessage.id,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
        }));
      // The assistant/provenance/usage transaction is the durable success boundary.
      // A caller abort or optional follow-up failure after it commits cannot turn the
      // command into an aborted/no-answer result.
      try {
        completed.annotations = sanitizeStoredAnswerAnnotations({
          answerText: completed.content,
          annotations: await buildValidatedAnswerAnnotations({ answerText: completed.content, provenance: completed.provenance, model: selectedModel.gatewayModelName, abortSignal }),
          provenance: completed.provenance,
        });
      } catch (error) {
        console.warn("Failed to build answer annotations after assistant persistence.", {
          assistantMessageId: completed.id,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        });
      }
       if (completed.annotations.length > 0) {
         try {
           await db.update(messages).set({ answerAnnotations: completed.annotations }).where(eq(messages.id, completed.id));
           terminalResult = await updateCompletedAiAskCommandTerminalResult(command.commandId, {
             ...terminalResult,
             assistantMessage: { ...terminalResult.assistantMessage, annotations: completed.annotations },
           }) as Extract<StreamEvent, { type: "done" }>;
         } catch (error) {
          console.error("Failed to persist answer annotations.", { assistantMessageId: completed.id, error });
        }
      }
      // Proposal drafting is a non-durable follow-up. It starts only after the
      // matching fence has committed, so discarded commands never invoke it.
       const proposalSummary = tripProjectId
         ? await draftAndPersistProposal({ session, tripProjectId, question, assistantMessageId: completed.id, abortSignal })
         : undefined;
       if (proposalSummary) {
         terminalResult = await updateCompletedAiAskCommandTerminalResult(command.commandId, { ...terminalResult, proposal: proposalSummary }) as Extract<StreamEvent, { type: "done" }>;
       }
        // Optional work can overlap deletion, which scrubs this command's durable
        // projection. Publish the authoritative terminal result at the boundary.
        sendEvent(controller, encoder, await readAiAskCommandTerminalResult(command.commandId) as StreamEvent);
    } else {
      sendEvent(controller, encoder, finalization.result as StreamEvent);
    }
  } catch (error) {
    console.error("AI Ask stream answer failed", {
      conversationId: saved?.conversationId,
      userMessageId: saved?.userMessage?.id,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });

    const result: StreamEvent = {
      type: "error",
      conversationId: saved?.conversationId,
      userMessage: saved?.userMessage,
      errorMessage: "Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau.",
    };
    sendEvent(controller, encoder, await terminalizeAiAskCommand(command.commandId, abortSignal.aborted ? "aborted" : "failed", result) as StreamEvent);
  } finally {
    try {
      controller.close();
    } catch {
      // The client may have already closed the stream.
    }
  }
}

function validateImageFileMetadata(image: File | null) {
  if (!image) {
    return null;
  }

  if (!acceptedImageTypes.has(image.type)) {
    return "Image must be JPEG, PNG, or WebP.";
  }

  if (image.size <= 0 || image.size > maxImageByteSize) {
    return "Image must be 5MB or smaller.";
  }

  return null;
}

async function getValidatedImageDataUrl(image: File) {
  const buffer = Buffer.from(await image.arrayBuffer());

  if (!hasValidImageSignature(buffer, image.type)) {
    return { ok: false as const, error: "Image bytes do not match the declared file type." };
  }

  return { ok: true as const, dataUrl: `data:${image.type};base64,${buffer.toString("base64")}` };
}

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/jpeg") {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && (buffer[3] === 0xe0 || buffer[3] === 0xe1);
  }

  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  return false;
}

function sanitizeOriginalFileName(fileName: string) {
  const sanitized = fileName.replace(/[\u0000-\u001f\u007f\\/]+/g, " ").trim().slice(0, 120);

  return sanitized || null;
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

async function draftAndPersistProposal({
  session,
  tripProjectId,
  question,
  assistantMessageId,
  abortSignal,
}: {
  session: AuthenticatedSession;
  tripProjectId: string;
  question: string;
  assistantMessageId: string;
  abortSignal: AbortSignal;
}): Promise<ProposalDoneSummary | undefined> {
  const proposalAbort = new AbortController();
  const timeout = setTimeout(() => proposalAbort.abort(), proposalDraftTimeoutMs);
  const onExternalAbort = () => proposalAbort.abort();
  if (abortSignal.aborted) {
    proposalAbort.abort();
  } else {
    abortSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    let draft: UntrustedTripChangeProposalDraft;
    try {
      draft = await draftTripChangeProposal({ session, tripProjectId, question, abortSignal: proposalAbort.signal });
    } catch (error) {
      console.warn("Trip change proposal drafting failed or timed out", {
        tripProjectId,
        assistantMessageId,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
      return undefined;
    }

    if (!draft.ok) return undefined;

    await recordTripChangeProposalDraftUsage({ session, tripProjectId, draft });

    const draftExpiresAt = draft.expiresAt ? new Date(draft.expiresAt) : null;
    const expiresAtValid = draftExpiresAt instanceof Date
      && !Number.isNaN(draftExpiresAt.getTime())
      && draftExpiresAt.getTime() > Date.now();
    if (draft.expiresAt && !expiresAtValid) return undefined;

    const persistResult = await persistAiTripChangeProposalDraft({
      tripProjectId,
      expectedAggregateVersion: draft.expectedAggregateVersion,
      expectedItemVersions: draft.expectedItemVersions,
      operations: draft.operations,
      rationale: draft.rationale,
      alternatives: draft.alternatives,
      orderingPreconditions: draft.orderingPreconditions,
      expiresAt: expiresAtValid ? draftExpiresAt : null,
      sourceAssistantMessageId: assistantMessageId,
    });
    if (!persistResult.success) return undefined;

    const proposal = persistResult.proposal;
    return {
      proposalId: proposal.id,
      rationale: proposal.rationale,
      affectedItems: proposal.affectedItems,
      beforeAfter: proposal.beforeAfter,
      alternatives: proposal.alternatives,
      hasAlternatives: proposal.hasAlternatives,
      expiresAt: proposal.expiresAt,
      status: proposal.status,
    };
  } catch (error) {
    console.warn("Trip change proposal drafting failed unexpectedly", {
      tripProjectId,
      assistantMessageId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return undefined;
  } finally {
    clearTimeout(timeout);
    abortSignal.removeEventListener("abort", onExternalAbort);
  }
}

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, event: StreamEvent) {
  try {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  } catch {
    // The client may have already closed the stream.
  }
}

function streamSingleEvent(event: StreamEvent) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  }), { headers: { "cache-control": "no-store", "content-type": "application/x-ndjson; charset=utf-8" } });
}

function streamPreparingThenTerminal(event: StreamEvent) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ type: "preparing" })}\n`));
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  }), { headers: { "cache-control": "no-store", "content-type": "application/x-ndjson; charset=utf-8" } });
}
