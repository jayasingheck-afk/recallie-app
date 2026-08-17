/**
 * Seeds a demo parent + child user and a small sample item bank (Week 1
 * skills only) so the session builder and review API can be exercised
 * end-to-end during development.
 *
 * Run with: npm run db:seed:demo  (after npm run db:seed)
 */
import "dotenv/config";
import { db } from "../client";
import { users, parentChildLinks, items } from "../schema";
import sampleItems from "./sample-items.json";

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
    })
    .onConflictDoNothing({ target: users.id });

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

async function seedSampleItems() {
  for (const item of sampleItems.items) {
    await db
      .insert(items)
      .values({
        id: item.id,
        skillId: item.skillId,
        questionText: item.questionText,
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
          answerKey: item.answerKey,
          stepByStepSolution: item.stepByStepSolution,
          commonMisconceptions: item.commonMisconceptions,
          hints: item.hints,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${sampleItems.items.length} sample items across Week 1 skills.`);
}

async function main() {
  await seedDemoUsers();
  await seedSampleItems();
  console.log("Demo seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
