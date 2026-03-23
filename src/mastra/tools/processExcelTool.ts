import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { createPool } from "./dbPool";

function findHeaderRow(worksheet: ExcelJS.Worksheet, logger: any): { rowNum: number; headers: { [key: string]: number } } {
  for (let rowNum = 1; rowNum <= Math.min(10, worksheet.rowCount); rowNum++) {
    const row = worksheet.getRow(rowNum);
    const headers: { [key: string]: number } = {};
    let cellCount = 0;

    row.eachCell((cell, colNumber) => {
      const value = cell.value?.toString().trim() || "";
      if (value) {
        headers[value] = colNumber;
        cellCount++;
      }
    });

    const headerKeys = Object.keys(headers).map((h) =>
      h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );

    const hasEstadoAsociacion = headerKeys.some(
      (h) => h.includes("estado") && h.includes("asociacion")
    );
    const hasEstadoDocumento = headerKeys.some(
      (h) => h.includes("estado") && h.includes("documento")
    );

    if (hasEstadoAsociacion || hasEstadoDocumento || cellCount >= 10) {
      logger?.info(`📊 [findHeader] Header row found at row ${rowNum} with ${cellCount} columns`);
      return { rowNum, headers };
    }
  }

  logger?.warn("⚠️ [findHeader] No clear header row found, defaulting to row 1");
  const row = worksheet.getRow(1);
  const headers: { [key: string]: number } = {};
  row.eachCell((cell, colNumber) => {
    const value = cell.value?.toString().trim() || "";
    if (value) headers[value] = colNumber;
  });
  return { rowNum: 1, headers };
}

function formatChileanNumber(num: number): string {
  const parts = Math.round(num).toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

async function getActiveCostCenters(logger: any, pool: pg.Pool): Promise<string[]> {
  try {
    logger?.info(`📊 [processExcel] Querying cost_centers with DATABASE_URL: ${process.env.DATABASE_URL ? "SET (" + process.env.DATABASE_URL.substring(0, 30) + "...)" : "NOT SET"}`);
    const result = await pool.query("SELECT name FROM cost_centers WHERE active = true ORDER BY name");
    const names = result.rows.map((r: any) => r.name);
    logger?.info(`📊 [processExcel] Loaded ${names.length} active cost centers from DB`);
    if (names.length === 0) {
      const allResult = await pool.query("SELECT count(*) as total FROM cost_centers");
      logger?.info(`📊 [processExcel] Total cost_centers rows (active + inactive): ${allResult.rows[0]?.total}`);
    }
    return names;
  } catch (err: any) {
    logger?.error(`❌ [processExcel] Error loading cost centers: ${err.message}`);
    logger?.error(`❌ [processExcel] Error stack: ${err.stack}`);
    return [];
  }
}

function getChileDateStr(): string {
  const d = new Date();
  const parts = d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }).split("/");
  return parts[0];
}

async function saveDailySnapshot(
  pool: pg.Pool,
  pivot: { [centro: string]: { count: number; monto: number } },
  logger: any
): Promise<void> {
  const today = getChileDateStr();
  try {
    await pool.query("DELETE FROM daily_snapshots WHERE run_date = $1", [today]);
    for (const [center, data] of Object.entries(pivot)) {
      await pool.query(
        "INSERT INTO daily_snapshots (run_date, center_name, pending_count, pending_amount) VALUES ($1, $2, $3, $4)",
        [today, center, data.count, data.monto]
      );
    }
    logger?.info(`📊 [processExcel] Saved ${Object.keys(pivot).length} snapshot rows for ${today}`);
  } catch (err: any) {
    logger?.error(`❌ [processExcel] Error saving snapshot: ${err.message}`);
  }
}

async function getPreviousSnapshot(
  pool: pg.Pool,
  logger: any
): Promise<{ [center: string]: { count: number; monto: number } }> {
  const today = getChileDateStr();
  try {
    const result = await pool.query(
      "SELECT center_name, pending_count, pending_amount FROM daily_snapshots WHERE run_date = (SELECT MAX(run_date) FROM daily_snapshots WHERE run_date < $1)",
      [today]
    );
    const prev: { [center: string]: { count: number; monto: number } } = {};
    for (const row of result.rows) {
      prev[row.center_name] = {
        count: parseInt(row.pending_count),
        monto: parseFloat(row.pending_amount),
      };
    }
    logger?.info(`📊 [processExcel] Loaded ${result.rows.length} previous snapshot rows`);
    return prev;
  } catch (err: any) {
    logger?.error(`❌ [processExcel] Error loading previous snapshot: ${err.message}`);
    return {};
  }
}

function generateIndicators(
  currentPivot: { [centro: string]: { count: number; monto: number } },
  previousPivot: { [centro: string]: { count: number; monto: number } },
  logger: any
): string {
  if (Object.keys(previousPivot).length === 0) {
    return "Sin datos del dia anterior para comparar.";
  }

  const alerts: string[] = [];

  for (const [center, prevData] of Object.entries(previousPivot)) {
    const currentData = currentPivot[center];
    const currentCount = currentData ? currentData.count : 0;
    const resolved = prevData.count - currentCount;
    const resolvedPct = prevData.count > 0 ? (resolved / prevData.count) * 100 : 100;

    if (resolvedPct < 50) {
      const currentMonto = currentData ? currentData.monto : 0;
      alerts.push(
        `  * ${center}: ${prevData.count} pendientes ayer, ${currentCount} hoy (resolvio ${resolved} = ${Math.round(resolvedPct)}%). Monto pendiente: $${formatChileanNumber(currentMonto)}`
      );
    }
  }

  for (const [center, data] of Object.entries(currentPivot)) {
    if (!previousPivot[center]) {
      alerts.push(
        `  * ${center}: NUEVO - ${data.count} facturas pendientes, $${formatChileanNumber(data.monto)} (no tenia pendientes ayer)`
      );
    }
  }

  if (alerts.length === 0) {
    return "Todos los centros resolvieron al menos el 50% de sus documentos pendientes.";
  }

  return `${alerts.length} centro(s) con resolucion menor al 50%:\n${alerts.join("\n")}`;
}

export const processExcelTool = createTool({
  id: "process-excel",
  description:
    "Reads the downloaded Excel file, filters invoices by Estado Asociacion + Estado Documento + active cost centers, generates pivot table and daily comparison indicators",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the downloaded Excel file"),
  }),
  outputSchema: z.object({
    processedFilePath: z.string(),
    totalRows: z.number(),
    filteredRows: z.number(),
    summary: z.string(),
    pivotData: z.string(),
    indicators: z.string(),
    success: z.boolean(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();

    const { filePath } = inputData;

    if (!fs.existsSync(filePath)) {
      logger?.error(`❌ [processExcel] File not found: ${filePath}`);
      return {
        processedFilePath: "",
        totalRows: 0,
        filteredRows: 0,
        summary: `File not found: ${filePath}`,
        pivotData: "",
        indicators: "",
        success: false,
      };
    }

    const pool = createPool();

    try {
      const activeCenters = await getActiveCostCenters(logger, pool);
      if (activeCenters.length === 0) {
        logger?.error("❌ [processExcel] No active cost centers found, aborting to avoid including inactive centers");
        return {
          processedFilePath: "",
          totalRows: 0,
          filteredRows: 0,
          summary: "Error: No se encontraron centros de costo activos en la base de datos.",
          pivotData: "",
          indicators: "",
          success: false,
        };
      }
      logger?.info(`📊 [processExcel] Active centers (${activeCenters.length}): ${activeCenters.slice(0, 5).join(", ")}...`);
      const activeCentersNormalized = activeCenters.map(c => c.toLowerCase().replace(/\s+/g, " ").trim());

      logger?.info(`📊 [processExcel] Reading Excel file: ${filePath}`);
      const workbook = new ExcelJS.Workbook();

      if (filePath.endsWith(".csv")) {
        await workbook.csv.readFile(filePath);
      } else {
        await workbook.xlsx.readFile(filePath);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        logger?.error("❌ [processExcel] No worksheet found in the file");
        await pool.end();
        return {
          processedFilePath: "",
          totalRows: 0,
          filteredRows: 0,
          summary: "No worksheet found in the Excel file",
          pivotData: "",
          indicators: "",
          success: false,
        };
      }

      const { rowNum: headerRowNum, headers } = findHeaderRow(worksheet, logger);
      logger?.info(
        `📊 [processExcel] Headers at row ${headerRowNum}: ${JSON.stringify(Object.keys(headers))}`
      );

      let estadoAsociacionCol = 0;
      let estadoDocumentoCol = 0;
      let centroGestionCol = 0;
      let montoTotalCol = 0;

      for (const [header, col] of Object.entries(headers)) {
        const normalized = header
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (normalized.includes("estado") && normalized.includes("asociacion")) {
          estadoAsociacionCol = col;
        }
        if (normalized.includes("estado") && normalized.includes("documento")) {
          estadoDocumentoCol = col;
        }
        if (normalized.includes("centro") && normalized.includes("gestion")) {
          centroGestionCol = col;
        }
        if (normalized.includes("monto") && normalized.includes("total")) {
          montoTotalCol = col;
        }
      }

      if (estadoAsociacionCol === 0 || estadoDocumentoCol === 0) {
        logger?.warn("⚠️ [processExcel] Trying flexible column match...");
        for (const [header, col] of Object.entries(headers)) {
          const lower = header.toLowerCase();
          if (lower.includes("asocia") && estadoAsociacionCol === 0) estadoAsociacionCol = col;
          if (lower.includes("documento") && !lower.includes("asocia") && estadoDocumentoCol === 0) estadoDocumentoCol = col;
        }
      }

      if (centroGestionCol === 0) {
        for (const [header, col] of Object.entries(headers)) {
          const lower = header.toLowerCase();
          if (lower.includes("centro") || lower.includes("gestion")) centroGestionCol = col;
        }
      }

      if (montoTotalCol === 0) {
        for (const [header, col] of Object.entries(headers)) {
          const lower = header.toLowerCase();
          if (lower.includes("monto")) montoTotalCol = col;
        }
      }

      logger?.info(
        `📊 [processExcel] Columns - Asociacion: ${estadoAsociacionCol}, Documento: ${estadoDocumentoCol}, Centro: ${centroGestionCol}, Monto: ${montoTotalCol}`
      );

      const totalRows = worksheet.rowCount - headerRowNum;
      const filteredWorkbook = new ExcelJS.Workbook();
      const filteredSheet = filteredWorkbook.addWorksheet("Facturas Pendientes");

      const headerRow = worksheet.getRow(headerRowNum);
      const headerValues: any[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headerValues[colNumber] = cell.value;
      });
      const cleanHeaderValues = headerValues.filter((v) => v !== undefined);
      filteredSheet.addRow(cleanHeaderValues);

      const filteredHeaderRow = filteredSheet.getRow(1);
      filteredHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      filteredHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      let filteredCount = 0;
      const validAsociacion = ["no asociada", "parcialmente asociada"];
      const validDocumento = ["ingresada", "aprobada"];

      const pivot: { [centro: string]: { count: number; monto: number } } = {};

      for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);

        let isEmpty = true;
        row.eachCell((cell) => {
          if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
            isEmpty = false;
          }
        });
        if (isEmpty) continue;

        let estadoAsociacion = "";
        let estadoDocumento = "";
        let centroGestion = "";
        let montoTotal = 0;

        if (estadoAsociacionCol > 0) {
          estadoAsociacion = (
            row.getCell(estadoAsociacionCol).value?.toString().trim() || ""
          ).toLowerCase();
        }
        if (estadoDocumentoCol > 0) {
          estadoDocumento = (
            row.getCell(estadoDocumentoCol).value?.toString().trim() || ""
          ).toLowerCase();
        }
        if (centroGestionCol > 0) {
          centroGestion = row.getCell(centroGestionCol).value?.toString().trim() || "";
        }
        if (montoTotalCol > 0) {
          const rawMonto = row.getCell(montoTotalCol).value;
          if (typeof rawMonto === "number") {
            montoTotal = rawMonto;
          } else if (rawMonto) {
            const cleaned = rawMonto.toString().replace(/[$.]/g, "").replace(",", ".").trim();
            montoTotal = parseFloat(cleaned) || 0;
          }
        }

        const matchAsociacion =
          estadoAsociacionCol === 0 || validAsociacion.includes(estadoAsociacion);
        const matchDocumento =
          estadoDocumentoCol === 0 || validDocumento.includes(estadoDocumento);

        let matchCentro = true;
        if (activeCentersNormalized.length > 0 && centroGestionCol > 0) {
          const normalizedCentro = centroGestion.toLowerCase().replace(/\s+/g, " ").trim();
          matchCentro = activeCentersNormalized.includes(normalizedCentro);
          if (!matchCentro && centroGestion) {
            logger?.debug(`🚫 [processExcel] Excluded inactive/unknown center: "${centroGestion}"`);
          }
        }

        if (matchAsociacion && matchDocumento && matchCentro) {
          const rowValues: any[] = [];
          row.eachCell((cell, colNumber) => {
            rowValues[colNumber] = cell.value;
          });
          filteredSheet.addRow(rowValues.filter((v) => v !== undefined));
          filteredCount++;

          const key = centroGestion || "Sin Centro";
          if (!pivot[key]) {
            pivot[key] = { count: 0, monto: 0 };
          }
          pivot[key].count++;
          pivot[key].monto += montoTotal;
        }
      }

      filteredSheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? cell.value.toString().length : 10;
          if (cellLength > maxLength) maxLength = cellLength;
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      const previousPivot = await getPreviousSnapshot(pool, logger);
      const indicators = generateIndicators(pivot, previousPivot, logger);
      logger?.info(`📊 [processExcel] Indicators:\n${indicators}`);

      await saveDailySnapshot(pool, pivot, logger);

      const pivotSheet = filteredWorkbook.addWorksheet("Resumen por Centro");

      const hasPrevious = Object.keys(previousPivot).length > 0;
      const pivotHeaders = hasPrevious
        ? ["Centro de Gestion", "Ayer", "Hoy", "Resueltos", "% Resolucion", "Monto Pendiente"]
        : ["Centro de Gestion", "Cantidad", "Monto Total"];

      const pivotHeaderRow = pivotSheet.addRow(pivotHeaders);
      pivotHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      pivotHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      const allCenters = new Set([...Object.keys(pivot), ...Object.keys(previousPivot)]);
      const sortedCenters = Array.from(allCenters).sort();
      let grandTotalCount = 0;
      let grandTotalMonto = 0;
      let grandPrevCount = 0;

      for (const centro of sortedCenters) {
        const current = pivot[centro] || { count: 0, monto: 0 };
        const prev = previousPivot[centro] || { count: 0, monto: 0 };

        if (current.count === 0 && !pivot[centro]) continue;

        grandTotalCount += current.count;
        grandTotalMonto += current.monto;
        grandPrevCount += prev.count;

        if (hasPrevious) {
          const resolved = prev.count - current.count;
          const pct = prev.count > 0 ? Math.round((resolved / prev.count) * 100) : (current.count > 0 ? 0 : 100);
          const dataRow = pivotSheet.addRow([centro, prev.count, current.count, resolved, `${pct}%`, current.monto]);
          dataRow.getCell(6).numFmt = '#.##0';

          if (pct < 50) {
            dataRow.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFCE4EC" },
            };
          }
        } else {
          const dataRow = pivotSheet.addRow([centro, current.count, current.monto]);
          dataRow.getCell(3).numFmt = '#.##0';
        }
      }

      if (hasPrevious) {
        const totalResolved = grandPrevCount - grandTotalCount;
        const totalPct = grandPrevCount > 0 ? Math.round((totalResolved / grandPrevCount) * 100) : 100;
        const totalRow = pivotSheet.addRow(["TOTAL", grandPrevCount, grandTotalCount, totalResolved, `${totalPct}%`, grandTotalMonto]);
        totalRow.font = { bold: true };
        totalRow.getCell(6).numFmt = '#.##0';
        totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
      } else {
        const totalRow = pivotSheet.addRow(["TOTAL", grandTotalCount, grandTotalMonto]);
        totalRow.font = { bold: true };
        totalRow.getCell(3).numFmt = '#.##0';
        totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
      }

      pivotSheet.getColumn(1).width = 60;
      pivotSheet.getColumn(2).width = 12;
      pivotSheet.getColumn(3).width = 12;
      if (hasPrevious) {
        pivotSheet.getColumn(4).width = 12;
        pivotSheet.getColumn(5).width = 15;
        pivotSheet.getColumn(6).width = 18;
      }

      const processedFilePath = path.join(
        path.dirname(filePath),
        `facturas_pendientes_${getChileDateStr()}.xlsx`
      );
      await filteredWorkbook.xlsx.writeFile(processedFilePath);

      const pivotLines = Object.entries(pivot)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([centro, data]) => `  - ${centro}: ${data.count} facturas, $${formatChileanNumber(data.monto)}`);
      pivotLines.push(`  - TOTAL: ${grandTotalCount} facturas, $${formatChileanNumber(grandTotalMonto)}`);
      const pivotDataStr = pivotLines.join("\n");

      const summary = `Facturas pendientes: ${filteredCount} (de ${activeCenters.length} centros activos).`;

      logger?.info(`✅ [processExcel] ${summary}`);
      logger?.info(`✅ [processExcel] Processed file saved to: ${processedFilePath}`);

      await pool.end();

      return {
        processedFilePath,
        totalRows,
        filteredRows: filteredCount,
        summary,
        pivotData: pivotDataStr,
        indicators,
        success: true,
      };
    } catch (err: any) {
      logger?.error(`❌ [processExcel] Error processing Excel: ${err.message}`);
      await pool.end();
      return {
        processedFilePath: "",
        totalRows: 0,
        filteredRows: 0,
        summary: `Error processing Excel: ${err.message}`,
        pivotData: "",
        indicators: "",
        success: false,
      };
    }
  },
});
