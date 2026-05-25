import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const awesomeSerif = localFont({
  src: [
    {
      path: "../../public/fonts/AwesomeSerifItalic/AwesomeSerifItalic-Regular.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/AwesomeSerifItalic/AwesomeSerifItalic-MediumTall.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../public/fonts/AwesomeSerifItalic/AwesomeSerifItalic-BoldTall.ttf",
      weight: "700",
      style: "italic",
    },
    {
      path: "../../public/fonts/AwesomeSerifItalic/AwesomeSerifItalic-BdExraTall.ttf",
      weight: "800",
      style: "italic",
    },
  ],
  variable: "--font-awesome-serif",
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${awesomeSerif.variable}`}>
      <body className="min-h-screen bg-[#0D0D0D] font-sans antialiased">
        <Providers>
          <TooltipProvider delayDuration={300}>
            {children}
          </TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#181818",
                border: "1px solid rgba(255,77,0,0.3)",
                color: "#F5F5F5",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
