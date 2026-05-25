"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAction } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";

const feedbackTopics = [
  { value: "general", label: "General feedback" },
  { value: "bug", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "usability", label: "Usability" },
  { value: "billing", label: "Billing" },
] as const;

const sentimentOptions = [
  { value: "frustrated", label: "Frustrated" },
  { value: "neutral", label: "Neutral" },
  { value: "excited", label: "Excited" },
  { value: "love_it", label: "Love it" },
] as const;

type FeedbackTopic = (typeof feedbackTopics)[number]["value"];
type FeedbackSentiment = (typeof sentimentOptions)[number]["value"];

interface FlashMessage {
  kind: "success" | "warning" | "error";
  text: string;
}

interface FeedbackWidgetProps {
  organizationName?: string;
}

const initialTopic: FeedbackTopic = "general";
const initialSentiment: FeedbackSentiment = "neutral";

export function FeedbackWidget({ organizationName = "Agency" }: FeedbackWidgetProps) {
  const pathname = usePathname();
  const submitFeedback = useAction(api.feedback.submit);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topic, setTopic] = useState<FeedbackTopic>(initialTopic);
  const [sentiment, setSentiment] = useState<FeedbackSentiment>(initialSentiment);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  useEffect(() => {
    if (!flashMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFlashMessage(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [flashMessage]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, isSubmitting]);

  const resetForm = () => {
    setTopic(initialTopic);
    setSentiment(initialSentiment);
    setMessage("");
    setFormError(null);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }

    setIsOpen(false);
    setFormError(null);
  };

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();

    if (trimmedMessage.length < 3) {
      setFormError("Share a little more detail so the feedback is actionable.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const result = await submitFeedback({
        topic,
        sentiment,
        message: trimmedMessage,
        pagePath: pathname ?? undefined,
        pageUrl,
      });

      resetForm();
      setIsOpen(false);

      if (result.notificationStatus === "sent") {
        setFlashMessage({
          kind: "success",
          text: "Feedback saved and emailed to you.",
        });
      } else if (result.notificationStatus === "skipped") {
        setFlashMessage({
          kind: "warning",
          text:
            result.notificationError === "missing_feedback_recipient"
              ? "Feedback saved in Convex. Add FEEDBACK_NOTIFICATION_EMAIL to receive notifications."
              : "Feedback saved in Convex. Email delivery needs RESEND_API_KEY and RESEND_FROM_EMAIL.",
        });
      } else {
        setFlashMessage({
          kind: "warning",
          text: "Feedback saved in Convex, but the Resend notification failed.",
        });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to submit feedback right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[45] sm:bottom-auto sm:top-6 sm:right-6 lg:right-8">
        <div className="flex flex-col items-end gap-3">
          {flashMessage && (
            <div
              className={`max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
                flashMessage.kind === "success"
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-50"
                  : flashMessage.kind === "error"
                    ? "border-red-400/30 bg-red-500/10 text-red-50"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {flashMessage.kind === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                )}
                <p>{flashMessage.text}</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={`group inline-flex items-center gap-3 rounded-[22px] border px-4 py-3 text-left text-white shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 ${
              isOpen
                ? "border-sky-400/80 bg-[#171b24] ring-2 ring-sky-400/60"
                : "border-white/10 bg-[#12161f]/95 hover:bg-[#181d28]"
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 transition-colors group-hover:bg-white/12">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-[15px] font-semibold leading-none">Give Feedback</div>
              <div className="mt-1 text-xs text-white/60">Flag it in Convex and notify via Resend</div>
            </div>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDialog} />

          <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-[#10141c] text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] animate-fade-in-up">
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    {organizationName}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Give Feedback</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
                    Share what feels broken, confusing, or worth building next. We&apos;ll store it in Convex and send you a Resend notification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close feedback dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Topic
                  </label>
                  <select
                    value={topic}
                    onChange={(event) => setTopic(event.target.value as FeedbackTopic)}
                    className="input-field w-full appearance-none bg-white/5 text-white"
                  >
                    {feedbackTopics.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Page
                  </label>
                  <div className="flex min-h-[42px] items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white/72">
                    {pathname || "/dashboard"}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  What happened?
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What did you expect to happen, what actually happened, or what should exist here?"
                  className="input-field min-h-[180px] w-full resize-none bg-white/5 text-white"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-xs text-white/45">
                  <span>Include enough detail that future-you will know what to fix.</span>
                  <span>{message.trim().length}/4000</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  How did it feel?
                </label>
                <div className="flex flex-wrap gap-2">
                  {sentimentOptions.map((option) => {
                    const isActive = sentiment === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSentiment(option.value)}
                        className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? "border-sky-400/60 bg-sky-400/15 text-sky-100"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && <p className="text-sm text-red-300">{formError}</p>}
            </div>

            <div className="flex flex-col gap-3 border-t border-white/8 bg-white/[0.02] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/55">
                Feedback is flagged for review as soon as you send it.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="btn-secondary justify-center border-white/10 bg-white/5 px-5 text-white hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 font-medium text-[#0d1117] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackWidget;
