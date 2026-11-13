CREATE TABLE "sonata_faucet_grant" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"amount_usdc" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sonata_faucet_grant_account_unique" ON "sonata_faucet_grant" USING btree ("account_id");