ALTER TABLE "anchor_batches"
ADD COLUMN "anchor_mode" text DEFAULT 'sandbox-mock' NOT NULL,
ADD COLUMN "tx_signature" text,
ADD COLUMN "explorer_url" text,
ADD COLUMN "wallet_public_key" text,
ADD COLUMN "confirmation_status" text,
ADD COLUMN "error_message" text;
