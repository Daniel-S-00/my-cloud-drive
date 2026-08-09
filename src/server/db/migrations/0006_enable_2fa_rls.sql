--> statement-breakpoint
ALTER TABLE "public"."user_2fa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."pending_2fa_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_2fa_select_own" ON "public"."user_2fa" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_2fa_insert_own" ON "public"."user_2fa" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_2fa_update_own" ON "public"."user_2fa" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_2fa_delete_own" ON "public"."user_2fa" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_2fa_select_own" ON "public"."pending_2fa_verifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_2fa_insert_own" ON "public"."pending_2fa_verifications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_2fa_update_own" ON "public"."pending_2fa_verifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_2fa_delete_own" ON "public"."pending_2fa_verifications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION "public"."sync_next_auth_user_to_public"() FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."sync_next_auth_user_to_public"() TO "postgres", "service_role";