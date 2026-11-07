import { db } from "@infinitunes/db";
import { appRouter } from "@infinitunes/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { getSession } from "~/lib/auth";
import { cachedApi } from "~/lib/cached-api";
import { sonataSettlementService } from "~/lib/sonata/settlement";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => ({
      db,
      session: await getSession(),
      catalogApi: cachedApi,
      sonataSettlement: sonataSettlementService,
    }),
  });
}

export { handler as GET, handler as POST, handler as OPTIONS };
