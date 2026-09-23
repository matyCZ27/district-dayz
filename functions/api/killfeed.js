export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const log = String(body.log || "").trim();

    if (!log) {
      return json({
        success: false,
        error: "Chybí log."
      }, 400);
    }

    /*
     * DayZ kill log:
     *
     * 00:08:48 | Player "victim" (DEAD) (id=VICTIM_ID pos=<...>)
     * killed by Player "killer" (id=KILLER_ID pos=<...>)
     * with M70 Tundra from 231.115 meters
     */

    const regex =
      /(\d{2}:\d{2}:\d{2})\s*\|\s*Player "([^"]+)"\s*\(DEAD\)\s*\(id=([^\s]+)\s+pos=<[^>]+>\)\s*killed by Player "([^"]+)"\s*\(id=([^\s]+)\s+pos=<[^>]+>\)\s*with (.+?) from ([\d.]+)\s+meters?/;

    const match = log.match(regex);

    if (!match) {
      return json({
        success: false,
        error: "Kill nebyl rozpoznán.",
        received: log
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

    const cleanWeapon = weapon.trim();
    const numericDistance = Number(distance);

    /*
     * Zabráníme dvojímu započítání stejného killu.
     * Kontrolujeme kombinaci času + killer ID + victim ID.
     */

    const existing = await context.env.DB.prepare(`
      SELECT id
      FROM kill_events
      WHERE event_time = ?
        AND killer_id = ?
        AND victim_id = ?
      LIMIT 1
    `)
      .bind(
        eventTime,
        killerId,
        victimId
      )
      .first();

    if (existing) {
      return json({
        success: true,
        duplicate: true,
        message: "Tento kill už byl uložen.",
        kill_event_id: existing.id
      });
    }

    /*
     * Uložíme kill do historie.
     */

    const inserted = await context.env.DB.prepare(`
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
        cleanWeapon,
        numericDistance
      )
      .run();

    /*
     * Přičteme kill podle DayZ ID.
     * To je spolehlivější než PSN jméno.
     */

    const killerUpdate = await context.env.DB.prepare(`
      UPDATE players
      SET kills = kills + 1
      WHERE psn_username = ?
    `)
      .bind(killerName)
      .run();

    /*
     * Přičteme death oběti.
     */

    const victimUpdate = await context.env.DB.prepare(`
      UPDATE players
      SET deaths = deaths + 1
      WHERE psn_username = ?
    `)
      .bind(victimName)
      .run();

    return json({
      success: true,

      duplicate: false,

      kill: {
        id: inserted.meta?.last_row_id || null,
        time: eventTime,

        killer: {
          name: killerName,
          id: killerId,
          updated: killerUpdate.meta?.changes || 0
        },

        victim: {
          name: victimName,
          id: victimId,
          updated: victimUpdate.meta?.changes || 0
        },

        weapon: cleanWeapon,
        distance: numericDistance
      }
    });

  } catch (error) {

    return json({
      success: false,
      error: error.message || "Neznámá chyba."
    }, 500);
  }
}


function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
