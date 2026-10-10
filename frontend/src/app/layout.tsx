import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { FontProvider } from "@/components/theme/FontProvider";
import { AuthProvider } from "@/context/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { CommandPalette } from "@/components/navigation/CommandPalette";
import { Toaster } from "sonner";

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
    <html lang="en" suppressHydrationWarning>
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
          <FontProvider>
            <AuthProvider>
              {children}
              <AuthModal />
              <CommandPalette />
              <Toaster position="bottom-right" richColors theme="system" />
            </AuthProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
