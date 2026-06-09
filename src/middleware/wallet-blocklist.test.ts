import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Pure in-memory db mock — no native SQLite bindings needed
// ---------------------------------------------------------------------------

type BlockRow = {
  address: string;
  reason: string | null;
  blocked_at: string;
  blocked_by: string | null;
};

// In-memory store shared across all prepared-statement calls
const _store = new Map<string, BlockRow>();

function makeDb() {
  return {
    exec: vi.fn(), // CREATE TABLE — no-op
    prepare: (sql: string) => {
      const S = sql.trim().toUpperCase();

      if (S.startsWith("SELECT 1")) {
        // isBlocked probe
        return {
          get: (addr: string) => (_store.has(addr) ? { 1: 1 } : undefined),
        };
      }

      if (S.startsWith("INSERT OR REPLACE")) {
        // addToBlocklist insert
        return {
          run: (addr: string, reason: string | null, blocked_at: string, blocked_by: string | null) => {
            _store.set(addr, { address: addr, reason, blocked_at, blocked_by });
            return { changes: 1 };
          },
        };
      }

      if (S.startsWith("SELECT * FROM WALLET_BLOCKLIST WHERE ADDRESS")) {
        // rowToWallet fetch after insert
        return {
          get: (addr: string) => _store.get(addr),
        };
      }

      if (S.startsWith("DELETE")) {
        // removeFromBlocklist
        return {
          run: (addr: string) => {
            const existed = _store.has(addr);
            _store.delete(addr);
            return { changes: existed ? 1 : 0 };
          },
        };
      }

      if (S.startsWith("SELECT * FROM WALLET_BLOCKLIST ORDER")) {
        // listBlocklist — ORDER BY blocked_at DESC LIMIT ? OFFSET ?
        return {
          all: (limit: number, offset: number) => {
            const rows = [..._store.values()].sort((a, b) =>
              b.blocked_at.localeCompare(a.blocked_at),
            );
            return rows.slice(offset, offset + limit);
          },
        };
      }

      if (S.startsWith("SELECT COUNT")) {
        // countBlocklist
        return {
          get: () => ({ n: _store.size }),
        };
      }

      // Fallback (should not be reached in tests)
      return { get: vi.fn(), run: vi.fn(), all: vi.fn().mockReturnValue([]) };
    },
  };
}

vi.mock("../lib/db.js", () => ({ db: makeDb() }));

vi.mock("../lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  isBlocked,
  addToBlocklist,
  removeFromBlocklist,
  listBlocklist,
  countBlocklist,
  walletBlocklistMiddleware,
  type BlockedWallet,
} from "./wallet-blocklist.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeMockReq(opts: {
  header?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  path?: string;
} = {}) {
  return {
    headers: opts.header ? { "x-wallet-address": opts.header } : {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    path: opts.path ?? "/api/test",
  };
}

function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

// Clean up store between tests
afterEach(() => {
  _store.clear();
});

// ---------------------------------------------------------------------------
// isBlocked
// ---------------------------------------------------------------------------

describe("isBlocked", () => {
  it("returns false for address not in blocklist", () => {
    expect(isBlocked(ADDR_A)).toBe(false);
  });

  it("returns true after address is added", () => {
    addToBlocklist(ADDR_A);
    expect(isBlocked(ADDR_A)).toBe(true);
  });

  it("is case-insensitive — stores/checks lowercase", () => {
    addToBlocklist(ADDR_A.toUpperCase());
    expect(isBlocked(ADDR_A)).toBe(true);
  });

  it("returns false after address is removed", () => {
    addToBlocklist(ADDR_A);
    removeFromBlocklist(ADDR_A);
    expect(isBlocked(ADDR_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addToBlocklist
// ---------------------------------------------------------------------------

describe("addToBlocklist", () => {
  it("returns a BlockedWallet with correct fields", () => {
    const entry: BlockedWallet = addToBlocklist(ADDR_A, { reason: "fraud", blockedBy: "admin" });
    expect(entry.address).toBe(ADDR_A);
    expect(entry.reason).toBe("fraud");
    expect(entry.blockedBy).toBe("admin");
    expect(typeof entry.blockedAt).toBe("string");
    expect(entry.blockedAt.length).toBeGreaterThan(0);
  });

  it("stores null reason when none provided", () => {
    const entry = addToBlocklist(ADDR_A);
    expect(entry.reason).toBeNull();
  });

  it("upserts — re-adding same address overwrites reason", () => {
    addToBlocklist(ADDR_A, { reason: "old" });
    const updated = addToBlocklist(ADDR_A, { reason: "new" });
    expect(updated.reason).toBe("new");
    expect(countBlocklist()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeFromBlocklist
// ---------------------------------------------------------------------------

describe("removeFromBlocklist", () => {
  it("returns true when address removed", () => {
    addToBlocklist(ADDR_A);
    expect(removeFromBlocklist(ADDR_A)).toBe(true);
  });

  it("returns false when address not on list", () => {
    expect(removeFromBlocklist(ADDR_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listBlocklist / countBlocklist
// ---------------------------------------------------------------------------

describe("listBlocklist / countBlocklist", () => {
  it("returns empty list when no entries", () => {
    expect(listBlocklist()).toEqual([]);
    expect(countBlocklist()).toBe(0);
  });

  it("returns entries sorted by blockedAt DESC", () => {
    // Insert directly with known distinct timestamps to avoid same-ms flakiness
    _store.set(ADDR_A, {
      address: ADDR_A, reason: "first",
      blocked_at: "2024-01-01T00:00:00.000Z", blocked_by: null,
    });
    _store.set(ADDR_B, {
      address: ADDR_B, reason: "second",
      blocked_at: "2024-01-02T00:00:00.000Z", blocked_by: null,
    });
    const entries = listBlocklist();
    expect(entries).toHaveLength(2);
    // ADDR_B has later timestamp → first in DESC order
    expect(entries[0].address).toBe(ADDR_B);
    expect(entries[1].address).toBe(ADDR_A);
  });

  it("respects limit and offset", () => {
    addToBlocklist(ADDR_A);
    addToBlocklist(ADDR_B);
    const first = listBlocklist(1, 0);
    const second = listBlocklist(1, 1);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].address).not.toBe(second[0].address);
  });

  it("countBlocklist reflects current size", () => {
    addToBlocklist(ADDR_A);
    addToBlocklist(ADDR_B);
    expect(countBlocklist()).toBe(2);
    removeFromBlocklist(ADDR_A);
    expect(countBlocklist()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// walletBlocklistMiddleware
// ---------------------------------------------------------------------------

describe("walletBlocklistMiddleware", () => {
  const next = vi.fn();
  const middleware = walletBlocklistMiddleware();

  beforeEach(() => {
    next.mockClear();
  });

  it("calls next() when no wallet present in request", () => {
    const req = makeMockReq();
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when wallet is not on blocklist", () => {
    const req = makeMockReq({ header: ADDR_A });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 and skips next() for blocked wallet via header", () => {
    addToBlocklist(ADDR_A);
    const req = makeMockReq({ header: ADDR_A });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/blocklist/i) }),
    );
  });

  it("resolves wallet from req.body.walletAddress", () => {
    addToBlocklist(ADDR_A);
    const req = makeMockReq({ body: { walletAddress: ADDR_A } });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("resolves wallet from req.query.wallet as fallback", () => {
    addToBlocklist(ADDR_A);
    const req = makeMockReq({ query: { wallet: ADDR_A } });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("header takes priority over body — non-blocked header passes through even if body is blocked", () => {
    addToBlocklist(ADDR_B);
    const req = makeMockReq({ header: ADDR_A, body: { walletAddress: ADDR_B } });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("is case-insensitive — blocks uppercase address stored as lowercase", () => {
    addToBlocklist(ADDR_A);
    const req = makeMockReq({ header: ADDR_A.toUpperCase() });
    const res = mockRes();
    middleware(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("includes wallet address in 403 response body", () => {
    addToBlocklist(ADDR_A);
    const req = makeMockReq({ header: ADDR_A });
    const res = mockRes();
    middleware(req as never, res as never, next);
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, string>;
    expect(call.wallet).toBeDefined();
  });
});
