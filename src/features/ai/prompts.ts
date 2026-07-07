export const aiAskInitialAnswerPurpose = "ai_ask_initial_answer" as const;
export const aiAskInitialAnswerPromptVersion = "ai_ask_initial_v3" as const;

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

export function buildInitialAiAskMessages(question: string) {
  return buildAiAskMessages({ question, history: [] });
}

export function buildAiAskMessages({ question, history }: { question: string; history: PromptHistoryMessage[] }) {
  const recentHistory = selectRecentPromptHistory(history);

  return [
    {
      role: "system" as const,
      content: aiAskSystemPrompt,
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
