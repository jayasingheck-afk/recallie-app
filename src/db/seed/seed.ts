/**
 * Seeds Year 3 Term 1 Maths & English curriculum (skills + weekly sequence)
 * into the database. Source data: src/db/seed/year3-curriculum.json, derived
 * from the project's curriculum design docs (10-week VIC/NSW sequences).
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../client";
import { skills, curriculumSequenceEntries } from "../schema";
import curriculum from "./year3-curriculum.json";

type SkillDef = {
  id: string;
  subject: string;
  year_level: number;
  strand: string;
  description: string;
  ac_codes: string[];
  state_mappings: {
    VIC: { level: number; phrasing: string; local_codes: string[] };
    NSW: { stage: string; subarea: string; outcomes: string[] };
  };
  metadata: { difficulty_band: string; typical_weeks_to_mastery: number };
};

async function seedSubject(subjectKey: "maths" | "english") {
  const subjectData = (curriculum.subjects as any)[subjectKey] as {
    skills: SkillDef[];
    sequence: Record<string, Record<string, string[]>>;
  };

  console.log(`Seeding ${subjectData.skills.length} ${subjectKey} skills...`);

  for (const s of subjectData.skills) {
    await db
      .insert(skills)
      .values({
        id: s.id,
        subject: s.subject,
        yearLevel: s.year_level,
        strand: s.strand,
        canonicalDescription: s.description,
        acCodes: s.ac_codes,
        vicMapping: s.state_mappings.VIC,
        nswMapping: s.state_mappings.NSW,
        metadata: s.metadata,
      })
      .onConflictDoUpdate({
        target: skills.id,
        set: {
          canonicalDescription: s.description,
          acCodes: s.ac_codes,
          vicMapping: s.state_mappings.VIC,
          nswMapping: s.state_mappings.NSW,
          metadata: s.metadata,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeding ${subjectKey} weekly sequence (term 1)...`);
  // Idempotent: clear existing sequence entries for this subject/year before re-inserting.
  await db
    .delete(curriculumSequenceEntries)
    .where(and(eq(curriculumSequenceEntries.subject, subjectKey), eq(curriculumSequenceEntries.yearLevel, 3)));

  for (const [term, weeks] of Object.entries(subjectData.sequence)) {
    for (const [week, skillIds] of Object.entries(weeks)) {
      await db.insert(curriculumSequenceEntries).values({
        subject: subjectKey,
        yearLevel: 3,
        term: Number(term),
        week: Number(week),
        state: "COMMON", // same skills apply to both VIC and NSW; phrasing differs via Skill.vicMapping/nswMapping
        skillIds,
        focusNotes: `Week ${week} focus`,
      });
    }
  }
}

async function main() {
  await seedSubject("maths");
  await seedSubject("english");
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
