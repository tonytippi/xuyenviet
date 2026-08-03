const corridorBuckets = [
  { label: "Hà Nội", aliases: ["ha noi", "hanoi"] }, { label: "Ninh Bình", aliases: ["ninh binh"] }, { label: "Thanh Hóa", aliases: ["thanh hoa"] }, { label: "Nghệ An / Vinh", aliases: ["nghe an", "vinh"] }, { label: "Hà Tĩnh", aliases: ["ha tinh"] }, { label: "Quảng Bình / Đồng Hới", aliases: ["quang binh", "dong hoi"] }, { label: "Quảng Trị", aliases: ["quang tri"] }, { label: "Huế", aliases: ["hue"] }, { label: "Đà Nẵng", aliases: ["da nang"] }, { label: "Hội An / Quảng Nam", aliases: ["hoi an", "quang nam"] }, { label: "Quảng Ngãi", aliases: ["quang ngai"] }, { label: "Quy Nhơn / Bình Định", aliases: ["quy nhon", "binh dinh"] }, { label: "Phú Yên / Tuy Hòa", aliases: ["phu yen", "tuy hoa"] }, { label: "Nha Trang / Khánh Hòa", aliases: ["nha trang", "khanh hoa"] }, { label: "Phan Rang / Ninh Thuận", aliases: ["phan rang", "ninh thuan"] }, { label: "Phan Thiết / Bình Thuận", aliases: ["phan thiet", "binh thuan"] }, { label: "Đồng Nai", aliases: ["dong nai"] }, { label: "TP.HCM / Sài Gòn", aliases: ["tp hcm", "tphcm", "ho chi minh", "sai gon", "hcmc"] },
] as const;

export function getCorridorBucketLabel(routeSegment: string | null, locationName: string | null) {
  const normalizedValue = ` ${normalizeSearchText([routeSegment, locationName].filter(Boolean).join(" "))} `;
  for (const bucket of corridorBuckets) {
    if (bucket.aliases.some((alias) => normalizedValue.includes(` ${normalizeSearchText(alias)} `))) return bucket.label;
  }
  return null;
}

export function getCorridorBuckets() {
  return corridorBuckets;
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
