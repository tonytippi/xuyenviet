export type YoutubeMediaResolution = "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";
export type YoutubeCaptureCompatibilityDescriptor = Readonly<{ captureMethodVersion: string; payloadSchemaVersion: string }>;
export const defaultYoutubeMediaResolution: YoutubeMediaResolution = "MEDIA_RESOLUTION_LOW";

/** Parse the one capture setting shared by capture and Knowledge eligibility. */
export function resolveYoutubeMediaResolution(value: string | undefined): YoutubeMediaResolution {
  if (!value) return defaultYoutubeMediaResolution;
  if (value === "MEDIA_RESOLUTION_LOW" || value === "MEDIA_RESOLUTION_MEDIUM" || value === "MEDIA_RESOLUTION_HIGH") return value;
  throw new Error("GEMINI_YOUTUBE_MEDIA_RESOLUTION must be MEDIA_RESOLUTION_LOW, MEDIA_RESOLUTION_MEDIUM, or MEDIA_RESOLUTION_HIGH.");
}

/** The aggregate representation version is owned by Knowledge, not Discovery. */
export function youtubeCaptureCompatibilityForMediaResolution(mediaResolution: YoutubeMediaResolution): YoutubeCaptureCompatibilityDescriptor {
  return {
    captureMethodVersion: `youtube-gemini-windowed-v4-aggregate-${mediaResolution.replace("MEDIA_RESOLUTION_", "").toLowerCase()}`,
    payloadSchemaVersion: "2",
  };
}

/** The exact durable representation that Knowledge currently considers reusable. */
export const currentYoutubeCaptureCompatibility = youtubeCaptureCompatibilityForMediaResolution(defaultYoutubeMediaResolution);
