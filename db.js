const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable DATABASE_URL (conexión a Postgres).');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const needsSsl = process.env.PGSSL === 'true' || /sslmode=require/.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id            SERIAL PRIMARY KEY,
      nombre        TEXT NOT NULL,
      telefono      TEXT NOT NULL DEFAULT '',
      entrega       TEXT NOT NULL DEFAULT 'retiro' CHECK (entrega IN ('envio','retiro')),
      direccion     TEXT NOT NULL DEFAULT '',
      recibe        TEXT NOT NULL DEFAULT '',
      fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
      hora          TEXT NOT NULL DEFAULT '',
      dedicatoria   TEXT NOT NULL DEFAULT '',
      notas         TEXT NOT NULL DEFAULT '',
      tomado_por    TEXT NOT NULL DEFAULT '',
      estado        TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','listo','entregado','cancelado')),
      proveedor_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS items (
      id         SERIAL PRIMARY KEY,
      pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      cantidad   NUMERIC(10,2) NOT NULL DEFAULT 1,
      producto   TEXT NOT NULL,
      orden      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS pedidos_fecha_idx ON pedidos (fecha);
    CREATE INDEX IF NOT EXISTS items_pedido_idx ON items (pedido_id);
  `);
}

module.exports = { pool, migrate };
