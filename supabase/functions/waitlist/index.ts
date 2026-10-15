// Launch list signup for trackmypoops.app.
// The form on the home page posts {email, platform, website} here, and this adds the email to Resend as a contact.
//
// Edge Function secrets (Supabase dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY     required. A Resend key with Full access (a sending-only key can't add contacts).
//   RESEND_SEGMENT_ID  optional. Puts every signup in this Resend segment, so a launch broadcast can go to it.
//   WAITLIST_FROM      optional. If set (for example "Track My Poops <hello@trackmypoops.app>" on a domain verified
//                      in Resend), new signups also get a short "you're on the list" email.
// Optional Resend contact property: "platform" (string). If it exists, signups are tagged iphone or android.
//
// Deployed with verify_jwt = false on purpose: it's a public signup form. It only accepts browser requests from
// trackmypoops.app, ignores bots that fill the hidden "website" field, and never logs email addresses.

const ALLOWED = new Set(["https://trackmypoops.app", "https://www.trackmypoops.app"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED.has(origin) ? origin : "https://trackmypoops.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

const CONFIRM_TEXT = [
  "You're on the Track My Poops launch list.",
  "",
  "We'll email you when the app is out. That's the whole plan.",
  "",
  "Until then: trackmypoops.app",
  "",
  "Track My Poops",
  "The poop tracker from 1998.",
].join("\n");

const CONFIRM_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#000">
<p style="margin:0 0 14px">You're on the Track My Poops launch list.</p>
<p style="margin:0 0 14px">We'll email you when the app is out. That's the whole plan.</p>
<p style="margin:0 0 14px">Until then: <a href="https://trackmypoops.app" style="color:#0000ee">trackmypoops.app</a></p>
<p style="margin:0"><strong>Track My Poops</strong><br>The poop tracker from 1998.</p>
</div>`;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ ok: false, error: "method" }, 405, origin);
  if (!origin || !ALLOWED.has(origin)) return reply({ ok: false, error: "origin" }, 403, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "bad_request" }, 400, origin);
  }
  // Hidden field people never see. Bots fill in everything, so pretend it worked and drop it.
  if (typeof body.website === "string" && body.website.trim() !== "") return reply({ ok: true }, 200, origin);

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return reply({ ok: false, error: "email" }, 400, origin);
  const platform = body.platform === "android" ? "android" : "iphone";

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return reply({ ok: false, error: "not_configured" }, 500, origin);
  const segment = Deno.env.get("RESEND_SEGMENT_ID");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const contact: Record<string, unknown> = { email, unsubscribed: false };
  if (segment) contact.segments = [{ id: segment }];

  async function createContact(withPlatform: boolean) {
    const payload = withPlatform ? { ...contact, properties: { platform } } : contact;
    const r = await fetch("https://api.resend.com/contacts", { method: "POST", headers, body: JSON.stringify(payload) });
    return { r, text: await r.text() };
  }

  // Try with the platform tag first. If the "platform" property isn't set up in Resend, save the email without it.
  let { r, text } = await createContact(true);
  if (!r.ok && /propert/i.test(text)) ({ r, text } = await createContact(false));
  const already = !r.ok && /already|exist|duplicate/i.test(text);
  if (!r.ok && !already) {
    console.error("resend contacts error", r.status, text.replace(/[^\s"]+@[^\s"]+/g, "[email]").slice(0, 300));
    return reply({ ok: false, error: "resend" }, 502, origin);
  }

  const from = Deno.env.get("WAITLIST_FROM");
  if (from && !already) {
    const e = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: "trackmypoops@gmail.com",
        subject: "You're on the list",
        text: CONFIRM_TEXT,
        html: CONFIRM_HTML,
      }),
    });
    if (!e.ok) console.error("resend email error", e.status);
  }

  return reply({ ok: true, already }, 200, origin);
});
