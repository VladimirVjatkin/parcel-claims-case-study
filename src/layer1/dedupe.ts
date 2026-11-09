// Před pravidly A/B slučuje řádky se stejným orderId a uchovává zjištěné rozpory.
// Přesná kopie, např. 120101, znamená jednu objednávku; u konfliktu se platný řádek nehádá.
import type { Order } from "../domain/types.js";

const ORDER_FIELDS: (keyof Order)[] = [
  "orderId", "orderNumber", "client", "carrier", "shippingMethod",
  "trackingNumber", "trackingUrl", "status", "createdAt", "packedAt",
  "shippedAt", "updatedAt",
];

export interface OrderGroup {
  orderId: string;
  order: Order;
  rowCount: number;
  conflicting: boolean;
  differingFields: string[];
}

// Porovnání po polích umožní referentovi vypsat, v čem si export odporuje.
export function dedupeOrders(rows: Order[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const row of rows) {
    const existing = groups.get(row.orderId);
    if (existing === undefined) {
      groups.set(row.orderId, {
        orderId: row.orderId, order: row, rowCount: 1,
        conflicting: false, differingFields: [],
      });
      continue;
    }
    existing.rowCount += 1;
    const differingFields: string[] = [];
    for (const field of ORDER_FIELDS) {
      // Rozdíly se sčítají i přes třetí a další řádek; dřívější konflikt nesmí zmizet.
      if (existing.differingFields.includes(field) || existing.order[field] !== row[field]) {
        differingFields.push(field);
      }
    }
    existing.differingFields = differingFields;
    existing.conflicting = differingFields.length > 0;
  }
  return Array.from(groups.values());
}
