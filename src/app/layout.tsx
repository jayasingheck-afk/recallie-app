import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recallie",
  description:
    "Recallie helps primary school students build lasting maths and English skills through short, encouraging daily practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
