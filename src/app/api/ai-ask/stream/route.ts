import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messageImageAttachments, messages } from "@/db/schema";
import { streamInitialAiAskAnswer } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "@/features/ai/models";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose, buildAiAskMessages } from "@/features/ai/prompts";
import { writeAiUsageEvent } from "@/features/usage/events";
import { getAuthenticatedSession } from "@/server/auth";

const maxQuestionLength = 2_000;
const maxImageByteSize = 5 * 1024 * 1024;
const maxMultipartBodySize = 6 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; conversationId: string; userMessage: { id: string; content: string }; assistantMessage: { id: string; content: string } }
  | { type: "error"; conversationId?: string; userMessage?: { id: string; content: string }; errorMessage: string };

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maxMultipartBodySize) {
    return Response.json({ error: "AI Ask submissions must be 6MB or smaller." }, { status: 413 });
  }

  const formData = await request.formData();
  const question = String(formData.get("question") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "").trim() || undefined;
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

  const selectedModel = await selectActiveAiGatewayModel({
    purpose: aiAskInitialAnswerPurpose,
    requiredCapabilities: { textInput: true, streaming: true, imageInput: Boolean(imageFile) },
  });

  if (!selectedModel) {
    return Response.json({ error: imageFile ? "Selected AI model does not support streaming image input." : "No active streaming AI Ask model is configured." }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void streamAnswer({ controller, encoder, abortSignal: request.signal, session, question, conversationId, imageFile, imageDataUrl: imageDataUrlResult.dataUrl, selectedModel });
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
  conversationId,
  imageFile,
  imageDataUrl,
  selectedModel,
}: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  abortSignal: AbortSignal;
  session: { userId: string };
  question: string;
  conversationId?: string;
  imageFile: File | null;
  imageDataUrl: string | null;
  selectedModel: NonNullable<Awaited<ReturnType<typeof selectActiveAiGatewayModel>>>;
}) {
  const db = getDb();
  let saved: {
    conversationId: string;
    history: { role: "user" | "assistant"; content: string }[];
    userMessage: { id: string; content: string };
  } | null = null;

  try {
    saved = await db.transaction(async (transaction) => {
      const [conversation] = conversationId
        ? await transaction
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
            .limit(1)
        : await transaction.insert(conversations).values({ userId: session.userId }).returning({ id: conversations.id });

      if (!conversation) {
        throw new Error("Conversation not found or access denied.");
      }

      const history = await transaction
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, session.userId)))
        .orderBy(asc(messages.createdAt), asc(messages.id));

      const [message] = await transaction
        .insert(messages)
        .values({ conversationId: conversation.id, userId: session.userId, role: "user", content: question })
        .returning({ id: messages.id });

      if (imageFile) {
        await transaction.insert(messageImageAttachments).values({
          conversationId: conversation.id,
          messageId: message.id,
          userId: session.userId,
          originalFileName: sanitizeOriginalFileName(imageFile.name),
          mimeType: imageFile.type,
          byteSize: imageFile.size,
          storageKey: null,
        });
      }

      await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

      return { conversationId: conversation.id, history, userMessage: { id: message.id, content: question } };
    });

    const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);
    const gatewayMessages = buildAiAskMessages({ question, history: saved.history });
    const finalGatewayMessages = imageDataUrl ? attachImageToFinalUserMessage(gatewayMessages, imageDataUrl) : gatewayMessages;
    const gatewayResult = await streamInitialAiAskAnswer({
      model: selectedModel.gatewayModelName,
      messages: finalGatewayMessages,
      onDelta: (content) => {
        if (abortSignal.aborted) {
          throw new Error("client_aborted_stream");
        }

        sendEvent(controller, encoder, { type: "delta", content });
      },
    });

    if (!gatewayResult.ok) {
      await writeAiUsageEvent(db, {
        userId: session.userId,
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
      });

      sendEvent(controller, encoder, {
        type: "error",
        conversationId: saved.conversationId,
        userMessage: saved.userMessage,
        errorMessage: "Mình chưa tạo được câu trả lời hoàn chỉnh. Tin nhắn của bạn đã được lưu nhưng chưa có câu trả lời trợ lý cho lượt này.",
      });
      return;
    }

    if (abortSignal.aborted) {
      await writeAiUsageEvent(db, {
        userId: session.userId,
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
        errorCode: "client_stream_aborted",
      });
      return;
    }

    if (!saved) {
      throw new Error("Stream state was not initialized.");
    }

    const savedTurn = saved;
    const completed = await db.transaction(async (transaction) => {
      const [assistantMessage] = await transaction
        .insert(messages)
        .values({ conversationId: savedTurn.conversationId, userId: session.userId, role: "assistant", content: gatewayResult.content })
        .returning({ id: messages.id });

      await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, savedTurn.conversationId));

      await writeAiUsageEvent(transaction, {
        userId: session.userId,
        conversationId: savedTurn.conversationId,
        userMessageId: savedTurn.userMessage.id,
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
      });

      return { id: assistantMessage.id, content: gatewayResult.content };
    });

    sendEvent(controller, encoder, { type: "done", conversationId: savedTurn.conversationId, userMessage: savedTurn.userMessage, assistantMessage: completed });
  } catch {
    sendEvent(controller, encoder, {
      type: "error",
      conversationId: saved?.conversationId,
      userMessage: saved?.userMessage,
      errorMessage: "Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau.",
    });
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
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
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

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, event: StreamEvent) {
  try {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  } catch {
    // The client may have already closed the stream.
  }
}
