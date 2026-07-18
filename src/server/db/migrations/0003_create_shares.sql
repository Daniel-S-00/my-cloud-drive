CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shares_token_uq" ON "shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "shares_file_id_idx" ON "shares" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "shares_created_by_idx" ON "shares" USING btree ("created_by");