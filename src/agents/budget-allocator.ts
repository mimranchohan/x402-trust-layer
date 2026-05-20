export type FleetAgent = {
  agentId: string;
  priority: number;
  requestedUsdc: number;
  dailyRemainingUsdc: number;
};

export type BudgetAllocatorInput = {
  fleetId: string;
  poolRemainingUsdc: number;
  agents: FleetAgent[];
};

export type Allocation = {
  agentId: string;
  allocatedUsdc: number;
  approved: boolean;
  reason: string;
};

export type BudgetAllocatorResult = {
  fleetId: string;
  poolRemainingUsdc: number;
  poolAfterUsdc: number;
  allocations: Allocation[];
};

export function runBudgetAllocator(input: BudgetAllocatorInput): BudgetAllocatorResult {
  const sorted = [...input.agents].sort((a, b) => b.priority - a.priority);
  let pool = input.poolRemainingUsdc;
  const allocations: Allocation[] = [];

  for (const agent of sorted) {
    const cap = Math.min(agent.requestedUsdc, agent.dailyRemainingUsdc);
    if (pool >= cap && cap > 0) {
      allocations.push({
        agentId: agent.agentId,
        allocatedUsdc: cap,
        approved: true,
        reason: "Approved within fleet pool and agent daily cap",
      });
      pool -= cap;
    } else {
      allocations.push({
        agentId: agent.agentId,
        allocatedUsdc: 0,
        approved: false,
        reason: pool <= 0 ? "Fleet pool exhausted" : "Exceeds daily remaining or pool",
      });
    }
  }

  return {
    fleetId: input.fleetId,
    poolRemainingUsdc: input.poolRemainingUsdc,
    poolAfterUsdc: Number(pool.toFixed(4)),
    allocations,
  };
}
