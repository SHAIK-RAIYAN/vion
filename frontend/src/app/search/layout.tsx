import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discover Wallpapers",
  description:
    "Explore, discover, and search high-resolution live wallpapers and video backgrounds across moods, styles, and categories on Vion.",
  alternates: {
    canonical: "/search",
  },
  openGraph: {
    title: "Discover Wallpapers | Vion — Free Video Wallpaper Library",
    description:
      "Explore, discover, and search high-resolution live wallpapers and video backgrounds across moods, styles, and categories on Vion.",
    url: "https://vion.raiyan.app/search",
    images: [
      {
        url: "https://vion.raiyan.app/og-vion.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Vion Wallpaper Discovery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Discover Wallpapers | Vion — Free Video Wallpaper Library",
    description:
      "Explore, discover, and search high-resolution live wallpapers and video backgrounds across moods, styles, and categories on Vion.",
    images: ["https://vion.raiyan.app/og-vion.png"],
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
