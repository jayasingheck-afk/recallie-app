/**
 * Dev helper: removes a test child created by create-test-child.ts (and its
 * sessions / skill states / parent-child link), so testing doesn't leave
 * clutter behind in the database.
 *
 * Usage:
 *   npx tsx src/db/seed/delete-test-child.ts <childId>
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { users, parentChildLinks, childSkillStates, sessions, reviewEvents } from "../schema";

async function main() {
  const childId = process.argv[2];
  if (!childId) {
    console.error("Usage: npx tsx src/db/seed/delete-test-child.ts <childId>");
    process.exit(1);
  }
  if (childId === "demo_child_1") {
    console.error("Refusing to delete the seeded demo child (demo_child_1).");
    process.exit(1);
  }

  await db.delete(reviewEvents).where(eq(reviewEvents.childId, childId));
  await db.delete(sessions).where(eq(sessions.childId, childId));
  await db.delete(childSkillStates).where(eq(childSkillStates.childId, childId));
  await db.delete(parentChildLinks).where(eq(parentChildLinks.childId, childId));
  const deleted = await db.delete(users).where(eq(users.id, childId)).returning();

  if (deleted.length === 0) {
    console.log(`No user found with id ${childId} (already deleted?).`);
  } else {
    console.log(`Deleted test child ${childId} and its sessions/skill states.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to delete test child:", err);
  process.exit(1);
});
