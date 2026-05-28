export type MppBrokerInput = {
  action?: "estimate" | "plan";
  expectedCalls?: number;
  avgPricePerCallUsdc?: number;
  network?: string;
  objective?: string;
  teamName?: string;
  durationMinutes?: number;
  constraints?: string[];
};

export type MppBrokerResult = {
  action: string;
  objective: string;
  sessionPlan: {
    durationMinutes: number;
    agendaBlocks: Array<{
      title: string;
      minutes: number;
      facilitatorPrompt: string;
      artifact: string;
    }>;
    workstreams: Array<{
      name: string;
      steps: string[];
      ownerRole: string;
    }>;
    artifacts: string[];
    deliverablesChecklist: string[];
    raci: Array<{
      deliverable: string;
      responsible: string;
      accountable: string;
      consulted: string;
      informed: string;
    }>;
    actionItemsTemplate: string;
  };
  costGuidance: {
    expectedCalls: number;
    perCallModeCostUsdc: number;
    mppSessionEstimateCostUsdc: number;
    estimatedSavingsUsdc: number;
    recommendation: "mpp" | "per_call";
    plan: string[];
  };
  docsUrl: string;
};

export function runMppSessionBroker(input: MppBrokerInput): MppBrokerResult {
  const expectedCalls = input.expectedCalls ?? 25;
  const avgPricePerCallUsdc = input.avgPricePerCallUsdc ?? 0.03;
  const action = input.action ?? "estimate";
  const durationMinutes = input.durationMinutes ?? 90;
  const objective =
    input.objective ?? "Map dependencies, rank risks, and decide next payment-session actions";
  const objectiveLower = objective.toLowerCase();
  const perfMode =
    objectiveLower.includes("performance") ||
    objectiveLower.includes("observability") ||
    objectiveLower.includes("latency") ||
    objectiveLower.includes("incident");

  const perCallTotal = expectedCalls * avgPricePerCallUsdc;
  const sessionOverhead = 0.01;
  const mppTotal = sessionOverhead + expectedCalls * 0.001;
  const savings = Math.max(0, perCallTotal - mppTotal);
  const useMpp = expectedCalls >= 10 && savings > 0.05;

  return {
    action,
    objective,
    sessionPlan: {
      durationMinutes,
      agendaBlocks: [
        {
          title: "Scenario pre-assessment",
          minutes: 10,
          facilitatorPrompt: `Run a scenario-based pre-assessment for objective: ${objective}. Capture baseline assumptions in <=10 minutes.`,
          artifact: "Pre-assessment snapshot",
        },
        {
          title: "Hands-on incident and root-cause matrix",
          minutes: 30,
          facilitatorPrompt:
            "Facilitate a hands-on incident walkthrough and finish with a root-cause hypothesis matrix.",
          artifact: "Incident narrative + root-cause matrix",
        },
        {
          title: "24-hour experiment and measurement plan",
          minutes: 30,
          facilitatorPrompt:
            "Design a 24-hour experiment plan that explicitly covers metrics, logs, and traces.",
          artifact: "24-hour experiment plan",
        },
        {
          title: "Observability overhead vs runtime cost trade-offs",
          minutes: 15,
          facilitatorPrompt:
            "Evaluate observability depth against runtime/USDC overhead; define guardrails and decision thresholds.",
          artifact: "Trade-off decision memo",
        },
        {
          title: "Wrap-up and reusable checklist",
          minutes: 5,
          facilitatorPrompt:
            "Confirm decisions, owners, and handoff; finalize reusable execution checklist template.",
          artifact: "Reusable checklist template",
        },
      ],
      workstreams: [
        {
          name: perfMode ? "Performance triage" : "Dependency mapping",
          steps: [
            perfMode
              ? "Capture symptom timeline and baseline latency/error metrics"
              : "List external APIs and payment dependencies",
            perfMode ? "Reproduce incident and isolate bottleneck zones" : "Mark critical path blockers",
            perfMode ? "Map hypotheses into testable root-cause matrix" : "Assign fallback owner per dependency",
          ],
          ownerRole: "Platform Lead",
        },
        {
          name: perfMode ? "Observability and experiment design" : "Risk and mitigation",
          steps: [
            perfMode ? "Define metrics, logs, traces required for validation" : "Score each risk by probability/impact",
            perfMode ? "Plan 24-hour experiments and success thresholds" : "Define mitigation for top 5 risks",
            perfMode ? "Estimate instrumentation overhead and runtime cost impact" : "Set escalation trigger thresholds",
          ],
          ownerRole: "Security Lead",
        },
        {
          name: "Decision and action closeout",
          steps: [
            "Record go/no-go decisions",
            "Assign action owners and due dates",
            "Define next checkpoint date",
          ],
          ownerRole: "Program Manager",
        },
      ],
      artifacts: [
        "Session brief",
        perfMode ? "Incident narrative" : "Dependency map",
        perfMode ? "Root-cause hypothesis matrix" : "Risk register",
        "24-hour experiment plan",
        "Observability trade-off memo",
        "Decision log template",
        "Action items table",
        "Reusable checklist template",
      ],
      deliverablesChecklist: [
        "Scenario pre-assessment completed (<=10 min)",
        perfMode ? "Root-cause matrix completed" : "Dependency map approved",
        "24-hour measurement plan (metrics/logs/traces) approved",
        "Observability overhead vs runtime cost trade-off captured",
        "Decision log finalized",
        "Action items assigned with dates",
        "Reusable checklist published",
      ],
      raci: [
        {
          deliverable: "Dependency map",
          responsible: "Platform Lead",
          accountable: "Engineering Manager",
          consulted: "Security Lead",
          informed: "Product Owner",
        },
        {
          deliverable: "Risk register",
          responsible: "Security Lead",
          accountable: "Security Manager",
          consulted: "Platform Lead",
          informed: "Program Manager",
        },
        {
          deliverable: "Action items table",
          responsible: "Program Manager",
          accountable: "Product Owner",
          consulted: "Engineering Manager",
          informed: "All stakeholders",
        },
      ],
      actionItemsTemplate: "owner | task | due_date | dependency | risk | status",
    },
    costGuidance: {
      expectedCalls,
      perCallModeCostUsdc: Number(perCallTotal.toFixed(4)),
      mppSessionEstimateCostUsdc: Number(mppTotal.toFixed(4)),
      estimatedSavingsUsdc: Number(savings.toFixed(4)),
      recommendation: useMpp ? "mpp" : "per_call",
      plan: [
        "Open an MPP session channel on Solana via Dexter facilitator",
        "Issue vouchers per API call without per-call on-chain settlement",
        "Close session to settle aggregate USDC once",
        "Use Spend Governor to cap total session budget",
      ],
    },
    docsUrl: "https://docs.dexter.cash/docs/mpp/",
  };
}
