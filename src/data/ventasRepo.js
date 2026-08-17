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
const crear = db.transaction(({ tipoCliente, metodoPago, clienteId, descuento, subtotal, total, items }) => {
  const infoVenta = db
    .prepare(
      `INSERT INTO ventas (tipo_cliente, metodo_pago, cliente_id, descuento, subtotal, total)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(tipoCliente, metodoPago, clienteId, descuento, subtotal, total);

  const ventaId = infoVenta.lastInsertRowid;

  const insertarItem = db.prepare(
    `INSERT INTO venta_items
      (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_compra_unitario, subtotal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

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
    productosRepo.actualizarStock(item.productoId, -item.cantidad);
  }

  return buscarPorId(ventaId);
});

module.exports = { crear, buscarPorId, listar };
