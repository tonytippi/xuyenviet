export const tripPlanAnchorRoleLabels: Record<"origin" | "destination" | "region" | "required_stop" | "accommodation", string> = {
  origin: "Điểm đi",
  destination: "Điểm đến",
  region: "Vùng",
  required_stop: "Điểm dừng bắt buộc",
  accommodation: "Lưu trú",
};

export type TripHomeFocusKind = "pending-proposal-with-expiry" | "pending-proposal" | "confirmed-item-gap" | "next-leg" | "preparation";

export const tripHomeFocusKindLabels: Record<TripHomeFocusKind, string> = {
  "pending-proposal-with-expiry": "Đề xuất sắp hết hạn",
  "pending-proposal": "Đề xuất đang chờ",
  "confirmed-item-gap": "Còn thiếu thông tin đã chốt",
  "next-leg": "Chặng tiếp theo",
  preparation: "Chuẩn bị cho chuyến đi",
};

export const tripHomeFocusNextActions: Record<TripHomeFocusKind, string> = {
  "pending-proposal-with-expiry": "Xem đề xuất và tác động",
  "pending-proposal": "Xem đề xuất và tác động",
  "confirmed-item-gap": "Bổ sung thông tin trong cuộc trò chuyện",
  "next-leg": "Xem chi tiết chặng trong dòng thời gian",
  preparation: "Bắt đầu thêm ý tưởng hoặc chặng trong cuộc trò chuyện",
};

export const tripChangeProposalLabels = {
  badge: "Đề xuất",
  apply: "Áp dụng",
  keepPlan: "Giữ kế hoạch",
  viewAlternatives: "Xem phương án khác",
  expired: "Đã hết hạn",
  suggestionNote: "Đây là đề xuất, không phải đặt phòng, kiểm tra đường đi, thời tiết hay tình trạng còn chỗ.",
  beforeAfter: "Tác động kế hoạch",
  rationale: "Lý do",
  affectedItems: "Mục bị tác động",
  alternatives: "Phương án khác",
  refreshHint: "Kế hoạch đã thay đổi - làm mới đề xuất",
  applied: "Đã áp dụng",
  dismissed: "Đã giữ kế hoạch",
  refresh: "Làm mới đề xuất",
  applying: "Đang áp dụng...",
  keepingPlan: "Đang giữ kế hoạch...",
  planHistory: "Lịch sử kế hoạch",
  actorYou: "Bạn",
  actorSystem: "Hệ thống",
} as const;
