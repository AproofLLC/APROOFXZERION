ALTER TABLE "anchor_batches"
  ADD COLUMN IF NOT EXISTS "chain_family" text NOT NULL DEFAULT 'solana',
  ADD COLUMN IF NOT EXISTS "cluster" text NOT NULL DEFAULT 'sandbox-devnet',
  ADD COLUMN IF NOT EXISTS "simulated_signature" text,
  ADD COLUMN IF NOT EXISTS "simulated_slot" text,
  ADD COLUMN IF NOT EXISTS "simulated_commitment" text NOT NULL DEFAULT 'simulated_finalized',
  ADD COLUMN IF NOT EXISTS "external_attested" boolean NOT NULL DEFAULT false;
