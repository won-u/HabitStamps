import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { env } from "../env";

/**
 * v1 auth: a single fixed device token shared by every client (docs/architecture.md
 * §1, §4-2). There is no user/account concept yet — this only proves the
 * request came from someone who knows the token. Swap this for JWT/OAuth in v2
 * without touching route handlers.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("preHandler", async (req, reply) => {
    const token = req.headers["x-device-token"];
    if (token !== env.DEVICE_AUTH_TOKEN) {
      reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "invalid or missing x-device-token" } });
    }
  });
});
