import { hmacSign, sha256Hex } from "./crypto.js";

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
  scheme: "groth16-simulated-v1";
  publicInputs: Record<string, unknown>;
  commitment: string;
  nullifier: string;
  verified: boolean;
  note: string;
};

/** Simulated zk proof — production would use circom/snarkjs or vendor ZK service */
export function generateZkProof(input: ZkProveInput): ZkProofBundle {
  const witnessHash = sha256Hex(JSON.stringify(input.witness));
  const publicInputs = {
    agentId: input.agentId,
    proofType: input.proofType,
    ...(input.publicInputs ?? {}),
  };
  const commitment = sha256Hex(`${witnessHash}:${JSON.stringify(publicInputs)}`);
  const nullifier = sha256Hex(`${input.agentId}:${input.proofType}:${witnessHash}`).slice(0, 32);
  const verified = hmacSign(commitment).length === 64;

  return {
    proofType: input.proofType,
    scheme: "groth16-simulated-v1",
    publicInputs,
    commitment,
    nullifier,
    verified,
    note: "Simulated ZK — witness not revealed; upgrade path to Groth16/PLONK verifier contract",
  };
}
