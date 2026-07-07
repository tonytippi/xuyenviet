export const aiAskInitialAnswerPurpose = "ai_ask_initial_answer" as const;
export const aiAskInitialAnswerPromptVersion = "ai_ask_initial_v4" as const;
export const chatContextExtractionPurpose = "extraction" as const;
export const chatContextExtractionPromptVersion = "chat_context_extraction_v1" as const;

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
  "Mục Nguồn và độ tin cậy chỉ được nói rõ khi câu trả lời đang dựa trên hướng dẫn tổng quát hoặc thông tin người dùng cung cấp; không bịa nguồn, không gắn nhãn trích dẫn, không tạo citation như [1], và không nói đã tra cứu web hay dữ liệu nội bộ.",
  "Nếu câu hỏi nằm ngoài trọng tâm Hà Nội - TP.HCM hoặc ngoài phạm vi dữ liệu tuyển chọn hiện có, hãy nói đây là gợi ý tổng quát và tránh khẳng định XuyenViet có dữ liệu địa phương đã kiểm chứng.",
].join("\n");

const chatContextExtractionSystemPrompt = [
  "You extract structured Vietnam road-trip planning context from chat turns.",
  "Return only compact JSON. Do not include markdown, commentary, or raw provider metadata.",
  "Allowed fields: origin, destination, start_date, end_date, duration, adults, children, children_ages, budget, hotel_style, driving_tolerance, vehicle_needs, food_preferences, activity_preferences, itinerary_constraints, avoid_places, prior_trips, notes.",
  "Return an object with a facts array. Each fact must have field, value, scope, and optional confidence.",
  "Use scope trip_project only for durable trip-planning facts when project_scope_available is true. Use scope conversation for temporary turn-specific facts or when project_scope_available is false.",
  "Do not extract child full names, phone numbers, emails, addresses, government IDs, medical details, payment data, credentials, unrelated personal facts, image facts, or any unknown fields.",
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
              field: "destination",
              value: "Đà Nẵng",
              scope: projectScopeAvailable ? "trip_project" : "conversation",
              confidence: 85,
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
