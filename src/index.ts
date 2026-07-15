import type { DynamicModule, Provider } from "@nestjs/common";
import { FinIntegrityClient, type FinIntegrityConfig } from "@fin-integrity/node";

/** Injection token if you prefer a token over the class. */
export const FIN_INTEGRITY_CLIENT = "FIN_INTEGRITY_CLIENT";

/** Internal: the provider that drains the client on application shutdown. */
const FIN_INTEGRITY_SHUTDOWN = "FIN_INTEGRITY_SHUTDOWN";

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
 * Call `app.enableShutdownHooks()` in `main.ts` so queued money events are
 * drained on SIGTERM rather than dropped — see `onApplicationShutdown` below.
 *
 * Decorator-free (returns a global DynamicModule), so it needs no reflect-metadata setup.
 */
export class FinIntegrityModule {
  static forRoot(config: FinIntegrityConfig): DynamicModule {
    // Built lazily by Nest at bootstrap rather than here at module-definition
    // time: the client starts a flush interval and registers process listeners
    // in its constructor, so eagerly constructing it would do that even for a
    // module that is only ever imported (a test, a CLI, a config dump) and
    // never bootstrapped — and once per `forRoot()` call, which stacks up
    // process listeners. It also means a bad config throws at bootstrap, where
    // Nest can report it, instead of at import time.
    const providers: Provider[] = [
      { provide: FinIntegrityClient, useFactory: () => new FinIntegrityClient(config) },
      // useExisting, not a second factory: both must resolve to the SAME client,
      // otherwise every event is captured twice — once per client instance.
      { provide: FIN_INTEGRITY_CLIENT, useExisting: FinIntegrityClient },
      {
        provide: FIN_INTEGRITY_SHUTDOWN,
        // A plain value provider carrying a lifecycle hook — Nest calls hooks on
        // any provider instance that has them, which keeps this decorator-free.
        useFactory: (client: FinIntegrityClient) => ({
          // Nest awaits this, so the final batch actually lands before the
          // process exits. The SDK's own SIGTERM handler is a fire-and-forget
          // flush and only covers signals — not `app.close()`.
          onApplicationShutdown: () => client.shutdown(),
        }),
        inject: [FinIntegrityClient],
      },
    ];

    return {
      module: FinIntegrityModule,
      global: true,
      providers,
      exports: [FinIntegrityClient, FIN_INTEGRITY_CLIENT],
    };
  }
}

export { FinIntegrityClient } from "@fin-integrity/node";
