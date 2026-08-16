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

    // Guarda token o identificador de sesión
    if (data.token) {
      localStorage.setItem('token', data.token);
    } else {
      localStorage.setItem('token', 'sesion_activa_general');
    }

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

let productosDisponibles = [];
let carrito = [];

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

  try {
    const res = await fetch(`${API_URL}/ventas`, {
      method: 'POST',
      headers: obtenerHeaders(),
      body: JSON.stringify({
        tipoCliente: selectTipoCliente.value,
        metodoPago: selectMetodoPago.value,
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
});