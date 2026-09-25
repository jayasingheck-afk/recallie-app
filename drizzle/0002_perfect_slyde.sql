ALTER TABLE "Item" ADD COLUMN "reviewStatus" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "Item" ADD COLUMN "reviewNotes" text;--> statement-breakpoint
ALTER TABLE "Item" ADD COLUMN "reviewedAt" timestamp;--> statement-breakpoint
CREATE INDEX "item_review_status_idx" ON "Item" USING btree ("reviewStatus");