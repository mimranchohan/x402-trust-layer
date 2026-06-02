import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data", "protocol");
const SAFE_STORE_NAME = /^[a-z0-9_-]{1,64}$/;

function assertSafeStoreName(name: string): void {
  if (!SAFE_STORE_NAME.test(name)) {
    throw new Error(`Invalid protocol store name: ${name}`);
  }
}

export async function readProtocolStore<T>(name: string, fallback: T): Promise<T> {
  assertSafeStoreName(name);
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeProtocolStore<T>(name: string, data: T): Promise<void> {
  assertSafeStoreName(name);
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}
