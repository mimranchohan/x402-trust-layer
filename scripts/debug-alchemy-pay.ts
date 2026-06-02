import dotenv from "dotenv";
import { request } from "undici";
import { createPayment, signSiwe } from "@alchemy/x402";

dotenv.config();
const key = process.env.EVM_PRIVATE_KEY!;
const body = JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 });
const url = "https://x402.alchemy.com/base-mainnet/v2";

const siwe = await signSiwe({ privateKey: key });

const r1 = await request(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});
const t1 = await r1.body.text();
const pr =
  (r1.headers["payment-required"] as string) ??
  (r1.headers["PAYMENT-REQUIRED"] as string) ??
  Buffer.from(t1, "utf8").toString("base64");
const sig = await createPayment({ privateKey: key, paymentRequiredHeader: pr });

const r2 = await request(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `SIWE ${siwe}`,
    "PAYMENT-SIGNATURE": String(sig),
  },
  body,
});
const t2 = await r2.body.text();
console.log("undici auth+pay", r2.statusCode, t2.slice(0, 300));
console.log("payment-response", !!r2.headers["payment-response"]);
