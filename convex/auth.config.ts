const clerkIssuerUrl = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkIssuerUrl) {
  throw new Error("Missing CLERK_JWT_ISSUER_DOMAIN for Convex auth configuration");
}

export default {
  providers: [
    {
      domain: clerkIssuerUrl,
      applicationID: "convex",
    },
  ],
};
