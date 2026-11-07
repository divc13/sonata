CREATE TABLE "sonata_epoch" (
	"id" integer PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"closed_at" timestamp NOT NULL,
	"balance_before_usdc" text NOT NULL,
	"total_seconds" integer NOT NULL,
	"effective_rate_per_hour" text NOT NULL,
	"total_paid_usdc" text NOT NULL,
	"listen_root" text NOT NULL,
	"entries_count" integer NOT NULL,
	"mode" text NOT NULL,
	"tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "sonata_listen_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"token_id" text NOT NULL,
	"session_id" text NOT NULL,
	"position_ms" integer NOT NULL,
	"played_ms" integer NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_listen_hour" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"token_id" text NOT NULL,
	"day" date NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_listing" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"seller_account_id" text NOT NULL,
	"price_usdc" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"sold_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sonata_ownership" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"acquired_at" timestamp NOT NULL,
	"price_usdc" text,
	"tx_hash" text,
	"event_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_pass" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"token_id" text,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"price_usdc" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_payout" (
	"id" serial PRIMARY KEY NOT NULL,
	"epoch_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"seconds" integer NOT NULL,
	"amount_usdc" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_sale" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"seller_account_id" text NOT NULL,
	"buyer_account_id" text NOT NULL,
	"price_usdc" text NOT NULL,
	"royalty_usdc" text NOT NULL,
	"seller_proceeds_usdc" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_song" (
	"token_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist_name" text NOT NULL,
	"artist_handle" text NOT NULL,
	"artist_account_id" text NOT NULL,
	"creator_account_id" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"sub_account" text NOT NULL,
	"cover_url" text NOT NULL,
	"audio_url" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"genre" text NOT NULL,
	"release_year" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonata_withdrawal" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount_usdc" text NOT NULL,
	"tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sonata_epoch_closed_at_idx" ON "sonata_epoch" USING btree ("closed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sonata_listen_event_account_idx" ON "sonata_listen_event" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sonata_listen_event_token_idx" ON "sonata_listen_event" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_listen_event_session_idx" ON "sonata_listen_event" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sonata_listen_hour_unique" ON "sonata_listen_hour" USING btree ("account_id","token_id","day");--> statement-breakpoint
CREATE INDEX "sonata_listen_hour_account_idx" ON "sonata_listen_hour" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sonata_listing_token_idx" ON "sonata_listing" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_listing_seller_idx" ON "sonata_listing" USING btree ("seller_account_id");--> statement-breakpoint
CREATE INDEX "sonata_listing_active_idx" ON "sonata_listing" USING btree ("active");--> statement-breakpoint
CREATE INDEX "sonata_ownership_token_idx" ON "sonata_ownership" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_ownership_owner_idx" ON "sonata_ownership" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "sonata_pass_account_idx" ON "sonata_pass" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sonata_payout_epoch_idx" ON "sonata_payout" USING btree ("epoch_id");--> statement-breakpoint
CREATE INDEX "sonata_payout_token_idx" ON "sonata_payout" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_sale_token_idx" ON "sonata_sale" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_sale_buyer_idx" ON "sonata_sale" USING btree ("buyer_account_id");--> statement-breakpoint
CREATE INDEX "sonata_sale_seller_idx" ON "sonata_sale" USING btree ("seller_account_id");--> statement-breakpoint
CREATE INDEX "sonata_song_artist_account_idx" ON "sonata_song" USING btree ("artist_account_id");--> statement-breakpoint
CREATE INDEX "sonata_song_owner_account_idx" ON "sonata_song" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "sonata_withdrawal_token_idx" ON "sonata_withdrawal" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "sonata_withdrawal_account_idx" ON "sonata_withdrawal" USING btree ("account_id");