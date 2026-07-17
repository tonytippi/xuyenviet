export const FACEBOOK_CAPTURE_METHOD_VERSION = "facebook-visible-dom-v2";
export const YOUTUBE_CAPTURE_METHOD_VERSION = "youtube-gemini-v1";
export const CAPTURE_PAYLOAD_SCHEMA_VERSION = "1";

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase() === "fbclid" || key.toLowerCase() === "rdid" || key.toLowerCase().startsWith("utm_") || key.startsWith("__")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function extractFacebookPostId(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/(?:permalink|posts)\/(\d+)/i)?.[1] ?? url.searchParams.get("story_fbid") ?? url.searchParams.get("fbid") ?? null;
  } catch {
    return null;
  }
}

export function canonicalizeFacebookUrl(value: string) {
  const url = canonicalUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (!(parsed.hostname === "facebook.com" || parsed.hostname.endsWith(".facebook.com") || parsed.hostname === "fb.com" || parsed.hostname === "fb.watch")) return null;
  if (!/\/share\/|\/posts\/|\/permalink\//.test(parsed.pathname) && !parsed.searchParams.has("story_fbid")) return null;
  const shareMatch = parsed.pathname.match(/^(\/share\/[^/]+\/[^/]+)/i);
  if (shareMatch) parsed.pathname = shareMatch[1];
  parsed.hostname = "facebook.com";
  return parsed.toString();
}

export function facebookResourceIdentity(input: { finalUrl?: string | null; submittedUrl?: string | null }) {
  const finalUrl = input.finalUrl ? canonicalizeFacebookUrl(input.finalUrl) : null;
  const submittedUrl = input.submittedUrl ? canonicalizeFacebookUrl(input.submittedUrl) : null;
  const postId = [finalUrl, submittedUrl].flatMap((url) => (url ? [extractFacebookPostId(url)] : [])).find(Boolean) ?? null;
  if (postId) return `post:${postId}`;
  return finalUrl ? `final:${finalUrl}` : submittedUrl ? `submitted:${submittedUrl}` : null;
}

export function youtubeVideoId(value: string) {
  try {
    const url = new URL(value);
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeResourceIdentity(value: string) {
  const videoId = youtubeVideoId(value);
  return videoId ? `video:${videoId}` : null;
}

export function captureReuseKey(input: { provider: "facebook" | "youtube"; resourceIdentity: string; captureMethodVersion: string; payloadSchemaVersion: string; promptVersion?: string; model?: string }) {
  return [input.provider, input.resourceIdentity, input.captureMethodVersion, input.payloadSchemaVersion, input.promptVersion ?? "", input.model ?? ""].join("|");
}
