DROP INDEX "claims_pcn_freq";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "source_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_pcn_payer_freq" ON "claims" USING btree ("patient_control","payer_id","frequency") WHERE frequency <> '7';--> statement-breakpoint
CREATE UNIQUE INDEX "claims_pcn_payer_correction" ON "claims" USING btree ("patient_control","payer_id","source_ref") WHERE frequency = '7';