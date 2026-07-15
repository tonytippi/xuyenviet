import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadFacebookSeedUrls } from "../scripts/facebook-seed-urls";

const temporaryDirectories: string[] = [];

function createUrlFile(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "xuyenviet-facebook-seed-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "facebook-urls.txt");
  writeFileSync(path, contents);
  return new URL(`file://${path}`);
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

describe("Facebook seed URL loader", () => {
  test("ignores blank lines and creates URL-stable source IDs", () => {
    const first = "https://web.facebook.com/share/p/first/";
    const second = "https://web.facebook.com/share/p/second/";
    const urls = loadFacebookSeedUrls(createUrlFile(`\r\n ${first}\r\n\r\n${second}\r\n`));
    const reorderedUrls = loadFacebookSeedUrls(createUrlFile(`${second}\n${first}\n`));

    expect(urls).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: first, label: "Facebook post first" }),
      expect.objectContaining({ url: second, label: "Facebook post second" }),
    ]));
    expect(urls.find((url) => url.url === first)?.id).toBe(reorderedUrls.find((url) => url.url === first)?.id);
    expect(urls.find((url) => url.url === first)?.id.replace("source", "raw")).toBe(
      reorderedUrls.find((url) => url.url === first)?.id.replace("source", "raw"),
    );
  });

  test.each([
    ["", "must contain at least one URL"],
    ["not a URL\n", "Invalid Facebook seed URL on line 1"],
    ["http://facebook.com/post\n", "must use an HTTPS Facebook host"],
    ["https://example.com/post\n", "must use an HTTPS Facebook host"],
    ["https://facebook.com/post\nhttps://facebook.com/post\n", "Duplicate Facebook seed URL on line 2"],
  ])("rejects invalid input: %s", (contents, message) => {
    expect(() => loadFacebookSeedUrls(createUrlFile(contents))).toThrow(message);
  });
});
