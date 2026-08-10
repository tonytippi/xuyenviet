export const youtubeDiscoveryReviewCopy = {
  recommendation: { consider: "Nên xem xét" },
  reason: { eligible_score_band: "Nằm trong nhóm điểm ưu tiên xem xét" },
  queryReason: { coverage_gap: "Bổ sung vùng thông tin còn thiếu", freshness_risk: "Kiểm tra thông tin có nguy cơ lỗi thời", unresolved_conflict: "Làm rõ thông tin còn mâu thuẫn", anonymized_demand: "Đáp ứng nhu cầu đã được ẩn danh", operator_request: "Yêu cầu do người vận hành tạo" },
  factor: { relevance: "Phù hợp chủ đề", expected_value: "Giá trị dự kiến", freshness_fit: "Phù hợp độ mới" },
  penalty: { commercial_risk: "Rủi ro thương mại", duplicate_risk: "Nguy cơ trùng lặp" },
  signal: { recent_discussion: "Thảo luận gần đây", stale_or_changed_warning: "Có thể đã thay đổi", practical_question_demand: "Nhu cầu câu hỏi thực tế", creator_responsiveness: "Tác giả phản hồi", commercial_risk: "Dấu hiệu thương mại", contradictory_discussion: "Thảo luận trái chiều" },
  priorCaptureOutcome: { eligible: "Chưa có bản tương thích", already_compatible: "Đã có bản tương thích", unavailable: "Chưa thể kiểm tra" },
  accept: { pending: "Đang thêm URL", reconciling: "Đang kiểm tra kết quả thêm URL", submitted: "Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.", duplicate: "URL này đã có trong nguồn chờ xử lý hoặc đã được lưu trước đó.", failed: "Không thể thêm URL lúc này. Bạn có thể thử lại." },
} as const;
