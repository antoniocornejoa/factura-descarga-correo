import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { requestInvoiceExportTool } from "../tools/downloadInvoicesTool";
import { processExcelTool } from "../tools/processExcelTool";
import { sendEmailTool } from "../tools/sendEmailTool";
import { bonusEvaluationTool } from "../tools/bonusEvaluationTool";
import { newCenterDetectionTool } from "../tools/newCenterDetectionTool";
import { getUncachableGmailClient } from "../tools/gmailClient";
import * as fs from "fs";
import * as path from "path";

const downloadInvoicesStep = createStep({
  id: "download-invoices",
  description: "Logs into iconstruye.com, navigates to Control de Facturas, applies pending invoice filters, and downloads/scrapes the invoice data",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    filePath: z.string(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();

    const chileNow = getChileDate();
    if (!isBusinessDay(chileNow)) {
      const dayName = chileNow.toLocaleDateString("es-CL", { weekday: "long", timeZone: "America/Santiago" });
      const dateStr = chileNow.toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
      logger?.info(`📅 [Step 1] Hoy ${dayName} ${dateStr} no es dia habil. Saltando ejecucion.`);
      return {
        success: false,
        message: `Dia no habil (${dayName} ${dateStr}). Workflow no ejecutado.`,
        filePath: "",
      };
    }

    logger?.info("🚀 [Step 1] Downloading invoices from iconstruye.com...");

    const result = await requestInvoiceExportTool.execute({}, { mastra });
    if ("error" in result && result.error) {
      throw new Error(`Download failed: ${(result as any).message}`);
    }

    logger?.info(`✅ [Step 1] Result: ${result.message}`);

    if (!result.success) {
      throw new Error(`Download failed: ${result.message}`);
    }

    return {
      success: result.success,
      message: result.message,
      filePath: result.filePath,
    };
  },
});

const processExcelStep = createStep({
  id: "process-excel",
  description: "Filters the Excel file by Estado Asociacion, Estado Documento, and active cost centers, then generates pivot table and comparison indicators",
  inputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    filePath: z.string(),
  }),
  outputSchema: z.object({
    processedFilePath: z.string(),
    totalRows: z.number(),
    filteredRows: z.number(),
    summary: z.string(),
    indicators: z.string(),
    success: z.boolean(),
    originalFilePath: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();

    if (!inputData.success) {
      logger?.info(`⏭️ [Step 2] Skipped: ${inputData.message}`);
      return {
        processedFilePath: "",
        totalRows: 0,
        filteredRows: 0,
        summary: inputData.message,
        indicators: "",
        success: false,
        originalFilePath: "",
      };
    }

    logger?.info("📊 [Step 2] Processing Excel file...");

    const result = await processExcelTool.execute(
      { filePath: inputData.filePath },
      { mastra }
    );
    if ("error" in result && result.error) {
      throw new Error(`Excel processing failed: ${(result as any).message}`);
    }

    logger?.info(`✅ [Step 2] Processing result: ${result.summary}`);

    if (!result.success) {
      throw new Error(`Processing failed: ${result.summary}`);
    }

    return {
      processedFilePath: result.processedFilePath,
      totalRows: result.totalRows,
      filteredRows: result.filteredRows,
      summary: result.summary,
      indicators: result.indicators,
      success: result.success,
      originalFilePath: inputData.filePath,
    };
  },
});

const sendEmailStep = createStep({
  id: "send-email",
  description: "Sends an email with the processed invoice Excel file to the designated recipient",
  inputSchema: z.object({
    processedFilePath: z.string(),
    totalRows: z.number(),
    filteredRows: z.number(),
    summary: z.string(),
    indicators: z.string(),
    success: z.boolean(),
    originalFilePath: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    message: z.string(),
    recipientEmail: z.string(),
    originalFilePath: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();

    if (!inputData.success) {
      logger?.info(`⏭️ [Step 3] Skipped: ${inputData.summary}`);
      return {
        sent: false,
        message: inputData.summary,
        recipientEmail: "",
        originalFilePath: "",
      };
    }

    logger?.info("📧 [Step 3] Sending email with processed invoices...");

    const result = await sendEmailTool.execute(
      {
        processedFilePath: inputData.processedFilePath,
        summary: inputData.summary,
        filteredRows: inputData.filteredRows,
        indicators: inputData.indicators,
      },
      { mastra }
    );
    if ("error" in result && result.error) {
      throw new Error(`Email sending failed: ${(result as any).message}`);
    }

    logger?.info(`✅ [Step 3] Email result: ${result.message}`);

    if (!result.sent) {
      throw new Error(`Email failed: ${result.message}`);
    }

    return {
      sent: result.sent,
      message: result.message,
      recipientEmail: result.recipientEmail,
      originalFilePath: inputData.originalFilePath,
    };
  },
});

function getChileDate(): Date {
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
  return new Date(str);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function moveToMonday(d: Date): Date {
  const dow = d.getDay();
  if (dow === 0) { d.setDate(d.getDate() + 1); return d; }
  if (dow >= 2 && dow <= 5) { d.setDate(d.getDate() + (8 - dow)); return d; }
  if (dow === 6) { d.setDate(d.getDate() + 2); return d; }
  return d;
}

function getChileanHolidays(year: number): Set<string> {
  const holidays: string[] = [];

  holidays.push(`${year}-01-01`);
  holidays.push(`${year}-05-01`);
  holidays.push(`${year}-05-21`);
  holidays.push(`${year}-09-18`);
  holidays.push(`${year}-09-19`);
  holidays.push(`${year}-12-25`);

  const easter = computeEaster(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const holySaturday = new Date(easter);
  holySaturday.setDate(easter.getDate() - 1);
  holidays.push(fmtDate(goodFriday));
  holidays.push(fmtDate(holySaturday));

  const stPeterPaul = moveToMonday(new Date(year, 5, 29));
  holidays.push(fmtDate(stPeterPaul));

  const virgenCarmen = new Date(year, 6, 16);
  holidays.push(fmtDate(virgenCarmen));

  const assumption = new Date(year, 7, 15);
  holidays.push(fmtDate(assumption));

  const indigenousDay = new Date(year, 5, 21);
  holidays.push(fmtDate(indigenousDay));

  const sep20 = new Date(year, 8, 20);
  const dow19 = new Date(year, 8, 19).getDay();
  if (dow19 === 5) {
    holidays.push(fmtDate(sep20));
  }
  const dow18 = new Date(year, 8, 18).getDay();
  if (dow18 === 1) {
    const sep17 = new Date(year, 8, 17);
    holidays.push(fmtDate(sep17));
  }

  const columbusDay = moveToMonday(new Date(year, 9, 12));
  holidays.push(fmtDate(columbusDay));

  const churches = moveToMonday(new Date(year, 9, 31));
  holidays.push(fmtDate(churches));

  holidays.push(`${year}-11-01`);

  holidays.push(`${year}-12-08`);

  return new Set(holidays);
}

function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const y = date.getFullYear();
  const key = `${y}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return !getChileanHolidays(y).has(key);
}

const conditionalTasksStep = createStep({
  id: "conditional-tasks",
  description: "Runs bonus evaluation on day 5 of month and new center detection on Mondays",
  inputSchema: z.object({
    sent: z.boolean(),
    message: z.string(),
    recipientEmail: z.string(),
    originalFilePath: z.string(),
  }),
  outputSchema: z.object({
    bonusRan: z.boolean(),
    bonusResult: z.string(),
    newCenterRan: z.boolean(),
    newCenterResult: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const chileDate = getChileDate();
    const dayOfMonth = chileDate.getDate();
    const dayOfWeek = chileDate.getDay();

    logger?.info(`📅 [Step 4] Chile date: ${chileDate.toISOString()}, day of month: ${dayOfMonth}, day of week: ${dayOfWeek}`);

    if (!inputData.sent && !inputData.originalFilePath) {
      logger?.info("⏭️ [Step 4] Skipped: workflow did not run (non-business day)");
      return {
        bonusRan: false,
        bonusResult: "Dia no habil - no ejecutado",
        newCenterRan: false,
        newCenterResult: "Dia no habil - no ejecutado",
      };
    }

    let bonusRan = false;
    let bonusResult = "No corresponde (no es dia 5)";
    let newCenterRan = false;
    let newCenterResult = "No corresponde (no es lunes)";

    if (dayOfMonth === 5) {
      logger?.info("🎯 [Step 4] Day 5 - Running bonus evaluation...");
      try {
        const evalResult = await bonusEvaluationTool.execute(
          { filePath: inputData.originalFilePath },
          { mastra }
        );

        if ("error" in evalResult && evalResult.error) {
          bonusResult = `Error: ${(evalResult as any).message}`;
        } else if (evalResult.success && evalResult.processedFilePath) {
          logger?.info(`✅ [Step 4] Bonus evaluation complete: ${evalResult.bonusSummary}`);

          try {
            const gmail = await getUncachableGmailClient();
            const fileContent = fs.readFileSync(evalResult.processedFilePath);
            const base64File = fileContent.toString("base64");
            const fileName = path.basename(evalResult.processedFilePath);

            const chileStr = new Date().toLocaleDateString("es-CL", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "America/Santiago",
            });

            const subject = `Evaluacion Mensual de Bonos - ${chileStr}`;
            const body = [
              `Estimado,`,
              ``,
              `Se adjunta la evaluacion mensual de bonos por responsable.`,
              ``,
              evalResult.bonusSummary,
              ``,
              `El archivo adjunto contiene el detalle completo por responsable y por centro.`,
              ``,
              `Saludos cordiales.`,
            ].join("\n");

            const boundary = "boundary_bonus_" + Date.now();
            const mimeMessage = [
              `To: acornejo@cindependencia.cl`,
              `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
              `MIME-Version: 1.0`,
              `Content-Type: multipart/mixed; boundary="${boundary}"`,
              ``,
              `--${boundary}`,
              `Content-Type: text/plain; charset="UTF-8"`,
              `Content-Transfer-Encoding: base64`,
              ``,
              Buffer.from(body).toString("base64"),
              ``,
              `--${boundary}`,
              `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
              `Content-Disposition: attachment; filename="${fileName}"`,
              `Content-Transfer-Encoding: base64`,
              ``,
              base64File,
              ``,
              `--${boundary}--`,
            ].join("\r\n");

            const encodedMessage = Buffer.from(mimeMessage)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const sendResult = await gmail.users.messages.send({
              userId: "me",
              requestBody: { raw: encodedMessage },
            });

            bonusResult = `Evaluacion enviada. Message ID: ${sendResult.data.id}. ${evalResult.bonusSummary}`;
            logger?.info(`✅ [Step 4] Bonus email sent. Message ID: ${sendResult.data.id}`);
          } catch (emailErr: any) {
            bonusResult = `Evaluacion completada pero error enviando email: ${emailErr.message}. ${evalResult.bonusSummary}`;
            logger?.error(`❌ [Step 4] Bonus email error: ${emailErr.message}`);
          }

          bonusRan = true;
        } else {
          bonusResult = evalResult.bonusSummary || "Evaluation failed";
        }
      } catch (err: any) {
        bonusResult = `Error: ${err.message}`;
        logger?.error(`❌ [Step 4] Bonus evaluation error: ${err.message}`);
      }
    }

    if (dayOfWeek === 1) {
      logger?.info("🔍 [Step 4] Monday - Running new center detection...");
      try {
        const detectResult = await newCenterDetectionTool.execute(
          { filePath: inputData.originalFilePath },
          { mastra }
        );

        if ("error" in detectResult && detectResult.error) {
          newCenterResult = `Error: ${(detectResult as any).message}`;
        } else if (detectResult.hasNewCenters) {
          logger?.info(`✅ [Step 4] Found ${detectResult.newCenters.length} new centers`);

          try {
            const gmail = await getUncachableGmailClient();
            const chileStr = new Date().toLocaleDateString("es-CL", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "America/Santiago",
            });

            const subject = `Nuevos Centros de Costo Detectados - ${chileStr}`;
            const body = [
              `Estimado,`,
              ``,
              detectResult.emailBody,
              ``,
              `Saludos cordiales.`,
            ].join("\n");

            const mimeMessage = [
              `To: acornejo@cindependencia.cl`,
              `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
              `MIME-Version: 1.0`,
              `Content-Type: text/plain; charset="UTF-8"`,
              `Content-Transfer-Encoding: base64`,
              ``,
              Buffer.from(body).toString("base64"),
            ].join("\r\n");

            const encodedMessage = Buffer.from(mimeMessage)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const sendResult = await gmail.users.messages.send({
              userId: "me",
              requestBody: { raw: encodedMessage },
            });

            newCenterResult = `${detectResult.newCenters.length} nuevos centros detectados y notificados. Message ID: ${sendResult.data.id}`;
            logger?.info(`✅ [Step 4] New centers email sent. Message ID: ${sendResult.data.id}`);
          } catch (emailErr: any) {
            newCenterResult = `${detectResult.newCenters.length} nuevos centros detectados pero error enviando email: ${emailErr.message}`;
            logger?.error(`❌ [Step 4] New centers email error: ${emailErr.message}`);
          }

          newCenterRan = true;
        } else {
          newCenterResult = "No se detectaron nuevos centros de costo";
          newCenterRan = true;
          logger?.info("✅ [Step 4] No new centers detected");
        }
      } catch (err: any) {
        newCenterResult = `Error: ${err.message}`;
        logger?.error(`❌ [Step 4] New center detection error: ${err.message}`);
      }
    }

    return { bonusRan, bonusResult, newCenterRan, newCenterResult };
  },
});

export const invoiceControlWorkflow = createWorkflow({
  id: "invoice-control-workflow",
  inputSchema: z.object({}) as any,
  outputSchema: z.object({
    bonusRan: z.boolean(),
    bonusResult: z.string(),
    newCenterRan: z.boolean(),
    newCenterResult: z.string(),
  }),
})
  .then(downloadInvoicesStep as any)
  .then(processExcelStep as any)
  .then(sendEmailStep as any)
  .then(conditionalTasksStep as any)
  .commit();
