import type { Request, Response, NextFunction } from "express";

/** x402gle / Dexter host claim — set in Railway when verifying domain ownership */
export function x402gleChallengeToken(): string {
  return (process.env.X402GLE_CHALLENGE_TOKEN ?? "").trim();
}

export function registerX402gleHostVerification(app: import("express").Express): void {
  const token = x402gleChallengeToken();

  const serveToken = (_req: Request, res: Response) => {
    if (!token) {
      res.status(404).type("text/plain").send("X402GLE_CHALLENGE_TOKEN not configured");
      return;
    }
    res.type("text/plain").send(token);
  };

  const serveJson = (_req: Request, res: Response) => {
    if (!token) {
      res.status(404).json({ error: "X402GLE_CHALLENGE_TOKEN not configured" });
      return;
    }
    res.json({ challenge: token });
  };

  app.get("/.well-known/x402-host-challenge", serveToken);
  app.get("/.well-known/x402gle-challenge", serveToken);
  app.get("/.well-known/x402-host-challenge.txt", serveToken);
  app.get("/.well-known/x402gle-challenge.txt", serveToken);
  app.get("/.well-known/x402-host-challenge.json", serveJson);
  app.get("/.well-known/x402gle-challenge.json", serveJson);
}
