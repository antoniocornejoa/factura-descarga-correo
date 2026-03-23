import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import * as fs from "fs";

async function debug() {
  const chromiumPath = execSync("which chromium").toString().trim();
  console.log("Chromium path:", chromiumPath);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log("Navigating to login page...");
  await page.goto("https://cl.iconstruye.com/loginsso.aspx", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  console.log("URL:", page.url());
  console.log("Title:", await page.title());

  await page.screenshot({ path: "/tmp/iconstruye_login.png", fullPage: true });
  console.log("Screenshot saved");

  const inputs = await page.evaluate(() => {
    const allInputs = document.querySelectorAll("input, select, textarea, button, a");
    return Array.from(allInputs).map((el) => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type || "",
      id: el.id,
      name: el.getAttribute("name") || "",
      className: el.className,
      placeholder: el.getAttribute("placeholder") || "",
      visible: (el as HTMLElement).offsetParent !== null,
      href: el.getAttribute("href") || "",
    }));
  });

  console.log("\n=== All Form Elements ===");
  inputs.forEach((input, i) => {
    console.log(`[${i}] ${input.tag} type="${input.type}" id="${input.id}" name="${input.name}" class="${input.className}" placeholder="${input.placeholder}" visible=${input.visible} href="${input.href}"`);
  });

  const frames = page.frames();
  console.log(`\n=== Frames (${frames.length}) ===`);
  for (let i = 0; i < frames.length; i++) {
    console.log(`Frame ${i}: URL=${frames[i].url()}`);
    if (i > 0) {
      try {
        const frameInputs = await frames[i].evaluate(() => {
          const allInputs = document.querySelectorAll("input, button, a");
          return Array.from(allInputs).map((el) => ({
            tag: el.tagName,
            type: (el as HTMLInputElement).type || "",
            id: el.id,
            name: el.getAttribute("name") || "",
            placeholder: el.getAttribute("placeholder") || "",
          }));
        });
        if (frameInputs.length > 0) {
          console.log(`  Frame ${i} inputs:`, JSON.stringify(frameInputs, null, 2));
        }
      } catch (e: any) {
        console.log(`  Frame ${i} error:`, e.message);
      }
    }
  }

  await browser.close();
  console.log("Done!");
}

debug().catch(console.error);
