import type { MetadataRoute } from "next";

const SITE_URL = "https://opentide.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/news`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/buzz`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
  ];
}
