const CLIENT_ID = "1552069081778098316";
const REDIRECT_URI = "https://district-dgt.pages.dev/api/auth/discord";

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Přihlášení přes Discord
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

  // Výměna autorizačního kódu za Discord token
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

  // Načtení Discord profilu
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

  // Discord avatar
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

  const safeName = escapeHtml(
    user.global_name || user.username
  );

  return new Response(
    `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>District — Profil</title>
<link rel="stylesheet" href="/style.css">
<style>
.profile-card {
  max-width: 700px;
  margin: 40px auto;
  padding: 35px;
  text-align: center;
  border: 1px solid rgba(155,211,91,.25);
  background: rgba(10,14,18,.85);
  border-radius: 18px;
}

.profile-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 3px solid #9bd35b;
  margin-bottom: 20px;
}

.profile-name {
  font-size: 30px;
  font-weight: 700;
}

.profile-discord {
  opacity: .65;
  margin-top: 6px;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 30px;
}

.stat {
  padding: 18px;
  background: rgba(255,255,255,.04);
  border-radius: 12px;
}

.stat strong {
  display: block;
  font-size: 24px;
}
</style>
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

<section class="profile-card">

  <div class="eyebrow">DISTRICT / PROFILE</div>

  <img
    class="profile-avatar"
    src="${avatarUrl}"
    alt="Discord avatar"
  >

  <div class="profile-name">
    ${safeName}
  </div>

  <div class="profile-discord">
    Discord ID: ${user.id}
  </div>

  <div class="profile-stats">

    <div class="stat">
      <strong>—</strong>
      KILLS
    </div>

    <div class="stat">
      <strong>—</strong>
      DEATHS
    </div>

    <div class="stat">
      <strong>—</strong>
      K/D
    </div>

  </div>

  <br><br>

  <a href="/">← Zpět na District</a>

</section>

</main>

</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Set-Cookie":
          "discord_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
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
