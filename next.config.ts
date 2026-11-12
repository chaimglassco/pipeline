import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  basePath: "/ppc",
};

export default withWorkflow(nextConfig);
