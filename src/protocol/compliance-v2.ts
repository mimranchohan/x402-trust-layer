export type ComplianceAssessInput = {
  organizationId: string;
  agentId: string;
  jurisdiction?: string;
  monthlyVolumeUsdc?: number;
  rails?: string[];
  requiresKyc?: boolean;
};

export type ComplianceAssessResult = {
  allowed: boolean;
  amlRisk: "low" | "medium" | "high";
  kycRequired: boolean;
  auditTrailId: string;
  policyDecisions: string[];
  regulatoryReporting: { sarThresholdUsdc: number; ctrThresholdUsdc: number };
  forensicLogRef: string;
};

export function assessCompliance(input: ComplianceAssessInput): ComplianceAssessResult {
  const volume = input.monthlyVolumeUsdc ?? 0;
  const amlRisk: ComplianceAssessResult["amlRisk"] =
    volume > 10000 ? "high" : volume > 1000 ? "medium" : "low";
  const kycRequired = input.requiresKyc === true || volume > 5000;
  const allowed = amlRisk !== "high" || kycRequired;

  return {
    allowed,
    amlRisk,
    kycRequired,
    auditTrailId: `comp_${input.organizationId}_${Date.now().toString(36)}`,
    policyDecisions: [
      kycRequired ? "kyc_gate_required" : "kyc_optional",
      `aml_risk_${amlRisk}`,
      "ledger_export_via_compliance_ledger",
    ],
    regulatoryReporting: { sarThresholdUsdc: 5000, ctrThresholdUsdc: 10000 },
    forensicLogRef: `forensic://${input.organizationId}/${input.agentId}`,
  };
}
