"use client";

import { cn } from "@/lib/cn";
import { LEVEL_TABLE_CELL_STYLE } from "@/lib/wonseo-constants";
import {
  WONSEO_SUBMITTED_TABLE_ROW_LABELS,
  WONSEO_TABLE_ROW_LABELS,
  buildSubmittedWonseoTableData,
  buildWonseoTableData,
  wonseoSubmittedTableCellValue,
  wonseoTableCellValue,
} from "@/lib/wonseo-table-data";
import type { Roster, WonseoCard } from "@/lib/database.types";

export function WonseoTableView({
  roster,
  cards,
  variant = "all",
}: {
  roster: Roster[];
  cards: WonseoCard[];
  /** "submitted"면 접수 표시(is_submitted)된 카드만, 수험번호·날짜 행을 더해 보여준다. */
  variant?: "all" | "submitted";
}) {
  const rowLabels: readonly string[] =
    variant === "submitted" ? WONSEO_SUBMITTED_TABLE_ROW_LABELS : WONSEO_TABLE_ROW_LABELS;
  const cellValue: (card: WonseoCard | undefined, label: string) => string =
    variant === "submitted"
      ? (card, label) => wonseoSubmittedTableCellValue(card, label as (typeof WONSEO_SUBMITTED_TABLE_ROW_LABELS)[number])
      : (card, label) => wonseoTableCellValue(card, label as (typeof WONSEO_TABLE_ROW_LABELS)[number]);
  const { maxChoices, students } =
    variant === "submitted" ? buildSubmittedWonseoTableData(roster, cards) : buildWonseoTableData(roster, cards);

  if (students.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xs font-semibold text-slate-500">
          {variant === "submitted" ? "접수 표시된 원서가 없습니다." : "등록된 원서 카드가 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="text-xs border-collapse w-full table-fixed min-w-max">
        <colgroup>
          <col className="w-16" />
          <col className="w-16" />
          {Array.from({ length: maxChoices }, (_, i) => (
            <col key={i} className="w-[130px]" />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["이름", "구분"].map((h) => (
              <th
                key={h}
                className="bg-slate-900 text-white font-bold px-3 py-2.5 whitespace-nowrap sticky top-0"
              >
                {h}
              </th>
            ))}
            {Array.from({ length: maxChoices }, (_, i) => (
              <th
                key={i}
                className="bg-slate-900 text-white font-bold px-3 py-2.5 whitespace-nowrap sticky top-0"
              >
                {i + 1}지망
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <StudentRows
              key={student.studentId}
              student={student}
              maxChoices={maxChoices}
              rowLabels={rowLabels}
              cellValue={cellValue}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentRows({
  student,
  maxChoices,
  rowLabels,
  cellValue,
}: {
  student: { studentId: string; name: string; cards: WonseoCard[] };
  maxChoices: number;
  rowLabels: readonly string[];
  cellValue: (card: WonseoCard | undefined, label: string) => string;
}) {
  return (
    <>
      {rowLabels.map((label, li) => (
        <tr key={label} className={cn("border-t", li === 0 ? "border-slate-400" : "border-slate-100")}>
          {li === 0 && (
            <td
              rowSpan={rowLabels.length}
              className="bg-indigo-50 text-slate-800 font-bold text-center align-middle px-2 py-2 border-r border-slate-200 whitespace-nowrap"
            >
              {student.name}
            </td>
          )}
          <td className="text-slate-500 font-bold px-3 py-2 whitespace-nowrap">{label}</td>
          {Array.from({ length: maxChoices }, (_, i) => {
            const card = student.cards[i];
            const value = cellValue(card, label);
            const isLevel = label === "지원정도" && card;
            return (
              <td
                key={i}
                className={cn(
                  "px-3 py-2 text-center break-words",
                  isLevel ? `font-bold ${LEVEL_TABLE_CELL_STYLE[card.level]}` : "text-slate-700",
                )}
              >
                {value || "-"}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
