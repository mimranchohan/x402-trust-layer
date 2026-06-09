import { computeTrustScoreV2 } from "../src/protocol/trust-score-v2.js";
import { runFraudScan } from "../src/protocol/fraud-engine.js";
import { createProtocolEscrow, transitionEscrow } from "../src/protocol/escrow-fsm.js";
import { issueAgentPassport } from "../src/protocol/agent-passport.js";

const wallet = "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt";
const agentId = "protocol-smoke-1";

const passport = await issueAgentPassport({ agentId, walletAddress: wallet });
const trust = await computeTrustScoreV2({ agentId, walletAddress: wallet });
const fraud = await runFraudScan({ agentId, walletAddress: wallet, amountUsdc: 0.05 });
const escrow = await createProtocolEscrow({
  payerAgentId: agentId,
  payeeMerchant: "api.myceliasignal.com",
  amountUsdc: 0.05,
});
const funded = await transitionEscrow(escrow.escrowId, "FUNDED");

console.log(
  JSON.stringify(
    {
      ok: true,
      did: passport.did,
      trustScore: trust.trustScore,
      fraudScore: fraud.fraudScore,
      escrowState: funded.escrow?.state,
    },
    null,
    2,
  ),
);
