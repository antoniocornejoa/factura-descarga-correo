import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { getUncachableGmailClient } from "./gmailClient";

function buildHtmlEmail(chileDate: string, filteredRows: number, indicators: string): string {
  const indicatorLines = indicators.split("\n").filter(l => l.trim());
  const headerLine = indicatorLines[0] || "";
  const centerLines = indicatorLines.slice(1);

  let tableRows = "";
  for (const line of centerLines) {
    const trimmed = line.replace(/^\s*\*\s*/, "").trim();
    const match = trimmed.match(/^(.+?):\s*(.+)$/);
    if (match) {
      const centro = match[1].trim();
      const detalle = match[2].trim();

      const isNew = detalle.includes("NUEVO");
      const isNegative = detalle.includes("-") && !isNew;
      const bgColor = isNew ? "#FFF3CD" : isNegative ? "#F8D7DA" : "#FFFFFF";

      tableRows += `<tr style="background-color:${bgColor}">
        <td style="padding:8px 12px;border:1px solid #dee2e6;font-size:13px">${centro}</td>
        <td style="padding:8px 12px;border:1px solid #dee2e6;font-size:13px">${detalle}</td>
      </tr>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;margin:0;padding:0;background-color:#f5f5f5">
  <div style="max-width:900px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    
    <div style="background-color:#1a3a5c;padding:20px 30px;color:#ffffff">
      <h1 style="margin:0;font-size:22px">Control de Facturas Pendientes</h1>
      <p style="margin:5px 0 0;font-size:14px;opacity:0.9">${chileDate}</p>
    </div>

    <div style="padding:25px 30px">
      
      <div style="display:flex;gap:20px;margin-bottom:25px">
        <div style="background:#e8f4fd;border-left:4px solid #1a3a5c;padding:15px 20px;border-radius:4px;flex:1">
          <div style="font-size:28px;font-weight:bold;color:#1a3a5c">${filteredRows}</div>
          <div style="font-size:13px;color:#666;margin-top:2px">Facturas Pendientes</div>
        </div>
        <div style="background:${centerLines.length > 0 ? "#fef3e8" : "#e8f8e8"};border-left:4px solid ${centerLines.length > 0 ? "#e67e22" : "#27ae60"};padding:15px 20px;border-radius:4px;flex:1">
          <div style="font-size:28px;font-weight:bold;color:${centerLines.length > 0 ? "#e67e22" : "#27ae60"}">${centerLines.length}</div>
          <div style="font-size:13px;color:#666;margin-top:2px">Centros bajo 50% resolucion</div>
        </div>
      </div>

      ${centerLines.length > 0 ? `
      <h3 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:8px;margin-bottom:12px;font-size:16px">
        ${headerLine}
      </h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background-color:#1a3a5c;color:#ffffff">
            <th style="padding:10px 12px;text-align:left;font-size:13px;border:1px solid #1a3a5c">Centro de Gestion</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;border:1px solid #1a3a5c">Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <div style="font-size:12px;color:#888;margin-bottom:15px">
        <span style="display:inline-block;width:12px;height:12px;background:#F8D7DA;border:1px solid #ddd;margin-right:4px;vertical-align:middle"></span> Aumento de pendientes
        &nbsp;&nbsp;
        <span style="display:inline-block;width:12px;height:12px;background:#FFF3CD;border:1px solid #ddd;margin-right:4px;vertical-align:middle"></span> Centro nuevo con pendientes
      </div>
      ` : `<p style="color:#27ae60;font-weight:bold">Todos los centros resolvieron mas del 50% de sus pendientes.</p>`}

      <p style="font-size:14px;color:#333">El archivo adjunto contiene el detalle completo y una hoja de resumen por centro de gestion.</p>
      <p style="font-size:14px;color:#c0392b;font-weight:bold">Favor resolver los pendientes de manera urgente.</p>
    </div>

    <div style="background-color:#f0f0f0;padding:12px 30px;text-align:center;font-size:11px;color:#999">
      Informe generado automaticamente - Constructora Independencia
    </div>
  </div>
</body>
</html>`;
}

export const sendEmailTool = createTool({
  id: "send-email",
  description: "Sends an email via Gmail with the processed Excel file attached to the recipient",
  inputSchema: z.object({
    processedFilePath: z.string().describe("Path to the processed Excel file to attach"),
    summary: z.string().describe("Summary of the invoice processing results"),
    filteredRows: z.number().describe("Number of pending invoices found"),
    indicators: z.string().describe("Comparison indicators with previous day"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    message: z.string(),
    recipientEmail: z.string(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();

    const toRecipients = "adquisiciones@cindependencia.cl, Administradores@cindependencia.cl";

    if (!fs.existsSync(inputData.processedFilePath)) {
      logger?.error(`❌ [sendEmail] Processed file not found: ${inputData.processedFilePath}`);
      return {
        sent: false,
        message: `Processed file not found: ${inputData.processedFilePath}`,
        recipientEmail: toRecipients,
      };
    }

    try {
      logger?.info("📧 [sendEmail] Getting Gmail client...");
      const gmail = await getUncachableGmailClient();

      const fileContent = fs.readFileSync(inputData.processedFilePath);
      const base64File = fileContent.toString("base64");
      const fileName = path.basename(inputData.processedFilePath);

      const chileDate = new Date().toLocaleDateString("es-CL", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Santiago",
      });

      const subject = `Control de Facturas Pendientes - ${chileDate}`;
      const htmlBody = buildHtmlEmail(chileDate, inputData.filteredRows, inputData.indicators);

      const boundary = "boundary_" + Date.now();
      const mimeMessage = [
        `To: ${toRecipients}`,
        `Cc: acornejo@cindependencia.cl`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(htmlBody).toString("base64"),
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

      logger?.info(`📧 [sendEmail] Sending email to ${toRecipients}...`);
      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      logger?.info(`✅ [sendEmail] Email sent successfully. Message ID: ${result.data.id}`);

      return {
        sent: true,
        message: `Email sent successfully to ${toRecipients}. Message ID: ${result.data.id}`,
        recipientEmail: toRecipients,
      };
    } catch (err: any) {
      logger?.error(`❌ [sendEmail] Error sending email: ${err.message}`);
      return {
        sent: false,
        message: `Error sending email: ${err.message}`,
        recipientEmail: toRecipients,
      };
    }
  },
});
