import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { getEnvValue, resolveConfiguredYoutubeCaptureCompatibility } from "@xuyenviet/database";
import { youtubeCaptureCompatibilityForMediaResolution } from "@xuyenviet/domain";
import { getYoutubeMediaResolution } from "../scripts/youtube-capture";

let directory: string | undefined;

afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined; });

describe("YouTube Discovery runtime configuration", () => {
  test("uses the capture-compatible process and env-file resolution order", async () => {
    directory = await mkdtemp(join(tmpdir(), "xuyenviet-runtime-config-"));
    await writeFile(join(directory, ".env"), "GEMINI_YOUTUBE_MEDIA_RESOLUTION=MEDIA_RESOLUTION_LOW\n");
    await writeFile(join(directory, ".env.local"), "GEMINI_YOUTUBE_MEDIA_RESOLUTION=MEDIA_RESOLUTION_MEDIUM\n");

    expect(getEnvValue("GEMINI_YOUTUBE_MEDIA_RESOLUTION", {}, directory)).toBe("MEDIA_RESOLUTION_MEDIUM");
    expect(resolveConfiguredYoutubeCaptureCompatibility({}, directory)).toEqual(youtubeCaptureCompatibilityForMediaResolution(getYoutubeMediaResolution(getEnvValue("GEMINI_YOUTUBE_MEDIA_RESOLUTION", {}, directory))));
    expect(resolveConfiguredYoutubeCaptureCompatibility({ GEMINI_YOUTUBE_MEDIA_RESOLUTION: "MEDIA_RESOLUTION_HIGH" }, directory)).toEqual(youtubeCaptureCompatibilityForMediaResolution("MEDIA_RESOLUTION_HIGH"));
  });
});
