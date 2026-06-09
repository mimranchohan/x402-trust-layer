export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  suggestion?: string;
};

export function problemDetail(
  status: number,
  title: string,
  detail?: string,
  suggestion?: string,
): ProblemDetail {
  return {
    type: `https://x402trustlayer.xyz/errors/${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    status,
    detail,
    instance: undefined,
    suggestion,
  };
}

export function sendProblem(
  res: import("express").Response,
  status: number,
  title: string,
  detail?: string,
  suggestion?: string,
): void {
  const body = problemDetail(status, title, detail, suggestion);
  res.status(status).type("application/problem+json").json(body);
}
