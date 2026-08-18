const db = require('./db');
const productosRepo = require('./productosRepo');

function obtenerItemsPorVenta(ventaId) {
  return db.prepare('SELECT * FROM venta_items WHERE venta_id = ? ORDER BY id').all(ventaId);
}

function buscarPorId(id) {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(id);
  if (!venta) return null;
  return { ...venta, items: obtenerItemsPorVenta(id) };
}

function listar() {
  const ventas = db.prepare('SELECT * FROM ventas ORDER BY id DESC').all();
  return ventas.map((venta) => ({ ...venta, items: obtenerItemsPorVenta(venta.id) }));
}

// cliente_id viaja en el mismo INSERT que el resto de la venta: al no
// existir una tabla "deudas" aparte (ver schema.sql), una venta a crédito
// CON su cliente_id ya ES la deuda registrada, así que queda creada en la
// misma transacción que la venta y el descuento de stock sin necesidad de
// un segundo INSERT — no hay forma de que quede una venta sin su deuda ni
// al revés porque son la misma fila.
const crear = db.transaction(({ tipoCliente, metodoPago, clienteId, descuento, subtotal, total, ivaPorcentaje, items }) => {
  const infoVenta = db
    .prepare(
      `INSERT INTO ventas (tipo_cliente, metodo_pago, cliente_id, descuento, subtotal, total, iva_porcentaje)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tipoCliente, metodoPago, clienteId, descuento, subtotal, total, ivaPorcentaje);

  const ventaId = infoVenta.lastInsertRowid;

  const insertarItem = db.prepare(
    `INSERT INTO venta_items
      (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_compra_unitario, subtotal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const obtenerStockActual = db.prepare('SELECT stock_actual FROM productos WHERE id = ?');

  for (const item of items) {
    insertarItem.run(
      ventaId,
      item.productoId,
      item.nombreProducto,
      item.cantidad,
      item.precioUnitario,
      item.precioCompraUnitario,
      item.subtotal
    );

    // Segunda capa de defensa contra sobreventa, DENTRO de la misma
    // transacción SQLite que el descuento de stock (no solo dentro de la
    // misma función síncrona de JS). ventasService ya valida el stock
    // disponible ANTES de llegar acá, y hoy esa validación no puede quedar
    // desactualizada por una carrera real: crearVenta corre de punta a
    // punta sin ningún await, así que Node no puede intercalar otra request
    // a mitad de camino (verificado empíricamente con 20 requests
    // concurrentes contra un producto con stock=1: solo 1 venta se creó).
    // Pero esa garantía es IMPLÍCITA — depende de que nadie agregue un
    // await en medio de crearVenta en el futuro sin darse cuenta de que
    // rompe esto. Esta relectura + comparación DENTRO de la transacción es
    // la barrera estructural real: sigue protegiendo aunque esa sincronía
    // se rompa algún día. Si dispara, lanza y better-sqlite3 revierte
    // automáticamente TODO lo de esta transacción (la venta, sus items y
    // los descuentos de stock ya aplicados a otros productos del carrito).
    const { stock_actual: stockActual } = obtenerStockActual.get(item.productoId);
    if (item.cantidad > stockActual) {
      throw new Error(
        `Stock insuficiente para "${item.nombreProducto}": disponible ${stockActual}, solicitado ${item.cantidad}.`
      );
    }

    productosRepo.actualizarStock(item.productoId, -item.cantidad);
  }

  return buscarPorId(ventaId);
});

module.exports = { crear, buscarPorId, listar };
