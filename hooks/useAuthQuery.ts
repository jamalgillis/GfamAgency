import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * Drop-in replacement for `useQuery` that skips the query until
 * Clerk auth is loaded and an active organization is set.
 * Prevents "Unauthorized" errors from org-scoped Convex functions.
 */
export function useAuthQuery<F extends FunctionReference<"query">>(
  query: F,
  args: FunctionArgs<F> | "skip",
): FunctionReturnType<F> | undefined {
  const { isLoaded, isSignedIn, orgId } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();
  const canQuery =
    isLoaded &&
    isSignedIn &&
    !!orgId &&
    !isConvexAuthLoading &&
    isAuthenticated;

  const resolvedArgs = canQuery && args !== "skip" ? args : "skip";

  return useQuery(query, resolvedArgs as any);
}
