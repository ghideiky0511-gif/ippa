import "./globals.css";

export const metadata = {
  title: "Bippa Admin — Editor da home",
  description: "Plataforma de personalização do catálogo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
