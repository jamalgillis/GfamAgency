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

  // During static prerendering (next build) the Convex URL isn't available.
  // Render nothing so pages that call useQuery aren't mounted without a provider.
  if (!client) {
    return null;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
