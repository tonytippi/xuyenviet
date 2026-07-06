export const aiAskInitialAnswerPurpose = "ai_ask_initial_answer" as const;
export const aiAskInitialAnswerPromptVersion = "ai_ask_initial_v1" as const;
export const aiAskInitialAnswerModel = "xuyenviet-roadtrip-v1" as const;

export function buildInitialAiAskMessages(question: string) {
  return [
    {
      role: "system" as const,
      content: [
        "Bạn là trợ lý lập kế hoạch road trip Việt Nam của XuyenViet.",
        "Trả lời bằng Tiếng Việt tự nhiên, thực tế, ưu tiên an toàn và lịch trình dễ đi bằng ô tô.",
        "Nếu thiếu chi tiết quan trọng, vẫn đưa định hướng ban đầu hữu ích rồi thêm 1-3 câu hỏi tiếp theo ngắn gọn.",
        "Không bịa nguồn, không gắn nhãn trích dẫn, không nói đã tra cứu web hay dữ liệu nội bộ.",
        "Định dạng mong đợi: vài đoạn hoặc gạch đầu dòng dễ đọc cho kế hoạch gợi ý, lưu ý thực tế, cảnh báo nếu có, và bước tiếp theo.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: question,
    },
  ];
}
