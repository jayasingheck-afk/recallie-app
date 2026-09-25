/**
 * Seeds a demo parent + child user and a small sample item bank (Weeks 1-6
 * skills) so the session builder and review API can be exercised
 * end-to-end during development.
 *
 * Run with: npm run db:seed:demo  (after npm run db:seed)
 */
import "dotenv/config";
import { isNull, and, eq } from "drizzle-orm";
import { db } from "../client";
import { users, parentChildLinks, items } from "../schema";
import sampleItems from "./sample-items.json";
import week1ItemBank from "./week1-item-bank.json";
import week2ItemBank from "./week2-item-bank.json";
import week3ItemBank from "./week3-item-bank.json";
import week4ItemBank from "./week4-item-bank.json";
import week5ItemBank from "./week5-item-bank.json";
import week6ItemBank from "./week6-item-bank.json";

const DEMO_PARENT_ID = "demo_parent_1";
const DEMO_CHILD_ID = "demo_child_1";

async function seedDemoUsers() {
  await db
    .insert(users)
    .values({
      id: DEMO_PARENT_ID,
      clerkUserId: "demo_clerk_parent_1",
      email: "parent@example.com",
      role: "parent",
    })
    .onConflictDoNothing({ target: users.id });

  await db
    .insert(users)
    .values({
      id: DEMO_CHILD_ID,
      clerkUserId: "demo_clerk_child_1",
      email: "parent@example.com", // children don't have their own login email in MVP
      role: "child",
      state: "NSW",
      yearLevel: 3,
      displayName: "Alex",
      enrolledAt: new Date(),
    })
    .onConflictDoNothing({ target: users.id });

  // Backfill enrolledAt for any pre-existing child rows from before this column
  // existed, so curriculum-week derivation (computeCurrentTermWeek) has a value
  // to work with. Only touches rows where it's still null — safe to re-run.
  await db
    .update(users)
    .set({ enrolledAt: new Date() })
    .where(and(eq(users.role, "child"), isNull(users.enrolledAt)));

  await db
    .insert(parentChildLinks)
    .values({
      parentId: DEMO_PARENT_ID,
      childId: DEMO_CHILD_ID,
      relationship: "parent",
    })
    .onConflictDoNothing({ target: [parentChildLinks.parentId, parentChildLinks.childId] });

  console.log(`Seeded demo parent (${DEMO_PARENT_ID}) and child (${DEMO_CHILD_ID}, NSW, Year 3).`);
}

type SeedItem = {
  id: string;
  skillId: string;
  questionText: string;
  passage?: string;
  questionType: string;
  answerKey: unknown;
  stepByStepSolution: string[];
  commonMisconceptions: string[];
  hints: string[];
  difficulty: string;
  tags: string[];
};

async function seedItemBank(bankName: string, bankItems: SeedItem[]) {
  for (const item of bankItems) {
    await db
      .insert(items)
      .values({
        id: item.id,
        skillId: item.skillId,
        questionText: item.questionText,
        passage: item.passage ?? null,
        questionType: item.questionType,
        answerKey: item.answerKey,
        stepByStepSolution: item.stepByStepSolution,
        commonMisconceptions: item.commonMisconceptions,
        hints: item.hints,
        difficulty: item.difficulty,
        tags: item.tags,
      })
      .onConflictDoUpdate({
        target: items.id,
        set: {
          questionText: item.questionText,
          passage: item.passage ?? null,
          questionType: item.questionType,
          answerKey: item.answerKey,
          stepByStepSolution: item.stepByStepSolution,
          commonMisconceptions: item.commonMisconceptions,
          hints: item.hints,
          difficulty: item.difficulty,
          tags: item.tags,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${bankItems.length} items from ${bankName}.`);
}

async function main() {
  await seedDemoUsers();
  await seedItemBank("sample-items.json", sampleItems.items as SeedItem[]);
  await seedItemBank("week1-item-bank.json", week1ItemBank.items as SeedItem[]);
  await seedItemBank("week2-item-bank.json", week2ItemBank.items as SeedItem[]);
  await seedItemBank("week3-item-bank.json", week3ItemBank.items as SeedItem[]);
  await seedItemBank("week4-item-bank.json", week4ItemBank.items as SeedItem[]);
  await seedItemBank("week5-item-bank.json", week5ItemBank.items as SeedItem[]);
  await seedItemBank("week6-item-bank.json", week6ItemBank.items as SeedItem[]);
  console.log("Demo seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
