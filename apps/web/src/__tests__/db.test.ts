import { describe, expect, it, vi } from "vitest";
import { idbDelete, idbGet, idbGetAll, idbPut } from "../core/db";

// ---------------------------------------------------------------------------
// Fake IndexedDB in-memory — đủ mặt cho core/db.ts
// (open + createObjectStore + transaction/objectStore + put/get/getAll/delete)
// ---------------------------------------------------------------------------

class FakeIDBRequest<T = unknown> {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  result: T = undefined as T;
  error: unknown = null;

  settle(result: T) {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }
}

interface StoreMeta {
  data: Map<string, unknown>;
  keyPath: string;
}

class FakeObjectStore {
  constructor(
    private meta: StoreMeta,
    private mode: "readonly" | "readwrite",
  ) {}

  private clone<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
  }

  put(value: unknown): FakeIDBRequest<string> {
    const req = new FakeIDBRequest<string>();
    const key = (value as Record<string, unknown>)[this.meta.keyPath] as string;
    this.meta.data.set(key, this.clone(value));
    req.settle(key);
    return req;
  }

  get(key: string): FakeIDBRequest<unknown> {
    const req = new FakeIDBRequest<unknown>();
    req.settle(this.meta.data.has(key) ? this.clone(this.meta.data.get(key)) : undefined);
    return req;
  }

  getAll(): FakeIDBRequest<unknown[]> {
    const req = new FakeIDBRequest<unknown[]>();
    req.settle([...this.meta.data.values()].map((v) => this.clone(v)));
    return req;
  }

  delete(key: string): FakeIDBRequest<void> {
    const req = new FakeIDBRequest<void>();
    if (this.mode === "readwrite") this.meta.data.delete(key);
    req.settle(undefined);
    return req;
  }
}

class FakeDatabase {
  private stores = new Map<string, StoreMeta>();

  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, options: { keyPath: string }): FakeObjectStore {
    const meta: StoreMeta = { data: new Map(), keyPath: options.keyPath };
    this.stores.set(name, meta);
    return new FakeObjectStore(meta, "readwrite");
  }

  transaction(name: string, mode: "readonly" | "readwrite"): { objectStore: () => FakeObjectStore } {
    const meta = this.stores.get(name);
    if (!meta) throw new Error("Unknown object store: " + name);
    return { objectStore: () => new FakeObjectStore(meta, mode) };
  }
}

const dbs = new Map<string, FakeDatabase>();
vi.stubGlobal(
  "indexedDB",
  {
    open(name: string, _version: number): unknown {
      const req = new FakeIDBRequest<FakeDatabase>();
      queueMicrotask(() => {
        let db = dbs.get(name);
        if (!db) {
          db = new FakeDatabase();
          dbs.set(name, db);
          req.result = db;
          req.onupgradeneeded?.();
        } else {
          req.result = db;
        }
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as typeof indexedDB,
);

describe("core/db (wrapper IndexedDB)", () => {
  it("put + get: lưu deep clone — sửa object gốc không ảnh hưởng giá trị đã lưu", async () => {
    // Arrange + Act
    const entry = { id: "q1", familyId: "f1", amount: 100 };
    await idbPut("expenses", entry);
    const got = (await idbGet("expenses", "q1")) as typeof entry;

    // Assert
    expect(got).toEqual(entry);

    // Sửa gốc — giá trị trong DB phải giữ nguyên (giống structured clone thật)
    entry.amount = 999;
    const again = (await idbGet("expenses", "q1")) as typeof entry;
    expect(again.amount).toBe(100);
  });

  it("getAll + delete trên store cache (keyPath 'key')", async () => {
    // Arrange + Act
    await idbPut("cache", { key: "k1", value: { total: 1 } });
    await idbPut("cache", { key: "k2", value: { total: 2 } });
    let all = (await idbGetAll("cache")) as Array<{ key: string }>;

    // Assert
    expect(all).toHaveLength(2);

    // Act
    await idbDelete("cache", "k1");
    all = (await idbGetAll("cache")) as Array<{ key: string }>;

    // Assert
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe("k2");
  });

  it("get key không tồn tại → undefined", async () => {
    // Act + Assert
    expect(await idbGet("expenses", "khong-ton-tai")).toBeUndefined();
  });
});
