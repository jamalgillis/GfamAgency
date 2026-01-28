# Multi-Brand Invoicing Logic

## 1. Schema Definitions
- **Brands**: Defined as a TypeScript Union/Enum: `Sankofa | Lighthouse | Centex | GFAM_Media_Studios`.
- **Services**: Each service record contains a `brand` field mapping it to one of the four business units.
- **Invoices**: Invoices can contain line items from different brands, but must track which brand "owns" the invoice or default to "GFAM Agency".

## 2. Branding Mapping (Source: YAML)
- **Sankofa**: Slug `website`, `social-media`.
- **Lighthouse**: Slug `video`, `bundle`.
- **GFAM Media Studios**: Slug `podcast` (standard episodes/studio time).
- **Centex**: Slug `podcast` (specifically "Live Event Streaming" or "Sports" tags).

## 3. Stripe Action Workflow
1. **Selection**: User selects services (e.g., "Professional Package" from Sankofa and "Drone Add-On" from Lighthouse).
2. **Action**: `createCustomInvoice` orchestrates the API calls.
3. **Drafting**: Create a single Stripe Invoice.
4. **Metadata**: Each Line Item should have metadata identifying its brand for internal reporting.
5. **Branding**: The Invoice `description` should list the participating sub-brands (e.g., "Services by Sankofa & Lighthouse").

## 4. Invoice Ownership Rules
- If all line items belong to one brand, that brand owns the invoice.
- If line items span multiple brands, the invoice defaults to "GFAM Agency" as owner.
- Brand metadata on line items is always preserved for reporting purposes.

## 5. Stripe Metadata Structure
```typescript
// Line Item Metadata
{
  brand: "Sankofa" | "Lighthouse" | "Centex" | "GFAM Media Studios",
  category: string, // e.g., "website", "video", "podcast"
  serviceId: string // Convex document ID
}

// Invoice Metadata
{
  primaryBrand: string,
  participatingBrands: string[], // e.g., ["Sankofa", "Lighthouse"]
  convexInvoiceId: string
}
```
