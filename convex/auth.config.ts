const defaultClerkIssuers = [
  "https://premium-parakeet-79.clerk.accounts.dev",
];

const envIssuers = (process.env.CLERK_JWT_ISSUER_DOMAIN ?? "")
  .split(",")
  .map((domain) => domain.trim())
  .filter((domain) => domain.length > 0);

const issuerDomains = Array.from(new Set([...envIssuers, ...defaultClerkIssuers]));

export default {
  providers: issuerDomains.map((domain) => ({
    domain,
    applicationID: "convex",
  })),
};
