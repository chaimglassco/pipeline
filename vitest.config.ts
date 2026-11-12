import { defineConfig } from "vitest/config";
import path from "node:path";
const resolve={alias:{"@":path.resolve(__dirname,"./src")}};
export default defineConfig({resolve,test:{projects:[
  {resolve,test:{name:"browser",include:["src/**/*.test.{ts,tsx}"],exclude:["src/features/dashboard/server/*.test.ts"],environment:"jsdom",setupFiles:["./src/test/setup.ts"]}},
  {resolve,test:{name:"audit-server",include:["src/features/dashboard/server/*.test.ts"],environment:"node",testTimeout:20000,hookTimeout:30000}},
]}});
