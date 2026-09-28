// exceljs là CJS — Node ESM (prod) chỉ hỗ trợ default import
// (named import "exceljs" ném lỗi runtime). Vitest len hơn, chấp nhận cả 2.
//
// Theo dõi: exceljs 4.4.0 dính CVE-2026-78206/78207/78209 — chỉ khai thác được
// khi *parse* file xlsx do user upload hoặc dùng CSV writer nộibuild của exceljs.
// Code hiện tại chỉ write (writeBuffer) + tự build CSV → không lộ. Trước khi làm
// feature nào "import .xlsx" phải audit lại 3 CVE này.
import exceljs from "exceljs";

/**
 * Export lịch sử chi tiêu ra file (xlsx/csv) — dùng chung cho 2 route export.
 *
 * Thiết kế:
 * - Column `Ngày` giữ text ISO `YYYY-MM-DD` (schema `date` là local date, không qua
 *   timezone) — không mơ hồ, đúng trên mọi timezone, sort được, Google Sheets tự nhận là date.
 * - Số tiền luôn là number (csv không phân nghìn) để spreadsheet app nhận là number → tổng được.
 */

/** Một dòng lịch sử chi tiêu cho export (đã join category + người tạo). */
export interface ExportRow {
  /** Local date `YYYY-MM-DD` (trường `date` của Expense). */
  date: string;
  amount: number;
  note: string | null;
  category: string;
  createdByName: string;
  createdAt: Date;
}

export type ExportFormat = "xlsx" | "csv";

/** Tên file export — do server sinh toàn bộ (không dính user input) nên an toàn dùng thẳng trong header. */
export function expenseFileName(
  scope: string,
  format: ExportFormat,
  now: Date = new Date(),
): string {
  // YYYYMMDDHHmmss (UTC)
  const ts = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `chi-tieu-${scope}-${ts}.${format === "csv" ? "csv" : "xlsx"}`;
}

/** Format `createdAt` (UTC) cho export: `YYYY-MM-DD HH:mm` — text không mơ hồ. */
export function formatCreatedTimeUtc(createdAt: Date): string {
  return createdAt.toISOString().slice(0, 16).replace("T", " ");
}

/** Tạo .xlsx: header bold + nền xám nhạt, column Số tiền format `#,##0`. */
export async function buildExpenseXlsx(rows: ExportRow[]): Promise<Uint8Array> {
  const workbook = new exceljs.Workbook();
  workbook.creator = "Chi Tiêu Gia Đình";
  const sheet = workbook.addWorksheet("Lịch sử chi tiêu");
  sheet.columns = [
    { header: "Ngày", key: "date", width: 14 },
    { header: "Số tiền (VNĐ)", key: "amount", width: 16 },
    { header: "Danh mục", key: "category", width: 20 },
    { header: "Ghi chú", key: "note", width: 32 },
    { header: "Người tạo", key: "createdByName", width: 16 },
    { header: "Ngày tạo (UTC)", key: "createdAt", width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } };

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      amount: row.amount,
      category: row.category,
      note: row.note ?? "",
      createdByName: row.createdByName,
      createdAt: formatCreatedTimeUtc(row.createdAt),
    });
  }

  for (let i = 2; i <= sheet.rowCount; i += 1) {
    sheet.getRow(i).getCell("amount").numFmt = "#,##0";
  }

  // exceljs khai báo interface `Buffer` riêng trong d.ts (không export) — không
  // tương thích cấu trúc với Buffer của Node → cast tại biên (runtime là Buffer thật)
  return workbook.xlsx.writeBuffer() as unknown as Uint8Array;
}

/** RFC 4180: field chứa `,` `"` hoặc xuống dòng → bọc `"..."`, dấu `"` bên trong nhân đôi. */
export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Chống CSV formula injection: chuỗi bắt đầu bằng `= + - @` (hoặc tab) bị
 * Excel/Google Sheets hiểu là công thức → thêm tiền tố `'` để luôn coi là text.
 * (xlsx không cần: exceljs ghi cell dạng text, không thành formula.)
 * Gọi TRƯỚC csvEscape để ký tự đầu `'` không bị che bởi dấu bọc.
 */
export function csvFormulaSafe(value: string): string {
  return /^[=+\-@\t]/.test(value) ? `'${value}` : value;
}

/**
 * Tạo chuỗi CSV có BOM UTF-8 đầu file — tiếng Việt hiển thị đúng khi mở bằng
 * Excel/Google Sheets. Amount là integer thuần (không phân nghìn) để app
 * spreadsheet tự nhận là number.
 */
export function buildExpenseCsv(rows: ExportRow[]): string {
  const lines = [
    ["Ngày", "Số tiền (VNĐ)", "Danh mục", "Ghi chú", "Người tạo", "Ngày tạo (UTC)"].join(","),
  ];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        String(row.amount),
        csvEscape(csvFormulaSafe(row.category)),
        csvEscape(csvFormulaSafe(row.note ?? "")),
        csvEscape(csvFormulaSafe(row.createdByName)),
        formatCreatedTimeUtc(row.createdAt),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
