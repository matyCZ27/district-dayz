export async function onRequest(context) {
  const cookies = getCookies(context.request);

  if (!cookies.district_session) {
    return new Response(
      JSON.stringify({ loggedIn: false }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const [payload, signature] =
    cookies.district_session.split(".");

  if (!payload || !signature) {
    return unauthorized();
  }

  const expectedSignature = await sign(
    payload,
    context.env.SESSION_SECRET
  );

  if (signature !== expectedSignature) {
    return unauthorized();
  }

  try {
    const user = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            payload
              .replace(/-/g, "+")
              .replace(/_/g, "/") +
            "=".repeat((4 - payload.length % 4) % 4)
          ),
          c => c.charCodeAt(0)
        )
      )
    );

    return new Response(
      JSON.stringify({
        loggedIn: true,
        user
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch {
    return unauthorized();
  }
}

function unauthorized() {
  return new Response(
    JSON.stringify({ loggedIn: false }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
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
