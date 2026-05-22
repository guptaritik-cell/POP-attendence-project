import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "POP Attendance",
  description: "POP Private Limited · Internal HR Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-[#0F0F13] font-sans antialiased">
        <Providers>
          <TooltipProvider delayDuration={300}>
            {children}
          </TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#1A1A24",
                border: "1px solid rgba(124,58,237,0.3)",
                color: "#F1F0F5",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
