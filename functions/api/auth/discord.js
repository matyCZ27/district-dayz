const CLIENT_ID = "1552069081778098316";
const REDIRECT_URI = "https://district-dgt.pages.dev/api/auth/discord";

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 1. Zahájení Discord přihlášení
  if (!url.searchParams.has("code")) {
    const state = crypto.randomUUID();

    const discordUrl =
      "https://discord.com/oauth2/authorize" +
      "?client_id=" + CLIENT_ID +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
      "&scope=identify" +
      "&state=" + state;

    return new Response(null, {
      status: 302,
      headers: {
        Location: discordUrl,
        "Set-Cookie":
          `discord_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
      }
    });
  }

  // 2. Návrat z Discordu
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookies = getCookies(context.request);

  if (!state || !cookies.discord_state || state !== cookies.discord_state) {
    return new Response("Neplatné přihlášení.", { status: 403 });
  }

  // 3. Výměna code za Discord access token
  const tokenResponse = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: context.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    }
  );

  if (!tokenResponse.ok) {
    return new Response("Discord přihlášení se nepodařilo.", {
      status: 500
    });
  }

  const tokenData = await tokenResponse.json();

  // 4. Načtení Discord uživatele
  const userResponse = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization:
          `${tokenData.token_type} ${tokenData.access_token}`
      }
    }
  );

  if (!userResponse.ok) {
    return new Response("Nepodařilo se načíst Discord účet.", {
      status: 500
    });
  }

  const user = await userResponse.json();
// Uložení / aktualizace hráče v D1
await context.env.DB.prepare(`
  INSERT INTO players (
    discord_id,
    discord_username
  )
  VALUES (?, ?)
  ON CONFLICT(discord_id)
  DO UPDATE SET
    discord_username = excluded.discord_username
`)
.bind(
  user.id,
  user.global_name || user.username
)
.run();
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // 5. Data uložená do session
  const sessionData = {
    id: user.id,
    username: user.username,
    global_name: user.global_name || user.username,
    avatar: avatarUrl
  };

  const sessionPayload = base64url(
    JSON.stringify(sessionData)
  );

  const signature = await sign(
    sessionPayload,
    context.env.SESSION_SECRET
  );

  const sessionCookie =
    `district_session=${sessionPayload}.${signature}; ` +
    `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;

  // 6. Přesměrování na profil
 const headers = new Headers();

headers.set("Location", "/Pages/profile.html");

headers.append(
  "Set-Cookie",
  sessionCookie
);

headers.append(
  "Set-Cookie",
  "discord_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
);

return new Response(null, {
  status: 302,
  headers
}); 
}


// -------------------------
// Pomocné funkce
// -------------------------

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


function base64url(value) {
  const bytes = new TextEncoder().encode(value);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
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
