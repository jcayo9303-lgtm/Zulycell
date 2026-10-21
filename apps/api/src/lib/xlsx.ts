import type { Response } from "express";
import ExcelJS from "exceljs";

// Exportación a Excel (.xlsx). Todas las descargas del sistema usan este helper.

export type XlsxColumn = {
  header: string;
  key: string;
  width?: number;
  /** "money" → #,##0.00 · "qty" → #,##0.### · "int" → 0 · "date" → dd/mm/yyyy · "datetime" → dd/mm/yyyy hh:mm */
  format?: "money" | "qty" | "int" | "date" | "datetime";
};

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
  /** Fila de totales: claves de columna a sumar */
  totals?: string[];
};

const FORMATS: Record<NonNullable<XlsxColumn["format"]>, string> = {
  money: "#,##0.00",
  qty: "#,##0.###",
  int: "0",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

export async function buildXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "zulycell";
  wb.created = new Date();

  for (const sheet of sheets) {
    // Excel limita el nombre de hoja a 31 caracteres y prohíbe algunos símbolos
    const ws = wb.addWorksheet(sheet.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
      style: c.format ? { numFmt: FORMATS[c.format] } : undefined,
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    head.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of sheet.rows) ws.addRow(row);

    if (sheet.totals?.length && sheet.rows.length) {
      const total: Record<string, unknown> = { [sheet.columns[0].key]: "TOTAL" };
      for (const key of sheet.totals) {
        total[key] = sheet.rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
      }
      ws.addRow(total).font = { bold: true };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Envía el libro como descarga: sendXlsx(res, "ventas-2026-10", [...]) */
export async function sendXlsx(res: Response, filename: string, sheets: XlsxSheet[]) {
  const buffer = await buildXlsx(sheets);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}.xlsx"`);
  res.send(buffer);
}
