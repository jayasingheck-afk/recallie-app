import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// -------------------------
// Users & relationships
// -------------------------

export const users = pgTable(
  "User",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    clerkUserId: text("clerkUserId").notNull().unique(),
    email: text("email").notNull(),
    role: text("role").notNull(), // "parent" | "child"
    state: text("state"), // "VIC" | "NSW" (null for parents)
    yearLevel: integer("yearLevel"), // 1-6 (null for parents)
    displayName: text("displayName"),
    enrolledAt: timestamp("enrolledAt"), // children only: when they started, used to derive curriculum term/week
    // Parent-assigned "focus topic" (children only) — see src/lib/sessionBuilder.ts
    // and src/app/api/focus-topic/route.ts. Nullable: most children have no
    // assignment, in which case the daily session is built exactly as before.
    // Persists until the parent changes or clears it — no auto-expiry.
    assignedFocusSkillId: text("assignedFocusSkillId").references(() => skills.id, { onDelete: "set null" }),
    assignedFocusSetAt: timestamp("assignedFocusSetAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [index("user_clerk_idx").on(table.clerkUserId)]
);

export const parentChildLinks = pgTable(
  "ParentChildLink",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    parentId: text("parentId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    childId: text("childId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(), // "parent" | "guardian"
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("parent_child_unique").on(table.parentId, table.childId),
    index("parent_idx").on(table.parentId),
    index("child_idx").on(table.childId),
  ]
);

// -------------------------
// Curriculum & skills
// -------------------------

export const skills = pgTable(
  "Skill",
  {
    id: text("id").primaryKey(), // human-readable skill id, e.g. "M3N01_represent_numbers_10k"
    subject: text("subject").notNull(), // "maths" | "english"
    yearLevel: integer("yearLevel").notNull(),
    strand: text("strand").notNull(),
    canonicalDescription: text("canonicalDescription").notNull(),
    acCodes: text("acCodes").array().notNull().default([]),
    vicMapping: jsonb("vicMapping"), // { level, phrasing, local_codes }
    nswMapping: jsonb("nswMapping"), // { stage, subarea, outcomes }
    metadata: jsonb("metadata"), // { difficulty_band, typical_weeks_to_mastery }
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [index("skill_subject_year_strand_idx").on(table.subject, table.yearLevel, table.strand)]
);

export const curriculumSequenceEntries = pgTable(
  "CurriculumSequenceEntry",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    subject: text("subject").notNull(), // "maths" | "english"
    yearLevel: integer("yearLevel").notNull(),
    term: integer("term").notNull(), // 1-4
    week: integer("week").notNull(), // 1-10
    state: text("state").notNull(), // "VIC" | "NSW" | "COMMON"
    skillIds: text("skillIds").array().notNull().default([]),
    focusNotes: text("focusNotes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    index("seq_subject_year_term_week_state_idx").on(
      table.subject,
      table.yearLevel,
      table.term,
      table.week,
      table.state
    ),
  ]
);

// -------------------------
// Spaced repetition state
// -------------------------

export const childSkillStates = pgTable(
  "ChildSkillState",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    childId: text("childId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    stabilityDays: real("stabilityDays").notNull().default(1.0),
    difficulty: real("difficulty").notNull().default(0.5),
    lapses: integer("lapses").notNull().default(0),
    reviewCount: integer("reviewCount").notNull().default(0),
    lastReviewedAt: timestamp("lastReviewedAt"),
    nextReviewAt: timestamp("nextReviewAt").notNull().defaultNow(),
    status: text("status").notNull().default("on_track"), // "on_track" | "needs_attention" | "mastered"
    recentAccuracy3: real("recentAccuracy3"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("child_skill_unique").on(table.childId, table.skillId),
    index("child_skill_next_review_idx").on(table.childId, table.nextReviewAt),
    index("child_skill_status_idx").on(table.childId, table.status),
  ]
);

export const reviewEvents = pgTable(
  "ReviewEvent",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    childId: text("childId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    itemId: text("itemId").notNull(),
    correct: boolean("correct").notNull(),
    attempts: integer("attempts").notNull(),
    hintUsed: boolean("hintUsed").notNull(),
    responseTimeSec: real("responseTimeSec").notNull(),
    isReview: boolean("isReview"),
    isMixed: boolean("isMixed"),
    // true for "open_response" items (free-text/subjective multi_part sub-answers) where
    // `correct` came from the child's own honest self-assessment against the revealed
    // model answer, not an exact-match grader — see src/lib/grading.ts and
    // src/app/api/reviews/route.ts.
    selfAssessed: boolean("selfAssessed").notNull().default(false),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("review_child_timestamp_idx").on(table.childId, table.timestamp),
    index("review_child_skill_timestamp_idx").on(table.childId, table.skillId, table.timestamp),
  ]
);

// -------------------------
// Item bank (questions)
// -------------------------

export const items = pgTable(
  "Item",
  {
    id: text("id").primaryKey(), // human-readable item_id, e.g. "AC9M3N04_Y3_AddSubReg_001"
    skillId: text("skillId")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    questionText: text("questionText").notNull(),
    passage: text("passage"), // for English reading items
    questionType: text("questionType").notNull(), // "multiple_choice" | "short_answer" | "drag_drop" | "matching" | "multi_part"
    answerKey: jsonb("answerKey").notNull(),
    stepByStepSolution: text("stepByStepSolution").array().notNull().default([]),
    commonMisconceptions: text("commonMisconceptions").array().notNull().default([]),
    hints: text("hints").array().notNull().default([]),
    difficulty: text("difficulty").notNull().default("medium"), // "easy" | "medium" | "hard"
    tags: text("tags").array().notNull().default([]),
    curriculumCodes: jsonb("curriculumCodes"), // { AC: [...], VIC: [...], NSW: [...] }
    metadata: jsonb("metadata"),
    // Human content-review tracking (see src/db/seed/export-items-for-review.ts /
    // import-review.ts). "pending" is the default for every AI-generated item —
    // deliberately still shown in live sessions (see sessionBuilder.ts's query),
    // since most content is fine and a blanket hide-until-approved default would
    // empty every session on day one. Only "flagged" items are excluded, as soon
    // as a completed review spreadsheet is imported.
    reviewStatus: text("reviewStatus").notNull().default("pending"), // "pending" | "approved" | "flagged"
    reviewNotes: text("reviewNotes"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    index("item_skill_difficulty_idx").on(table.skillId, table.difficulty),
    index("item_review_status_idx").on(table.reviewStatus),
  ]
);

// -------------------------
// Sessions (daily practice)
// -------------------------

export const sessions = pgTable(
  "Session",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    childId: text("childId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(), // normalized to start of day
    subject: text("subject").notNull(), // "maths" | "english"
    plannedItemIds: text("plannedItemIds").array().notNull().default([]),
    completedItemIds: text("completedItemIds").array().notNull().default([]),
    timeSpentSec: integer("timeSpentSec").notNull().default(0),
    status: text("status").notNull().default("in_progress"), // "in_progress" | "completed"
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("session_child_date_subject_unique").on(table.childId, table.date, table.subject),
    index("session_child_date_idx").on(table.childId, table.date),
  ]
);

// -------------------------
// Subscriptions & billing
// -------------------------

export const subscriptions = pgTable(
  "Subscription",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    parentId: text("parentId")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripeSubscriptionId").notNull().unique(),
    status: text("status").notNull(), // "active" | "trialing" | "canceled" | "past_due"
    planType: text("planType").notNull(), // "individual" | "family"
    currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
    trialEnd: timestamp("trialEnd"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [index("subscription_status_idx").on(table.status)]
);

// -------------------------
// Relations
// -------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  parentLinks: many(parentChildLinks, { relationName: "parentLinks" }),
  childLinks: many(parentChildLinks, { relationName: "childLinks" }),
  skillStates: many(childSkillStates),
  reviewEvents: many(reviewEvents),
  sessions: many(sessions),
  subscription: one(subscriptions),
}));

export const parentChildLinksRelations = relations(parentChildLinks, ({ one }) => ({
  parent: one(users, {
    fields: [parentChildLinks.parentId],
    references: [users.id],
    relationName: "parentLinks",
  }),
  child: one(users, {
    fields: [parentChildLinks.childId],
    references: [users.id],
    relationName: "childLinks",
  }),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  childSkillStates: many(childSkillStates),
  items: many(items),
}));

export const childSkillStatesRelations = relations(childSkillStates, ({ one }) => ({
  child: one(users, { fields: [childSkillStates.childId], references: [users.id] }),
  skill: one(skills, { fields: [childSkillStates.skillId], references: [skills.id] }),
}));

export const reviewEventsRelations = relations(reviewEvents, ({ one }) => ({
  child: one(users, { fields: [reviewEvents.childId], references: [users.id] }),
  skill: one(skills, { fields: [reviewEvents.skillId], references: [skills.id] }),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  skill: one(skills, { fields: [items.skillId], references: [skills.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  child: one(users, { fields: [sessions.childId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  parent: one(users, { fields: [subscriptions.parentId], references: [users.id] }),
}));
