export type MppBrokerInput = {
  action?: "estimate" | "plan";
  expectedCalls?: number;
  avgPricePerCallUsdc?: number;
  network?: string;
  objective?: string;
  topic?: string;
  sessionContext?: string;
  teamName?: string;
  durationMinutes?: number;
  constraints?: string[];
  deliverables?: string[];
};

export type MppBrokerResult = {
  status: "ok";
  action: string;
  objective: string;
  summary: string;
  objectiveUsed: string;
  durationMinutesUsed: number;
  constraintsApplied: string[];
  topic?: string;
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
    sessionAgenda: Array<{ title: string; minutes: number }>;
    stepByStepPlan: string[];
    estimatedTimePerStep: Array<{ step: string; minutes: number }>;
    materialsChecklist: string[];
    successCriteria: string[];
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
    input.objective ??
    input.sessionContext ??
    input.topic ??
    "Map dependencies, rank risks, and decide next payment-session actions";

  const perCallTotal = expectedCalls * avgPricePerCallUsdc;
  const sessionOverhead = 0.01;
  const mppTotal = sessionOverhead + expectedCalls * 0.001;
  const savings = Math.max(0, perCallTotal - mppTotal);
  const useMpp = expectedCalls >= 10 && savings > 0.05;

  return {
    status: "ok",
    action,
    summary: "Session plan generated from provided context and objectives.",
    objective,
    objectiveUsed: objective,
    durationMinutesUsed: durationMinutes,
    constraintsApplied: input.constraints ?? [],
    topic: input.topic,
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
          title: "Hands-on practice and risk assessment",
          minutes: 30,
          facilitatorPrompt:
            "Facilitate practical exercises tied to the objective and complete a risk assessment matrix.",
          artifact: "Hands-on notes + risk assessment matrix",
        },
        {
          title: "Assumptions/decisions log and success metrics",
          minutes: 30,
          facilitatorPrompt:
            "Document assumptions and decisions, then define measurable success criteria and checkpoints.",
          artifact: "Assumptions/decisions log + success metrics sheet",
        },
        {
          title: "Stakeholder alignment checkpoint",
          minutes: 15,
          facilitatorPrompt:
            "Align stakeholders on decisions, risks, and ownership; resolve open conflicts.",
          artifact: "Stakeholder alignment summary",
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
          name: "Hands-on workflow",
          steps: [
            "Run guided practical exercise from the supplied context",
            "Capture risks and blockers discovered in practice",
            "Assign owners for each blocker",
          ],
          ownerRole: "Platform Lead",
        },
        {
          name: "Planning and measurement",
          steps: [
            "Record assumptions and explicit decisions",
            "Define success metrics and check-in milestones",
            "Set mitigation actions per risk",
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
        "Hands-on notes",
        "Risk assessment matrix",
        "Assumptions/decisions log",
        "Success metrics sheet",
        "Stakeholder alignment summary",
        "Decision log template",
        "Action items table",
        "Reusable checklist template",
      ],
      deliverablesChecklist: [
        "Scenario pre-assessment completed (<=10 min)",
        "Risk assessment completed",
        "Assumptions/decisions log finalized",
        "Success metrics and milestones approved",
        "Stakeholder alignment checkpoint completed",
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
      sessionAgenda: [
        { title: "Scenario pre-assessment", minutes: 10 },
        { title: "Hands-on incident and root-cause matrix", minutes: 30 },
        { title: "24-hour experiment and measurement plan", minutes: 30 },
        { title: "Observability overhead vs runtime cost trade-offs", minutes: 15 },
        { title: "Wrap-up and reusable checklist", minutes: 5 },
      ].map((x, i, arr) =>
        i === arr.length - 1
          ? { ...x, minutes: Math.max(5, durationMinutes - arr.slice(0, -1).reduce((s, a) => s + a.minutes, 0)) }
          : x,
      ),
      stepByStepPlan: [
        "Run scenario-based pre-assessment and capture baseline",
        "Facilitate hands-on practice session",
        "Complete risk assessment matrix",
        "Capture assumptions and decisions",
        "Define success metrics and check-in milestones",
        "Run stakeholder alignment checkpoint",
        "Finalize checklist, owners, and milestones",
      ],
      estimatedTimePerStep: [
        { step: "Pre-assessment", minutes: 10 },
        { step: "Hands-on practice", minutes: 20 },
        { step: "Risk assessment", minutes: 10 },
        { step: "Assumptions and decisions", minutes: 15 },
        { step: "Success metrics and milestones", minutes: 15 },
        { step: "Stakeholder alignment", minutes: 10 },
        { step: "Checklist and closeout", minutes: 10 },
      ],
      materialsChecklist: [
        "Session brief template",
        "Hands-on exercise worksheet",
        "Risk matrix template",
        "Assumptions/decisions log template",
        "Success metrics tracker",
        "Action items tracker",
      ],
      successCriteria: [
        "Objective and constraints explicitly captured",
        "Hands-on tasks completed",
        "Risk mitigation actions assigned",
        "Check-in milestones with owners and dates defined",
      ],
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
