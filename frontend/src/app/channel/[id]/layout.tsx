import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator Channel",
  description: "View creator profile and live video wallpaper uploads on Vion.",
};

export default function ChannelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
