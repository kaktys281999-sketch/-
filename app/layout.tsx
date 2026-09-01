import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { THEME_SCRIPT } from "@/lib/theme";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdatePrompt } from "@/components/UpdatePrompt";

export const metadata: Metadata = {
  title: "Финансы",
  description: "Личный финансовый трекер",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0B0716",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <PwaRegister />
        <StoreProvider>{children}</StoreProvider>
        <UpdatePrompt />
      </body>
    </html>
  );
}
