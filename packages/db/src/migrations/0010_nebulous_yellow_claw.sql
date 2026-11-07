ALTER TABLE "sonata_listen_event" ADD COLUMN "client_event_id" text;--> statement-breakpoint
ALTER TABLE "sonata_listen_event" ADD COLUMN "seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sonata_listen_event" ADD COLUMN "started_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sonata_listen_event_client_unique" ON "sonata_listen_event" USING btree ("client_event_id");