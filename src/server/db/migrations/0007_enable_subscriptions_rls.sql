--> statement-breakpoint
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscriptions_select_own" ON "public"."subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subscriptions_insert_own" ON "public"."subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subscriptions_update_own" ON "public"."subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subscriptions_delete_own" ON "public"."subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_id" = (select auth.uid()));