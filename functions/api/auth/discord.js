const CLIENT_ID = "1552069081778098316";
const REDIRECT_URI = "https://district-dgt.pages.dev/api/auth/discord";

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Začátek přihlášení
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
          "discord_state=" + state +
          "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600"
      }
    });
  }

  // Návrat z Discordu
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookies = context.request.headers.get("Cookie") || "";
  const savedState = cookies
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("discord_state="))
    ?.split("=")[1];

  if (!state || !savedState || state !== savedState) {
    return new Response("Neplatné přihlášení.", { status: 403 });
  }

  // Výměna kódu za Discord token
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
        code: code,
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

  // Načtení Discord profilu
  const userResponse = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization: `${tokenData.token_type} ${tokenData.access_token}`
      }
    }
  );

  if (!userResponse.ok) {
    return new Response("Nepodařilo se načíst Discord účet.", {
      status: 500
    });
  }

  const user = await userResponse.json();

  return new Response(
    `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>District — Přihlášení</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="bg"></div>

<header class="topbar">
  <a class="brand" href="/">
    DISTRICT
    <span>DAYZ SERVER</span>
  </a>
</header>

<main>
<section class="hero">
  <div class="eyebrow">DISCORD LOGIN</div>
  <h1>PŘIHLÁŠENO</h1>
  <p>Vítej, ${escapeHtml(user.global_name || user.username)}.</p>
  <br>
  <a href="/">← Zpět na hlavní stránku</a>
</section>
</main>

</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=UTF-8"
      }
    }
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
