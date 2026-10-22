import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscriptions",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SubscriptionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
