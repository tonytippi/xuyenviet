export type CanonicalYoutubeVideo = Readonly<{ videoId: string; canonicalUrl: string }>;
export type YoutubeCaptureEligibility = "eligible" | "already_compatible" | "unavailable";
/** Knowledge owns the current compatibility descriptor; Discovery supplies identity only. */
export type YoutubeCaptureEligibilityPort = Readonly<{ check(videoId: string, signal?: AbortSignal): Promise<YoutubeCaptureEligibility> }>;

const videoIdPattern = /^[A-Za-z0-9_-]{6,20}$/;

/** Accept only the small, documented set of individual YouTube video URL forms. */
export function canonicalizeYoutubeVideoUrl(value: string): CanonicalYoutubeVideo | null {
  try {
    // WHATWG URL accepts malformed escapes in paths; reject them before parsing.
    if (/%(?![0-9a-f]{2})/i.test(value)) return null;
    const url = new URL(value);
    // URL normalizes an explicit default :443 away, so inspect the raw authority too.
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || /^https:\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(value)) return null;
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (!host || url.hostname !== host && url.hostname.toLowerCase().replace(/\.+$/, "") !== host) return null;
    let videoId: string | null = null;
    if (host === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      videoId = parts.length === 1 ? parts[0] : null;
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (url.pathname !== "/watch" || url.searchParams.getAll("v").length !== 1) return null;
      videoId = url.searchParams.get("v");
    } else return null;
    if (!videoId || !videoIdPattern.test(videoId)) return null;
    return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch {
    return null;
  }
}
