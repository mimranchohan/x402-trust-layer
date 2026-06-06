import { hmacSign } from "../protocol/crypto.js";

export type SandboxInput = {
  agentId: string;
  payload: Record<string, unknown>;
  targetUrl?: string;
};

export type SandboxResult = {
  status: "ok" | "error";
  allowed: boolean;
  threatScore: number;
  detectedVectors: string[];
  summary: string;
  signature: string;
  scannedAt: string;
};

const DANGEROUS_PATTERNS = [
  { regex: /system\s*(override|reset|bypass)|ignore\s*(all)?\s*previous\s*instruction/i, tag: "prompt_injection_system_override" },
  { regex: /you\s*(are|must)\s*now\s*(act\s*as|become|ignore)/i, tag: "prompt_injection_persona_shift" },
  { regex: /(drain|transfer|send)\s*(all)?\s*(balance|funds|usdc|assets|wallets?)\s*to/i, tag: "balance_draining_command" },
  { regex: /private\s*key|mnemonic\s*phrase|secret\s*recovery|seed\s*phrase/i, tag: "credential_harvesting" },
  { regex: /sudo\s+|rm\s+-rf|spawn\s*sh|exec\s*file|exec\s*(sh|bash)/i, tag: "arbitrary_code_execution" },
  { regex: /<script>|javascript:|onerror\s*=/i, tag: "xss_injection" }
];

function scanValue(val: unknown, detected: string[]): void {
  if (typeof val === "string") {
    for (const { regex, tag } of DANGEROUS_PATTERNS) {
      if (regex.test(val)) {
        detected.push(tag);
      }
    }
  } else if (Array.isArray(val)) {
    for (const item of val) {
      scanValue(item, detected);
    }
  } else if (val && typeof val === "object") {
    for (const v of Object.values(val as Record<string, unknown>)) {
      scanValue(v, detected);
    }
  }
}

export async function runPayloadSandbox(input: SandboxInput): Promise<SandboxResult> {
  const detectedVectors: string[] = [];
  scanValue(input.payload, detectedVectors);

  const uniqueVectors = Array.from(new Set(detectedVectors));
  const threatScore = uniqueVectors.length === 0 ? 0 : Math.min(100, uniqueVectors.length * 35);
  const allowed = threatScore < 50;
  const now = new Date().toISOString();

  const summary = allowed
    ? "Payload checked successfully; no critical prompt injection or exploit vectors detected."
    : `Payload check failed: detected potential safety threat vectors (${uniqueVectors.join(", ")}).`;

  const payloadString = JSON.stringify({
    agentId: input.agentId,
    allowed,
    threatScore,
    detectedVectors: uniqueVectors,
    scannedAt: now
  });
  const signature = hmacSign(payloadString);

  return {
    status: "ok",
    allowed,
    threatScore,
    detectedVectors: uniqueVectors,
    summary,
    signature,
    scannedAt: now
  };
}
