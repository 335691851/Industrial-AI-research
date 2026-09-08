import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@langchain/langgraph-checkpoint-postgres", "pg"],
  poweredByHeader: false,
};
export default config;
