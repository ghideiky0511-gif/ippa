import "./globals.css";
import { AdminAuthProvider } from "@/components/AdminAuthProvider";

export const metadata = {
  title: "Bippa Admin — Editor da home",
  description: "Plataforma de personalização do catálogo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
