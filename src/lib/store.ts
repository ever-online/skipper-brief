import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { OrderRecord } from "@/types";

const STORE_PATH = join(process.cwd(), "data", "store.json");

interface StoreData {
  orders: Record<string, OrderRecord>;
  byEurdCode: Record<string, string>;
}

function load(): StoreData {
  if (!existsSync(STORE_PATH)) return { orders: {}, byEurdCode: {} };
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreData;
  } catch {
    return { orders: {}, byEurdCode: {} };
  }
}

function save(data: StoreData): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export const store = {
  set(record: OrderRecord): void {
    const data = load();
    data.orders[record.id] = record;
    data.byEurdCode[record.eurdPaymentRequestCode] = record.id;
    save(data);
  },

  get(id: string): OrderRecord | undefined {
    return load().orders[id];
  },

  getByEurdCode(eurdCode: string): OrderRecord | undefined {
    const data = load();
    const id = data.byEurdCode[eurdCode];
    return id ? data.orders[id] : undefined;
  },

  update(id: string, patch: Partial<OrderRecord>): OrderRecord | undefined {
    const data = load();
    const existing = data.orders[id];
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    data.orders[id] = updated;
    save(data);
    return updated;
  },

  prune(): void {
    const data = load();
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let changed = false;
    Object.entries(data.orders).forEach(([id, record]) => {
      if (record.createdAt < cutoff && record.status === "pending") {
        data.orders[id] = { ...record, status: "expired" };
        changed = true;
      }
    });
    if (changed) save(data);
  },
};

setInterval(() => store.prune(), 10 * 60 * 1000);
