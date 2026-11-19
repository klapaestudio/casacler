const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { pool, migrate } = require('./db');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

/* ---------- Acceso con contraseña compartida (opcional) ---------- */
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || PASSWORD || 'casacler';
const COOKIE = 'cc_sesion';
const token = () => crypto.createHmac('sha256', SECRET).update('ok:' + PASSWORD).digest('hex');

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function isAuthed(req) {
  if (!PASSWORD) return true;
  const t = readCookie(req, COOKIE);
  const ok = token();
  return t.length === ok.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ok));
}

const intentos = new Map(); // ip -> {n, hasta}
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const rec = intentos.get(ip) || { n: 0, hasta: 0 };
  if (rec.hasta > Date.now()) return res.status(429).json({ error: 'Demasiados intentos. Probá en un minuto.' });
  const pass = String((req.body && req.body.password) || '');
  const a = Buffer.from(crypto.createHash('sha256').update(pass).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(PASSWORD).digest('hex'));
  if (!PASSWORD || crypto.timingSafeEqual(a, b)) {
    intentos.delete(ip);
    res.setHeader('Set-Cookie', `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${req.secure ? '; Secure' : ''}`);
    return res.json({ ok: true });
  }
  rec.n += 1;
  if (rec.n >= 5) { rec.n = 0; rec.hasta = Date.now() + 60_000; }
  intentos.set(ip, rec);
  res.status(401).json({ error: 'Contraseña incorrecta' });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/sesion', (req, res) => res.json({ ok: isAuthed(req), requierePassword: !!PASSWORD }));

app.use('/api', (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'no autorizado' })));

/* ---------- Helpers ---------- */
const ESTADOS = ['pendiente', 'listo', 'entregado', 'cancelado'];
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const plata = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function limpiarPedido(b) {
  const items = Array.isArray(b.items) ? b.items : [];
  const p = {
    nombre: str(b.nombre, 120),
    telefono: str(b.telefono, 40),
    entrega: b.entrega === 'envio' ? 'envio' : 'retiro',
    direccion: str(b.direccion, 250),
    recibe: str(b.recibe, 120),
    fecha: isDate(b.fecha) ? b.fecha : null,
    hora: str(b.hora, 40),
    dedicatoria: str(b.dedicatoria, 1000),
    notas: str(b.notas, 1000),
    tomado_por: str(b.tomado_por, 60),
    estado: ESTADOS.includes(b.estado) ? b.estado : 'pendiente',
    total: plata(b.total),
    sena: plata(b.sena) || 0,
    pagado: plata(b.pagado) || 0,
    items: items
      .map(i => ({ producto: str(i.producto, 160), cantidad: Math.max(0, Number(i.cantidad) || 0) }))
      .filter(i => i.producto && i.cantidad > 0),
  };
  if (!p.nombre) return { error: 'Falta el nombre' };
  if (!p.fecha) return { error: 'Falta la fecha de entrega' };
  if (!p.items.length) return { error: 'Agregá al menos un producto' };
  if (p.entrega === 'envio' && !p.direccion) return { error: 'Falta la dirección de envío' };
  return { p };
}

const SELECT = `
  SELECT p.*, to_char(p.fecha,'YYYY-MM-DD') AS fecha,
    p.total::float AS total, p.sena::float AS sena, p.pagado::float AS pagado,
    COALESCE(json_agg(json_build_object('producto', i.producto, 'cantidad', i.cantidad::float) ORDER BY i.orden)
      FILTER (WHERE i.id IS NOT NULL), '[]') AS items
  FROM pedidos p LEFT JOIN items i ON i.pedido_id = p.id`;

async function guardarItems(client, id, items) {
  await client.query('DELETE FROM items WHERE pedido_id = $1', [id]);
  for (let k = 0; k < items.length; k++) {
    await client.query('INSERT INTO items (pedido_id, cantidad, producto, orden) VALUES ($1,$2,$3,$4)',
      [id, items[k].cantidad, items[k].producto, k]);
  }
}
async function uno(id) {
  const r = await pool.query(`${SELECT} WHERE p.id = $1 GROUP BY p.id`, [id]);
  return r.rows[0];
}
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Error del servidor' }); });

/* ---------- API ---------- */
// GET /api/pedidos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
app.get('/api/pedidos', wrap(async (req, res) => {
  const desde = isDate(req.query.desde) ? req.query.desde : null;
  const hasta = isDate(req.query.hasta) ? req.query.hasta : desde;
  const where = [], args = [];
  if (desde) { args.push(desde); where.push(`p.fecha >= $${args.length}`); }
  if (hasta) { args.push(hasta); where.push(`p.fecha <= $${args.length}`); }
  const r = await pool.query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY p.id ORDER BY p.fecha, NULLIF(p.hora,'') NULLS LAST, p.id`, args);
  res.json(r.rows);
}));

app.get('/api/pedidos/:id', wrap(async (req, res) => {
  const p = await uno(Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: 'No existe' });
}));

app.post('/api/pedidos', wrap(async (req, res) => {
  const { p, error } = limpiarPedido(req.body || {});
  if (error) return res.status(400).json({ error });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(
      `INSERT INTO pedidos (nombre,telefono,entrega,direccion,recibe,fecha,hora,dedicatoria,notas,tomado_por,estado,total,sena,pagado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [p.nombre, p.telefono, p.entrega, p.direccion, p.recibe, p.fecha, p.hora, p.dedicatoria, p.notas, p.tomado_por, p.estado, p.total, p.sena, p.pagado]);
    await guardarItems(c, r.rows[0].id, p.items);
    await c.query('COMMIT');
    res.status(201).json(await uno(r.rows[0].id));
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

app.put('/api/pedidos/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { p, error } = limpiarPedido(req.body || {});
  if (error) return res.status(400).json({ error });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(
      `UPDATE pedidos SET nombre=$1,telefono=$2,entrega=$3,direccion=$4,recibe=$5,fecha=$6,hora=$7,
         dedicatoria=$8,notas=$9,tomado_por=$10,estado=$11,total=$12,sena=$13,pagado=$14,updated_at=now() WHERE id=$15`,
      [p.nombre, p.telefono, p.entrega, p.direccion, p.recibe, p.fecha, p.hora, p.dedicatoria, p.notas, p.tomado_por, p.estado, p.total, p.sena, p.pagado, id]);
    if (!r.rowCount) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'No existe' }); }
    await guardarItems(c, id, p.items);
    await c.query('COMMIT');
    res.json(await uno(id));
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

app.patch('/api/pedidos/:id/estado', wrap(async (req, res) => {
  const estado = (req.body || {}).estado;
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  const r = await pool.query('UPDATE pedidos SET estado=$1, updated_at=now() WHERE id=$2', [estado, Number(req.params.id)]);
  r.rowCount ? res.json(await uno(Number(req.params.id))) : res.status(404).json({ error: 'No existe' });
}));

// Cambia solo los montos (total, seña, pagado) desde la comanda
app.patch('/api/pedidos/:id/pago', wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [], args = [];
  if ('total' in b) { args.push(plata(b.total)); sets.push(`total=$${args.length}`); }
  if ('sena' in b) { args.push(plata(b.sena) || 0); sets.push(`sena=$${args.length}`); }
  if ('pagado' in b) { args.push(plata(b.pagado) || 0); sets.push(`pagado=$${args.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nada para cambiar' });
  args.push(Number(req.params.id));
  const r = await pool.query(`UPDATE pedidos SET ${sets.join(',')}, updated_at=now() WHERE id=$${args.length}`, args);
  r.rowCount ? res.json(await uno(Number(req.params.id))) : res.status(404).json({ error: 'No existe' });
}));

app.delete('/api/pedidos/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM pedidos WHERE id=$1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// Marca un grupo de pedidos como "ya pedido al proveedor" (o lo desmarca)
app.post('/api/proveedor', wrap(async (req, res) => {
  const ids = ((req.body || {}).ids || []).map(Number).filter(Number.isInteger);
  const marcar = (req.body || {}).marcar !== false;
  if (!ids.length) return res.status(400).json({ error: 'No hay pedidos seleccionados' });
  await pool.query(`UPDATE pedidos SET proveedor_at = ${marcar ? 'now()' : 'NULL'}, updated_at=now() WHERE id = ANY($1)`, [ids]);
  res.json({ ok: true });
}));

// Sugerencias para autocompletar (productos y quién toma pedidos)
app.get('/api/sugerencias', wrap(async (req, res) => {
  const prod = await pool.query(
    `SELECT producto FROM (
       SELECT DISTINCT ON (k) k, producto FROM (
         SELECT lower(trim(producto)) k, trim(producto) producto, count(*) c, max(id) m FROM items GROUP BY 1, 2
       ) x ORDER BY k, c DESC, m DESC
     ) t ORDER BY k LIMIT 500`);
  const who = await pool.query(
    `SELECT tomado_por FROM pedidos WHERE tomado_por <> '' GROUP BY tomado_por ORDER BY max(created_at) DESC LIMIT 20`);
  res.json({ productos: prod.rows.map(r => r.producto), tomadoPor: who.rows.map(r => r.tomado_por) });
}));

/* ---------- Front ---------- */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
migrate()
  .then(() => app.listen(PORT, () => console.log(`Casa Cler · pedidos en http://localhost:${PORT}`)))
  .catch(e => { console.error('No se pudo preparar la base de datos', e); process.exit(1); });
