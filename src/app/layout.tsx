import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shipping Buddy — Find a box or build one that fits",
  description: "A clear, calculated packaging prototype for one rectangular item.",
};

export default function RootLayout({children}: Readonly<{children: ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
