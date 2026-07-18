import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadYoutubeSeedUrls } from "../scripts/youtube-seed-urls";

const temporaryDirectories: string[] = [];

function createUrlFile(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "xuyenviet-youtube-seed-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "youtube-urls.txt");
  writeFileSync(path, contents);
  return new URL(`file://${path}`);
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

describe("YouTube seed URL loader", () => {
  test("uses preceding comment lines as labels and creates URL-stable source IDs", () => {
    const first = "https://www.youtube.com/watch?v=abcDEF12345";
    const second = "https://youtu.be/xyz98765432";
    const canonicalSecond = "https://www.youtube.com/watch?v=xyz98765432";
    const urls = loadYoutubeSeedUrls(createUrlFile(`\r\n# First source\r\n ${first}\r\n\r\n  # Second source\r\n${second}\r\n`));
    const reorderedUrls = loadYoutubeSeedUrls(createUrlFile(`${second}\n${first}\n`));

    expect(urls).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: first, label: "First source" }),
      expect.objectContaining({ url: canonicalSecond, label: "Second source" }),
    ]));
    expect(urls.find((source) => source.url === first)?.id).toBe(reorderedUrls.find((source) => source.url === first)?.id);
    expect(urls.find((source) => source.url === first)?.id.replace("source", "raw")).toBe(
      reorderedUrls.find((source) => source.url === first)?.id.replace("source", "raw"),
    );
  });

  test("canonicalizes supported video URLs for the capture command", () => {
    expect(loadYoutubeSeedUrls(createUrlFile("https://youtu.be/abcDEF12345?si=tracking\n"))).toEqual([
      expect.objectContaining({ url: "https://www.youtube.com/watch?v=abcDEF12345" }),
    ]);
  });

  test("uses the generated label when a URL has no preceding comment", () => {
    const url = "https://www.youtube.com/watch?v=abcDEF12345";

    expect(loadYoutubeSeedUrls(createUrlFile(url))).toEqual([
      expect.objectContaining({ url, label: "YouTube video abcDEF12345" }),
    ]);
  });

  test.each([
    ["", "must contain at least one URL"],
    ["not a URL\n", "Invalid YouTube seed URL on line 1"],
    ["http://youtube.com/watch?v=abcDEF12345\n", "must use an HTTPS YouTube video URL"],
    ["https://example.com/watch?v=abcDEF12345\n", "must use an HTTPS YouTube video URL"],
    ["https://www.youtube.com/@xuyenviet\n", "must use an HTTPS YouTube video URL"],
    ["https://www.youtube.com/watchlater?v=abcDEF12345\n", "must use an HTTPS YouTube video URL"],
    ["https://youtu.be/abcDEF12345/not-a-video\n", "must use an HTTPS YouTube video URL"],
    ["https://youtube.com/watch?v=abcDEF12345\nhttps://youtube.com/watch?v=abcDEF12345\n", "Duplicate YouTube seed URL on line 2"],
    ["https://youtu.be/abcDEF12345\nhttps://youtube.com/watch?v=abcDEF12345\n", "Duplicate YouTube seed URL on line 2"],
    [`# ${"x".repeat(201)}\nhttps://youtube.com/watch?v=abcDEF12345\n`, "must not exceed 200 characters"],
  ])("rejects invalid input: %s", (contents, message) => {
    expect(() => loadYoutubeSeedUrls(createUrlFile(contents))).toThrow(message);
  });
});
