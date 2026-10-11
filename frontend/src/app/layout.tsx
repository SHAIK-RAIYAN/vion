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
  title: "Vion — Independent Video Platform",
  description: "Original, high-performance content-focused video platform.",
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
        className="min-h-screen bg-background text-foreground antialiased selection:bg-[var(--brand)] selection:text-white"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LenisProvider>
            <FontProvider>
              <AuthProvider>
                {children}
                <AuthModal />
                <CommandPalette />
                <Toaster position="bottom-right" richColors theme="system" />
              </AuthProvider>
            </FontProvider>
          </LenisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
