import { describe, it, expect, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { EventEnvelope, Transport } from "@fin-integrity/node";
import { FinIntegrityClient, FinIntegrityModule, FIN_INTEGRITY_CLIENT } from "../src/index.js";

class Capture implements Transport {
  sent: EventEnvelope[] = [];
  async send(batch: EventEnvelope[]): Promise<void> {
    this.sent.push(...batch);
  }
}

async function bootstrap(config: Parameters<typeof FinIntegrityModule.forRoot>[0]) {
  const moduleRef = await Test.createTestingModule({ imports: [FinIntegrityModule.forRoot(config)] }).compile();
  const app = await moduleRef.init();
  return app;
}

describe("FinIntegrityModule.forRoot", () => {
  it("returns a global module exporting both the class and the token", () => {
    const mod = FinIntegrityModule.forRoot({ dryRun: true });
    expect(mod.module).toBe(FinIntegrityModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual(expect.arrayContaining([FinIntegrityClient, FIN_INTEGRITY_CLIENT]));
  });

  it("resolves both providers to the SAME client — two would double-send every event", async () => {
    const t = new Capture();
    const app = await bootstrap({ transport: t, batch: { maxSize: 1 } });

    const byClass = app.get(FinIntegrityClient);
    const byToken = app.get<FinIntegrityClient>(FIN_INTEGRITY_CLIENT);
    expect(byToken).toBe(byClass);

    // Behavioral proof of a single instance: recording once through each handle
    // yields exactly two events, not four.
    byClass.processor.record({ type: "payment", reference: "o1", external_id: "ch_1", amount: { minor: 100, currency: "usd" } });
    byToken.processor.record({ type: "payment", reference: "o2", external_id: "ch_2", amount: { minor: 200, currency: "usd" } });
    await byClass.flush();
    expect(t.sent).toHaveLength(2);
    expect(t.sent.map((e) => e.external_id)).toEqual(["ch_1", "ch_2"]);

    await app.close();
  });

  it("passes config through to the client", async () => {
    const t = new Capture();
    const app = await bootstrap({ transport: t, batch: { maxSize: 1 }, environment: "staging" });

    app.get(FinIntegrityClient).processor.record({
      type: "payment",
      source: "stripe",
      reference: "order_7",
      external_id: "ch_7",
      amount: { minor: 4999, currency: "USD" },
    });
    await app.get(FinIntegrityClient).flush();

    // The configured transport received it: config reached the constructor.
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      side: "processor",
      event_type: "payment",
      reference: "order_7",
      external_id: "ch_7",
      amount: { minor: "4999", currency: "usd" },
    });

    await app.close();
  });

  it("does not construct a client until the module is bootstrapped", () => {
    const before = process.listenerCount("SIGTERM");
    // Defining the module many times must not spawn clients, flush intervals,
    // or stack process listeners — this used to happen at forRoot() call time.
    for (let i = 0; i < 12; i++) FinIntegrityModule.forRoot({ dryRun: true });
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});

describe("shutdown draining", () => {
  it("drains queued events on app.close() so SIGTERM cannot lose money events", async () => {
    const t = new Capture();
    // maxSize high + flushMs long: nothing flushes on its own, so anything that
    // arrives at the transport got there because shutdown drained the queue.
    const app = await bootstrap({ transport: t, batch: { maxSize: 500, flushMs: 60_000 } });

    app.get(FinIntegrityClient).processor.record({
      type: "payment",
      reference: "order_tail",
      external_id: "ch_tail",
      amount: { minor: 1234, currency: "usd" },
    });
    expect(t.sent).toHaveLength(0); // still queued

    await app.close();

    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ external_id: "ch_tail", amount: { minor: "1234", currency: "usd" } });
  });

  it("awaits the drain — close() does not resolve before the batch lands", async () => {
    let landed = false;
    const slow: Transport = {
      async send() {
        await new Promise((r) => setTimeout(r, 50));
        landed = true;
      },
    };
    const app = await bootstrap({ transport: slow, batch: { maxSize: 500, flushMs: 60_000 } });
    app.get(FinIntegrityClient).processor.record({
      type: "payment",
      reference: "o", external_id: "ch_slow", amount: { minor: 1, currency: "usd" },
    });

    await app.close();
    expect(landed).toBe(true); // a fire-and-forget flush would still be in flight here
  });

  it("stops the flush interval on shutdown", async () => {
    const app = await bootstrap({ dryRun: true, batch: { flushMs: 60_000 } });
    const client = app.get(FinIntegrityClient);
    const shutdown = vi.spyOn(client, "shutdown");
    await app.close();
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
