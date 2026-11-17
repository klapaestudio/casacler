# Casa Cler · Agenda de pedidos

Webapp para tomar los pedidos de la florería Casa Cler desde cualquier computadora o celular. Los datos se guardan en una base Postgres, así que todas las personas ven lo mismo y nada depende de un equipo en particular.

## Qué hace

- **Pedidos del día <3.** Muestra los pedidos de un día como comandas, con filtros por estado (pendiente, listo o entregado), por envío o retiro, y un buscador. Tocando el estado de un pedido pasa al siguiente. Tocando el nombre se abre para editarlo. La lista se actualiza sola cada 15 segundos.
- **Nuevo pedido.** Pide nombre, teléfono, los productos con su cantidad, envío o retiro (con dirección y quién recibe), día y horario, dedicatoria para la tarjeta, notas y quién tomó el pedido. Los productos se autocompletan con los que ya se cargaron, así se escriben siempre igual.
- **Pedido a proveedor.** Elegís los pedidos (por día, mañana, próximos 7 días, un rango de fechas o los que tildaste en el tablero) y suma cada producto. Se puede copiar como texto para WhatsApp, imprimir y marcar esos pedidos como "ya pedido al proveedor".
- Funciona en compu y celular.

## Publicarla en Railway

1. En Railway: **New Project → Deploy from GitHub repo → `klapaestudio/casacler`**.
2. En el mismo proyecto: **New → Database → PostgreSQL**.
3. En el servicio de la app, pestaña **Variables**, agregá:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (la referencia a la base)
   - `APP_PASSWORD` = la contraseña que van a usar en Casa Cler para entrar
   - `SESSION_SECRET` = cualquier texto largo al azar
4. En **Settings → Networking → Generate Domain** para tener el link (o conectá un dominio propio).

Las tablas se crean solas al arrancar. La sesión dura 90 días por dispositivo.

## Correrla en local

```bash
npm install
DATABASE_URL=postgres://... APP_PASSWORD=algo npm run dev
# http://localhost:3000
```

## Estructura

- `server.js`: API (Express) y login con contraseña compartida
- `db.js`: conexión a Postgres y creación de tablas (`pedidos`, `items`)
- `public/`: la app (HTML, CSS y JS sin frameworks), con tipografías y la flor del logo
