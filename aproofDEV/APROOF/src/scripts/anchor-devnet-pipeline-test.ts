import "dotenv/config";
import { desc } from "drizzle-orm";
import { Connection } from "@solana/web3.js";
import { openPgliteMemory } from "../db/pglite.js";
import { signUp } from "../http/auth-session.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "../http/subject-service.js";
import { processEvent } from "../pipeline/process-event.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";
import { anchorBatches } from "../db/schema/index.js";
import { normalizeAnchorMetadata } from "../http/anchor-metadata-normalizer.js";
import {
  getWalletBalanceLamports,
  loadOrCreateAnchorKeypair,
  resolveAnchorMode,
  resolveSolanaDevnetConfig,
} from "../anchor/solana-devnet-anchor.js";

async function main() {
  if (resolveAnchorMode(process.env) !== "solana-devnet") {
    throw new Error("ANCHOR_MODE_INVALID: anchor:devnet:pipeline-test requires ANCHOR_MODE=solana-devnet.");
  }
  const config = resolveSolanaDevnetConfig(process.env);
  const keypair = await loadOrCreateAnchorKeypair(config);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const balance = await getWalletBalanceLamports(connection, keypair);
  const { client, db } = await openPgliteMemory();
  try {
    const su = await signUp(db, {
      email: `pipeline-devnet-${Date.now()}@aproof.test`,
      password: "pipeline_devnet_pw_123456",
      organization_name: "Pipeline Devnet Test",
    });
    if (!su.ok) throw new Error("signUp failed");
    const { organization_id: orgId, environment_id: envId } = su;
    const { subject_id: subjectId } = await createSubject(db, {
      organizationId: orgId,
      environmentId: envId,
      railType: "system",
    });
    const p = await processEvent(db, {
      organization_id: orgId,
      environment_id: envId,
      subject_id: subjectId,
      source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
      trace_id: "anchor-devnet-pipeline-test",
      occurred_at: new Date(),
      payload: cleanSystemControlPayload(),
    });
    if (!p.ok) throw new Error("processEvent failed");
    await runSandboxAnchorCoordinatorForSubject(db, {
      subjectId,
      organizationId: orgId,
      environmentId: envId,
    });
    const [latest] = await db
      .select()
      .from(anchorBatches)
      .orderBy(desc(anchorBatches.createdAt))
      .limit(1);
    if (!latest) throw new Error("ANCHOR_PIPELINE_TEST_FAILED: no anchor batch created.");
    const meta = normalizeAnchorMetadata({
      anchor_id: latest.id,
      batch_id: latest.id,
      root_hash: latest.rootHash,
      proof_count: latest.proofCount,
      proof_ids: [],
      network: latest.chainName,
      cluster: latest.cluster,
      anchor_mode: latest.anchorMode,
      tx_signature: latest.txSignature,
      explorer_url: latest.explorerUrl,
      wallet_public_key: latest.walletPublicKey,
      status: String(latest.status),
      confirmation_status: latest.confirmationStatus,
      anchored_at: latest.anchoredAt ? latest.anchoredAt.toISOString() : null,
      created_at: latest.createdAt.toISOString(),
      error_message: latest.errorMessage,
    });
    if (!meta.tx_signature) throw new Error("ANCHOR_PIPELINE_TEST_FAILED: tx_signature missing.");
    if (!meta.explorer_url) throw new Error("ANCHOR_PIPELINE_TEST_FAILED: explorer_url missing.");
    if (meta.status !== "confirmed") throw new Error(`ANCHOR_PIPELINE_TEST_FAILED: status=${meta.status}`);
    if (meta.network !== "solana-devnet") throw new Error(`ANCHOR_PIPELINE_TEST_FAILED: network=${meta.network}`);
    if (!meta.explorer_url.includes("cluster=devnet")) {
      throw new Error("ANCHOR_PIPELINE_TEST_FAILED: explorer_url missing cluster=devnet.");
    }
    console.log(`wallet_public_key=${meta.wallet_public_key ?? keypair.publicKey.toBase58()}`);
    console.log(`balance_lamports=${balance}`);
    console.log(`tx_signature=${meta.tx_signature}`);
    console.log(`explorer_url=${meta.explorer_url}`);
    console.log(`confirmation_status=${meta.confirmation_status}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exit(1);
});
