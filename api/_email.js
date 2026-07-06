function getBaseUrl(req) {
  const configuredUrl = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/+$/, "");
  const host = req?.headers?.host || "localhost:3000";
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildInviteUrl(req, token, email) {
  const params = new URLSearchParams({ invite: token, email });
  return `${getBaseUrl(req)}/?${params.toString()}`;
}

function getInviteEmailHtml({ name, inviteUrl, role }) {
  const safeName = escapeHtml(name || "there");
  const safeRole = escapeHtml(role || "USER");
  const safeInviteUrl = escapeHtml(inviteUrl);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">You're invited to Pipeline</h1>
      <p>Hello ${safeName},</p>
      <p>You were invited to join the Chaim Glass pipeline workspace with <strong>${safeRole}</strong> access.</p>
      <p style="margin:28px 0">
        <a href="${safeInviteUrl}" style="background:#0646ad;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:700">Create your account</a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p style="word-break:break-all"><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>
      <p>This invite expires in 7 days.</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendInviteEmail(req, { to, name, role, token }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured in Vercel.");
  const inviteUrl = buildInviteUrl(req, token, to);
  const from = String(process.env.RESEND_FROM_EMAIL || "Pipeline <onboarding@resend.dev>").trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Create your Pipeline account",
      html: getInviteEmailHtml({ name, inviteUrl, role }),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Invite email could not be sent.");
  return { id: payload?.id, inviteUrl };
}

module.exports = {
  buildInviteUrl,
  sendInviteEmail,
};
