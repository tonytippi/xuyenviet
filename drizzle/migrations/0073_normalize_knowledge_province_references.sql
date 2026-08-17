CREATE TABLE "knowledge_province_references" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "current_unit_id" text NOT NULL,
  "version" text NOT NULL,
  "effective_date" text NOT NULL,
  "official_source_url" text NOT NULL,
  CONSTRAINT "knowledge_province_references_current_unit_fk" FOREIGN KEY ("current_unit_id") REFERENCES "knowledge_province_references"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_province_references_display_name_check" CHECK (length(btrim("display_name")) between 1 and 160),
  CONSTRAINT "knowledge_province_references_version_check" CHECK (length(btrim("version")) between 1 and 80),
  CONSTRAINT "knowledge_province_references_effective_date_check" CHECK ("effective_date" ~ '^\\d{4}-\\d{2}-\\d{2}$'),
  CONSTRAINT "knowledge_province_references_source_check" CHECK ("official_source_url" ~ '^https://')
);
CREATE UNIQUE INDEX "knowledge_province_references_name_version_idx" ON "knowledge_province_references" ("display_name", "version");
CREATE UNIQUE INDEX "knowledge_province_references_id_display_name_idx" ON "knowledge_province_references" ("id", "display_name");

INSERT INTO "knowledge_province_references" ("id", "display_name", "current_unit_id", "version", "effective_date", "official_source_url") VALUES
('vn-01-ha-noi','Hà Nội','vn-01-ha-noi','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-02-cao-bang','Cao Bằng','vn-02-cao-bang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-03-lang-son','Lạng Sơn','vn-03-lang-son','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-04-quang-ninh','Quảng Ninh','vn-04-quang-ninh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-05-bac-ninh','Bắc Ninh','vn-05-bac-ninh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-06-hung-yen','Hưng Yên','vn-06-hung-yen','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-07-hai-phong','Hải Phòng','vn-07-hai-phong','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-08-ninh-binh','Ninh Bình','vn-08-ninh-binh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-09-phu-tho','Phú Thọ','vn-09-phu-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-10-thai-nguyen','Thái Nguyên','vn-10-thai-nguyen','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-11-tuyen-quang','Tuyên Quang','vn-11-tuyen-quang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-12-lao-cai','Lào Cai','vn-12-lao-cai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-13-lai-chau','Lai Châu','vn-13-lai-chau','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-14-dien-bien','Điện Biên','vn-14-dien-bien','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-15-son-la','Sơn La','vn-15-son-la','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-16-thanh-hoa','Thanh Hóa','vn-16-thanh-hoa','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-17-nghe-an','Nghệ An','vn-17-nghe-an','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-18-ha-tinh','Hà Tĩnh','vn-18-ha-tinh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-19-quang-tri','Quảng Trị','vn-19-quang-tri','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-20-hue','Huế','vn-20-hue','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-21-da-nang','Đà Nẵng','vn-21-da-nang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-22-quang-ngai','Quảng Ngãi','vn-22-quang-ngai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-23-gia-lai','Gia Lai','vn-23-gia-lai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-24-dak-lak','Đắk Lắk','vn-24-dak-lak','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-25-khanh-hoa','Khánh Hòa','vn-25-khanh-hoa','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-26-lam-dong','Lâm Đồng','vn-26-lam-dong','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-27-ho-chi-minh','Thành phố Hồ Chí Minh','vn-27-ho-chi-minh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-28-dong-nai','Đồng Nai','vn-28-dong-nai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-29-tay-ninh','Tây Ninh','vn-29-tay-ninh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-30-can-tho','Cần Thơ','vn-30-can-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-31-vinh-long','Vĩnh Long','vn-31-vinh-long','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-32-dong-thap','Đồng Tháp','vn-32-dong-thap','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-33-ca-mau','Cà Mau','vn-33-ca-mau','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('vn-34-an-giang','An Giang','vn-34-an-giang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm');

INSERT INTO "knowledge_province_references" ("id", "display_name", "current_unit_id", "version", "effective_date", "official_source_url") VALUES
('legacy-ha-giang','Hà Giang','vn-11-tuyen-quang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-bac-kan','Bắc Kạn','vn-10-thai-nguyen','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-bac-giang','Bắc Giang','vn-05-bac-ninh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-hai-duong','Hải Dương','vn-07-hai-phong','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-thai-binh','Thái Bình','vn-06-hung-yen','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-ha-nam','Hà Nam','vn-08-ninh-binh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-nam-dinh','Nam Định','vn-08-ninh-binh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-vinh-phuc','Vĩnh Phúc','vn-09-phu-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-hoa-binh','Hòa Bình','vn-09-phu-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-yen-bai','Yên Bái','vn-12-lao-cai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-quang-binh','Quảng Bình','vn-19-quang-tri','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-quang-nam','Quảng Nam','vn-21-da-nang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-kon-tum','Kon Tum','vn-22-quang-ngai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-binh-dinh','Bình Định','vn-23-gia-lai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-phu-yen','Phú Yên','vn-24-dak-lak','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-ninh-thuan','Ninh Thuận','vn-25-khanh-hoa','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-dak-nong','Đắk Nông','vn-26-lam-dong','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-binh-thuan','Bình Thuận','vn-26-lam-dong','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-ba-ria-vung-tau','Bà Rịa - Vũng Tàu','vn-27-ho-chi-minh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-binh-duong','Bình Dương','vn-27-ho-chi-minh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-binh-phuoc','Bình Phước','vn-28-dong-nai','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-long-an','Long An','vn-29-tay-ninh','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-soc-trang','Sóc Trăng','vn-30-can-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-hau-giang','Hậu Giang','vn-30-can-tho','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-ben-tre','Bến Tre','vn-31-vinh-long','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-tra-vinh','Trà Vinh','vn-31-vinh-long','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-tien-giang','Tiền Giang','vn-32-dong-thap','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-bac-lieu','Bạc Liêu','vn-33-ca-mau','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm'),
('legacy-kien-giang','Kiên Giang','vn-34-an-giang','vn-admin-2025-07-01','2025-07-01','https://xaydungchinhsach.chinhphu.vn/nghi-quyet-ve-viec-sap-xep-don-vi-hanh-chinh-cap-tinh-nam-2025-119250612180438108.htm');

ALTER TABLE "knowledge_ingestion_candidates" ADD COLUMN "normalized_current_province_id" text;
ALTER TABLE "knowledge_ingestion_candidates" ADD COLUMN "normalized_current_province_name" text;
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_normalized_province_pair_fk" FOREIGN KEY ("normalized_current_province_id", "normalized_current_province_name") REFERENCES "knowledge_province_references"("id", "display_name") ON DELETE RESTRICT;
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_normalized_province_shape_check" CHECK (("normalized_current_province_id" is null and "normalized_current_province_name" is null) or ("normalized_current_province_id" is not null and "normalized_current_province_name" is not null and length(btrim("normalized_current_province_name")) between 1 and 160));
ALTER TABLE "knowledge_cards" ADD COLUMN "normalized_current_province_id" text;
ALTER TABLE "knowledge_cards" ADD COLUMN "normalized_current_province_name" text;
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_normalized_province_pair_fk" FOREIGN KEY ("normalized_current_province_id", "normalized_current_province_name") REFERENCES "knowledge_province_references"("id", "display_name") ON DELETE RESTRICT;
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_normalized_province_shape_check" CHECK (("normalized_current_province_id" is null and "normalized_current_province_name" is null) or ("normalized_current_province_id" is not null and "normalized_current_province_name" is not null and length(btrim("normalized_current_province_name")) between 1 and 160));

UPDATE "knowledge_ingestion_candidates" AS candidate SET "normalized_current_province_id" = reference."current_unit_id", "normalized_current_province_name" = current_unit."display_name"
FROM "knowledge_province_references" AS reference JOIN "knowledge_province_references" AS current_unit ON current_unit."id" = reference."current_unit_id"
WHERE candidate."normalized_current_province_id" IS NULL AND candidate."location_name" = reference."display_name";
UPDATE "knowledge_cards" AS card SET "normalized_current_province_id" = reference."current_unit_id", "normalized_current_province_name" = current_unit."display_name"
FROM "knowledge_province_references" AS reference JOIN "knowledge_province_references" AS current_unit ON current_unit."id" = reference."current_unit_id"
WHERE card."normalized_current_province_id" IS NULL AND card."location_name" = reference."display_name";
UPDATE "knowledge_card_search_documents" AS document SET "searchable_text" = document."searchable_text" || E'\n' || card."normalized_current_province_name", "text_hash" = encode(public.digest(document."searchable_text" || E'\n' || card."normalized_current_province_name", 'sha256'), 'hex'), "updated_at" = now()
FROM "knowledge_cards" AS card
WHERE card."id" = document."knowledge_card_id" AND card."normalized_current_province_name" IS NOT NULL AND card."normalized_current_province_name" IS DISTINCT FROM card."location_name";
