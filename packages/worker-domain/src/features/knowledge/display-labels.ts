export const knowledgeCardTypeLabels: Record<string, string> = {
  place: "Địa điểm",
  food: "Ăn uống",
  hotel_area: "Khu vực lưu trú",
  activity: "Hoạt động",
  service: "Dịch vụ",
  route_note: "Lưu ý tuyến đường",
  warning: "Cảnh báo",
  cost_note: "Chi phí",
  parking: "Đỗ xe",
  ev_charging: "Sạc xe điện",
  kid_friendly_tip: "Mẹo cho gia đình có trẻ nhỏ",
  discount_promotion: "Ưu đãi",
  general_travel_tip: "Mẹo du lịch",
};

export const knowledgeCardStatusLabels: Record<string, string> = {
  draft: "Bản nháp",
  approved: "Đã phê duyệt",
  archived: "Đã lưu trữ",
  rejected: "Đã từ chối",
  duplicate: "Trùng lặp",
  no_action: "Không cần xử lý",
};

export const knowledgeConfidenceLabels: Record<string, string> = {
  unverified: "Chưa xác minh",
  community: "Cộng đồng",
  curated: "Đã tuyển chọn",
  partner: "Đối tác",
  official: "Chính thức",
};

export const sourceKindLabels: Record<string, string> = {
  url: "Trang web",
  facebook: "Facebook",
  youtube: "YouTube",
  copied_post: "Bài viết đã sao chép",
  pasted_text: "Văn bản đã dán",
  screenshot: "Ảnh chụp màn hình",
};

export const sourceTypeLabels: Record<string, string> = {
  curated: "Đã tuyển chọn",
  community: "Cộng đồng",
};

export const verificationStatusLabels: Record<string, string> = {
  verified: "Đã xác minh",
  unverified: "Chưa xác minh",
};

export const evidenceSupportLevelLabels: Record<string, string> = {
  primary: "Chính",
  supporting: "Bổ sung",
  conflicting: "Mâu thuẫn",
};

export const recommendationReasonLabels: Record<string, string> = {
  risk: "Rủi ro",
  weak_evidence: "Bằng chứng yếu",
  freshness: "Thông tin có thể đã cũ",
  conflict: "Có thông tin mâu thuẫn",
  duplicate_risk: "Nguy cơ trùng lặp",
  missing_context: "Thiếu ngữ cảnh",
  verification: "Cần xác minh",
  relation: "Cần đối chiếu thẻ liên quan",
  sampling: "Kiểm tra lấy mẫu",
};

export const sourceIntakeActionLabels: Record<string, string> = {
  create: "Tạo thẻ mới từ nguồn",
  update: "Cập nhật thẻ từ nguồn",
  conflict: "Thông tin nguồn mâu thuẫn",
};

export const seedBatchItemStatusLabels: Record<string, string> = {
  pending: "Đang chờ xử lý",
  reading: "Đang đọc nguồn",
  extracted: "Đã trích xuất",
  needs_review: "Cần kiểm tra",
  approved: "Đã phê duyệt",
  failed: "Xử lý thất bại",
  duplicate: "Trùng lặp",
  rejected: "Đã từ chối",
};

export function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}
