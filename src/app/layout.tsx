import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digest diario · DHF Advisory",
  description:
    "Digest matutino agro: mercado, costos CATAC, fiscal y lectura. Análisis de gestión — DHF Advisory.",
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
