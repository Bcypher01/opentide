import { Inngest } from "inngest";

// Single Inngest client for the app. In production, INNGEST_EVENT_KEY and
// INNGEST_SIGNING_KEY are provided by the Vercel ↔ Inngest integration; locally
// the Inngest dev server needs no keys.
export const inngest = new Inngest({ id: "opentide" });
