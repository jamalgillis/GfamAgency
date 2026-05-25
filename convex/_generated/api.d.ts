/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as clients from "../clients.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as invoiceActions from "../invoiceActions.js";
import type * as lib_invoicePdf from "../lib/invoicePdf.js";
import type * as lib_org from "../lib/org.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as orgBranding from "../orgBranding.js";
import type * as seed from "../seed.js";
import type * as services from "../services.js";
import type * as stripeSync from "../stripeSync.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  clients: typeof clients;
  feedback: typeof feedback;
  http: typeof http;
  invoiceActions: typeof invoiceActions;
  "lib/invoicePdf": typeof lib_invoicePdf;
  "lib/org": typeof lib_org;
  "lib/stripe": typeof lib_stripe;
  orgBranding: typeof orgBranding;
  seed: typeof seed;
  services: typeof services;
  stripeSync: typeof stripeSync;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
