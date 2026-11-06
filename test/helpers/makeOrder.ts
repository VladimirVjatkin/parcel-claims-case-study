import type { Complaint, Order } from "../../src/domain/types.js";
import type { RulesContext } from "../../src/layer1/rules.js";
import { DEFAULT_RUN_MOMENT } from "../../src/config.js";

export const NOW = new Date(DEFAULT_RUN_MOMENT);

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "order-1", orderNumber: "MS-test-1", client: "Testovací klient",
    carrier: "Kurýr Vltava", shippingMethod: "Kurýr Vltava Standard",
    trackingNumber: "KV-test-1", trackingUrl: "https://tracking.example/KV-test-1",
    status: "waiting_for_carrier", createdAt: "2026-10-01T10:00:00+02:00",
    packedAt: "2026-10-30T10:00:00+01:00", shippedAt: "2026-10-19T10:00:00+02:00",
    updatedAt: "2026-11-01T10:00:00+01:00",
    ...overrides,
  };
}

export function makeContext(overrides: Partial<RulesContext> = {}): RulesContext {
  return {
    rules: {
      A: {
        name: "nevyzvednuto dopravcem", status: "waiting_for_carrier", minDaysInStatus: 2,
        complaintReason: "not_collected_by_carrier", excludedShippingMethods: ["Interní přeprava"],
      },
      B: {
        name: "ztráta v přepravě", status: "carrier_picked_up", minDaysInStatus: 14,
        complaintReason: "loss",
        excludedShippingMethods: ["Interní přeprava", "Parcelo DE", "Parcelo International", "Parcelo Return DE", "Marketplace Delivered"],
      },
    },
    complaints: [], returns: [],
    reporterMatrix: [{ client: "Testovací klient", reporterEmail: "reporter@example.test" }],
    ...overrides,
  };
}

export function makeComplaint(overrides: Partial<Complaint> = {}): Complaint {
  return {
    complaintId: "complaint-1", orderNumber: "another-order", client: "Testovací klient",
    status: "closed", reason: "damaged", reporter: "history@example.test",
    createdAt: "2026-10-01T10:00:00+02:00", ...overrides,
  };
}
