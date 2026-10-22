import React, { Suspense } from "react";
import type { Metadata } from "next";
import { WatchContent } from "./WatchContent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const canonicalUrl = `/watch/${id}`;

  try {
    const apiUrl =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000/api/v1";
    const res = await fetch(`${apiUrl}/videos/${id}`, {
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const payload = await res.json();
      const video = payload?.data;
      if (video) {
        const isRestricted =
          video.visibility === "PRIVATE" || video.visibility === "UNLISTED";
        const title = video.title || "Video Wallpaper";
        const description =
          video.description?.trim() ||
          `Watch and download "${title}" live video wallpaper on Vion.`;
        const previewImage = video.thumbnailUrl || "/og-vion.png";

        return {
          title,
          description,
          alternates: {
            canonical: canonicalUrl,
          },
          robots: isRestricted
            ? { index: false, follow: false }
            : { index: true, follow: true },
          openGraph: {
            title: `${title} | Vion — Free Video Wallpaper Library`,
            description,
            url: `https://vion.raiyan.app${canonicalUrl}`,
            type: "video.other",
            images: [
              {
                url: previewImage,
                alt: title,
              },
            ],
          },
          twitter: {
            card: "summary_large_image",
            title: `${title} | Vion — Free Video Wallpaper Library`,
            description,
            images: [previewImage],
          },
        };
      }
    }
  } catch {
    // Graceful fallback if backend is waking up or during SSG build
  }

  return {
    title: "Watch Wallpaper",
    description:
      "Watch, preview, and download high-quality live video wallpapers on Vion.",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: "Watch Wallpaper | Vion — Free Video Wallpaper Library",
      description:
        "Watch, preview, and download high-quality live video wallpapers on Vion.",
      url: `https://vion.raiyan.app${canonicalUrl}`,
      images: [
        {
          url: "https://vion.raiyan.app/og-vion.png",
          width: 1200,
          height: 630,
          alt: "Vion Live Video Wallpaper",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Watch Wallpaper | Vion — Free Video Wallpaper Library",
      description:
        "Watch, preview, and download high-quality live video wallpapers on Vion.",
      images: ["https://vion.raiyan.app/og-vion.png"],
    },
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-4 animate-pulse">
          <div className="aspect-video w-full rounded-2xl bg-muted" />
          <div className="h-6 bg-muted rounded w-3/4" />
        </div>
      }
    >
      <WatchContent id={id} />
    </Suspense>
  );
}
