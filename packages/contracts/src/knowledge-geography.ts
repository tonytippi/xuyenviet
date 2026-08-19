export const knowledgeProvinceReferenceVersion = "vn-admin-2025-07-01";
export const knowledgeProvinceReferenceEffectiveDate = "2025-07-01";
export const knowledgeProvinceReferenceProvenance = "https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm";

export type KnowledgeProvinceReference = Readonly<{ id: string; displayName: string; currentUnitId: string }>;

// Resolution 202/2025/QH15: only governed province-level names are accepted.
const currentUnits = [
  ["vn-01-ha-noi", "Hà Nội"], ["vn-02-cao-bang", "Cao Bằng"], ["vn-03-lang-son", "Lạng Sơn"], ["vn-04-quang-ninh", "Quảng Ninh"], ["vn-05-bac-ninh", "Bắc Ninh"], ["vn-06-hung-yen", "Hưng Yên"], ["vn-07-hai-phong", "Hải Phòng"], ["vn-08-ninh-binh", "Ninh Bình"], ["vn-09-phu-tho", "Phú Thọ"], ["vn-10-thai-nguyen", "Thái Nguyên"], ["vn-11-tuyen-quang", "Tuyên Quang"], ["vn-12-lao-cai", "Lào Cai"], ["vn-13-lai-chau", "Lai Châu"], ["vn-14-dien-bien", "Điện Biên"], ["vn-15-son-la", "Sơn La"], ["vn-16-thanh-hoa", "Thanh Hóa"], ["vn-17-nghe-an", "Nghệ An"], ["vn-18-ha-tinh", "Hà Tĩnh"], ["vn-19-quang-tri", "Quảng Trị"], ["vn-20-hue", "Huế"], ["vn-21-da-nang", "Đà Nẵng"], ["vn-22-quang-ngai", "Quảng Ngãi"], ["vn-23-gia-lai", "Gia Lai"], ["vn-24-dak-lak", "Đắk Lắk"], ["vn-25-khanh-hoa", "Khánh Hòa"], ["vn-26-lam-dong", "Lâm Đồng"], ["vn-27-ho-chi-minh", "Thành phố Hồ Chí Minh"], ["vn-28-dong-nai", "Đồng Nai"], ["vn-29-tay-ninh", "Tây Ninh"], ["vn-30-can-tho", "Cần Thơ"], ["vn-31-vinh-long", "Vĩnh Long"], ["vn-32-dong-thap", "Đồng Tháp"], ["vn-33-ca-mau", "Cà Mau"], ["vn-34-an-giang", "An Giang"],
] as const;

const legacyMappings = [
  ["Hà Giang", "vn-11-tuyen-quang"], ["Bắc Kạn", "vn-10-thai-nguyen"], ["Bắc Giang", "vn-05-bac-ninh"], ["Hải Dương", "vn-07-hai-phong"], ["Thái Bình", "vn-06-hung-yen"], ["Hà Nam", "vn-08-ninh-binh"], ["Nam Định", "vn-08-ninh-binh"], ["Vĩnh Phúc", "vn-09-phu-tho"], ["Hòa Bình", "vn-09-phu-tho"], ["Yên Bái", "vn-12-lao-cai"], ["Quảng Bình", "vn-19-quang-tri"], ["Quảng Nam", "vn-21-da-nang"], ["Kon Tum", "vn-22-quang-ngai"], ["Bình Định", "vn-23-gia-lai"], ["Phú Yên", "vn-24-dak-lak"], ["Ninh Thuận", "vn-25-khanh-hoa"], ["Đắk Nông", "vn-26-lam-dong"], ["Bình Thuận", "vn-26-lam-dong"], ["Bà Rịa - Vũng Tàu", "vn-27-ho-chi-minh"], ["Bình Dương", "vn-27-ho-chi-minh"], ["Bình Phước", "vn-28-dong-nai"], ["Long An", "vn-29-tay-ninh"], ["Sóc Trăng", "vn-30-can-tho"], ["Hậu Giang", "vn-30-can-tho"], ["Bến Tre", "vn-31-vinh-long"], ["Trà Vinh", "vn-31-vinh-long"], ["Tiền Giang", "vn-32-dong-thap"], ["Bạc Liêu", "vn-33-ca-mau"], ["Kiên Giang", "vn-34-an-giang"],
] as const;

export const knowledgeProvinceReferenceFixture = Object.freeze([
  ...currentUnits.map(([id, displayName]) => ({ id, displayName, currentUnitId: id })),
  ...legacyMappings.map(([displayName, currentUnitId]) => ({ id: `legacy-${displayName.replaceAll("Đ", "D").replaceAll("đ", "d").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`, displayName, currentUnitId })),
].map((reference) => Object.freeze(reference))) as readonly KnowledgeProvinceReference[];

export const governedKnowledgeProvinceIds = Object.freeze(currentUnits.map(([id]) => id));
const coverageNamesById = new Map<string, Readonly<{ currentName: string; legacyNames: readonly string[] }>>(governedKnowledgeProvinceIds.map((id) => [id, Object.freeze({
  currentName: knowledgeProvinceReferenceFixture.find((reference) => reference.id === id)!.displayName,
  legacyNames: Object.freeze(knowledgeProvinceReferenceFixture.filter((reference) => reference.currentUnitId === id && reference.id !== id).map((reference) => reference.displayName)),
})]));

export function knowledgeProvinceCoverageNames(canonicalProvinceId: string) {
  const value = coverageNamesById.get(canonicalProvinceId);
  return value ? { currentName: value.currentName, legacyNames: [...value.legacyNames] } : null;
}

export function matchesKnowledgeProvinceCoverageNames(canonicalProvinceId: string, currentName: unknown, legacyNames: unknown): boolean {
  const expected = coverageNamesById.get(canonicalProvinceId);
  return expected !== undefined && currentName === expected.currentName && Array.isArray(legacyNames) && legacyNames.length === expected.legacyNames.length && legacyNames.every((name, index) => name === expected.legacyNames[index]);
}
