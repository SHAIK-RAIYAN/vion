import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/search", "/watch/", "/channel/"],
        disallow: [
          "/api/",
          "/history",
          "/subscriptions",
          "/settings",
          "/studio",
        ],
      },
    ],
    sitemap: "https://vion.raiyan.app/sitemap.xml",
  };
}
