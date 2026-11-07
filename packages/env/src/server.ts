import { createEnv } from "@t3-oss/env-core";

import { serverSchema } from "./schema";

export type ServerEnv = ReturnType<typeof createServerEnv>;

export interface ServerEnvOptions {
  runtimeEnv: Record<string, string | undefined>;
  skipValidation?: boolean;
  emptyStringAsUndefined?: boolean;
}

/**
 * Validates the server-only Sonata variables. Import this from server code
 * only; the schema deliberately has no `NEXT_PUBLIC_` keys.
 */
export function createServerEnv(options: ServerEnvOptions) {
  const {
    runtimeEnv,
    skipValidation = false,
    emptyStringAsUndefined = true,
  } = options;

  return createEnv({
    skipValidation,
    emptyStringAsUndefined,
    server: serverSchema,
    runtimeEnv,
  });
}
