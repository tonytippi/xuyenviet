"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

import { ConversationList, type ChatSessionSummary } from "@/features/chat-trips/conversation-list";
import { formatTripProjectLabel } from "@/features/chat-trips/labels";
import { answerUsefulnessCommentMaxLength, countAnswerUsefulnessCommentCharacters, type AnswerUsefulnessFeedbackSummary } from "@/features/feedback/types";
import type { AnswerUsefulnessRating } from "@/db/schema";
import type { AnswerAnnotation } from "@/features/ai/answer-annotations";
import type { AssistantMessageProvenanceItem } from "@/features/retrieval/provenance";

const maxQuestionLength = 2_000;
const maxImageByteSize = 5 * 1024 * 1024;
const progressDelayMs = 4_000;
const previewMaxLength = 60;

type DisplayMessage = {
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
};

export type AnswerEntityDescriptor = {
  type: "source" | "warning" | "trip_fact" | "action";
  label: string;
  section?: string;
  sourceCategory?: AssistantMessageProvenanceItem["sourceCategory"];
  owner?: {
    table: string;
    id: string;
  };
  detail?: Record<string, string>;
  provenanceIds?: string[];
};

type TripProjectSummary = {
  id: string;
  title: string;
  origin: string | null;
  destination: string | null;
  updatedAt?: Date | string;
};

type CreateTripProjectFormState = { error?: string };

type CreateTripProjectAction = (
  state: CreateTripProjectFormState | undefined,
  formData: FormData,
) => Promise<CreateTripProjectFormState | undefined>;

type DeleteConversationAction = (conversationId: string) => Promise<{ success: boolean; error?: string; reason?: "not_found" }>;
type DeleteTripProjectAction = (tripProjectId: string) => Promise<{ success: boolean; error?: string; reason?: "not_found" }>;
type SaveAnswerUsefulnessFeedbackAction = (input: { assistantMessageId: string; rating: AnswerUsefulnessRating; comment?: string | null }) => Promise<{ success: boolean; feedback?: AnswerUsefulnessFeedbackSummary; reason?: "unauthenticated" | "not_found" | "invalid_target" | "invalid_input" | "invalid_rating" | "comment_too_long" | "failed" }>;

const emptyMessages: DisplayMessage[] = [];
const emptySessions: ChatSessionSummary[] = [];
const emptyTripProjects: TripProjectSummary[] = [];

const starterCards = [
  {
    title: "Lên route",
    description: "Hà Nội → Huế trong 5 ngày",
  },
  {
    title: "Tìm nơi ở",
    description: "khu nào tiện cho gia đình",
  },
  {
    title: "Điểm dừng",
    description: "nghỉ ăn, chơi nhẹ, trẻ em",
  },
  {
    title: "Kiểm tra nguồn",
    description: "curated, official, web",
  },
];

type AiAskComposerProps = {
  initialQuestion?: string;
  initialConversationId?: string;
  initialMessages?: DisplayMessage[];
  initialSessions?: ChatSessionSummary[];
  initialTripProjects?: TripProjectSummary[];
  selectedTripProject?: TripProjectSummary | null;
  userEmail?: string;
  canAccessAdmin?: boolean;
  createTripProjectAction?: CreateTripProjectAction;
  deleteConversationAction?: DeleteConversationAction;
  deleteTripProjectAction?: DeleteTripProjectAction;
  saveAnswerUsefulnessFeedbackAction?: SaveAnswerUsefulnessFeedbackAction;
};

function AnswerUsefulnessFeedbackControl({
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
    <section className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/70 p-4" aria-label="Đánh giá độ hữu ích của câu trả lời">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]">Câu trả lời này hữu ích không?</h3>
          <p className="mt-1 text-sm leading-6 text-[#4f625a]">Đánh giá là tuỳ chọn và không ảnh hưởng việc tiếp tục chat hoặc mở nguồn.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={selectedRating === "useful"}
            className="min-h-11 rounded-xl border border-[#8fb59f] bg-[#edf7f0] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-[#1f5f46] aria-pressed:text-white"
            disabled={pending}
            onClick={() => onSubmit(messageId, "useful", comment)}
            type="button"
          >
            Hữu ích
          </button>
          <button
            aria-pressed={selectedRating === "not_useful"}
            className="min-h-11 rounded-xl border border-[#d8c9ad] bg-[#fff8ec] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-[#8c4f13] aria-pressed:text-white"
            disabled={pending}
            onClick={() => onSubmit(messageId, "not_useful", comment)}
            type="button"
          >
            Chưa hữu ích
          </button>
        </div>
      </div>
      {selectedRating ? (
        <div className="mt-3">
          <label className="text-sm font-semibold text-[#17342c]" htmlFor={`answer-feedback-comment-${messageId}`}>
            Ghi chú ngắn tuỳ chọn
          </label>
          <textarea
            className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#d8c9ad] bg-[#fffdf8] px-3 py-2 text-sm leading-6 text-[#17342c] outline-none transition focus:border-[#1f5f46] focus:ring-4 focus:ring-[#8fb59f]/45"
            disabled={pending}
            id={`answer-feedback-comment-${messageId}`}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Ví dụ: thiếu thời gian di chuyển thực tế, hoặc gợi ý rất đúng nhu cầu gia đình."
            value={comment}
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[#6b7c75]">Tối đa {answerUsefulnessCommentMaxLength} ký tự. Không nhập thông tin nhạy cảm của trẻ em hoặc giấy tờ cá nhân.</p>
            <button
              className="min-h-10 rounded-xl border border-[#d8c9ad] bg-white/80 px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              onClick={() => onSubmit(messageId, selectedRating, comment)}
              type="button"
            >
              Lưu ghi chú
            </button>
          </div>
        </div>
      ) : null}
      {pending ? <p className="mt-2 text-sm font-semibold text-[#4f625a]">Đang lưu đánh giá...</p> : null}
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
  "Cảnh báo cần kiểm tra",
  "Nguồn và độ tin cậy",
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

export function AssistantMessageContent({ content, annotations, selectedEntityId, detailPanelIds, onSelectEntity }: { content: string; annotations?: AnswerAnnotation[]; selectedEntityId?: string; detailPanelIds?: string; onSelectEntity?: (entity: AnswerEntityDescriptor, trigger: HTMLElement) => void }) {
  const sections = splitAssistantContent(content);

  if (sections.length <= 1 && !sections[0]?.heading) {
    return <p className="whitespace-pre-wrap text-base leading-7"><AnnotatedAnswerText content={content} annotations={annotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        const headingAnnotations = section.heading && section.headingStart !== undefined && section.headingEnd !== undefined ? annotations?.filter((annotation) => annotation.start >= section.headingStart! && annotation.end <= section.headingEnd!).map((annotation) => ({ ...annotation, start: annotation.start - section.headingStart!, end: annotation.end - section.headingStart! })) : [];
        const sectionAnnotations = section.bodyStart >= 0 && section.bodyEnd >= 0 ? annotations?.filter((annotation) => annotation.start >= section.bodyStart && annotation.end <= section.bodyEnd).map((annotation) => ({ ...annotation, start: annotation.start - section.bodyStart, end: annotation.end - section.bodyStart })) : [];

        return (
          <section className="rounded-2xl border border-[#eadfc8] bg-white/70 p-4" key={`${section.heading || "intro"}-${index}`}>
            {section.heading ? <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]"><AnnotatedAnswerText content={section.heading} annotations={headingAnnotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></h3> : null}
            {section.body ? <p className="mt-2 whitespace-pre-wrap text-base leading-7"><AnnotatedAnswerText content={section.body} annotations={sectionAnnotations} selectedEntityId={selectedEntityId} detailPanelIds={detailPanelIds} onSelectEntity={onSelectEntity} /></p> : null}
          </section>
        );
      })}
    </div>
  );
}

function AnnotatedAnswerText({ content, annotations, selectedEntityId, detailPanelIds, onSelectEntity }: { content: string; annotations?: AnswerAnnotation[]; selectedEntityId?: string; detailPanelIds?: string; onSelectEntity?: (entity: AnswerEntityDescriptor, trigger: HTMLElement) => void }) {
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

    const entity = createAnnotationAnswerEntityDescriptor(annotation);
    const isSelected = Boolean(selectedEntityId && entity.provenanceIds?.[0] && selectedEntityId === entity.provenanceIds[0]);

    parts.push(
      <button
        aria-controls={detailPanelIds}
        aria-expanded={isSelected}
        aria-label={`Mở chi tiết annotation: ${annotation.text}`}
        aria-pressed={isSelected}
        className={`mx-0.5 rounded-lg border px-1.5 py-0.5 text-left font-semibold underline decoration-2 underline-offset-4 transition focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 ${getAnnotationClassName(annotation)}`}
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

  for (const annotation of (annotations ?? []).slice().sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (!annotation.id || seenIds.has(annotation.id) || !annotation.detail || !Number.isInteger(annotation.start) || !Number.isInteger(annotation.end)) {
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

function createAnnotationAnswerEntityDescriptor(annotation: AnswerAnnotation): AnswerEntityDescriptor {
  return {
    type: annotation.detail.type,
    label: annotation.detail.label,
    section: annotation.detail.section,
    sourceCategory: annotation.detail.sourceCategory,
    owner: annotation.detail.owner,
    detail: annotation.detail.detail,
    provenanceIds: annotation.detail.provenanceIds,
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
  const visibleItems = provenance?.filter((item) => item.usedInPrompt || item.sourceCategory === "general") ?? [];

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 rounded-2xl border border-[#d8c9ad] bg-[#fff8ec] p-4" aria-label="Nguồn và độ tin cậy">
      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#8c4f13]">Nguồn và độ tin cậy</h3>
      <ul className="mt-3 space-y-3">
        {visibleItems.map((item) => {
          const isSelected = selectedEntityId === item.id;
          const detailActionLabel = item.sourceCategory === "general" ? "Xem chi tiết suy luận AI" : item.freshnessSensitive ? "Xem chi tiết cảnh báo" : "Xem chi tiết nguồn";

          return (
          <li className="rounded-xl border border-[#eadfc8] bg-white/80 p-3 text-sm leading-6 text-[#17342c]" key={item.id}>
            <button
              aria-controls={detailPanelIds}
              aria-expanded={isSelected}
              aria-label={`${detailActionLabel}: ${item.title}`}
              aria-pressed={isSelected}
              className="-m-2 flex w-[calc(100%+1rem)] flex-col gap-2 rounded-xl p-2 text-left transition hover:bg-[#fff8ec] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 aria-pressed:border aria-pressed:border-[#1f5f46] aria-pressed:bg-[#edf7f0] sm:flex-row sm:items-start sm:justify-between"
              onClick={(event) => onSelectEntity?.(createProvenanceAnswerEntityDescriptor(item), event.currentTarget)}
              type="button"
            >
              <span className="font-semibold">{item.title}</span>
              <span className="w-fit rounded-full border border-[#d8c9ad] bg-[#fffdf8] px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#4f625a]">
                {formatProvenanceCategory(item)}
              </span>
            </button>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#4f625a]">
              <span>{item.confidenceLabel}</span>
              <span>{formatProvenanceSourceType(item)}</span>
              {item.checkedAt ? <span>Kiểm tra: {formatProvenanceDate(item.checkedAt)}</span> : null}
            </div>
            {item.url ? (
              <a className="mt-2 block break-words text-sm font-semibold text-[#1f5f46] underline decoration-[#8fb59f] underline-offset-4 focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" href={item.url} rel="noreferrer" target="_blank">
                Mở nguồn tham khảo: {formatProvenanceUrl(item.url)}
              </a>
            ) : null}
            {item.sourceCategory === "general" ? (
              <p className="mt-2 text-sm leading-6 text-[#6f3f12]">Phần này là suy luận tổng quát của AI, không phải nguồn đã xác minh.</p>
            ) : null}
            {item.freshnessSensitive ? (
              <p className="mt-2 text-sm leading-6 text-[#6f3f12]">Thông tin có thể thay đổi. Kiểm tra lại trước khi đi hoặc đặt dịch vụ.</p>
            ) : null}
          </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AnswerDetailPanel({ selectedEntity, panelId, panelRef, onClose }: { selectedEntity: AnswerEntityDescriptor | null; panelId?: string; panelRef?: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  if (!selectedEntity) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4 py-8" id={panelId} ref={panelRef} tabIndex={-1}>
        <div className="rounded-[1.5rem] border border-dashed border-[#d8c9ad] bg-white/75 p-5">
          <p className="text-sm font-bold text-[#17342c]">Chưa có chi tiết được chọn</p>
          <p className="mt-2 text-sm leading-6 text-[#4f625a]">
            Chọn một nguồn hoặc cảnh báo trong câu trả lời để xem thông tin kiểm chứng. XuyenViet không tự tạo thông tin chi tiết từ nội dung trả lời tự do.
          </p>
        </div>
        <div className="rounded-2xl border border-[#eadfc8] bg-[#fff8ec] p-4 text-sm leading-6 text-[#6f3f12]">
          Nguồn và độ tin cậy dựa trên provenance đã lưu, không dựa trên việc đọc lại văn bản trợ lý.
        </div>
      </div>
    );
  }

  const detailEntries = Object.entries(selectedEntity.detail ?? {});

  return (
    <div aria-live="polite" className="flex flex-1 flex-col gap-4 overflow-y-auto py-4 focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" id={panelId} ref={panelRef} tabIndex={-1}>
      <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/85 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c4f13]">Chi tiết đã chọn</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#17342c]">{selectedEntity.label}</h3>
          </div>
          <button
            aria-label="Đóng bảng chi tiết"
            className="min-h-10 rounded-xl border border-[#d8c9ad] bg-[#fffdf8] px-3 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#4f625a]">{formatAnswerEntitySummary(selectedEntity)}</p>
      </div>

      {detailEntries.length > 0 ? (
        <section className="rounded-[1.5rem] border border-[#eadfc8] bg-white/75 p-4" aria-label="Thông tin nhanh">
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]">Thông tin nhanh</h4>
          <dl className="mt-3 space-y-3 text-sm leading-6">
            {detailEntries.map(([label, value], index) => (
              <div className="rounded-xl bg-[#fffdf8] p-3" key={`${label}-${index}`}>
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7c75]">{label}</dt>
                <dd className="mt-1 break-words font-semibold text-[#17342c]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {selectedEntity.provenanceIds && selectedEntity.provenanceIds.length > 0 ? (
        <section className="rounded-2xl border border-[#eadfc8] bg-[#fff8ec] p-4 text-sm leading-6 text-[#6f3f12]" aria-label="Cơ sở gợi ý">
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-[#8c4f13]">Cơ sở gợi ý</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedEntity.provenanceIds.map((id, index) => (
              <span className="rounded-full border border-[#d8c9ad] bg-white px-3 py-1 text-xs font-semibold text-[#4f625a]" key={id}>Nguồn {index + 1}</span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
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
  userEmail,
  canAccessAdmin = false,
  createTripProjectAction,
  deleteConversationAction,
  deleteTripProjectAction,
  saveAnswerUsefulnessFeedbackAction,
}: AiAskComposerProps) {
  const router = useRouter();
  const activeTripProjectId = selectedTripProject?.id;
  const [question, setQuestion] = useState(initialQuestion);
  const [status, setStatus] = useState(initialMessages.length > 0 ? "Đã tải hội thoại. Bạn có thể tiếp tục kế hoạch." : selectedTripProject ? `Bạn đang lập kế hoạch trong dự án “${selectedTripProject.title}”.` : "Nhập câu hỏi về chuyến đi đường bộ của bạn.");
  const [isPending, setIsPending] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
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
  const [deletingTripProjectId, setDeletingTripProjectId] = useState<string | null>(null);
  const [feedbackPendingMessageId, setFeedbackPendingMessageId] = useState<string | null>(null);
  const [selectedAnswerEntity, setSelectedAnswerEntity] = useState<AnswerEntityDescriptor | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [createProjectState, createProjectFormAction, isCreatingProject] = useActionState<CreateTripProjectFormState | undefined, FormData>(
    createTripProjectAction ?? noOpCreateTripProjectAction,
    undefined,
  );
  const mutationInFlight = Boolean(deletingConversationId) || Boolean(deletingTripProjectId);
  const createFormDisabled = isPending || isCreatingProject || mutationInFlight;
  const sessionActionsDisabled = isPending || Boolean(deletingConversationId) || Boolean(deletingTripProjectId);
  const projectActionsDisabled = isPending || Boolean(deletingConversationId) || Boolean(deletingTripProjectId);
  const askFormDisabled = isPending || Boolean(deletingTripProjectId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const deletingConversationIdRef = useRef<string | null>(null);
  const deletingTripProjectIdRef = useRef<string | null>(null);
  const sessionSheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sessionSheetPanelRef = useRef<HTMLDivElement>(null);
  const sessionSheetPreviousFocusRef = useRef<HTMLElement | null>(null);
  const mobileAnswerDetailDialogRef = useRef<HTMLDivElement>(null);
  const mobileAnswerDetailPanelRef = useRef<HTMLDivElement>(null);
  const desktopAnswerDetailPanelRef = useRef<HTMLDivElement>(null);
  const answerEntityTriggerRef = useRef<HTMLElement | null>(null);
  const hasMessages = messages.length > 0;
  const showEmptyState = !hasMessages && !isPending;
  const showContextPanel = hasMessages;
  const mobileAnswerDetailPanelId = "ai-ask-selected-answer-detail-mobile";
  const desktopAnswerDetailPanelId = "ai-ask-selected-answer-detail-desktop";
  const answerDetailPanelIds = `${mobileAnswerDetailPanelId} ${desktopAnswerDetailPanelId}`;
  const selectedAnswerEntityId = selectedAnswerEntity?.provenanceIds?.[0];

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

      if (event.defaultPrevented || isSessionSheetOpen || isTyping || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeAnswerDetailPanel();
    }

    window.addEventListener("keydown", handleDetailPanelShortcut);
    return () => window.removeEventListener("keydown", handleDetailPanelShortcut);
  }, [isSessionSheetOpen, selectedAnswerEntity]);

  useEffect(() => {
    const activeDialog = mobileAnswerDetailDialogRef.current;
    const composer = textareaRef.current;

    if (!selectedAnswerEntity || isSessionSheetOpen || !activeDialog || isDesktopViewport) {
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
  }, [isDesktopViewport, isSessionSheetOpen, selectedAnswerEntity]);

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
    if (!isPending) {
      setShowProgress(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowProgress(true);
      setStatus("Trợ lý vẫn đang xử lý câu hỏi. Bạn cứ giữ nguyên màn hình này, mình sẽ cập nhật khi có kết quả.");
    }, progressDelayMs);

    return () => window.clearTimeout(timeout);
  }, [isPending]);

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
      sessionSheetPreviousFocusRef.current?.focus();
    };
  }, [isDesktopViewport, isSessionSheetOpen]);

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
      setStatus(imageError);
      imageInputRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsPending(true);
    setShowProgress(false);
    setPendingQuestion(trimmedQuestion);
    setStreamingContent("");
    setStatus(selectedImage ? "Đang kiểm tra ảnh và chuẩn bị luồng trả lời..." : "Đang gửi câu hỏi và chuẩn bị luồng trả lời...");

    try {
      const hadConversation = Boolean(conversationId || messages.length > 0);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await submitAiAskStream({ question: trimmedQuestion, conversationId, tripProjectId: activeTripProjectId, image: selectedImage, signal: controller.signal, onDelta: (content) => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        setStreamingContent((currentContent) => currentContent + content);
      } });

      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      if (result.status === "answer-failed") {
        const failedUserMessage = result.userMessage;

        if (result.conversationId && failedUserMessage) {
          const newConversationId = result.conversationId;
          setConversationId(newConversationId);
          setFailedQuestionIds((currentIds) => [...currentIds, failedUserMessage.id]);
          setMessages((currentMessages) => [
            ...currentMessages,
            { id: failedUserMessage.id, role: "user", content: failedUserMessage.content },
          ]);
          if (!hadConversation) {
            setSessions((currentSessions) => [summarizeSession(newConversationId, trimmedQuestion), ...currentSessions]);
          } else {
            setSessions((currentSessions) => moveSessionToTop(currentSessions, newConversationId));
          }
          const searchParams = new URLSearchParams({ conversationId: newConversationId });
          if (activeTripProjectId) searchParams.set("tripProjectId", activeTripProjectId);
          router.replace(`/ai-ask?${searchParams.toString()}`);
        }
        setStatus(`${result.errorMessage} Chưa có câu trả lời trợ lý nào được lưu cho lượt này.`);
        return;
      }

      setConversationId(result.conversationId);
      setMessages((currentMessages) => [
        ...currentMessages,
        { id: result.userMessage.id, role: "user", content: result.userMessage.content },
        { id: result.assistantMessage.id, role: "assistant", content: result.assistantMessage.content, provenance: result.assistantMessage.provenance, annotations: result.assistantMessage.annotations },
      ]);
      setQuestion("");
      setSelectedImage(null);
      setStatus(hadConversation ? "Đã cập nhật hội thoại của bạn." : "Đã tạo câu trả lời đầu tiên cho chuyến đi của bạn.");
      if (!hadConversation) {
        setSessions((currentSessions) => [summarizeSession(result.conversationId, trimmedQuestion), ...currentSessions]);
      } else {
        setSessions((currentSessions) => moveSessionToTop(currentSessions, result.conversationId));
      }
      const searchParams = new URLSearchParams({ conversationId: result.conversationId });
      if (activeTripProjectId) searchParams.set("tripProjectId", activeTripProjectId);
      router.replace(`/ai-ask?${searchParams.toString()}`);
    } catch (error) {
      if (activeRequestIdRef.current === requestId && !(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("Không thể gửi câu hỏi lúc này. Hãy kiểm tra đăng nhập và thử lại. Nội dung vẫn còn trong ô nhập.");
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        isSubmittingRef.current = false;
        setIsPending(false);
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
      setStatus(imageError);
      return;
    }

    setSelectedImage(file);
    setStatus(`Đã chọn ảnh “${file.name || "ảnh đính kèm"}”. Ảnh sẽ được kiểm tra quyền sở hữu trước khi gọi AI.`);
  }

  function clearSelectedImage() {
    setSelectedImage(null);

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
    router.push(activeTripProjectId ? `/ai-ask?tripProjectId=${encodeURIComponent(activeTripProjectId)}` : "/ai-ask");
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
    const searchParams = new URLSearchParams({ conversationId: id });
    if (activeTripProjectId) searchParams.set("tripProjectId", activeTripProjectId);
    router.push(`/ai-ask?${searchParams.toString()}`);
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
    setStatus(selectedTripProject ? `Cuộc trò chuyện mới sẽ nằm trong dự án “${selectedTripProject.title}”.` : "Nhập câu hỏi về chuyến đi đường bộ của bạn.");
    setFailedQuestionIds([]);
    setSelectedImage(null);
    setSelectedAnswerEntity(null);
    answerEntityTriggerRef.current = null;
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    router.push(activeTripProjectId ? `/ai-ask?tripProjectId=${encodeURIComponent(activeTripProjectId)}` : "/ai-ask");
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

  function handleSelectTripProject(projectId: string) {
    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi đổi dự án chuyến đi.");
      return;
    }

    if (deletingTripProjectIdRef.current) {
      setStatus("Vui lòng chờ thao tác xoá dự án chuyến đi hoàn tất trước khi đổi dự án.");
      return;
    }

    if (isSessionSheetOpen) {
      sessionSheetPreviousFocusRef.current = textareaRef.current;
      setSessionSheetOpen(false);
    }

    router.push(projectId ? `/ai-ask?tripProjectId=${encodeURIComponent(projectId)}` : "/ai-ask");
  }

  async function handleDeleteTripProject() {
    if (!selectedTripProject || !deleteTripProjectAction) {
      return;
    }

    if (isPending) {
      setStatus("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi xoá dự án chuyến đi.");
      return;
    }

    if (deletingConversationIdRef.current || deletingTripProjectIdRef.current) {
      return;
    }

    const confirmed = window.confirm(`Xoá dự án chuyến đi “${selectedTripProject.title}”? Ngữ cảnh đã ghi nhớ cho dự án sẽ bị xoá khỏi phần sử dụng bình thường. Các cuộc trò chuyện liên kết sẽ không bị xoá; chúng sẽ được chuyển về lịch sử trò chuyện thường.`);

    if (!confirmed) {
      return;
    }

    const projectId = selectedTripProject.id;
    deletingTripProjectIdRef.current = projectId;
    setDeletingTripProjectId(projectId);
    setStatus("Đang xoá dự án chuyến đi...");

    try {
      const result = await deleteTripProjectAction(projectId);

      if (!result.success) {
        if (result.reason === "not_found") {
          setTripProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
          setSessionSheetOpen(false);
          setSessions([]);
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
          router.push("/ai-ask");
        }
        setStatus(result.error ?? "Không thể xoá dự án chuyến đi lúc này. Vui lòng thử lại.");
        return;
      }

      setTripProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
      setSessionSheetOpen(false);
      setSessions([]);
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
      router.push("/ai-ask");
      setStatus("Đã xoá dự án chuyến đi. Các cuộc trò chuyện liên kết đã được chuyển về lịch sử trò chuyện thường.");
    } catch {
      setStatus("Không thể xoá dự án chuyến đi lúc này. Vui lòng thử lại.");
    } finally {
      deletingTripProjectIdRef.current = null;
      setDeletingTripProjectId(null);
    }
  }

  const planningScope = (
    <section className="rounded-[1.25rem] border border-[#d8c9ad] bg-white/75 p-4 text-left">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c4f13]">Phạm vi lập kế hoạch</p>
          <h2 className="mt-1 text-lg font-semibold text-[#17342c]">
            {selectedTripProject ? `Dự án: ${formatTripProjectLabel(selectedTripProject)}` : "Trò chuyện thường"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#4f625a]">
            {selectedTripProject
              ? "Tin nhắn mới sẽ được gắn với dự án chuyến đi này. Ngữ cảnh bền vững sẽ được dùng ở các story sau."
              : "Bạn đang hỏi trong hội thoại thường. Chọn hoặc tạo dự án nếu muốn gom kế hoạch cho một chuyến cụ thể."}
          </p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-semibold text-[#17342c]">
          Chọn dự án
          <select
            className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-[#fffdf8] px-3 py-2 text-sm text-[#17342c] outline-none focus:border-[#1f5f46] focus:ring-4 focus:ring-[#8fb59f]/45"
            disabled={projectActionsDisabled}
            onChange={(event) => handleSelectTripProject(event.target.value)}
            value={activeTripProjectId ?? ""}
          >
            <option value="">Trò chuyện thường</option>
            {tripProjects.map((project) => (
              <option key={project.id} value={project.id}>{formatTripProjectLabel(project)}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedTripProject && deleteTripProjectAction ? (
        <div className="mt-4 rounded-2xl border border-[#f0c8a0] bg-[#fff7ed] p-3 text-sm leading-6 text-[#6f3f12]">
          <p>Dự án có thể xoá khi bạn không chờ câu trả lời AI. Ngữ cảnh dự án sẽ bị xoá; các cuộc trò chuyện liên kết sẽ chuyển về lịch sử thường.</p>
          <button
            className="mt-3 min-h-11 rounded-2xl border border-[#b45309] bg-white px-4 py-2 text-sm font-semibold text-[#7c2d12] transition hover:bg-[#ffedd5] focus:outline-none focus:ring-4 focus:ring-[#f0c8a0] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={projectActionsDisabled}
            onClick={handleDeleteTripProject}
            type="button"
          >
            {deletingTripProjectId === selectedTripProject.id ? "Đang xoá dự án..." : "Xoá dự án chuyến đi"}
          </button>
        </div>
      ) : null}

      {createTripProjectAction ? (
        <details className="mt-4 rounded-2xl border border-dashed border-[#d8c9ad] bg-[#fffdf8] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#17342c]">Tạo dự án chuyến đi mới</summary>
          <form action={createProjectFormAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-semibold text-[#17342c]">
              Tên dự án <span className="text-[#8c4f13]">*</span>
              <input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} maxLength={160} name="title" required placeholder="Ví dụ: Đà Nẵng 7 ngày cùng gia đình" />
            </label>
            <label className="text-sm font-semibold text-[#17342c]">Điểm đi<input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="origin" placeholder="Hà Nội" /></label>
            <label className="text-sm font-semibold text-[#17342c]">Điểm đến<input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="destination" placeholder="Đà Nẵng" /></label>
            <label className="text-sm font-semibold text-[#17342c]">Ngày đi<input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="startDate" placeholder="2026-08-01" /></label>
            <label className="text-sm font-semibold text-[#17342c]">Ngày về<input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="endDate" placeholder="2026-08-07" /></label>
            <label className="sm:col-span-2 text-sm font-semibold text-[#17342c]">Người đi<input className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="travelers" placeholder="2 người lớn, 1 trẻ em" /></label>
            <label className="sm:col-span-2 text-sm font-semibold text-[#17342c]">Ghi chú<textarea className="mt-1 min-h-20 w-full rounded-xl border border-[#d8c9ad] bg-white px-3 py-2 text-sm" disabled={createFormDisabled} name="notes" placeholder="Sở thích, nhịp di chuyển, điều cần tránh..." /></label>
            {createProjectState?.error ? (
              <p className="sm:col-span-2 rounded-2xl border border-[#f0c8a0] bg-[#fff7ed] p-3 text-sm leading-6 text-[#6f3f12]" role="alert">{createProjectState.error}</p>
            ) : null}
            <button className="min-h-11 rounded-2xl bg-[#e5bd82] px-4 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-[#d9a65c] focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60" disabled={createFormDisabled} type="submit">{isCreatingProject ? "Đang tạo dự án..." : "Tạo và chọn dự án"}</button>
          </form>
        </details>
      ) : null}
    </section>
  );

  const accountPrivacyLinks = (
    <section className="rounded-[1.25rem] border border-[#d8c9ad] bg-white/75 p-4 text-left" aria-label="Tài khoản và quyền riêng tư">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c4f13]">Tài khoản</p>
      {userEmail ? <p className="mt-2 break-words text-sm font-semibold text-[#17342c]">{userEmail}</p> : null}
      <p className="mt-2 text-sm leading-6 text-[#4f625a]">Chat và dự án chuyến đi thuộc tài khoản của bạn. Dùng các nút xoá hiển thị sẵn để xoá hội thoại hoặc ngữ cảnh dự án.</p>
      <div className="mt-3 flex flex-col gap-2">
        {canAccessAdmin ? (
          <Link className="min-h-11 rounded-2xl bg-[#17342c] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#24483e] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href="/admin">
            Vào khu vực quản trị
          </Link>
        ) : null}
        <Link className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-[#fffdf8] px-4 py-3 text-center text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]" href="/">
          Về trang giới thiệu
        </Link>
      </div>
    </section>
  );

  return (
    <>
      <nav aria-label="Danh sách trò chuyện và dự án chuyến đi" className="hidden min-h-0 flex-col gap-3 lg:col-start-1 lg:row-start-1 lg:flex">
        <div className="min-h-0 flex-1">
          <ConversationList
            sessions={sessions}
            activeConversationId={conversationId}
            isDisabled={sessionActionsDisabled}
            onSelect={handleSelectSession}
            onDelete={deleteConversationAction ? handleDeleteSession : undefined}
            onNewChat={handleNewChat}
          />
        </div>
        {planningScope}
        {accountPrivacyLinks}
      </nav>

      <div className="flex min-h-[34rem] min-w-0 flex-col justify-between gap-5 rounded-[1.5rem] border border-[#d8c9ad] bg-[radial-gradient(circle_at_50%_0%,rgba(20,83,45,0.1),transparent_30%),#fffdf8] p-4 sm:p-5 lg:col-start-2 lg:row-start-1 lg:w-full xl:max-w-[760px]">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <button
            ref={sessionSheetTriggerRef}
            type="button"
            onClick={() => {
              setSelectedAnswerEntity(null);
              answerEntityTriggerRef.current = null;
              setSessionSheetOpen(true);
            }}
            aria-label="Mở danh sách trò chuyện, dự án chuyến đi và tài khoản"
            className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white/75 px-4 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
          >
            Danh sách trò chuyện
          </button>
        </div>

        {showEmptyState ? (
        <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col justify-center gap-5 py-8 text-center">
          <p className="mx-auto w-fit rounded-full border border-[#c47a24]/45 bg-[#fff8ec] px-4 py-2 text-sm font-semibold text-[#8c4f13]">
            Bắt đầu bằng một câu hỏi hành trình
          </p>
          <h2 className="text-4xl font-semibold tracking-[-0.06em] text-[#17342c] sm:text-6xl">Mình sẽ đi đâu?</h2>
          <p className="text-base leading-7 text-[#4f625a] sm:text-lg">
            Bắt đầu bằng một câu hỏi tự nhiên. XuyenViet sẽ giúp bạn lên route, chọn điểm dừng, nơi ở và những điều cần kiểm chứng.
          </p>

          {selectedTripProject ? (
            <p className="mx-auto max-w-2xl rounded-2xl border border-[#8fb59f] bg-[#edf7f0] px-4 py-3 text-sm font-semibold leading-6 text-[#17342c]">
              Đang hỏi trong dự án: {formatTripProjectLabel(selectedTripProject)}. Tin nhắn mới sẽ dùng ngữ cảnh dự án này, không mở bảng chi tiết bên phải.
            </p>
          ) : null}
        </div>
        ) : null}

        <div className="space-y-4">
          {messages.length > 0 ? (
            <section aria-label="Lịch sử hội thoại" aria-live="polite" className="mx-auto max-w-[760px] space-y-4">
              {messages.map((message) => (
                <article
                  className={
                    message.role === "assistant"
                      ? "rounded-[1.5rem] border border-[#d8c9ad] bg-[#fffdf8] p-5 text-[#17342c] shadow-[0_16px_40px_rgba(41,33,18,0.08)]"
                      : "ml-auto rounded-[1.25rem] bg-[#1f5f46] p-4 text-white shadow-[0_12px_30px_rgba(31,95,70,0.18)] sm:max-w-[80%]"
                  }
                  key={message.id}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
                    {message.role === "assistant" ? "Trợ lý XuyenViet" : "Bạn"}
                  </p>
                  {message.role === "assistant" ? (
                    <>
                      <AssistantMessageContent content={message.content} annotations={message.annotations} selectedEntityId={selectedAnswerEntityId} detailPanelIds={answerDetailPanelIds} onSelectEntity={handleSelectAnswerEntity} />
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

          {isPending ? (
            <section aria-live="polite" className="mx-auto max-w-[760px] rounded-[1.5rem] border border-dashed border-[#d8c9ad] bg-[#fffdf8] p-4 text-[#17342c] shadow-[0_12px_30px_rgba(41,33,18,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f46]">Đang xử lý</p>
              <p className="mt-2 text-base font-semibold">Trợ lý đang chuẩn bị câu trả lời cho câu hỏi của bạn.</p>
              <p className="mt-2 text-sm leading-6 text-[#4f625a]">
                {showProgress
                  ? "Quá trình đang lâu hơn bình thường một chút. Mình vẫn đang chờ kết quả từ hệ thống AI và chưa tạo nội dung trợ lý tạm thời."
                  : "Mình đã nhận câu hỏi và đang gửi đến hệ thống AI. Vui lòng không gửi lặp lại trong lúc chờ."}
              </p>
              {pendingQuestion ? <p className="mt-3 rounded-2xl bg-white/80 p-3 text-sm leading-6 text-[#4f625a]">“{pendingQuestion}”</p> : null}
              {streamingContent ? (
                <div className="mt-3 rounded-2xl border border-[#d8c9ad] bg-white/90 p-3 text-sm leading-6 text-[#17342c]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5f46]">Đang nhận từng phần</p>
                  <p className="whitespace-pre-wrap">{streamingContent}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <form className="mx-auto max-w-[760px] rounded-[1.75rem] border border-[#d8c9ad] bg-white/90 p-3 shadow-[0_20px_60px_rgba(41,33,18,0.14)]" onSubmit={handleSubmit} ref={formRef}>
            <label className="sr-only" htmlFor="ai-ask-question">
              Câu hỏi của bạn
            </label>
            <textarea
              className="min-h-28 w-full resize-y rounded-2xl border-0 bg-transparent px-3 py-2 text-base leading-7 text-[#17342c] outline-none placeholder:text-[#7b8b84] focus:ring-4 focus:ring-[#8fb59f]/45"
              disabled={askFormDisabled}
              aria-describedby="ai-ask-status"
              id="ai-ask-question"
              maxLength={maxQuestionLength + 1}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình nên dừng ở đâu?"
              ref={textareaRef}
              value={question}
            />
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#eadfc8] pt-2">
              <div className="flex items-center gap-2">
                <label
                  aria-label="Đính kèm ảnh tham khảo"
                  className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-[#4f625a] transition hover:bg-[#edf7f0] hover:text-[#14532d] focus-within:outline-none focus-within:ring-4 focus-within:ring-[#8fb59f]/45 ${askFormDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                  title="Đính kèm ảnh"
                  htmlFor="ai-ask-image"
                >
                  <PaperclipIcon />
                  <span className="sr-only">Đính kèm ảnh tham khảo</span>
                </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={askFormDisabled}
                id="ai-ask-image"
                onChange={handleImageChange}
                ref={imageInputRef}
                type="file"
              />
              </div>
              <button
                aria-label={isPending ? "Đang gửi câu hỏi" : deletingTripProjectId ? "Đang xoá dự án chuyến đi" : "Gửi câu hỏi"}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1f5f46] text-white shadow-[0_12px_30px_rgba(31,95,70,0.24)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f] disabled:cursor-not-allowed disabled:bg-[#8aa89b]"
                disabled={askFormDisabled}
                title="Gửi câu hỏi"
                type="submit"
              >
                {isPending ? <LoadingIcon /> : <SendIcon />}
              </button>
            </div>
            {selectedImage ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#fffdf8] px-3 py-2 text-sm text-[#4f625a]">
                <div className="flex min-w-0 items-center gap-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={selectedImage.name || "ảnh đính kèm"} className="h-9 w-9 shrink-0 rounded-lg border border-[#d8c9ad] object-cover" src={imageUrl} />
                  ) : null}
                  <span className="truncate">{selectedImage.name || "Ảnh đính kèm"} ({formatImageSize(selectedImage.size)})</span>
                </div>
                <button aria-label="Bỏ ảnh đính kèm" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#4f625a] transition hover:bg-[#fff1ed] hover:text-[#8c2f1d] focus:outline-none focus:ring-4 focus:ring-[#f0c8a0]" disabled={askFormDisabled} onClick={clearSelectedImage} title="Bỏ ảnh" type="button">
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            <p aria-live="polite" className="sr-only" id="ai-ask-status">
              {status}
            </p>
          </form>

          {showEmptyState ? (
            <>
              <div className="mx-auto grid max-w-[760px] gap-3 sm:grid-cols-2" aria-label="Gợi ý câu hỏi bắt đầu">
                {starterCards.map((card) => (
                  <button
                    className="grid min-h-[76px] grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-[1.25rem] border border-[#d8c9ad] bg-white/80 p-4 text-left shadow-[0_12px_36px_rgba(31,41,55,0.06)] transition hover:border-[#8fb59f] hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
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
                    <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f3ec] text-sm font-black text-[#14532d]">+</span>
                    <span>
                      <span className="block text-sm font-bold text-[#17342c]">{card.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#5d6f67]">{card.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <section className="mx-auto max-w-[760px] rounded-2xl border border-[#d8c9ad] bg-white/70 p-4 text-left">
                <h2 className="text-sm font-bold text-[#17342c]">Lưu trữ hội thoại</h2>
                <p className="mt-2 text-sm leading-6 text-[#4f625a]">
                  Thông tin chuyến đi có thể được lưu để tiếp tục kế hoạch trong các bước sau. Thông báo này không chặn việc đặt câu hỏi.
                </p>
              </section>
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
                  className="mb-3 min-h-11 w-full rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
                >
                  Đóng danh sách
                </button>
                <div className="mb-3">
                  {planningScope}
                </div>
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

        {showContextPanel && selectedAnswerEntity && !isSessionSheetOpen ? (
          <div ref={mobileAnswerDetailDialogRef} tabIndex={-1} className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Bảng chi tiết đã chọn">
            <button
              type="button"
              aria-label="Đóng bảng chi tiết đã chọn"
              onClick={closeAnswerDetailPanel}
              className="absolute inset-0 bg-[#17342c]/40"
            />
            <section className="absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_-24px_80px_rgba(41,33,18,0.24)]" aria-label="Chi tiết nguồn hoặc cảnh báo đã chọn">
              <AnswerDetailPanel selectedEntity={selectedAnswerEntity} panelId={mobileAnswerDetailPanelId} panelRef={mobileAnswerDetailPanelRef} onClose={closeAnswerDetailPanel} />
            </section>
          </div>
        ) : null}
      </div>

      {showContextPanel ? (
        <aside aria-label="Bảng ngữ cảnh hội thoại" className="hidden min-h-0 min-w-0 flex-col rounded-[1.5rem] border border-[#d8c9ad] bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_42%,#f7fbf8_100%)] p-4 text-[#17342c] shadow-[0_16px_40px_rgba(41,33,18,0.08)] lg:col-start-3 lg:row-start-1 lg:flex lg:w-full xl:w-[23rem]">
          <div className="flex items-start justify-between gap-3 border-b border-[#eadfc8] pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c4f13]">Ngữ cảnh</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#17342c]">Chọn chi tiết trong câu trả lời</h2>
            </div>
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e8f3ec] text-sm font-black text-[#14532d]">XV</span>
          </div>
          <AnswerDetailPanel selectedEntity={selectedAnswerEntity} panelId={desktopAnswerDetailPanelId} panelRef={desktopAnswerDetailPanelRef} onClose={closeAnswerDetailPanel} />
        </aside>
      ) : null}
    </>
  );
}

type StreamResult = {
  status: "answer-created";
  conversationId: string;
  userMessage: DisplayMessage;
  assistantMessage: DisplayMessage;
} | {
  status: "answer-failed";
  conversationId?: string;
  userMessage?: DisplayMessage;
  errorMessage: string;
};

async function submitAiAskStream({
  question,
  conversationId,
  tripProjectId,
  image,
  signal,
  onDelta,
}: {
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  image: File | null;
  signal?: AbortSignal;
  onDelta: (content: string) => void;
}): Promise<StreamResult> {
  const formData = new FormData();

  formData.set("question", question);
  if (conversationId) formData.set("conversationId", conversationId);
  if (tripProjectId) formData.set("tripProjectId", tripProjectId);
  if (image) formData.set("image", image);

  const response = await fetch("/api/ai-ask/stream", { method: "POST", body: formData, signal });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;

    return { status: "answer-failed", errorMessage: payload?.error ?? "Mình chưa tạo được câu trả lời lúc này." };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let terminalResult: StreamResult | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = parseStreamEvent(trimmed);

      if (!event) {
        terminalResult ??= { status: "answer-failed", errorMessage: "Luồng trả lời bị gián đoạn trước khi hoàn tất." };
        continue;
      }

      if (event.type === "delta" && event.content) {
        onDelta(event.content);
      }

      if (event.type === "done" && event.conversationId && event.userMessage && event.assistantMessage) {
        terminalResult = { status: "answer-created", conversationId: event.conversationId, userMessage: event.userMessage, assistantMessage: event.assistantMessage };
      }

      if (event.type === "error" && terminalResult?.status !== "answer-created") {
        terminalResult = { status: "answer-failed", conversationId: event.conversationId, userMessage: event.userMessage, errorMessage: event.errorMessage ?? "Mình chưa tạo được câu trả lời lúc này." };
      }
    }

    if (done) break;
  }

  return terminalResult ?? { status: "answer-failed", errorMessage: "Luồng trả lời kết thúc trước khi lưu câu trả lời hoàn chỉnh." };
}

function parseStreamEvent(line: string) {
  try {
    return JSON.parse(line) as { type: string; content?: string; conversationId?: string; userMessage?: DisplayMessage; assistantMessage?: DisplayMessage; errorMessage?: string };
  } catch {
    return null;
  }
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

function formatProvenanceCategory(item: AssistantMessageProvenanceItem) {
  if (item.sourceCategory === "knowledge") {
    return "XuyenViet";
  }

  if (item.sourceCategory === "web") {
    return "Web chưa xác minh";
  }

  if (item.sourceCategory === "trip_context") {
    return "Dự án";
  }

  if (item.sourceCategory === "chat_context") {
    return "Hội thoại";
  }

  return "Suy luận";
}

function createProvenanceAnswerEntityDescriptor(item: AssistantMessageProvenanceItem): AnswerEntityDescriptor {
  const detail: Record<string, string> = {
    "Loại": formatProvenanceCategory(item),
    "Độ tin cậy": item.confidenceLabel,
    "Nhãn nguồn": formatProvenanceSourceType(item),
    "Trạng thái": item.verificationStatus === "verified" && item.sourceCategory !== "web" && item.sourceCategory !== "general" ? "đã xác minh" : "chưa xác minh",
  };

  if (item.url) {
    detail["URL"] = item.url;
  }

  if (item.checkedAt) {
    detail["Ngày kiểm tra"] = formatProvenanceDate(item.checkedAt);
  }

  if (item.freshnessSensitive) {
    detail["Độ mới"] = "Thông tin có thể thay đổi, cần kiểm tra lại trước khi đi hoặc đặt dịch vụ.";
  } else {
    detail["Độ mới"] = "Chưa có cảnh báo riêng về độ mới của nguồn này.";
  }

  return {
    type: item.sourceCategory === "general" ? "action" : item.freshnessSensitive ? "warning" : "source",
    label: item.title,
    section: "Nguồn và độ tin cậy",
    sourceCategory: item.sourceCategory,
    owner: { table: "assistant_response_provenance", id: item.id },
    detail,
    provenanceIds: [item.id],
  };
}

function formatAnswerEntitySummary(entity: AnswerEntityDescriptor) {
  if (entity.sourceCategory === "general") {
    return "Đây là suy luận tổng quát của AI. Nội dung này chưa được xác minh như nguồn XuyenViet hoặc nguồn chính thức.";
  }

  if (entity.sourceCategory === "web") {
    return "Đây là nguồn web bên ngoài và vẫn chưa xác minh, kể cả khi trang tự ghi là official hoặc provider.";
  }

  if (entity.type === "warning") {
    return "Mục này cần kiểm tra lại trước khi ra quyết định đi, hành động hoặc đặt dịch vụ.";
  }

  if (entity.sourceCategory === "trip_context" || entity.sourceCategory === "chat_context") {
    return "Chi tiết này đến từ ngữ cảnh người dùng đã cung cấp trong dự án hoặc hội thoại, không phải nguồn bên ngoài đã duyệt.";
  }

  return "Chi tiết này được dựng từ provenance đã lưu của câu trả lời, không trích xuất từ văn bản tự do của trợ lý.";
}

function formatProvenanceSourceType(item: AssistantMessageProvenanceItem) {
  const sourceType = item.sourceType?.toLocaleLowerCase("vi-VN") ?? null;

  if (item.sourceCategory === "web") {
    if (sourceType === "community" || sourceType === "facebook" || sourceType === "cộng đồng") {
      return "Nguồn cộng đồng bên ngoài, chưa xác minh";
    }

    if (sourceType === "official" || sourceType === "provider") {
      return `Nguồn web tự ghi ${sourceType}, vẫn chưa được XuyenViet duyệt`;
    }

    return "Nguồn web bên ngoài, chưa xác minh";
  }

  if (item.sourceCategory === "general") {
    return "Không phải nguồn đã xác minh";
  }

  if (sourceType === "community" || sourceType === "facebook" || sourceType === "cộng đồng") {
    return "Nguồn cộng đồng";
  }

  if (item.sourceCategory === "trip_context") {
    return "Ngữ cảnh dự án do người dùng cung cấp";
  }

  if (item.sourceCategory === "chat_context") {
    return "Ngữ cảnh hội thoại do người dùng cung cấp";
  }

  return item.sourceType ? `Loại nguồn: ${item.sourceType}` : "Loại nguồn: chưa có nhãn";
}

function formatProvenanceDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN");
}

function formatProvenanceUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
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

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.1-8.1a4 4 0 1 1 5.7 5.7l-8.1 8.1a2 2 0 0 1-2.8-2.8l7.7-7.7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
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

async function noOpCreateTripProjectAction(state: CreateTripProjectFormState | undefined): Promise<CreateTripProjectFormState | undefined> {
  return state;
}
