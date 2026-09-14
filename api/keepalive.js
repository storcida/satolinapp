/**
 * KEEP-ALIVE — evita que Supabase pause el proyecto por inactividad.
 *
 * Los proyectos free se pausan tras ~7 dias sin actividad. Este endpoint
 * ejecuta una consulta trivial contra la base; lo que importa no es el
 * resultado sino que la consulta ocurra.
 *
 * Lo dispara Vercel Cron (ver "crons" en vercel.json). Vercel manda
 * `Authorization: Bearer $CRON_SECRET` cuando esa variable de entorno existe.
 *
 * NO usa claves secretas: la publishable key ya es publica por diseño y la
 * RLS filtra todo. La consulta igual llega a Postgres, que es lo unico que
 * necesitamos para que cuente como actividad.
 */

const SUPABASE_URL = 'https://hahhmpvfyrmwnaqxibvt.supabase.co';
const ANON_KEY     = 'sb_publishable_WTjwtY_ghLdfShnDhkqHUA_u_1Hn762';

export default async function handler(req, res) {
  // Si CRON_SECRET esta configurado, exigirlo. Sin esto el endpoint queda
  // publico y cualquiera puede martillarlo.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const inicio = Date.now();
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/categorias?select=id&limit=1`,
      { headers: { apikey: ANON_KEY, Accept: 'application/json' } }
    );

    const ms = Date.now() - inicio;

    if (!r.ok && r.status !== 200) {
      console.error('[keepalive] respuesta inesperada', r.status);
      return res.status(502).json({ ok: false, status: r.status, ms });
    }

    console.log(`[keepalive] ok en ${ms}ms`);
    return res.status(200).json({
      ok: true,
      ms,
      en: new Date().toISOString()
    });
  } catch (e) {
    console.error('[keepalive] fallo', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
