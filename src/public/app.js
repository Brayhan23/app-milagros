const API_URL = '/api';

// Elementos DOM
const vistaLogin = document.getElementById('vista-login');
const vistaPanel = document.getElementById('vista-panel');

// Login DOM
const formLogin = document.getElementById('form-login');
const mensajeLogin = document.getElementById('mensaje-login');
const btnLogout = document.getElementById('btn-logout');

// Encabezado: logo (con reserva si uploads/logo.png todavía no existe) y
// nombre del usuario actual.
const headerLogo = document.getElementById('header-logo');
const headerLogoReserva = document.getElementById('header-logo-reserva');
const headerUsuarioNombre = document.getElementById('header-usuario-nombre');
const headerUsuarioTexto = document.getElementById('header-usuario-texto');

function activarFallbackLogo() {
  headerLogo.classList.add('hidden');
  headerLogoReserva.classList.remove('hidden');
}

// El <script> vive al final del body, así que el navegador ya empezó (y en
// un 404 local, puede ya haber TERMINADO) a cargar la imagen antes de que
// este código llegue a engancharse al evento 'error' — enganchar el
// listener solo no alcanza, porque el evento pudo haber disparado antes de
// que existiera el listener. Por eso se revisa primero si ya falló
// (complete === true y naturalWidth === 0 es la señal de una carga
// terminada en error) y, si no, recién ahí se espera el evento futuro.
if (headerLogo.complete && headerLogo.naturalWidth === 0) {
  activarFallbackLogo();
} else {
  headerLogo.addEventListener('error', activarFallbackLogo);
}

// Nombre de quien inició sesión, solo en memoria (no es un dato de negocio
// para guardar en localStorage, y el token no lo trae codificado): se
// conoce apenas después de un login exitoso. Si la página se recarga con
// una sesión ya activa, el token sigue siendo válido pero este nombre no
// se puede recuperar sin volver a loguearse — el encabezado simplemente
// oculta esa línea y deja visible el botón de cerrar sesión, que es lo
// funcionalmente importante.
let usuarioActual = null;

function mostrarUsuarioEnHeader() {
  if (usuarioActual) {
    headerUsuarioTexto.textContent = usuarioActual;
    headerUsuarioNombre.classList.remove('hidden');
  } else {
    headerUsuarioNombre.classList.add('hidden');
  }
}

// Productos DOM
const formProducto = document.getElementById('form-producto');
const mensajeProducto = document.getElementById('mensaje-producto');
const inputProdIdEditando = document.getElementById('prod-id-editando');
const grupoProdStockInicial = document.getElementById('prod-stock-inicial-grupo');
const btnMostrarFormProducto = document.getElementById('btn-mostrar-form-producto');
const btnCancelarFormProducto = document.getElementById('btn-cancelar-form-producto');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const productosBuscarInput = document.getElementById('productos-buscar-input');
const productosVerInactivosInput = document.getElementById('productos-ver-inactivos');
const productosAlertaStock = document.getElementById('productos-alerta-stock');
const tablaStockBody = document.getElementById('tabla-body-stock');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
});

// Convierte texto libre que viene del backend (nombre de producto, cliente,
// detalle de auditoría, etc.) a HTML seguro antes de interpolarlo con
// innerHTML. Sin esto, un nombre guardado como "<img src=x onerror=...>" se
// interpretaría como HTML real en vez de mostrarse como texto en pantalla.
function escaparHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Formato de datos (montos y fechas) ---

// Pesos colombianos con separador de miles: 15000 -> "$15.000". Los precios
// de este negocio siempre son enteros (nunca centavos), así que nunca se
// muestran decimales.
function formatearPesos(valor) {
  const numero = Number(valor) || 0;
  return `$${numero.toLocaleString('es-CO')}`;
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// El backend guarda las marcas de tiempo como "AAAA-MM-DD HH:MM:SS" en UTC
// (datetime('now') de SQLite) — nunca en hora de Colombia. Acá se parsean
// los componentes directo del string, sin pasar por `new Date(string)`: ese
// constructor interpreta este formato de manera distinta según el motor del
// navegador (a veces como hora local, a veces como UTC), lo que podría
// correr la fecha/hora mostrada sin que el dato real haya cambiado.
//
// Cuando el string trae hora (no cuando es solo "AAAA-MM-DD", como las
// fechas de reportes que reportesService.js ya entrega ajustadas a
// Colombia), se le restan 5 horas antes de formatear — mismo desplazamiento
// fijo (Colombia es UTC-5 todo el año) que reportesRepo.js/auditoriaRepo.js
// ya aplican del lado del servidor para clasificar "a qué día calendario
// pertenece" cada fila. Sin este ajuste, cualquier hora mostrada quedaba 5
// horas adelantada de la hora real de Colombia (ej. una venta de las 7:00
// p.m. se mostraba como si hubiera sido a las 12:00 a.m. del día
// siguiente). El cálculo se hace en milisegundos UTC (Date.UTC + getUTC*),
// nunca con la hora local del navegador, para que el resultado no dependa
// de en qué huso horario esté configurado el equipo de la usuaria.
function formatearFecha(fechaStr, { conHora = true } = {}) {
  if (!fechaStr) return '';
  const match = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return fechaStr;

  let [, anio, mes, dia, hora, minuto] = match;

  if (hora !== undefined) {
    const instanteUtc = Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
    const instanteColombia = new Date(instanteUtc - 5 * 60 * 60 * 1000);
    anio = String(instanteColombia.getUTCFullYear());
    mes = String(instanteColombia.getUTCMonth() + 1).padStart(2, '0');
    dia = String(instanteColombia.getUTCDate()).padStart(2, '0');
    hora = String(instanteColombia.getUTCHours()).padStart(2, '0');
    minuto = String(instanteColombia.getUTCMinutes()).padStart(2, '0');
  }

  const fechaLegible = `${Number(dia)} de ${NOMBRES_MES[Number(mes) - 1]}, ${anio}`;
  if (!conHora || hora === undefined) return fechaLegible;

  const horaNum = Number(hora);
  const periodo = horaNum >= 12 ? 'p.m.' : 'a.m.';
  const hora12 = horaNum % 12 === 0 ? 12 : horaNum % 12;
  return `${fechaLegible} · ${hora12}:${minuto} ${periodo}`;
}

// --- Iconos (sprite de Lucide incrustado en index.html) ---
// Genera el <svg><use></svg> que referencia un icono del sprite, para no
// repetir esta marca cada vez que un mensaje/tabla arma HTML con un icono.
function icono(nombre, claseExtra = '') {
  return `<svg class="icon ${claseExtra}" aria-hidden="true"><use href="#icon-${nombre}"></use></svg>`;
}

// --- Mensajes de resultado (éxito / error / alerta) ---
const ICONO_POR_TIPO = { exito: 'circle-check', error: 'alert-circle', alerta: 'alert-triangle' };

// Reemplaza el patrón repetido "textContent = ...; className = 'mensaje X'"
// por una sola llamada, agregando el icono correspondiente. Sin texto,
// limpia el mensaje (mismo comportamiento que antes al vaciar textContent).
function mostrarMensaje(elemento, texto, tipo) {
  if (!texto) {
    elemento.className = 'mensaje';
    elemento.innerHTML = '';
    return;
  }
  elemento.className = `mensaje ${tipo}`;
  elemento.innerHTML = `
    <div class="mensaje-caja">
      ${icono(ICONO_POR_TIPO[tipo] || 'circle-check', 'icon-sm')}
      <span>${escaparHtml(texto)}</span>
    </div>
  `;
}

// Variante de mostrarMensaje() para cuando además del mensaje principal hay
// una lista de advertencias no bloqueantes que mostrar (ej. las de
// coherencia de precios que devuelve POST/PUT /productos). Se usa el mismo
// tipo "alerta" (naranja) que ya existe en el sistema de diseño para "esto
// no es un error, pero revisalo" — nunca "error", porque la operación sí se
// completó. Sin advertencias, delega en mostrarMensaje() para no duplicar
// esa lógica.
function mostrarMensajeConAdvertencias(elemento, texto, advertencias) {
  if (!advertencias || advertencias.length === 0) {
    mostrarMensaje(elemento, texto, 'exito');
    return;
  }

  elemento.className = 'mensaje alerta';
  elemento.innerHTML = `
    <div class="mensaje-caja">
      ${icono('alert-triangle', 'icon-sm')}
      <div>
        <span>${escaparHtml(texto)}</span>
        <ul class="mensaje-lista">
          ${advertencias.map((a) => `<li>${escaparHtml(a)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

function obtenerHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

function verificarSesion() {
  const token = localStorage.getItem('token');
  if (token) {
    vistaLogin.classList.add('hidden');
    vistaPanel.classList.remove('hidden');
    mostrarUsuarioEnHeader();
    cargarPanel();
  } else {
    vistaLogin.classList.remove('hidden');
    vistaPanel.classList.add('hidden');
  }
}

function cargarPanel() {
  cargarProductosPantalla();
  cargarConfiguracion();
}

// --- PESTAÑAS (Productos / Facturas) ---
document.querySelectorAll('.tab-btn').forEach(boton => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));

    boton.classList.add('active');
    document.getElementById(`tab-${boton.dataset.tab}`).classList.remove('hidden');

    if (boton.dataset.tab === 'facturas') {
      cargarProductosParaVenta();
      cargarClientesParaVenta();
      enfocarCodigoBarras();
    }

    if (boton.dataset.tab === 'configuracion') {
      cargarConfiguracion();
    }

    if (boton.dataset.tab === 'clientes') {
      cargarClientesPantalla();
    }

    if (boton.dataset.tab === 'auditoria') {
      cargarAccionesAuditoria();
      cargarAuditoria();
    }
  });
});

// --- AUTENTICACIÓN ---
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeLogin, '', null);

  const usuario = document.getElementById('login-usuario').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });

    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeLogin, data.mensaje || 'Credenciales incorrectas.', 'error');
      return;
    }

    // El backend emite un token real (UUID) al autenticar; sin él no hay sesión.
    localStorage.setItem('token', data.token);
    usuarioActual = data.usuario && data.usuario.usuario;

    formLogin.reset();
    verificarSesion();

  } catch (err) {
    mostrarMensaje(mensajeLogin, 'Error de conexión con el servidor.', 'error');
  }
});

// --- Recuperación de contraseña ---

const vistaRecuperarSolicitar = document.getElementById('vista-recuperar-solicitar');
const vistaRecuperarConfirmar = document.getElementById('vista-recuperar-confirmar');
const formRecuperarSolicitar = document.getElementById('form-recuperar-solicitar');
const formRecuperarConfirmar = document.getElementById('form-recuperar-confirmar');
const mensajeRecuperarSolicitar = document.getElementById('mensaje-recuperar-solicitar');
const mensajeRecuperarConfirmar = document.getElementById('mensaje-recuperar-confirmar');

// Identificador (usuario o correo) que se usó para pedir el código: se
// reutiliza al confirmar, así el paso 2 no le vuelve a pedir ese dato a la
// usuaria.
let identificadorRecuperacion = '';

const tarjetaLogin = document.getElementById('tarjeta-login');

function mostrarVistaLogin() {
  tarjetaLogin.classList.remove('hidden');
  vistaRecuperarSolicitar.classList.add('hidden');
  vistaRecuperarConfirmar.classList.add('hidden');
}

function mostrarVistaRecuperarSolicitar() {
  tarjetaLogin.classList.add('hidden');
  vistaRecuperarSolicitar.classList.remove('hidden');
  vistaRecuperarConfirmar.classList.add('hidden');
  mostrarMensaje(mensajeRecuperarSolicitar, '', null);
}

function mostrarVistaRecuperarConfirmar() {
  vistaRecuperarSolicitar.classList.add('hidden');
  vistaRecuperarConfirmar.classList.remove('hidden');
  mostrarMensaje(mensajeRecuperarConfirmar, '', null);
}

document.getElementById('link-olvide-password').addEventListener('click', (e) => {
  e.preventDefault();
  mostrarVistaRecuperarSolicitar();
});

document.getElementById('link-volver-login-1').addEventListener('click', (e) => {
  e.preventDefault();
  mostrarVistaLogin();
});

document.getElementById('link-volver-login-2').addEventListener('click', (e) => {
  e.preventDefault();
  mostrarVistaLogin();
});

formRecuperarSolicitar.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeRecuperarSolicitar, '', null);

  const usuario = document.getElementById('recuperar-usuario').value.trim();

  try {
    const res = await fetch(`${API_URL}/auth/recuperar-solicitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario }),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeRecuperarSolicitar, data.mensaje || 'No se pudo procesar la solicitud.', 'error');
      return;
    }

    identificadorRecuperacion = usuario;
    formRecuperarConfirmar.reset();
    mostrarVistaRecuperarConfirmar();
    mostrarMensaje(mensajeRecuperarConfirmar, data.mensaje, 'exito');
  } catch (err) {
    mostrarMensaje(mensajeRecuperarSolicitar, 'Error de conexión con el servidor.', 'error');
  }
});

formRecuperarConfirmar.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeRecuperarConfirmar, '', null);

  const codigo = document.getElementById('recuperar-codigo').value.trim();
  const nuevaPassword = document.getElementById('recuperar-nueva-password').value;
  const confirmarPassword = document.getElementById('recuperar-confirmar-password').value;

  if (nuevaPassword !== confirmarPassword) {
    mostrarMensaje(mensajeRecuperarConfirmar, 'Las contraseñas no coinciden.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/auth/recuperar-confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: identificadorRecuperacion, codigo, nuevaPassword }),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeRecuperarConfirmar, data.mensaje || 'No se pudo restablecer la contraseña.', 'error');
      return;
    }

    formRecuperarSolicitar.reset();
    formRecuperarConfirmar.reset();
    identificadorRecuperacion = '';
    mostrarVistaLogin();
    mostrarMensaje(mensajeLogin, data.mensaje, 'exito');
  } catch (err) {
    mostrarMensaje(mensajeRecuperarConfirmar, 'Error de conexión con el servidor.', 'error');
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    // Invalida el token del lado del servidor antes de borrarlo del
    // navegador: sin esto, "cerrar sesión" era solo cosmético y el token
    // seguía siendo válido hasta sus 12 horas aunque ya no estuviera en
    // localStorage.
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: obtenerHeaders() });
  } catch (err) {
    // Si falla la llamada (ej. sin conexión), igual se cierra la sesión
    // localmente: no tiene sentido dejar a la usuaria atrapada en el panel.
  } finally {
    localStorage.removeItem('token');
    usuarioActual = null;
    verificarSesion();
  }
});


// --- PRODUCTOS ---
//
// Mismo patrón que clientes: búsqueda en memoria sobre productosCache
// (cargado una sola vez con GET /productos), formulario único para crear y
// editar, acciones (editar/desactivar/reactivar/ingresar stock) en la
// propia fila en vez de formularios sueltos donde había que volver a
// escribir el número del producto. La alerta de stock bajo se calcula del
// mismo productosCache ya cargado — no es una sección aparte con su propio
// origen de datos, es un resumen de la misma tabla que está debajo.

let productosCache = [];
let productoIdStockAbierto = null; // id del producto con el panel de "+ Stock" abierto

async function cargarProductosPantalla() {
  tablaStockBody.innerHTML = '<tr><td colspan="10" class="empty-state">Cargando inventario...</td></tr>';
  try {
    const query = productosVerInactivosInput.checked ? '?incluirInactivos=true' : '';
    const res = await fetch(`${API_URL}/productos${query}`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      tablaStockBody.innerHTML = '<tr><td colspan="10" class="empty-state">No se pudo cargar el inventario.</td></tr>';
      return;
    }

    productosCache = data.productos;
    productoIdStockAbierto = null;
    filtrarProductosPantalla();
  } catch (err) {
    tablaStockBody.innerHTML = '<tr><td colspan="10" class="empty-state">Error de conexión al cargar el inventario.</td></tr>';
  }
}

function filtrarProductosPantalla() {
  const termino = productosBuscarInput.value.trim().toLowerCase();
  const filtrados = termino
    ? productosCache.filter(
        (p) =>
          p.nombre.toLowerCase().includes(termino) ||
          (p.codigo_barras && p.codigo_barras.toLowerCase().includes(termino))
      )
    : productosCache;
  renderizarAlertaStockBajo();
  renderizarTablaProductos(filtrados);
}
productosBuscarInput.addEventListener('input', filtrarProductosPantalla);
productosVerInactivosInput.addEventListener('change', cargarProductosPantalla);

// Resumen de stock bajo calculado sobre productosCache (siempre los
// productos activos, sin importar el filtro de "ver desactivados" ni el
// texto de búsqueda) — es la misma tabla de abajo, no otro origen de datos.
function renderizarAlertaStockBajo() {
  const bajoStock = productosCache.filter((p) => p.activo !== 0 && p.stock_actual <= p.stock_minimo);
  if (bajoStock.length === 0) {
    productosAlertaStock.classList.add('hidden');
    return;
  }
  const nombres = bajoStock
    .slice(0, 3)
    .map((p) => escaparHtml(p.nombre))
    .join(', ');
  const resto = bajoStock.length > 3 ? ` y ${bajoStock.length - 3} más` : '';
  productosAlertaStock.classList.remove('hidden');
  productosAlertaStock.innerHTML = `
    ${icono('alert-triangle', 'icon-sm')}
    <span>${bajoStock.length} producto${bajoStock.length === 1 ? '' : 's'} con poco stock: ${nombres}${resto}.</span>
  `;
}

function filaStockInline(item) {
  return `
    <tr>
      <td colspan="10">
        <div class="abono-inline">
          <p>Ingresar mercancía de "<strong>${escaparHtml(item.nombre)}</strong>" — stock actual: <strong>${item.stock_actual}</strong> unidad(es)</p>
          <form id="form-stock-fila" class="form-grid-3col" data-producto-id="${item.id}">
            <div class="form-group">
              <label for="stock-fila-cantidad">Cantidad que llegó</label>
              <input type="number" id="stock-fila-cantidad" min="1" placeholder="Ej: 10" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Sumar al stock</button>
              <button type="button" id="btn-cancelar-stock-fila" class="btn btn-neutral btn-sm">Cancelar</button>
            </div>
          </form>
          <div id="mensaje-stock-fila" class="mensaje"></div>
        </div>
      </td>
    </tr>
  `;
}

function renderizarTablaProductos(lista) {
  if (lista.length === 0) {
    tablaStockBody.innerHTML = `<tr><td colspan="10" class="empty-state">${
      productosCache.length === 0 ? 'No hay productos registrados.' : 'No se encontraron productos.'
    }</td></tr>`;
    return;
  }

  tablaStockBody.innerHTML = lista
    .map((item) => {
      const inactivo = item.activo === 0;
      const bajoStock = !inactivo && item.stock_actual <= item.stock_minimo;
      const estadoBadge = inactivo
        ? '<span class="badge badge-neutro">Inactivo</span>'
        : `<span class="badge ${bajoStock ? 'badge-low' : 'badge-ok'}">${bajoStock ? 'Stock bajo' : 'OK'}</span>`;

      // "Eliminar" (borrado permanente) solo se ofrece cuando el producto
      // nunca se usó: sin ventas asociadas y sin stock existente (mismas
      // condiciones que valida productosService.eliminarProducto en el
      // servidor). El botón es solo un atajo de UI — el servidor vuelve a
      // validar antes de borrar, por si el estado cambió entre que se
      // cargó la tabla y que se hizo clic.
      const puedeEliminar = !item.tiene_ventas && item.stock_actual === 0;
      const botonEliminar = puedeEliminar
        ? `<button type="button" class="btn btn-danger btn-sm btn-eliminar-producto" data-id="${item.id}" title="Eliminar producto de forma permanente">${icono('trash-2', 'icon-sm')} Eliminar</button>`
        : '';

      const acciones = inactivo
        ? `<button type="button" class="btn btn-secondary btn-sm btn-reactivar-producto" data-id="${item.id}">${icono('circle-check', 'icon-sm')} Reactivar</button>${botonEliminar}`
        : `
          <button type="button" class="btn btn-secondary btn-sm btn-stock-producto" data-id="${item.id}" title="Ingresar mercancía">${icono('package', 'icon-sm')} Stock</button>
          <button type="button" class="btn btn-secondary btn-sm btn-editar-producto" data-id="${item.id}" title="Editar producto">${icono('pencil', 'icon-sm')} Editar</button>
          <button type="button" class="btn btn-danger btn-sm btn-desactivar-producto" data-id="${item.id}" title="Desactivar producto">${icono('user-x', 'icon-sm')} Desactivar</button>
          ${botonEliminar}
        `;

      const filaProducto = `
        <tr class="${inactivo ? 'fila-inactiva' : bajoStock ? 'fila-alerta' : ''}">
          <td><strong>${item.id}</strong></td>
          <td>${escaparHtml(item.codigo_barras) || '—'}</td>
          <td><strong>${escaparHtml(item.nombre)}</strong></td>
          <td>${formatearPesos(item.precio_compra)}</td>
          <td>${formatearPesos(item.precio_detal)}</td>
          <td>${formatearPesos(item.precio_mayor)}</td>
          <td>${item.stock_actual}</td>
          <td>${item.stock_minimo}</td>
          <td>${estadoBadge}</td>
          <td class="fila-acciones">${acciones}</td>
        </tr>
      `;
      return productoIdStockAbierto === item.id ? filaProducto + filaStockInline(item) : filaProducto;
    })
    .join('');
}

// Delegación de eventos: la tabla se regenera por completo con innerHTML en
// cada consulta o filtro, así que un solo listener por tipo de evento cubre
// todos los botones y el formulario inline de stock, presentes o futuros.
tablaStockBody.addEventListener('click', (e) => {
  const btnStock = e.target.closest('.btn-stock-producto');
  if (btnStock) {
    productoIdStockAbierto = Number(btnStock.dataset.id);
    filtrarProductosPantalla();
    return;
  }

  if (e.target.closest('#btn-cancelar-stock-fila')) {
    productoIdStockAbierto = null;
    filtrarProductosPantalla();
    return;
  }

  const btnEditar = e.target.closest('.btn-editar-producto');
  if (btnEditar) {
    abrirFormProducto(productosCache.find((p) => p.id === Number(btnEditar.dataset.id)));
    return;
  }

  const btnDesactivar = e.target.closest('.btn-desactivar-producto');
  if (btnDesactivar) {
    desactivarProductoPorId(Number(btnDesactivar.dataset.id));
    return;
  }

  const btnReactivar = e.target.closest('.btn-reactivar-producto');
  if (btnReactivar) {
    reactivarProductoPorId(Number(btnReactivar.dataset.id));
    return;
  }

  const btnEliminar = e.target.closest('.btn-eliminar-producto');
  if (btnEliminar) {
    eliminarProductoPorId(Number(btnEliminar.dataset.id));
  }
});

tablaStockBody.addEventListener('submit', async (e) => {
  if (e.target.id !== 'form-stock-fila') return;
  e.preventDefault();

  const form = e.target;
  const id = Number(form.dataset.productoId);
  const cantidad = Number(document.getElementById('stock-fila-cantidad').value);
  const mensajeStockFila = document.getElementById('mensaje-stock-fila');
  mostrarMensaje(mensajeStockFila, '', null);

  try {
    const res = await fetch(`${API_URL}/productos/${id}/stock`, {
      method: 'PATCH',
      headers: obtenerHeaders(),
      body: JSON.stringify({ cantidad }),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeStockFila, data.mensaje || 'No se pudo actualizar el stock.', 'error');
      return;
    }

    productoIdStockAbierto = null;
    mostrarMensaje(
      mensajeProducto,
      `Stock actualizado. "${data.producto.nombre}" ahora cuenta con ${data.producto.stock_actual} unidades.`,
      'exito'
    );
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeStockFila, 'Error de conexión al sumar el stock.', 'error');
  }
});

async function desactivarProductoPorId(id) {
  const producto = productosCache.find((p) => p.id === id);
  if (!producto) return;

  const confirmado = window.confirm(
    `¿Desactivar "${producto.nombre}"? El producto dejará de aparecer en las ventas, pero se conserva su historial.`
  );
  if (!confirmado) return;

  try {
    const res = await fetch(`${API_URL}/productos/${id}`, { method: 'DELETE', headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeProducto, data.mensaje || 'No se pudo desactivar el producto.', 'error');
      return;
    }

    mostrarMensaje(mensajeProducto, `Producto "${producto.nombre}" desactivado.`, 'exito');
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeProducto, 'Error de conexión al desactivar el producto.', 'error');
  }
}

async function reactivarProductoPorId(id) {
  const producto = productosCache.find((p) => p.id === id);
  if (!producto) return;

  try {
    const res = await fetch(`${API_URL}/productos/${id}/reactivar`, { method: 'PATCH', headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeProducto, data.mensaje || 'No se pudo reactivar el producto.', 'error');
      return;
    }

    mostrarMensaje(mensajeProducto, `Producto "${producto.nombre}" reactivado.`, 'exito');
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeProducto, 'Error de conexión al reactivar el producto.', 'error');
  }
}

async function eliminarProductoPorId(id) {
  const producto = productosCache.find((p) => p.id === id);
  if (!producto) return;

  const confirmado = window.confirm(
    `¿Eliminar "${producto.nombre}" de forma permanente? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    const res = await fetch(`${API_URL}/productos/${id}/permanente`, { method: 'DELETE', headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeProducto, data.mensaje || 'No se pudo eliminar el producto.', 'error');
      return;
    }

    mostrarMensaje(mensajeProducto, `Producto "${producto.nombre}" eliminado.`, 'exito');
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeProducto, 'Error de conexión al eliminar el producto.', 'error');
  }
}

// --- Registrar / editar producto (mismo formulario para ambos casos) ---

function abrirFormProducto(producto = null) {
  formProducto.reset();
  if (producto) {
    inputProdIdEditando.value = producto.id;
    document.getElementById('prod-codigo').value = producto.codigo_barras || '';
    document.getElementById('prod-nombre').value = producto.nombre || '';
    document.getElementById('prod-descripcion').value = producto.descripcion || '';
    document.getElementById('prod-pcompra').value = producto.precio_compra;
    document.getElementById('prod-pdetal').value = producto.precio_detal;
    document.getElementById('prod-pmayor').value = producto.precio_mayor;
    document.getElementById('prod-stock-minimo').value = producto.stock_minimo;
    grupoProdStockInicial.classList.add('hidden');
    btnGuardarProducto.textContent = 'Guardar cambios';
  } else {
    inputProdIdEditando.value = '';
    grupoProdStockInicial.classList.remove('hidden');
    btnGuardarProducto.textContent = 'Guardar producto';
  }
  mostrarMensaje(mensajeProducto, '', null);
  formProducto.classList.remove('hidden');
  formProducto.scrollIntoView({ block: 'nearest' });
  document.getElementById('prod-nombre').focus();
}

function cerrarFormProducto() {
  formProducto.classList.add('hidden');
  formProducto.reset();
  inputProdIdEditando.value = '';
  grupoProdStockInicial.classList.remove('hidden');
  mostrarMensaje(mensajeProducto, '', null);
}

btnMostrarFormProducto.addEventListener('click', () => abrirFormProducto(null));
btnCancelarFormProducto.addEventListener('click', cerrarFormProducto);

formProducto.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeProducto, '', null);

  const idEditando = inputProdIdEditando.value;
  const payload = {
    codigoBarras: document.getElementById('prod-codigo').value.trim() || null,
    nombre: document.getElementById('prod-nombre').value.trim(),
    descripcion: document.getElementById('prod-descripcion').value.trim() || null,
    precioCompra: Number(document.getElementById('prod-pcompra').value),
    precioDetal: Number(document.getElementById('prod-pdetal').value),
    precioMayor: Number(document.getElementById('prod-pmayor').value),
    stockMinimo: Number(document.getElementById('prod-stock-minimo').value) || 0,
  };
  if (!idEditando) {
    payload.stockActual = Number(document.getElementById('prod-stock-inicial').value) || 0;
  }

  try {
    const res = await fetch(`${API_URL}/productos${idEditando ? `/${idEditando}` : ''}`, {
      method: idEditando ? 'PUT' : 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeProducto, data.mensaje || 'No se pudo guardar el producto.', 'error');
      return;
    }

    const msg = idEditando ? `Producto "${data.producto.nombre}" actualizado.` : `Producto "${data.producto.nombre}" registrado.`;
    // cerrarFormProducto() limpia mensajeProducto como parte de resetear el
    // formulario — por eso el mensaje final se muestra DESPUÉS de cerrarlo,
    // nunca antes: si no, cerrarFormProducto() lo borraba en el mismo tick y
    // la usuaria nunca llegaba a verlo (pasaba con las advertencias de
    // coherencia de precios, que solo viven en esta respuesta).
    cerrarFormProducto();
    mostrarMensajeConAdvertencias(mensajeProducto, msg, data.advertencias);
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeProducto, 'Error de conexión al guardar el producto.', 'error');
  }
});

// --- VENTAS Y FACTURACIÓN ---

// Escaneo de código de barras: campo protagonista de esta pantalla.
const formCodigoBarras = document.getElementById('form-codigo-barras');
const inputCodigoBarras = document.getElementById('venta-codigo-barras');

// Búsqueda manual por nombre: respaldo para productos sin código de barras
// o si falla el lector.
const inputBuscarProducto = document.getElementById('venta-buscar-producto');
const contenedorBusquedaResultados = document.getElementById('venta-busqueda-resultados');

const tablaBodyCarrito = document.getElementById('tabla-body-carrito');
const selectTipoCliente = document.getElementById('venta-tipo-cliente');
const selectMetodoPago = document.getElementById('venta-metodo-pago');
const inputDescuento = document.getElementById('venta-descuento');
const btnGenerarFactura = document.getElementById('btn-generar-factura');
const mensajeVenta = document.getElementById('mensaje-venta');
const seccionVenta = document.querySelector('#tab-facturas .card:not(.factura)');
const facturaGenerada = document.getElementById('factura-generada');
const btnImprimirFactura = document.getElementById('btn-imprimir-factura');
const btnNuevaVenta = document.getElementById('btn-nueva-venta');

// Envío de factura por correo
const inputFacturaCorreo = document.getElementById('factura-correo');
const btnEnviarCorreo = document.getElementById('btn-enviar-correo');
const mensajeCorreo = document.getElementById('mensaje-correo');

// Cliente obligatorio cuando la venta es a crédito
const grupoVentaCliente = document.getElementById('venta-cliente-grupo');
const selectVentaCliente = document.getElementById('venta-cliente');

let productosDisponibles = [];
let clientesDisponibles = [];
let carrito = [];
let ventaActualId = null;
// Resultados de la búsqueda manual actualmente mostrados en el desplegable
// (para poder resolver "Enter = agregar el primero" y los clics por índice).
let resultadosBusqueda = [];

async function cargarProductosParaVenta() {
  try {
    const res = await fetch(`${API_URL}/productos`, { headers: obtenerHeaders() });
    const data = await res.json();
    productosDisponibles = data.exito ? data.productos : [];
  } catch (err) {
    productosDisponibles = [];
  }
}

async function cargarClientesParaVenta() {
  try {
    const res = await fetch(`${API_URL}/clientes`, { headers: obtenerHeaders() });
    const data = await res.json();
    clientesDisponibles = data.exito ? data.clientes : [];

    selectVentaCliente.innerHTML = clientesDisponibles
      .map((c) => `<option value="${c.id}">${escaparHtml(c.nombre)}${c.documento ? ' (' + escaparHtml(c.documento) + ')' : ''}</option>`)
      .join('') || '<option value="">No hay clientes registrados</option>';
  } catch (err) {
    selectVentaCliente.innerHTML = '<option value="">Error al cargar clientes</option>';
  }
}

// Reemplaza (o agrega, si no estaba) la versión en memoria de un producto —
// se usa después de cada escaneo, que trae el dato más fresco de stock
// directo del servidor, para que la validación de cantidad de las líneas
// siguientes no trabaje con un stock desactualizado.
function actualizarProductoEnCache(producto) {
  const indice = productosDisponibles.findIndex((p) => p.id === producto.id);
  if (indice >= 0) {
    productosDisponibles[indice] = producto;
  } else {
    productosDisponibles.push(producto);
  }
}

function actualizarVisibilidadCliente() {
  const esCredito = selectMetodoPago.value === 'credito';
  grupoVentaCliente.classList.toggle('hidden', !esCredito);
}
selectMetodoPago.addEventListener('change', actualizarVisibilidadCliente);

function precioUnitarioActual(producto) {
  return selectTipoCliente.value === 'mayor' ? producto.precio_mayor : producto.precio_detal;
}

// Pone el foco en el campo de escaneo y selecciona lo que tenga adentro
// (por si quedó algo sin limpiar): así la cajera puede escanear el
// siguiente producto sin tocar el mouse ni el teclado más que con el lector.
function enfocarCodigoBarras() {
  inputCodigoBarras.focus();
  inputCodigoBarras.select();
}

// Punto único donde un producto entra al carrito, ya sea por escaneo o por
// búsqueda manual: si ya estaba en la venta, suma a la cantidad existente
// en vez de duplicar la línea. Valida contra el stock disponible ANTES de
// agregar — nunca se agrega algo que después haya que corregir.
function agregarProductoAlCarrito(producto, cantidadAAgregar = 1) {
  const existente = carrito.find((item) => item.productoId === producto.id);
  const cantidadYaEnCarrito = existente ? existente.cantidad : 0;
  const cantidadTotal = cantidadYaEnCarrito + cantidadAAgregar;

  if (cantidadTotal > producto.stock_actual) {
    mostrarMensaje(
      mensajeVenta,
      `Stock insuficiente para "${producto.nombre}": disponible ${producto.stock_actual}${
        cantidadYaEnCarrito > 0 ? `, ya tenés ${cantidadYaEnCarrito} en la venta` : ''
      }.`,
      'error'
    );
    return false;
  }

  mostrarMensaje(mensajeVenta, '', null);
  if (existente) {
    existente.cantidad = cantidadTotal;
  } else {
    carrito.push({ productoId: producto.id, nombre: producto.nombre, cantidad: cantidadAAgregar });
  }
  renderizarCarrito();
  return true;
}

// --- Escaneo de código de barras ---
// El lector USB actúa como un teclado: escribe el código y manda un Enter
// solo, que este <form> recibe como un submit normal — no hace falta
// distinguir "tecleado a mano" de "leído por el escáner".
formCodigoBarras.addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = inputCodigoBarras.value.trim();
  inputCodigoBarras.value = '';

  if (!codigo) {
    enfocarCodigoBarras();
    return;
  }

  try {
    const res = await fetch(`${API_URL}/productos/${encodeURIComponent(codigo)}`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeVenta, data.mensaje || `No se encontró ningún producto con ese código.`, 'error');
      return;
    }

    actualizarProductoEnCache(data.producto);
    agregarProductoAlCarrito(data.producto, 1);
  } catch (err) {
    mostrarMensaje(mensajeVenta, 'Error de conexión al buscar el producto.', 'error');
  } finally {
    // Sin confirmación intermedia y con el foco siempre listo para el
    // siguiente escaneo, exista o no haya existido el producto.
    enfocarCodigoBarras();
  }
});

// --- Búsqueda manual por nombre (respaldo) ---
// Filtra en memoria sobre productosDisponibles, ya cargado por
// cargarProductosParaVenta(): NUNCA dispara una petición por cada tecla.
function renderizarResultadosBusqueda() {
  if (resultadosBusqueda.length === 0) {
    contenedorBusquedaResultados.innerHTML = '<p class="venta-busqueda-vacia">Sin resultados.</p>';
    contenedorBusquedaResultados.classList.remove('hidden');
    return;
  }

  contenedorBusquedaResultados.innerHTML = resultadosBusqueda
    .map(
      (p, indice) => `
      <button type="button" class="resultado-busqueda-item" data-indice="${indice}">
        <span>${escaparHtml(p.nombre)}</span>
        <span class="resultado-busqueda-stock">stock: ${p.stock_actual}</span>
      </button>
    `
    )
    .join('');
  contenedorBusquedaResultados.classList.remove('hidden');
}

function cerrarResultadosBusqueda() {
  resultadosBusqueda = [];
  contenedorBusquedaResultados.innerHTML = '';
  contenedorBusquedaResultados.classList.add('hidden');
}

function seleccionarResultadoBusqueda(indice) {
  const producto = resultadosBusqueda[indice];
  if (!producto) return;
  agregarProductoAlCarrito(producto, 1);
  inputBuscarProducto.value = '';
  cerrarResultadosBusqueda();
  // Vuelve el foco al escaneo, que es el flujo principal de esta pantalla.
  enfocarCodigoBarras();
}

inputBuscarProducto.addEventListener('input', () => {
  const termino = inputBuscarProducto.value.trim().toLowerCase();
  if (!termino) {
    cerrarResultadosBusqueda();
    return;
  }

  resultadosBusqueda = productosDisponibles
    .filter((p) => p.activo !== 0 && p.nombre.toLowerCase().includes(termino))
    .slice(0, 8);
  renderizarResultadosBusqueda();
});

inputBuscarProducto.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (resultadosBusqueda.length > 0) seleccionarResultadoBusqueda(0);
  }
});

contenedorBusquedaResultados.addEventListener('click', (e) => {
  const boton = e.target.closest('.resultado-busqueda-item');
  if (!boton) return;
  seleccionarResultadoBusqueda(Number(boton.dataset.indice));
});

// Cierra el desplegable de resultados al hacer clic fuera de la búsqueda.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.venta-busqueda')) {
    cerrarResultadosBusqueda();
  }
});

// --- Carrito: líneas con cantidad ajustable ---
function renderizarCarrito() {
  if (carrito.length === 0) {
    tablaBodyCarrito.innerHTML = `<tr><td colspan="5" class="empty-state">Escaneá o buscá un producto para empezar.</td></tr>`;
    actualizarTotales();
    return;
  }

  tablaBodyCarrito.innerHTML = carrito
    .map((item, indice) => {
      const producto = productosDisponibles.find((p) => p.id === item.productoId);
      const precioUnitario = producto ? precioUnitarioActual(producto) : 0;
      const subtotal = precioUnitario * item.cantidad;
      const stockMaximo = producto ? producto.stock_actual : item.cantidad;
      return `
        <tr>
          <td>${escaparHtml(item.nombre)}</td>
          <td>${formatearPesos(precioUnitario)}</td>
          <td>
            <div class="cantidad-control">
              <button type="button" class="btn-cantidad btn-cantidad-menos" data-indice="${indice}" aria-label="Restar una unidad">−</button>
              <input
                type="number"
                class="input-cantidad-linea"
                data-indice="${indice}"
                value="${item.cantidad}"
                min="1"
                max="${stockMaximo}"
                inputmode="numeric"
              >
              <button type="button" class="btn-cantidad btn-cantidad-mas" data-indice="${indice}" aria-label="Sumar una unidad">+</button>
            </div>
          </td>
          <td>${formatearPesos(subtotal)}</td>
          <td><button type="button" class="btn btn-neutral btn-sm btn-quitar-item" data-indice="${indice}" title="Quitar producto">${icono('x', 'icon-sm')}</button></td>
        </tr>
      `;
    })
    .join('');

  actualizarTotales();
}

// Cambia la cantidad de una línea ya existente, validando contra el stock
// disponible de ese producto. Usado por los botones +/− y por el campo
// editable de cantidad.
function ajustarCantidadLinea(indice, nuevaCantidad) {
  const item = carrito[indice];
  if (!item) return;

  const producto = productosDisponibles.find((p) => p.id === item.productoId);
  const stockDisponible = producto ? producto.stock_actual : item.cantidad;

  if (!Number.isInteger(nuevaCantidad) || nuevaCantidad < 1) {
    nuevaCantidad = 1;
  }
  if (nuevaCantidad > stockDisponible) {
    mostrarMensaje(
      mensajeVenta,
      `Solo hay ${stockDisponible} unidad(es) disponibles de "${item.nombre}".`,
      'error'
    );
    nuevaCantidad = stockDisponible;
  } else {
    mostrarMensaje(mensajeVenta, '', null);
  }

  item.cantidad = nuevaCantidad;
  renderizarCarrito();
}

tablaBodyCarrito.addEventListener('click', (e) => {
  const btnQuitar = e.target.closest('.btn-quitar-item');
  if (btnQuitar) {
    carrito.splice(Number(btnQuitar.dataset.indice), 1);
    renderizarCarrito();
    return;
  }

  const btnMenos = e.target.closest('.btn-cantidad-menos');
  if (btnMenos) {
    const indice = Number(btnMenos.dataset.indice);
    ajustarCantidadLinea(indice, carrito[indice].cantidad - 1 || 1);
    return;
  }

  const btnMas = e.target.closest('.btn-cantidad-mas');
  if (btnMas) {
    const indice = Number(btnMas.dataset.indice);
    ajustarCantidadLinea(indice, carrito[indice].cantidad + 1);
  }
});

// 'change' (no 'input'): solo valida/re-renderiza cuando la cajera termina
// de editar el campo (blur o Enter), no en cada tecla mientras escribe.
tablaBodyCarrito.addEventListener('change', (e) => {
  const input = e.target.closest('.input-cantidad-linea');
  if (!input) return;
  ajustarCantidadLinea(Number(input.dataset.indice), Number(input.value));
});

selectTipoCliente.addEventListener('change', renderizarCarrito);
inputDescuento.addEventListener('input', actualizarTotales);

function calcularSubtotal() {
  return carrito.reduce((suma, item) => {
    const producto = productosDisponibles.find((p) => p.id === item.productoId);
    const precioUnitario = producto ? precioUnitarioActual(producto) : 0;
    return suma + precioUnitario * item.cantidad;
  }, 0);
}

// Mismo desglose de IVA que ventasService.calcularDesgloseIva en el backend
// (base = total / (1 + tasa/100), IVA = residuo): se muestra en vivo acá
// mientras se arma la venta, con la MISMA fórmula que después confirma el
// servidor — nunca dos cuentas independientes que puedan no coincidir.
function calcularDesgloseIva(total, ivaPorcentaje) {
  const baseGravable = Math.round(total / (1 + ivaPorcentaje / 100));
  return { baseGravable, ivaMonto: total - baseGravable };
}

function actualizarTotales() {
  const subtotal = calcularSubtotal();
  const descuento = Number(inputDescuento.value) || 0;
  const total = Math.max(subtotal - descuento, 0);
  const ivaPorcentaje = (configuracionActual && configuracionActual.iva_porcentaje) ?? 19;
  const { ivaMonto } = calcularDesgloseIva(total, ivaPorcentaje);

  document.getElementById('venta-subtotal').textContent = formatearPesos(subtotal);
  document.getElementById('venta-descuento-resumen').textContent = formatearPesos(descuento);
  document.getElementById('venta-iva-porcentaje').textContent = ivaPorcentaje;
  document.getElementById('venta-iva-monto').textContent = formatearPesos(ivaMonto);
  document.getElementById('venta-total').textContent = formatearPesos(total);
}

btnGenerarFactura.addEventListener('click', async () => {
  mostrarMensaje(mensajeVenta, '', null);

  if (carrito.length === 0) {
    mostrarMensaje(mensajeVenta, 'Escaneá o agregá al menos un producto para confirmar la venta.', 'error');
    return;
  }

  const esCredito = selectMetodoPago.value === 'credito';
  const clienteId = selectVentaCliente.value ? Number(selectVentaCliente.value) : null;

  if (esCredito && !clienteId) {
    mostrarMensaje(mensajeVenta, 'Las ventas a crédito deben indicar un cliente.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/ventas`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify({
        tipoCliente: selectTipoCliente.value,
        metodoPago: selectMetodoPago.value,
        clienteId,
        descuento: Number(inputDescuento.value) || 0,
        items: carrito.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })),
      }),
    });
    const data = await res.json();

    if (!data.exito) {
      mostrarMensaje(mensajeVenta, data.mensaje || 'No se pudo confirmar la venta.', 'error');
      return;
    }

    mostrarFactura(data.venta);
    carrito = [];
    inputDescuento.value = 0;
    selectMetodoPago.value = 'efectivo';
    actualizarVisibilidadCliente();
    renderizarCarrito();
    cargarProductosParaVenta();
    cargarProductosPantalla();
  } catch (err) {
    mostrarMensaje(mensajeVenta, 'Error de conexión al confirmar la venta.', 'error');
  }
});

const ETIQUETA_TIPO_CLIENTE = { detal: 'Detal', mayor: 'Mayor' };
const ETIQUETA_METODO_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' };

function mostrarFactura(venta) {
  ventaActualId = venta.id;
  inputFacturaCorreo.value = '';
  mostrarMensaje(mensajeCorreo, '', null);

  aplicarEncabezadoEmpresa();

  document.getElementById('factura-id').textContent = venta.id;
  document.getElementById('factura-fecha').textContent = formatearFecha(venta.creado_en);
  document.getElementById('factura-tipo-cliente').textContent = ETIQUETA_TIPO_CLIENTE[venta.tipo_cliente] || venta.tipo_cliente;
  document.getElementById('factura-metodo-pago').textContent = ETIQUETA_METODO_PAGO[venta.metodo_pago] || venta.metodo_pago;
  document.getElementById('factura-subtotal').textContent = formatearPesos(venta.subtotal);
  document.getElementById('factura-descuento').textContent = formatearPesos(venta.descuento);
  document.getElementById('factura-total').textContent = formatearPesos(venta.total);
  document.getElementById('factura-iva-porcentaje').textContent = venta.ivaPorcentaje;
  document.getElementById('factura-iva-monto').textContent = formatearPesos(venta.ivaMonto);
  // Mismo dato y misma aclaración que ya muestra la copia por correo
  // (emailService.construirHtmlFactura): sin esto, la factura en pantalla
  // (y la que se imprime) decía algo distinto de la que llega al correo del
  // cliente para la misma venta. textContent (no innerHTML) porque es texto
  // plano fijo, sin necesidad de escaparHtml.
  document.getElementById('factura-iva-aproximado').textContent = venta.ivaAproximado
    ? ' (aproximado, venta anterior a la configuración de IVA)'
    : '';

  document.getElementById('factura-items').innerHTML = venta.items
    .map(
      (item) => `
      <tr>
        <td>${escaparHtml(item.nombre_producto)}</td>
        <td>${item.cantidad}</td>
        <td>${formatearPesos(item.precio_unitario)}</td>
        <td>${formatearPesos(item.subtotal)}</td>
      </tr>
    `
    )
    .join('');

  seccionVenta.classList.add('hidden');
  facturaGenerada.classList.remove('hidden');
}

btnImprimirFactura.addEventListener('click', () => window.print());

btnNuevaVenta.addEventListener('click', () => {
  facturaGenerada.classList.add('hidden');
  seccionVenta.classList.remove('hidden');
  ventaActualId = null;
  enfocarCodigoBarras();
});

// --- ENVIAR FACTURA POR CORREO ---
btnEnviarCorreo.addEventListener('click', async () => {
  mostrarMensaje(mensajeCorreo, '', null);

  const correoDestino = inputFacturaCorreo.value.trim();
  if (!correoDestino) {
    mostrarMensaje(mensajeCorreo, 'Escribí el correo del cliente.', 'error');
    return;
  }

  if (!ventaActualId) {
    mostrarMensaje(mensajeCorreo, 'No hay una factura generada para enviar.', 'error');
    return;
  }

  btnEnviarCorreo.disabled = true;
  btnEnviarCorreo.textContent = 'Enviando...';

  try {
    const res = await fetch(`${API_URL}/ventas/${ventaActualId}/enviar-correo`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify({ correoDestino }),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCorreo, data.mensaje || 'No se pudo enviar el correo.', 'error');
      return;
    }

    mostrarMensaje(mensajeCorreo, data.mensaje || 'Factura enviada por correo.', 'exito');
  } catch (err) {
    mostrarMensaje(mensajeCorreo, 'Error de conexión al enviar el correo.', 'error');
  } finally {
    btnEnviarCorreo.disabled = false;
    btnEnviarCorreo.innerHTML = 'Enviar por correo';
  }
});

// --- CLIENTES Y CRÉDITOS ---
//
// Una sola pantalla: búsqueda + lista a la izquierda, ficha completa del
// cliente seleccionado a la derecha (datos, deuda, facturas a crédito y
// abonos, todo junto). clientesCache se carga una sola vez (combinando
// GET /clientes con GET /clientes/deudas) y la búsqueda filtra en memoria,
// igual que la búsqueda de productos de la pantalla de venta — sin pedir
// nada al servidor por cada tecla. fichaClienteActual guarda la respuesta
// de GET /clientes/:id/deuda del cliente abierto: registrar un abono la
// actualiza en memoria y vuelve a pintar la ficha, sin recargar nada.

const DIAS_LIMITE_MORA = 30; // mismo criterio que creditoService.js (HU-13)

const formCliente = document.getElementById('form-cliente');
const mensajeCliente = document.getElementById('mensaje-cliente');
const inputClienteIdEditando = document.getElementById('cliente-id-editando');
const btnMostrarFormCliente = document.getElementById('btn-mostrar-form-cliente');
const btnCancelarFormCliente = document.getElementById('btn-cancelar-form-cliente');
const btnGuardarCliente = document.getElementById('btn-guardar-cliente');
const clientesBuscarInput = document.getElementById('clientes-buscar-input');
const clientesVerInactivosInput = document.getElementById('clientes-ver-inactivos');
const clientesListaEl = document.getElementById('clientes-lista');
const clienteFichaEl = document.getElementById('cliente-ficha');

let clientesCache = [];
let clienteSeleccionadoId = null;
let fichaClienteActual = null; // { cliente, ventas, abonos, saldoTotal }
let abonoVentaIdAbierto = null; // venta_id cuyo panel de "registrar abono" está abierto

// Mismo criterio de parseo que formatearFecha(): el backend guarda
// "AAAA-MM-DD HH:MM:SS" en UTC sin marca de zona horaria, así que se
// extraen los componentes a mano y se arman como UTC explícito — nunca
// reinterpretar la zona horaria.
function diasTranscurridos(fechaStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(fechaStr || '');
  if (!m) return null;
  const [anio, mes, dia, hora, min, seg] = m.slice(1).map(Number);
  const fechaUTC = Date.UTC(anio, mes - 1, dia, hora, min, seg);
  return Math.floor((Date.now() - fechaUTC) / 86400000);
}

function combinarClientesYDeudas(clientes, deudores) {
  const deudaPorId = new Map(deudores.map((d) => [d.id, d]));
  return clientes.map((c) => {
    const deuda = deudaPorId.get(c.id);
    return {
      ...c,
      saldo_total: deuda ? deuda.saldo_total : 0,
      dias_deuda_mas_vieja: deuda ? deuda.dias_deuda_mas_vieja : null,
      en_mora: deuda ? deuda.en_mora : false,
    };
  });
}

// Carga inicial (o recarga tras crear/editar/desactivar un cliente): trae
// la lista completa y la deuda de todos de una sola vez.
async function cargarClientesPantalla() {
  clientesListaEl.innerHTML = '<p class="empty-state">Cargando clientes…</p>';
  try {
    const query = clientesVerInactivosInput.checked ? '?incluirInactivos=true' : '';
    const [resClientes, resDeudas] = await Promise.all([
      fetch(`${API_URL}/clientes${query}`, { headers: obtenerHeaders() }),
      fetch(`${API_URL}/clientes/deudas`, { headers: obtenerHeaders() }),
    ]);
    const dataClientes = await resClientes.json();
    const dataDeudas = await resDeudas.json();

    if (!resClientes.ok || !dataClientes.exito) {
      clientesListaEl.innerHTML = '<p class="empty-state">No se pudo cargar la lista de clientes.</p>';
      return;
    }

    clientesCache = combinarClientesYDeudas(dataClientes.clientes, dataDeudas.exito ? dataDeudas.clientes : []);
    filtrarClientes();

    if (clienteSeleccionadoId && clientesCache.some((c) => c.id === clienteSeleccionadoId)) {
      seleccionarCliente(clienteSeleccionadoId);
    } else {
      clienteSeleccionadoId = null;
      fichaClienteActual = null;
      clienteFichaEl.innerHTML = '<p class="empty-state">Seleccioná un cliente de la lista para ver su información completa.</p>';
    }
  } catch (err) {
    clientesListaEl.innerHTML = '<p class="empty-state">Error de conexión al cargar los clientes.</p>';
  }
}

// Filtra clientesCache en memoria — nunca dispara una petición por tecla.
function filtrarClientes() {
  const termino = clientesBuscarInput.value.trim().toLowerCase();
  const filtrados = termino
    ? clientesCache.filter(
        (c) =>
          c.nombre.toLowerCase().includes(termino) ||
          (c.documento && c.documento.toLowerCase().includes(termino))
      )
    : clientesCache;
  renderizarListaClientes(filtrados);
}
clientesBuscarInput.addEventListener('input', filtrarClientes);
clientesVerInactivosInput.addEventListener('change', cargarClientesPantalla);

function renderizarListaClientes(lista) {
  if (lista.length === 0) {
    clientesListaEl.innerHTML = '<p class="empty-state">No se encontraron clientes.</p>';
    return;
  }

  clientesListaEl.innerHTML = lista
    .map((c) => {
      const inactivo = c.activo === 0;
      const saldoTexto = inactivo
        ? '<span class="badge badge-neutro">Inactivo</span>'
        : c.saldo_total > 0
          ? `<strong>${formatearPesos(c.saldo_total)}</strong>`
          : `<span class="badge badge-ok">${icono('circle-check', 'icon-sm')} Al día</span>`;

      return `
        <button type="button" class="cliente-fila${inactivo ? ' inactivo' : ''}${c.en_mora ? ' fila-mora' : ''}${c.id === clienteSeleccionadoId ? ' seleccionado' : ''}" data-id="${c.id}">
          <span class="cliente-fila-nombre">
            <strong>${escaparHtml(c.nombre)}</strong>
            <span>${c.documento ? escaparHtml(c.documento) : 'Sin documento'}${c.es_mayorista ? ' · Mayorista' : ''}</span>
          </span>
          <span class="cliente-fila-saldo">
            ${saldoTexto}
            ${!inactivo && c.en_mora ? `<span class="badge badge-low">${icono('alert-triangle', 'icon-sm')} Mora</span>` : ''}
          </span>
        </button>
      `;
    })
    .join('');
}

clientesListaEl.addEventListener('click', (e) => {
  const fila = e.target.closest('.cliente-fila');
  if (!fila) return;
  seleccionarCliente(Number(fila.dataset.id));
});

async function seleccionarCliente(id) {
  clienteSeleccionadoId = id;
  abonoVentaIdAbierto = null;
  document.querySelectorAll('.cliente-fila').forEach((el) => {
    el.classList.toggle('seleccionado', Number(el.dataset.id) === id);
  });

  clienteFichaEl.innerHTML = '<p class="empty-state">Cargando…</p>';
  try {
    const res = await fetch(`${API_URL}/clientes/${id}/deuda`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      clienteFichaEl.innerHTML = `<p class="empty-state">${escaparHtml(data.mensaje) || 'No se pudo cargar la información del cliente.'}</p>`;
      return;
    }

    fichaClienteActual = data;
    renderizarFichaCliente();
  } catch (err) {
    clienteFichaEl.innerHTML = '<p class="empty-state">Error de conexión al cargar la información del cliente.</p>';
  }
}

function filaAbonoInline(venta) {
  return `
    <tr>
      <td colspan="6">
        <div class="abono-inline">
          <p>Registrar pago sobre la factura N.° ${venta.venta_id} — saldo pendiente: <strong>${formatearPesos(venta.saldo)}</strong></p>
          <form id="form-abono" class="form-grid-3col" data-venta-id="${venta.venta_id}" data-saldo="${venta.saldo}">
            <div class="form-group">
              <label for="abono-monto">Monto del pago ($)</label>
              <input type="number" id="abono-monto" min="1" max="${venta.saldo}" placeholder="Ej: 20000" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Registrar pago</button>
              <button type="button" id="btn-cancelar-abono" class="btn btn-neutral btn-sm">Cancelar</button>
            </div>
          </form>
          <p class="abono-saldo-referencia" id="abono-restante-preview"></p>
          <div id="mensaje-abono" class="mensaje"></div>
        </div>
      </td>
    </tr>
  `;
}

function renderizarFichaCliente() {
  if (!fichaClienteActual) return;
  const { cliente, ventas, abonos, saldoTotal, ventasTotales } = fichaClienteActual;
  const inactivo = cliente.activo === 0;

  const datos = [
    cliente.documento ? `Documento: ${escaparHtml(cliente.documento)}` : null,
    cliente.telefono ? `Teléfono: ${escaparHtml(cliente.telefono)}` : null,
    cliente.correo ? `Correo: ${escaparHtml(cliente.correo)}` : null,
  ].filter(Boolean);

  const saldoTexto =
    saldoTotal === 0
      ? `<span class="badge badge-ok">${icono('circle-check', 'icon-sm')} Al día — deuda saldada</span>`
      : `<strong>${formatearPesos(saldoTotal)}</strong>`;

  const filasVentas = ventas.length
    ? ventas
        .map((v) => {
          const dias = v.saldo > 0 ? diasTranscurridos(v.creado_en) : null;
          const enMora = dias !== null && dias > DIAS_LIMITE_MORA;
          const filaVenta = `
            <tr class="${enMora ? 'fila-mora' : ''}">
              <td>${v.venta_id}</td>
              <td>${formatearFecha(v.creado_en)}</td>
              <td>${formatearPesos(v.total)}</td>
              <td>${formatearPesos(v.abonado)}</td>
              <td>
                ${formatearPesos(v.saldo)}
                ${enMora ? `<br><span class="badge badge-low">${icono('alert-triangle', 'icon-sm')} ${dias} día(s)</span>` : ''}
              </td>
              <td class="acciones-factura">
                <button type="button" class="btn btn-secondary btn-sm btn-ver-factura" data-venta-id="${v.venta_id}">Ver factura</button>
                ${v.saldo > 0 ? `<button type="button" class="btn btn-primary btn-sm btn-registrar-abono-fila" data-venta-id="${v.venta_id}">Registrar abono</button>` : ''}
              </td>
            </tr>
          `;
          return abonoVentaIdAbierto === v.venta_id ? filaVenta + filaAbonoInline(v) : filaVenta;
        })
        .join('')
    : '<tr><td colspan="6" class="empty-state">Este cliente no tiene ventas a crédito.</td></tr>';

  const filasAbonos = abonos.length
    ? abonos.map((a) => `<li>Factura N.° ${a.venta_id}: ${formatearPesos(a.monto)} (${formatearFecha(a.creado_en)})</li>`).join('')
    : '<li class="empty-state">Sin abonos registrados.</li>';

  // "Eliminar" (borrado permanente) solo se ofrece cuando el cliente nunca
  // tuvo una venta asociada — mismas condiciones que valida
  // clientesService.eliminarCliente en el servidor. El botón es solo un
  // atajo de UI, el servidor vuelve a validar antes de borrar.
  const puedeEliminar = ventasTotales === 0;
  const botonEliminar = puedeEliminar
    ? `<button type="button" id="btn-eliminar-cliente" class="btn btn-danger btn-sm">${icono('trash-2', 'icon-sm')} Eliminar</button>`
    : '';
  const acciones = inactivo
    ? `<button type="button" id="btn-reactivar-cliente" class="btn btn-secondary btn-sm">${icono('circle-check', 'icon-sm')} Reactivar</button>${botonEliminar}`
    : `
      <button type="button" id="btn-editar-cliente" class="btn btn-secondary btn-sm">${icono('pencil', 'icon-sm')} Editar</button>
      <button type="button" id="btn-desactivar-cliente" class="btn btn-danger btn-sm">${icono('user-x', 'icon-sm')} Desactivar</button>
      ${botonEliminar}
    `;

  clienteFichaEl.innerHTML = `
    <div class="cliente-ficha-header">
      <h3>
        ${escaparHtml(cliente.nombre)}
        ${cliente.es_mayorista ? '<span class="badge badge-neutro">Mayorista</span>' : ''}
        ${inactivo ? '<span class="badge badge-neutro">Inactivo</span>' : ''}
      </h3>
      <div class="cliente-ficha-acciones">${acciones}</div>
    </div>
    <p class="cliente-ficha-datos">${datos.length ? datos.join(' · ') : 'Sin datos de contacto registrados.'}</p>
    <p class="cliente-ficha-saldo">Deuda total: ${saldoTexto}</p>
    <div id="mensaje-ficha-cliente" class="mensaje"></div>

    <h4>Facturas a crédito</h4>
    <div class="table-responsive">
      <table class="tabla-inventario">
        <thead>
          <tr><th>Factura</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th><th></th></tr>
        </thead>
        <tbody>${filasVentas}</tbody>
      </table>
    </div>

    <h4>Abonos registrados</h4>
    <ul>${filasAbonos}</ul>
  `;

  if (abonoVentaIdAbierto) {
    const inputMonto = document.getElementById('abono-monto');
    if (inputMonto) inputMonto.focus();
  }
}

// Ver la factura completa (items, cantidades, precios) de una venta desde
// la ficha del cliente. Reutiliza GET /api/ventas/:id — ya trae los items y
// el desglose de IVA — y mostrarFactura(), la misma función que ya pinta la
// factura recién generada: no se duplica el renderizado en ningún lado nuevo.
async function verFacturaCompleta(ventaId) {
  try {
    const res = await fetch(`${API_URL}/ventas/${ventaId}`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      window.alert(data.mensaje || 'No se pudo cargar la factura.');
      return;
    }

    document.querySelector('.tab-btn[data-tab="facturas"]').click();
    mostrarFactura(data.venta);
  } catch (err) {
    window.alert('Error de conexión al cargar la factura.');
  }
}

// Aplica el resultado de un abono exitoso sobre los datos ya cargados en
// memoria (ficha + lista), sin volver a pedirle nada al servidor.
function aplicarAbonoEnFicha(ventaId, abono, saldoRestante) {
  const venta = fichaClienteActual.ventas.find((v) => v.venta_id === ventaId);
  if (venta) {
    venta.abonado += abono.monto;
    venta.saldo = saldoRestante;
  }
  fichaClienteActual.abonos.unshift(abono);
  fichaClienteActual.saldoTotal = fichaClienteActual.ventas.reduce((suma, v) => suma + v.saldo, 0);

  const clienteEnCache = clientesCache.find((c) => c.id === fichaClienteActual.cliente.id);
  if (clienteEnCache) {
    clienteEnCache.saldo_total = fichaClienteActual.saldoTotal;
    const pendientes = fichaClienteActual.ventas.filter((v) => v.saldo > 0);
    if (pendientes.length === 0) {
      clienteEnCache.dias_deuda_mas_vieja = null;
      clienteEnCache.en_mora = false;
    } else {
      // Comparación lexicográfica de "AAAA-MM-DD HH:MM:SS" equivale a
      // orden cronológico — no hace falta parsear fechas para hallar la más vieja.
      const masVieja = pendientes.reduce((min, v) => (v.creado_en < min.creado_en ? v : min));
      const dias = diasTranscurridos(masVieja.creado_en);
      clienteEnCache.dias_deuda_mas_vieja = dias;
      clienteEnCache.en_mora = dias > DIAS_LIMITE_MORA;
    }
  }
}

// Delegación de eventos sobre toda la ficha: su HTML se regenera por
// completo en cada renderizarFichaCliente(), así que un solo listener acá
// cubre los botones de ver factura, registrar abono, editar y desactivar,
// presentes o futuros.
clienteFichaEl.addEventListener('click', (e) => {
  const btnVerFactura = e.target.closest('.btn-ver-factura');
  if (btnVerFactura) {
    verFacturaCompleta(btnVerFactura.dataset.ventaId);
    return;
  }

  const btnAbrirAbono = e.target.closest('.btn-registrar-abono-fila');
  if (btnAbrirAbono) {
    abonoVentaIdAbierto = Number(btnAbrirAbono.dataset.ventaId);
    renderizarFichaCliente();
    return;
  }

  if (e.target.closest('#btn-cancelar-abono')) {
    abonoVentaIdAbierto = null;
    renderizarFichaCliente();
    return;
  }

  if (e.target.closest('#btn-editar-cliente')) {
    abrirFormCliente(fichaClienteActual.cliente);
    return;
  }

  if (e.target.closest('#btn-desactivar-cliente')) {
    desactivarClienteActual();
    return;
  }

  if (e.target.closest('#btn-reactivar-cliente')) {
    reactivarClienteActual();
    return;
  }

  if (e.target.closest('#btn-eliminar-cliente')) {
    eliminarClienteActual();
  }
});

// Vista previa en vivo del saldo restante mientras se escribe el monto.
clienteFichaEl.addEventListener('input', (e) => {
  if (e.target.id !== 'abono-monto') return;
  const form = e.target.closest('form');
  const saldo = Number(form.dataset.saldo);
  const monto = Number(e.target.value) || 0;
  const preview = document.getElementById('abono-restante-preview');
  if (!preview) return;

  if (monto <= 0) {
    preview.textContent = '';
    preview.classList.remove('excede');
  } else if (monto > saldo) {
    preview.textContent = `El monto no puede superar el saldo pendiente (${formatearPesos(saldo)}).`;
    preview.classList.add('excede');
  } else {
    preview.textContent = `Quedaría un saldo de ${formatearPesos(saldo - monto)}.`;
    preview.classList.remove('excede');
  }
});

// Registrar abono (avisa antes de enviar si el monto supera el saldo — el
// backend también lo valida, pero avisar antes evita el viaje al servidor).
clienteFichaEl.addEventListener('submit', async (e) => {
  if (e.target.id !== 'form-abono') return;
  e.preventDefault();

  const form = e.target;
  const ventaId = Number(form.dataset.ventaId);
  const saldo = Number(form.dataset.saldo);
  const monto = Number(document.getElementById('abono-monto').value);
  const mensajeAbono = document.getElementById('mensaje-abono');
  mostrarMensaje(mensajeAbono, '', null);

  if (!Number.isInteger(monto) || monto <= 0) {
    mostrarMensaje(mensajeAbono, 'Ingresá un monto válido.', 'error');
    return;
  }
  if (monto > saldo) {
    mostrarMensaje(mensajeAbono, `El monto no puede superar el saldo pendiente (${formatearPesos(saldo)}).`, 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/ventas/${ventaId}/abonos`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify({ monto }),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeAbono, data.mensaje || 'No se pudo registrar el abono.', 'error');
      return;
    }

    aplicarAbonoEnFicha(ventaId, data.abono, data.saldoRestante);
    abonoVentaIdAbierto = null;
    renderizarFichaCliente();
    filtrarClientes();
    mostrarMensaje(
      document.getElementById('mensaje-ficha-cliente'),
      `Pago de ${formatearPesos(monto)} registrado en la factura N.° ${ventaId}. Nuevo saldo: ${formatearPesos(data.saldoRestante)}.`,
      'exito'
    );
  } catch (err) {
    mostrarMensaje(mensajeAbono, 'Error de conexión al registrar el abono.', 'error');
  }
});

// --- Registrar / editar cliente (mismo formulario para ambos casos) ---

function abrirFormCliente(cliente = null) {
  formCliente.reset();
  if (cliente) {
    inputClienteIdEditando.value = cliente.id;
    document.getElementById('cliente-nombre').value = cliente.nombre || '';
    document.getElementById('cliente-documento').value = cliente.documento || '';
    document.getElementById('cliente-telefono').value = cliente.telefono || '';
    document.getElementById('cliente-correo').value = cliente.correo || '';
    document.getElementById('cliente-mayorista').checked = Boolean(cliente.es_mayorista);
    btnGuardarCliente.textContent = 'Guardar cambios';
  } else {
    inputClienteIdEditando.value = '';
    btnGuardarCliente.textContent = 'Guardar cliente';
  }
  mostrarMensaje(mensajeCliente, '', null);
  formCliente.classList.remove('hidden');
  formCliente.scrollIntoView({ block: 'nearest' });
  document.getElementById('cliente-nombre').focus();
}

function cerrarFormCliente() {
  formCliente.classList.add('hidden');
  formCliente.reset();
  inputClienteIdEditando.value = '';
  mostrarMensaje(mensajeCliente, '', null);
}

btnMostrarFormCliente.addEventListener('click', () => abrirFormCliente(null));
btnCancelarFormCliente.addEventListener('click', cerrarFormCliente);

formCliente.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeCliente, '', null);

  const idEditando = inputClienteIdEditando.value;
  const payload = {
    nombre: document.getElementById('cliente-nombre').value.trim(),
    documento: document.getElementById('cliente-documento').value.trim() || null,
    telefono: document.getElementById('cliente-telefono').value.trim() || null,
    correo: document.getElementById('cliente-correo').value.trim() || null,
    esMayorista: document.getElementById('cliente-mayorista').checked,
  };

  try {
    const res = await fetch(`${API_URL}/clientes${idEditando ? `/${idEditando}` : ''}`, {
      method: idEditando ? 'PUT' : 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCliente, data.mensaje || 'No se pudo guardar el cliente.', 'error');
      return;
    }

    mostrarMensaje(
      mensajeCliente,
      idEditando ? `Cliente "${data.cliente.nombre}" actualizado.` : `Cliente "${data.cliente.nombre}" registrado (N.° ${data.cliente.id}).`,
      'exito'
    );
    cerrarFormCliente();
    if (!idEditando) clienteSeleccionadoId = data.cliente.id;
    cargarClientesPantalla();
    cargarClientesParaVenta();
  } catch (err) {
    mostrarMensaje(mensajeCliente, 'Error de conexión al guardar el cliente.', 'error');
  }
});

async function desactivarClienteActual() {
  const cliente = fichaClienteActual && fichaClienteActual.cliente;
  if (!cliente) return;

  const confirmado = window.confirm(
    `¿Desactivar a "${cliente.nombre}"? No vas a poder elegirlo para ventas nuevas, pero su historial de facturas y abonos se conserva.`
  );
  if (!confirmado) return;

  try {
    const res = await fetch(`${API_URL}/clientes/${cliente.id}`, {
      method: 'DELETE',
      headers: obtenerHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCliente, data.mensaje || 'No se pudo desactivar el cliente.', 'error');
      return;
    }

    mostrarMensaje(mensajeCliente, `Cliente "${cliente.nombre}" desactivado.`, 'exito');
    clienteSeleccionadoId = null;
    fichaClienteActual = null;
    cargarClientesPantalla();
    cargarClientesParaVenta();
  } catch (err) {
    mostrarMensaje(mensajeCliente, 'Error de conexión al desactivar el cliente.', 'error');
  }
}

async function reactivarClienteActual() {
  const cliente = fichaClienteActual && fichaClienteActual.cliente;
  if (!cliente) return;

  try {
    const res = await fetch(`${API_URL}/clientes/${cliente.id}/reactivar`, { method: 'PATCH', headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCliente, data.mensaje || 'No se pudo reactivar el cliente.', 'error');
      return;
    }

    mostrarMensaje(mensajeCliente, `Cliente "${cliente.nombre}" reactivado.`, 'exito');
    clienteSeleccionadoId = cliente.id;
    cargarClientesPantalla();
    cargarClientesParaVenta();
  } catch (err) {
    mostrarMensaje(mensajeCliente, 'Error de conexión al reactivar el cliente.', 'error');
  }
}

async function eliminarClienteActual() {
  const cliente = fichaClienteActual && fichaClienteActual.cliente;
  if (!cliente) return;

  const confirmado = window.confirm(
    `¿Eliminar a "${cliente.nombre}" de forma permanente? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    const res = await fetch(`${API_URL}/clientes/${cliente.id}/permanente`, {
      method: 'DELETE',
      headers: obtenerHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCliente, data.mensaje || 'No se pudo eliminar el cliente.', 'error');
      return;
    }

    mostrarMensaje(mensajeCliente, `Cliente "${cliente.nombre}" eliminado.`, 'exito');
    clienteSeleccionadoId = null;
    fichaClienteActual = null;
    cargarClientesPantalla();
    cargarClientesParaVenta();
  } catch (err) {
    mostrarMensaje(mensajeCliente, 'Error de conexión al eliminar el cliente.', 'error');
  }
}

// --- DATOS DE LA EMPRESA ---

const formConfiguracion = document.getElementById('form-configuracion');
const mensajeConfiguracion = document.getElementById('mensaje-configuracion');

let configuracionActual = null;

async function cargarConfiguracion() {
  try {
    const res = await fetch(`${API_URL}/configuracion`, { headers: obtenerHeaders() });
    const data = await res.json();
    configuracionActual = data.exito ? data.configuracion : null;

    if (configuracionActual) {
      document.getElementById('config-nombre').value = configuracionActual.nombre_empresa || '';
      document.getElementById('config-nit').value = configuracionActual.nit || '';
      document.getElementById('config-direccion').value = configuracionActual.direccion || '';
      document.getElementById('config-telefono').value = configuracionActual.telefono || '';
      document.getElementById('config-correo').value = configuracionActual.correo || '';
      document.getElementById('config-logo').value = configuracionActual.logo_ruta || '';
      document.getElementById('config-iva').value = configuracionActual.iva_porcentaje ?? '';
    }
  } catch (err) {
    configuracionActual = null;
  }
}

// Usa lo cargado por cargarConfiguracion() para pintar el encabezado de la
// factura impresa (logo, nombre, NIT/dirección/teléfono) en vez del texto
// fijo "Milagros" que había antes.
function aplicarEncabezadoEmpresa() {
  const nombre = (configuracionActual && configuracionActual.nombre_empresa) || 'Milagros';
  document.getElementById('factura-empresa-nombre').textContent = nombre;

  const datos = [
    configuracionActual && configuracionActual.nit ? `NIT ${configuracionActual.nit}` : null,
    configuracionActual && configuracionActual.direccion,
    configuracionActual && configuracionActual.telefono,
  ].filter(Boolean);
  document.getElementById('factura-empresa-datos').textContent = datos.join(' · ');

  const logoImg = document.getElementById('factura-logo');
  if (configuracionActual && configuracionActual.logo_ruta) {
    logoImg.src = configuracionActual.logo_ruta;
    logoImg.classList.remove('hidden');
  } else {
    logoImg.classList.add('hidden');
  }
}

formConfiguracion.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeConfiguracion, '', null);

  const payload = {
    nombreEmpresa: document.getElementById('config-nombre').value.trim(),
    nit: document.getElementById('config-nit').value.trim() || null,
    direccion: document.getElementById('config-direccion').value.trim() || null,
    telefono: document.getElementById('config-telefono').value.trim() || null,
    correo: document.getElementById('config-correo').value.trim() || null,
    logoRuta: document.getElementById('config-logo').value.trim() || null,
    ivaPorcentaje: Number(document.getElementById('config-iva').value),
  };

  try {
    const res = await fetch(`${API_URL}/configuracion`, {
      method: 'PUT',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeConfiguracion, data.mensaje || 'No se pudo guardar la configuración.', 'error');
      return;
    }

    configuracionActual = data.configuracion;
    mostrarMensaje(mensajeConfiguracion, 'Configuración guardada.', 'exito');
  } catch (err) {
    mostrarMensaje(mensajeConfiguracion, 'Error de conexión al guardar la configuración.', 'error');
  }
});

// --- REPORTES ---

// Mismo resumen (ventas, facturado, recibido, ganancia, desglose por
// método) para "hoy" y para un rango: la única diferencia es qué rango de
// fechas se consultó, así que comparten este único renderizador. Los
// totales van en una cuadrícula de cifras grandes (jerarquía clara de un
// vistazo); el detalle fino (recibido en ventas vs. abonos, desglose por
// método) queda como texto más chico debajo, para no competir con los
// números principales.
function renderizarResumenReporte(contenedor, resumen, encabezado = '') {
  const filasMetodo = resumen.porMetodoPago
    .map(
      (m) => `
      <li>
        ${ETIQUETA_METODO_PAGO[m.metodoPago] || m.metodoPago}:
        ${m.cantidad} venta(s), facturado ${formatearPesos(m.totalFacturado)},
        recibido ${formatearPesos(m.dineroRecibido)}
      </li>`
    )
    .join('');

  const notaAproximada = resumen.gananciaAproximada
    ? ' <em>(incluye ventas registradas antes de guardar el costo histórico; para esas se usó el precio de compra actual del producto como aproximación)</em>'
    : '';

  // Mismo dato que ya se ve en el Excel/PDF exportado (exportacionService.js)
  // pero antes no aparecía en este resumen en pantalla — la usuaria tenía
  // que descargar un archivo solo para saber cuánto IVA recaudó.
  const notaIvaAproximada = resumen.ivaAproximado
    ? ' <em>(incluye ventas registradas antes de configurar el IVA; para esas se usó el % de IVA actual del negocio como aproximación)</em>'
    : '';

  contenedor.innerHTML = `
    <div class="reporte-encabezado">${encabezado}</div>
    <div class="reporte-stats">
      <div class="stat-item">
        <span class="stat-label">Ventas</span>
        <strong class="stat-valor">${resumen.cantidadVentas}</strong>
      </div>
      <div class="stat-item destacado">
        <span class="stat-label">Total facturado</span>
        <strong class="stat-valor">${formatearPesos(resumen.totalFacturado)}</strong>
      </div>
      <div class="stat-item">
        <span class="stat-label">Recibido en caja</span>
        <strong class="stat-valor">${formatearPesos(resumen.dineroRecibidoTotal)}</strong>
      </div>
      <div class="stat-item">
        <span class="stat-label">Ganancia<span class="dato-interno"> (interno)</span></span>
        <strong class="stat-valor">${formatearPesos(resumen.gananciaTotal)}</strong>
      </div>
      <div class="stat-item">
        <span class="stat-label">IVA recaudado</span>
        <strong class="stat-valor">${formatearPesos(resumen.ivaRecaudado)}</strong>
      </div>
    </div>
    <p class="reporte-detalle">Dinero recibido en ventas (efectivo/transferencia): <strong>${formatearPesos(resumen.dineroRecibidoVentas)}</strong></p>
    <p class="reporte-detalle">Abonos recibidos (pagos de ventas a crédito): <strong>${formatearPesos(resumen.abonosRecibidos)}</strong></p>
    ${notaAproximada ? `<p class="reporte-detalle">${notaAproximada}</p>` : ''}
    ${notaIvaAproximada ? `<p class="reporte-detalle">${notaIvaAproximada}</p>` : ''}
    <p><strong>Desglose por método de pago:</strong></p>
    <ul>${filasMetodo || '<li class="empty-state">Sin ventas en este rango.</li>'}</ul>
  `;
}

// Ventas y ganancia del día (calendario colombiano, lo resuelve el backend).
document.getElementById('btn-ventas-hoy').addEventListener('click', async () => {
  const contenedor = document.getElementById('resumen-ventas-hoy');
  contenedor.innerHTML = '<p class="empty-state">Cargando...</p>';

  try {
    const res = await fetch(`${API_URL}/reportes/ventas-dia`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      contenedor.innerHTML = `<p class="empty-state">${escaparHtml(data.mensaje) || 'No se pudo cargar el reporte.'}</p>`;
      return;
    }

    renderizarResumenReporte(contenedor, data, `<p>Fecha (Colombia): <strong>${formatearFecha(data.fecha, { conHora: false })}</strong></p>`);
  } catch (err) {
    contenedor.innerHTML = '<p class="empty-state">Error de conexión al cargar el reporte.</p>';
  }
});

// Mismo resumen, para un rango de fechas elegido por la usuaria.
document.getElementById('btn-historico').addEventListener('click', async () => {
  const mensajeHistorico = document.getElementById('mensaje-historico');
  const contenedor = document.getElementById('resumen-historico');
  mostrarMensaje(mensajeHistorico, '', null);

  const desde = document.getElementById('historico-desde').value;
  const hasta = document.getElementById('historico-hasta').value;

  if (!desde || !hasta) {
    mostrarMensaje(mensajeHistorico, 'Elegí ambas fechas (desde y hasta).', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/reportes/historico?desde=${desde}&hasta=${hasta}`, {
      headers: obtenerHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeHistorico, data.mensaje || 'No se pudo consultar el histórico.', 'error');
      return;
    }

    renderizarResumenReporte(
      contenedor,
      data,
      `<p>Rango: <strong>${formatearFecha(data.desde, { conHora: false })}</strong> a <strong>${formatearFecha(data.hasta, { conHora: false })}</strong></p>`
    );
  } catch (err) {
    mostrarMensaje(mensajeHistorico, 'Error de conexión al consultar el histórico.', 'error');
  }
});

// Exportación del reporte histórico a Excel/PDF: reutiliza las mismas
// fechas Desde/Hasta del formulario de arriba. Es una descarga de archivo
// protegida por sesión, así que no puede ser un <a href> normal (el
// navegador no manda el header Authorization en una navegación); se pide
// con fetch + Authorization y se dispara la descarga con un <a> temporal
// apuntando a un blob: URL.
async function exportarReporteHistorico(formato) {
  const mensajeExportar = document.getElementById('mensaje-exportar');
  mostrarMensaje(mensajeExportar, '', null);

  const desde = document.getElementById('historico-desde').value;
  const hasta = document.getElementById('historico-hasta').value;

  if (!desde || !hasta) {
    mostrarMensaje(mensajeExportar, 'Elegí ambas fechas (desde y hasta) para exportar.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/reportes/exportar/${formato}?desde=${desde}&hasta=${hasta}`, {
      headers: obtenerHeaders(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      mostrarMensaje(mensajeExportar, (data && data.mensaje) || 'No se pudo exportar el reporte.', 'error');
      return;
    }

    const blob = await res.blob();
    const extension = formato === 'excel' ? 'xlsx' : 'pdf';
    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `reporte-ventas_${desde}_a_${hasta}.${extension}`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    mostrarMensaje(mensajeExportar, 'Error de conexión al exportar el reporte.', 'error');
  }
}

document.getElementById('btn-exportar-excel').addEventListener('click', () => exportarReporteHistorico('excel'));
document.getElementById('btn-exportar-pdf').addEventListener('click', () => exportarReporteHistorico('pdf'));

// Listado de ventas individuales que componen un reporte (día/rango): misma
// tabla para ambos casos, con un botón "Ver factura" por fila que reutiliza
// verFacturaCompleta() (la misma función que ya usa el detalle de deuda de
// un cliente).
function renderizarListadoVentas(tbody, ventas) {
  if (!ventas || ventas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin ventas en este rango.</td></tr>';
    return;
  }

  tbody.innerHTML = ventas
    .map(
      (v) => `
      <tr>
        <td>${v.id}</td>
        <td>${formatearFecha(v.creado_en)}</td>
        <td>${escaparHtml(v.nombre_cliente) || 'Mostrador'}</td>
        <td><span class="badge badge-neutro">${ETIQUETA_METODO_PAGO[v.metodo_pago] || v.metodo_pago}</span></td>
        <td>${formatearPesos(v.total)}</td>
        <td><button type="button" class="btn btn-secondary btn-sm btn-ver-factura" data-venta-id="${v.id}">Ver factura</button></td>
      </tr>
    `
    )
    .join('');
}

document.getElementById('btn-listado-ventas-hoy').addEventListener('click', async () => {
  const tbody = document.getElementById('tabla-body-listado-ventas-hoy');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Cargando...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/reportes/ventas-dia/listado`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escaparHtml(data.mensaje) || 'No se pudo cargar el listado.'}</td></tr>`;
      return;
    }

    renderizarListadoVentas(tbody, data.ventas);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error de conexión al cargar el listado.</td></tr>';
  }
});

document.getElementById('btn-listado-historico').addEventListener('click', async () => {
  const tbody = document.getElementById('tabla-body-listado-historico');
  const desde = document.getElementById('historico-desde').value;
  const hasta = document.getElementById('historico-hasta').value;

  if (!desde || !hasta) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Elegí ambas fechas (desde y hasta) arriba y consultá de nuevo.</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Cargando...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/reportes/historico/listado?desde=${desde}&hasta=${hasta}`, {
      headers: obtenerHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escaparHtml(data.mensaje) || 'No se pudo cargar el listado.'}</td></tr>`;
      return;
    }

    renderizarListadoVentas(tbody, data.ventas);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error de conexión al cargar el listado.</td></tr>';
  }
});

// Misma idea de delegación de eventos que en la ficha del cliente: estas
// tablas de listado se regeneran con innerHTML en cada consulta.
document.getElementById('tabla-body-listado-ventas-hoy').addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-ver-factura');
  if (!boton) return;
  verFacturaCompleta(boton.dataset.ventaId);
});

document.getElementById('tabla-body-listado-historico').addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-ver-factura');
  if (!boton) return;
  verFacturaCompleta(boton.dataset.ventaId);
});

// Ranking de productos más vendidos, con rango de fechas opcional.
document.getElementById('btn-ranking').addEventListener('click', async () => {
  const mensajeRanking = document.getElementById('mensaje-ranking');
  const tablaRanking = document.getElementById('tabla-body-ranking');
  mostrarMensaje(mensajeRanking, '', null);

  const desde = document.getElementById('ranking-desde').value;
  const hasta = document.getElementById('ranking-hasta').value;
  const parametros = desde && hasta ? `?desde=${desde}&hasta=${hasta}` : '';

  try {
    const res = await fetch(`${API_URL}/reportes/productos-mas-vendidos${parametros}`, {
      headers: obtenerHeaders(),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeRanking, data.mensaje || 'No se pudo consultar el ranking.', 'error');
      return;
    }

    if (data.productos.length === 0) {
      tablaRanking.innerHTML = '<tr><td colspan="4" class="empty-state">No hay ventas registradas en este rango.</td></tr>';
      return;
    }

    tablaRanking.innerHTML = data.productos
      .map(
        (p, indice) => `
        <tr>
          <td><strong>${indice + 1}</strong></td>
          <td>${escaparHtml(p.nombre)}</td>
          <td>${p.unidades_vendidas}</td>
          <td>${formatearPesos(p.ingreso_generado)}</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    mostrarMensaje(mensajeRanking, 'Error de conexión al consultar el ranking.', 'error');
  }
});

// --- Registro de auditoría (solo lectura) ---

// El backend guarda y filtra por códigos internos ("producto_creado"), pero
// nadie no técnico debería ver eso en pantalla — se traduce acá, en los dos
// únicos lugares donde se muestran: las opciones del filtro y la columna
// "Acción" de la tabla. Si el backend agrega una acción nueva que todavía
// no tiene traducción, se muestra el código tal cual en vez de romper nada.
const ETIQUETA_ACCION = {
  login_exitoso: 'Inicio de sesión',
  login_fallido: 'Intento de inicio de sesión fallido',
  logout: 'Cierre de sesión',
  venta_creada: 'Venta registrada',
  abono_registrado: 'Pago registrado',
  producto_creado: 'Producto agregado',
  producto_actualizado: 'Producto editado',
  producto_desactivado: 'Producto desactivado',
  producto_reactivado: 'Producto reactivado',
  producto_eliminado: 'Producto eliminado',
  stock_ingresado: 'Ingreso de mercancía',
  cliente_creado: 'Cliente agregado',
  cliente_actualizado: 'Cliente editado',
  cliente_desactivado: 'Cliente desactivado',
  cliente_reactivado: 'Cliente reactivado',
  cliente_eliminado: 'Cliente eliminado',
  configuracion_actualizada: 'Configuración del negocio editada',
  recuperacion_solicitada: 'Recuperación de contraseña solicitada',
  recuperacion_completada: 'Contraseña restablecida',
  factura_enviada_correo: 'Factura enviada por correo',
};

const ETIQUETA_ENTIDAD = {
  venta: 'Factura',
  usuario: 'Usuario',
  cliente: 'Cliente',
  producto: 'Producto',
  configuracion_empresa: 'Configuración del negocio',
};

// Popula el <select> de acciones con el catálogo real que expone el
// backend (para no duplicar a mano la lista de códigos posibles), mostrando
// la etiqueta legible mientras el valor real que viaja en la consulta sigue
// siendo el código interno.
async function cargarAccionesAuditoria() {
  const selectAccion = document.getElementById('auditoria-accion');
  if (selectAccion.dataset.cargado === 'true') return;

  try {
    const res = await fetch(`${API_URL}/auditoria/acciones`, { headers: obtenerHeaders() });
    const data = await res.json();
    if (!res.ok || !data.exito) return;

    data.acciones.forEach((accion) => {
      const opcion = document.createElement('option');
      opcion.value = accion;
      opcion.textContent = ETIQUETA_ACCION[accion] || accion;
      selectAccion.appendChild(opcion);
    });
    selectAccion.dataset.cargado = 'true';
  } catch (err) {
    // Sin catálogo el filtro "Todas" sigue funcionando; no es bloqueante.
  }
}

document.getElementById('btn-auditoria').addEventListener('click', cargarAuditoria);

async function cargarAuditoria() {
  const mensajeAuditoria = document.getElementById('mensaje-auditoria');
  const tablaAuditoria = document.getElementById('tabla-body-auditoria');
  mostrarMensaje(mensajeAuditoria, '', null);

  const desde = document.getElementById('auditoria-desde').value;
  const hasta = document.getElementById('auditoria-hasta').value;
  const accion = document.getElementById('auditoria-accion').value;
  const usuario = document.getElementById('auditoria-usuario').value.trim();

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);
  if (accion) parametros.set('accion', accion);
  if (usuario) parametros.set('usuario', usuario);
  const query = parametros.toString() ? `?${parametros.toString()}` : '';

  tablaAuditoria.innerHTML = '<tr><td colspan="6" class="empty-state">Cargando...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/auditoria${query}`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeAuditoria, data.mensaje || 'No se pudo consultar el registro de auditoría.', 'error');
      tablaAuditoria.innerHTML = '<tr><td colspan="6" class="empty-state">Sin datos.</td></tr>';
      return;
    }

    if (data.eventos.length === 0) {
      tablaAuditoria.innerHTML = '<tr><td colspan="6" class="empty-state">No hay eventos que coincidan con el filtro.</td></tr>';
      return;
    }

    tablaAuditoria.innerHTML = data.eventos
      .map(
        (evento) => `
        <tr>
          <td>${formatearFecha(evento.creado_en)}</td>
          <td>${escaparHtml(evento.usuario)}</td>
          <td>${escaparHtml(ETIQUETA_ACCION[evento.accion] || evento.accion)}</td>
          <td>${escaparHtml(ETIQUETA_ENTIDAD[evento.entidad] || evento.entidad)}${evento.entidad_id ? ` #${evento.entidad_id}` : ''}</td>
          <td>${escaparHtml(evento.detalle)}</td>
          <td>${escaparHtml(evento.ip)}</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    mostrarMensaje(mensajeAuditoria, 'Error de conexión al consultar el registro de auditoría.', 'error');
    tablaAuditoria.innerHTML = '<tr><td colspan="6" class="empty-state">Sin datos.</td></tr>';
  }
}
