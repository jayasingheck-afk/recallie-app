ALTER TABLE "User" ADD COLUMN "assignedFocusSkillId" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "assignedFocusSetAt" timestamp;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_assignedFocusSkillId_Skill_id_fk" FOREIGN KEY ("assignedFocusSkillId") REFERENCES "public"."Skill"("id") ON DELETE set null ON UPDATE no action;