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

// Stock DOM
const formStock = document.getElementById('form-stock');
const mensajeStock = document.getElementById('mensaje-stock');
const tablaStockBody = document.getElementById('tabla-body-stock');
const contenedorAlertas = document.getElementById('contenedor-alertas');

const btnCargarStock = document.getElementById('btn-cargar-stock');
const btnActualizarAlertas = document.getElementById('btn-actualizar-alertas');

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

// El backend guarda las fechas como "AAAA-MM-DD HH:MM:SS" (hora del
// servidor, sin ajuste de zona horaria). Acá se parsean los componentes
// directo del string, sin pasar por `new Date(string)`: ese constructor
// interpreta este formato de manera distinta según el motor del navegador
// (a veces como hora local, a veces como UTC), lo que podría correr la
// fecha/hora mostrada sin que el dato real haya cambiado. Parseando a mano
// se reformatea exactamente el mismo instante que ya se mostraba antes,
// solo que legible.
function formatearFecha(fechaStr, { conHora = true } = {}) {
  if (!fechaStr) return '';
  const match = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return fechaStr;

  const [, anio, mes, dia, hora, minuto] = match;
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
  cargarStockTiempoReal();
  cargarAlertasStock();
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
    }

    if (boton.dataset.tab === 'configuracion') {
      cargarConfiguracion();
    }

    if (boton.dataset.tab === 'clientes') {
      cargarDeudores();
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


// --- REGISTRAR PRODUCTO ---
formProducto.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeProducto, '', null);

  const payload = {
    codigoBarras: document.getElementById('prod-codigo').value.trim() || null,
    nombre: document.getElementById('prod-nombre').value.trim(),
    descripcion: document.getElementById('prod-descripcion').value.trim() || null,
    precioCompra: Number(document.getElementById('prod-pcompra').value),
    precioDetal: Number(document.getElementById('prod-pdetal').value),
    precioMayor: Number(document.getElementById('prod-pmayor').value),
    stockActual: Number(document.getElementById('prod-stock-inicial').value) || 0,
    stockMinimo: Number(document.getElementById('prod-stock-minimo').value) || 0,
  };

  try {
    const res = await fetch(`${API_URL}/productos`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeProducto, data.mensaje || 'Error al registrar el producto.', 'error');
      return;
    }

    let msg = `Producto "${data.producto.nombre}" registrado exitosamente.`;
    if (data.advertencias && data.advertencias.length > 0) {
      msg += ` (Advertencia: ${data.advertencias.join(' ')})`;
    }

    mostrarMensaje(mensajeProducto, msg, 'exito');
    formProducto.reset();

    // Refrescar tablas
    cargarPanel();

  } catch (err) {
    mostrarMensaje(mensajeProducto, 'Error de conexión al guardar el producto.', 'error');
  }
});


// --- REGISTRAR ENTRADA DE STOCK ---
formStock.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeStock, '', null);

  const id = document.getElementById('stock-producto-id').value;
  const cantidad = Number(document.getElementById('stock-cantidad').value);

  try {
    const res = await fetch(`${API_URL}/productos/${id}/stock`, {
      method: 'PATCH',
      headers: obtenerHeaders(),
      body: JSON.stringify({ cantidad })
    });

    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeStock, data.mensaje || 'Error al actualizar el stock.', 'error');
      return;
    }

    mostrarMensaje(
      mensajeStock,
      `Stock actualizado. "${data.producto.nombre}" ahora cuenta con ${data.producto.stock_actual} unidades.`,
      'exito'
    );
    formStock.reset();

    cargarPanel();

  } catch (err) {
    mostrarMensaje(mensajeStock, 'Error de conexión al sumar el stock.', 'error');
  }
});


// --- ALERTAS DE STOCK BAJO ---
btnActualizarAlertas.addEventListener('click', cargarAlertasStock);

async function cargarAlertasStock() {
  try {
    const res = await fetch(`${API_URL}/productos/alertas/stock-bajo`, {
      headers: obtenerHeaders()
    });
    const data = await res.json();

    if (!data.exito || !data.productos || data.productos.length === 0) {
      contenedorAlertas.innerHTML = `<p class="empty-state">No hay alertas de stock bajo actualmente.</p>`;
      return;
    }

    contenedorAlertas.innerHTML = data.productos.map(p => `
      <div class="alerta-item">
        ${icono('alert-triangle', 'icon-sm')}
        <span><strong>${escaparHtml(p.nombre)}</strong> (N.° ${p.id}): quedan ${p.stock_actual} und. (mínimo: ${p.stock_minimo})</span>
      </div>
    `).join('');
  } catch (err) {
    contenedorAlertas.innerHTML = `<p class="empty-state">Error al obtener las alertas.</p>`;
  }
}


// --- CONSULTA DE STOCK EN TIEMPO REAL ---
btnCargarStock.addEventListener('click', cargarStockTiempoReal);

async function cargarStockTiempoReal() {
  try {
    const res = await fetch(`${API_URL}/productos`, {
      headers: obtenerHeaders()
    });
    const data = await res.json();

    if (!data.exito || !data.productos || data.productos.length === 0) {
      tablaStockBody.innerHTML = `<tr><td colspan="9" class="empty-state">No hay productos registrados en la base de datos.</td></tr>`;
      return;
    }

    tablaStockBody.innerHTML = data.productos.map(item => {
      const bajoStock = item.stock_actual <= item.stock_minimo;
      return `
        <tr>
          <td><strong>${item.id}</strong></td>
          <td>${escaparHtml(item.codigo_barras) || '—'}</td>
          <td><strong>${escaparHtml(item.nombre)}</strong></td>
          <td>${formatearPesos(item.precio_compra)}</td>
          <td>${formatearPesos(item.precio_detal)}</td>
          <td>${formatearPesos(item.precio_mayor)}</td>
          <td>${item.stock_actual}</td>
          <td>${item.stock_minimo}</td>
          <td>
            <span class="badge ${bajoStock ? 'badge-low' : 'badge-ok'}">
              ${bajoStock ? 'Stock bajo' : 'OK'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tablaStockBody.innerHTML = `<tr><td colspan="9" class="empty-state">Error de conexión al cargar el inventario.</td></tr>`;
  }
}

// --- VENTAS Y FACTURACIÓN ---

const selectVentaProducto = document.getElementById('venta-producto');
const inputVentaCantidad = document.getElementById('venta-cantidad');
const btnAgregarItem = document.getElementById('btn-agregar-item');
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

async function cargarProductosParaVenta() {
  try {
    const res = await fetch(`${API_URL}/productos`, { headers: obtenerHeaders() });
    const data = await res.json();
    productosDisponibles = data.exito ? data.productos : [];

    selectVentaProducto.innerHTML = productosDisponibles
      .map((p) => `<option value="${p.id}">${escaparHtml(p.nombre)} (stock: ${p.stock_actual})</option>`)
      .join('') || '<option value="">No hay productos disponibles</option>';
    actualizarMaximoCantidad();
  } catch (err) {
    selectVentaProducto.innerHTML = '<option value="">Error al cargar productos</option>';
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

function actualizarVisibilidadCliente() {
  const esCredito = selectMetodoPago.value === 'credito';
  grupoVentaCliente.classList.toggle('hidden', !esCredito);
}
selectMetodoPago.addEventListener('change', actualizarVisibilidadCliente);

function precioUnitarioActual(producto) {
  return selectTipoCliente.value === 'mayor' ? producto.precio_mayor : producto.precio_detal;
}

function actualizarMaximoCantidad() {
  const producto = productosDisponibles.find((p) => p.id === Number(selectVentaProducto.value));
  inputVentaCantidad.max = producto ? producto.stock_actual : '';
}
selectVentaProducto.addEventListener('change', actualizarMaximoCantidad);

btnAgregarItem.addEventListener('click', () => {
  const productoId = Number(selectVentaProducto.value);
  const cantidad = Number(inputVentaCantidad.value);
  const producto = productosDisponibles.find((p) => p.id === productoId);

  if (!producto) {
    mostrarMensaje(mensajeVenta, 'Elegí un producto válido.', 'error');
    return;
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    mostrarMensaje(mensajeVenta, 'La cantidad debe ser un número entero mayor a cero.', 'error');
    return;
  }

  const existente = carrito.find((item) => item.productoId === productoId);
  const cantidadYaEnCarrito = existente ? existente.cantidad : 0;

  if (cantidadYaEnCarrito + cantidad > producto.stock_actual) {
    mostrarMensaje(
      mensajeVenta,
      `Stock insuficiente para "${producto.nombre}": disponible ${producto.stock_actual}, ya tenés ${cantidadYaEnCarrito} en la venta.`,
      'error'
    );
    return;
  }

  mostrarMensaje(mensajeVenta, '', null);

  if (existente) {
    existente.cantidad += cantidad;
  } else {
    carrito.push({ productoId, nombre: producto.nombre, cantidad });
  }

  renderizarCarrito();
});

function renderizarCarrito() {
  if (carrito.length === 0) {
    tablaBodyCarrito.innerHTML = `<tr><td colspan="5" class="empty-state">Todavía no agregaste productos.</td></tr>`;
    actualizarTotales();
    return;
  }

  tablaBodyCarrito.innerHTML = carrito
    .map((item, indice) => {
      const producto = productosDisponibles.find((p) => p.id === item.productoId);
      const precioUnitario = producto ? precioUnitarioActual(producto) : 0;
      const subtotal = precioUnitario * item.cantidad;
      return `
        <tr>
          <td>${escaparHtml(item.nombre)}</td>
          <td>${item.cantidad}</td>
          <td>${formatearPesos(precioUnitario)}</td>
          <td>${formatearPesos(subtotal)}</td>
          <td><button type="button" class="btn btn-secondary btn-sm btn-quitar-item" data-indice="${indice}">Quitar</button></td>
        </tr>
      `;
    })
    .join('');

  actualizarTotales();
}

tablaBodyCarrito.addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-quitar-item');
  if (!boton) return;
  carrito.splice(Number(boton.dataset.indice), 1);
  renderizarCarrito();
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

function actualizarTotales() {
  const subtotal = calcularSubtotal();
  const descuento = Number(inputDescuento.value) || 0;
  const total = Math.max(subtotal - descuento, 0);

  document.getElementById('venta-subtotal').textContent = formatearPesos(subtotal);
  document.getElementById('venta-descuento-resumen').textContent = formatearPesos(descuento);
  document.getElementById('venta-total').textContent = formatearPesos(total);
}

btnGenerarFactura.addEventListener('click', async () => {
  mostrarMensaje(mensajeVenta, '', null);

  if (carrito.length === 0) {
    mostrarMensaje(mensajeVenta, 'Agregá al menos un producto para generar la factura.', 'error');
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
      mostrarMensaje(mensajeVenta, data.mensaje || 'No se pudo generar la factura.', 'error');
      return;
    }

    mostrarFactura(data.venta);
    carrito = [];
    inputDescuento.value = 0;
    selectMetodoPago.value = 'efectivo';
    actualizarVisibilidadCliente();
    renderizarCarrito();
    cargarProductosParaVenta();
    cargarStockTiempoReal();
    cargarAlertasStock();
  } catch (err) {
    mostrarMensaje(mensajeVenta, 'Error de conexión al generar la factura.', 'error');
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

const formCliente = document.getElementById('form-cliente');
const mensajeCliente = document.getElementById('mensaje-cliente');
const tablaBodyDeudores = document.getElementById('tabla-body-deudores');
const btnCargarDeudores = document.getElementById('btn-cargar-deudores');
const inputDeudaClienteId = document.getElementById('deuda-cliente-id');
const btnVerDeuda = document.getElementById('btn-ver-deuda');
const detalleDeuda = document.getElementById('detalle-deuda');
const formAbono = document.getElementById('form-abono');
const mensajeAbono = document.getElementById('mensaje-abono');

// Registrar cliente
formCliente.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeCliente, '', null);

  const payload = {
    nombre: document.getElementById('cliente-nombre').value.trim(),
    documento: document.getElementById('cliente-documento').value.trim() || null,
    telefono: document.getElementById('cliente-telefono').value.trim() || null,
    correo: document.getElementById('cliente-correo').value.trim() || null,
    esMayorista: document.getElementById('cliente-mayorista').checked,
  };

  try {
    const res = await fetch(`${API_URL}/clientes`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mostrarMensaje(mensajeCliente, data.mensaje || 'Error al registrar el cliente.', 'error');
      return;
    }

    mostrarMensaje(mensajeCliente, `Cliente "${data.cliente.nombre}" registrado (N.° ${data.cliente.id}).`, 'exito');
    formCliente.reset();
    cargarClientesParaVenta();
  } catch (err) {
    mostrarMensaje(mensajeCliente, 'Error de conexión al guardar el cliente.', 'error');
  }
});

// Clientes con deuda pendiente
btnCargarDeudores.addEventListener('click', cargarDeudores);

async function cargarDeudores() {
  try {
    const res = await fetch(`${API_URL}/clientes/deudas`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!data.exito || !data.clientes || data.clientes.length === 0) {
      tablaBodyDeudores.innerHTML = `<tr><td colspan="5" class="empty-state">No hay clientes con deuda pendiente.</td></tr>`;
      return;
    }

    // Fila resaltada + insignia cuando la deuda más vieja del cliente supera
    // los 30 días (en_mora ya viene calculado del backend).
    tablaBodyDeudores.innerHTML = data.clientes
      .map(
        (c) => `
        <tr class="${c.en_mora ? 'fila-mora' : ''}">
          <td>${c.id}</td>
          <td>${escaparHtml(c.nombre)}</td>
          <td>${escaparHtml(c.documento) || '—'}</td>
          <td>${formatearPesos(c.saldo_total)}</td>
          <td>
            ${c.dias_deuda_mas_vieja} día(s)
            ${c.en_mora ? `<span class="badge badge-low">${icono('alert-triangle', 'icon-sm')} En mora</span>` : ''}
          </td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    tablaBodyDeudores.innerHTML = `<tr><td colspan="5" class="empty-state">Error al cargar los deudores.</td></tr>`;
  }
}

// Detalle de deuda de un cliente (ventas a crédito + abonos)
btnVerDeuda.addEventListener('click', async () => {
  const clienteId = inputDeudaClienteId.value;
  if (!clienteId) {
    detalleDeuda.innerHTML = '<p class="empty-state">Escribí el número de un cliente.</p>';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/clientes/${clienteId}/deuda`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      detalleDeuda.innerHTML = `<p class="empty-state">${escaparHtml(data.mensaje) || 'No se pudo consultar la deuda.'}</p>`;
      return;
    }

    const filasVentas = data.ventas.length
      ? data.ventas
          .map(
            (v) => `
          <tr>
            <td>${v.venta_id}</td>
            <td>${formatearFecha(v.creado_en)}</td>
            <td>${formatearPesos(v.total)}</td>
            <td>${formatearPesos(v.abonado)}</td>
            <td>${formatearPesos(v.saldo)}</td>
            <td><button type="button" class="btn btn-secondary btn-sm btn-ver-factura" data-venta-id="${v.venta_id}">Ver factura</button></td>
          </tr>
        `
          )
          .join('')
      : '<tr><td colspan="6" class="empty-state">Este cliente no tiene ventas a crédito.</td></tr>';

    const filasAbonos = data.abonos.length
      ? data.abonos.map((a) => `<li>Factura N.° ${a.venta_id}: ${formatearPesos(a.monto)} (${formatearFecha(a.creado_en)})</li>`).join('')
      : '<li class="empty-state">Sin abonos registrados.</li>';

    detalleDeuda.innerHTML = `
      <p><strong>${escaparHtml(data.cliente.nombre)}</strong> — Saldo total pendiente: <strong>${formatearPesos(data.saldoTotal)}</strong></p>
      <table class="tabla-inventario">
        <thead>
          <tr><th>Factura</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Ver</th></tr>
        </thead>
        <tbody>${filasVentas}</tbody>
      </table>
      <p><strong>Abonos:</strong></p>
      <ul>${filasAbonos}</ul>
    `;
  } catch (err) {
    detalleDeuda.innerHTML = '<p class="empty-state">Error de conexión al consultar la deuda.</p>';
  }
});

// Ver la factura completa (items, cantidades, precios) de una venta desde
// cualquier listado que solo muestre totales (detalle de deuda, listado de
// reportes). Reutiliza GET /api/ventas/:id — ya trae los items y el
// desglose de IVA — y mostrarFactura(), la misma función que ya pinta la
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

// Delegación de eventos: las filas de detalle-deuda se regeneran por
// completo con innerHTML en cada consulta, así que un listener por botón se
// perdería; uno solo en el contenedor cubre todos los botones presentes y futuros.
detalleDeuda.addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-ver-factura');
  if (!boton) return;
  verFacturaCompleta(boton.dataset.ventaId);
});

// Registrar abono
formAbono.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeAbono, '', null);

  const ventaId = document.getElementById('abono-venta-id').value;
  const monto = Number(document.getElementById('abono-monto').value);

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

    mostrarMensaje(
      mensajeAbono,
      `Pago registrado. Saldo restante de la factura N.° ${ventaId}: ${formatearPesos(data.saldoRestante)}.`,
      'exito'
    );
    formAbono.reset();
    cargarDeudores();
  } catch (err) {
    mostrarMensaje(mensajeAbono, 'Error de conexión al registrar el abono.', 'error');
  }
});

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
// fechas se consultó, así que comparten este único renderizador.
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

  contenedor.innerHTML = `
    ${encabezado}
    <p>Ventas: <strong>${resumen.cantidadVentas}</strong></p>
    <p>Total facturado: <strong>${formatearPesos(resumen.totalFacturado)}</strong></p>
    <p>Dinero recibido en ventas (efectivo/transferencia): <strong>${formatearPesos(resumen.dineroRecibidoVentas)}</strong></p>
    <p>Abonos recibidos (pagos de ventas a crédito): <strong>${formatearPesos(resumen.abonosRecibidos)}</strong></p>
    <p>Dinero total recibido en caja: <strong>${formatearPesos(resumen.dineroRecibidoTotal)}</strong></p>
    <p>Ganancia: <strong>${formatearPesos(resumen.gananciaTotal)}</strong>${
    resumen.gananciaAproximada
      ? ' <em>(incluye ventas registradas antes de guardar el costo histórico; para esas se usó el precio de compra actual del producto como aproximación)</em>'
      : ''
  }</p>
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
        <td>${ETIQUETA_METODO_PAGO[v.metodo_pago] || v.metodo_pago}</td>
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

// Misma delegación de eventos que detalleDeuda: ambas tablas de listado se
// regeneran con innerHTML en cada consulta.
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
      tablaRanking.innerHTML = '<tr><td colspan="3" class="empty-state">No hay ventas registradas en este rango.</td></tr>';
      return;
    }

    tablaRanking.innerHTML = data.productos
      .map(
        (p) => `
        <tr>
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

// Popula el <select> de acciones con el catálogo real que expone el backend,
// para no duplicar a mano la lista de códigos de acción en el frontend.
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
      opcion.textContent = accion;
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

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);
  if (accion) parametros.set('accion', accion);
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
          <td>${escaparHtml(evento.accion)}</td>
          <td>${escaparHtml(evento.entidad)}${evento.entidad_id ? ` #${evento.entidad_id}` : ''}</td>
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
