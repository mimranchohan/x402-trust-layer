import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { signSiwe } from "@alchemy/x402";

dotenv.config();
const token = await signSiwe({ privateKey: process.env.EVM_PRIVATE_KEY! });
writeFileSync("scripts/.alchemy-siwe-token.txt", token, "utf8");
console.log("wrote token", token.length, "chars");
