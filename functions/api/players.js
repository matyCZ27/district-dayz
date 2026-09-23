export async function onRequest(context) {
  try {
    const result = await context.env.DB.prepare(`
      SELECT
        discord_username,
        psn_username,
        kills,
        deaths,
        clan,
        vip,
        coins
      FROM players
      ORDER BY kills DESC, deaths ASC
    `).all();

    return new Response(
      JSON.stringify({
        success: true,
        players: result.results
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        error: "Nepodařilo se načíst hráče."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
