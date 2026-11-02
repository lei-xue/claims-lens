ALTER TABLE "claim_lines" ALTER COLUMN "units" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "claim_lines" ALTER COLUMN "units" SET DEFAULT 1;