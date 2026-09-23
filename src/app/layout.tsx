import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DHF Digest · DHF Advisory",
  description:
    "Digest matutino agro: Chicago, Matba, CAC Rosario, USDA, CATAC. Análisis de gestión — DHF Advisory.",
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
