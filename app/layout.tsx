import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ConsentBanner } from "@/components/ConsentBanner";
import { VisitTracker } from "@/components/VisitTracker";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Was Thanos Right?",
  description:
    "Ten questions about the snap. Some are serious, some are absolutely not, and a few are opposites of each other. Answer both one way and we keep the receipts.",
  openGraph: {
    title: "Was Thanos Right?",
    description:
      "There are no right answers. There are only consistent ones.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <div className="starfield" aria-hidden />
        <div className="vignette" aria-hidden />
        {children}
        <VisitTracker />
        <ConsentBanner />
      </body>
    </html>
  );
}
