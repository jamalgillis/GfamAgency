# GFAM Agency - Internal Management System

Centralized dashboard to manage services and generate Stripe invoices for the GFAM Agency ecosystem.

## Brand Hierarchy

- **GFAM Agency** (Parent/Legal Entity)
  - **Sankofa**: Marketing, Web Development
  - **Lighthouse**: Post-Production, Video, Photography
  - **Centex**: Sports Podcasts, Live Production
  - **GFAM Media Studios**: General Podcasts, Photography, Studio Rentals

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js 15 (App Router)
- **Database**: Convex
- **Payments**: Stripe
- **UI**: Tailwind CSS + Shadcn UI

## Setup

```bash
# Install dependencies
bun install

# Initialize Convex
bun run convex:dev

# Copy and edit services YAML
cp data/services.example.yaml data/services.yaml
# Edit data/services.yaml with your Stripe Price IDs

# Preview seed mapping (dry run)
bun run seed:dry

# Seed the database
bun run seed

# Start development server
bun dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start Next.js dev server |
| `bun build` | Build for production |
| `bun run convex:dev` | Start Convex dev server |
| `bun run seed:dry` | Preview service-to-brand mapping |
| `bun run seed` | Seed services into Convex |

## Service-to-Brand Mapping

The seed script automatically maps services based on category:

| Category | Brand |
|----------|-------|
| `website`, `social-media` | Sankofa |
| `video`, `bundle`, `photography` | Lighthouse |
| `podcast` + `sports`/`live-event` tags | Centex |
| `podcast`, `studio-rental` | GFAM Media Studios |
