/** Hosts that require SIWE/SIWS before x402 payment (401/403 is expected on bare probes). */
export const KNOWN_AGENTIC_GATEWAY_HOSTS = ["x402.alchemy.com"] as const;

export function isKnownAgenticGateway(host: string): boolean {
  const h = host.toLowerCase();
  return KNOWN_AGENTIC_GATEWAY_HOSTS.some((pattern) => h === pattern || h.endsWith(`.${pattern}`));
}

/** HTTP statuses that mean "auth/payment layer present" for SIWE-first gateways. */
export function isExpectedAgenticGatewayProbeStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 402;
}
