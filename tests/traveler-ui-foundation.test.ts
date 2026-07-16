import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import * as icons from "@/components/ui/icons";

const iconNames = [
  "AttachmentIcon",
  "SendIcon",
  "CloseIcon",
  "MenuIcon",
  "ChatIcon",
  "NewChatIcon",
  "ProjectIcon",
  "SourceIcon",
  "AccountIcon",
  "LoadingIcon",
] as const;

describe("traveler UI foundation", () => {
  test("loads Inter and keeps Vietnamese as the document language", () => {
    const source = readFileSync("src/app/layout.tsx", "utf8");

    expect(source).toContain('import { Inter } from "next/font/google"');
    expect(source).toContain('subsets: ["latin", "latin-ext"]');
    expect(source).toContain('<html lang="vi">');
    expect(source).toContain("className={inter.className}");
  });

  test("provides semantic palette, focus, and reduced-motion foundation tokens", () => {
    const source = readFileSync("src/app/globals.css", "utf8");

    for (const token of ["--color-white", "--color-stone", "--color-green", "--color-amber", "--color-teal", "--color-source"]) {
      expect(source).toContain(token);
    }

    expect(source).toContain("background: var(--background)");
    expect(source).toContain(":focus-visible");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  test("exports typed decorative SVG icons that preserve caller SVG props", () => {
    for (const name of iconNames) {
      const Icon = icons[name];
      const html = renderToStaticMarkup(createElement(Icon, { className: "traveler-icon", "aria-label": name, width: 24 }));

      expect(html).toContain("<svg");
      expect(html).toContain('class="traveler-icon"');
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain('width="24"');
    }

    expect(renderToStaticMarkup(createElement(icons.SendIcon))).toContain('aria-hidden="true"');
  });
});
