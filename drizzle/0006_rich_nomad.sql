ALTER TABLE "ReviewEvent" ADD COLUMN "isBonus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Session" ADD COLUMN "bonusItemIds" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "Session" ADD COLUMN "bonusCompletedItemIds" text[] DEFAULT '{}' NOT NULL;