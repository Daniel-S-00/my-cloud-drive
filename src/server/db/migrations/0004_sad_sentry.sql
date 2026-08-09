-- Add favorite_at (null = not favorited) to files and folders.
--
-- NOTE: drizzle-kit generated this file with the full schema diff from the
-- stale 0003 snapshot (2FA tables, soft-delete columns, etc.), but all of
-- that drift is already applied in the live database — only the two
-- favorite_at columns are genuinely new. Kept to just those two so the
-- migration is idempotent against production.
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "favorite_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "favorite_at" timestamp with time zone;
