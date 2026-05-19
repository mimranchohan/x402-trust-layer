import { getSpentToday, recordSpend } from "../lib/ledger.js";
import { hostOf } from "../lib/probe.js";
import type { SpendGovernorInput, SpendGovernorResult } from "../types.js";

export async function runSpendGovernor(input: SpendGovernorInput): Promise<SpendGovernorResult> {
  const { agentId, estimatedCostUsdc, targetUrl, network, policy } = input;
  const spentTodayUsdc = await getSpentToday(agentId);
  const remainingDailyUsdc = Math.max(0, policy.dailyCapUsdc - spentTodayUsdc);

  if (estimatedCostUsdc > policy.perCallCapUsdc) {
    return {
      allowed: false,
      reason: `Estimated cost $${estimatedCostUsdc} exceeds per-call cap $${policy.perCallCapUsdc}`,
      spentTodayUsdc,
      remainingDailyUsdc,
      perCallCapUsdc: policy.perCallCapUsdc,
    };
  }

  if (spentTodayUsdc + estimatedCostUsdc > policy.dailyCapUsdc) {
    return {
      allowed: false,
      reason: `Would exceed daily cap ($${policy.dailyCapUsdc}). Spent today: $${spentTodayUsdc.toFixed(4)}`,
      spentTodayUsdc,
      remainingDailyUsdc,
      perCallCapUsdc: policy.perCallCapUsdc,
    };
  }

  if (targetUrl) {
    const host = hostOf(targetUrl);
    if (host && policy.blockedHosts?.some((h) => host.includes(h.toLowerCase()))) {
      return {
        allowed: false,
        reason: `Host ${host} is blocked by policy`,
        spentTodayUsdc,
        remainingDailyUsdc,
        perCallCapUsdc: policy.perCallCapUsdc,
      };
    }
    if (
      host &&
      policy.allowedHosts &&
      policy.allowedHosts.length > 0 &&
      !policy.allowedHosts.some((h) => host.includes(h.toLowerCase()))
    ) {
      return {
        allowed: false,
        reason: `Host ${host} not in allowlist`,
        spentTodayUsdc,
        remainingDailyUsdc,
        perCallCapUsdc: policy.perCallCapUsdc,
      };
    }
  }

  if (network && policy.allowedNetworks && policy.allowedNetworks.length > 0) {
    const ok = policy.allowedNetworks.some((n) => network.toLowerCase().includes(n.toLowerCase()));
    if (!ok) {
      return {
        allowed: false,
        reason: `Network ${network} not allowed`,
        spentTodayUsdc,
        remainingDailyUsdc,
        perCallCapUsdc: policy.perCallCapUsdc,
      };
    }
  }

  await recordSpend(agentId, estimatedCostUsdc);

  return {
    allowed: true,
    reason: "Within daily and per-call limits",
    spentTodayUsdc: spentTodayUsdc + estimatedCostUsdc,
    remainingDailyUsdc: remainingDailyUsdc - estimatedCostUsdc,
    perCallCapUsdc: policy.perCallCapUsdc,
  };
}
