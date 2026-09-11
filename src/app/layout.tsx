import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alerta SISA · DHF Advisory",
  description: "Diff diario de scoring/categoría SISA → mail al contador",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
