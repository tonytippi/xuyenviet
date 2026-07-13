import { chromium } from "playwright";

async function main() {
  const context = await chromium.launchPersistentContext(".playwright/facebook-profile", {
    headless: false,
  });
  const page = await context.newPage();

  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

  console.log("Facebook login browser opened with profile .playwright/facebook-profile.");
  console.log("Log in in the browser window, then press Enter here to close it.");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
