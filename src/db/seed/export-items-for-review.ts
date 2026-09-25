/**
 * Exports every item in the bank to a formatted Excel workbook for human
 * content review, per this project's QA process (see README.md's
 * "Curriculum content" sections — all AI-generated items are pending human
 * review before they're considered production content).
 *
 * Re-run this any time you want a fresh export (e.g. after new content is
 * added, or to pick up items other reviewers have since approved/flagged in
 * the database via import-review.ts).
 *
 * Usage:
 *   npm run review:export -- [output.xlsx]
 *   (defaults to recallie-content-review.xlsx in the current directory)
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { items, skills, curriculumSequenceEntries } from "../schema";

const STATUS_OPTIONS = ["pending", "approved", "flagged"] as const;

function colLetter(index: number): string {
  // 0-based column index -> Excel column letter (A, B, ..., Z, AA, ...)
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function main() {
  const outPath = process.argv[2] || "recallie-content-review.xlsx";

  console.log("Loading curriculum sequence (for term/week lookup)...");
  const seqRows = await db.select().from(curriculumSequenceEntries);
  const skillTermWeek = new Map<string, { term: number; week: number }>();
  for (const row of seqRows) {
    for (const skillId of row.skillIds) {
      skillTermWeek.set(skillId, { term: row.term, week: row.week });
    }
  }

  console.log("Loading items + skills...");
  const rows = await db
    .select({ item: items, skill: skills })
    .from(items)
    .innerJoin(skills, eq(items.skillId, skills.id));

  console.log(`Loaded ${rows.length} items. Sorting and building workbook...`);

  rows.sort((a, b) => {
    const subjA = a.skill.subject;
    const subjB = b.skill.subject;
    if (subjA !== subjB) return subjA.localeCompare(subjB);
    const tw = (r: typeof a) => skillTermWeek.get(r.item.skillId) ?? { term: 99, week: 99 };
    const twA = tw(a);
    const twB = tw(b);
    if (twA.term !== twB.term) return twA.term - twB.term;
    if (twA.week !== twB.week) return twA.week - twB.week;
    if (a.item.skillId !== b.item.skillId) return a.item.skillId.localeCompare(b.item.skillId);
    return a.item.id.localeCompare(b.item.id);
  });

  const headers = [
    "itemId",
    "subject",
    "term",
    "week",
    "skillId",
    "skillDescription",
    "strand",
    "difficulty",
    "questionType",
    "passage",
    "questionText",
    "answerKey",
    "stepByStepSolution",
    "commonMisconceptions",
    "hints",
    "tags",
    "reviewStatus",
    "reviewNotes",
  ];
  const EDITABLE_COLS = ["reviewStatus", "reviewNotes"];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Recallie content review export";
  workbook.created = new Date();

  // ---- Instructions sheet ----
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 100 }];
  const introLines = [
    "Recallie content review",
    "",
    "This workbook lists every practice item currently in the bank, one row per item, on the",
    "\"Items\" tab. It's for reviewing AI-generated questions before they're treated as final,",
    "production-ready content.",
    "",
    "What to do:",
    "  1. Read through each row (or filter/sort by subject, term, or skillId first — every",
    "     column has a filter arrow).",
    "  2. In the \"reviewStatus\" column, pick one from the dropdown: pending / approved / flagged.",
    "     Every item starts as \"pending\". Leave it as pending if you haven't reviewed it yet.",
    "  3. Use \"reviewNotes\" for anything you want fixed or want to remember (free text).",
    "  4. Save the file, then send it back / hand it to Claude to import.",
    "",
    "What happens after import:",
    "  - \"flagged\" items stop appearing in real children's sessions immediately.",
    "  - \"pending\" and \"approved\" items both keep showing to children as normal — approving",
    "     something doesn't change its behaviour today, it's just your record of having",
    "     checked it. Only flagging something changes what a child sees.",
    "  - You can re-export any time to get a fresh copy that includes review decisions",
    "    already saved in the database, so you never lose progress by re-running the export.",
    "",
    "Columns you edit: reviewStatus, reviewNotes (highlighted below).",
    "Everything else describes the item itself — please don't edit those, since the import",
    "matches rows back to the database by \"itemId\" and ignores changes to any other column.",
    "",
    "Example (already filled in, this is not a real item):",
  ];
  introLines.forEach((line, i) => {
    const cell = instructions.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
    else if (line.trim() === "" ) { /* spacer */ }
    else if (!line.startsWith(" ")) cell.font = { bold: true };
  });
  const exampleHeaderRow = introLines.length + 1;
  const exHeader = instructions.getRow(exampleHeaderRow);
  ["itemId", "reviewStatus", "reviewNotes"].forEach((h, i) => {
    const c = exHeader.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3D0" } };
  });
  const exValueRow = instructions.getRow(exampleHeaderRow + 1);
  exValueRow.getCell(1).value = "M3N01_Y3_003";
  exValueRow.getCell(2).value = "flagged";
  exValueRow.getCell(3).value = "Answer key says 4,200 but the correct total is 4,020 — please fix.";

  // ---- Items sheet ----
  const sheet = workbook.addWorksheet("Items", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((h) => ({ header: h, key: h, width: widthFor(h) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5EEF7" } };

  function widthFor(h: string): number {
    switch (h) {
      case "itemId": return 22;
      case "subject": return 10;
      case "term": return 6;
      case "week": return 6;
      case "skillId": return 26;
      case "skillDescription": return 40;
      case "strand": return 12;
      case "difficulty": return 10;
      case "questionType": return 15;
      case "passage": return 40;
      case "questionText": return 50;
      case "answerKey": return 20;
      case "stepByStepSolution": return 50;
      case "commonMisconceptions": return 40;
      case "hints": return 40;
      case "tags": return 20;
      case "reviewStatus": return 14;
      case "reviewNotes": return 40;
      default: return 20;
    }
  }

  for (const { item, skill } of rows) {
    const tw = skillTermWeek.get(item.skillId);
    const answerKey = Array.isArray(item.answerKey) ? item.answerKey.join(" | ") : String(item.answerKey);
    sheet.addRow({
      itemId: item.id,
      subject: skill.subject,
      term: tw?.term ?? "",
      week: tw?.week ?? "",
      skillId: item.skillId,
      skillDescription: skill.canonicalDescription,
      strand: skill.strand,
      difficulty: item.difficulty,
      questionType: item.questionType,
      passage: item.passage ?? "",
      questionText: item.questionText,
      answerKey,
      stepByStepSolution: item.stepByStepSolution.map((s, i) => `${i + 1}) ${s}`).join("\n"),
      commonMisconceptions: item.commonMisconceptions.map((s) => `• ${s}`).join("\n"),
      hints: item.hints.map((s, i) => `Hint ${i + 1}: ${s}`).join("\n"),
      tags: item.tags.join(", "),
      reviewStatus: item.reviewStatus,
      reviewNotes: item.reviewNotes ?? "",
    });
  }

  // wrap text on the long free-text columns
  const wrapCols = ["skillDescription", "passage", "questionText", "stepByStepSolution", "commonMisconceptions", "hints", "reviewNotes"];
  for (const colName of wrapCols) {
    const idx = headers.indexOf(colName) + 1;
    sheet.getColumn(idx).alignment = { wrapText: true, vertical: "top" };
  }
  sheet.getColumn(headers.indexOf("reviewStatus") + 1).alignment = { vertical: "top", horizontal: "center" };

  // highlight the editable columns' header
  for (const colName of EDITABLE_COLS) {
    const idx = headers.indexOf(colName) + 1;
    sheet.getColumn(idx).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3D0" } };
      }
    });
  }

  // autofilter across the whole table
  const lastCol = colLetter(headers.length - 1);
  sheet.autoFilter = { from: "A1", to: `${lastCol}1` };

  // dropdown validation on reviewStatus column, data rows only
  const statusColIdx = headers.indexOf("reviewStatus") + 1;
  const statusColLetter = colLetter(statusColIdx - 1);
  for (let r = 2; r <= rows.length + 1; r++) {
    sheet.getCell(`${statusColLetter}${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${STATUS_OPTIONS.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid status",
      error: "Please choose pending, approved, or flagged from the dropdown.",
    };
  }

  // ---- Summary sheet ----
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  const subjectColLetter = colLetter(headers.indexOf("subject"));
  const statusColLetterRef = colLetter(headers.indexOf("reviewStatus"));
  const dataRange = (col: string) => `Items!${col}2:${col}${rows.length + 1}`;

  summary.getCell("A1").value = "Review progress";
  summary.getCell("A1").font = { bold: true, size: 14 };

  const summaryHeaderRow = 3;
  ["Subject", "Pending", "Approved", "Flagged"].forEach((h, i) => {
    const c = summary.getCell(summaryHeaderRow, i + 1);
    c.value = h;
    c.font = { bold: true };
  });

  const subjectsForSummary = ["maths", "english"];
  subjectsForSummary.forEach((subj, i) => {
    const r = summaryHeaderRow + 1 + i;
    summary.getCell(r, 1).value = subj;
    STATUS_OPTIONS.forEach((status, j) => {
      summary.getCell(r, 2 + j).value = {
        formula: `COUNTIFS(${dataRange(subjectColLetter)},"${subj}",${dataRange(statusColLetterRef)},"${status}")`,
      };
    });
  });

  const totalRow = summaryHeaderRow + 1 + subjectsForSummary.length;
  summary.getCell(totalRow, 1).value = "Total";
  summary.getCell(totalRow, 1).font = { bold: true };
  STATUS_OPTIONS.forEach((status, j) => {
    const colLtr = colLetter(1 + j);
    summary.getCell(totalRow, 2 + j).value = {
      formula: `SUM(${colLtr}${summaryHeaderRow + 1}:${colLtr}${totalRow - 1})`,
    };
    summary.getCell(totalRow, 2 + j).font = { bold: true };
  });

  summary.getCell(totalRow + 2, 1).value = `Grand total items: ${rows.length}`;
  summary.getCell(totalRow + 2, 1).font = { italic: true };

  await workbook.xlsx.writeFile(outPath);
  console.log(`\nWrote ${rows.length} items to ${outPath}`);
  console.log(`Open it, review the "Items" tab, and check "Summary" for a live progress tally.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
