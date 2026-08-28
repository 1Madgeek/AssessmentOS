import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace files from the repo root so workspace packages are included.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@assessment-os/ui",
    "@assessment-os/sdk",
    "@assessment-os/question-mcq",
    "@assessment-os/question-coding",
    "@assessment-os/question-sql",
    "@assessment-os/question-text",
    "@assessment-os/core",
  ],
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
