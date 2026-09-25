/**
 * Dev helper: creates (or re-backdates) a test child enrolled N weeks ago,
 * so you can preview session content for any term/week without waiting for
 * real time to pass. Links the child to the seeded demo parent
 * (demo_parent_1) so it shows up in /parent/children and /parent/dashboard
 * like any other child.
 *
 * Usage:
 *   npx tsx src/db/seed/create-test-child.ts <weeksAgo> [displayName]
 *
 * Examples (10-week terms):
 *   npx tsx src/db/seed/create-test-child.ts 0    # term 1, week 1 (brand new)
 *   npx tsx src/db/seed/create-test-child.ts 10   # term 2, week 1
 *   npx tsx src/db/seed/create-test-child.ts 20   # term 3, week 1
 *   npx tsx src/db/seed/create-test-child.ts 30   # term 4, week 1
 *   npx tsx src/db/seed/create-test-child.ts 39   # term 4, week 10 (last week of Year 3)
 *   npx tsx src/db/seed/create-test-child.ts 200  # clamps to term 4, week 10
 *
 * When it finishes, it prints the child id, the term/week that maps to, and
 * the URLs to open in your browser. Delete the child afterwards with:
 *   npx tsx src/db/seed/delete-test-child.ts <childId>
 */
import "dotenv/config";
import { db } from "../client";
import { users, parentChildLinks } from "../schema";
import { computeCurrentTermWeek } from "../../lib/curriculumWeek";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEMO_PARENT_ID = "demo_parent_1";

async function main() {
  const weeksAgoArg = process.argv[2];
  const displayNameArg = process.argv[3];

  if (weeksAgoArg === undefined || Number.isNaN(Number(weeksAgoArg))) {
    console.error("Usage: npx tsx src/db/seed/create-test-child.ts <weeksAgo> [displayName]");
    process.exit(1);
  }

  const weeksAgo = Number(weeksAgoArg);
  const enrolledAt = new Date(Date.now() - weeksAgo * WEEK_MS);
  const id = `test_child_${weeksAgo}w_${Date.now()}`;
  const displayName = displayNameArg || `TestChild_${weeksAgo}w`;

  await db.insert(users).values({
    id,
    clerkUserId: `test_clerk_${id}`,
    email: "parent@example.com",
    role: "child",
    state: "NSW",
    yearLevel: 3,
    displayName,
    enrolledAt,
  });

  await db
    .insert(parentChildLinks)
    .values({ parentId: DEMO_PARENT_ID, childId: id, relationship: "parent" })
    .onConflictDoNothing({ target: [parentChildLinks.parentId, parentChildLinks.childId] });

  const { term, week } = computeCurrentTermWeek(enrolledAt);

  console.log(`\nCreated test child "${displayName}" (id: ${id})`);
  console.log(`Enrolled ${weeksAgo} weeks ago -> Term ${term}, Week ${week}`);
  console.log(`\nOpen in your browser (make sure "npm run dev" is running):`);
  console.log(`  http://localhost:4100/child?childId=${id}`);
  console.log(`  http://localhost:4100/parent/dashboard?childId=${id}`);
  console.log(`\nWhen you're done testing, delete it with:`);
  console.log(`  npx tsx src/db/seed/delete-test-child.ts ${id}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create test child:", err);
  process.exit(1);
});
