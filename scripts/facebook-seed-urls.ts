import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type FacebookSeedUrl = {
  id: string;
  url: string;
  label: string;
};

export function loadFacebookSeedUrls(fileUrl = new URL("./facebook-urls.txt", import.meta.url)): FacebookSeedUrl[] {
  const urls = readFileSync(fileUrl, "utf8")
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new Error("Facebook seed URL file must contain at least one URL.");
  }

  const seenUrls = new Set<string>();

  return urls.map((url, index) => {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid Facebook seed URL on line ${index + 1}.`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" || (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com"))) {
      throw new Error(`Facebook seed URL on line ${index + 1} must use an HTTPS Facebook host.`);
    }

    if (seenUrls.has(url)) {
      throw new Error(`Duplicate Facebook seed URL on line ${index + 1}.`);
    }

    seenUrls.add(url);
    const slug = url.split("/").filter(Boolean).at(-1);
    const id = createHash("sha256").update(url).digest("hex").slice(0, 16);

    return {
      id: `seed-facebook-source-${id}`,
      url,
      label: `Facebook post ${slug}`,
    };
  });
}
