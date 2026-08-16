const API_URL = '/api';

// Elementos DOM
const vistaLogin = document.getElementById('vista-login');
const vistaPanel = document.getElementById('vista-panel');

// Login DOM
const formLogin = document.getElementById('form-login');
const mensajeLogin = document.getElementById('mensaje-login');
const btnLogout = document.getElementById('btn-logout');

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
  });
});

// --- HU-01: AUTENTICACIÓN ---
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeLogin.textContent = '';
  mensajeLogin.className = 'mensaje';

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
      mensajeLogin.textContent = data.mensaje || 'Credenciales incorrectas.';
      mensajeLogin.classList.add('error');
      return;
    }

    // El backend emite un token real (UUID) al autenticar; sin él no hay sesión.
    localStorage.setItem('token', data.token);

    formLogin.reset();
    verificarSesion();

  } catch (err) {
    mensajeLogin.textContent = 'Error de conexión con el servidor.';
    mensajeLogin.classList.add('error');
  }
});

btnLogout.addEventListener('click', () => {
  localStorage.removeItem('token');
  verificarSesion();
});


// --- HU-02: REGISTRAR PRODUCTO ---
formProducto.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeProducto.textContent = '';
  mensajeProducto.className = 'mensaje';

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
      mensajeProducto.textContent = data.mensaje || 'Error al registrar el producto.';
      mensajeProducto.classList.add('error');
      return;
    }

    let msg = `✅ Producto "${data.producto.nombre}" registrado exitosamente.`;
    if (data.advertencias && data.advertencias.length > 0) {
      msg += ` (Advertencia: ${data.advertencias.join(' ')})`;
    }

    mensajeProducto.textContent = msg;
    mensajeProducto.classList.add('exito');
    formProducto.reset();

    // Refrescar tablas
    cargarPanel();

  } catch (err) {
    mensajeProducto.textContent = 'Error de conexión al guardar el producto.';
    mensajeProducto.classList.add('error');
  }
});


// --- HU-03: REGISTRAR ENTRADA DE STOCK ---
formStock.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeStock.textContent = '';
  mensajeStock.className = 'mensaje';

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
      mensajeStock.textContent = data.mensaje || 'Error al actualizar el stock.';
      mensajeStock.classList.add('error');
      return;
    }

    mensajeStock.textContent = `✅ Stock actualizado. "${data.producto.nombre}" ahora cuenta con ${data.producto.stock_actual} unidades.`;
    mensajeStock.classList.add('exito');
    formStock.reset();

    cargarPanel();

  } catch (err) {
    mensajeStock.textContent = 'Error de conexión al sumar el stock.';
    mensajeStock.classList.add('error');
  }
});


// --- HU-04: ALERTAS DE STOCK BAJO ---
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
        ⚠️ <strong>${p.nombre}</strong> (ID: ${p.id}): Quedan ${p.stock_actual} und. (Mínimo: ${p.stock_minimo})
      </div>
    `).join('');
  } catch (err) {
    contenedorAlertas.innerHTML = `<p class="empty-state">Error al obtener las alertas.</p>`;
  }
}


// --- HU-05: CONSULTA EN TIEMPO REAL ---
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
          <td>${item.codigo_barras || '—'}</td>
          <td><strong>${item.nombre}</strong></td>
          <td>$${item.precio_compra.toLocaleString()}</td>
          <td>$${item.precio_detal.toLocaleString()}</td>
          <td>$${item.precio_mayor.toLocaleString()}</td>
          <td>${item.stock_actual}</td>
          <td>${item.stock_minimo}</td>
          <td>
            <span class="badge ${bajoStock ? 'badge-low' : 'badge-ok'}">
              ${bajoStock ? 'Stock Bajo' : 'OK'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tablaStockBody.innerHTML = `<tr><td colspan="9" class="empty-state">Error de conexión al cargar el inventario.</td></tr>`;
  }
}

// --- HU-06, HU-08, HU-09, HU-10: VENTAS Y FACTURACIÓN ---

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

// HU-07: envío de factura por correo
const inputFacturaCorreo = document.getElementById('factura-correo');
const btnEnviarCorreo = document.getElementById('btn-enviar-correo');
const mensajeCorreo = document.getElementById('mensaje-correo');

// HU-12: cliente obligatorio cuando la venta es a crédito
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
      .map((p) => `<option value="${p.id}">${p.nombre} (stock: ${p.stock_actual})</option>`)
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
      .map((c) => `<option value="${c.id}">${c.nombre}${c.documento ? ' (' + c.documento + ')' : ''}</option>`)
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
    mensajeVenta.textContent = 'Elegí un producto válido.';
    mensajeVenta.className = 'mensaje error';
    return;
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    mensajeVenta.textContent = 'La cantidad debe ser un número entero mayor a cero.';
    mensajeVenta.className = 'mensaje error';
    return;
  }

  const existente = carrito.find((item) => item.productoId === productoId);
  const cantidadYaEnCarrito = existente ? existente.cantidad : 0;

  if (cantidadYaEnCarrito + cantidad > producto.stock_actual) {
    mensajeVenta.textContent = `Stock insuficiente para "${producto.nombre}": disponible ${producto.stock_actual}, ` +
      `ya tenés ${cantidadYaEnCarrito} en la venta.`;
    mensajeVenta.className = 'mensaje error';
    return;
  }

  mensajeVenta.textContent = '';
  mensajeVenta.className = 'mensaje';

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
          <td>${item.nombre}</td>
          <td>${item.cantidad}</td>
          <td>$${precioUnitario.toLocaleString()}</td>
          <td>$${subtotal.toLocaleString()}</td>
          <td><button type="button" class="btn btn-secondary btn-quitar-item" data-indice="${indice}">Quitar</button></td>
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

  document.getElementById('venta-subtotal').textContent = `$${subtotal.toLocaleString()}`;
  document.getElementById('venta-descuento-resumen').textContent = `$${descuento.toLocaleString()}`;
  document.getElementById('venta-total').textContent = `$${total.toLocaleString()}`;
}

btnGenerarFactura.addEventListener('click', async () => {
  mensajeVenta.textContent = '';
  mensajeVenta.className = 'mensaje';

  if (carrito.length === 0) {
    mensajeVenta.textContent = 'Agregá al menos un producto para generar la factura.';
    mensajeVenta.className = 'mensaje error';
    return;
  }

  const esCredito = selectMetodoPago.value === 'credito';
  const clienteId = selectVentaCliente.value ? Number(selectVentaCliente.value) : null;

  if (esCredito && !clienteId) {
    mensajeVenta.textContent = 'Las ventas a crédito deben indicar un cliente.';
    mensajeVenta.className = 'mensaje error';
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
      mensajeVenta.textContent = data.mensaje || 'No se pudo generar la factura.';
      mensajeVenta.className = 'mensaje error';
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
    mensajeVenta.textContent = 'Error de conexión al generar la factura.';
    mensajeVenta.className = 'mensaje error';
  }
});

const ETIQUETA_TIPO_CLIENTE = { detal: 'Detal', mayor: 'Mayor' };
const ETIQUETA_METODO_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' };

function mostrarFactura(venta) {
  ventaActualId = venta.id;
  inputFacturaCorreo.value = '';
  mensajeCorreo.textContent = '';
  mensajeCorreo.className = 'mensaje';

  aplicarEncabezadoEmpresa();

  document.getElementById('factura-id').textContent = venta.id;
  document.getElementById('factura-fecha').textContent = venta.creado_en;
  document.getElementById('factura-tipo-cliente').textContent = ETIQUETA_TIPO_CLIENTE[venta.tipo_cliente] || venta.tipo_cliente;
  document.getElementById('factura-metodo-pago').textContent = ETIQUETA_METODO_PAGO[venta.metodo_pago] || venta.metodo_pago;
  document.getElementById('factura-subtotal').textContent = `$${venta.subtotal.toLocaleString()}`;
  document.getElementById('factura-descuento').textContent = `$${venta.descuento.toLocaleString()}`;
  document.getElementById('factura-total').textContent = `$${venta.total.toLocaleString()}`;

  document.getElementById('factura-items').innerHTML = venta.items
    .map(
      (item) => `
      <tr>
        <td>${item.nombre_producto}</td>
        <td>${item.cantidad}</td>
        <td>$${item.precio_unitario.toLocaleString()}</td>
        <td>$${item.subtotal.toLocaleString()}</td>
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

// --- HU-07: ENVIAR FACTURA POR CORREO ---
btnEnviarCorreo.addEventListener('click', async () => {
  mensajeCorreo.textContent = '';
  mensajeCorreo.className = 'mensaje';

  const correoDestino = inputFacturaCorreo.value.trim();
  if (!correoDestino) {
    mensajeCorreo.textContent = 'Escribí el correo del cliente.';
    mensajeCorreo.className = 'mensaje error';
    return;
  }

  if (!ventaActualId) {
    mensajeCorreo.textContent = 'No hay una factura generada para enviar.';
    mensajeCorreo.className = 'mensaje error';
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
      mensajeCorreo.textContent = data.mensaje || 'No se pudo enviar el correo.';
      mensajeCorreo.className = 'mensaje error';
      return;
    }

    mensajeCorreo.textContent = `✅ ${data.mensaje || 'Factura enviada por correo.'}`;
    mensajeCorreo.className = 'mensaje exito';
  } catch (err) {
    mensajeCorreo.textContent = 'Error de conexión al enviar el correo.';
    mensajeCorreo.className = 'mensaje error';
  } finally {
    btnEnviarCorreo.disabled = false;
    btnEnviarCorreo.textContent = 'Enviar por Correo';
  }
});

// --- HU-11, HU-12, HU-13: CLIENTES Y CRÉDITOS ---

const formCliente = document.getElementById('form-cliente');
const mensajeCliente = document.getElementById('mensaje-cliente');
const tablaBodyDeudores = document.getElementById('tabla-body-deudores');
const btnCargarDeudores = document.getElementById('btn-cargar-deudores');
const inputDeudaClienteId = document.getElementById('deuda-cliente-id');
const btnVerDeuda = document.getElementById('btn-ver-deuda');
const detalleDeuda = document.getElementById('detalle-deuda');
const formAbono = document.getElementById('form-abono');
const mensajeAbono = document.getElementById('mensaje-abono');

// HU-11: registrar cliente
formCliente.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeCliente.textContent = '';
  mensajeCliente.className = 'mensaje';

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
      mensajeCliente.textContent = data.mensaje || 'Error al registrar el cliente.';
      mensajeCliente.classList.add('error');
      return;
    }

    mensajeCliente.textContent = `✅ Cliente "${data.cliente.nombre}" registrado (ID: ${data.cliente.id}).`;
    mensajeCliente.classList.add('exito');
    formCliente.reset();
    cargarClientesParaVenta();
  } catch (err) {
    mensajeCliente.textContent = 'Error de conexión al guardar el cliente.';
    mensajeCliente.classList.add('error');
  }
});

// HU-13: clientes con deuda pendiente
btnCargarDeudores.addEventListener('click', cargarDeudores);

async function cargarDeudores() {
  try {
    const res = await fetch(`${API_URL}/clientes/deudas`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!data.exito || !data.clientes || data.clientes.length === 0) {
      tablaBodyDeudores.innerHTML = `<tr><td colspan="4" class="empty-state">No hay clientes con deuda pendiente.</td></tr>`;
      return;
    }

    tablaBodyDeudores.innerHTML = data.clientes
      .map(
        (c) => `
        <tr>
          <td>${c.id}</td>
          <td>${c.nombre}</td>
          <td>${c.documento || '—'}</td>
          <td>$${c.saldo_total.toLocaleString()}</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    tablaBodyDeudores.innerHTML = `<tr><td colspan="4" class="empty-state">Error al cargar los deudores.</td></tr>`;
  }
}

// HU-12: detalle de deuda de un cliente (ventas a crédito + abonos)
btnVerDeuda.addEventListener('click', async () => {
  const clienteId = inputDeudaClienteId.value;
  if (!clienteId) {
    detalleDeuda.innerHTML = '<p class="empty-state">Escribí el ID de un cliente.</p>';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/clientes/${clienteId}/deuda`, { headers: obtenerHeaders() });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      detalleDeuda.innerHTML = `<p class="empty-state">${data.mensaje || 'No se pudo consultar la deuda.'}</p>`;
      return;
    }

    const filasVentas = data.ventas.length
      ? data.ventas
          .map(
            (v) => `
          <tr>
            <td>${v.venta_id}</td>
            <td>${v.creado_en}</td>
            <td>$${v.total.toLocaleString()}</td>
            <td>$${v.abonado.toLocaleString()}</td>
            <td>$${v.saldo.toLocaleString()}</td>
          </tr>
        `
          )
          .join('')
      : '<tr><td colspan="5" class="empty-state">Este cliente no tiene ventas a crédito.</td></tr>';

    const filasAbonos = data.abonos.length
      ? data.abonos.map((a) => `<li>Venta #${a.venta_id}: $${a.monto.toLocaleString()} (${a.creado_en})</li>`).join('')
      : '<li class="empty-state">Sin abonos registrados.</li>';

    detalleDeuda.innerHTML = `
      <p><strong>${data.cliente.nombre}</strong> — Saldo total pendiente: <strong>$${data.saldoTotal.toLocaleString()}</strong></p>
      <table class="tabla-inventario">
        <thead>
          <tr><th>Venta</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th></tr>
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

// HU-12: registrar abono
formAbono.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensajeAbono.textContent = '';
  mensajeAbono.className = 'mensaje';

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
      mensajeAbono.textContent = data.mensaje || 'No se pudo registrar el abono.';
      mensajeAbono.classList.add('error');
      return;
    }

    mensajeAbono.textContent = `✅ Abono registrado. Saldo restante de la venta #${ventaId}: $${data.saldoRestante.toLocaleString()}.`;
    mensajeAbono.classList.add('exito');
    formAbono.reset();
    cargarDeudores();
  } catch (err) {
    mensajeAbono.textContent = 'Error de conexión al registrar el abono.';
    mensajeAbono.classList.add('error');
  }
});

// --- HU-18: DATOS DE LA EMPRESA ---

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
  mensajeConfiguracion.textContent = '';
  mensajeConfiguracion.className = 'mensaje';

  const payload = {
    nombreEmpresa: document.getElementById('config-nombre').value.trim(),
    nit: document.getElementById('config-nit').value.trim() || null,
    direccion: document.getElementById('config-direccion').value.trim() || null,
    telefono: document.getElementById('config-telefono').value.trim() || null,
    correo: document.getElementById('config-correo').value.trim() || null,
    logoRuta: document.getElementById('config-logo').value.trim() || null,
  };

  try {
    const res = await fetch(`${API_URL}/configuracion`, {
      method: 'PUT',
      headers: obtenerHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.exito) {
      mensajeConfiguracion.textContent = data.mensaje || 'No se pudo guardar la configuración.';
      mensajeConfiguracion.classList.add('error');
      return;
    }

    configuracionActual = data.configuracion;
    mensajeConfiguracion.textContent = '✅ Configuración guardada.';
    mensajeConfiguracion.classList.add('exito');
  } catch (err) {
    mensajeConfiguracion.textContent = 'Error de conexión al guardar la configuración.';
    mensajeConfiguracion.classList.add('error');
  }
});