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
          title: "Context and objective alignment",
          minutes: 20,
          facilitatorPrompt: `Confirm objective: ${objective}. Identify success criteria and constraints.`,
          artifact: "Session brief",
        },
        {
          title: "Dependency and risk mapping",
          minutes: 35,
          facilitatorPrompt: "Map external dependencies, blocker probabilities, and mitigation owners.",
          artifact: "Dependency map + risk register",
        },
        {
          title: "Decision checkpoints and execution actions",
          minutes: 35,
          facilitatorPrompt: "Finalize go/no-go decisions, owners, dates, and fallback plan per action.",
          artifact: "Decision log + action table",
        },
      ],
      workstreams: [
        {
          name: "Dependency mapping",
          steps: [
            "List external APIs and payment dependencies",
            "Mark critical path blockers",
            "Assign fallback owner per dependency",
          ],
          ownerRole: "Platform Lead",
        },
        {
          name: "Risk and mitigation",
          steps: [
            "Score each risk by probability/impact",
            "Define mitigation for top 5 risks",
            "Set escalation trigger thresholds",
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
        "Dependency map",
        "Risk register",
        "Decision log template",
        "Action items table",
      ],
      deliverablesChecklist: [
        "Signed session brief",
        "Dependency map approved",
        "Risk register prioritized",
        "Decision log finalized",
        "Action items assigned with dates",
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
