import { sha256Hex } from "./crypto.js";
import { config } from "../config.js";

export type ZkProveType =
  | "authorization"
  | "creditworthiness"
  | "reputation"
  | "budget"
  | "compliance";

export type ZkProveInput = {
  proofType: ZkProveType;
  agentId: string;
  /** Private witness — hashed, never returned in full */
  witness: Record<string, unknown>;
  publicInputs?: Record<string, unknown>;
};

export type ZkProofBundle = {
  proofType: ZkProveType;
  scheme: "commitment-v1-simulated" | "groth16";
  publicInputs: Record<string, unknown>;
  commitment: string;
  nullifier: string;
  verified: boolean;
  note: string;
  simulated: boolean;
  productionReady: boolean;
  disclaimer: string;
  zkLibrary: string;
};

export function assertZkProveAllowed(): void {
  if (!config.zkSimulateAllowed) {
    throw new Error(
      "ZK prove is disabled in production. Set ALLOW_ZK_SIMULATE=1 for demo only, or integrate a real Groth16 verifier.",
    );
  }
}

/** Commitment-based simulated proof — not a SNARK; witness never returned. */
export function generateZkProof(input: ZkProveInput): ZkProofBundle {
  assertZkProveAllowed();
  const witnessHash = sha256Hex(JSON.stringify(input.witness));
  const publicInputs = {
    agentId: input.agentId,
    proofType: input.proofType,
    ...(input.publicInputs ?? {}),
  };
  const commitment = sha256Hex(`${witnessHash}:${JSON.stringify(publicInputs)}`);
  const nullifier = sha256Hex(`${input.agentId}:${input.proofType}:${witnessHash}`).slice(0, 32);
  return {
    proofType: input.proofType,
    scheme: "commitment-v1-simulated",
    publicInputs,
    commitment,
    nullifier,
    verified: false,
    simulated: true,
    productionReady: false,
    disclaimer:
      "This proof is cryptographically simulated (SHA256 commitment, not Groth16/PLONK). Do not use for production financial decisions.",
    zkLibrary: "snarkjs-pending-integration",
    note: "Simulated commitment proof — not Groth16. Roadmap: circom + on-chain verifier.",
  };
}
