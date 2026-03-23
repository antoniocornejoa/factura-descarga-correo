import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { createPool } from "./dbPool";
import { normalizeCenterName } from "./centerNameUtils";

function formatChileanNumber(num: number): string {
  const parts = Math.round(num).toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

function getChileDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

export const bonusEvaluationTool = createTool({
  id: "bonus-evaluation",
  description: "Evaluates bonus eligibility per responsable based on pending invoices in their assigned cost centers",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the downloaded Excel file"),
  }),
  outputSchema: z.object({
    processedFilePath: z.string(),
    bonusSummary: z.string(),
    success: z.boolean(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    const { filePath } = inputData;
    const BONUS_AMOUNT = 150000;

    if (!fs.existsSync(filePath)) {
      logger?.error(`❌ [bonusEval] File not found: ${filePath}`);
      return { processedFilePath: "", bonusSummary: "File not found", success: false };
    }

    const pool = createPool();

    try {
      const respResult = await pool.query(`
        SELECT r.id, r.name, r.email, 
               ARRAY_AGG(ccr.center_name) as center_names
        FROM responsables r
        JOIN cost_center_responsables ccr ON ccr.responsable_id = r.id
        GROUP BY r.id, r.name, r.email
        ORDER BY r.name
      `);
      logger?.info(`📊 [bonusEval] Loaded ${respResult.rows.length} responsables with centers`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        await pool.end();
        return { processedFilePath: "", bonusSummary: "No worksheet", success: false };
      }

      let headerRowNum = 1;
      let centroGestionCol = 0;
      let estadoAsociacionCol = 0;
      let estadoDocumentoCol = 0;
      let montoTotalCol = 0;

      for (let rowNum = 1; rowNum <= Math.min(10, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let cellCount = 0;
        row.eachCell(() => cellCount++);
        if (cellCount >= 10) {
          headerRowNum = rowNum;
          row.eachCell((cell, col) => {
            const val = cell.value?.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
            if (val.includes("centro") && val.includes("gestion")) centroGestionCol = col;
            if (val.includes("estado") && val.includes("asociacion")) estadoAsociacionCol = col;
            if (val.includes("estado") && val.includes("documento")) estadoDocumentoCol = col;
            if (val.includes("monto") && val.includes("total")) montoTotalCol = col;
          });
          break;
        }
      }

      logger?.info(`📊 [bonusEval] Cols - Centro: ${centroGestionCol}, Asociacion: ${estadoAsociacionCol}, Documento: ${estadoDocumentoCol}, Monto: ${montoTotalCol}`);

      const validAsociacion = ["no asociada", "parcialmente asociada"];
      const validDocumento = ["ingresada", "aprobada"];

      const centerPending: { [center: string]: { count: number; monto: number; originalName: string } } = {};
      const centersWithActivity: Set<string> = new Set();

      for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        let isEmpty = true;
        row.eachCell((cell) => {
          if (cell.value !== null && cell.value !== undefined && cell.value !== "") isEmpty = false;
        });
        if (isEmpty) continue;

        const estadoAsoc = estadoAsociacionCol > 0
          ? (row.getCell(estadoAsociacionCol).value?.toString().trim() || "").toLowerCase()
          : "";
        const estadoDoc = estadoDocumentoCol > 0
          ? (row.getCell(estadoDocumentoCol).value?.toString().trim() || "").toLowerCase()
          : "";
        const centro = centroGestionCol > 0
          ? (row.getCell(centroGestionCol).value?.toString().trim() || "")
          : "";

        let monto = 0;
        if (montoTotalCol > 0) {
          const rawMonto = row.getCell(montoTotalCol).value;
          if (typeof rawMonto === "number") monto = rawMonto;
          else if (rawMonto) {
            const cleaned = rawMonto.toString().replace(/[$.]/g, "").replace(",", ".").trim();
            monto = parseFloat(cleaned) || 0;
          }
        }

        if (centro) {
          const normalizedKey = normalizeCenterName(centro);
          centersWithActivity.add(normalizedKey);
        }

        const matchAsoc = estadoAsociacionCol === 0 || validAsociacion.includes(estadoAsoc);
        const matchDoc = estadoDocumentoCol === 0 || validDocumento.includes(estadoDoc);

        if (matchAsoc && matchDoc && centro) {
          const normalizedKey = normalizeCenterName(centro);
          if (!centerPending[normalizedKey]) centerPending[normalizedKey] = { count: 0, monto: 0, originalName: centro };
          centerPending[normalizedKey].count++;
          centerPending[normalizedKey].monto += monto;
        }
      }

      logger?.info(`📊 [bonusEval] Found pending invoices in ${Object.keys(centerPending).length} centers, ${centersWithActivity.size} centers with any activity`);

      const bonusWorkbook = new ExcelJS.Workbook();
      const bonusSheet = bonusWorkbook.addWorksheet("Evaluacion Bonos");

      const headerRow = bonusSheet.addRow([
        "Responsable", "Email", "Centros Asignados", "Centros con Pendientes",
        "Total Facturas Pendientes", "Monto Total Pendiente", "Bono ($150.000)", "Estado"
      ]);
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      const summaryLines: string[] = [];
      let totalBonos = 0;
      let totalNoBonos = 0;

      for (const resp of respResult.rows) {
        const centers = resp.center_names as string[];
        let totalPending = 0;
        let totalMonto = 0;
        const centersWithPending: string[] = [];
        let hasAnyActivity = false;

        for (const center of centers) {
          const normalizedCenter = normalizeCenterName(center);
          if (centersWithActivity.has(normalizedCenter)) {
            hasAnyActivity = true;
          }
          if (centerPending[normalizedCenter]) {
            const data = centerPending[normalizedCenter];
            totalPending += data.count;
            totalMonto += data.monto;
            centersWithPending.push(data.originalName);
          }
        }

        const getsBonus = totalPending === 0 && hasAnyActivity;
        const estado = !hasAnyActivity ? "SIN MOVIMIENTO" : (getsBonus ? "PAGAR" : "NO PAGAR");

        if (getsBonus) totalBonos++;
        else totalNoBonos++;

        const dataRow = bonusSheet.addRow([
          resp.name, resp.email, centers.length, centersWithPending.length,
          totalPending, totalMonto, getsBonus ? BONUS_AMOUNT : 0, estado
        ]);

        dataRow.getCell(6).numFmt = '#.##0';
        dataRow.getCell(7).numFmt = '#.##0';

        if (!hasAnyActivity) {
          dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
        } else if (getsBonus) {
          dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
        } else {
          dataRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } };
        }

        const statusIcon = !hasAnyActivity ? "⚪" : (getsBonus ? "OK" : "PENDIENTE");
        summaryLines.push(
          `  ${statusIcon} - ${resp.name}: ${totalPending} facturas pendientes, $${formatChileanNumber(totalMonto)} - ${estado}`
        );
      }

      const totalRow = bonusSheet.addRow([
        "TOTAL", "", "", "", "", "", totalBonos * BONUS_AMOUNT, `${totalBonos} pagan / ${totalNoBonos} no pagan`
      ]);
      totalRow.font = { bold: true };
      totalRow.getCell(7).numFmt = '#.##0';

      bonusSheet.getColumn(1).width = 35;
      bonusSheet.getColumn(2).width = 35;
      bonusSheet.getColumn(3).width = 18;
      bonusSheet.getColumn(4).width = 22;
      bonusSheet.getColumn(5).width = 22;
      bonusSheet.getColumn(6).width = 22;
      bonusSheet.getColumn(7).width = 18;
      bonusSheet.getColumn(8).width = 15;

      const detailSheet = bonusWorkbook.addWorksheet("Detalle por Centro");
      const detailHeader = detailSheet.addRow(["Centro de Gestion", "Facturas Pendientes", "Monto Pendiente", "Responsable"]);
      detailHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      detailHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };

      const allCenterResp: { [normalizedCenter: string]: string } = {};
      for (const resp of respResult.rows) {
        for (const center of resp.center_names as string[]) {
          allCenterResp[normalizeCenterName(center)] = resp.name;
        }
      }

      for (const [normalizedKey, data] of Object.entries(centerPending).sort((a, b) => a[0].localeCompare(b[0]))) {
        const respName = allCenterResp[normalizedKey] || "Sin responsable";
        const row = detailSheet.addRow([data.originalName, data.count, data.monto, respName]);
        row.getCell(3).numFmt = '#.##0';
      }

      detailSheet.getColumn(1).width = 60;
      detailSheet.getColumn(2).width = 20;
      detailSheet.getColumn(3).width = 20;
      detailSheet.getColumn(4).width = 35;

      const processedFilePath = path.join(
        path.dirname(filePath),
        `evaluacion_bonos_${getChileDateStr()}.xlsx`
      );
      await bonusWorkbook.xlsx.writeFile(processedFilePath);

      const bonusSummary = [
        `Evaluacion de bonos - ${totalBonos} pagan ($${formatChileanNumber(BONUS_AMOUNT)} c/u = $${formatChileanNumber(totalBonos * BONUS_AMOUNT)}), ${totalNoBonos} no pagan.`,
        ``,
        ...summaryLines,
      ].join("\n");

      logger?.info(`✅ [bonusEval] ${bonusSummary}`);
      logger?.info(`✅ [bonusEval] File saved: ${processedFilePath}`);

      await pool.end();

      return {
        processedFilePath,
        bonusSummary,
        success: true,
      };
    } catch (err: any) {
      logger?.error(`❌ [bonusEval] Error: ${err.message}`);
      await pool.end();
      return { processedFilePath: "", bonusSummary: `Error: ${err.message}`, success: false };
    }
  },
});
