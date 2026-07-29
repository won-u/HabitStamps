import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/data/local/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "expo",
});
