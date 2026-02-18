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
    id: "podcast-single-angle-basic",
    brand: "GFAM Media Studios",
    name: "Single Angle Basic",
    description: "Includes 60-minute studio recording session with single camera angle and basic editing. Ideal for 30-45 minute finished episodes. Perfect for solo creators and entry-level podcasters. Includes: 60min Recording | Studio | Engineer | Equipment | Editing.",
    price: "$150",
    priceValue: 150,
    priceSuffix: "/episode",
    tags: [
      "Full-Service Podcast Production"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-multi-angle-plus-producer-plus-live-switching",
    brand: "GFAM Media Studios",
    name: "Multi-Angle + Producer + Live Switching",
    description: "Includes 90-minute studio recording session with multiple camera angles, professional audio production, and real-time camera switching during recording. Ideal for 45-60 minute finished episodes. Our most popular choice for interview-style shows. Includes: 90min Recording | Studio | Engineer | Multi-Cam | Editing.",
    price: "$225",
    priceValue: 225,
    priceSuffix: "/episode",
    tags: [
      "Full-Service Podcast Production",
      "Featured"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-premium-multi-angle",
    brand: "GFAM Media Studios",
    name: "Premium Multi-Angle",
    description: "Includes 90-minute studio recording session with multi-angle + live switching, advanced editing, motion graphics, captions, guest photos, and priority 48-hour delivery. Ideal for 45-60+ minute finished episodes with maximum polish. Includes: 90min Recording | Studio | Multi-Cam | Premium Edit.",
    price: "$300",
    priceValue: 300,
    priceSuffix: "/episode",
    tags: [
      "Full-Service Podcast Production"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-live-event-streaming",
    brand: "GFAM Media Studios",
    name: "Live Event Streaming",
    description: "Professional live streaming for events, conferences, and special broadcasts. Includes travel within 50 miles, setup, and multi-platform streaming. Includes: Equipment | Engineer | Travel | Streaming Setup.",
    price: "$450",
    priceValue: 450,
    priceSuffix: "/episode",
    tags: [
      "Full-Service Podcast Production"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-2-hour-studio-session",
    brand: "GFAM Media Studios",
    name: "2-Hour Studio Session",
    description: "Perfect for standard podcast episodes. Includes 90 minutes recording time (plus 30 minutes setup/breakdown), engineer/producer, multi-camera setup, and basic post-production editing. Ideal for 45-60 minute finished episodes. Includes: 90min Recording | Engineer | Multi-Cam | Basic Edit.",
    price: "$225",
    priceValue: 225,
    tags: [
      "Studio Session Rentals"
    ],
    status: "active",
    stripeSynced: false,
    category: "studio-rental"
  },
  {
    id: "podcast-4-hour-studio-session",
    brand: "GFAM Media Studios",
    name: "4-Hour Studio Session",
    description: "Extended sessions for longer content (60-90+ min episodes), multiple guests, back-to-back recordings, or special productions. Includes up to 3.5 hours recording time (plus 30 minutes setup), engineer/producer, multi-camera setup, and premium post-production. Includes: 3.5hr Recording | Engineer | Multi-Cam | Premium Edit.",
    price: "$400",
    priceValue: 400,
    tags: [
      "Studio Session Rentals"
    ],
    status: "active",
    stripeSynced: false,
    category: "studio-rental"
  },
  {
    id: "podcast-additional-recording-time-30-min",
    brand: "GFAM Media Studios",
    name: "Additional Recording Time (30 min)",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$50",
    priceValue: 50,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-additional-recording-time-15-min",
    brand: "GFAM Media Studios",
    name: "Additional Recording Time (15 min)",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$25",
    priceValue: 25,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-virtual-guest-setup",
    brand: "GFAM Media Studios",
    name: "Virtual Guest Setup",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$20 each",
    priceValue: 20,
    priceSuffix: "/each",
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-bts-photography-30-min",
    brand: "GFAM Media Studios",
    name: "BTS Photography (30 min)",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$60",
    priceValue: 60,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "photography"
  },
  {
    id: "podcast-bts-photography-1-hour",
    brand: "GFAM Media Studios",
    name: "BTS Photography (1 hour)",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$120",
    priceValue: 120,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "photography"
  },
  {
    id: "podcast-guest-photo-capture",
    brand: "GFAM Media Studios",
    name: "Guest Photo Capture",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$25",
    priceValue: 25,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "photography"
  },
  {
    id: "podcast-iso-video-recordings",
    brand: "GFAM Media Studios",
    name: "ISO Video Recordings",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$50",
    priceValue: 50,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-same-day-booking",
    brand: "GFAM Media Studios",
    name: "Same-Day Booking",
    description: "Production Add-Ons add-on for podcast production.",
    price: "+$40",
    priceValue: 40,
    tags: [
      "Production Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-social-media-clip-package",
    brand: "GFAM Media Studios",
    name: "Social Media Clip Package",
    description: "Content Creation Add-Ons add-on for podcast production.",
    price: "+$50",
    priceValue: 50,
    tags: [
      "Content Creation Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-highlight-reel",
    brand: "GFAM Media Studios",
    name: "Highlight Reel",
    description: "Content Creation Add-Ons add-on for podcast production.",
    price: "+$75",
    priceValue: 75,
    tags: [
      "Content Creation Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-custom-thumbnails",
    brand: "GFAM Media Studios",
    name: "Custom Thumbnails",
    description: "Content Creation Add-Ons add-on for podcast production.",
    price: "+$18 each",
    priceValue: 18,
    priceSuffix: "/each",
    tags: [
      "Content Creation Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-multi-platform-upload",
    brand: "GFAM Media Studios",
    name: "Multi-Platform Upload",
    description: "Content Creation Add-Ons add-on for podcast production.",
    price: "+$40",
    priceValue: 40,
    tags: [
      "Content Creation Add-Ons",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-same-day-delivery",
    brand: "GFAM Media Studios",
    name: "Same-Day Delivery",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+50% Rush Fee",
    priceValue: 50,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-animated-intro-outro",
    brand: "GFAM Media Studios",
    name: "Animated Intro/Outro",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+$100",
    priceValue: 100,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-4k-editing",
    brand: "GFAM Media Studios",
    name: "4K Editing",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+$40",
    priceValue: 40,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-color-correction-grading",
    brand: "GFAM Media Studios",
    name: "Color Correction/Grading",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+$55",
    priceValue: 55,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-advanced-color-grading",
    brand: "GFAM Media Studios",
    name: "Advanced Color Grading",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+$135",
    priceValue: 135,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-audio-enhancement",
    brand: "GFAM Media Studios",
    name: "Audio Enhancement",
    description: "Technical Upgrades add-on for podcast production.",
    price: "+$40",
    priceValue: 40,
    tags: [
      "Technical Upgrades",
      "Add-On"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-monthly-retainer",
    brand: "GFAM Media Studios",
    name: "Monthly Retainer",
    description: "Includes: 4 episodes per month, Priority scheduling, Consistent delivery dates, Dedicated project manager.",
    price: "15% OFF",
    priceValue: 15,
    priceSuffix: "/month",
    tags: [
      "Package Deal"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-season-package",
    brand: "GFAM Media Studios",
    name: "Season Package",
    description: "Includes: 10+ episodes, Brand consistency, Bulk delivery options, Free revisions included.",
    price: "20% OFF",
    priceValue: 20,
    tags: [
      "Package Deal"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  },
  {
    id: "podcast-full-service-bundle",
    brand: "GFAM Media Studios",
    name: "Full-Service Bundle",
    description: "Includes: Multi-angle editing + live switching, Social media clip package, Custom thumbnails, Guest photo capture, Multi-platform distribution, Audio enhancement. $438 value - Save $73 with bundle.",
    price: "$365",
    priceValue: 365,
    tags: [
      "Package Deal"
    ],
    status: "active",
    stripeSynced: false,
    category: "podcast"
  }
];
