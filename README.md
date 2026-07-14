# @fin-integrity/nestjs

NestJS module for [**fin-integrity**](https://github.com/HatemSaadallah/fin-integrity-node) — _reconciliation-as-you-code_. Register once and inject the core [`@fin-integrity/node`](https://github.com/HatemSaadallah/fin-integrity-node) client anywhere via Nest DI.

## Install

```bash
npm install @fin-integrity/node @fin-integrity/nestjs
```

## Usage

Register at the root:

```ts
import { Module } from "@nestjs/common";
import { FinIntegrityModule } from "@fin-integrity/nestjs";

@Module({
  imports: [FinIntegrityModule.forRoot({ apiKey: process.env.FIN_INTEGRITY_KEY })],
})
export class AppModule {}
```

Inject the client in any provider:

```ts
import { Injectable } from "@nestjs/common";
import { FinIntegrityClient } from "@fin-integrity/node";

@Injectable()
export class BillingService {
  constructor(private readonly fi: FinIntegrityClient) {}

  onCharge(orderId: string, chargeId: string, minor: number) {
    this.fi.processor.record({
      type: "payment", source: "stripe", reference: orderId,
      external_id: chargeId, amount: { minor, currency: "usd" },
    });
  }

  onLedgerPosting(orderId: string, entryId: string, minor: number) {
    this.fi.ledger.record({
      type: "payment", reference: orderId, external_id: entryId,
      amount: { minor, currency: "usd" },
    });
  }
}
```

The module is `global`, so you only import it once. Use the `FinIntegrityClient` class as the injection token (or the exported `FIN_INTEGRITY_CLIENT` token).

## License

[MIT](./LICENSE) © fin-integrity
