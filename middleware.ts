import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isDashboardRoute(req)) {
    return;
  }

  await auth.protect();

  const { orgId } = await auth();
  if (!orgId && !req.nextUrl.pathname.startsWith("/organization-select")) {
    const orgSelectionUrl = new URL("/organization-select", req.url);
    return NextResponse.redirect(orgSelectionUrl);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
