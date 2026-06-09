# x402 Agent Trust Protocol v4

**Version:** 4.0.0  
**Site:** https://x402trustlayer.xyz

## Overview

Protocol v4 adds 17 paid endpoints under `/api/protocol/*` plus free architecture, threat model, security audit, and metrics routes.

## Entry point (recommended)

```http
POST /api/protocol/pipeline/full-trust
```

Runs: passport issue → TrustScore v2 → fraud scan → oracle consensus → credit bureau → compliance → guard → replay binding.

## Layers

| Layer | Endpoints |
|-------|-----------|
| Identity | `POST /api/protocol/passport/issue`, `verify` |
| Trust | `POST /api/protocol/trust-score/v2`, `POST /api/protocol/oracle/consensus` |
| Fraud | `POST /api/protocol/fraud/scan` |
| Execution | `POST /api/protocol/execution/issue`, `verify` |
| Reasoning | `POST /api/protocol/reasoning/commit`, `disclose` |
| Escrow FSM | `POST /api/protocol/escrow/create`, `transition`, `status` |
| Replay | `POST /api/protocol/replay/bind`, `verify` + header `X-Trust-Replay-Binding` |
| ZK (simulated) | `POST /api/protocol/zk/prove` |
| Credit | `POST /api/protocol/credit/score` (300–900) |
| Compliance | `POST /api/protocol/compliance/assess` |

## Free discovery

- `GET /api/protocol/architecture`
- `GET /api/protocol/threat-model`
- `GET /api/protocol/security/audit`
- `GET /api/protocol/metrics`

## Escrow states

`CREATED → FUNDED → LOCKED → EXECUTING → DELIVERED → VERIFIED → SETTLED`  
Branches: `REFUNDED`, `DISPUTED`, `CANCELLED`

## Production upgrade path

1. Replace simulated ZK with Groth16 verifier contract  
2. Deploy trust oracle validator set on-chain  
3. Migrate `data/protocol/*.json` to Postgres  
4. Wire OpenTelemetry exporter to `protocol/observability` metrics  

## Storage

Protocol state: `data/protocol/*.json` (passports, escrows, receipts, fraud graph, replay bindings).
