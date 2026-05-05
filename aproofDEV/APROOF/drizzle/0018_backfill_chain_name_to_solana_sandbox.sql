UPDATE "anchor_batches" SET
  "chain_name" = 'solana-sandbox',
  "chain_family" = 'solana',
  "cluster" = 'sandbox-devnet',
  "simulated_commitment" = 'simulated_finalized',
  "external_attested" = false
WHERE "chain_name" IN ('sandbox-anchor', 'avalanche');
