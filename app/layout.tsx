import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

function getConvexUrlFromDeployment(
  deployment?: string,
): string | undefined {
  if (!deployment) {
    return undefined;
  }

  const [, deploymentName] = deployment.split(":");
  if (!deploymentName) {
    return undefined;
  }

  return `https://${deploymentName}.convex.cloud`;
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "GFAM Agency Dashboard",
  description: "Internal management system for GFAM Agency ecosystem",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_URL ||
    getConvexUrlFromDeployment(process.env.CONVEX_DEPLOYMENT);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} font-sans`}>
        <ConvexClientProvider convexUrl={convexUrl}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
