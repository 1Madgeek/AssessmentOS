import type { MetadataRoute } from "next";

/** Assessment portals are private — disallow all crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
