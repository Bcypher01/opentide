import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// web-push + the cron logic need Node APIs.
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
