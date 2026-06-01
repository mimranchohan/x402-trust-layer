export type SemanticJudgeInput = {
  deliveryIntent: string;
  sample: string;
  fields?: Record<string, unknown>;
};

export type SemanticJudgeResult = {
  score: number;
  reasons: string[];
  mode: "heuristic" | "llm";
};

/** Rules-only judge (used in production fallback and golden tests). */
export function heuristicJudge(input: SemanticJudgeInput): SemanticJudgeResult {
  const reasons: string[] = [];
  let score = 100;
  const sample = input.sample.toLowerCase();
  const intent = input.deliveryIntent.toLowerCase();

  if (!sample || sample.length < 8) {
    score -= 70;
    reasons.push("Response sample too short");
  }

  if (/lorem|scam|click here|free money/.test(sample)) {
    score -= 45;
    reasons.push("Suspicious phrasing in response");
  }

  const intentWords = intent.split(/\W+/).filter((w) => w.length > 3);
  const hit = intentWords.filter((w) => sample.includes(w));
  if (intentWords.length >= 2 && hit.length === 0) {
    score -= 20;
    reasons.push("No intent keyword overlap in response");
  } else if (hit.length) {
    reasons.push(`Intent keywords matched: ${hit.slice(0, 5).join(", ")}`);
  }

  if (/price|oracle|usd/.test(intent)) {
    const hasNum =
      Object.values(input.fields ?? {}).some((v) => typeof v === "number" && v > 0) ||
      /"price"\s*:\s*[0-9]/.test(sample);
    if (!hasNum) {
      score -= 30;
      reasons.push("Expected numeric price data missing");
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, mode: "heuristic" };
}

async function llmJudge(input: SemanticJudgeInput): Promise<SemanticJudgeResult | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS ?? 25_000)),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You judge whether an API response satisfies a buyer's delivery intent for x402 escrow. Return JSON: { score: 0-100, reasons: string[] }. Score 0 = fraud/empty/wrong data; 100 = fully satisfies intent.",
          },
          {
            role: "user",
            content: JSON.stringify({
              deliveryIntent: input.deliveryIntent,
              fields: input.fields ?? {},
              sample: input.sample.slice(0, 4000),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { score?: number; reasons?: string[] };
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0)));
    return {
      score,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : ["LLM evaluation"],
      mode: "llm",
    };
  } catch {
    return null;
  }
}

/** Optional LLM judge when OPENAI_API_KEY is set; otherwise heuristic only. */
export async function runSemanticJudge(input: SemanticJudgeInput): Promise<SemanticJudgeResult> {
  const llm = await llmJudge(input);
  if (llm) return llm;
  return heuristicJudge(input);
}
