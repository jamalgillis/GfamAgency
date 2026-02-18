/**
 * Script to seed services data to Convex
 * Run with: bun run seed:services
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { proposalServiceCatalog } from "../data/proposal-service-catalog";

const servicesData = proposalServiceCatalog.map(({ id: _id, ...service }) => service);

async function main() {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const seedOrgId =
    process.env.CLERK_SEED_ORG_ID || process.env.SEED_ORG_ID || "dev-seed-org";

  if (!convexUrl) {
    console.error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not found in environment");
    process.exit(1);
  }

  console.log("Starting Convex services seed");
  console.log(`Convex URL: ${convexUrl}`);
  console.log(`Org ID: ${seedOrgId}`);
  console.log(`Services to seed: ${servicesData.length}`);

  const client = new ConvexHttpClient(convexUrl);

  try {
    const result = await client.mutation(api.seed.seedServices, {
      orgId: seedOrgId,
      services: servicesData,
      clearExisting: true,
    });

    console.log("Seed completed successfully");
    console.log(`Inserted: ${result.inserted} services`);
    console.log(`Message: ${result.message}`);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

main();
