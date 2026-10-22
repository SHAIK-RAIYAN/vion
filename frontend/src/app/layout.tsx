import type { Metadata } from "next";
import { Inter, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { FontProvider } from "@/components/theme/FontProvider";
import { LenisProvider } from "@/providers/LenisProvider";
import { AuthProvider } from "@/context/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { CommandPalette } from "@/components/navigation/CommandPalette";
import { Toaster } from "sonner";
import {
  CurtainTransitionProvider,
  CurtainTransitionOverlay,
  Preloader,
} from "@/components/transitions";
import { ViewModeProvider } from "@/context/ViewModeContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vion.raiyan.app"),
  title: {
    default: "Vion — Free Video Wallpaper Library",
    template: "%s | Vion — Free Video Wallpaper Library",
  },
  description:
    "Vion is a free video wallpaper library. Discover, watch, and share high-quality live wallpapers and video backgrounds for desktop and mobile.",
  keywords: [
    "video wallpaper",
    "live wallpaper",
    "video backgrounds",
    "wallpaper engine alternative",
    "free wallpapers",
    "desktop wallpapers",
    "animated wallpapers",
    "4K wallpapers",
    "Vion",
    "wallpaper discovery",
  ],
  applicationName: "Vion",
  authors: [{ name: "Vion" }],
  creator: "Vion",
  publisher: "Vion",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://vion.raiyan.app",
    siteName: "Vion",
    title: "Vion — Free Video Wallpaper Library",
    description:
      "Vion is a free video wallpaper library. Discover, watch, and share high-quality live wallpapers and video backgrounds for desktop and mobile.",
    images: [
      {
        url: "https://vion.raiyan.app/og-vion.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Vion — Free Video Wallpaper Library",
      },
      {
        url: "https://vion.raiyan.app/vion.png",
        width: 1912,
        height: 942,
        type: "image/png",
        alt: "Vion Brand Asset",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vion — Free Video Wallpaper Library",
    description:
      "Vion is a free video wallpaper library. Discover, watch, and share high-quality live wallpapers and video backgrounds for desktop and mobile.",
    images: ["https://vion.raiyan.app/og-vion.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/vion.png", sizes: "1912x942", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: [
      { url: "/vion.png", sizes: "1912x942", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${outfit.variable} ${jakarta.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background text-foreground antialiased selection:bg-(--brand) selection:text-white"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LenisProvider>
            <CurtainTransitionProvider>
              <FontProvider>
                <AuthProvider>
                  <ViewModeProvider>
                    <CurtainTransitionOverlay />
                    <Preloader />
                    {children}
                    <AuthModal />
                    <CommandPalette />
                    <Toaster position="bottom-right" richColors theme="system" />
                  </ViewModeProvider>
                </AuthProvider>
              </FontProvider>
            </CurtainTransitionProvider>
          </LenisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
