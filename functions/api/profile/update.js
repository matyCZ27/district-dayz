export async function onRequestPost(context) {
  const cookies = getCookies(context.request);

  if (!cookies.district_session) {
    return json({ success: false, error: "Nejsi přihlášený." }, 401);
  }

  const [payload, signature] = cookies.district_session.split(".");

  if (!payload || !signature) {
    return json({ success: false, error: "Neplatná session." }, 401);
  }

  const expectedSignature = await sign(
    payload,
    context.env.SESSION_SECRET
  );

  if (signature !== expectedSignature) {
    return json({ success: false, error: "Neplatná session." }, 401);
  }

  let session;

  try {
    session = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            payload.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - payload.length % 4) % 4)
          ),
          c => c.charCodeAt(0)
        )
      )
    );
  } catch {
    return json({ success: false, error: "Neplatná session." }, 401);
  }

  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ success: false, error: "Neplatná data." }, 400);
  }

  const psn = String(body.psn_username || "").trim();

  if (psn.length < 3 || psn.length > 16) {
    return json({
      success: false,
      error: "PSN jméno musí mít 3–16 znaků."
    }, 400);
  }

  await context.env.DB.prepare(`
    UPDATE players
    SET psn_username = ?
    WHERE discord_id = ?
  `)
  .bind(psn, session.id)
  .run();

  return json({
    success: true,
    psn_username: psn
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function getCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key) {
      cookies[key] = value.join("=");
    }
  }

  return cookies;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  let binary = "";

  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
