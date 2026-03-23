import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import ExcelJS from "exceljs";
import * as fs from "fs";
import pg from "pg";
import { createPool } from "./dbPool";
import { normalizeCenterName } from "./centerNameUtils";

export const newCenterDetectionTool = createTool({
  id: "new-center-detection",
  description: "Compares cost centers found in the downloaded invoices with registered centers in the database and reports new ones",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the downloaded Excel file"),
  }),
  outputSchema: z.object({
    newCenters: z.array(z.string()),
    emailBody: z.string(),
    hasNewCenters: z.boolean(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    const { filePath } = inputData;

    if (!fs.existsSync(filePath)) {
      logger?.error(`❌ [newCenterDetection] File not found: ${filePath}`);
      return { newCenters: [], emailBody: "", hasNewCenters: false };
    }

    const pool = createPool();

    try {
      const existingResult = await pool.query(`
        SELECT center_name FROM cost_center_responsables
        UNION
        SELECT name FROM cost_centers
      `);
      const existingCenters = new Set(
        existingResult.rows.map((r: any) => {
          const raw = r.center_name || r.name || "";
          return normalizeCenterName(raw);
        })
      );
      logger?.info(`📊 [newCenterDetection] ${existingCenters.size} known centers in DB`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        await pool.end();
        return { newCenters: [], emailBody: "No worksheet found", hasNewCenters: false };
      }

      let headerRowNum = 1;
      let centroGestionCol = 0;

      for (let rowNum = 1; rowNum <= Math.min(10, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let cellCount = 0;
        row.eachCell(() => cellCount++);
        if (cellCount >= 10) {
          headerRowNum = rowNum;
          row.eachCell((cell, col) => {
            const val = cell.value?.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
            if (val.includes("centro") && val.includes("gestion")) centroGestionCol = col;
          });
          break;
        }
      }

      if (centroGestionCol === 0) {
        logger?.error("❌ [newCenterDetection] Centro gestion column not found");
        await pool.end();
        return { newCenters: [], emailBody: "Column not found", hasNewCenters: false };
      }

      const centersInFile = new Set<string>();
      for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const centro = row.getCell(centroGestionCol).value?.toString().trim() || "";
        if (centro) centersInFile.add(centro);
      }

      logger?.info(`📊 [newCenterDetection] ${centersInFile.size} unique centers in file`);

      const newCenters: string[] = [];
      for (const center of centersInFile) {
        if (!existingCenters.has(normalizeCenterName(center))) {
          newCenters.push(center);
        }
      }

      logger?.info(`📊 [newCenterDetection] ${newCenters.length} new centers found`);

      if (newCenters.length > 0) {
        for (const center of newCenters) {
          const match = center.match(/^\(([^)]+)\)/);
          const group = match ? match[1] : "";
          const rest = center.replace(/^\([^)]+\)\s*/, "");
          const centerCode = group ? `${group} - ${rest}` : center;
          await pool.query(
            `INSERT INTO cost_center_responsables (center_code, center_name, group_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (center_code) DO NOTHING`,
            [centerCode, center, group]
          );
        }
        logger?.info(`✅ [newCenterDetection] Added ${newCenters.length} new centers to DB`);
      }

      const emailBody = newCenters.length > 0
        ? [
          `Se detectaron ${newCenters.length} nuevos centros de costo en iConstruye que no estaban registrados:`,
          ``,
          ...newCenters.map((c) => `  - ${c}`),
          ``,
          `Estos centros han sido agregados al sistema sin responsable asignado.`,
          `Por favor asigne un responsable en el panel de administración.`,
        ].join("\n")
        : "";

      await pool.end();

      return {
        newCenters,
        emailBody,
        hasNewCenters: newCenters.length > 0,
      };
    } catch (err: any) {
      logger?.error(`❌ [newCenterDetection] Error: ${err.message}`);
      await pool.end();
      return { newCenters: [], emailBody: `Error: ${err.message}`, hasNewCenters: false };
    }
  },
});
