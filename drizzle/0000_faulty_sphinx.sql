CREATE TABLE "ChildSkillState" (
	"id" text PRIMARY KEY NOT NULL,
	"childId" text NOT NULL,
	"skillId" text NOT NULL,
	"stabilityDays" real DEFAULT 1 NOT NULL,
	"difficulty" real DEFAULT 0.5 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"reviewCount" integer DEFAULT 0 NOT NULL,
	"lastReviewedAt" timestamp,
	"nextReviewAt" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'on_track' NOT NULL,
	"recentAccuracy3" real,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CurriculumSequenceEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"yearLevel" integer NOT NULL,
	"term" integer NOT NULL,
	"week" integer NOT NULL,
	"state" text NOT NULL,
	"skillIds" text[] DEFAULT '{}' NOT NULL,
	"focusNotes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Item" (
	"id" text PRIMARY KEY NOT NULL,
	"skillId" text NOT NULL,
	"questionText" text NOT NULL,
	"passage" text,
	"questionType" text NOT NULL,
	"answerKey" jsonb NOT NULL,
	"stepByStepSolution" text[] DEFAULT '{}' NOT NULL,
	"commonMisconceptions" text[] DEFAULT '{}' NOT NULL,
	"hints" text[] DEFAULT '{}' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"curriculumCodes" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ParentChildLink" (
	"id" text PRIMARY KEY NOT NULL,
	"parentId" text NOT NULL,
	"childId" text NOT NULL,
	"relationship" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ReviewEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"childId" text NOT NULL,
	"skillId" text NOT NULL,
	"itemId" text NOT NULL,
	"correct" boolean NOT NULL,
	"attempts" integer NOT NULL,
	"hintUsed" boolean NOT NULL,
	"responseTimeSec" real NOT NULL,
	"isReview" boolean,
	"isMixed" boolean,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"childId" text NOT NULL,
	"date" timestamp NOT NULL,
	"subject" text NOT NULL,
	"plannedItemIds" text[] DEFAULT '{}' NOT NULL,
	"completedItemIds" text[] DEFAULT '{}' NOT NULL,
	"timeSpentSec" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Skill" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"yearLevel" integer NOT NULL,
	"strand" text NOT NULL,
	"canonicalDescription" text NOT NULL,
	"acCodes" text[] DEFAULT '{}' NOT NULL,
	"vicMapping" jsonb,
	"nswMapping" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"parentId" text NOT NULL,
	"stripeSubscriptionId" text NOT NULL,
	"status" text NOT NULL,
	"planType" text NOT NULL,
	"currentPeriodEnd" timestamp NOT NULL,
	"trialEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Subscription_parentId_unique" UNIQUE("parentId"),
	CONSTRAINT "Subscription_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"clerkUserId" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"state" text,
	"yearLevel" integer,
	"displayName" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_clerkUserId_unique" UNIQUE("clerkUserId")
);
--> statement-breakpoint
ALTER TABLE "ChildSkillState" ADD CONSTRAINT "ChildSkillState_childId_User_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ChildSkillState" ADD CONSTRAINT "ChildSkillState_skillId_Skill_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."Skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Item" ADD CONSTRAINT "Item_skillId_Skill_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."Skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ParentChildLink" ADD CONSTRAINT "ParentChildLink_parentId_User_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ParentChildLink" ADD CONSTRAINT "ParentChildLink_childId_User_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_childId_User_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_skillId_Skill_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."Skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_childId_User_id_fk" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_parentId_User_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_skill_unique" ON "ChildSkillState" USING btree ("childId","skillId");--> statement-breakpoint
CREATE INDEX "child_skill_next_review_idx" ON "ChildSkillState" USING btree ("childId","nextReviewAt");--> statement-breakpoint
CREATE INDEX "child_skill_status_idx" ON "ChildSkillState" USING btree ("childId","status");--> statement-breakpoint
CREATE INDEX "seq_subject_year_term_week_state_idx" ON "CurriculumSequenceEntry" USING btree ("subject","yearLevel","term","week","state");--> statement-breakpoint
CREATE INDEX "item_skill_difficulty_idx" ON "Item" USING btree ("skillId","difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_child_unique" ON "ParentChildLink" USING btree ("parentId","childId");--> statement-breakpoint
CREATE INDEX "parent_idx" ON "ParentChildLink" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "child_idx" ON "ParentChildLink" USING btree ("childId");--> statement-breakpoint
CREATE INDEX "review_child_timestamp_idx" ON "ReviewEvent" USING btree ("childId","timestamp");--> statement-breakpoint
CREATE INDEX "review_child_skill_timestamp_idx" ON "ReviewEvent" USING btree ("childId","skillId","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "session_child_date_subject_unique" ON "Session" USING btree ("childId","date","subject");--> statement-breakpoint
CREATE INDEX "session_child_date_idx" ON "Session" USING btree ("childId","date");--> statement-breakpoint
CREATE INDEX "skill_subject_year_strand_idx" ON "Skill" USING btree ("subject","yearLevel","strand");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "Subscription" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_clerk_idx" ON "User" USING btree ("clerkUserId");