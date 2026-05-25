import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { Resend } from "resend";
import type { Id } from "./_generated/dataModel";
import { withOrg } from "./lib/org";

const feedbackTopicValidator = v.union(
  v.literal("bug"),
  v.literal("feature_request"),
  v.literal("usability"),
  v.literal("billing"),
  v.literal("general"),
);

const feedbackSentimentValidator = v.optional(
  v.union(
    v.literal("frustrated"),
    v.literal("neutral"),
    v.literal("excited"),
    v.literal("love_it"),
  ),
);

const notificationStatusValidator = v.union(
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);

type FeedbackTopic =
  | "bug"
  | "feature_request"
  | "usability"
  | "billing"
  | "general";

type FeedbackSentiment =
  | "frustrated"
  | "neutral"
  | "excited"
  | "love_it";

type NotificationStatus = "sent" | "failed" | "skipped";

type NotificationResult =
  | { status: "sent" }
  | {
      status: "failed" | "skipped";
      reason: string;
    };

function isValidEmailAddress(value?: string): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeOptionalString(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

function normalizeTopic(value: FeedbackTopic): FeedbackTopic {
  return value;
}

function normalizeSentiment(value: FeedbackSentiment | undefined): FeedbackSentiment | undefined {
  return value;
}

function labelForTopic(topic: FeedbackTopic): string {
  switch (topic) {
    case "bug":
      return "Bug report";
    case "feature_request":
      return "Feature request";
    case "usability":
      return "Usability";
    case "billing":
      return "Billing";
    case "general":
    default:
      return "General feedback";
  }
}

function labelForSentiment(sentiment: FeedbackSentiment | undefined): string {
  switch (sentiment) {
    case "frustrated":
      return "Frustrated";
    case "excited":
      return "Excited";
    case "love_it":
      return "Love it";
    case "neutral":
    default:
      return "Neutral";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMultilineText(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function parseNotificationRecipients(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => isValidEmailAddress(item)),
    ),
  );
}

function renderFeedbackNotificationEmail(input: {
  orgDisplayName: string;
  submittedByName: string;
  submittedByEmail?: string;
  topic: FeedbackTopic;
  sentiment?: FeedbackSentiment;
  message: string;
  pagePath?: string;
  pageUrl?: string;
  createdAt: number;
}): string {
  const details: Array<{ label: string; value: string }> = [
    { label: "Organization", value: input.orgDisplayName },
    { label: "Submitted by", value: input.submittedByName },
    { label: "Topic", value: labelForTopic(input.topic) },
    { label: "Sentiment", value: labelForSentiment(input.sentiment) },
    { label: "Submitted at", value: formatTimestamp(input.createdAt) },
  ];

  if (input.submittedByEmail) {
    details.splice(2, 0, { label: "Email", value: input.submittedByEmail });
  }

  if (input.pagePath) {
    details.push({ label: "Page", value: input.pagePath });
  }

  return `
    <div style="background:#0f1115;padding:32px;font-family:Inter,Arial,sans-serif;color:#f5f7fa;">
      <div style="max-width:640px;margin:0 auto;background:#151922;border:1px solid #232938;border-radius:20px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(135deg,#1e2433,#12161f);border-bottom:1px solid #232938;">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(96,165,250,0.12);color:#93c5fd;font-size:12px;font-weight:600;letter-spacing:0.02em;">
            Dashboard feedback
          </div>
          <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.2;color:#ffffff;">New feedback from ${escapeHtml(
            input.orgDisplayName,
          )}</h1>
          <p style="margin:0;color:#a6b0c3;font-size:14px;line-height:1.6;">
            A user submitted feedback from the dashboard. Details are below and the full record is stored in Convex.
          </p>
        </div>

        <div style="padding:24px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:18px;">
            ${details
              .map(
                (item) => `
                  <div style="padding:14px 16px;border-radius:14px;background:#10141c;border:1px solid #232938;">
                    <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7f8aa3;margin-bottom:6px;">${escapeHtml(
                      item.label,
                    )}</div>
                    <div style="font-size:14px;line-height:1.5;color:#f5f7fa;">${escapeHtml(item.value)}</div>
                  </div>
                `,
              )
              .join("")}
          </div>

          <div style="padding:18px;border-radius:16px;background:#0f131b;border:1px solid #232938;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7f8aa3;margin-bottom:10px;">Message</div>
            <div style="font-size:15px;line-height:1.7;color:#f5f7fa;">${formatMultilineText(
              input.message,
            )}</div>
          </div>

          ${
            input.pageUrl
              ? `
                <div style="margin-top:18px;">
                  <a href="${escapeHtml(
                    input.pageUrl,
                  )}" style="display:inline-flex;align-items:center;padding:11px 16px;border-radius:12px;background:#f5f7fa;color:#0f1115;text-decoration:none;font-weight:600;">
                    Open source page
                  </a>
                </div>
              `
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

async function sendFeedbackNotification(input: {
  orgDisplayName: string;
  submittedByName: string;
  submittedByEmail?: string;
  topic: FeedbackTopic;
  sentiment?: FeedbackSentiment;
  message: string;
  pagePath?: string;
  pageUrl?: string;
  createdAt: number;
}): Promise<NotificationResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const recipients = parseNotificationRecipients(process.env.FEEDBACK_NOTIFICATION_EMAIL);

  if (!resendApiKey || !resendFromEmail) {
    return {
      status: "skipped",
      reason: "missing_resend_config",
    };
  }

  if (recipients.length === 0) {
    return {
      status: "skipped",
      reason: "missing_feedback_recipient",
    };
  }

  const resend = new Resend(resendApiKey);

  try {
    await resend.emails.send({
      from: resendFromEmail,
      to: recipients,
      subject: `[${input.orgDisplayName}] ${labelForTopic(input.topic)}`,
      html: renderFeedbackNotificationEmail(input),
      ...(isValidEmailAddress(input.submittedByEmail)
        ? { replyTo: input.submittedByEmail }
        : {}),
    });

    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export const getOrgBrandingForNotification = internalQuery({
  args: {
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
  },
});

export const createFeedbackRecord = internalMutation({
  args: {
    orgId: v.string(),
    orgDisplayName: v.string(),
    submittedByUserId: v.optional(v.string()),
    submittedByName: v.string(),
    submittedByEmail: v.optional(v.string()),
    topic: feedbackTopicValidator,
    sentiment: feedbackSentimentValidator,
    message: v.string(),
    pagePath: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"feedback">> => {
    const now = Date.now();

    return await ctx.db.insert("feedback", {
      ...args,
      flaggedForReview: true,
      status: "new",
      notificationStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFeedbackNotificationStatus = internalMutation({
  args: {
    feedbackId: v.id("feedback"),
    notificationStatus: notificationStatusValidator,
    notificationError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.feedbackId, {
      notificationStatus: args.notificationStatus,
      notificationError: args.notificationError,
      notificationSentAt: args.notificationStatus === "sent" ? now : undefined,
      updatedAt: now,
    });
  },
});

export const submit = action({
  args: {
    topic: feedbackTopicValidator,
    sentiment: feedbackSentimentValidator,
    message: v.string(),
    pagePath: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    withOrg(ctx, async (orgId) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized");
      }

      const identityClaims = identity as Record<string, string | undefined>;
      const orgBranding = await ctx.runQuery("feedback:getOrgBrandingForNotification" as any, {
        orgId,
      });
      const orgDisplayName =
        orgBranding?.displayName?.trim() ||
        orgBranding?.shortName?.trim() ||
        "Agency";
      const submittedByName =
        [
          identityClaims.given_name?.trim(),
          identityClaims.family_name?.trim(),
        ]
          .filter((value): value is string => !!value)
          .join(" ") ||
        identityClaims.name?.trim() ||
        identityClaims.nickname?.trim() ||
        "Unknown user";
      const submittedByEmail = normalizeOptionalString(
        identityClaims.email?.toLowerCase(),
        255,
      );
      const message = args.message.trim();

      if (message.length < 3) {
        throw new Error("Feedback message must be at least 3 characters.");
      }

      const pagePath = normalizeOptionalString(args.pagePath, 255);
      const pageUrl = normalizeOptionalString(args.pageUrl, 1024);
      const feedbackId = await ctx.runMutation("feedback:createFeedbackRecord" as any, {
        orgId,
        orgDisplayName,
        submittedByUserId: normalizeOptionalString(identity.subject, 255),
        submittedByName,
        submittedByEmail,
        topic: normalizeTopic(args.topic),
        sentiment: normalizeSentiment(args.sentiment),
        message: message.slice(0, 4000),
        pagePath,
        pageUrl,
      });
      const createdAt = Date.now();
      const notification = await sendFeedbackNotification({
        orgDisplayName,
        submittedByName,
        submittedByEmail,
        topic: args.topic,
        sentiment: args.sentiment,
        message: message.slice(0, 4000),
        pagePath,
        pageUrl,
        createdAt,
      });

      await ctx.runMutation("feedback:updateFeedbackNotificationStatus" as any, {
        feedbackId,
        notificationStatus: notification.status,
        notificationError: notification.status === "sent" ? undefined : notification.reason,
      });

      return {
        feedbackId,
        notificationStatus: notification.status as NotificationStatus,
        notificationError: notification.status === "sent" ? undefined : notification.reason,
      };
    }),
});
