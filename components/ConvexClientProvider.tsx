"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

type ConvexClientProviderProps = {
  children: ReactNode;
  convexUrl?: string;
};

export function ConvexClientProvider({
  children,
  convexUrl,
}: ConvexClientProviderProps) {
  const resolvedConvexUrl = convexUrl ?? process.env.NEXT_PUBLIC_CONVEX_URL;

  const client = useMemo(() => {
    if (!resolvedConvexUrl) {
      return null;
    }
    return new ConvexReactClient(resolvedConvexUrl);
  }, [resolvedConvexUrl]);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
