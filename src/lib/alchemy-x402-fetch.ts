import { createPayment } from "@alchemy/x402";
import { request as httpsRequest } from "node:https";
import { paymentResponseFromHeaders } from "./payment-response.js";

export type AlchemyX402Result = {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  payment: ReturnType<typeof paymentResponseFromHeaders>;
  ok: boolean;
};

function rawHttpsPost(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function headersToFetchLike(h: Record<string, string | string[] | undefined>): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === "string") out.set(k, v);
    else if (Array.isArray(v)) out.set(k, v.join(", "));
  }
  return out;
}

function paymentRequiredFrom402(
  headers: Record<string, string | string[] | undefined>,
  bodyText: string,
): string {
  const header =
    (typeof headers["payment-required"] === "string" && headers["payment-required"]) ||
    (typeof headers["PAYMENT-REQUIRED"] === "string" && headers["PAYMENT-REQUIRED"]);
  if (header) return header;
  return Buffer.from(bodyText, "utf8").toString("base64");
}

/**
 * Pay Alchemy x402 gateway via raw HTTPS.
 * Node fetch rejects some x402 header names (e.g. Payment-Signature); use PAYMENT-SIGNATURE.
 */
export async function alchemyX402Pay(
  url: string,
  body: string,
  privateKey: string,
  siweToken?: string,
): Promise<AlchemyX402Result> {
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (siweToken) baseHeaders.authorization = `SIWE ${siweToken}`;

  const first = await rawHttpsPost(url, baseHeaders, body);
  if (first.status !== 402) {
    return {
      status: first.status,
      body: first.body,
      headers: first.headers,
      payment: paymentResponseFromHeaders(headersToFetchLike(first.headers)),
      ok: first.status >= 200 && first.status < 300,
    };
  }

  const paymentRequiredHeader = paymentRequiredFrom402(first.headers, first.body);
  const paymentSig = await createPayment({ privateKey, paymentRequiredHeader });

  const paid = await rawHttpsPost(
    url,
    {
      ...baseHeaders,
      "PAYMENT-SIGNATURE": paymentSig,
    },
    body,
  );

  const payment = paymentResponseFromHeaders(headersToFetchLike(paid.headers));
  const paidOk = paid.status >= 200 && paid.status < 300;
  const paymentSettled =
    payment?.raw != null && (payment.raw as { success?: boolean }).success === true;

  return {
    status: paid.status,
    body: paid.body,
    headers: paid.headers,
    payment,
    ok: paidOk || paymentSettled,
  };
}

export async function alchemyX402Fetch(
  url: string,
  init: RequestInit,
  privateKey: string,
): Promise<Response> {
  const body = typeof init.body === "string" ? init.body : "";
  const result = await alchemyX402Pay(url, body, privateKey);
  return new Response(result.body, {
    status: result.status,
    headers: headersToFetchLike(result.headers),
  });
}

export async function createAlchemyX402Fetch(privateKey: string): Promise<typeof fetch> {
  return async (input, init) => alchemyX402Fetch(String(input), init ?? {}, privateKey);
}

export const alchemyX402FetchOnce = alchemyX402Fetch;
