CREATE TYPE "public"."denial_status" AS ENUM('new', 'in_progress', 'resubmitted', 'appealed', 'resolved', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('biller', 'manager');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"denial_id" integer,
	"claim_id" integer,
	"user_id" integer,
	"kind" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_payment_id" integer NOT NULL,
	"line_payment_id" integer,
	"group_code" text NOT NULL,
	"reason" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"denial_id" integer NOT NULL,
	"letter" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_id" integer NOT NULL,
	"line_no" integer NOT NULL,
	"procedure" text NOT NULL,
	"modifiers" text[] DEFAULT '{}' NOT NULL,
	"charge" numeric(12, 2) NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"dx_pointers" integer[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"remittance_id" integer NOT NULL,
	"claim_id" integer,
	"patient_control" text NOT NULL,
	"status_code" text NOT NULL,
	"charge" numeric(12, 2) NOT NULL,
	"paid" numeric(12, 2) NOT NULL,
	"patient_resp" numeric(12, 2) NOT NULL,
	"payer_claim_id" text NOT NULL,
	"remarks" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_control" text NOT NULL,
	"payer_id" integer,
	"patient_name" text NOT NULL,
	"member_id" text NOT NULL,
	"service_date" date NOT NULL,
	"pos" text DEFAULT '11' NOT NULL,
	"diagnoses" text[] DEFAULT '{}' NOT NULL,
	"total_charge" numeric(12, 2) NOT NULL,
	"frequency" text DEFAULT '1' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denials" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_id" integer,
	"claim_payment_id" integer NOT NULL,
	"payer_id" integer,
	"primary_code" text NOT NULL,
	"codes" text[] DEFAULT '{}' NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"recovered" numeric(12, 2) DEFAULT 0 NOT NULL,
	"status" "denial_status" DEFAULT 'new' NOT NULL,
	"owner_id" integer,
	"full_denial" boolean NOT NULL,
	"denied_on" date NOT NULL,
	"appeal_by" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "denials_claim_payment_id_unique" UNIQUE("claim_payment_id")
);
--> statement-breakpoint
CREATE TABLE "line_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_payment_id" integer NOT NULL,
	"claim_line_id" integer,
	"procedure" text NOT NULL,
	"modifiers" text[] DEFAULT '{}' NOT NULL,
	"charge" numeric(12, 2) NOT NULL,
	"allowed" numeric(12, 2),
	"paid" numeric(12, 2) NOT NULL,
	"remarks" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "payers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" serial PRIMARY KEY NOT NULL,
	"payer_id" integer,
	"trace" text NOT NULL,
	"payment_amount" numeric(12, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"method" text NOT NULL,
	"file_name" text,
	"raw" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_by" integer,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'biller' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_denial_id_denials_id_fk" FOREIGN KEY ("denial_id") REFERENCES "public"."denials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_claim_payment_id_claim_payments_id_fk" FOREIGN KEY ("claim_payment_id") REFERENCES "public"."claim_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_line_payment_id_line_payments_id_fk" FOREIGN KEY ("line_payment_id") REFERENCES "public"."line_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_denial_id_denials_id_fk" FOREIGN KEY ("denial_id") REFERENCES "public"."denials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_payments" ADD CONSTRAINT "claim_payments_remittance_id_remittances_id_fk" FOREIGN KEY ("remittance_id") REFERENCES "public"."remittances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_payments" ADD CONSTRAINT "claim_payments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denials" ADD CONSTRAINT "denials_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denials" ADD CONSTRAINT "denials_claim_payment_id_claim_payments_id_fk" FOREIGN KEY ("claim_payment_id") REFERENCES "public"."claim_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denials" ADD CONSTRAINT "denials_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denials" ADD CONSTRAINT "denials_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_payments" ADD CONSTRAINT "line_payments_claim_payment_id_claim_payments_id_fk" FOREIGN KEY ("claim_payment_id") REFERENCES "public"."claim_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_payments" ADD CONSTRAINT "line_payments_claim_line_id_claim_lines_id_fk" FOREIGN KEY ("claim_line_id") REFERENCES "public"."claim_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_denial" ON "activities" USING btree ("denial_id");--> statement-breakpoint
CREATE INDEX "claim_payments_claim" ON "claim_payments" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_pcn_freq" ON "claims" USING btree ("patient_control","frequency");--> statement-breakpoint
CREATE INDEX "denials_status" ON "denials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "denials_owner" ON "denials" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remittances_trace" ON "remittances" USING btree ("payer_id","trace");