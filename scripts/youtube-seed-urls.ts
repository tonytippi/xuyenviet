import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type YoutubeSeedUrl = {
  id: string;
  url: string;
  label: string;
};

export function loadYoutubeSeedUrls(fileUrl = new URL("./youtube-urls.txt", import.meta.url)): YoutubeSeedUrl[] {
  let pendingLabel: string | undefined;
  const urls = readFileSync(fileUrl, "utf8")
    .split(/\r?\n/)
    .flatMap((value, index) => {
      const url = value.trim();

      if (!url) {
        return [];
      }

      if (url.startsWith("#")) {
        pendingLabel = url.slice(1).trim() || undefined;
        return [];
      }

      const source = { label: pendingLabel, line: index + 1, url };
      pendingLabel = undefined;
      return source;
    });

  if (urls.length === 0) {
    throw new Error("YouTube seed URL file must contain at least one URL.");
  }

  const seenUrls = new Set<string>();

  return urls.map(({ label, line, url }) => {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid YouTube seed URL on line ${line}.`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const videoId = hostname === "youtu.be" && pathParts.length === 1 ? pathParts[0] : parsedUrl.pathname === "/watch" ? parsedUrl.searchParams.get("v") : null;
    if (parsedUrl.protocol !== "https:" || !(hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com")) || !videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      throw new Error(`YouTube seed URL on line ${line} must use an HTTPS YouTube video URL.`);
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    if (seenUrls.has(canonicalUrl)) {
      throw new Error(`Duplicate YouTube seed URL on line ${line}.`);
    }

    seenUrls.add(canonicalUrl);
    const normalizedLabel = label ?? `YouTube video ${videoId}`;
    if (normalizedLabel.length > 200) {
      throw new Error(`YouTube seed label on line ${line} must not exceed 200 characters.`);
    }

    const id = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16);

    return {
      id: `seed-youtube-source-${id}`,
      url: canonicalUrl,
      label: normalizedLabel,
    };
  });
}
