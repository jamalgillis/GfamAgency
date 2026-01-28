/**
 * Script to seed test clients to Convex
 * Run with: bun run scripts/seed-clients.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Test clients data
const clientsData = [
  {
    name: "John Smith",
    company: "Acme Corp",
    email: "john@acmecorp.com",
  },
  {
    name: "Sarah Johnson",
    company: "TechStart Inc",
    email: "sarah@techstart.io",
  },
  {
    name: "Mike Chen",
    company: "MediaCo Productions",
    email: "mike@mediaco.tv",
  },
  {
    name: "Emily Davis",
    company: "StartupXYZ",
    email: "emily@startupxyz.com",
  },
  {
    name: "Robert Wilson",
    company: "Wilson & Associates",
    email: "robert@wilsonassoc.com",
  },
  {
    name: "Jessica Martinez",
    company: "Creative Solutions LLC",
    email: "jessica@creativesolutions.co",
  },
  {
    name: "David Thompson",
    company: "Thompson Athletics",
    email: "david@thompsonathletics.com",
  },
  {
    name: "Amanda Lee",
    company: "Podcast Network Pro",
    email: "amanda@podcastnetworkpro.com",
  },
  {
    name: "Chris Anderson",
    company: "Anderson Real Estate",
    email: "chris@andersonre.com",
  },
  {
    name: "Michelle Brown",
    company: "Brown Consulting Group",
    email: "michelle@brownconsulting.com",
  },
];

async function main() {
  // Get the Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    console.error("❌ CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not found in environment");
    console.log("Make sure you have a .env.local file with NEXT_PUBLIC_CONVEX_URL set");
    process.exit(1);
  }

  console.log("🚀 Starting client seed...");
  console.log(`📍 Convex URL: ${convexUrl}`);
  console.log(`👥 Clients to seed: ${clientsData.length}`);

  const client = new ConvexHttpClient(convexUrl);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const clientData of clientsData) {
    try {
      // Check if client already exists
      const existing = await client.query(api.clients.getByEmail, {
        email: clientData.email,
      });

      if (existing) {
        console.log(`⏭️  Skipping "${clientData.name}" (already exists)`);
        skipped++;
        continue;
      }

      // Create the client
      await client.mutation(api.clients.create, clientData);
      console.log(`✅ Created client: ${clientData.name} (${clientData.company})`);
      created++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to create "${clientData.name}":`, errorMessage);
      errors.push(`${clientData.name}: ${errorMessage}`);
    }
  }

  console.log("\n📊 Seed Summary:");
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\n❌ Errors:");
    errors.forEach((e) => console.log(`   - ${e}`));
  }
}

main();
