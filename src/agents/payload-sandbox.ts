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
  {
    regex: /(system\s*(override|reset|bypass|hijack|instruction)|ignore\s*(all)?\s*previous\s*instruction|disregard\s*(all)?\s*prior\s*instruction|bypass\s*safety\s*filter|developer\s*mode|dan\s*mode|do\s*anything\s*now|jailbreak)/i,
    tag: "prompt_injection_system_override"
  },
  {
    regex: /(you\s*(are|must)\s*now\s*(act\s*as|become|ignore)|\bact\s+as\s+an?\s+(unrestricted|unfiltered|jailbroken|system)\b|pretend\s+to\s+be|roleplay\s+as|simulate\s+an?\s+(unrestricted|unfiltered|jailbroken))/i,
    tag: "prompt_injection_persona_shift"
  },
  {
    regex: /((drain|transfer|send|withdraw|sweep|approve)\s+(?:all\s+|the\s+|my\s+|our\s+)*(?:wallet\s+|account\s+)*(?:balance|funds|usdc|assets|wallets?|allowance)\s+to|approve\s+max(imum)?\s+allowance|bypass\s+(?:payment|fee|signature)\s+check)/i,
    tag: "balance_draining_command"
  },
  {
    regex: /(private\s*key|mnemonic\s*phrase|secret\s*recovery|seed\s*phrase|keystore|wallet\s*password|process\.env|api\s*key|api\s*secret)/i,
    tag: "credential_harvesting"
  },
  {
    regex: /\b(sudo\s+|rm\s+-rf|spawn\s*(sh|bash|cmd|powershell)|exec\s*(sh|bash|file|code|command|shell)|eval\s*\(|system\s*\(|popen|subprocess)\b|[|&;`$]\s*(sh|bash|cmd|powershell|curl|wget)\b/i,
    tag: "arbitrary_code_execution"
  },
  {
    regex: /(\bjavascript:|<script\b|onerror\s*=|onload\s*=|<iframe\b|<svg\b\s*onload)/i,
    tag: "xss_injection"
  },
  {
    regex: /\b(curl|wget|nc|netcat|fetch)\b.*?(http|ftp|tftp|sftp)|\b(localhost|127\.0\.0\.1|169\.254\.169\.254)\b/i,
    tag: "network_ssrf_exploit"
  },
  {
    regex: /(\.\.[\/\\]\.\.)|(\/etc\/(passwd|shadow|hosts))|(\b(system32|win\.ini|boot\.ini)\b)/i,
    tag: "path_traversal"
  },
  {
    regex: /(\b(reveal|print|show|output|leak|repeat|display|dump)\s*(the|your)?\s*(system\s*prompt|initialization|instructions|directives|setup\s*prompt)\b)|(\brepeat\s+after\s+me\b)/i,
    tag: "prompt_extraction_attack"
  }
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
