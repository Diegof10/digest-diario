import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resumen agrario · @dhferrari",
  description:
    "Resumen agrario matutino: Chicago, Matba, CAC Rosario, USDA, CATAC, fiscal. Análisis de gestión — @dhferrari.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
