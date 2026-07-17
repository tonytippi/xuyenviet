import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type FacebookSeedUrl = {
  id: string;
  url: string;
  label: string;
};

export function loadFacebookSeedUrls(fileUrl = new URL("./facebook-urls.txt", import.meta.url)): FacebookSeedUrl[] {
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
    throw new Error("Facebook seed URL file must contain at least one URL.");
  }

  const seenUrls = new Set<string>();

  return urls.map(({ label, line, url }) => {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid Facebook seed URL on line ${line}.`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" || (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com"))) {
      throw new Error(`Facebook seed URL on line ${line} must use an HTTPS Facebook host.`);
    }

    if (seenUrls.has(url)) {
      throw new Error(`Duplicate Facebook seed URL on line ${line}.`);
    }

    seenUrls.add(url);
    const slug = url.split("/").filter(Boolean).at(-1);
    const id = createHash("sha256").update(url).digest("hex").slice(0, 16);

    return {
      id: `seed-facebook-source-${id}`,
      url,
      label: label ?? `Facebook post ${slug}`,
    };
  });
}
