import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@assessment-os/ui",
    "@assessment-os/sdk",
    "@assessment-os/question-mcq",
    "@assessment-os/question-coding",
    "@assessment-os/core",
  ],
  reactStrictMode: true,
};

export default nextConfig;
