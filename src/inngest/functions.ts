import { appBaseUrl, runPushCron } from "@/lib/push-cron";
import { pushConfigured } from "@/lib/push-server";
import { inngest } from "./client";

// Primary scheduler for push alerts: runs every 5 minutes. Inngest gives us
// minute-granularity cron (even on free tiers), automatic retries, and a run
// history dashboard — none of which Vercel Hobby cron provides.
export const pushCron = inngest.createFunction(
  { id: "push-cron", name: "Push alert cron" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    if (!pushConfigured()) {
      return { skipped: "push_not_configured" };
    }
    // step.run makes the work a durable, retryable unit in the Inngest UI.
    return step.run("send-due-alerts", () => runPushCron(appBaseUrl()));
  }
);

export const functions = [pushCron];
