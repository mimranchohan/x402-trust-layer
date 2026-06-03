import { config } from "../config.js";
import type { MandateRecord, MandateScope } from "./mandate.js";

export type MandateVC = {
  "@context": string[];
  type: ["VerifiableCredential", "AgentPaymentMandate"];
  issuer: string;
  validFrom: string;
  validUntil: string;
  credentialSubject: {
    id: string;
    agentId: string;
    scope: MandateScope;
  };
  proof: {
    type: "HmacProof2026";
    created: string;
    proofValue: string;
    verificationMethod: string;
  };
};

export function mandateToVC(record: MandateRecord, principalDid?: string): MandateVC {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://x402trustlayer.xyz/contexts/agent-payment-mandate/v1",
    ],
    type: ["VerifiableCredential", "AgentPaymentMandate"],
    issuer: "did:web:x402trustlayer.xyz",
    validFrom: record.issuedAt,
    validUntil: record.scope.expiresAt,
    credentialSubject: {
      id: principalDid ?? `did:web:agent.id#${record.agentId}`,
      agentId: record.agentId,
      scope: record.scope,
    },
    proof: {
      type: "HmacProof2026",
      created: record.issuedAt,
      proofValue: record.signature,
      verificationMethod: `${base}/keys/hmac-signing-key`,
    },
  };
}
