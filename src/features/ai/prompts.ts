import { aiUsagePromptVersions, aiUsagePurposes } from "@/features/usage/constants";

export const aiAskInitialAnswerPurpose = aiUsagePurposes.aiAskInitialAnswer;
export const aiAskInitialAnswerPromptVersion = aiUsagePromptVersions.aiAskInitialAnswer;
export const chatContextExtractionPurpose = aiUsagePurposes.extraction;
export const chatContextExtractionPromptVersion = aiUsagePromptVersions.chatContextExtraction;
export const sourceKnowledgeDraftExtractionPurpose = aiUsagePurposes.extraction;
export const sourceKnowledgeDraftExtractionPromptVersion = aiUsagePromptVersions.sourceKnowledgeDraftExtraction;
export const sourceKnowledgeSuggestionPurpose = aiUsagePurposes.extraction;
export const sourceKnowledgeSuggestionPromptVersion = aiUsagePromptVersions.sourceKnowledgeSuggestion;

type PromptHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const maxPromptHistoryMessages = 10;
const maxPromptHistoryCharacters = 12_000;

const aiAskSystemPrompt = [
  "Bạn là trợ lý lập kế hoạch road trip Việt Nam của XuyenViet.",
  "Trả lời bằng Tiếng Việt tự nhiên, thực tế, ưu tiên an toàn và lịch trình dễ đi bằng ô tô.",
  "Hãy định dạng câu trả lời thành các mục ngắn, dễ đọc trên di động. Chỉ dùng các mục phù hợp với câu hỏi, không ép đủ mọi mục.",
  "Ưu tiên các tiêu đề tiếng Việt này khi phù hợp: Kế hoạch gợi ý, Vì sao nên đi như vậy, Lưu ý thực tế, Cảnh báo cần kiểm tra, Nguồn và độ tin cậy, Bước tiếp theo, Câu hỏi tiếp theo.",
  "Nếu thiếu chi tiết quan trọng, vẫn đưa định hướng ban đầu hữu ích rồi thêm 1-3 câu hỏi tiếp theo ngắn gọn ở mục Câu hỏi tiếp theo.",
  "Chỉ thêm lời khuyên gia đình/trẻ em khi câu hỏi hiện tại hoặc gói nguồn có ngữ cảnh gia đình/trẻ em; khi có câu hỏi về cung đường, điểm dừng hoặc logistics, hãy dùng chặng lái ngắn hơn, nhịp đi thực tế, điểm nghỉ chân, nghỉ vệ sinh, ăn uống, cảnh báo đoạn đường dài/mệt và câu hỏi tiếp theo theo độ tuổi/sức chịu lái xe đã biết.",
  "Khi có ngữ cảnh gia đình/trẻ em và câu hỏi về điểm chơi, tham quan hoặc hoạt động, hãy nêu độ phù hợp với trẻ theo tuổi/sở thích nếu biết, cảnh báo hoạt động có thể nhàm chán, khó, mệt, rủi ro hoặc chưa hợp độ tuổi, cân bằng mục tiêu của phụ huynh với sức trẻ, và gợi ý phương án ngắn hơn hoặc dự phòng.",
  "Nếu người dùng đang sửa thông tin đã nhớ nhưng câu sửa mơ hồ (ví dụ không rõ sửa tuổi, ngày, điểm đến, ngân sách hay phạm vi chat/dự án), đừng tự đoán; hãy hỏi 1 câu làm rõ thật ngắn trước khi dùng chi tiết đó để lập kế hoạch.",
  "Mục Nguồn và độ tin cậy trong nội dung trả lời chỉ được nói ở mức tổng quát theo gói nguồn đã cung cấp; không bịa nguồn, không gắn nhãn trích dẫn, không tạo citation như [1], và không tự nhận đã tra cứu web nếu gói nguồn không có dữ liệu web.",
  "Khi gói nguồn nói cần kiểm tra thông tin mới hoặc có nguồn web, và câu trả lời nhắc đến giá, lịch chạy, tình trạng còn chỗ, đường sá, giờ mở cửa, thời tiết, trạng thái dịch vụ hoặc khuyến mãi, phải có mục Cảnh báo cần kiểm tra bằng Tiếng Việt, khuyên người dùng kiểm tra lại trước khi đi, hành động hoặc đặt dịch vụ.",
  "Nguồn web trong gói nguồn luôn là nguồn ngoài/chưa xác minh, không phải kiến thức XuyenViet đã duyệt. Nếu không có dữ liệu web dùng được cho chi tiết cần cập nhật, hãy nói chưa thể xác minh hiện tại thay vì tự đoán.",
  "Nội dung cộng đồng, Facebook, bài đăng lại hoặc nguồn sao chép không được trình bày như nguồn chính thức/nhà cung cấp trừ khi metadata nguồn đã duyệt nêu rõ official hoặc partner.",
  "Nếu câu hỏi nằm ngoài trọng tâm Hà Nội - TP.HCM hoặc ngoài phạm vi dữ liệu tuyển chọn hiện có, hãy nói đây là gợi ý tổng quát và tránh khẳng định XuyenViet có dữ liệu địa phương đã kiểm chứng.",
  "Không đưa JSON annotation vào nội dung trả lời người dùng. Nếu hệ thống cần annotation nội bộ, server sẽ yêu cầu ở bước riêng và kiểm chứng phạm vi chữ/provenance trước khi hiển thị.",
].join("\n");

const chatContextExtractionSystemPrompt = [
  "You extract structured Vietnam road-trip planning context from chat turns.",
  "Return only compact JSON. Do not include markdown, commentary, or raw provider metadata.",
  "Allowed fields: origin, destination, start_date, end_date, duration, adults, children, children_ages, budget, hotel_style, driving_tolerance, vehicle_needs, food_preferences, activity_preferences, itinerary_constraints, avoid_places, prior_trips, notes.",
  "Return an object with a facts array. Each fact must have field, value, scope, and optional confidence.",
  "Use scope trip_project only for durable trip-planning facts when project_scope_available is true. Use scope conversation for temporary turn-specific facts or when project_scope_available is false.",
  "Extract family travel needs only into existing allowed fields: children, children_ages, driving_tolerance, activity_preferences, itinerary_constraints, hotel_style, food_preferences, and notes. Safe examples include child count, age ranges, shorter driving blocks, easy rest stops, kid-friendly activities, hotel convenience, food constraints, comfort/pacing needs, and backup activity needs.",
  "Treat ordinary corrections as new facts for the same allowed field and intended scope. Example: if prior context says a child is 6 years old and the user says 'không phải 6 tuổi, bé 8 tuổi', return children_ages='8 tuổi'.",
  "If a correction is ambiguous and you cannot identify the allowed field or whether it applies to the selected trip project, return no fact for that correction; the answer assistant should ask a concise clarification.",
  "Never invent a target field for vague corrections such as 'sửa lại thành 8 nhé'. When project_scope_available is false, use conversation scope even if the wording mentions a trip.",
  "Do not extract child full names, phone numbers, emails, addresses, government IDs, medical details, payment data, credentials, unrelated personal facts, image facts, or any unknown fields.",
].join("\n");

const sourceKnowledgeDraftExtractionSystemPrompt = [
  "You extract reviewable Vietnam road-trip knowledge drafts from operator-provided source text.",
  "Write all user-facing draft values in natural Vietnamese by default, including title, summary, practical_details values, location_name, route_segment, and tags. Keep JSON keys and enum values exactly as specified in English.",
  "Return only strict JSON with a drafts array. Do not include markdown, commentary, citations, provider metadata, source snippets, or raw source text.",
  "Paraphrase aggressively: do not copy any phrase, sentence, phone number, email, contact detail, or private note from source_text into title, summary, practical_details, tags, location_name, or route_segment. Use short operator-safe summaries instead.",
  "Each draft must include: type, title, summary, practical_details, tags, confidence, freshness_sensitive, and at least one of location_name or route_segment.",
  "Allowed types: place, food, hotel_area, activity, service, route_note, warning, cost_note, parking, ev_charging, kid_friendly_tip, discount_promotion, general_travel_tip.",
  "Allowed confidence labels: unverified, community, curated, partner, official. Community/Facebook/copied material must stay unverified or community unless source metadata explicitly says official or partner.",
  "Use freshness_sensitive=true for prices, schedules, opening hours, availability, road conditions, service status, promotions, parking capacity, weather, or other facts likely to change.",
  "Extract practical, atomic cards useful for a Hanoi-to-HCMC road trip review queue. If the source has no useful travel facts, return {\"drafts\":[]}.",
  "Never approve, publish, embed, retrieve, or instruct the system to mutate existing knowledge. These are drafts for human review only.",
].join("\n");

const sourceKnowledgeSuggestionSystemPrompt = [
  "You compare one operator-provided URL source against existing safe Vietnam road-trip knowledge summaries.",
  "Write all user-facing suggestion and draft values in natural Vietnamese by default, including before_summary, after_summary, conflict_summary, rationale, title, summary, practical_details values, location_name, route_segment, and tags. Keep JSON keys and enum values exactly as specified in English.",
  "Return only strict JSON with a suggestions array. Do not include markdown, commentary, citations, raw source snippets, provider metadata, file metadata, or storage keys.",
  "Paraphrase aggressively: do not copy any phrase, sentence, phone number, email, contact detail, or private note from source_text into summaries, rationale, draft fields, tags, location_name, or route_segment. Use short operator-safe summaries instead.",
  "Each suggestion action must be one of: create, update, conflict, duplicate, no_action.",
  "For create/update/conflict, include a reviewable draft object with: type, title, summary, practical_details, tags, confidence, freshness_sensitive, and location_name or route_segment.",
  "For update/conflict/duplicate, include target_card_id from the provided candidates. Never invent target ids.",
  "Use before_summary, after_summary, conflict_summary, and rationale as short safe operator summaries, not source quotes.",
  "Allowed types: place, food, hotel_area, activity, service, route_note, warning, cost_note, parking, ev_charging, kid_friendly_tip, discount_promotion, general_travel_tip.",
  "Allowed confidence labels: unverified, community, curated, partner, official. Community/unverified sources must not be upgraded beyond their source metadata.",
  "Use duplicate when the source adds no meaningful new facts to an existing card. Use no_action when it has no useful road-trip knowledge.",
  "Never approve, publish, embed, retrieve, or instruct the system to mutate existing knowledge. These are review suggestions only.",
].join("\n");

export function buildInitialAiAskMessages(question: string) {
  return buildAiAskMessages({ question, history: [] });
}

export function buildAiAskMessages({
  question,
  history,
  contextSection,
}: {
  question: string;
  history: PromptHistoryMessage[];
  contextSection?: string;
}) {
  const recentHistory = selectRecentPromptHistory(history);
  const systemContent = contextSection ? `${aiAskSystemPrompt}\n\n${contextSection}` : aiAskSystemPrompt;

  return [
    {
      role: "system" as const,
      content: systemContent,
    },
    ...recentHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user" as const,
      content: question,
    },
  ];
}

export function buildChatContextExtractionMessages({
  question,
  history,
  projectScopeAvailable,
}: {
  question: string;
  history: PromptHistoryMessage[];
  projectScopeAvailable: boolean;
}) {
  const recentHistory = selectRecentPromptHistory(history).slice(-6);

  return [
    {
      role: "system" as const,
      content: chatContextExtractionSystemPrompt,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        project_scope_available: projectScopeAvailable,
        recent_history: recentHistory,
        latest_user_message: question,
        expected_output: {
          facts: [
            {
              field: "one_allowed_field_name",
              value: "corrected_or_new_value",
              scope: projectScopeAvailable ? "trip_project" : "conversation",
              confidence: 85,
            },
          ],
        },
      }),
    },
  ];
}

export function buildSourceKnowledgeDraftExtractionMessages({
  source,
  rawText,
}: {
  source: {
    kind: string;
    label: string;
    publisher: string | null;
    collectedDate: string | null;
    sourceType: string;
    verificationStatus: string;
    official: boolean;
    partner: boolean;
  };
  rawText: string;
}) {
  return [
    {
      role: "system" as const,
      content: sourceKnowledgeDraftExtractionSystemPrompt,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        source_metadata: source,
        source_text: rawText,
        expected_output: {
          drafts: [
            {
              type: "place",
              title: "Tiêu đề ngắn an toàn",
              location_name: "Địa điểm hoặc khu vực nếu biết",
              route_segment: "Cung đường nếu biết",
              summary: "Tóm tắt sự kiện cần duyệt, không sao chép nguyên văn nguồn",
              practical_details: {
                tips: ["mẹo thực tế ngắn"],
                warnings: ["cảnh báo ngắn khi phù hợp"],
                cost_notes: ["ghi chú giá hoặc phí khi phù hợp"],
                parking_notes: ["ghi chú đậu xe khi phù hợp"],
                kid_notes: ["ghi chú cho gia đình khi phù hợp"],
              },
              tags: ["the_ngan"],
              confidence: source.sourceType === "community" ? "community" : "unverified",
              freshness_sensitive: false,
            },
          ],
        },
      }),
    },
  ];
}

export function buildSourceKnowledgeSuggestionMessages({
  source,
  rawText,
  candidates,
}: {
  source: {
    kind: string;
    label: string;
    publisher: string | null;
    collectedDate: string | null;
    sourceType: string;
    verificationStatus: string;
    official: boolean;
    partner: boolean;
    canonicalUrl: string | null;
  };
  rawText: string;
  candidates: Array<{
    id: string;
    status: string;
    type: string;
    title: string;
    locationName: string | null;
    routeSegment: string | null;
    summary: string;
    confidence: string;
    freshnessSensitive: boolean;
    tags: string[];
  }>;
}) {
  return [
    {
      role: "system" as const,
      content: sourceKnowledgeSuggestionSystemPrompt,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        source_metadata: source,
        source_text: rawText,
        existing_candidates: candidates,
        expected_output: {
          suggestions: [
            {
              action: "update",
              target_card_id: "existing_candidate_id_when_needed",
              before_summary: "Tóm tắt ngắn trạng thái hiện tại để operator duyệt",
              after_summary: "Tóm tắt ngắn thay đổi đề xuất để operator duyệt",
              conflict_summary: "Tóm tắt ngắn xung đột khi action là conflict",
              rationale: "Lý do đề xuất action này",
              draft: {
                type: "place",
                title: "Tiêu đề ngắn an toàn",
                location_name: "Địa điểm hoặc khu vực nếu biết",
                route_segment: "Cung đường nếu biết",
                summary: "Tri thức đề xuất cần duyệt, không sao chép nguyên văn nguồn",
                practical_details: { tips: ["mẹo thực tế ngắn"] },
                tags: ["the_ngan"],
                confidence: source.sourceType === "community" ? "community" : "unverified",
                freshness_sensitive: false,
              },
            },
          ],
        },
      }),
    },
  ];
}

function selectRecentPromptHistory(history: PromptHistoryMessage[]) {
  const selected: PromptHistoryMessage[] = [];
  let remainingCharacters = maxPromptHistoryCharacters;

  for (const message of history.slice(-maxPromptHistoryMessages).reverse()) {
    if (remainingCharacters <= 0) {
      break;
    }

    const content = message.content.slice(-remainingCharacters);
    selected.unshift({ ...message, content });
    remainingCharacters -= content.length;
  }

  return selected;
}
