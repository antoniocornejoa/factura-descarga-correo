import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import puppeteer, { type Frame, type Page } from "puppeteer-core";
import { execSync } from "child_process";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DOWNLOAD_DIR = "/tmp/invoices";

async function findContentFrame(page: Page, logger: any): Promise<Frame> {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const selectCount = await frame.$$eval("select", (els) => els.length).catch(() => 0);
      if (selectCount > 0) {
        logger?.info(`🖼️ [findFrame] Using frame: name="${frame.name()}" url="${frame.url()}" (${selectCount} selects)`);
        return frame;
      }
    } catch {
      continue;
    }
  }
  return page.mainFrame();
}

async function scrapeTablePage(frame: Frame, logger: any): Promise<{ headers: string[]; rows: string[][] }> {
  return await frame.evaluate(() => {
    const tables = document.querySelectorAll("table");
    let dataTable: HTMLTableElement | null = null;

    for (const table of tables) {
      const ths = table.querySelectorAll("th");
      if (ths.length > 5) {
        dataTable = table;
        break;
      }
    }

    if (!dataTable) {
      for (const table of tables) {
        const rows = table.querySelectorAll("tr");
        if (rows.length > 2) {
          dataTable = table;
          break;
        }
      }
    }

    if (!dataTable) return { headers: [], rows: [] };

    const headerRow = dataTable.querySelector("tr");
    const headerCells = headerRow ? Array.from(headerRow.querySelectorAll("th, td")) : [];
    const headers = headerCells.map((cell) => cell.textContent?.trim() || "");

    const allRows = Array.from(dataTable.querySelectorAll("tr")).slice(1);
    const data: string[][] = [];
    for (const row of allRows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length > 0) {
        const rowData = cells.map((cell) => cell.textContent?.trim() || "");
        if (rowData.some((v) => v !== "")) {
          data.push(rowData);
        }
      }
    }

    return { headers, rows: data };
  });
}

async function waitForDownload(dir: string, existingFiles: string[], timeoutMs: number, logger: any): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentFiles = fs.readdirSync(dir);
    const newFiles = currentFiles.filter(
      (f) => !existingFiles.includes(f) && !f.endsWith(".crdownload") && !f.endsWith(".tmp")
    );
    if (newFiles.length > 0) {
      const filePath = path.join(dir, newFiles[0]);
      logger?.info(`📥 [waitDownload] File found: ${filePath}`);
      return filePath;
    }
    await delay(1000);
  }
  return null;
}

export const requestInvoiceExportTool = createTool({
  id: "request-invoice-export",
  description:
    "Logs into iconstruye.com, navigates to Control Documentos, applies pending invoice filters, and downloads Excel files directly",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    filePath: z.string(),
  }),
  execute: async (_inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();

    const username = process.env.ICONSTRUYE_USERNAME;
    const password = process.env.ICONSTRUYE_PASSWORD;

    if (!username || !password) {
      logger?.error("❌ [requestExport] Missing credentials");
      return { success: false, message: "Missing iconstruye credentials", filePath: "" };
    }

    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

    let browser;
    try {
      logger?.info("🌐 [requestExport] Launching browser...");

      let chromiumPath = "";
      try {
        chromiumPath = execSync("which chromium").toString().trim();
      } catch {
        chromiumPath =
          "/nix/store/khk7xpgsm5insk81azy9d560yq4npf77-chromium-131.0.6778.204/bin/chromium";
      }

      browser = await puppeteer.launch({
        headless: true,
        executablePath: chromiumPath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
        ],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      const client = await page.createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: DOWNLOAD_DIR,
      });

      logger?.info("🔐 [requestExport] Navigating to login page...");
      await page.goto("https://cl.iconstruye.com/loginsso.aspx", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      const ssoTab = await page.$("#liTabLoginSso");
      if (ssoTab) {
        await page.evaluate((el) => (el as HTMLElement).click(), ssoTab);
        await delay(1000);
      }

      const emailField = await page.waitForSelector("#txtUsuarioSso", { visible: true, timeout: 10000 }).catch(() => null);
      if (emailField) {
        await page.evaluate((el) => { (el as HTMLInputElement).value = ""; }, emailField);
        await emailField.type(username, { delay: 30 });
      }

      const passwordField = await page.$("#txtPasswordSso");
      if (passwordField) {
        await page.evaluate((el) => { (el as HTMLInputElement).value = ""; }, passwordField);
        await passwordField.type(password, { delay: 30 });
      }

      const loginBtn = await page.$("#btnIniciaSessionSso");
      if (loginBtn) {
        await page.evaluate((el) => (el as HTMLElement).click(), loginBtn);
      }

      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
      } catch {
        logger?.info("🔐 [requestExport] Login nav timeout, continuing...");
      }
      await delay(3000);
      logger?.info("🔐 [requestExport] Login complete. URL: " + page.url());

      logger?.info("📂 [requestExport] Navigating to Control de Facturas...");

      const allLinks = await page.$$("a");
      for (const link of allLinks) {
        const text = await page.evaluate((el) => el.textContent?.trim() || "", link);
        if (text === "Facturación") {
          await page.evaluate((el) => (el as HTMLElement).click(), link);
          break;
        }
      }
      await delay(3000);

      const controlLinks = await page.$$("a");
      for (const link of controlLinks) {
        const text = await page.evaluate((el) => el.textContent?.trim() || "", link);
        if (text.includes("Control") && (text.includes("Factura") || text.includes("Documento"))) {
          await page.evaluate((el) => (el as HTMLElement).click(), link);
          break;
        }
      }

      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
      } catch {
        logger?.info("📂 [requestExport] Nav timeout, continuing...");
      }
      await delay(5000);

      const contentFrame = await findContentFrame(page, logger);

      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      const startDateStr = `${String(oneYearAgo.getDate()).padStart(2, "0")}-${String(oneYearAgo.getMonth() + 1).padStart(2, "0")}-${oneYearAgo.getFullYear()}`;

      logger?.info(`📅 [requestExport] Setting base filters. Start date: ${startDateStr}`);

      await contentFrame.evaluate((startDate: string) => {
        const centro = document.getElementById("lstOrgc") as HTMLSelectElement;
        if (centro) {
          const opt = Array.from(centro.options).find((o) => o.text.toLowerCase().includes("todos"));
          if (opt) {
            centro.value = opt.value;
            centro.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        const inputs = document.querySelectorAll("input");
        inputs.forEach((inp) => {
          if (/^\d{2}-\d{2}-\d{4}$/.test(inp.value)) {
            const id = inp.id.toLowerCase();
            if (id.includes("desde") || !id.includes("hasta")) {
              inp.value = startDate;
              inp.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        });
      }, startDateStr);

      await delay(3000);

      const asociacionFilters = [
        { value: "149", label: "Factura No Asociada" },
        { value: "150", label: "Factura Parcialmente Asociada" },
      ];

      const existingBefore = fs.readdirSync(DOWNLOAD_DIR);
      for (const f of existingBefore) {
        try {
          fs.unlinkSync(path.join(DOWNLOAD_DIR, f));
        } catch {}
      }

      let allHeaders: string[] = [];
      const allRows: string[][] = [];
      const downloadedFiles: string[] = [];

      for (const filter of asociacionFilters) {
        logger?.info(`🔍 [requestExport] Searching with Estado Asociación = "${filter.label}"...`);

        await contentFrame.evaluate((filterValue: string) => {
          const select = document.getElementById("lstEstadoAsociacion") as HTMLSelectElement;
          if (select) {
            select.value = filterValue;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, filter.value);

        await delay(1000);

        await contentFrame.evaluate(() => {
          const buttons = document.querySelectorAll("input[type='button'], input[type='submit'], button");
          for (const btn of buttons) {
            const text = (btn as HTMLElement).textContent?.trim() || (btn as HTMLInputElement).value || "";
            if (text.toLowerCase().includes("buscar")) {
              (btn as HTMLElement).click();
              break;
            }
          }
        });

        logger?.info("⏳ [requestExport] Waiting for results...");
        await delay(15000);

        await page.screenshot({ path: `/tmp/iconstruye_results_${filter.value}.png`, fullPage: true });

        let tableInfo = { noData: true, rowCount: 0 };
        for (let attempt = 0; attempt < 3; attempt++) {
          tableInfo = await contentFrame.evaluate(() => {
            const noData = document.body.innerText.includes("No existen datos");
            const tables = document.querySelectorAll("table");
            let rowCount = 0;
            for (const table of tables) {
              const trs = table.querySelectorAll("tr");
              if (trs.length > 2) rowCount = trs.length - 1;
            }
            return { noData, rowCount };
          });

          if (!tableInfo.noData && tableInfo.rowCount > 0) break;

          if (attempt < 2) {
            logger?.info(`⏳ [requestExport] No data yet for "${filter.label}", retrying in 10s (attempt ${attempt + 2}/3)...`);
            await delay(10000);
          }
        }

        if (tableInfo.noData || tableInfo.rowCount === 0) {
          logger?.info(`📊 [requestExport] No data for "${filter.label}", skipping`);
          continue;
        }

        logger?.info(`📊 [requestExport] Found ~${tableInfo.rowCount} rows for "${filter.label}"`);

        const existingFiles = fs.readdirSync(DOWNLOAD_DIR);

        const excelClicked = await contentFrame.evaluate(() => {
          const elements = document.querySelectorAll("input[type='button'], input[type='submit'], button, a");
          for (const el of elements) {
            const text = (el as HTMLElement).textContent?.trim() || (el as HTMLInputElement).value || "";
            if (text.toLowerCase().includes("excel")) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!excelClicked) {
          logger?.warn(`⚠️ [requestExport] Excel button not found for "${filter.label}"`);
          continue;
        }

        logger?.info("📥 [requestExport] Excel clicked, checking for popup or download...");
        await delay(5000);

        let popupFound = false;
        for (const frame of page.frames()) {
          try {
            popupFound = await frame.evaluate(() => {
              return document.body?.innerText?.includes("supera los 20") || 
                     document.body?.innerText?.includes("Generación del Reporte") || false;
            });
            if (popupFound) break;
          } catch {
            continue;
          }
        }

        if (popupFound) {
          logger?.info(`📊 [requestExport] Popup detected (>20K records) for "${filter.label}". Cancelling and scraping table...`);

          for (const frame of page.frames()) {
            try {
              await frame.evaluate(() => {
                const btns = document.querySelectorAll("button, input[type='button']");
                for (const btn of btns) {
                  const text = (btn as HTMLElement).textContent?.trim() || (btn as HTMLInputElement).value || "";
                  if (text.toLowerCase().includes("cancelar") || text.toLowerCase().includes("cancel")) {
                    (btn as HTMLElement).click();
                    return;
                  }
                }
              });
            } catch {
              continue;
            }
          }

          await delay(2000);

          const tableData = await scrapeTablePage(contentFrame, logger);
          logger?.info(`📊 [requestExport] Scraped ${tableData.rows.length} rows from table for "${filter.label}"`);

          if (tableData.headers.length > 0 && allHeaders.length === 0) {
            allHeaders = tableData.headers;
          }
          allRows.push(...tableData.rows);

          let hasMorePages = true;
          let pageCount = 1;
          while (hasMorePages && pageCount < 100) {
            const nextResult = await contentFrame.evaluate(() => {
              const paginationLinks = document.querySelectorAll("a");
              for (const link of paginationLinks) {
                const text = link.textContent?.trim() || "";
                if (text === ">" || text === "Siguiente" || text.toLowerCase() === "next") {
                  (link as HTMLElement).click();
                  return true;
                }
              }
              const pageLinks = document.querySelectorAll("a[href*='Page']");
              if (pageLinks.length > 0) {
                const current = document.querySelector("span[style*='bold'], td.paginacion b, .current-page");
                if (current) {
                  const nextSibling = current.nextElementSibling as HTMLElement;
                  if (nextSibling && nextSibling.tagName === "A") {
                    nextSibling.click();
                    return true;
                  }
                }
              }
              return false;
            });

            if (!nextResult) {
              hasMorePages = false;
              break;
            }

            pageCount++;
            await delay(5000);
            const pageData = await scrapeTablePage(contentFrame, logger);
            logger?.info(`📊 [requestExport] Page ${pageCount}: scraped ${pageData.rows.length} rows`);
            if (pageData.rows.length === 0) {
              hasMorePages = false;
            } else {
              allRows.push(...pageData.rows);
            }
          }
        } else {
          logger?.info(`📥 [requestExport] No popup - waiting for direct download for "${filter.label}"...`);

          const downloadedFile = await waitForDownload(DOWNLOAD_DIR, existingFiles, 30000, logger);
          if (downloadedFile) {
            logger?.info(`✅ [requestExport] Downloaded: ${downloadedFile}`);
            downloadedFiles.push(downloadedFile);
          } else {
            logger?.warn(`⚠️ [requestExport] No download detected, scraping table...`);
            const tableData = await scrapeTablePage(contentFrame, logger);
            if (tableData.headers.length > 0 && allHeaders.length === 0) {
              allHeaders = tableData.headers;
            }
            allRows.push(...tableData.rows);
            logger?.info(`📊 [requestExport] Scraped ${tableData.rows.length} rows`);
          }
        }
      }

      let finalFilePath = "";

      if (downloadedFiles.length > 0) {
        if (downloadedFiles.length === 1) {
          finalFilePath = downloadedFiles[0];
        } else {
          const mergedWorkbook = new ExcelJS.Workbook();
          const mergedSheet = mergedWorkbook.addWorksheet("Facturas");
          let headerRowDone = false;

          for (const file of downloadedFiles) {
            const wb = new ExcelJS.Workbook();
            if (file.endsWith(".csv")) {
              await wb.csv.readFile(file);
            } else {
              await wb.xlsx.readFile(file);
            }
            const ws = wb.worksheets[0];
            if (!ws) continue;

            let dataHeaderRow = 1;
            for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
              const row = ws.getRow(r);
              let cellCount = 0;
              row.eachCell(() => cellCount++);
              if (cellCount >= 10) {
                dataHeaderRow = r;
                break;
              }
            }

            logger?.info(`📊 [requestExport] File ${path.basename(file)}: header at row ${dataHeaderRow}, total rows ${ws.rowCount}`);

            if (!headerRowDone) {
              const hRow = ws.getRow(dataHeaderRow);
              const vals: any[] = [];
              hRow.eachCell((cell, col) => { vals[col] = cell.value; });
              mergedSheet.addRow(vals.filter((v) => v !== undefined));
              headerRowDone = true;
            }

            for (let r = dataHeaderRow + 1; r <= ws.rowCount; r++) {
              const row = ws.getRow(r);
              let isEmpty = true;
              const vals: any[] = [];
              row.eachCell((cell, col) => {
                vals[col] = cell.value;
                if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
                  isEmpty = false;
                }
              });
              if (!isEmpty) {
                mergedSheet.addRow(vals.filter((v) => v !== undefined));
              }
            }
          }

          finalFilePath = path.join(DOWNLOAD_DIR, `facturas_combinadas_${new Date().toISOString().split("T")[0]}.xlsx`);
          await mergedWorkbook.xlsx.writeFile(finalFilePath);
          logger?.info(`✅ [requestExport] Merged ${downloadedFiles.length} files to: ${finalFilePath} (${mergedSheet.rowCount} rows total)`);
        }
      } else if (allRows.length > 0) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Facturas");

        if (allHeaders.length > 0) {
          const headerRow = sheet.addRow(allHeaders);
          headerRow.font = { bold: true };
          headerRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF4472C4" },
          };
          headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        }

        for (const row of allRows) {
          sheet.addRow(row);
        }

        sheet.columns.forEach((col) => {
          let maxLen = 10;
          col.eachCell?.({ includeEmpty: false }, (cell) => {
            const len = cell.value ? cell.value.toString().length : 0;
            if (len > maxLen) maxLen = len;
          });
          col.width = Math.min(maxLen + 2, 50);
        });

        finalFilePath = path.join(DOWNLOAD_DIR, `facturas_scraped_${new Date().toISOString().split("T")[0]}.xlsx`);
        await workbook.xlsx.writeFile(finalFilePath);
        logger?.info(`✅ [requestExport] Scraped data saved to: ${finalFilePath} (${allRows.length} rows)`);
      } else {
        logger?.warn("⚠️ [requestExport] No data collected");
        return {
          success: false,
          message: "No invoice data could be collected from iconstruye",
          filePath: "",
        };
      }

      logger?.info(`✅ [requestExport] Final file: ${finalFilePath}`);
      return {
        success: true,
        message: `Invoice data collected successfully. ${downloadedFiles.length > 0 ? `${downloadedFiles.length} file(s) downloaded` : `${allRows.length} rows scraped`}`,
        filePath: finalFilePath,
      };
    } catch (err: any) {
      logger?.error(`❌ [requestExport] Error: ${err.message}`);
      logger?.error(`❌ [requestExport] Stack: ${err.stack}`);
      return {
        success: false,
        message: `Error: ${err.message}`,
        filePath: "",
      };
    } finally {
      if (browser) {
        await browser.close();
        logger?.info("🌐 [requestExport] Browser closed");
      }
    }
  },
});
