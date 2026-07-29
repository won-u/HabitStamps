CREATE TABLE IF NOT EXISTS "check_ins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"note" text,
	"photo_uri" text,
	"value" double precision,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "habits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"category_id" uuid,
	"frequency_type" text NOT NULL,
	"frequency_config" jsonb NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_ins_habit_date_idx" ON "check_ins" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_ins_updated_at_idx" ON "check_ins" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_updated_at_idx" ON "habits" USING btree ("updated_at");