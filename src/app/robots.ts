import type { MetadataRoute } from "next";

const SITE_URL = "https://opentide.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /api is data-only; /widget is the embeddable iframe view (noindex).
      disallow: ["/api/", "/widget"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
