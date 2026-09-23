export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const log = String(body.log || "");

    if (!log) {
      return json({
        success: false,
        error: "Chybí log."
      }, 400);
    }

    const regex =
      /(\d{2}:\d{2}:\d{2}).*Player "([^"]+)" \(DEAD\) \(id=([^ ]+).*?\) killed by Player "([^"]+)" \(id=([^ ]+).*?\) with (.+?) from ([\d.]+) meters?/;

    const match = log.match(regex);

    if (!match) {
      return json({
        success: false,
        error: "Kill nebyl rozpoznán."
      }, 400);
    }

    const [
      ,
      eventTime,
      victimName,
      victimId,
      killerName,
      killerId,
      weapon,
      distance
    ] = match;

    await context.env.DB.prepare(`
      INSERT INTO kill_events (
        event_time,
        killer_name,
        killer_id,
        victim_name,
        victim_id,
        weapon,
        distance
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      eventTime,
      killerName,
      killerId,
      victimName,
      victimId,
      weapon.trim(),
      Number(distance)
    )
    .run();

    await context.env.DB.prepare(`
      UPDATE players
      SET kills = kills + 1
      WHERE psn_username = ?
    `)
    .bind(killerName)
    .run();

    await context.env.DB.prepare(`
      UPDATE players
      SET deaths = deaths + 1
      WHERE psn_username = ?
    `)
    .bind(victimName)
    .run();

    return json({
      success: true,
      kill: {
        time: eventTime,
        killer: killerName,
        victim: victimName,
        weapon: weapon.trim(),
        distance: Number(distance)
      }
    });

  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
