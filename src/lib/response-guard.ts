import type { Response } from "express";

const LOCKED = Symbol("x402ResponseLocked");

export function lockResponse(res: Response): void {
  (res as Response & { [LOCKED]?: boolean })[LOCKED] = true;
}

export function isResponseLocked(res: Response): boolean {
  return res.headersSent || (res as Response & { [LOCKED]?: boolean })[LOCKED] === true;
}

/** Prevent ERR_HTTP_HEADERS_SENT when a timeout 504 races with x402 402. */
export function guardResponseWrites(res: Response): void {
  const origJson = res.json.bind(res);
  const origStatus = res.status.bind(res);
  const origSend = res.send.bind(res);
  const origSetHeader = res.setHeader.bind(res);
  const origEnd = res.end.bind(res);

  res.status = ((code: number) => {
    if (isResponseLocked(res)) return res;
    return origStatus(code);
  }) as typeof res.status;

  res.setHeader = ((name, value) => {
    if (isResponseLocked(res)) return res;
    return origSetHeader(name, value);
  }) as typeof res.setHeader;

  res.json = ((body?: unknown) => {
    if (isResponseLocked(res)) return res;
    return origJson(body);
  }) as typeof res.json;

  res.send = ((body?: unknown) => {
    if (isResponseLocked(res)) return res;
    return origSend(body);
  }) as typeof res.send;

  res.end = ((...args: Parameters<typeof res.end>) => {
    if (isResponseLocked(res)) return res;
    return origEnd(...args);
  }) as typeof res.end;
}
