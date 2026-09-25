/**
 * Imports review decisions from a completed review workbook (produced by
 * export-items-for-review.ts) back into the database: updates each item's
 * reviewStatus and reviewNotes by matching on itemId.
 *
 * Only reviewStatus/reviewNotes are read from the sheet — every other
 * column is informational only and ignored here, so accidentally editing a
 * questionText cell in the spreadsheet has no effect on the real data.
 *
 * Usage:
 *   npm run review:import -- <path-to-completed-workbook.xlsx>
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { items } from "../schema";

const VALID_STATUSES = new Set(["pending", "approved", "flagged"]);

async function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error("Usage: npx tsx src/db/seed/import-review.ts <path-to-completed-workbook.xlsx>");
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inPath);
  const sheet = workbook.getWorksheet("Items");
  if (!sheet) {
    console.error(`No "Items" sheet found in ${inPath}. Did you export it with export-items-for-review.ts?`);
    process.exit(1);
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((v) => (typeof v === "string" ? v : ""));
  const idxOf = (name: string) => headers.indexOf(name);
  const itemIdCol = idxOf("itemId");
  const statusCol = idxOf("reviewStatus");
  const notesCol = idxOf("reviewNotes");

  if (itemIdCol === -1 || statusCol === -1 || notesCol === -1) {
    console.error('Could not find "itemId", "reviewStatus", and "reviewNotes" columns in the sheet header.');
    process.exit(1);
  }

  const dbItemIds = new Set((await db.select({ id: items.id }).from(items)).map((r) => r.id));

  const seenIds = new Set<string>();
  const updates: { id: string; status: string; notes: string | null }[] = [];
  const warnings: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const itemId = row.getCell(itemIdCol).text?.trim();
    if (!itemId) return;
    seenIds.add(itemId);

    let status = row.getCell(statusCol).text?.trim().toLowerCase() || "pending";
    if (!VALID_STATUSES.has(status)) {
      warnings.push(`Row ${rowNumber} (${itemId}): invalid status "${status}", treating as "pending".`);
      status = "pending";
    }
    const notesRaw = row.getCell(notesCol).text?.trim();
    const notes = notesRaw ? notesRaw : null;

    if (!dbItemIds.has(itemId)) {
      warnings.push(`Row ${rowNumber}: itemId "${itemId}" was not found in the database — skipped.`);
      return;
    }

    updates.push({ id: itemId, status, notes });
  });

  const missingFromSheet = [...dbItemIds].filter((id) => !seenIds.has(id));
  if (missingFromSheet.length > 0) {
    warnings.push(
      `${missingFromSheet.length} item(s) in the database were not present in the spreadsheet (rows may have been deleted) — their review status was left unchanged.`
    );
  }

  console.log(`Applying ${updates.length} review decisions...`);
  const now = new Date();
  let changed = 0;
  for (const u of updates) {
    const result = await db
      .update(items)
      .set({
        reviewStatus: u.status,
        reviewNotes: u.notes,
        reviewedAt: u.status !== "pending" || u.notes ? now : null,
        updatedAt: now,
      })
      .where(eq(items.id, u.id))
      .returning({ id: items.id });
    if (result.length) changed++;
  }

  const counts = await db
    .select({ status: items.reviewStatus })
    .from(items)
    .where(inArray(items.id, updates.map((u) => u.id)));
  const tally: Record<string, number> = {};
  for (const c of counts) tally[c.status] = (tally[c.status] ?? 0) + 1;

  console.log(`\nUpdated ${changed} items.`);
  console.log("Status breakdown of imported rows:", tally);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 30)) console.log(`  - ${w}`);
    if (warnings.length > 30) console.log(`  ...and ${warnings.length - 30} more.`);
  } else {
    console.log("\nNo warnings.");
  }

  const flaggedNow = await db.select({ id: items.id }).from(items).where(eq(items.reviewStatus, "flagged"));
  console.log(`\n${flaggedNow.length} item(s) are now flagged and will stop appearing in live sessions.`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
