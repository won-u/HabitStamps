import Fastify from "fastify";
import { env } from "./env";
import { authPlugin } from "./plugins/auth";
import { habitRoutes } from "./routes/habits";
import { checkInRoutes } from "./routes/checkins";
import { syncRoutes } from "./routes/sync";

const app = Fastify({ logger: true });

// Unauthenticated — used by docker-compose's healthcheck and by `curl` smoke tests.
app.get("/health", async () => ({ status: "ok" }));

app.register(
  async (api) => {
    await api.register(authPlugin);
    await api.register(habitRoutes);
    await api.register(checkInRoutes);
    await api.register(syncRoutes);
  },
  { prefix: "/api/v1" },
);

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  reply.code(err.statusCode ?? 500).send({ error: { code: "INTERNAL_ERROR", message: err.message } });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
