import type { DynamicModule } from "@nestjs/common";
import { FinIntegrityClient, type FinIntegrityConfig } from "@fin-integrity/node";

/** Injection token if you prefer a token over the class. */
export const FIN_INTEGRITY_CLIENT = "FIN_INTEGRITY_CLIENT";

/**
 * NestJS module. Register once at the root:
 *
 * ```ts
 * @Module({ imports: [FinIntegrityModule.forRoot({ apiKey: process.env.FIN_INTEGRITY_KEY })] })
 * export class AppModule {}
 * ```
 *
 * Then inject the client anywhere:
 *
 * ```ts
 * constructor(private readonly fi: FinIntegrityClient) {}
 * ```
 *
 * Decorator-free (returns a global DynamicModule), so it needs no reflect-metadata setup.
 */
export class FinIntegrityModule {
  static forRoot(config: FinIntegrityConfig): DynamicModule {
    const client = new FinIntegrityClient(config);
    return {
      module: FinIntegrityModule,
      global: true,
      providers: [
        { provide: FinIntegrityClient, useValue: client },
        { provide: FIN_INTEGRITY_CLIENT, useValue: client },
      ],
      exports: [FinIntegrityClient, FIN_INTEGRITY_CLIENT],
    };
  }
}

export { FinIntegrityClient } from "@fin-integrity/node";
