import { createServer } from "node:net";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const port = Number(process.env.PORT ?? 3402);

console.log("--- x402-agent-suite doctor ---");
console.log("cwd:", process.cwd());
console.log(".env PAY_TO_ADDRESS:", process.env.PAY_TO_ADDRESS ? "set" : "MISSING");
console.log(".env NETWORK:", process.env.NETWORK ?? "(default base)");
console.log(".env PORT:", port);
console.log("");

const tester = createServer();
tester.once("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Port ${port} is IN USE — another app (or old server) is already running.`);
    console.log("  Try: curl http://127.0.0.1:" + port + "/health");
    console.log("  Or kill the old process and run: npm run dev");
  } else {
    console.error("Port check failed:", err.message);
  }
  process.exit(1);
});

tester.listen(port, "127.0.0.1", () => {
  console.log(`Port ${port} is FREE (nothing listening right now).`);
  console.log("");
  console.log("Start the server in a separate terminal and keep it open:");
  console.log("  npm run dev");
  console.log("");
  console.log("Then test:");
  console.log("  curl http://127.0.0.1:" + port + "/health");
  tester.close(() => process.exit(0));
});
