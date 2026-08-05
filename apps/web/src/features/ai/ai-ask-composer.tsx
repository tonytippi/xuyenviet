"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import type { TripRecommendationResponse } from "@xuyenviet/contracts";

import { ConversationList, type ChatSessionSummary } from "@/features/chat-trips/conversation-list";
import { formatTripProjectLabel } from "@/features/chat-trips/labels";
import { answerUsefulnessCommentMaxLength, countAnswerUsefulnessCommentCharacters, type AnswerAnnotation, type AnswerAnnotationActionCapability, type AnswerUsefulnessFeedbackSummary, type AnswerUsefulnessRating, type AssistantMessageProvenanceItem, type AvailableAssistantMessageProvenanceItem, type TripWorkspaceReadModel } from "@/features/chat-trips/types";
import { tripChangeProposalLabels } from "@/features/chat-trips/trip-home-labels";
import { TripWorkspacePanel } from "@/features/ai/trip-workspace-panel";
import { acceptDirectTripCreationRecommendation, chooseDirectPrivateTripRecommendation, continueDirectInTrip, declineDirectTripCreationRecommendation, DirectApiError, loadTripRecommendations, submitDirectAiAskStream } from "@/features/ai/direct-api-client";
import { BrandMark } from "@/components/ui/brand-mark";
import { AccountIcon, AttachmentIcon, ChatIcon, CloseIcon, CostIcon, HotelAreaIcon, LoadingIcon, MenuIcon, NewChatIcon, PlaceIcon, ProjectIcon, RouteSegmentIcon, SendIcon, SourceIcon } from "@/components/ui/icons";

const maxQuestionLength = 2_000;
const maxImageByteSize = 5 * 1024 * 1024;
const previewMaxLength = 60;

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageAttachments?: Array<{
    id: string;
    originalFileName: string | null;
    mimeType: string;
    byteSize: number;
  }>;
  provenance?: AssistantMessageProvenanceItem[];
  annotations?: AnswerAnnotation[];
  feedback?: AnswerUsefulnessFeedbackSummary | null;
  consumerStatuses?: Array<{ category: "context_extraction" | "answer_annotation" | "trip_proposal_draft"; state: "pending" | "failed" }>;
};

export type AnswerEntityDescriptor = {
  type: AnswerAnnotation["type"];
  label: string;
  section?: string;
  summary?: string;
  sourceCategory?: AvailableAssistantMessageProvenanceItem["sourceCategory"];
  owner?: {
    table: string;
    id: string;
  };
  detail?: Record<string, string>;
  quickFacts?: Array<{ label: string; value: string }>;
  provenanceIds?: string[];
  annotationId?: string;
  assistantMessageId?: string;
  displayConversationId?: string;
  capability?: AnswerAnnotationActionCapability;
};

type TripProjectSummary = {
  id: string;
  title: string;
  conversationId?: string;
  origin: string | null;
  destination: string | null;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: string | null;
  updatedAt?: Date | string;
};

export type IdempotentAiAskSubmission = {
  payloadFingerprint: string;
  key: string;
  requestScope: {
    conversationId?: string;
    tripProjectId?: string;
  };
  adoptedConversationId?: string;
};

export function getIdempotentAiAskSubmission({
  previous,
  payloadFingerprint,
  conversationId,
  tripProjectId,
  createKey,
}: {
  previous: IdempotentAiAskSubmission | null;
  payloadFingerprint: string;
  conversationId?: string;
  tripProjectId?: string;
  createKey: () => string;
}): IdempotentAiAskSubmission {
  const keepsOriginalScope = previous?.requestScope.conversationId === conversationId
    || (!previous?.requestScope.conversationId && previous?.adoptedConversationId === conversationId);

  if (previous && previous.payloadFingerprint === payloadFingerprint && previous.requestScope.tripProjectId === tripProjectId && keepsOriginalScope) {
    return previous;
  }

  return { payloadFingerprint, key: createKey(), requestScope: { conversationId, tripProjectId } };
}

type DeleteConversationAction = (conversationId: string) => Promise<{ success: boolean; error?: string; reason?: "not_found" }>;
type CreateTripProjectAction = (title: string) => Promise<{ success: boolean; destination?: { tripProjectId: string } }>;
type DeleteTripProjectAction = (tripProjectId: string) => Promise<{ success: boolean; reason?: "not_found" }>;
// Story 7.5: typed server actions for owner-confirmed apply/dismiss.
// Q3: `transient` is a retryable DB/transport failure — the client maps it to a
// retryable "transient-error" outcome that keeps the action buttons enabled,
// distinct from the permanent refresh-required outcome that hides them.
type ApplyTripChangeProposalAction = (input: { tripProjectId: string; proposalId: string }) => Promise<{ success: boolean; reason?: "refresh_required" | "not_found" | "expired" | "transient"; aggregateVersion?: number; proposalStatus?: "applied"; error?: string }>;
type DismissTripChangeProposalAction = (input: { tripProjectId: string; proposalId: string }) => Promise<{ success: boolean; reason?: "not_found" | "expired" | "transient"; proposalStatus?: "dismissed"; error?: string }>;
type ExecuteAnnotationAction = (input: { conversationId: string; assistantMessageId: string; annotationId: string; command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss" }) => Promise<{ success: boolean; reason?: "refresh_required" | "not_found" | "expired" | "transient"; error?: string }>;
type SaveAnswerUsefulnessFeedbackAction = (input: { assistantMessageId: string; rating: AnswerUsefulnessRating; comment?: string | null }) => Promise<{ success: boolean; feedback?: AnswerUsefulnessFeedbackSummary; reason?: "unauthenticated" | "not_found" | "invalid_target" | "invalid_input" | "invalid_rating" | "comment_too_long" | "failed" }>;
type SignOutAction = () => Promise<void>;

const emptyMessages: DisplayMessage[] = [];
const emptySessions: ChatSessionSummary[] = [];
const emptyTripProjects: TripProjectSummary[] = [];

function buildCanonicalAiAskUrl(conversationId?: string, tripProjectId?: string, historyConversationId?: string) {
  const searchParams = new URLSearchParams();

  if (conversationId) searchParams.set("conversationId", conversationId);
  if (tripProjectId) searchParams.set("tripProjectId", tripProjectId);
  if (historyConversationId) searchParams.set("historyConversationId", historyConversationId);

  const query = searchParams.toString();
  return query ? `/ai-ask?${query}` : "/ai-ask";
}

const starterCards = [
  {
    title: "Lên route",
    description: "Hà Nội → Huế trong 5 ngày",
    Icon: NewChatIcon,
  },
  {
    title: "Tìm nơi ở",
    description: "khu nào tiện cho gia đình",
    Icon: ProjectIcon,
  },
  {
    title: "Điểm dừng",
    description: "nghỉ ăn, chơi nhẹ, trẻ em",
    Icon: ChatIcon,
  },
  {
    title: "Kiểm tra nguồn",
    description: "curated, official, web",
    Icon: SourceIcon,
  },
];

type AiAskComposerProps = {
  initialQuestion?: string;
  initialConversationId?: string;
  initialMessages?: DisplayMessage[];
  initialSessions?: ChatSessionSummary[];
  initialTripProjects?: TripProjectSummary[];
  selectedTripProject?: TripProjectSummary | null;
  historyConversation?: { id: string; messages: DisplayMessage[] } | null;
  tripWorkspace?: TripWorkspaceReadModel | null;
  supportsImageInput?: boolean;
  userEmail?: string;
  userName?: string | null;
  userImage?: string | null;
  canAccessAdmin?: boolean;
  recoveryNotice?: string;
  createTripProjectAction?: CreateTripProjectAction;
  deleteTripProjectAction?: DeleteTripProjectAction;
  deleteConversationAction?: DeleteConversationAction;
  applyTripChangeProposalAction?: ApplyTripChangeProposalAction;
  dismissTripChangeProposalAction?: DismissTripChangeProposalAction;
  executeAnnotationAction?: ExecuteAnnotationAction;
  saveAnswerUsefulnessFeedbackAction?: SaveAnswerUsefulnessFeedbackAction;
  refreshShellAction?: () => void;
  signOutAction?: SignOutAction;
};

export function AnswerUsefulnessFeedbackControl({
  messageId,
  feedback,
  pending,
  onSubmit,
}: {
  messageId: string;
  feedback?: AnswerUsefulnessFeedbackSummary | null;
  pending: boolean;
  onSubmit: (messageId: string, rating: AnswerUsefulnessRating, comment?: string | null) => void;
}) {
  const [comment, setComment] = useState(feedback?.comment ?? "");
  const selectedRating = feedback?.rating;

  useEffect(() => {
    setComment(feedback?.comment ?? "");
  }, [feedback?.comment, messageId]);

  return (
    <section className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#e6e6e6] pt-3" aria-label="Đánh giá câu trả lời">
      <span className="text-sm text-[#4f625a]">Câu trả lời này có hữu ích?</span>
      <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={selectedRating === "useful"}
            className="min-h-11 rounded-xl border border-[#8fb59f] bg-[#edf7f0] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-[#1f5f46] aria-pressed:text-white"
            disabled={pending}
            onClick={() => onSubmit(messageId, "useful", comment)}
            type="button"
          >
            Hữu ích
          </button>
          <button
            aria-pressed={selectedRating === "not_useful"}
            className="min-h-11 rounded-xl border border-[#d8c9ad] bg-[#fff8ec] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-[#8c4f13] aria-pressed:text-white"
            disabled={pending}
            onClick={() => onSubmit(messageId, "not_useful", comment)}
            type="button"
          >
            Chưa đúng ý
          </button>
        </div>
      {selectedRating === "not_useful" ? (
        <div className="w-full">
          <label className="text-sm font-semibold text-[#17342c]" htmlFor={`answer-feedback-comment-${messageId}`}>
            Ghi chú ngắn tuỳ chọn
          </label>
          <textarea
            className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#d8c9ad] bg-[#fffdf8] px-3 py-2 text-sm leading-6 text-[#17342c] outline-none transition motion-reduce:transition-none focus:border-[#1f5f46] focus:ring-4 focus:ring-[#8fb59f]/45"
            disabled={pending}
            id={`answer-feedback-comment-${messageId}`}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Ví dụ: thiếu thời gian di chuyển thực tế, hoặc gợi ý rất đúng nhu cầu gia đình."
            value={comment}
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[#6b7c75]">Tối đa {answerUsefulnessCommentMaxLength} ký tự. Không nhập thông tin nhạy cảm của trẻ em hoặc giấy tờ cá nhân.</p>
            <button
              className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white/80 px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              onClick={() => onSubmit(messageId, selectedRating, comment)}
              type="button"
            >
              Lưu ghi chú
            </button>
          </div>
        </div>
      ) : null}
      {pending ? <p aria-live="polite" className="text-sm font-semibold text-[#4f625a]">Đang lưu đánh giá...</p> : null}
    </section>
  );
}

function AiAskConsumerStatusNotice({ statuses }: { statuses?: DisplayMessage["consumerStatuses"] }) {
  const sortedStatuses = [...(statuses ?? [])].sort((left, right) => left.category.localeCompare(right.category) || left.state.localeCompare(right.state));
  const hasPending = sortedStatuses.some((status) => status.state === "pending");
  const hasFailed = sortedStatuses.some((status) => status.state === "failed");
  const notice = hasFailed
    ? "Một số chi tiết bổ sung chưa sẵn sàng. Bạn vẫn có thể dùng câu trả lời này và hỏi tiếp khi cần."
    : hasPending
      ? "Một số chi tiết bổ sung sẽ xuất hiện sau. Bạn vẫn có thể dùng câu trả lời này."
      : "";
  const statusKey = sortedStatuses.map((status) => `${status.category}:${status.state}`).join(",");
  const previousStatusKeyRef = useRef<string | undefined>(undefined);
  const [announcedNotice, setAnnouncedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (previousStatusKeyRef.current === undefined) {
      previousStatusKeyRef.current = statusKey;
      return;
    }
    if (previousStatusKeyRef.current !== statusKey) {
      previousStatusKeyRef.current = statusKey;
      setAnnouncedNotice(notice || "Các chi tiết lập kế hoạch tuỳ chọn đã được cập nhật.");
    }
  }, [notice, statusKey]);

  return (
    <>
      <p aria-live="polite" className="sr-only">{announcedNotice}</p>
      {notice ? (
          <section aria-label="Thông báo cho câu trả lời" className="mt-4">
           <p className="text-sm leading-6 text-[#6f3f12]">{notice}</p>
        </section>
      ) : null}
    </>
  );
}

function TripRecommendationPanel({ recommendation, pending, onAction }: { recommendation: TripRecommendationResponse; pending: boolean; onAction: (action: "private" | "decline" | "continue" | "accept", decisionId: string, tripProjectId?: string) => void }) {
  const creation = recommendation.tripCreationRecommendation;
  const context = recommendation.tripContextRecommendation;
  if (creation.kind === "none" && context.kind === "none") return null;
  const privateDecision = creation.kind === "offer" ? creation.decisionId : context.kind === "single" || context.kind === "multiple" ? context.decisionId : undefined;
  return (
    <section aria-label="Gợi ý cho chuyến đi" className="mx-auto w-full max-w-[760px] rounded-2xl border border-[#8fb59f] bg-[#edf7f0] p-4 text-[#17342c]">
      {context.kind === "single" ? <p className="text-sm leading-6">Bạn có muốn tiếp tục trong chuyến đi “{context.title}” không?</p> : null}
      {creation.kind === "clarify" ? <p className="text-sm leading-6">{creation.question}</p> : null}
      {context.kind === "clarify" ? <p className="text-sm leading-6">{context.question}</p> : null}
      {context.kind === "multiple" ? <p className="text-sm leading-6">Bạn có nhiều chuyến đi phù hợp. Bạn có thể tiếp tục hỏi riêng tại đây.</p> : null}
      {creation.kind === "offer" ? <p className="text-sm leading-6">Bạn có muốn lưu kế hoạch này thành một chuyến đi không?</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {context.kind === "single" ? <button className="min-h-11 rounded-xl bg-[#1f5f46] px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:opacity-60" disabled={pending} onClick={() => onAction("continue", context.decisionId, context.tripProjectId)} type="button">Tiếp tục trong chuyến đi</button> : null}
        {creation.kind === "offer" ? <button className="min-h-11 rounded-xl bg-[#1f5f46] px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:opacity-60" disabled={pending} onClick={() => onAction("accept", creation.decisionId)} type="button">Lưu chuyến đi</button> : null}
        {creation.kind === "offer" ? <button className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:opacity-60" disabled={pending} onClick={() => onAction("decline", creation.decisionId)} type="button">Không lưu</button> : null}
        {privateDecision ? <button className="min-h-11 rounded-xl border border-[#8fb59f] bg-white px-3 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:opacity-60" disabled={pending} onClick={() => onAction("private", privateDecision)} type="button">Trả lời riêng</button> : null}
      </div>
      {pending ? <p className="mt-2 text-sm" aria-live="polite">Đang cập nhật lựa chọn...</p> : null}
    </section>
  );
}

function getUnansweredUserMessageIds(messages: DisplayMessage[]) {
  const unansweredIds: string[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      unansweredIds.push(message.id);
      continue;
    }

    unansweredIds.length = 0;
  }

  return unansweredIds;
}

const assistantSectionHeadings = new Set([
  "Kế hoạch gợi ý",
  "Vì sao nên đi như vậy",
  "Lưu ý thực tế",
  "Bước tiếp theo",
  "Câu hỏi tiếp theo",
]);

function normalizeAssistantHeading(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/:$/, "")
    .trim();
}

function splitAssistantContent(content: string) {
  const sections: { heading?: string; headingStart?: number; headingEnd?: number; bodyLines: { line: string; start: number; end: number }[] }[] = [];
  const lines = content.split("\n");
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const trimmed = line.trim();
    const heading = normalizeAssistantHeading(trimmed);

    if (assistantSectionHeadings.has(heading)) {
      sections.push({ heading: trimmed, headingStart: lineStart, headingEnd: lineEnd, bodyLines: [] });
      offset = lineEnd + (index < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (sections.length === 0) {
      sections.push({ bodyLines: [] });
    }

    sections[sections.length - 1].bodyLines.push({ line, start: lineStart, end: lineEnd });
    offset = lineEnd + (index < lines.length - 1 ? 1 : 0);
  }

  return sections.map((section) => {
    const firstBodyLine = section.bodyLines[0];
    const lastBodyLine = section.bodyLines.at(-1);
    const rawBody = firstBodyLine && lastBodyLine ? content.slice(firstBodyLine.start, lastBodyLine.end) : "";
    const leadingTrimLength = rawBody.length - rawBody.trimStart().length;
    const body = rawBody.trim();
    const bodyStart = firstBodyLine ? firstBodyLine.start + leadingTrimLength : -1;
    const bodyEnd = body ? bodyStart + body.length : -1;

    return { heading: section.heading, headingStart: section.headingStart, headingEnd: section.headingEnd, body, bodyStart, bodyEnd };
  }).filter((section) => section.heading || section.body);
}

export function AssistantMessageContent({ messageId, displayConversationId, content, annotations, selectedEntityId, detailPanelIds, onSelectEntity }: { messageId?: string; displayConversationId?: string; content: string; annotations?: AnswerAnnotation[]; selectedEntityId?: string; detailPanelIds?: string; onSelectEntity?: (entity: AnswerEntityDescriptor, trigger: HTMLElement) => void }) {
  const sections = splitAssistantContent(content);
  const navigableSections = messageId ? sections.filter((section) => section.heading) : [];
  const safeAnnotations = normalizeDisplayAnnotations(content, annotations);

  if (sections.length <= 1 && !sections[0]?.heading) {
    return <p className="whitespace-pre-wrap text-base leading-7"><AnnotatedAnswerText messageId={messageId} displayConversationId={displayConversationId} content={content} annotations={safeAnnotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></p>;
  }

  return (
    <div className="space-y-4">
      {navigableSections.length > 0 ? (
        <nav aria-label="Các mục trong câu trả lời" className="-mx-1 overflow-x-auto pb-1">
          <ul className="flex w-max min-w-full gap-2 px-1">
            {navigableSections.map((section, index) => (
              <li key={`${section.heading}-${index}`}>
                <a className="block min-h-11 whitespace-nowrap rounded-full border border-[#8fb59f] bg-[#edf7f0] px-3 py-2 text-sm font-semibold text-[#14532d] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" href={`#answer-${messageId}-section-${index}`}>
                  {normalizeAssistantHeading(section.heading!)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {sections.map((section, index) => {
        const headingAnnotations = section.heading && section.headingStart !== undefined && section.headingEnd !== undefined ? safeAnnotations.filter((annotation) => annotation.start >= section.headingStart! && annotation.end <= section.headingEnd!).map((annotation) => ({ ...annotation, start: annotation.start - section.headingStart!, end: annotation.end - section.headingStart! })) : [];
        const sectionAnnotations = section.bodyStart >= 0 && section.bodyEnd >= 0 ? safeAnnotations.filter((annotation) => annotation.start >= section.bodyStart && annotation.end <= section.bodyEnd).map((annotation) => ({ ...annotation, start: annotation.start - section.bodyStart, end: annotation.end - section.bodyStart })) : [];

        return (
          <section className="scroll-mt-4" id={section.heading && messageId ? `answer-${messageId}-section-${navigableSections.indexOf(section)}` : undefined} key={`${section.heading || "intro"}-${index}`}>
            {section.heading ? <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]"><AnnotatedAnswerText messageId={messageId} displayConversationId={displayConversationId} content={section.heading} annotations={headingAnnotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></h3> : null}
            {section.body ? <p className="mt-2 whitespace-pre-wrap text-base leading-7"><AnnotatedAnswerText messageId={messageId} displayConversationId={displayConversationId} content={section.body} annotations={sectionAnnotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></p> : null}
          </section>
        );
      })}
    </div>
  );
}

function AnnotatedAnswerText({ messageId, displayConversationId, content, annotations, selectedEntityId, detailPanelIds, onSelectEntity }: { messageId?: string; displayConversationId?: string; content: string; annotations?: AnswerAnnotation[]; selectedEntityId?: string; detailPanelIds?: string; onSelectEntity?: (entity: AnswerEntityDescriptor, trigger: HTMLElement) => void }) {
  const validAnnotations = normalizeDisplayAnnotations(content, annotations);

  if (validAnnotations.length === 0) {
    return content;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const annotation of validAnnotations) {
    if (annotation.start > cursor) {
      parts.push(content.slice(cursor, annotation.start));
    }

    // Persisted actions are historic intent, not browser authority. Only the
    // owner-scoped read model may make one interactive by resolving a capability.
    if (annotation.type === "action" && !annotation.detail.capability?.available) {
      parts.push(annotation.text);
      cursor = annotation.end;
      continue;
    }

    const entity = createAnnotationAnswerEntityDescriptor(annotation, messageId, displayConversationId);
    const isSelected = Boolean(selectedEntityId && (entity.provenanceIds?.[0] === selectedEntityId || entity.annotationId === selectedEntityId));

    parts.push(
      <button
        aria-controls={detailPanelIds}
        aria-expanded={isSelected}
        aria-label={`Xem chi tiết: ${annotation.text}`}
        aria-pressed={isSelected}
        className={`mx-0.5 min-h-11 rounded-lg border px-1.5 py-0.5 text-left font-semibold underline decoration-2 underline-offset-4 transition motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 ${getAnnotationClassName(annotation)}`}
        key={annotation.id}
        onClick={(event) => onSelectEntity?.(entity, event.currentTarget)}
        type="button"
      >
        {annotation.text}
      </button>,
    );
    cursor = annotation.end;
  }

  if (cursor < content.length) {
    parts.push(content.slice(cursor));
  }

  return parts;
}

function normalizeDisplayAnnotations(content: string, annotations?: AnswerAnnotation[]) {
  const accepted: AnswerAnnotation[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const input = Array.isArray(annotations) ? annotations : [];
  const candidates = input.filter(isDisplayAnnotation);

  for (const annotation of input) {
    const id = getDisplayAnnotationId(annotation);
    if (!id) continue;
    if (seenIds.has(id)) duplicateIds.add(id);
    seenIds.add(id);
  }

  seenIds.clear();

  for (const annotation of candidates.slice().sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (!annotation.id || duplicateIds.has(annotation.id) || seenIds.has(annotation.id) || !annotation.detail || !Number.isInteger(annotation.start) || !Number.isInteger(annotation.end)) {
      continue;
    }

    if (annotation.start < 0 || annotation.end <= annotation.start || annotation.end > content.length || content.slice(annotation.start, annotation.end) !== annotation.text) {
      continue;
    }

    if (accepted.some((current) => annotation.start < current.end && annotation.end > current.start)) {
      continue;
    }

    seenIds.add(annotation.id);
    accepted.push(annotation);
  }

  return accepted;
}

function isDisplayAnnotation(value: unknown): value is AnswerAnnotation {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as AnswerAnnotation).id === "string"
    && typeof (value as AnswerAnnotation).start === "number"
    && typeof (value as AnswerAnnotation).end === "number";
}

function getDisplayAnnotationId(value: unknown) {
  return value && typeof value === "object" && typeof (value as AnswerAnnotation).id === "string"
    ? (value as AnswerAnnotation).id
    : undefined;
}

function createAnnotationAnswerEntityDescriptor(annotation: AnswerAnnotation, assistantMessageId?: string, displayConversationId?: string): AnswerEntityDescriptor {
  return {
    type: annotation.detail.type,
    label: annotation.detail.label,
    section: annotation.detail.section,
    summary: annotation.detail.summary,
    sourceCategory: annotation.detail.sourceCategory,
    owner: annotation.detail.owner,
    detail: annotation.detail.detail,
    quickFacts: annotation.detail.quickFacts,
    provenanceIds: annotation.detail.provenanceIds,
    annotationId: annotation.id,
    assistantMessageId,
    displayConversationId,
    capability: annotation.detail.capability,
  };
}

function getAnnotationClassName(annotation: AnswerAnnotation) {
  if (annotation.type === "warning") {
    return "border-[#e5bd82] bg-[#fff8ec] text-[#6f3f12] decoration-[#d9a65c]";
  }

  if (annotation.type === "trip_fact") {
    return "border-[#8fb59f] bg-[#edf7f0] text-[#14532d] decoration-[#1f5f46]";
  }

  if (annotation.type === "action") {
    return "border-[#cfd8d3] bg-[#f4f7f5] text-[#4f625a] decoration-dotted";
  }

  return "border-[#8fb59f] bg-white text-[#1f5f46] decoration-[#8fb59f]";
}

export function AssistantProvenanceBlock({ provenance, selectedEntityId, detailPanelIds, onSelectEntity }: { provenance?: AssistantMessageProvenanceItem[]; selectedEntityId?: string; detailPanelIds?: string; onSelectEntity?: (entity: AnswerEntityDescriptor, trigger: HTMLElement) => void }) {
  const visibleItems = provenance?.filter((item): item is AvailableAssistantMessageProvenanceItem | Extract<AssistantMessageProvenanceItem, { availability: "withdrawn" }> => item.availability === "withdrawn" || (item.sourceCategory !== "general" && (item.freshnessSensitive || item.verificationStatus === "unverified" || Boolean(getSafeTravelerUrl(item.url))))) ?? [];

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <section className="mt-4" aria-label="Thông tin cần kiểm tra">
      <ul className="space-y-2">
        {visibleItems.map((item) => {
          if (item.availability === "withdrawn") {
            return <li className="text-sm leading-6 text-[#6f3f12]" key={item.id}>Thông tin tham khảo này hiện không còn mở được. Hãy kiểm tra lại trước khi đi hoặc đặt dịch vụ.</li>;
          }
          const isSelected = selectedEntityId === item.id;
          const needsVerification = item.freshnessSensitive || item.verificationStatus === "unverified";
          const detailActionLabel = item.url ? "Xem nguồn tham khảo" : "Cần kiểm tra gì?";

          return (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6 text-[#6f3f12]" key={item.id}>
            <span>{needsVerification ? "Thông tin này có thể thay đổi. Kiểm tra lại trước khi đi hoặc đặt dịch vụ." : "Bạn có thể xem thông tin tham khảo trước khi quyết định."}</span>
            <button
              aria-controls={detailPanelIds}
              aria-expanded={isSelected}
              aria-label={`${detailActionLabel}: ${item.title}`}
              aria-pressed={isSelected}
              className="min-h-11 rounded-xl px-2 py-2 text-left font-semibold text-[#1f5f46] underline decoration-[#8fb59f] underline-offset-4 transition hover:bg-[#fff8ec] motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
              onClick={(event) => onSelectEntity?.(createProvenanceAnswerEntityDescriptor(item), event.currentTarget)}
              type="button"
            >
              {detailActionLabel}
            </button>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AnswerDetailPanel({ selectedEntity, panelId, panelRef, onClose, onExecuteAction, actionPending = false, actionsEnabled = true }: { selectedEntity: AnswerEntityDescriptor | null; panelId?: string; panelRef?: RefObject<HTMLDivElement | null>; onClose: () => void; onExecuteAction?: (entity: AnswerEntityDescriptor) => void; actionPending?: boolean; actionsEnabled?: boolean }) {
  if (!selectedEntity) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4 py-8" id={panelId} ref={panelRef} tabIndex={-1}>
        <div className="rounded-[1.5rem] border border-dashed border-[#d8c9ad] bg-white/75 p-5">
          <p className="text-sm font-bold text-[#17342c]">Chưa có chi tiết được chọn</p>
          <p className="mt-2 text-sm leading-6 text-[#4f625a]">
            Chọn một mục trong câu trả lời để xem thông tin hữu ích trước khi quyết định.
          </p>
        </div>
      </div>
    );
  }

  const detailEntries = selectedEntity.quickFacts ?? [];
  const travelerUrl = selectedEntity.detail?.URL ? getSafeTravelerUrl(selectedEntity.detail.URL) : null;
  const checkedDate = selectedEntity.detail?.["Ngày kiểm tra"];
  const DetailIcon = getAnswerEntityIcon(selectedEntity.type);

  return (
    <div aria-live="polite" className="flex flex-1 flex-col gap-4 overflow-y-auto py-4 focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" id={panelId} ref={panelRef} tabIndex={-1}>
      <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/85 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3ec] text-xl text-[#14532d]"><DetailIcon /></span>
            <div>
               <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#17342c]">{selectedEntity.label}</h3>
            </div>
          </div>
          <button
            aria-label="Đóng bảng chi tiết"
            className="min-h-11 rounded-xl border border-[#d8c9ad] bg-[#fffdf8] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#4f625a]">{selectedEntity.summary ?? formatAnswerEntitySummary(selectedEntity)}</p>
        {checkedDate ? <p className="mt-2 text-sm text-[#4f625a]">Kiểm tra lần cuối: {checkedDate}</p> : null}
        {travelerUrl ? <a className="mt-3 inline-flex min-h-11 items-center rounded-xl px-2 py-2 text-sm font-semibold text-[#1f5f46] underline decoration-[#8fb59f] underline-offset-4 transition hover:bg-[#edf7f0] motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" href={travelerUrl} rel="noreferrer" target="_blank">Mở nguồn tham khảo</a> : null}
      </div>

      {detailEntries.length > 0 ? (
        <section className="rounded-[1.5rem] border border-[#eadfc8] bg-white/75 p-4" aria-label="Thông tin nhanh">
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]">Thông tin nhanh</h4>
          <dl className="mt-3 space-y-3 text-sm leading-6">
            {detailEntries.map(({ label, value }, index) => (
              <div className="rounded-xl bg-[#fffdf8] p-3" key={`${label}-${index}`}>
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7c75]">{label}</dt>
                <dd className="mt-1 break-words font-semibold text-[#17342c]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {actionsEnabled && selectedEntity.capability && onExecuteAction ? <button className="min-h-11 rounded-xl bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60" disabled={actionPending} onClick={() => onExecuteAction(selectedEntity)} type="button">{actionPending ? "Đang cập nhật..." : selectedEntity.capability.command === "trip_change_proposal.apply" ? "Áp dụng đề xuất" : "Giữ kế hoạch hiện tại"}</button> : null}

    </div>
  );
}

function getFocusableElements(container: HTMLElement) {  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null && !element.closest("[inert], [aria-hidden='true']"));
}

export function AiAskComposer({
  initialQuestion = "",
  initialConversationId,
  initialMessages = emptyMessages,
  initialSessions = emptySessions,
  initialTripProjects = emptyTripProjects,
  selectedTripProject = null,
  historyConversation = null,
  tripWorkspace = null,
  supportsImageInput = false,
  userEmail,
  userName,
  userImage,
  canAccessAdmin = false,
  recoveryNotice,
  createTripProjectAction,
  deleteTripProjectAction,
  deleteConversationAction,
  applyTripChangeProposalAction,
  dismissTripChangeProposalAction,
  executeAnnotationAction,
  saveAnswerUsefulnessFeedbackAction,
  refreshShellAction,
  signOutAction,
}: AiAskComposerProps) {
  const router = useRouter();
  const activeTripProjectId = selectedTripProject?.id;
  const [question, setQuestion] = useState(initialQuestion);
  const [status, setStatus] = useState(initialMessages.length > 0 ? "Đã tải hội thoại. Bạn có thể tiếp tục kế hoạch." : selectedTripProject ? `Bạn đang lập kế hoạch trong dự án “${selectedTripProject.title}”.` : "Nhập câu hỏi về chuyến đi đường bộ của bạn.");
  const [isPending, setIsPending] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failedQuestionIds, setFailedQuestionIds] = useState<string[]>(() => getUnansweredUserMessageIds(initialMessages));
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>(initialSessions);
  const [tripProjects, setTripProjects] = useState<TripProjectSummary[]>(initialTripProjects);
  const [isSessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [feedbackPendingMessageId, setFeedbackPendingMessageId] = useState<string | null>(null);
  const [selectedAnswerEntity, setSelectedAnswerEntity] = useState<AnswerEntityDescriptor | null>(null);
  const [annotationActionPending, setAnnotationActionPending] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isWorkspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  // P9: plan history sheet state for mobile. Coordinates with the workspace
  // sheet so only one aria-modal dialog is open at a time.
  const [isPlanHistorySheetOpen, setPlanHistorySheetOpen] = useState(false);
  const [tripRecommendations, setTripRecommendations] = useState<TripRecommendationResponse | null>(null);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const planHistorySheetPanelRef = useRef<HTMLDivElement>(null);
  // Story 7.5: per-proposal pending action and terminal outcome state for the workspace panel.
  const [proposalPending, setProposalPending] = useState<Record<string, { action: "apply" | "dismiss" } | undefined>>({});
  const [proposalTerminalOutcome, setProposalTerminalOutcome] = useState<Record<string, "applied" | "dismissed" | "expired" | "refresh-required" | "transient-error" | null>>({});
  // Q4: synchronous in-flight dedup set. proposalPending is React state, so two
  // clicks in the same render cycle both pass the state guard. This ref is
  // checked and mutated synchronously before any await so the second click is
  // blocked immediately.
  const proposalInFlightRef = useRef<Set<string>>(new Set());
  const annotationActionInFlightRef = useRef(false);
  const sessionActionsDisabled = isPending || Boolean(deletingConversationId);
  const [projectActionPending, setProjectActionPending] = useState(false);
  const projectActionsDisabled = isPending || Boolean(deletingConversationId) || projectActionPending;
  const isHistoricReview = Boolean(historyConversation);
  const askFormDisabled = isPending || isHistoricReview;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const idempotencyKeyRef = useRef<IdempotentAiAskSubmission | null>(null);
  const acceptedCreationKeyRef = useRef<{ decisionId: string; key: string } | null>(null);
  const recommendationActionInFlightRef = useRef(false);
  const deletingConversationIdRef = useRef<string | null>(null);
  const deletingTripProjectIdRef = useRef<string | null>(null);
  const creatingTripProjectRef = useRef(false);
  const sessionSheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sessionSheetPanelRef = useRef<HTMLDivElement>(null);
  const sessionSheetPreviousFocusRef = useRef<HTMLElement | null>(null);
  const focusAfterNavigationRef = useRef<"composer" | "heading" | "selection" | null>(null);
  const scopeSelectionOriginRef = useRef<HTMLElement | null>(null);
  const mainHeadingRef = useRef<HTMLHeadingElement>(null);
  const mobileAnswerDetailDialogRef = useRef<HTMLDivElement>(null);
  const mobileAnswerDetailPanelRef = useRef<HTMLDivElement>(null);
  const desktopAnswerDetailPanelRef = useRef<HTMLDivElement>(null);
  const answerEntityTriggerRef = useRef<HTMLElement | null>(null);
  const workspaceSheetTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceSheetPanelRef = useRef<HTMLDivElement>(null);
  const workspaceSheetPreviousFocusRef = useRef<HTMLElement | null>(null);
  const planHistorySheetPreviousFocusRef = useRef<HTMLElement | null>(null);
  const hasMessages = messages.length > 0;
  const showEmptyState = !hasMessages && !isPending;
  const showContextPanel = hasMessages;
  const mobileAnswerDetailPanelId = "ai-ask-selected-answer-detail-mobile";
  const desktopAnswerDetailPanelId = "ai-ask-selected-answer-detail-desktop";
  const answerDetailPanelIds = `${mobileAnswerDetailPanelId} ${desktopAnswerDetailPanelId}`;
  const selectedAnswerEntityId = selectedAnswerEntity?.provenanceIds?.[0] ?? selectedAnswerEntity?.annotationId;
  const activeWorkspaceTitle = selectedTripProject
    ? formatTripProjectLabel(selectedTripProject)
    : conversationId
      ? sessions.find((session) => session.id === conversationId)?.preview ?? "Trò chuyện thường"
      : "Trò chuyện mới";
  const displayedMessages = historyConversation?.messages ?? messages;

  function reconcileSelection(nextConversationId?: string, nextTripProjectId?: string) {
    router.replace(buildCanonicalAiAskUrl(nextConversationId, nextTripProjectId));
    router.refresh();
  }

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    setIsDesktopViewport(desktopQuery.matches);

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsDesktopViewport(event.matches);
    }

    desktopQuery.addEventListener("change", handleViewportChange);
    return () => desktopQuery.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setTripProjects(initialTripProjects);
  }, [initialTripProjects]);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  useEffect(() => {
    setMessages(initialMessages);
    setConversationId(initialConversationId);
    setFailedQuestionIds(getUnansweredUserMessageIds(initialMessages));
    setSelectedAnswerEntity(null);
    answerEntityTriggerRef.current = null;
  }, [initialConversationId, initialMessages]);

  useEffect(() => {
    if (recoveryNotice) {
      setStatus(recoveryNotice);
      focusAfterNavigationRef.current = "selection";
    }
  }, [recoveryNotice]);

  useEffect(() => {
    let active = true;
    const confirmedOrdinaryConversationId = !selectedTripProject && !historyConversation ? initialConversationId : undefined;
    setTripRecommendations(null);
    acceptedCreationKeyRef.current = null;
    if (!confirmedOrdinaryConversationId) return () => { active = false; };
    void loadTripRecommendations(confirmedOrdinaryConversationId)
      .then((response) => { if (active) setTripRecommendations(response); })
      .catch(() => { if (active) setTripRecommendations(null); });
    return () => { active = false; };
  }, [historyConversation, initialConversationId, selectedTripProject]);

  useEffect(() => {
    const target = focusAfterNavigationRef.current;
    if (!target) return;
    focusAfterNavigationRef.current = null;
    const focusTarget = target === "heading"
      ? mainHeadingRef.current?.offsetParent !== null ? mainHeadingRef.current : textareaRef.current
      : target === "selection" && scopeSelectionOriginRef.current?.isConnected
        ? scopeSelectionOriginRef.current
        : textareaRef.current;
    focusTarget?.focus();
  }, [initialConversationId, selectedTripProject]);

  useEffect(() => {
    if (!selectedAnswerEntity) {
      return;
    }

    const panel = isDesktopViewport ? desktopAnswerDetailPanelRef.current : mobileAnswerDetailPanelRef.current;
    panel?.focus({ preventScroll: true });
  }, [isDesktopViewport, selectedAnswerEntity]);

  useEffect(() => {
    if (!selectedAnswerEntity) {
      return;
    }

    function handleDetailPanelShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;

      if (event.defaultPrevented || isSessionSheetOpen || isWorkspaceSheetOpen || isPlanHistorySheetOpen || isTyping || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeAnswerDetailPanel();
    }

    window.addEventListener("keydown", handleDetailPanelShortcut);
    return () => window.removeEventListener("keydown", handleDetailPanelShortcut);
  }, [isSessionSheetOpen, isWorkspaceSheetOpen, isPlanHistorySheetOpen, selectedAnswerEntity]);

  useEffect(() => {
    const activeDialog = mobileAnswerDetailDialogRef.current;
    const composer = textareaRef.current;

    if (!selectedAnswerEntity || isSessionSheetOpen || isWorkspaceSheetOpen || isPlanHistorySheetOpen || !activeDialog || isDesktopViewport) {
      return;
    }

    const dialog = activeDialog;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(dialog);

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;

      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
        const trigger = answerEntityTriggerRef.current;
        if (trigger?.isConnected) {
          trigger.focus();
        } else {
          composer?.focus();
        }
      }
    };
  }, [isDesktopViewport, isSessionSheetOpen, isWorkspaceSheetOpen, isPlanHistorySheetOpen, selectedAnswerEntity]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!selectedImage) {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedImage);
    setImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);

  useEffect(() => {
    if (!isSessionSheetOpen || isDesktopViewport) {
      return;
    }

    sessionSheetPreviousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    sessionSheetPanelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSessionSheetOpen(false);
        return;
      }

      if (event.key !== "Tab" || !sessionSheetPanelRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(sessionSheetPanelRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        sessionSheetPanelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !sessionSheetPanelRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!focusAfterNavigationRef.current) sessionSheetPreviousFocusRef.current?.focus();
    };
  }, [isDesktopViewport, isSessionSheetOpen]);

  useEffect(() => {
    if (!isWorkspaceSheetOpen || isDesktopViewport) {
      return;
    }

    workspaceSheetPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    workspaceSheetPanelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceSheetOpen(false);
        return;
      }

      if (event.key !== "Tab" || !workspaceSheetPanelRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(workspaceSheetPanelRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        workspaceSheetPanelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !workspaceSheetPanelRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previousFocus = workspaceSheetPreviousFocusRef.current;
      if (previousFocus && previousFocus.offsetParent !== null) {
        previousFocus.focus();
      }
    };
  }, [isDesktopViewport, isWorkspaceSheetOpen]);

  useEffect(() => {
    if (!isPlanHistorySheetOpen || isDesktopViewport) {
      return;
    }

    planHistorySheetPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    planHistorySheetPanelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPlanHistorySheetOpen(false);
        return;
      }

      if (event.key !== "Tab" || !planHistorySheetPanelRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(planHistorySheetPanelRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        planHistorySheetPanelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !planHistorySheetPanelRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previousFocus = planHistorySheetPreviousFocusRef.current;
      if (previousFocus && previousFocus.offsetParent !== null) {
        previousFocus.focus();
      }
    };
  }, [isDesktopViewport, isPlanHistorySheetOpen, selectedTripProject, tripWorkspace]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    if (deletingTripProjectIdRef.current) {
      setStatus("Vui lòng chờ thao tác xoá dự án chuyến đi hoàn tất trước khi gửi câu hỏi.");
      return;
    }

    const trimmedQuestion = question.trim();
    const imageError = validateSelectedImage(selectedImage);

    if (!trimmedQuestion) {
      setStatus("Vui lòng nhập câu hỏi trước khi gửi.");
      textareaRef.current?.focus();
      return;
    }

    if (trimmedQuestion.length > maxQuestionLength) {
      setStatus("Câu hỏi tối đa 2000 ký tự. Hãy rút gọn trước khi gửi.");
      textareaRef.current?.focus();
      return;
    }

    if (imageError) {
      setRecoveryMessage(imageError);
      setStatus(imageError);
      imageInputRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsPending(true);
    setIsPreparing(false);
    setRecoveryMessage(null);
    setPendingQuestion(trimmedQuestion);
    setStreamingContent("");
    setStatus(selectedImage ? "Đang kiểm tra ảnh và chuẩn bị luồng trả lời..." : "Đang gửi câu hỏi và chuẩn bị luồng trả lời...");

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const imageDigest = selectedImage ? await digestFileForIdempotency(selectedImage) : "";
      const payloadFingerprint = `${trimmedQuestion}\u0000${activeTripProjectId ?? ""}\u0000${selectedImage?.name ?? ""}\u0000${selectedImage?.type ?? ""}\u0000${selectedImage?.size ?? ""}\u0000${imageDigest}`;
      const submission = getIdempotentAiAskSubmission({
        previous: idempotencyKeyRef.current,
        payloadFingerprint,
        conversationId,
        tripProjectId: activeTripProjectId,
        createKey: () => crypto.randomUUID().replaceAll("-", ""),
      });
      idempotencyKeyRef.current = submission;
      const hadConversation = Boolean(submission.requestScope.conversationId || messages.length > 0);
      // Adoption updates the UI selection only; a retained logical submission must
      // keep its original scope so its idempotency key resolves the same command.
      const result = await submitAiAskStream({ question: trimmedQuestion, conversationId: submission.requestScope.conversationId, tripProjectId: submission.requestScope.tripProjectId, image: selectedImage, idempotencyKey: submission.key, signal: controller.signal, onPreparing: () => {
        if (activeRequestIdRef.current === requestId) {
          setIsPreparing(true);
          setStatus("Trợ lý đang chuẩn bị ngữ cảnh cho câu hỏi của bạn.");
        }
      }, onDelta: (content) => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        setIsPreparing(true);
        setStreamingContent((currentContent) => currentContent + content);
      } });

      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      if (result.status === "in-progress") {
        if (result.conversationId) {
          const newConversationId = result.conversationId;
          submission.adoptedConversationId = newConversationId;
          setConversationId(newConversationId);
          if (!hadConversation) {
            setSessions((currentSessions) => [summarizeSession(newConversationId, trimmedQuestion), ...currentSessions]);
          } else {
            setSessions((currentSessions) => moveSessionToTop(currentSessions, newConversationId));
          }
          reconcileSelection(newConversationId, activeTripProjectId);
        }
        setStatus("Yêu cầu này vẫn đang được xử lý. Hãy chờ kết quả hoàn tất.");
        setRecoveryMessage("Yêu cầu đang xử lý. Hãy chờ một lát trước khi gửi lại.");
        return;
      }

      if (result.status === "answer-failed") {
        const failedUserMessage = result.userMessage;

        if (result.code === "refresh_required") {
          setStreamingContent("");
          setFailedQuestionIds([]);
          setSelectedAnswerEntity(null);
          answerEntityTriggerRef.current = null;
          setStatus(result.errorMessage);
          setRecoveryMessage("Kế hoạch hoặc hội thoại đã thay đổi. Đã bỏ phần trả lời tạm thời và làm mới dữ liệu hiện tại.");
          reconcileSelection(conversationId, activeTripProjectId);
          return;
        }
        if (result.conversationId && failedUserMessage) {
          const newConversationId = result.conversationId;
          submission.adoptedConversationId = newConversationId;
          setConversationId(newConversationId);
          setFailedQuestionIds((currentIds) => currentIds.includes(failedUserMessage.id) ? currentIds : [...currentIds, failedUserMessage.id]);
          setMessages((currentMessages) => appendMessagesWithoutDuplicateIds(currentMessages, [
            { id: failedUserMessage.id, role: "user", content: failedUserMessage.content },
          ]));
          if (!hadConversation) {
            setSessions((currentSessions) => [summarizeSession(newConversationId, trimmedQuestion), ...currentSessions]);
          } else {
            setSessions((currentSessions) => moveSessionToTop(currentSessions, newConversationId));
          }
          reconcileSelection(newConversationId, activeTripProjectId);
        }
        if (result.conversationId && failedUserMessage) {
          setStatus(`${result.errorMessage} Chưa có câu trả lời trợ lý nào được lưu cho lượt này.`);
          setRecoveryMessage("Tin nhắn đã được lưu nhưng chưa có câu trả lời. Bạn có thể chỉnh câu hỏi rồi gửi lại.");
        } else {
          setStatus(`${result.errorMessage} Nội dung vẫn còn trong ô nhập để bạn thử lại.`);
          setRecoveryMessage("Không thể gửi yêu cầu. Nội dung của bạn vẫn còn trong ô nhập để thử lại.");
        }
        return;
      }

      setConversationId(result.conversationId);
      setMessages((currentMessages) => appendMessagesWithoutDuplicateIds(currentMessages, [
        { id: result.userMessage.id, role: "user", content: result.userMessage.content },
        { id: result.assistantMessage.id, role: "assistant", content: result.assistantMessage.content, provenance: result.assistantMessage.provenance, annotations: result.assistantMessage.annotations },
      ]));
      setQuestion("");
      setSelectedImage(null);
      idempotencyKeyRef.current = null;
      setStatus(hadConversation ? "Đã cập nhật hội thoại của bạn." : "Đã tạo câu trả lời đầu tiên cho chuyến đi của bạn.");
      if (!hadConversation) {
        setSessions((currentSessions) => [summarizeSession(result.conversationId, trimmedQuestion), ...currentSessions]);
      } else {
        setSessions((currentSessions) => moveSessionToTop(currentSessions, result.conversationId));
      }
      reconcileSelection(result.conversationId, activeTripProjectId);
    } catch (error) {
      if (activeRequestIdRef.current === requestId && !(error instanceof DOMException && error.name === "AbortError")) {
        if (error instanceof DirectApiError && ["unauthorized", "forbidden", "csrf_invalid"].includes(error.code ?? "")) {
          setStatus("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.");
          setRecoveryMessage("Phiên đăng nhập hoặc xác thực bảo mật đã hết hạn. Hãy đăng nhập lại, không gửi lại yêu cầu cũ.");
          return;
        }
        setStatus("Không thể gửi câu hỏi lúc này. Hãy kiểm tra đăng nhập và thử lại. Nội dung vẫn còn trong ô nhập.");
        setRecoveryMessage("Không thể gửi yêu cầu. Nội dung của bạn vẫn còn trong ô nhập để thử lại.");
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        isSubmittingRef.current = false;
        setIsPending(false);
        setIsPreparing(false);
        setPendingQuestion("");
        setStreamingContent("");
        abortControllerRef.current = null;
      }
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? []);

    if (!file) {
      setSelectedImage(null);
      return;
    }

    const imageError = validateSelectedImage(file);

    if (imageError) {
      setSelectedImage(null);
      event.target.value = "";
      setRecoveryMessage(imageError);
      setStatus(imageError);
      return;
    }

    setRecoveryMessage(null);
    setSelectedImage(file);
    setStatus(`Đã chọn ảnh “${file.name || "ảnh đính kèm"}”. Ảnh sẽ được kiểm tra quyền sở hữu trước khi gọi AI.`);
  }

  function clearSelectedImage() {
    setSelectedImage(null);
    setRecoveryMessage(null);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function clearActiveConversation() {
    setMessages([]);
    setConversationId(undefined);
    setQuestion("");
    setFailedQuestionIds([]);
    setSelectedImage(null);
    setSelectedAnswerEntity(null);
    answerEntityTriggerRef.current = null;
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    focusAfterNavigationRef.current = "composer";
    scopeSelectionOriginRef.current = null;
    router.push(buildCanonicalAiAskUrl());
  }

  function handleSelectSession(id: string) {
    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi đổi hội thoại.");
      return;
    }

    if (deletingConversationIdRef.current) {
      setStatus("Vui lòng chờ thao tác xoá cuộc trò chuyện hoàn tất trước khi đổi hội thoại.");
      return;
    }

    if (deletingTripProjectIdRef.current) {
      setStatus("Vui lòng chờ thao tác xoá dự án chuyến đi hoàn tất trước khi đổi hội thoại.");
      return;
    }

    if (isSessionSheetOpen) {
      sessionSheetPreviousFocusRef.current = textareaRef.current;
      setSessionSheetOpen(false);
    }
    router.push(activeTripProjectId ? buildCanonicalAiAskUrl(conversationId, activeTripProjectId, id) : buildCanonicalAiAskUrl(id));
  }

  async function handleDeleteSession(id: string) {
    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi xoá cuộc trò chuyện.");
      return;
    }

    if (!deleteConversationAction || deletingConversationIdRef.current) {
      return;
    }

    deletingConversationIdRef.current = id;
    setDeletingConversationId(id);
    setStatus("Đang xoá cuộc trò chuyện...");

    try {
      const result = await deleteConversationAction(id);

      if (!result.success) {
        if (result.reason === "not_found") {
          setSessions((currentSessions) => currentSessions.filter((session) => session.id !== id));
          if (id === conversationId) {
            setSessionSheetOpen(false);
            clearActiveConversation();
          }
          router.refresh();
        }
        setStatus(result.error ?? "Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại.");
        return;
      }

      setSessions((currentSessions) => currentSessions.filter((session) => session.id !== id));
      setSessionSheetOpen(false);

      if (id === conversationId) {
        clearActiveConversation();
      }

      setStatus("Đã xoá cuộc trò chuyện và các chi tiết đã ghi nhớ từ cuộc trò chuyện này.");
      router.refresh();
    } catch {
      setStatus("Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại.");
    } finally {
      deletingConversationIdRef.current = null;
      setDeletingConversationId(null);
    }
  }

  async function handleSubmitFeedback(messageId: string, rating: AnswerUsefulnessRating, comment?: string | null) {
    if (!saveAnswerUsefulnessFeedbackAction || feedbackPendingMessageId) {
      if (feedbackPendingMessageId && feedbackPendingMessageId !== messageId) {
        setStatus("Vui lòng chờ đánh giá hiện tại lưu xong trước khi đánh giá câu trả lời khác.");
      }
      return;
    }

    if (comment && countAnswerUsefulnessCommentCharacters(comment.trim()) > answerUsefulnessCommentMaxLength) {
      setStatus(`Ghi chú đánh giá tối đa ${answerUsefulnessCommentMaxLength} ký tự. Hãy rút gọn trước khi lưu.`);
      return;
    }

    setFeedbackPendingMessageId(messageId);
    setStatus("Đang lưu đánh giá câu trả lời...");

    try {
      const result = await saveAnswerUsefulnessFeedbackAction({ assistantMessageId: messageId, rating, comment });

      if (!result.success || !result.feedback) {
        if (result.reason === "comment_too_long") {
          setStatus(`Ghi chú đánh giá tối đa ${answerUsefulnessCommentMaxLength} ký tự. Hãy rút gọn trước khi lưu.`);
        } else {
          setStatus("Không thể lưu đánh giá cho câu trả lời này. Vui lòng thử lại.");
        }
        return;
      }

      setMessages((currentMessages) => currentMessages.map((message) => (
        message.id === messageId && message.role === "assistant" ? { ...message, feedback: result.feedback } : message
      )));
      setStatus("Đã lưu đánh giá câu trả lời. Bạn vẫn có thể tiếp tục chat hoặc mở nguồn.");
    } catch {
      setStatus("Không thể lưu đánh giá cho câu trả lời này. Vui lòng thử lại.");
    } finally {
      setFeedbackPendingMessageId(null);
    }
  }

  function handleNewChat() {
    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi mở cuộc trò chuyện mới.");
      return;
    }

    if (isSessionSheetOpen) {
      sessionSheetPreviousFocusRef.current = textareaRef.current;
      setSessionSheetOpen(false);
    }
    setMessages([]);
    setConversationId(undefined);
    setQuestion("");
    setStatus("Nhập câu hỏi về chuyến đi đường bộ của bạn.");
    setFailedQuestionIds([]);
    setSelectedImage(null);
    setSelectedAnswerEntity(null);
    setTripRecommendations(null);
    answerEntityTriggerRef.current = null;
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    focusAfterNavigationRef.current = "composer";
    router.push(buildCanonicalAiAskUrl());
  }

  function handleSelectAnswerEntity(entity: AnswerEntityDescriptor, trigger: HTMLElement) {
    answerEntityTriggerRef.current = trigger;
    setSelectedAnswerEntity(entity);
  }

  function closeAnswerDetailPanel() {
    setSelectedAnswerEntity(null);
    const trigger = answerEntityTriggerRef.current;
    answerEntityTriggerRef.current = null;

    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }

    textareaRef.current?.focus();
  }

  async function handleExecuteAnnotationAction(entity: AnswerEntityDescriptor) {
    if (annotationActionInFlightRef.current || annotationActionPending || !executeAnnotationAction || !entity.displayConversationId || !entity.assistantMessageId || !entity.annotationId || !entity.capability) return;
    annotationActionInFlightRef.current = true;
    setAnnotationActionPending(true);
    setStatus("Đang cập nhật đề xuất...");
    try {
      const result = await executeAnnotationAction({ conversationId: entity.displayConversationId, assistantMessageId: entity.assistantMessageId, annotationId: entity.annotationId, command: entity.capability.command });
      setStatus(result.success ? "Đã cập nhật đề xuất. Đang làm mới kế hoạch." : result.error ?? "Đề xuất không còn khả dụng.");
      if (result.success) {
        closeAnswerDetailPanel();
        router.refresh();
      }
    } catch {
      setStatus("Không thể cập nhật đề xuất lúc này. Vui lòng thử lại.");
    } finally {
      annotationActionInFlightRef.current = false;
      setAnnotationActionPending(false);
    }
  }

  function handleSelectTripProject(project: TripProjectSummary | null, origin?: HTMLElement) {
    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi đổi dự án chuyến đi.");
      return;
    }

    if (deletingTripProjectIdRef.current) {
      setStatus("Vui lòng chờ thao tác xoá dự án chuyến đi hoàn tất trước khi đổi dự án.");
      return;
    }

    if (isSessionSheetOpen) setSessionSheetOpen(false);
    setTripRecommendations(null);
    if (!project) {
      focusAfterNavigationRef.current = "composer";
      scopeSelectionOriginRef.current = null;
      router.push(buildCanonicalAiAskUrl());
      return;
    }
    if (!project.conversationId) {
      setStatus("Không thể mở chuyến đi này lúc này. Vui lòng thử lại.");
      return;
    }
    scopeSelectionOriginRef.current = origin ?? null;
    sessionSheetPreviousFocusRef.current = origin ?? null;
    focusAfterNavigationRef.current = "heading";
    setStatus("Đang mở chuyến đi đã chọn...");
    router.push(buildCanonicalAiAskUrl(project.conversationId, project.id));
  }

  async function handleCreateTripProject() {
    if (!createTripProjectAction || creatingTripProjectRef.current) return;
    const title = window.prompt("Tên chuyến đi mới");
    if (!title?.trim()) return;
    creatingTripProjectRef.current = true;
    setProjectActionPending(true);
    setStatus("Đang tạo chuyến đi...");
    try {
      const result = await createTripProjectAction(title.trim());
      if (!result.success || !result.destination) {
        setStatus("Không thể tạo chuyến đi lúc này. Vui lòng thử lại.");
        return;
      }
      focusAfterNavigationRef.current = "heading";
      router.push(buildCanonicalAiAskUrl(undefined, result.destination.tripProjectId));
      router.refresh();
    } catch {
      setStatus("Không thể tạo chuyến đi lúc này. Vui lòng thử lại.");
    } finally {
      creatingTripProjectRef.current = false;
      setProjectActionPending(false);
    }
  }

  async function handleDeleteTripProject() {
    if (!selectedTripProject || !deleteTripProjectAction || deletingTripProjectIdRef.current || !window.confirm(`Xóa chuyến đi “${selectedTripProject.title}”?`)) return;
    deletingTripProjectIdRef.current = selectedTripProject.id;
    setProjectActionPending(true);
    setStatus("Đang xóa chuyến đi...");
    try {
      const result = await deleteTripProjectAction(selectedTripProject.id);
      if (!result.success) {
        if (result.reason === "not_found") {
          setTripProjects((projects) => projects.filter((project) => project.id !== selectedTripProject.id));
          focusAfterNavigationRef.current = "composer";
          router.push(buildCanonicalAiAskUrl());
          router.refresh();
          return;
        }
        setStatus("Không thể xóa chuyến đi lúc này. Vui lòng thử lại.");
        return;
      }
      setTripProjects((projects) => projects.filter((project) => project.id !== selectedTripProject.id));
      focusAfterNavigationRef.current = "composer";
      router.push(buildCanonicalAiAskUrl());
      router.refresh();
    } catch {
      setStatus("Không thể xóa chuyến đi lúc này. Vui lòng thử lại.");
    } finally {
      deletingTripProjectIdRef.current = null;
      setProjectActionPending(false);
    }
  }

  async function handleRecommendationAction(action: "private" | "decline" | "continue" | "accept", decisionId: string, tripProjectId?: string) {
    if (recommendationActionInFlightRef.current || recommendationPending || selectedTripProject || isHistoricReview || !initialConversationId) return;
    recommendationActionInFlightRef.current = true;
    setRecommendationPending(true);
    setStatus("Đang cập nhật lựa chọn...");
    try {
      if (action === "private") {
        const result = await chooseDirectPrivateTripRecommendation({ decisionId });
        if (!result.success) return handleStaleRecommendation();
        setTripRecommendations(null);
        setStatus("Bạn có thể tiếp tục hỏi riêng trong cuộc trò chuyện này.");
        return;
      }
      if (action === "decline") {
        const result = await declineDirectTripCreationRecommendation({ decisionId });
        if (!result.success) return handleStaleRecommendation();
        setTripRecommendations(null);
        setStatus("Đã ghi nhận lựa chọn của bạn.");
        return;
      }
      if (action === "continue") {
        if (!tripProjectId) return;
        const result = await continueDirectInTrip({ decisionId, tripProjectId });
        if (!result.success) return handleStaleRecommendation();
        focusAfterNavigationRef.current = "heading";
        setTripRecommendations(null);
        router.push(buildCanonicalAiAskUrl(result.destination.conversationId, result.destination.tripProjectId));
        router.refresh();
        return;
      }
      const existing = acceptedCreationKeyRef.current;
      const key = existing?.decisionId === decisionId ? existing.key : crypto.randomUUID().replaceAll("-", "");
      acceptedCreationKeyRef.current = { decisionId, key };
      const result = await acceptDirectTripCreationRecommendation(decisionId, key);
      if (!result.success) {
        acceptedCreationKeyRef.current = null;
        return handleStaleRecommendation();
      }
      focusAfterNavigationRef.current = "heading";
      setTripRecommendations(null);
      router.push(buildCanonicalAiAskUrl(result.destination.conversationId, result.destination.tripProjectId));
      router.refresh();
    } catch {
      setStatus("Không thể cập nhật lựa chọn lúc này. Vui lòng thử lại.");
    } finally {
      recommendationActionInFlightRef.current = false;
      setRecommendationPending(false);
    }
  }

  function handleStaleRecommendation() {
    setTripRecommendations(null);
    refreshShellAction?.();
    setStatus("Lựa chọn này không còn khả dụng. Đang làm mới cuộc trò chuyện.");
  }

  // Story 7.5: owner-confirmed apply. Calls the server action, shows the
  // "Applying proposal" pending state (disable duplicate actions, announce via
  // aria-live), and on success reconciles via router.refresh() so the
  // server-loaded workspace (Trip Home focus, timeline, pending proposals,
  // plan history) reflects the new state. On refresh_required / not_found /
  // expired, preserve the proposal summary, show the stale/conflict copy, and
  // offer Làm mới đề xuất which focuses the primary conversation composer.
  async function handleApplyProposal(proposalId: string) {
    if (!activeTripProjectId || !applyTripChangeProposalAction) return;
    // Q4: proposalPending is React state, so two clicks within the same render
    // cycle both pass the guard and both call the action; the second call's
    // not_found (proposal now terminal) overwrites the first's applied outcome.
    // Use a ref Set for synchronous dedup so the second click is blocked before
    // any await.
    if (proposalInFlightRef.current.has(proposalId)) return;
    proposalInFlightRef.current.add(proposalId);
    setProposalPending((current) => ({ ...current, [proposalId]: { action: "apply" } }));
    setStatus("Đang áp dụng đề xuất...");
    try {
      const result = await applyTripChangeProposalAction({ tripProjectId: activeTripProjectId, proposalId });
      if (result.success) {
        setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "applied" }));
        setStatus("Đã áp dụng đề xuất. Đang làm mới kế hoạch.");
        router.refresh();
        focusOriginAfterTerminal(null);
      } else if (result.reason === "transient") {
        // Q3: retryable transient failure — keep the action buttons enabled so
        // the owner can try again. Do NOT use the permanent refresh-required
        // outcome (P4 keeps that permanent and hides the buttons).
        setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "transient-error" }));
        setStatus(result.error ?? "Không thể áp dụng đề xuất lúc này. Vui lòng thử lại.");
      } else {
        // P3: map expired to the expired terminal variant, not refresh-required.
        // An expired-on-apply proposal should show "Đã hết hạn" not "Làm mới đề xuất".
        if (result.reason === "expired") {
          setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "expired" }));
        } else {
          setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "refresh-required" }));
        }
        setStatus(result.error ?? "Kế hoạch đã thay đổi — vui lòng làm mới đề xuất.");
      }
    } catch {
      // Q3: a transport/network throw is also retryable — keep the buttons
      // enabled with a "try again" message, not the permanent refresh-required
      // outcome.
      setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "transient-error" }));
      setStatus("Không thể áp dụng đề xuất lúc này. Vui lòng thử lại.");
    } finally {
      proposalInFlightRef.current.delete(proposalId);
      setProposalPending((current) => {
        const next = { ...current };
        delete next[proposalId];
        return next;
      });
    }
  }

  // Story 7.5: owner-confirmed dismiss. Mirrors handleApplyProposal with the
  // dismiss action and terminal outcome.
  async function handleDismissProposal(proposalId: string) {
    if (!activeTripProjectId || !dismissTripChangeProposalAction) return;
    // Q4: synchronous ref dedup so two clicks in the same render cycle cannot
    // both call the dismiss action.
    if (proposalInFlightRef.current.has(proposalId)) return;
    proposalInFlightRef.current.add(proposalId);
    setProposalPending((current) => ({ ...current, [proposalId]: { action: "dismiss" } }));
    setStatus("Đang giữ kế hoạch...");
    try {
      const result = await dismissTripChangeProposalAction({ tripProjectId: activeTripProjectId, proposalId });
      if (result.success) {
        setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "dismissed" }));
        setStatus("Đã giữ kế hoạch. Đang làm mới.");
        router.refresh();
        focusOriginAfterTerminal(null);
      } else if (result.reason === "transient") {
        // Q3: retryable transient failure — keep the action buttons enabled.
        setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "transient-error" }));
        setStatus(result.error ?? "Không thể giữ kế hoạch lúc này. Vui lòng thử lại.");
      } else {
        setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "refresh-required" }));
        setStatus(result.error ?? "Đề xuất không còn khả dụng.");
      }
    } catch {
      // Q3: transport/network throw is retryable — keep the buttons enabled.
      setProposalTerminalOutcome((current) => ({ ...current, [proposalId]: "transient-error" }));
      setStatus("Không thể giữ kế hoạch lúc này. Vui lòng thử lại.");
    } finally {
      proposalInFlightRef.current.delete(proposalId);
      setProposalPending((current) => {
        const next = { ...current };
        delete next[proposalId];
        return next;
      });
    }
  }

  // Story 7.5: Làm mới đề xuất is an owner action that focuses the primary
  // conversation composer for a fresh question. It does NOT auto-regenerate,
  // does NOT call the AI gateway, and does NOT mutate plan state.
  // P4: do NOT clear proposalTerminalOutcome — keeping "refresh-required"
  // ensures the action row stays hidden so the user cannot click apply again
  // and loop on the same refresh_required. Just focus the composer.
  function handleRefreshProposal(proposalId: string) {
    void proposalId;
    setStatus("Hãy đặt câu hỏi mới để nhận đề xuất phù hợp với kế hoạch hiện tại.");
    textareaRef.current?.focus();
  }

  function handleQuestionChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(event.target.value);
    event.currentTarget.style.height = "0px";
    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
  }

  // Story 7.5: on terminal success, move focus back to the originating answer
  // card heading (answer surface) or the Trip Home focus card heading
  // (workspace panel) — 7.4 left this as a 7.5 hook.
  function focusOriginAfterTerminal(origin: HTMLElement | null) {
    if (origin?.isConnected) {
      const heading = origin.querySelector<HTMLHeadingElement>("[tabindex='-1']") ?? (origin as HTMLElement);
      heading?.focus?.();
      return;
    }
    const focusCard = document.querySelector<HTMLHeadingElement>('[aria-label="Tiêu điểm Trip Home"] [tabindex="-1"]');
    focusCard?.focus?.();
  }

  const accountName = userName?.trim() || userEmail?.split("@")[0] || "Tài khoản";
  const accountInitial = accountName.slice(0, 1).toLocaleUpperCase("vi-VN");

  const accountPrivacyLinks = (
    <details className="border-t border-[#e6e6e6] pt-3 text-left" aria-label="Tài khoản và quyền riêng tư">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#f1f1f1] focus:outline-none focus:ring-2 focus:ring-[#167c5a]">
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-9 rounded-full object-cover" src={userImage} />
        ) : (
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[#167c5a] text-sm font-semibold text-white">{accountInitial}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[#292929]">{accountName}</span>
          {userEmail ? <span className="block truncate text-xs text-[#858585]">{userEmail}</span> : null}
        </span>
        <span aria-hidden="true" className="text-sm text-[#858585]">...</span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {canAccessAdmin ? (
          <Link className="min-h-11 rounded-2xl bg-[#17342c] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#24483e] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href="/admin">
            Vào khu vực quản trị
          </Link>
        ) : null}
        <Link className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-[#fffdf8] px-4 py-3 text-center text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]" href="/#quyen-rieng-tu">
          Tìm hiểu thêm về quyền riêng tư
        </Link>
        {signOutAction ? <form action={signOutAction}><button className="min-h-11 w-full rounded-2xl border border-[#d8c9ad] bg-white px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-[#fff8ec] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]" type="submit">Đăng xuất</button></form> : null}
      </div>
    </details>
  );

  return (
    <div className="flex min-h-[100dvh] bg-white text-[#202020]">
      <nav aria-label="Danh sách trò chuyện và dự án chuyến đi" className={`${isSidebarCollapsed ? "hidden" : "lg:flex"} hidden min-h-[100dvh] w-[264px] shrink-0 flex-col gap-4 border-r border-[#e6e6e6] bg-[#f9f9f9] p-3`}>
        <div className="flex items-center justify-between">
          <Link className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-[15px] font-semibold tracking-[-0.025em] focus:outline-none" href="/">
            <BrandMark className="size-8" />
            XuyenViet
          </Link>
          <button
            aria-label="Thu gọn thanh bên"
            className="grid size-9 place-items-center rounded-lg text-[#666] transition hover:bg-[#ededed] focus:outline-none focus:ring-2 focus:ring-[#167c5a]"
            onClick={() => setSidebarCollapsed(true)}
            type="button"
          >
            <MenuIcon />
          </button>
        </div>
        <section aria-labelledby="trip-project-list-heading">
          <h2 className="px-2 text-[11px] font-medium text-[#777]" id="trip-project-list-heading">Chuyến đi</h2>
          <div className="mt-2 flex flex-col gap-1">
            <button aria-current={!selectedTripProject ? "page" : undefined} className={!selectedTripProject ? "min-h-11 rounded-xl bg-[#e5eeea] px-3 py-2 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" : "min-h-11 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#303030] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#167c5a]"} disabled={projectActionsDisabled} onClick={(event) => handleSelectTripProject(null, event.currentTarget)} type="button">Hỏi XuyenViet</button>
            {tripProjects.map((project) => <button aria-current={project.id === activeTripProjectId ? "page" : undefined} className={project.id === activeTripProjectId ? "min-h-11 rounded-xl bg-[#e5eeea] px-3 py-2 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" : "min-h-11 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#303030] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#167c5a]"} disabled={projectActionsDisabled} key={project.id} onClick={(event) => handleSelectTripProject(project, event.currentTarget)} type="button">{project.title}</button>)}
          </div>
          {createTripProjectAction ? <button className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-[#8fb59f] px-3 py-2 text-left text-sm font-semibold text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" disabled={projectActionsDisabled} onClick={handleCreateTripProject} type="button">Tạo chuyến đi</button> : null}
          {selectedTripProject && deleteTripProjectAction ? <button className="mt-2 min-h-11 w-full rounded-xl border border-[#f0c8a0] px-3 py-2 text-left text-sm font-semibold text-[#8c4f13] focus:outline-none focus:ring-2 focus:ring-[#8c4f13]" disabled={projectActionsDisabled} onClick={handleDeleteTripProject} type="button">Xóa chuyến đi này</button> : null}
        </section>
        <div className="min-h-0 flex-1 border-t border-[#e6e6e6] pt-4">
          <ConversationList
            sessions={sessions}
            activeConversationId={conversationId}
            isDisabled={sessionActionsDisabled}
            onSelect={handleSelectSession}
            onDelete={deleteConversationAction ? handleDeleteSession : undefined}
            onNewChat={handleNewChat}
          />
        </div>
        {accountPrivacyLinks}
      </nav>

       <div className={`flex min-h-[100dvh] min-w-0 flex-1 flex-col justify-between gap-5 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 ${isSidebarCollapsed ? "lg:pl-[76px]" : "lg:max-w-[calc(100%-264px)]"}`}>
        {isSidebarCollapsed ? (
          <aside aria-label="Thanh công cụ thu gọn" className="fixed inset-y-0 left-0 z-10 hidden w-[60px] flex-col items-center border-r border-[#e6e6e6] bg-[#f9f9f9] py-3 lg:flex">
            <button
              aria-label="Mở thanh bên"
              className="grid size-10 place-items-center rounded-lg text-[#555] transition hover:bg-[#ededed] focus:outline-none focus:ring-2 focus:ring-[#167c5a]"
              onClick={() => setSidebarCollapsed(false)}
              type="button"
            >
              <MenuIcon />
            </button>
            <button
               aria-label="Hỏi XuyenViet"
              className="mt-3 grid size-10 place-items-center rounded-lg text-[#555] transition hover:bg-[#ededed] focus:outline-none focus:ring-2 focus:ring-[#167c5a]"
              disabled={sessionActionsDisabled}
              onClick={handleNewChat}
               title="Hỏi XuyenViet"
              type="button"
            >
              <NewChatIcon />
            </button>
            <button
              aria-label="Mở chuyến đi"
              className="mt-2 grid size-10 place-items-center rounded-lg text-[#555] transition hover:bg-[#ededed] focus:outline-none focus:ring-2 focus:ring-[#167c5a]"
              onClick={() => setSidebarCollapsed(false)}
              title="Chuyến đi"
              type="button"
            >
              <ProjectIcon />
            </button>
            <button
              aria-label="Mở tài khoản"
              className="mt-auto grid size-10 place-items-center rounded-full transition hover:ring-2 hover:ring-[#167c5a] focus:outline-none focus:ring-2 focus:ring-[#167c5a]"
              onClick={() => setSidebarCollapsed(false)}
              title={accountName}
              type="button"
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="size-9 rounded-full object-cover" src={userImage} />
              ) : (
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[#167c5a] text-sm font-semibold text-white">{accountInitial}</span>
              )}
            </button>
          </aside>
        ) : null}
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <button
            ref={sessionSheetTriggerRef}
            type="button"
            onClick={() => {
              setSelectedAnswerEntity(null);
              answerEntityTriggerRef.current = null;
              setWorkspaceSheetOpen(false);
              setPlanHistorySheetOpen(false);
              setSessionSheetOpen(true);
            }}
            aria-label="Mở danh sách trò chuyện, dự án chuyến đi và tài khoản"
            className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white/75 px-4 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
          >
            Danh sách trò chuyện
          </button>
          <h2 ref={mainHeadingRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[#17342c]" aria-label={`Không gian đang mở: ${activeWorkspaceTitle}`}>
            {activeWorkspaceTitle}
          </h2>
          {selectedTripProject && tripWorkspace ? (
            <button
              ref={workspaceSheetTriggerRef}
              type="button"
              onClick={() => {
                setSelectedAnswerEntity(null);
                answerEntityTriggerRef.current = null;
                setSessionSheetOpen(false);
                setPlanHistorySheetOpen(false);
                setWorkspaceSheetOpen(true);
              }}
              aria-label="Mở không gian dự án chuyến đi"
              className="min-h-11 rounded-2xl border border-[#8fb59f] bg-[#edf7f0] px-4 py-2 text-sm font-semibold text-[#14532d] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
            >
              Kế hoạch
            </button>
          ) : null}
          <Link
            aria-label="Tài khoản và quyền riêng tư"
            className="grid min-h-11 min-w-11 place-items-center rounded-2xl border border-[#d8c9ad] bg-white/75 text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
            href="/#quyen-rieng-tu"
          >
            <AccountIcon />
          </Link>
        </div>

        {selectedTripProject && !isHistoricReview ? (
          <p className="mx-auto w-full max-w-[760px] rounded-xl bg-[#edf7f2] px-3 py-2 text-sm text-[#285c49]">
            Đang lên kế hoạch cho: {selectedTripProject.title}
          </p>
        ) : null}

        {isHistoricReview ? (
          <section className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center gap-4 py-8" aria-label="Lịch sử trao đổi">
            <p className="w-fit rounded-full border border-[#d8c9ad] bg-[#fff8ec] px-4 py-2 text-sm font-semibold text-[#8c4f13]">Lịch sử trao đổi</p>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-[#17342c]">Đang xem hội thoại trước đây</h2>
            <p className="text-base leading-7 text-[#4f625a]">Hội thoại này chỉ để xem lại. Tiếp tục lập kế hoạch trong hội thoại chính của dự án.</p>
            <button className="min-h-11 w-fit rounded-2xl bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" onClick={() => router.push(buildCanonicalAiAskUrl(conversationId, activeTripProjectId))} type="button">Tiếp tục trong hội thoại chính</button>
          </section>
        ) : null}

        {showEmptyState && !isHistoricReview ? (
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center gap-4 py-8 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.05em] text-[#202020] sm:text-5xl">Mình sẽ đi đâu?</h2>

        </div>
        ) : null}

        <div className="space-y-5">
          {displayedMessages.length > 0 ? (
            <section aria-label="Lịch sử hội thoại" className="mx-auto max-w-[760px] space-y-4">
              {displayedMessages.map((message) => (
                <article
                  className={
                    message.role === "assistant"
                      ? "py-3 text-[#282828]"
                      : "ml-auto rounded-2xl bg-[#f1f1f1] p-4 text-[#292929] sm:max-w-[80%]"
                  }
                  key={message.id}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
                    {message.role === "assistant" ? "Trợ lý XuyenViet" : "Bạn"}
                  </p>
                  {message.role === "assistant" ? (
                    <>
                       <AssistantMessageContent messageId={message.id} displayConversationId={isHistoricReview ? historyConversation?.id : conversationId} content={message.content} annotations={message.annotations} selectedEntityId={selectedAnswerEntityId} detailPanelIds={answerDetailPanelIds} onSelectEntity={handleSelectAnswerEntity} />
                      <AiAskConsumerStatusNotice statuses={message.consumerStatuses} />
                      <AssistantProvenanceBlock provenance={message.provenance} selectedEntityId={selectedAnswerEntityId} detailPanelIds={answerDetailPanelIds} onSelectEntity={handleSelectAnswerEntity} />
                      {saveAnswerUsefulnessFeedbackAction ? (
                        <AnswerUsefulnessFeedbackControl
                          feedback={message.feedback}
                          messageId={message.id}
                          onSubmit={handleSubmitFeedback}
                          pending={feedbackPendingMessageId === message.id}
                        />
                      ) : null}
                    </>
                  ) : <p className="whitespace-pre-wrap text-base leading-7">{message.content}</p>}
                  {message.role === "user" && message.imageAttachments && message.imageAttachments.length > 0 ? (
                    <p className="mt-2 rounded-lg bg-white/15 text-xs font-semibold uppercase tracking-[0.12em]">
                      Đã kèm ảnh: {message.imageAttachments.map((attachment) => attachment.originalFileName || "ảnh đính kèm").join(", ")}
                    </p>
                  ) : null}
                  {failedQuestionIds.includes(message.id) ? (
                    <div className="mt-3 rounded-2xl border border-[#f0c8a0] bg-[#fff7ed] p-3 text-sm leading-6 text-[#6f3f12]" role="status">
                      Trợ lý chưa tạo được câu trả lời cho lượt này. Tin nhắn của bạn đã được lưu; hãy chỉnh câu hỏi trong ô nhập rồi gửi lại khi sẵn sàng.
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}

          {isPreparing ? (
            <section aria-live="polite" className="mx-auto max-w-[760px] rounded-[1.5rem] border border-dashed border-[#d8c9ad] bg-[#fffdf8] p-4 text-[#17342c] shadow-[0_12px_30px_rgba(41,33,18,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f46]">Đang chuẩn bị câu trả lời</p>
              <p className="mt-2 text-base font-semibold">Bạn có thể chờ trong cuộc trò chuyện này.</p>
              <p className="mt-2 text-sm leading-6 text-[#4f625a]">
                Nội dung đang nhận chỉ là tạm thời cho đến khi câu trả lời hoàn tất.
              </p>
              {pendingQuestion ? <p className="mt-3 rounded-2xl bg-white/80 p-3 text-sm leading-6 text-[#4f625a]">“{pendingQuestion}”</p> : null}
              {streamingContent ? (
                <div className="mt-3 rounded-2xl border border-[#d8c9ad] bg-white/90 p-3 text-sm leading-6 text-[#17342c]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f46]">Bản nháp đang nhận</p>
                  <p className="whitespace-pre-wrap">{streamingContent}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {!selectedTripProject && !isHistoricReview && tripRecommendations ? <TripRecommendationPanel recommendation={tripRecommendations} pending={recommendationPending} onAction={handleRecommendationAction} /> : null}

           {!isHistoricReview ? <form className="relative mx-auto max-w-[760px] rounded-2xl border border-[#d8d8d8] bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)]" onSubmit={handleSubmit} ref={formRef}>
            <label className="sr-only" htmlFor="ai-ask-question">
              Câu hỏi của bạn
            </label>
            <textarea
              className={`h-12 max-h-44 w-full resize-none rounded-xl border-0 bg-transparent py-3 text-base leading-6 text-[#282828] outline-none placeholder:text-[#8a8a8a] ${supportsImageInput ? "pl-16 pr-16" : "px-3 pr-16"}`}
              disabled={askFormDisabled}
              aria-describedby="ai-ask-status"
              id="ai-ask-question"
              maxLength={maxQuestionLength + 1}
              onChange={handleQuestionChange}
              onKeyDown={handleKeyDown}
              placeholder="Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình nên dừng ở đâu?"
              ref={textareaRef}
              rows={1}
              value={question}
            />
            {supportsImageInput ? (
              <label
                aria-label="Đính kèm ảnh tham khảo"
                className={`absolute bottom-5 left-5 grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-[#4f5a55] transition hover:bg-[#edf7f2] hover:text-[#167c5a] focus-within:outline-none focus-within:ring-2 focus-within:ring-[#167c5a] ${askFormDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                htmlFor="ai-ask-image"
                title="Đính kèm ảnh"
              >
                <AttachmentIcon />
                <span className="sr-only">Đính kèm ảnh tham khảo tuỳ chọn</span>
              </label>
            ) : null}
            {supportsImageInput ? (
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={askFormDisabled}
                id="ai-ask-image"
                onChange={handleImageChange}
                ref={imageInputRef}
                type="file"
              />
            ) : null}
            <button
              aria-label={isPending ? "Đang gửi câu hỏi" : "Gửi câu hỏi"}
              className="absolute bottom-5 right-5 grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#202020] text-white transition hover:bg-[#383838] motion-reduce:transition-none active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#a3a3a3] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
              disabled={askFormDisabled}
              title="Gửi câu hỏi"
              type="submit"
            >
              {isPending ? <LoadingIcon /> : <SendIcon />}
            </button>
            {selectedImage ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#fffdf8] px-3 py-2 text-sm text-[#4f625a]">
                <div className="flex min-w-0 items-center gap-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={selectedImage.name || "ảnh đính kèm"} className="h-9 w-9 shrink-0 rounded-lg border border-[#d8c9ad] object-cover" src={imageUrl} />
                  ) : null}
                  <span className="truncate">{selectedImage.name || "Ảnh đính kèm"} ({formatImageSize(selectedImage.size)})</span>
                </div>
                <button aria-label="Bỏ ảnh đính kèm" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#4f625a] transition hover:bg-[#fff1ed] hover:text-[#8c2f1d] focus:outline-none focus:ring-4 focus:ring-[#f0c8a0]" disabled={askFormDisabled} onClick={clearSelectedImage} title="Bỏ ảnh" type="button">
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            {recoveryMessage ? <p className="mt-3 rounded-xl border border-[#f0c8a0] bg-[#fff7ed] px-3 py-2 text-sm leading-6 text-[#6f3f12]" role="status">{recoveryMessage}</p> : null}
            <p aria-live="polite" className="sr-only" id="ai-ask-status">
              {isPending ? "Đang gửi, vui lòng chờ" : status}
            </p>
          </form> : null}

          {showEmptyState && !isHistoricReview ? (
            <>
                <div className="mx-auto grid max-w-[760px] gap-2 sm:grid-cols-2" aria-label="Gợi ý câu hỏi bắt đầu">
                {starterCards.map(({ Icon, ...card }) => (
                  <button
                    className="grid min-h-[68px] grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-[#e6e6e6] bg-[#fafafa] p-3 text-left transition hover:bg-[#f3f3f3]"
                    key={card.title}
                    onClick={() => {
                      if (askFormDisabled) {
                        return;
                      }

                      if (question.trim()) {
                        setStatus("Ô nhập đã có nội dung. Hãy xoá hoặc chỉnh câu hỏi hiện tại trước khi dùng gợi ý bắt đầu.");
                        textareaRef.current?.focus();
                        return;
                      }

                      setQuestion(card.description);
                      textareaRef.current?.focus();
                    }}
                    disabled={askFormDisabled}
                    type="button"
                  >
                    <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf7f2] text-lg text-[#167c5a]"><Icon /></span>
                    <span>
                      <span className="block text-sm font-medium text-[#303030]">{card.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[#777]">{card.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {isSessionSheetOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Danh sách trò chuyện và dự án chuyến đi">
            <button
              type="button"
              aria-label="Đóng danh sách trò chuyện"
              onClick={() => setSessionSheetOpen(false)}
              className="absolute inset-0 bg-[#17342c]/40"
            />
            <div ref={sessionSheetPanelRef} tabIndex={-1} className="absolute left-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto rounded-r-[1.5rem] border-r border-[#d8c9ad] bg-[#fffdf8] p-3 shadow-[0_24px_80px_rgba(41,33,18,0.24)]">
                <button
                  type="button"
                  aria-label="Đóng danh sách trò chuyện"
                  onClick={() => setSessionSheetOpen(false)}
                  className="mb-3 min-h-11 w-full rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
                >
                  Đóng danh sách
                </button>
                <section aria-labelledby="mobile-trip-project-list-heading" className="mb-4">
                  <h2 className="px-2 text-[11px] font-medium text-[#777]" id="mobile-trip-project-list-heading">Chuyến đi</h2>
                  <div className="mt-2 flex flex-col gap-1">
                    <button aria-current={!selectedTripProject ? "page" : undefined} className={!selectedTripProject ? "min-h-11 rounded-xl bg-[#e5eeea] px-3 py-2 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" : "min-h-11 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#303030] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#167c5a]"} disabled={projectActionsDisabled} onClick={(event) => handleSelectTripProject(null, event.currentTarget)} type="button">Hỏi XuyenViet</button>
                    {tripProjects.map((project) => <button aria-current={project.id === activeTripProjectId ? "page" : undefined} className={project.id === activeTripProjectId ? "min-h-11 rounded-xl bg-[#e5eeea] px-3 py-2 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" : "min-h-11 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#303030] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#167c5a]"} disabled={projectActionsDisabled} key={project.id} onClick={(event) => handleSelectTripProject(project, event.currentTarget)} type="button">{project.title}</button>)}
                  </div>
                  {createTripProjectAction ? <button className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-[#8fb59f] px-3 py-2 text-left text-sm font-semibold text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a]" disabled={projectActionsDisabled} onClick={handleCreateTripProject} type="button">Tạo chuyến đi</button> : null}
                  {selectedTripProject && deleteTripProjectAction ? <button className="mt-2 min-h-11 w-full rounded-xl border border-[#f0c8a0] px-3 py-2 text-left text-sm font-semibold text-[#8c4f13] focus:outline-none focus:ring-2 focus:ring-[#8c4f13]" disabled={projectActionsDisabled} onClick={handleDeleteTripProject} type="button">Xóa chuyến đi này</button> : null}
                </section>
                <ConversationList
                  sessions={sessions}
                  activeConversationId={conversationId}
                  isDisabled={sessionActionsDisabled}
                  onSelect={handleSelectSession}
                  onDelete={deleteConversationAction ? handleDeleteSession : undefined}
                  onNewChat={handleNewChat}
                />
                <div className="mt-3">
                  {accountPrivacyLinks}
                </div>
            </div>
          </div>
        ) : null}

        {showContextPanel && selectedAnswerEntity && !isSessionSheetOpen && !isWorkspaceSheetOpen ? (
          <div ref={mobileAnswerDetailDialogRef} tabIndex={-1} className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Bảng chi tiết đã chọn">
            <button
              type="button"
              aria-label="Đóng bảng chi tiết đã chọn"
              onClick={closeAnswerDetailPanel}
              className="absolute inset-0 bg-[#17342c]/40"
            />
            <section className="absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_-24px_80px_rgba(41,33,18,0.24)]" aria-label="Chi tiết nguồn hoặc cảnh báo đã chọn">
              <AnswerDetailPanel selectedEntity={selectedAnswerEntity} panelId={mobileAnswerDetailPanelId} panelRef={mobileAnswerDetailPanelRef} onClose={closeAnswerDetailPanel} onExecuteAction={executeAnnotationAction ? handleExecuteAnnotationAction : undefined} actionPending={annotationActionPending} actionsEnabled={!isHistoricReview} />
            </section>
          </div>
        ) : null}

        {isWorkspaceSheetOpen && selectedTripProject && tripWorkspace ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Không gian dự án chuyến đi">
            <button
              type="button"
              aria-label="Đóng không gian dự án chuyến đi"
              onClick={() => setWorkspaceSheetOpen(false)}
              className="absolute inset-0 bg-[#17342c]/40"
            />
            <div ref={workspaceSheetPanelRef} tabIndex={-1} className="absolute right-0 top-0 h-full w-96 max-w-[90%] overflow-y-auto rounded-l-[1.5rem] border-l border-[#d8c9ad] bg-[#fffdf8] p-4 shadow-[-24px_0_80px_rgba(41,33,18,0.24)]">
              <button
                type="button"
                aria-label="Đóng không gian dự án chuyến đi"
                onClick={() => setWorkspaceSheetOpen(false)}
                className="mb-3 min-h-11 w-full rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
              >
                Đóng không gian dự án
              </button>
              <TripWorkspacePanel
                idPrefix="sheet-"
                header={{
                  title: selectedTripProject.title,
                  origin: selectedTripProject.origin,
                  destination: selectedTripProject.destination,
                  startDate: selectedTripProject.startDate ?? null,
                  endDate: selectedTripProject.endDate ?? null,
                  travelers: selectedTripProject.travelers ?? null,
                }}
                workspace={tripWorkspace}
                onApplyProposal={applyTripChangeProposalAction ? handleApplyProposal : undefined}
                onDismissProposal={dismissTripChangeProposalAction ? handleDismissProposal : undefined}
                onRefreshProposal={handleRefreshProposal}
                proposalPending={proposalPending}
                proposalTerminalOutcome={proposalTerminalOutcome}
                planHistoryVariant={isDesktopViewport ? "inline" : "sheet-trigger"}
                onOpenPlanHistory={() => {
                  setSelectedAnswerEntity(null);
                  answerEntityTriggerRef.current = null;
                  setSessionSheetOpen(false);
                  setWorkspaceSheetOpen(false);
                  setPlanHistorySheetOpen(true);
                }}
              />
            </div>
          </div>
        ) : null}

        {isPlanHistorySheetOpen && selectedTripProject && tripWorkspace ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={tripChangeProposalLabels.planHistory}>
            <button
              type="button"
              aria-label={`Đóng ${tripChangeProposalLabels.planHistory}`}
              onClick={() => setPlanHistorySheetOpen(false)}
              className="absolute inset-0 bg-[#17342c]/40"
            />
            <div ref={planHistorySheetPanelRef} tabIndex={-1} className="absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_-24px_80px_rgba(41,33,18,0.24)]">
              <button
                type="button"
                aria-label={`Đóng ${tripChangeProposalLabels.planHistory}`}
                onClick={() => setPlanHistorySheetOpen(false)}
                className="mb-3 min-h-11 w-full rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
              >
                Đóng lịch sử kế hoạch
              </button>
              <TripWorkspacePanel
                idPrefix="history-sheet-"
                header={{
                  title: selectedTripProject.title,
                  origin: selectedTripProject.origin,
                  destination: selectedTripProject.destination,
                  startDate: selectedTripProject.startDate ?? null,
                  endDate: selectedTripProject.endDate ?? null,
                  travelers: selectedTripProject.travelers ?? null,
                }}
                workspace={tripWorkspace}
                // Q5: the history sheet renders the full workspace including
                // pendingProposals; pass the action callbacks + pending/terminal
                // state so the Apply/Dismiss buttons are live (consistent with
                // the primary workspace sheet and desktop panel), not dead.
                onApplyProposal={applyTripChangeProposalAction ? handleApplyProposal : undefined}
                onDismissProposal={dismissTripChangeProposalAction ? handleDismissProposal : undefined}
                onRefreshProposal={handleRefreshProposal}
                proposalPending={proposalPending}
                proposalTerminalOutcome={proposalTerminalOutcome}
                planHistoryVariant="inline"
              />
            </div>
          </div>
        ) : null}
      </div>

      {showContextPanel && selectedAnswerEntity ? (
        <aside aria-label="Bảng ngữ cảnh hội thoại" className="hidden min-h-0 min-w-0 flex-col rounded-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_16px_40px_rgba(41,33,18,0.08)] lg:col-start-3 lg:row-start-1 lg:flex lg:w-full xl:w-[23rem]">
          <div className="flex items-start justify-between gap-3 border-b border-[#eadfc8] pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c4f13]">Ngữ cảnh</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#17342c]">Chọn chi tiết trong câu trả lời</h2>
            </div>
            <BrandMark className="size-10 shrink-0" />
          </div>
          <AnswerDetailPanel selectedEntity={selectedAnswerEntity} panelId={desktopAnswerDetailPanelId} panelRef={desktopAnswerDetailPanelRef} onClose={closeAnswerDetailPanel} onExecuteAction={executeAnnotationAction ? handleExecuteAnnotationAction : undefined} actionPending={annotationActionPending} actionsEnabled={!isHistoricReview} />
        </aside>
      ) : null}

      {selectedTripProject && tripWorkspace ? (
        <aside aria-label="Không gian dự án chuyến đi" aria-hidden={(isWorkspaceSheetOpen || isPlanHistorySheetOpen) && !isDesktopViewport ? "true" : undefined} className="hidden min-h-0 w-[24rem] shrink-0 overflow-y-auto rounded-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_16px_40px_rgba(41,33,18,0.08)] lg:block">
          <TripWorkspacePanel
            idPrefix="desktop-"
            header={{
              title: selectedTripProject.title,
              origin: selectedTripProject.origin,
              destination: selectedTripProject.destination,
              startDate: selectedTripProject.startDate ?? null,
              endDate: selectedTripProject.endDate ?? null,
              travelers: selectedTripProject.travelers ?? null,
            }}
            workspace={tripWorkspace}
            onApplyProposal={applyTripChangeProposalAction ? handleApplyProposal : undefined}
            onDismissProposal={dismissTripChangeProposalAction ? handleDismissProposal : undefined}
            onRefreshProposal={handleRefreshProposal}
            proposalPending={proposalPending}
            proposalTerminalOutcome={proposalTerminalOutcome}
            planHistoryVariant="inline"
          />
        </aside>
      ) : null}
    </div>
  );
}

type StreamResult = {
  status: "answer-created";
  conversationId: string;
  userMessage: DisplayMessage;
  assistantMessage: DisplayMessage;
} | {
  status: "in-progress";
  conversationId?: string;
  userMessage?: DisplayMessage;
} | {
  status: "answer-failed";
  code?: "refresh_required";
  conversationId?: string;
  userMessage?: DisplayMessage;
  errorMessage: string;
};

function appendMessagesWithoutDuplicateIds(currentMessages: DisplayMessage[], additions: DisplayMessage[]) {
  const existingIds = new Set(currentMessages.map((message) => message.id));
  return [...currentMessages, ...additions.filter((message) => !existingIds.has(message.id))];
}

async function digestFileForIdempotency(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function submitAiAskStream({
  question,
  conversationId,
  tripProjectId,
  image,
  idempotencyKey,
  signal,
  onPreparing,
  onDelta,
}: {
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  image: File | null;
  idempotencyKey: string;
  signal?: AbortSignal;
  onPreparing: () => void;
  onDelta: (content: string) => void;
}): Promise<StreamResult> {
  let events;
  try {
    events = await submitDirectAiAskStream({ question, conversationId, tripProjectId, image, idempotencyKey, signal, onPreparing, onDelta });
  } catch (error) {
    if (error instanceof DirectApiError) throw error;
    return { status: "answer-failed", errorMessage: error instanceof Error ? error.message : "Mình chưa tạo được câu trả lời lúc này." };
  }
  let terminalResult: StreamResult | null = null;
  for (const event of events) {

      if (event.type === "in_progress") {
        terminalResult = { status: "in-progress", conversationId: event.conversationId, userMessage: event.userMessage ? { ...event.userMessage, role: "user" } : undefined };
      }

      if (event.type === "done" && event.conversationId && event.userMessage && event.assistantMessage) {
        terminalResult = { status: "answer-created", conversationId: event.conversationId, userMessage: { ...event.userMessage, role: "user" }, assistantMessage: { id: event.assistantMessage.id, content: event.assistantMessage.content, role: "assistant" } };
      }

      if (event.type === "error" && terminalResult?.status !== "answer-created") {
        terminalResult = { status: "answer-failed", code: event.code, conversationId: event.conversationId, userMessage: event.userMessage ? { ...event.userMessage, role: "user" } : undefined, errorMessage: event.errorMessage ?? "Mình chưa tạo được câu trả lời lúc này." };
      }
  }

  return terminalResult ?? { status: "answer-failed", errorMessage: "Luồng trả lời kết thúc trước khi lưu câu trả lời hoàn chỉnh." };
}

export function buildAiAskStreamFormData({
  question,
  conversationId,
  tripProjectId,
  image,
}: {
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  image: File | null;
}) {
  const formData = new FormData();

  formData.set("question", question);
  if (conversationId) formData.set("conversationId", conversationId);
  if (tripProjectId) formData.set("tripProjectId", tripProjectId);
  if (image) formData.set("image", image);
  return formData;
}


function validateSelectedImage(image: File | null) {
  if (!image) {
    return null;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    return "Ảnh chỉ hỗ trợ JPEG, PNG hoặc WebP.";
  }

  if (image.size <= 0 || image.size > maxImageByteSize) {
    return "Ảnh phải nhỏ hơn hoặc bằng 5MB.";
  }

  return null;
}

function createProvenanceAnswerEntityDescriptor(item: AvailableAssistantMessageProvenanceItem): AnswerEntityDescriptor {
  const hasActionBlockedProvenance = isActionBlockedProvenance(item);
  const detail: Record<string, string> = {};

  if (item.url) {
    detail["URL"] = item.url;
  }

  if (item.checkedAt) {
    detail["Ngày kiểm tra"] = formatProvenanceDate(item.checkedAt);
  }

  return {
    type: hasActionBlockedProvenance || item.freshnessSensitive ? "warning" : "source",
    label: item.title,
    summary: hasActionBlockedProvenance || item.freshnessSensitive ? "Thông tin này có thể thay đổi. Kiểm tra lại trước khi đi hoặc đặt dịch vụ." : "Bạn có thể xem thông tin tham khảo trước khi quyết định.",
    sourceCategory: item.sourceCategory,
    owner: { table: "assistant_response_provenance", id: item.id },
    detail,
    quickFacts: Object.entries(detail).slice(0, 6).map(([label, value]) => ({ label, value })),
    provenanceIds: [item.id],
  };
}

function isActionBlockedProvenance(item: AvailableAssistantMessageProvenanceItem) {
  return item.verificationStatus === "unverified";
}

function formatAnswerEntitySummary(entity: AnswerEntityDescriptor) {
  if (entity.type === "warning") {
    return "Mục này cần kiểm tra lại trước khi ra quyết định đi, hành động hoặc đặt dịch vụ.";
  }
  return "Xem thông tin này để chuẩn bị phù hợp hơn cho chuyến đi.";
}

function getAnswerEntityIcon(type: AnswerEntityDescriptor["type"]) {
  if (type === "place") return PlaceIcon;
  if (type === "hotel_area") return HotelAreaIcon;
  if (type === "route_segment") return RouteSegmentIcon;
  if (type === "cost") return CostIcon;
  if (type === "warning") return SourceIcon;
  if (type === "trip_fact") return ProjectIcon;
  if (type === "action") return ChatIcon;
  return SourceIcon;
}

function formatProvenanceDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN");
}

function getSafeTravelerUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function formatImageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeSession(id: string, question: string): ChatSessionSummary {
  return { id, updatedAt: new Date(), preview: formatPreviewText(question) };
}

function moveSessionToTop(sessions: ChatSessionSummary[], id: string): ChatSessionSummary[] {
  const index = sessions.findIndex((session) => session.id === id);

  if (index === -1) {
    return sessions;
  }

  return [{ ...sessions[index], updatedAt: new Date() }, ...sessions.slice(0, index), ...sessions.slice(index + 1)];
}

function formatPreviewText(content: string): string {
  const trimmed = content.trim();

  if (trimmed.length <= previewMaxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
