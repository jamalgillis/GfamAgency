export type ServiceCatalogBrand =
  | "Sankofa"
  | "Lighthouse"
  | "Centex"
  | "GFAM Media Studios";

export type ServiceCatalogStatus = "active" | "inactive";

export interface ServiceCatalogItem {
  id: string;
  brand: ServiceCatalogBrand;
  name: string;
  description: string;
  price: string;
  priceValue: number;
  priceSuffix?: string;
  billingType?: "one_time" | "recurring";
  recurringInterval?: "day" | "week" | "month" | "year";
  recurringIntervalCount?: number;
  tags: string[];
  status: ServiceCatalogStatus;
  stripeSynced: boolean;
  category: string;
}

export const proposalServiceCatalog: ServiceCatalogItem[] = [
  {
    id: "website-essential-package",
    brand: "Sankofa",
    name: "Essential Package",
    description: "Local businesses & consultants Includes: 5-7 Professional Pages, Basic SEO Setup, Contact Form, 2 Weeks Timeline.",
    price: "$1,200 - $2,000",
    priceValue: 1200,
    tags: [
      "Website",
      "starter"
    ],
    status: "active",
    stripeSynced: false,
    category: "website"
  },
  {
    id: "website-professional-package",
    brand: "Sankofa",
    name: "Professional Package",
    description: "Established businesses Includes: 10-15 Custom Pages, CMS for Blog/News, Advanced SEO & Analytics, Social Feed Integration.",
    price: "$2,800 - $4,500",
    priceValue: 2800,
    tags: [
      "Website",
      "professional"
    ],
    status: "active",
    stripeSynced: false,
    category: "website"
  },
  {
    id: "website-business-growth-package",
    brand: "Sankofa",
    name: "Business Growth Package",
    description: "For platforms requiring complex architecture, e-commerce, or custom workflows. Includes: 20-30 Pages with Complex Architecture, Custom Forms & CRM Integration, Performance Optimization, 90 Days Priority Support.",
    price: "$5,500 - $8,500",
    priceValue: 5500,
    tags: [
      "Website",
      "enterprise"
    ],
    status: "active",
    stripeSynced: false,
    category: "website"
  },
  {
    id: "website-website-maintenance-and-updates",
    brand: "Sankofa",
    name: "Website Maintenance & Updates",
    description: "Additional service from Website Development & Digital Solutions.",
    price: "$100 - $300/mo",
    priceValue: 100,
    priceSuffix: "/month",
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "website"
  },
  {
    id: "website-content-writing-and-copywriting",
    brand: "Sankofa",
    name: "Content Writing & Copywriting",
    description: "Additional service from Website Development & Digital Solutions.",
    price: "$400 - $1,200",
    priceValue: 400,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "marketing"
  },
  {
    id: "website-professional-photography",
    brand: "Sankofa",
    name: "Professional Photography",
    description: "Additional service from Website Development & Digital Solutions.",
    price: "$400 - $1,000",
    priceValue: 400,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "photography"
  },
  {
    id: "website-live-stream-production",
    brand: "Sankofa",
    name: "Live Stream Production",
    description: "Additional service from Website Development & Digital Solutions.",
    price: "Starting at $800",
    priceValue: 800,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "streaming"
  },
  {
    id: "social-media-starter-package",
    brand: "Sankofa",
    name: "Starter Package",
    description: "Small businesses & solopreneurs Includes: 4 Platforms Managed, 12 Original Posts (graphics + copy), Scheduling & Optimization, Monthly Analytics Report.",
    price: "$750 - $1,000/mo",
    priceValue: 750,
    priceSuffix: "/month",
    tags: [
      "Social Media",
      "starter"
    ],
    status: "active",
    stripeSynced: false,
    category: "social-media"
  },
  {
    id: "social-media-growth-package",
    brand: "Sankofa",
    name: "Growth Package",
    description: "Established businesses scaling up Includes: 4 Platforms Managed, 20 Original Posts (graphics + copy), Weekly Reels/Shorts Included, Community Management.",
    price: "$1,500 - $2,200/mo",
    priceValue: 1500,
    priceSuffix: "/month",
    tags: [
      "Social Media",
      "professional"
    ],
    status: "active",
    stripeSynced: false,
    category: "social-media"
  },
  {
    id: "social-media-full-service-package",
    brand: "Sankofa",
    name: "Full Service Package",
    description: "Brands requiring comprehensive management Includes: Unlimited Platforms, 40+ Original Posts (graphics + copy), Custom Video Content Included, Dedicated Account Manager.",
    price: "$3,000 - $5,000/mo",
    priceValue: 3000,
    priceSuffix: "/month",
    tags: [
      "Social Media",
      "enterprise"
    ],
    status: "active",
    stripeSynced: false,
    category: "social-media"
  },
  {
    id: "social-media-paid-ads-management",
    brand: "Sankofa",
    name: "Paid Ads Management",
    description: "Additional service from Social Media Marketing & Management.",
    price: "$500 - $1,000/mo + ad spend",
    priceValue: 500,
    priceSuffix: "/month",
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "marketing"
  },
  {
    id: "social-media-influencer-campaign",
    brand: "Sankofa",
    name: "Influencer Campaign",
    description: "Additional service from Social Media Marketing & Management.",
    price: "$1,000 - $3,000",
    priceValue: 1000,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "marketing"
  },
  {
    id: "social-media-social-media-audit",
    brand: "Sankofa",
    name: "Social Media Audit",
    description: "Additional service from Social Media Marketing & Management.",
    price: "$300 - $500",
    priceValue: 300,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "marketing"
  },
  {
    id: "social-media-content-photoshoot",
    brand: "Sankofa",
    name: "Content Photoshoot",
    description: "Additional service from Social Media Marketing & Management.",
    price: "$400 - $800",
    priceValue: 400,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "photography"
  },
  {
    id: "seo-local-entity-foundation",
    brand: "Sankofa",
    name: "Local Entity Foundation",
    description: "Foundational local SEO retainer for single-location businesses that need stronger Waco-area visibility. Includes Google Business Profile entity optimization, hyper-local citation building, review acquisition framework setup, and essential on-page optimization for primary high-intent pages.",
    price: "$495/month",
    priceValue: 495,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "SEO",
      "starter",
      "Google Entity",
      "AI Search",
      "Local"
    ],
    status: "active",
    stripeSynced: false,
    category: "seo"
  },
  {
    id: "seo-regional-authority-ai-engine",
    brand: "Sankofa",
    name: "Regional Authority & AI Engine",
    description: "Regional SEO growth retainer for brands expanding across Central Texas. Includes topical authority content clusters, technical and semantic SEO improvements, regional landing page expansion, and core Organization plus LocalBusiness schema deployment for stronger AI and search visibility.",
    price: "$1,495/month",
    priceValue: 1495,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "SEO",
      "professional",
      "Google Entity",
      "AI Search",
      "Regional",
      "GEO"
    ],
    status: "active",
    stripeSynced: false,
    category: "seo"
  },
  {
    id: "seo-market-dominance-framework",
    brand: "Sankofa",
    name: "Market Dominance Framework",
    description: "Premium search authority retainer for competitive or multi-location brands that want full market share pressure. Includes advanced entity-linking and digital PR, comprehensive schema deployment, conversion rate optimization, and deeper content velocity or programmatic SEO execution when applicable.",
    price: "$2,950/month",
    priceValue: 2950,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "SEO",
      "enterprise",
      "Digital PR",
      "AI Search",
      "GEO",
      "CRO"
    ],
    status: "active",
    stripeSynced: false,
    category: "seo"
  },
  {
    id: "video-essential-package",
    brand: "Lighthouse",
    name: "Essential Package",
    description: "Small businesses & personal projects Includes: Up to 2 Minutes Final Edit, Single Location Shoot, Basic Color Grading, 1 Week Delivery.",
    price: "$800 - $1,500",
    priceValue: 800,
    tags: [
      "Video",
      "starter"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-professional-package",
    brand: "Lighthouse",
    name: "Professional Package",
    description: "Growing businesses & campaigns Includes: Up to 5 Minutes Final Edit, Multi-Location Shoot, Professional Color Grading, Licensed Music Included.",
    price: "$2,000 - $4,000",
    priceValue: 2000,
    tags: [
      "Video",
      "professional"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-production-package",
    brand: "Lighthouse",
    name: "Production Package",
    description: "Full-scale commercial & documentary projects Includes: Up to 15 Minutes Final Edit, Multi-Day Production, Drone & Specialty Shots, Full Post-Production Suite.",
    price: "$5,000 - $10,000",
    priceValue: 5000,
    tags: [
      "Video",
      "enterprise"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-drone-aerial-footage-add-on",
    brand: "Lighthouse",
    name: "Drone/Aerial Footage Add-On",
    description: "Additional service from Videography & Video Production.",
    price: "$300 - $600",
    priceValue: 300,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-same-day-highlight-reel",
    brand: "Lighthouse",
    name: "Same-Day Highlight Reel",
    description: "Additional service from Videography & Video Production.",
    price: "$500 - $800",
    priceValue: 500,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-raw-footage-package",
    brand: "Lighthouse",
    name: "Raw Footage Package",
    description: "Additional service from Videography & Video Production.",
    price: "$200 - $400",
    priceValue: 200,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "video-additional-revision-rounds",
    brand: "Lighthouse",
    name: "Additional Revision Rounds",
    description: "Additional service from Videography & Video Production.",
    price: "$150/round",
    priceValue: 150,
    priceSuffix: "/round",
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "bundle-launch-bundle",
    brand: "Lighthouse",
    name: "Launch Bundle",
    description: "New businesses & refreshes Includes: 5-7 Page Website, Up to 2 Min Promo Video, Basic SEO Setup, Social-Ready Video Cuts.",
    price: "$2,300 - $3,000",
    priceValue: 2300,
    tags: [
      "Bundle",
      "starter"
    ],
    status: "active",
    stripeSynced: false,
    category: "bundle"
  },
  {
    id: "bundle-professional-bundle",
    brand: "Lighthouse",
    name: "Professional Bundle",
    description: "Established businesses scaling up Includes: 10-15 Page Custom Website, Up to 5 Min Brand Video, CMS + Blog Setup, Multi-Location Video Shoot.",
    price: "$5,500 - $7,500",
    priceValue: 5500,
    tags: [
      "Bundle",
      "professional"
    ],
    status: "active",
    stripeSynced: false,
    category: "bundle"
  },
  {
    id: "bundle-premium-bundle",
    brand: "Lighthouse",
    name: "Premium Bundle",
    description: "Full brand launch or rebrand Includes: 20-30 Page Website + E-commerce, Up to 15 Min Video Production, Multi-Day Shoot + Aerial, 90 Days Priority Support.",
    price: "$11,500 - $16,000",
    priceValue: 11500,
    tags: [
      "Bundle",
      "enterprise"
    ],
    status: "active",
    stripeSynced: false,
    category: "bundle"
  },
  {
    id: "bundle-additional-video-cuts-15-30-60-sec",
    brand: "Lighthouse",
    name: "Additional Video Cuts (15/30/60 sec)",
    description: "Additional service from Website + Video Bundle.",
    price: "$200 - $400 each",
    priceValue: 200,
    priceSuffix: "/each",
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "bundle-website-maintenance-plan",
    brand: "Lighthouse",
    name: "Website Maintenance Plan",
    description: "Additional service from Website + Video Bundle.",
    price: "$100 - $300/mo",
    priceValue: 100,
    priceSuffix: "/month",
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "website"
  },
  {
    id: "bundle-drone-aerial-add-on",
    brand: "Lighthouse",
    name: "Drone/Aerial Add-On",
    description: "Additional service from Website + Video Bundle.",
    price: "$300 - $600",
    priceValue: 300,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "video"
  },
  {
    id: "bundle-rush-delivery-2-weeks",
    brand: "Lighthouse",
    name: "Rush Delivery (2 weeks)",
    description: "Additional service from Website + Video Bundle.",
    price: "+20%",
    priceValue: 20,
    tags: [
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "bundle"
  },
  {
    id: "membership-foundation-monthly",
    brand: "GFAM Media Studios",
    name: "Foundation Monthly Membership",
    description: "Technical infrastructure subscription for DIY creators, local nonprofits, and agency teams. Includes 2 monthly studio sessions (up to 2 hours each), on-site audio engineer support, 1080p multi-camera capture, clean-slate studio set access, sync-ready file handoff within 3 hours, and 10% off post-production add-ons. Editing, color correction, clip cutting, and distribution are not included.",
    price: "$349 - $399/month",
    priceValue: 349,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "Membership",
      "starter",
      "Batch Recording",
      "MRR"
    ],
    status: "active",
    stripeSynced: false,
    category: "membership"
  },
  {
    id: "membership-content-engine-monthly",
    brand: "GFAM Media Studios",
    name: "Content Engine Monthly Membership",
    description: "Turnkey weekly-show package with 4 monthly episodes recorded across 1 or 2 batch studio days. Includes producer/engineer session management, 4 polished full-length multi-camera edits, 8 to 12 vertical social clips, dynamic captions, a 30-minute monthly photo room session, 4 custom thumbnails, and organized delivery within 5 business days. Scheduling, publishing, and copywriting are not included.",
    price: "$1,199 - $1,399/month",
    priceValue: 1199,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "Membership",
      "professional",
      "Batch Recording",
      "Featured",
      "MRR"
    ],
    status: "active",
    stripeSynced: false,
    category: "membership"
  },
  {
    id: "membership-market-authority-monthly",
    brand: "GFAM Media Studios",
    name: "Market Authority Monthly Membership",
    description: "Premium outsourced media department for brands that want full execution. Includes executive producer support, 4 premium episodes on a flexible batch schedule, 4K master exports, raw ISO audio and video archives, cinematic color and sound finishing, 16 to 24 branded social clips, a 60-minute monthly photo room takeover, turnkey distribution management, YouTube SEO support, and 48-hour priority delivery.",
    price: "$2,199 - $2,499/month",
    priceValue: 2199,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "Membership",
      "enterprise",
      "VIP",
      "MRR"
    ],
    status: "active",
    stripeSynced: false,
    category: "membership"
  },
  {
    id: "photo-room-hourly-rental",
    brand: "GFAM Media Studios",
    name: "Photo Room Hourly Rental",
    description: "Self-serve or space-only photo room access with a 2-hour minimum. Includes standard backdrops, seamless paper or cyclorama access, and basic studio strobe or continuous lighting setups.",
    price: "$75/hour",
    priceValue: 75,
    tags: [
      "Photo Room",
      "Rental",
      "Self-Serve"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "photo-room-half-day-pass",
    brand: "GFAM Media Studios",
    name: "Photo Room Half-Day Pass (4 Hours)",
    description: "Four-hour photo room block for creators, photographers, or agencies who want a more efficient daylight booking window while keeping the room self-directed.",
    price: "$250",
    priceValue: 250,
    tags: [
      "Photo Room",
      "Rental"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "photo-room-full-day-takeover",
    brand: "GFAM Media Studios",
    name: "Photo Room Full-Day Takeover (8 Hours)",
    description: "Eight-hour commercial booking for lookbooks, product campaigns, seasonal brand shoots, or all-day production blocks that need uninterrupted access to the photo suite.",
    price: "$450",
    priceValue: 450,
    tags: [
      "Photo Room",
      "Rental"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "photo-room-premium-headshot-session",
    brand: "GFAM Media Studios",
    name: "Premium Headshot Session",
    description: "Fifteen-minute photo room add-on captured before or after a recording session. Includes 2 fully retouched high-resolution headshots for LinkedIn, websites, podcast art, or speaker bios.",
    price: "$99/person",
    priceValue: 99,
    tags: [
      "Photo Room",
      "Add-On",
      "Headshots"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "photo-room-show-promo-thumbnail-pack",
    brand: "GFAM Media Studios",
    name: "Show Promo & Thumbnail Pack",
    description: "Thirty-minute photo room mini-session built for YouTube thumbnails, Spotify covers, and quote graphics. Yields 5 to 7 clean cutout images with expressive poses and strong click-through framing.",
    price: "$149/session",
    priceValue: 149,
    tags: [
      "Photo Room",
      "Add-On",
      "Thumbnails"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "photo-room-b-roll-lifestyle-video-shoot",
    brand: "GFAM Media Studios",
    name: "B-Roll / Lifestyle Video Shoot",
    description: "Dedicated 4K lifestyle footage shoot in the photo room for sleek walk-and-talk, laptop, planning, or behind-the-scenes brand visuals that can power reels, ads, and video overlays.",
    price: "$199/hour",
    priceValue: 199,
    tags: [
      "Photo Room",
      "Add-On",
      "4K"
    ],
    status: "active",
    stripeSynced: false,
    category: "photo-room"
  },
  {
    id: "membership-visual-refresh-upgrade",
    brand: "GFAM Media Studios",
    name: "Visual Refresh Upgrade",
    description: "Recurring membership upgrade that adds a 45-minute monthly photo room slot and 10 fresh brand photos every month so client feeds, promos, and thumbnails never feel stale.",
    price: "+$199/month",
    priceValue: 199,
    billingType: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    tags: [
      "Membership Upgrade",
      "Photo Room",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "membership-upgrade"
  },
  {
    id: "operations-late-reschedule-fee",
    brand: "GFAM Media Studios",
    name: "Late Reschedule Fee",
    description: "Applied when a member changes a booked recording block inside the 48-hour lock-in window after crew time has already been committed.",
    price: "$50",
    priceValue: 50,
    tags: [
      "Policy",
      "Fee",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "fees"
  },
  {
    id: "operations-session-overage-30-min",
    brand: "GFAM Media Studios",
    name: "Session Overage (30 min)",
    description: "Automatic 30-minute overage billing for recording blocks that run past their included package time, protecting engineer and studio labor margins.",
    price: "$50",
    priceValue: 50,
    tags: [
      "Policy",
      "Overage",
      "Fee",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "fees"
  },
  {
    id: "operations-photo-room-cleaning-reset-fee",
    brand: "GFAM Media Studios",
    name: "Photo Room Cleaning / Reset Fee",
    description: "Applies to self-serve photo room rentals when seamless paper backdrops need cleanup, reset, or replacement after use.",
    price: "$50",
    priceValue: 50,
    tags: [
      "Policy",
      "Fee",
      "Photo Room",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "fees"
  }
];
