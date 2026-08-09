import { existsSync, readFileSync } from "node:fs";

import { resolveYoutubeMediaResolution, youtubeCaptureCompatibilityForMediaResolution } from "@xuyenviet/domain";

const envFileNames = [".env.local", ".env"] as const;

/** Runtime configuration lookup shared by Worker-owned database adapters and scripts. */
export function getEnvValue(name: string, environment: Record<string, string | undefined> = process.env, workingDirectory = process.cwd()) {
  if (environment[name]) return environment[name];

  for (const envFile of envFileNames) {
    const path = `${workingDirectory}/${envFile}`;
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, "");
  }
}

export function resolveConfiguredYoutubeCaptureCompatibility(environment: Record<string, string | undefined> = process.env, workingDirectory = process.cwd()) {
  return youtubeCaptureCompatibilityForMediaResolution(resolveYoutubeMediaResolution(getEnvValue("GEMINI_YOUTUBE_MEDIA_RESOLUTION", environment, workingDirectory)));
}
