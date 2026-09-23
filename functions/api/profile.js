export async function onRequest(context) {
  const cookies = getCookies(context.request);

  if (!cookies.district_session) {
    return json({ loggedIn: false });
  }

  const [payload, signature] =
    cookies.district_session.split(".");

  if (!payload || !signature) {
    return json({ loggedIn: false }, 401);
  }

  const expectedSignature = await sign(
    payload,
    context.env.SESSION_SECRET
  );

  if (signature !== expectedSignature) {
    return json({ loggedIn: false }, 401);
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
    return json({ loggedIn: false }, 401);
  }

  const result = await context.env.DB.prepare(`
    SELECT
      discord_id,
      discord_username,
      psn_username,
      kills,
      deaths,
      clan,
      vip,
      coins
    FROM players
    WHERE discord_id = ?
  `)
  .bind(session.id)
  .first();

  if (!result) {
    return json({ loggedIn: false }, 404);
  }

  return json({
    loggedIn: true,
    player: result,
    discord: {
      id: session.id,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar
    }
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
