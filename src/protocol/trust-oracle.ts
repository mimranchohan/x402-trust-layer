import { hmacSign, sha256Hex } from "./crypto.js";

export type OracleVerifyInput = {
  subjectType: "agent" | "merchant" | "receipt";
  subjectId: string;
  claims: Record<string, unknown>;
  minQuorum?: number;
};

const ORACLES = ["oracle-a", "oracle-b", "oracle-c", "oracle-d"] as const;

function oracleVote(
  oracleId: string,
  claims: Record<string, unknown>,
): { oracleId: string; approve: boolean; stake: number; reason: string } {
  const blob = JSON.stringify({ oracleId, claims });
  const hash = sha256Hex(blob);
  const n = parseInt(hash.slice(0, 8), 16);
  const trustClaim = Number(claims.trustScore ?? claims.score ?? 50);
  const approve = trustClaim >= 40 && n % 7 !== 0;
  return {
    oracleId,
    approve,
    stake: 100 + (n % 50),
    reason: approve ? "claims within policy" : "claims failed quorum policy",
  };
}

export type OracleConsensusResult = {
  consensus: boolean;
  quorum: number;
  votes: Array<{ oracleId: string; approve: boolean; stake: number; reason: string }>;
  byzantineFaultTolerance: string;
  slashingNote: string;
  proof: { digest: string; signature: string };
};

export async function runTrustOracleConsensus(
  input: OracleVerifyInput,
): Promise<OracleConsensusResult> {
  const quorum = input.minQuorum ?? 3;
  const votes = ORACLES.map((id) => oracleVote(id, input.claims));
  const approvals = votes.filter((v) => v.approve).length;
  const consensus = approvals >= quorum;
  const digest = sha256Hex(
    JSON.stringify({ subjectId: input.subjectId, approvals, votes: votes.map((v) => v.oracleId) }),
  );

  return {
    consensus,
    quorum,
    votes,
    byzantineFaultTolerance: "tolerates f=1 faulty oracle of 4 (simulated BFT quorum)",
    slashingNote:
      "Production: misbehaving oracles lose stake on divergence from on-chain anchor receipts",
    proof: { digest, signature: hmacSign(digest) },
  };
}
