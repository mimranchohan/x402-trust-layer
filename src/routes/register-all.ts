import type { Express, RequestHandler } from "express";
import { type RouteContext, type PaidFn, type AsyncRoute } from "./shared.js";
import { registerProtocolRoutes } from "../routes-protocol.js";

import { registerGuardRoutes } from "./guard-routes.js";
import { registerAttestationRoutes } from "./attestation-routes.js";
import { registerComplianceRoutes } from "./compliance-routes.js";
import { registerSettlementRoutes } from "./settlement-routes.js";
import { registerAlchemyRoutes } from "./alchemy-routes.js";
import { registerSolanaRoutes } from "./solana-routes.js";
import { registerOtherRoutes } from "./other-routes.js";

export function registerRoutes(
  app: Express,
  paid: PaidFn,
  asyncRoute: AsyncRoute,
): Map<string, RequestHandler> {
  const ctx: RouteContext = { app, paid, asyncRoute, postHandlers: new Map() };

  registerGuardRoutes(ctx);
  registerAttestationRoutes(ctx);
  registerComplianceRoutes(ctx);
  registerSettlementRoutes(ctx);
  registerAlchemyRoutes(ctx);
  registerSolanaRoutes(ctx);
  registerOtherRoutes(ctx);

  registerProtocolRoutes(app, paid, asyncRoute);

  return ctx.postHandlers;
}
