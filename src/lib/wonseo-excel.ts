import type { Roster, SupportLevel, WonseoCard } from "@/lib/database.types";
import {
  WONSEO_SUBMITTED_TABLE_ROW_LABELS,
  WONSEO_TABLE_ROW_LABELS,
  buildSubmittedWonseoTableData,
  buildWonseoTableData,
  wonseoSubmittedTableCellValue,
  wonseoTableCellValue,
} from "@/lib/wonseo-table-data";

const LEVEL_COLORS: Record<SupportLevel, { font: string; bg: string }> = {
  상향: { font: "FFB91C1C", bg: "FFFEE2E2" },
  소신: { font: "FFB45309", bg: "FFFEF3C7" },
  적정: { font: "FF047857", bg: "FFD1FAE5" },
  하향: { font: "FF1D4ED8", bg: "FFDBEAFE" },
};

const HEADER_BG = "FF1E293B";
const ID_NAME_BG = "FFEEF2FF";
const BORDER = { style: "thin" as const, color: { argb: "FFCBD5E1" } };

/**
 * variant가 "submitted"면 "접수한 원서 보기" 화면과 같은 데이터(접수 표시된 카드만,
 * submitted_sort_order 순)와 행 구성(수험번호·날짜 포함)으로 내보낸다 — 화면의
 * WonseoTableView와 동일한 구분이다.
 */
export async function exportWonseoExcel(
  roster: Roster[],
  cards: WonseoCard[],
  variant: "all" | "submitted" = "all",
) {
  const ExcelJS = (await import("exceljs")).default;
  const rowLabels: readonly string[] = variant === "submitted" ? WONSEO_SUBMITTED_TABLE_ROW_LABELS : WONSEO_TABLE_ROW_LABELS;
  const cellValue: (card: WonseoCard | undefined, label: string) => string =
    variant === "submitted"
      ? (card, label) => wonseoSubmittedTableCellValue(card, label as (typeof WONSEO_SUBMITTED_TABLE_ROW_LABELS)[number])
      : (card, label) => wonseoTableCellValue(card, label as (typeof WONSEO_TABLE_ROW_LABELS)[number]);
  const { maxChoices, students } =
    variant === "submitted" ? buildSubmittedWonseoTableData(roster, cards) : buildWonseoTableData(roster, cards);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수시 원서 현황");

  sheet.columns = [
    { header: "학번", width: 10 },
    { header: "이름", width: 12 },
    { header: "구분", width: 14 },
    ...Array.from({ length: maxChoices }, (_, i) => ({ header: `${i + 1}지망`, width: 20 })),
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 22;

  for (const student of students) {
    const startRow = sheet.rowCount + 1;

    for (const label of rowLabels) {
      const rowValues = [
        "",
        "",
        label,
        ...Array.from({ length: maxChoices }, (_, i) => cellValue(student.cards[i], label)),
      ];
      const row = sheet.addRow(rowValues);
      row.getCell(3).font = { bold: true };

      if (label === "지원정도") {
        student.cards.forEach((card, i) => {
          const colors = LEVEL_COLORS[card.level];
          const cell = row.getCell(4 + i);
          cell.font = { bold: true, color: { argb: colors.font } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
          cell.alignment = { horizontal: "center" };
        });
      }
    }

    const endRow = sheet.rowCount;
    sheet.getCell(startRow, 1).value = student.studentId;
    sheet.getCell(startRow, 2).value = student.name;
    if (endRow > startRow) {
      sheet.mergeCells(startRow, 1, endRow, 1);
      sheet.mergeCells(startRow, 2, endRow, 2);
    }
    for (let r = startRow; r <= endRow; r++) {
      for (const col of [1, 2]) {
        const cell = sheet.getCell(r, col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ID_NAME_BG } };
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    }
  }

  const totalCols = 3 + maxChoices;
  for (let r = 1; r <= sheet.rowCount; r++) {
    for (let c = 1; c <= totalCols; c++) {
      sheet.getCell(r, c).border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileNamePrefix = variant === "submitted" ? "접수한원서현황" : "수시원서현황";
  a.download = `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
