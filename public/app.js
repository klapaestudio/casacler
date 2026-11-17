/* Casa Cler · Agenda de pedidos */
(() => {
  const $app = document.getElementById('app');
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ESTADO_LBL = { pendiente: 'Pendiente', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };
  const SIGUIENTE = { pendiente: 'listo', listo: 'entregado', entregado: 'pendiente', cancelado: 'pendiente' };

  /* ---------- utils ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const hoy = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const largo = s => { const d = parse(s); return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
  const corto = s => { const d = parse(s); return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()}/${d.getMonth() + 1}`; };
  const num = id => String(id).padStart(3, '0');
  const cant = n => (Number.isInteger(+n) ? String(+n) : String(+n).replace('.', ','));
  const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const hora = p => (p.hora ? `&nbsp;·&nbsp; ${esc(p.hora)}` : '');

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401 && !url.includes('/login')) { renderLogin(); throw new Error('auth'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Algo salió mal');
    return data;
  }

  /* ---------- estado ---------- */
  const S = {
    dia: hoy(),
    filtro: 'todos',
    entrega: '',
    q: '',
    pedidos: [],
    sel: new Set(),
    sug: { productos: [], tomadoPor: [] },
    prov: { desde: hoy(), hasta: addDays(hoy(), 6), preset: 'semana', ids: null, lista: [] },
  };

  document.getElementById('hoy').textContent = largo(hoy());

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [, a, b] = h.split('/');
    document.querySelectorAll('#tabs a').forEach(x => x.classList.toggle('on',
      x.dataset.tab === (a === 'nuevo' || a === 'editar' ? 'nuevo' : a === 'proveedor' ? 'proveedor' : 'pedidos')));
    if (a === 'nuevo') return renderForm(null);
    if (a === 'editar' && b) return renderForm(Number(b));
    if (a === 'proveedor') return renderProveedor();
    return renderPedidos();
  }
  window.addEventListener('hashchange', route);

  /* ---------- PEDIDOS DEL DÍA ---------- */
  async function cargarDia() {
    S.pedidos = await api(`/api/pedidos?desde=${S.dia}&hasta=${S.dia}`);
    const vivos = new Set(S.pedidos.map(p => p.id));
    [...S.sel].forEach(id => vivos.has(id) || S.sel.delete(id));
  }

  async function renderPedidos(silencioso) {
    if (!silencioso) $app.innerHTML = '<p class="muted">Cargando…</p>';
    try { await cargarDia(); } catch (e) { if (e.message !== 'auth') $app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    pintarPedidos();
  }

  function filtrados() {
    const q = norm(S.q);
    return S.pedidos.filter(p =>
      (S.filtro === 'todos' ? p.estado !== 'cancelado' : p.estado === S.filtro) &&
      (!S.entrega || p.entrega === S.entrega) &&
      (!q || norm(`${p.nombre} ${p.telefono} ${p.recibe} ${p.items.map(i => i.producto).join(' ')}`).includes(q)));
  }

  function ticket(p, { preview = false } = {}) {
    const sel = S.sel.has(p.id);
    const tel = p.telefono ? (preview ? `<span class="tel">${esc(p.telefono)}</span>` : `<a class="tel" href="tel:${esc(p.telefono.replace(/[^\d+]/g, ''))}">${esc(p.telefono)}</a>`) : '';
    return `<article class="t ${p.estado} ${sel ? 'sel' : ''}" data-id="${p.id || ''}">
      <div class="h"><span class="no"><b>Nº ${p.id ? num(p.id) : '—'}</b>${hora(p)}</span>
        ${preview ? '' : `<button class="box ${sel ? 'on' : ''}" data-act="sel" aria-pressed="${sel}" aria-label="Seleccionar para agrupar"></button>`}</div>
      ${preview ? `<span class="t-name">${esc(p.nombre) || '<span class="muted">Nombre</span>'}</span>` : `<a class="t-name" href="#/editar/${p.id}">${esc(p.nombre)}</a>`}
      ${tel}
      <ul>${p.items.map(i => `<li><span>${cant(i.cantidad)}</span>${esc(i.producto)}</li>`).join('')}</ul>
      ${p.dedicatoria ? `<p class="ded">“${esc(p.dedicatoria)}”</p>` : ''}
      <div class="ft"><span class="tag ${p.entrega === 'envio' ? 'env' : 'ret'}">${p.entrega === 'envio' ? 'Envío' : 'Retira'}</span>
        ${preview ? '' : `<button class="st ${p.estado}" data-act="estado" title="Cambiar estado"><i></i>${ESTADO_LBL[p.estado]}</button>`}</div>
      ${p.entrega === 'envio' && (p.direccion || p.recibe) ? `<div class="addr">${esc(p.direccion)}${p.recibe ? ` · recibe ${esc(p.recibe)}` : ''}</div>` : ''}
      ${p.proveedor_at ? '<div style="margin-top:10px"><span class="tag prov">Pedido al proveedor ✓</span></div>' : ''}
      ${p.tomado_por ? `<div class="who">tomó: ${esc(p.tomado_por)}</div>` : '<div class="who"></div>'}
      <span class="sello" aria-hidden="true"></span>
    </article>`;
  }

  function pintarPedidos() {
    const activos = S.pedidos.filter(p => p.estado !== 'cancelado');
    const lista = filtrados();
    const esHoy = S.dia === hoy();
    document.getElementById('tab-count').textContent = esHoy ? activos.length || '' : '';
    const chip = (k, t) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-f="${k}">${t}</button>`;
    const chipE = (k, t) => `<button class="chip ${S.entrega === k ? 'on' : ''}" data-e="${k}">${t}</button>`;
    const searchFocused = document.activeElement && document.activeElement.id === 'q';
    $app.innerHTML = `
      <div class="head">
        <div>
          <div class="lbl">Agenda de pedidos</div>
          <h1>Pedidos <em>${esHoy ? 'del día' : DIAS[parse(S.dia).getDay()] + ' ' + parse(S.dia).getDate()}</em> <span class="heart">&lt;3</span></h1>
          <div class="daynav">
            <button data-d="-1" aria-label="Día anterior">‹</button>
            <label class="d">${largo(S.dia)}<input type="date" id="pick" value="${S.dia}" aria-label="Elegir día"></label>
            <button data-d="1" aria-label="Día siguiente">›</button>
            ${esHoy ? '' : '<button class="hoy" data-d="0">Hoy</button>'}
          </div>
        </div>
        <div class="filters">
          ${chip('todos', 'Todos')}${chip('pendiente', 'Pendientes')}${chip('listo', 'Listos')}${chip('entregado', 'Entregados')}
          <span class="sep"></span>${chipE('envio', 'Envío')}${chipE('retiro', 'Retiro')}
          <input class="search" id="q" type="search" placeholder="Buscar…" value="${esc(S.q)}" aria-label="Buscar pedido">
        </div>
      </div>
      <div class="stats">
        <div><span class="lbl">Pedidos</span><b>${activos.length}</b></div>
        <div><span class="lbl">Pendientes</span><b class="f">${activos.filter(p => p.estado === 'pendiente').length}</b></div>
        <div><span class="lbl">Para enviar</span><b>${activos.filter(p => p.entrega === 'envio').length}</b></div>
        <div><span class="lbl">Para retirar</span><b>${activos.filter(p => p.entrega === 'retiro').length}</b></div>
      </div>
      ${lista.length ? `<div class="grid">${lista.map(p => ticket(p)).join('')}</div>`
        : `<div class="empty"><div class="flor-xl"></div><p>${S.pedidos.length ? 'Nada con estos filtros.' : 'Todavía no hay pedidos para este día.'}</p><a class="btn" href="#/nuevo">Nuevo pedido</a></div>`}
      ${S.sel.size ? `<div class="bar"><span><b>${S.sel.size}</b>&nbsp; ${S.sel.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
        <button class="x" data-act="limpiar-sel">quitar</button><button class="btn" data-act="agrupar">Agrupar →</button></div>` : ''}`;
    if (searchFocused) { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  $app.addEventListener('click', async e => {
    const el = e.target.closest('[data-f],[data-e],[data-d],[data-act]');
    if (!el || !$app.contains(el)) return;
    if (el.dataset.f) { S.filtro = el.dataset.f; return pintarPedidos(); }
    if ('e' in el.dataset) { S.entrega = S.entrega === el.dataset.e ? '' : el.dataset.e; return pintarPedidos(); }
    if ('d' in el.dataset) { S.dia = el.dataset.d === '0' ? hoy() : addDays(S.dia, Number(el.dataset.d)); return renderPedidos(); }
    const act = el.dataset.act;
    const card = el.closest('.t');
    const id = card && Number(card.dataset.id);
    if (act === 'sel') { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); return pintarPedidos(); }
    if (act === 'limpiar-sel') { S.sel.clear(); return pintarPedidos(); }
    if (act === 'agrupar') {
      S.prov = { ...S.prov, desde: S.dia, hasta: S.dia, preset: 'sel', ids: new Set(S.sel) };
      location.hash = '#/proveedor'; return;
    }
    if (act === 'estado') {
      const p = S.pedidos.find(x => x.id === id);
      const nuevo = SIGUIENTE[p.estado];
      p.estado = nuevo; pintarPedidos();
      try { await api(`/api/pedidos/${id}/estado`, { method: 'PATCH', body: { estado: nuevo } }); toast(`Nº ${num(id)} · ${ESTADO_LBL[nuevo]}`); }
      catch (err) { toast(err.message); renderPedidos(true); }
    }
  });
  $app.addEventListener('input', e => {
    if (e.target.id === 'q') { S.q = e.target.value; pintarPedidos(); }
  });
  $app.addEventListener('change', e => {
    if (e.target.id === 'pick' && e.target.value) { S.dia = e.target.value; renderPedidos(); }
  });
  $app.addEventListener('click', e => {
    const lab = e.target.closest('.daynav .d');
    if (lab) { const i = lab.querySelector('input'); if (i && i.showPicker) { e.preventDefault(); try { i.showPicker(); } catch (_) {} } }
  });

  /* ---------- NUEVO / EDITAR ---------- */
  async function cargarSugerencias() {
    try { S.sug = await api('/api/sugerencias'); } catch (_) {}
  }

  async function renderForm(id) {
    let p = {
      nombre: '', telefono: '', entrega: 'retiro', direccion: '', recibe: '', fecha: S.dia >= hoy() ? S.dia : hoy(), hora: '',
      dedicatoria: '', notas: '', tomado_por: localStorage.getItem('cc_tomado_por') || '', estado: 'pendiente',
      items: [{ cantidad: 1, producto: '' }],
    };
    $app.innerHTML = '<p class="muted">Cargando…</p>';
    await cargarSugerencias();
    if (id) {
      try { p = await api(`/api/pedidos/${id}`); } catch (e) { if (e.message !== 'auth') $app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      if (!p.items.length) p.items = [{ cantidad: 1, producto: '' }];
    }
    const f = p;
    const ahora = new Date();
    $app.innerHTML = `
      <div class="lbl">${id ? `Pedido Nº ${num(id)} · cargado ${new Date(f.created_at).toLocaleDateString('es-AR')}` : `Pedido nuevo · ${pad(ahora.getHours())}:${pad(ahora.getMinutes())} hs`}</div>
      <h1>${id ? 'Editar <em>pedido</em>' : 'Nuevo <em>pedido</em>'}</h1>
      <form class="form" id="form" autocomplete="off" novalidate>
        <div>
          <div class="row2">
            <label class="field"><span class="lbl">Nombre</span><input name="nombre" value="${esc(f.nombre)}" placeholder="Quién hace el pedido" required></label>
            <label class="field"><span class="lbl">Teléfono</span><input name="telefono" type="tel" inputmode="tel" value="${esc(f.telefono)}" placeholder="351 …"></label>
          </div>
          <div class="lbl" style="margin-top:6px">Pedido</div>
          <div class="items" id="items"></div>
          <button type="button" class="add" id="add">+ Agregar producto</button>
          <datalist id="dl-prod">${S.sug.productos.map(x => `<option value="${esc(x)}">`).join('')}</datalist>

          <div class="lbl" style="margin-top:34px">Entrega</div>
          <div class="seg" role="radiogroup">
            <button type="button" data-ent="envio" class="${f.entrega === 'envio' ? 'on' : ''}" role="radio" aria-checked="${f.entrega === 'envio'}">Envío</button>
            <button type="button" data-ent="retiro" class="${f.entrega === 'retiro' ? 'on' : ''}" role="radio" aria-checked="${f.entrega === 'retiro'}">Retira</button>
          </div>
          <div id="envio-box" style="margin-top:22px;${f.entrega === 'envio' ? '' : 'display:none'}">
            <div class="row2">
              <label class="field"><span class="lbl">Dirección</span><input name="direccion" value="${esc(f.direccion)}" placeholder="Calle, número, depto"></label>
              <label class="field"><span class="lbl">Recibe <span class="opt">(opcional)</span></span><input name="recibe" value="${esc(f.recibe)}" placeholder="Nombre de quien recibe"></label>
            </div>
          </div>
          <div class="row2" style="margin-top:${f.entrega === 'envio' ? '0' : '22px'}" id="fecha-row">
            <label class="field"><span class="lbl">Para el día</span><input name="fecha" type="date" value="${esc(f.fecha)}" required></label>
            <label class="field"><span class="lbl">Horario <span class="opt">(opcional)</span></span><input name="hora" value="${esc(f.hora)}" placeholder="11 hs · por la tarde"></label>
          </div>
          <label class="field"><span class="lbl">Dedicatoria / tarjeta <span class="opt">(opcional)</span></span><textarea name="dedicatoria" rows="1" placeholder="Lo que va escrito en la tarjeta">${esc(f.dedicatoria)}</textarea></label>
          <div class="row2">
            <label class="field"><span class="lbl">Notas <span class="opt">(opcional)</span></span><input name="notas" value="${esc(f.notas)}" placeholder="Colores, timbre, seña…"></label>
            <label class="field"><span class="lbl">Tomó el pedido</span><input name="tomado_por" list="dl-who" value="${esc(f.tomado_por)}" placeholder="Tu nombre"></label>
          </div>
          <datalist id="dl-who">${S.sug.tomadoPor.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
          ${id ? `<label class="field"><span class="lbl">Estado</span><select name="estado">${Object.keys(ESTADO_LBL).map(k => `<option value="${k}" ${f.estado === k ? 'selected' : ''}>${ESTADO_LBL[k]}</option>`).join('')}</select></label>` : ''}
          <p class="err" id="err"></p>
          <div class="actions">
            <button class="btn" type="submit" id="guardar">${id ? 'Guardar cambios' : 'Guardar pedido'}</button>
            ${id ? '<a class="btn ghost" href="#/">Volver</a><button type="button" class="btn danger" id="borrar">Eliminar</button>' : '<button type="button" class="btn ghost" id="limpiar">Limpiar</button>'}
          </div>
        </div>
        <aside><div class="preview"><h4>Así queda el pedido</h4><div id="prev"></div></div></aside>
      </form>`;

    const form = document.getElementById('form');
    const $items = document.getElementById('items');
    let entrega = f.entrega;

    const itemRow = (it = { cantidad: 1, producto: '' }) => `<div class="it">
        <input class="q" type="number" min="0" step="1" inputmode="numeric" value="${esc(cant(it.cantidad))}" aria-label="Cantidad">
        <input class="p" list="dl-prod" value="${esc(it.producto)}" placeholder="Escribí un producto…" aria-label="Producto">
        <button type="button" class="del" aria-label="Quitar producto">✕</button></div>`;
    $items.innerHTML = f.items.map(itemRow).join('');

    const leer = () => {
      const fd = Object.fromEntries(new FormData(form));
      return {
        ...fd, entrega, id: id || null, created_at: f.created_at || new Date().toISOString(), proveedor_at: null,
        estado: fd.estado || f.estado,
        items: [...$items.querySelectorAll('.it')].map(r => ({ cantidad: r.querySelector('.q').value, producto: r.querySelector('.p').value.trim() }))
          .filter(i => i.producto),
      };
    };
    const preview = () => {
      const d = leer();
      document.getElementById('prev').innerHTML = ticket({ ...d, estado: 'pendiente', items: d.items.length ? d.items : [{ cantidad: '', producto: '…' }] }, { preview: true })
        + (d.fecha ? `<p class="lbl" style="margin-top:18px">Para el ${esc(largo(d.fecha).toLowerCase())}${d.hora ? ' · ' + esc(d.hora) : ''}</p>` : '');
    };
    preview();

    form.addEventListener('input', preview);
    document.getElementById('add').onclick = () => {
      $items.insertAdjacentHTML('beforeend', itemRow());
      $items.lastElementChild.querySelector('.p').focus();
    };
    $items.addEventListener('click', e => {
      if (!e.target.closest('.del')) return;
      e.target.closest('.it').remove();
      if (!$items.children.length) $items.insertAdjacentHTML('beforeend', itemRow());
      preview();
    });
    $items.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.classList.contains('p')) {
        e.preventDefault();
        const row = e.target.closest('.it');
        if (!row.nextElementSibling) document.getElementById('add').click();
        else row.nextElementSibling.querySelector('.p').focus();
      }
    });
    form.querySelectorAll('[data-ent]').forEach(b => b.onclick = () => {
      entrega = b.dataset.ent;
      form.querySelectorAll('[data-ent]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      document.getElementById('envio-box').style.display = entrega === 'envio' ? '' : 'none';
      document.getElementById('fecha-row').style.marginTop = entrega === 'envio' ? '0' : '22px';
      preview();
    });
    const lim = document.getElementById('limpiar');
    if (lim) lim.onclick = () => renderForm(null);
    const bor = document.getElementById('borrar');
    if (bor) bor.onclick = async () => {
      if (!confirm(`¿Eliminar el pedido Nº ${num(id)} de ${f.nombre}? No se puede deshacer.`)) return;
      await api(`/api/pedidos/${id}`, { method: 'DELETE' });
      S.sel.delete(id); toast('Pedido eliminado'); location.hash = '#/';
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const d = leer();
      const err = document.getElementById('err');
      err.textContent = '';
      if (!d.nombre.trim()) return (err.textContent = 'Falta el nombre.');
      if (!d.items.length) return (err.textContent = 'Agregá al menos un producto.');
      if (entrega === 'envio' && !d.direccion.trim()) return (err.textContent = 'Falta la dirección de envío.');
      if (!d.fecha) return (err.textContent = 'Elegí para qué día es.');
      const btn = document.getElementById('guardar'); btn.disabled = true;
      try {
        const res = await api(id ? `/api/pedidos/${id}` : '/api/pedidos', { method: id ? 'PUT' : 'POST', body: d });
        if (d.tomado_por) localStorage.setItem('cc_tomado_por', d.tomado_por);
        S.dia = res.fecha; S.filtro = 'todos';
        toast(id ? `Pedido Nº ${num(res.id)} actualizado` : `Pedido Nº ${num(res.id)} guardado`);
        location.hash = '#/';
      } catch (ex) { if (ex.message !== 'auth') err.textContent = ex.message; btn.disabled = false; }
    });
    if (!id) form.querySelector('[name=nombre]').focus();
  }

  /* ---------- PEDIDO A PROVEEDOR ---------- */
  function setPreset(k) {
    const h = hoy();
    S.prov.preset = k;
    if (k === 'hoy') { S.prov.desde = h; S.prov.hasta = h; }
    if (k === 'manana') { S.prov.desde = addDays(h, 1); S.prov.hasta = addDays(h, 1); }
    if (k === 'semana') { S.prov.desde = h; S.prov.hasta = addDays(h, 6); }
    S.prov.ids = null;
  }

  async function renderProveedor(silencioso) {
    if (!silencioso) $app.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      S.prov.lista = (await api(`/api/pedidos?desde=${S.prov.desde}&hasta=${S.prov.hasta}`)).filter(p => p.estado !== 'cancelado');
    } catch (e) { if (e.message !== 'auth') $app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (!S.prov.ids) S.prov.ids = new Set(S.prov.lista.filter(p => !p.proveedor_at && p.estado !== 'entregado').map(p => p.id));
    pintarProveedor();
  }

  function totales() {
    const map = new Map();
    S.prov.lista.filter(p => S.prov.ids.has(p.id)).forEach(p => p.items.forEach(i => {
      const k = norm(i.producto);
      const t = map.get(k) || { nombre: i.producto, cantidad: 0, de: [] };
      t.cantidad += Number(i.cantidad) || 0;
      if (!t.de.includes(p.id)) t.de.push(p.id);
      map.set(k, t);
    }));
    return [...map.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function rangoTxt() {
    const { desde, hasta } = S.prov;
    return desde === hasta ? largo(desde) : `${corto(desde)} al ${corto(hasta)}`;
  }

  function pintarProveedor() {
    const tot = totales();
    const n = S.prov.ids.size;
    const chip = (k, t) => `<button class="chip ${S.prov.preset === k ? 'on' : ''}" data-preset="${k}">${t}</button>`;
    $app.innerHTML = `
      <div class="head">
        <div><div class="lbl">Agrupación · ${n} ${n === 1 ? 'pedido' : 'pedidos'} · ${esc(rangoTxt())}</div>
          <h1>Pedido <em>al proveedor</em></h1></div>
        <div class="filters">${chip('hoy', 'Hoy')}${chip('manana', 'Mañana')}${chip('semana', 'Próximos 7 días')}${chip('fechas', 'Elegir fechas')}</div>
      </div>
      ${S.prov.preset === 'fechas' || S.prov.preset === 'sel' ? `<div class="range no-print"><span class="lbl">Del</span><input type="date" id="pd" value="${S.prov.desde}"><span class="lbl">al</span><input type="date" id="ph" value="${S.prov.hasta}"></div>` : ''}
      <div class="prov">
        <div class="mini-wrap">
          <div class="lbl" style="margin-bottom:12px;display:flex;justify-content:space-between">Pedidos incluidos
            <span><button class="lbl" data-all="1" style="color:var(--fuc)">todos</button> · <button class="lbl" data-all="0">ninguno</button></span></div>
          <div class="mini">
            ${S.prov.lista.length ? S.prov.lista.map(p => {
              const on = S.prov.ids.has(p.id);
              return `<label><input type="checkbox" data-pid="${p.id}" ${on ? 'checked' : ''}><span class="box ${on ? 'on' : ''}"></span>
                <span class="nm">${esc(p.nombre)}<small>Nº ${num(p.id)} · ${corto(p.fecha)} · ${p.items.length} ${p.items.length === 1 ? 'producto' : 'productos'} · ${p.entrega === 'envio' ? 'Envío' : 'Retira'}${p.proveedor_at ? ' · ya pedido ✓' : ''}</small></span></label>`;
            }).join('') : '<p class="muted" style="padding:20px 0">No hay pedidos en estas fechas.</p>'}
          </div>
        </div>
        <div class="totales">
          <div class="lbl" style="margin-bottom:12px">Total a pedir</div>
          <div class="tbl">${tot.length ? tot.map(t => `<div class="r"><b>${cant(t.cantidad)}</b><span class="nm"><span>${esc(t.nombre)}</span></span><span class="from">Nº ${t.de.map(num).join(' · ')}</span></div>`).join('')
            : '<p class="muted" style="padding:20px 0">Elegí pedidos para ver el total.</p>'}</div>
          <div class="actions no-print">
            <button class="btn" data-pa="copiar" ${tot.length ? '' : 'disabled'}>Copiar para WhatsApp</button>
            <button class="btn ghost" data-pa="imprimir" ${tot.length ? '' : 'disabled'}>Imprimir</button>
            <button class="btn ghost" data-pa="marcar" ${n ? '' : 'disabled'}>Marcar como pedido</button>
          </div>
        </div>
      </div>`;
  }

  $app.addEventListener('click', async e => {
    const pr = e.target.closest('[data-preset]');
    if (pr) {
      if (pr.dataset.preset === 'fechas') { S.prov.preset = 'fechas'; return pintarProveedor(); }
      setPreset(pr.dataset.preset); return renderProveedor();
    }
    const all = e.target.closest('[data-all]');
    if (all) { S.prov.ids = new Set(all.dataset.all === '1' ? S.prov.lista.map(p => p.id) : []); return pintarProveedor(); }
    const pa = e.target.closest('[data-pa]');
    if (!pa) return;
    const tot = totales();
    if (pa.dataset.pa === 'copiar') {
      const txt = `Pedido Casa Cler · ${rangoTxt()}\n\n` + tot.map(t => `• ${cant(t.cantidad)} × ${t.nombre}`).join('\n');
      try { await navigator.clipboard.writeText(txt); toast('Copiado, listo para pegar en WhatsApp'); }
      catch (_) { prompt('Copiá este texto:', txt); }
    }
    if (pa.dataset.pa === 'imprimir') window.print();
    if (pa.dataset.pa === 'marcar') {
      await api('/api/proveedor', { method: 'POST', body: { ids: [...S.prov.ids] } });
      toast('Marcados como pedidos al proveedor');
      renderProveedor(true);
    }
  });
  $app.addEventListener('change', e => {
    const cb = e.target.closest('[data-pid]');
    if (cb) { const id = Number(cb.dataset.pid); cb.checked ? S.prov.ids.add(id) : S.prov.ids.delete(id); return pintarProveedor(); }
    if (e.target.id === 'pd' || e.target.id === 'ph') {
      const d = document.getElementById('pd').value, h = document.getElementById('ph').value;
      if (d && h) { S.prov.desde = d <= h ? d : h; S.prov.hasta = d <= h ? h : d; S.prov.preset = 'fechas'; S.prov.ids = null; renderProveedor(); }
    }
  });

  /* ---------- LOGIN ---------- */
  function renderLogin() {
    document.getElementById('tabs').style.display = 'none';
    $app.innerHTML = `<div class="login"><div class="flor-xl"></div><div class="lbl">Agenda de pedidos</div><h1>Hola <em>&lt;3</em></h1>
      <form id="login"><label class="field"><span class="lbl">Contraseña</span><input type="password" name="password" autocomplete="current-password" autofocus></label>
      <p class="err" id="err"></p><div class="actions"><button class="btn" type="submit" style="width:100%">Entrar</button></div></form></div>`;
    document.getElementById('login').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/api/login', { method: 'POST', body: { password: e.target.password.value } });
        document.getElementById('tabs').style.display = '';
        route();
      } catch (ex) { document.getElementById('err').textContent = ex.message; }
    };
  }

  /* ---------- sincronización entre computadoras ---------- */
  function editando() {
    const a = document.activeElement;
    return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== 'q';
  }
  async function refrescar() {
    if (document.hidden || editando()) return;
    const h = location.hash.replace(/^#/, '') || '/';
    if (h === '/' || h === '') renderPedidos(true);
    else if (h.startsWith('/proveedor')) renderProveedor(true);
  }
  setInterval(refrescar, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });

  /* ---------- inicio ---------- */
  api('/api/sesion').then(s => (s.ok ? route() : renderLogin())).catch(() => route());
})();
