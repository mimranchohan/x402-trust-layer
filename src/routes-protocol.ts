import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { config, pricing } from "./config.js";
import { parseWithVerifierFallback } from "./lib/parse-with-verifier-fallback.js";
import { agentTrustMeta, withAgentTrust } from "./lib/agent-response.js";
import { issueAgentPassport, verifyAgentPassport } from "./protocol/agent-passport.js";
import { computeTrustScoreV2 } from "./protocol/trust-score-v2.js";
import { runFraudScan } from "./protocol/fraud-engine.js";
import { runTrustOracleConsensus } from "./protocol/trust-oracle.js";
import {
  issueExecutionReceipt,
  verifyExecutionReceipt,
} from "./protocol/proof-of-execution.js";
import { commitReasoningAudit, selectiveDisclose } from "./protocol/reasoning-audit.js";
import {
  createProtocolEscrow,
  transitionEscrow,
  getEscrowStatus,
  ESCROW_STATES,
} from "./protocol/escrow-fsm.js";
import { createReplayBinding, verifyReplayBinding } from "./protocol/replay-guard.js";
import { generateZkProof } from "./protocol/zk-proofs.js";
import { computeAgentCreditScore } from "./protocol/credit-bureau.js";
import { assessCompliance } from "./protocol/compliance-v2.js";
import { runFullTrustPipeline } from "./protocol/pipeline-full-trust.js";
import { getThreatModel } from "./protocol/threat-catalog.js";
import { generateSecurityAuditReport } from "./protocol/security-audit.js";
import { getProtocolMetricsSnapshot, recordProtocolMetric } from "./protocol/observability.js";
import { idempotencyCapture, idempotencyPreCheck } from "./lib/idempotency.js";

type PaidFn = (amount: string, description: string) => RequestHandler;
type AsyncRoute = (
  handler: (req: Request, res: Response) => Promise<void>,
) => (req: Request, res: Response, next: (err?: unknown) => void) => void;

export function listProtocolEndpoints() {
  return [
    { path: "POST /api/protocol/pipeline/full-trust", price: `$${pricing.protocolFullTrust}`, tier: "protocol" },
    { path: "POST /api/protocol/passport/issue", price: `$${pricing.protocolPassportIssue}`, tier: "protocol" },
    { path: "POST /api/protocol/passport/verify", price: `$${pricing.protocolPassportVerify}`, tier: "protocol" },
    { path: "POST /api/protocol/trust-score/v2", price: `$${pricing.protocolTrustScoreV2}`, tier: "protocol" },
    { path: "POST /api/protocol/fraud/scan", price: `$${pricing.protocolFraudScan}`, tier: "protocol" },
    { path: "POST /api/protocol/oracle/consensus", price: `$${pricing.protocolOracleConsensus}`, tier: "protocol" },
    { path: "POST /api/protocol/execution/issue", price: `$${pricing.protocolExecutionIssue}`, tier: "protocol" },
    { path: "POST /api/protocol/execution/verify", price: `$${pricing.protocolExecutionVerify}`, tier: "protocol" },
    { path: "POST /api/protocol/reasoning/commit", price: `$${pricing.protocolReasoningCommit}`, tier: "protocol" },
    { path: "POST /api/protocol/reasoning/disclose", price: `$${pricing.protocolReasoningDisclose}`, tier: "protocol" },
    { path: "POST /api/protocol/escrow/create", price: `$${pricing.protocolEscrowCreate}`, tier: "protocol" },
    { path: "POST /api/protocol/escrow/transition", price: `$${pricing.protocolEscrowTransition}`, tier: "protocol" },
    { path: "POST /api/protocol/escrow/status", price: `$${pricing.protocolEscrowStatus}`, tier: "protocol" },
    { path: "POST /api/protocol/replay/bind", price: `$${pricing.protocolReplayBind}`, tier: "protocol" },
    { path: "POST /api/protocol/replay/verify", price: `$${pricing.protocolReplayVerify}`, tier: "protocol" },
    { path: "POST /api/protocol/zk/prove", price: `$${pricing.protocolZkProve}`, tier: "protocol" },
    { path: "POST /api/protocol/credit/score", price: `$${pricing.protocolCreditScore}`, tier: "protocol" },
    { path: "POST /api/protocol/compliance/assess", price: `$${pricing.protocolComplianceAssess}`, tier: "protocol" },
  ];
}

const policySchema = z.object({
  dailyCapUsdc: z.coerce.number().positive(),
  perCallCapUsdc: z.coerce.number().positive(),
  allowedHosts: z.array(z.string()).optional(),
});

export function registerProtocolRoutes(
  app: Express,
  paid: PaidFn,
  asyncRoute: AsyncRoute,
): void {
  const post = (
    path: string,
    amount: string | number,
    description: string,
    handler: (req: Request, res: Response) => Promise<void>,
  ) => {
    app.post(path, idempotencyPreCheck, paid(String(amount), description), idempotencyCapture, asyncRoute(handler));
  };

  app.get("/api/protocol/threat-model", (_req, res) => {
    res.json(getThreatModel());
  });

  app.get("/api/protocol/security/audit", (_req, res) => {
    res.json(generateSecurityAuditReport());
  });

  app.get("/api/protocol/architecture", (_req, res) => {
    res.json({
      name: "x402 Agent Trust Protocol v4",
      version: "4.0.0",
      layers: [
        "identity-passport",
        "trust-score-v2",
        "fraud-engine",
        "trust-oracle",
        "proof-of-execution",
        "reasoning-audit",
        "escrow-fsm",
        "replay-guard",
        "zk-proofs",
        "credit-bureau",
        "compliance-v2",
      ],
      paidRoutes: listProtocolEndpoints().map((e) => e.path),
      freeRoutes: [
        "GET /api/protocol/threat-model",
        "GET /api/protocol/security/audit",
        "GET /api/protocol/architecture",
        "GET /api/protocol/metrics",
      ],
      canonicalOrigin: config.canonicalOrigin,
    });
  });

  app.get("/api/protocol/metrics", async (_req, res) => {
    res.json(await getProtocolMetricsSnapshot());
  });

  post(
    "/api/protocol/pipeline/full-trust",
    pricing.protocolFullTrust,
    "Full trust pipeline: passport, trust v2, fraud, oracle, credit, compliance, guard, replay bind",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/pipeline/full-trust",
        z.object({
          agentId: z.string().min(1),
          walletAddress: z.string().min(16),
          targetUrl: z.string().url(),
          estimatedCostUsdc: z.coerce.number().nonnegative(),
          organizationId: z.string().optional(),
          policy: policySchema,
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      await recordProtocolMetric("api.protocol.full_trust");
      res.json(await runFullTrustPipeline(parsed.data));
    },
  );

  post(
    "/api/protocol/passport/issue",
    pricing.protocolPassportIssue,
    "Issue W3C-style Agent Passport DID credential with capabilities and permissions",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/passport/issue",
        z.object({
          agentId: z.string().min(1),
          publicKey: z.string().optional(),
          walletAddress: z.string().optional(),
          ownerIdentity: z.string().optional(),
          capabilities: z.array(z.string()).optional(),
          permissions: z.array(z.string()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const passport = await issueAgentPassport(parsed.data);
      res.json(
        withAgentTrust(
          { status: "ok", passport, hardwareAttestation: { available: true } },
          agentTrustMeta(["passport_issued"], { sources: ["agent-passport-protocol"] }),
        ),
      );
    },
  );

  post(
    "/api/protocol/passport/verify",
    pricing.protocolPassportVerify,
    "Verify Agent Passport DID credential signature",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/passport/verify",
        z.object({ did: z.string().min(10) }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await verifyAgentPassport(parsed.data.did));
    },
  );

  post(
    "/api/protocol/trust-score/v2",
    pricing.protocolTrustScoreV2,
    "Multi-factor tamper-resistant TrustScore v2 with cryptographic proof",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/trust-score/v2",
        z.object({
          agentId: z.string().min(1),
          walletAddress: z.string().min(16),
          disputeRatePct: z.coerce.number().optional(),
          refundRatePct: z.coerce.number().optional(),
          uptimePct: z.coerce.number().optional(),
          deliveryQualityScore: z.coerce.number().optional(),
          stakeWeightUsdc: z.coerce.number().optional(),
          counterpartyCount: z.coerce.number().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(
        withAgentTrust(
          { status: "ok", ...(await computeTrustScoreV2(parsed.data)) },
          agentTrustMeta(["trustscore_v2"], { confidence: 0.88, sources: ["trustscore-v2", "erc8004"] }),
        ),
      );
    },
  );

  post(
    "/api/protocol/fraud/scan",
    pricing.protocolFraudScan,
    "Graph-based fraud scan: Sybil clusters, wash trading, circular payments",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/fraud/scan",
        z.object({
          agentId: z.string().optional(),
          walletAddress: z.string().optional(),
          merchantHost: z.string().optional(),
          transactionHashes: z.array(z.string()).optional(),
          amountUsdc: z.coerce.number().optional(),
          peerWallets: z.array(z.string()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(withAgentTrust({ status: "ok", ...(await runFraudScan(parsed.data)) }, agentTrustMeta(["fraud_scan"])));
    },
  );

  post(
    "/api/protocol/oracle/consensus",
    pricing.protocolOracleConsensus,
    "Trust oracle quorum consensus (4 validators, BFT-style quorum)",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/oracle/consensus",
        z.object({
          subjectType: z.enum(["agent", "merchant", "receipt"]),
          subjectId: z.string().min(1),
          claims: z.record(z.unknown()),
          minQuorum: z.coerce.number().int().min(2).max(4).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(
        withAgentTrust(
          { status: "ok", ...(await runTrustOracleConsensus(parsed.data)) },
          agentTrustMeta(["oracle_consensus"]),
        ),
      );
    },
  );

  post(
    "/api/protocol/execution/issue",
    pricing.protocolExecutionIssue,
    "Proof of Execution: task receipt, execution hash, tool trace, settlement proof",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/execution/issue",
        z.object({
          agentId: z.string().min(1),
          taskId: z.string().optional(),
          targetUrl: z.string().url().optional(),
          toolTrace: z
            .array(
              z.object({
                name: z.string(),
                url: z.string().optional(),
                amountUsdc: z.coerce.number().optional(),
              }),
            )
            .optional(),
          decisionTrace: z.array(z.string()).optional(),
          settlement: z
            .object({
              transactionHash: z.string().optional(),
              network: z.string().optional(),
              amountUsdc: z.coerce.number().optional(),
            })
            .optional(),
          responseSummary: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const receipt = await issueExecutionReceipt(parsed.data, config.publicBaseUrl);
      res.json(withAgentTrust({ status: "ok", receipt }, agentTrustMeta(["poe_issued"])));
    },
  );

  post(
    "/api/protocol/execution/verify",
    pricing.protocolExecutionVerify,
    "Third-party verify Proof of Execution receipt",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/execution/verify",
        z.object({ receiptId: z.string().min(8) }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await verifyExecutionReceipt(parsed.data.receiptId));
    },
  );

  post(
    "/api/protocol/reasoning/commit",
    pricing.protocolReasoningCommit,
    "Commit reasoning audit log to Merkle tree (tool calls, prompt hashes, policy checks)",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/reasoning/commit",
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().optional(),
          toolCalls: z.array(z.object({ name: z.string(), argsHash: z.string().optional() })),
          policyChecks: z.array(z.string()),
          promptHashes: z.array(z.string()),
          riskAnalysis: z.string().optional(),
          decisionGraph: z.record(z.unknown()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(withAgentTrust({ status: "ok", ...(await commitReasoningAudit(parsed.data)) }, agentTrustMeta(["reasoning_commit"])));
    },
  );

  post(
    "/api/protocol/reasoning/disclose",
    pricing.protocolReasoningDisclose,
    "Selective disclosure of reasoning audit Merkle leaves",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/reasoning/disclose",
        z.object({
          auditId: z.string().min(8),
          leafIndices: z.array(z.coerce.number().int().nonnegative()),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await selectiveDisclose(parsed.data.auditId, parsed.data.leafIndices));
    },
  );

  post(
    "/api/protocol/escrow/create",
    pricing.protocolEscrowCreate,
    "Create protocol escrow FSM in CREATED state",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/escrow/create",
        z.object({
          payerAgentId: z.string().min(1),
          payeeMerchant: z.string().min(1),
          amountUsdc: z.coerce.number().positive(),
          resourceHash: z.string().optional(),
          sessionId: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json({ status: "ok", escrow: await createProtocolEscrow(parsed.data), validStates: ESCROW_STATES });
    },
  );

  post(
    "/api/protocol/escrow/transition",
    pricing.protocolEscrowTransition,
    "Transition escrow FSM state (atomic settlement path)",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/escrow/transition",
        z.object({
          escrowId: z.string().uuid(),
          nextState: z.enum(ESCROW_STATES),
          note: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const result = await transitionEscrow(parsed.data.escrowId, parsed.data.nextState, parsed.data.note);
      if (!result.ok) return void res.status(409).json({ error: result.error });
      res.json({ status: "ok", escrow: result.escrow });
    },
  );

  post(
    "/api/protocol/escrow/status",
    pricing.protocolEscrowStatus,
    "Query protocol escrow FSM status and history",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/escrow/status",
        z.object({ escrowId: z.string().uuid() }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const escrow = await getEscrowStatus(parsed.data.escrowId);
      if (!escrow) return void res.status(404).json({ error: "Escrow not found" });
      res.json({ status: "ok", escrow });
    },
  );

  post(
    "/api/protocol/replay/bind",
    pricing.protocolReplayBind,
    "Bind nonce + resource hash + request hash for replay-safe x402 pay",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/replay/bind",
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().optional(),
          resourceUrl: z.string().url(),
          requestBody: z.record(z.unknown()).optional(),
          ttlSeconds: z.coerce.number().int().positive().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const binding = await createReplayBinding(parsed.data);
      res.json({
        status: "ok",
        binding,
        usage: "Send X-Trust-Replay-Binding and X-Trust-Replay-Nonce on paid API calls",
      });
    },
  );

  post(
    "/api/protocol/replay/verify",
    pricing.protocolReplayVerify,
    "Verify and consume replay binding (one-time nonce)",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/replay/verify",
        z.object({
          bindingId: z.string().min(8),
          nonce: z.string().optional(),
          resourceUrl: z.string().url().optional(),
          requestBody: z.record(z.unknown()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await verifyReplayBinding(parsed.data.bindingId, parsed.data));
    },
  );

  post(
    "/api/protocol/zk/prove",
    pricing.protocolZkProve,
    "Generate zk-style proof of authorization, budget, reputation, or compliance",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/zk/prove",
        z.object({
          proofType: z.enum(["authorization", "creditworthiness", "reputation", "budget", "compliance"]),
          agentId: z.string().min(1),
          witness: z.record(z.unknown()),
          publicInputs: z.record(z.unknown()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(withAgentTrust({ status: "ok", proof: generateZkProof(parsed.data) }, agentTrustMeta(["zk_prove"])));
    },
  );

  post(
    "/api/protocol/credit/score",
    pricing.protocolCreditScore,
    "AI Agent Credit Bureau score 300-900 with spend limit suggestions",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/credit/score",
        z.object({
          agentId: z.string().min(1),
          walletAddress: z.string().min(16),
          disputeCount: z.coerce.number().int().nonnegative().optional(),
          settlementCount: z.coerce.number().int().nonnegative().optional(),
          uptimePct: z.coerce.number().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(
        withAgentTrust(
          { status: "ok", ...(await computeAgentCreditScore(parsed.data)) },
          agentTrustMeta(["credit_bureau"]),
        ),
      );
    },
  );

  post(
    "/api/protocol/compliance/assess",
    pricing.protocolComplianceAssess,
    "Enterprise compliance assess: AML risk, KYC gate, audit trail refs",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/protocol/compliance/assess",
        z.object({
          organizationId: z.string().min(1),
          agentId: z.string().min(1),
          jurisdiction: z.string().optional(),
          monthlyVolumeUsdc: z.coerce.number().optional(),
          rails: z.array(z.string()).optional(),
          requiresKyc: z.coerce.boolean().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(withAgentTrust({ status: "ok", ...assessCompliance(parsed.data) }, agentTrustMeta(["compliance_assess"])));
    },
  );
}
