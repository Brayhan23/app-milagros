const db = require('./db');

// Envuelto en una transacción explícita (no solo protegido por ser una
// función síncrona de JS): creditoService ya valida que el monto no supere
// el saldo pendiente ANTES de llegar acá, y hoy esa validación no puede
// quedar desactualizada por una carrera real por la misma razón que
// ventasRepo.crear (sin ningún await de por medio, verificado empíricamente
// con 20 abonos concurrentes contra una deuda de $10.000: exactamente 10 se
// aplicaron, saldo final $0). Pero esa garantía es IMPLÍCITA. La relectura +
// comparación de abajo, DENTRO de la misma transacción que el INSERT, es el
// equivalente para abonos del CHECK (stock_actual >= 0) que ya protege el
// stock a nivel de base de datos — acá no hay una restricción de columna
// posible (la suma es entre tablas), así que se hace explícita en código.
// Es una SEGUNDA capa de defensa: no reemplaza la validación de negocio de
// creditoService (esa sigue siendo la que da el mensaje de error claro al
// usuario en el camino normal); esta es la barrera estructural que sigue
// protegiendo aunque la sincronía de JS se rompa algún día.
const registrarAbono = db.transaction((ventaId, monto) => {
  const info = db.prepare('INSERT INTO abonos (venta_id, monto) VALUES (?, ?)').run(ventaId, monto);

  const venta = db.prepare('SELECT total FROM ventas WHERE id = ?').get(ventaId);
  const { total: totalAbonado } = db
    .prepare('SELECT COALESCE(SUM(monto), 0) AS total FROM abonos WHERE venta_id = ?')
    .get(ventaId);

  if (totalAbonado > venta.total) {
    throw new Error(
      `Abono rechazado: la suma de abonos ($${totalAbonado}) superaría el total de la venta #${ventaId} ($${venta.total}).`
    );
  }

  return db.prepare('SELECT * FROM abonos WHERE id = ?').get(info.lastInsertRowid);
});

// Saldo de UNA venta puntual: total menos lo abonado a esa venta. No exige
// que sea a crédito aquí (eso lo valida creditoService); esta función solo
// responde "cuánto lleva pagado y cuánto falta" para el id que le pasen.
function saldoDeVenta(ventaId) {
  const fila = db
    .prepare(
      `SELECT v.id AS venta_id, v.cliente_id, v.metodo_pago, v.total,
              COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.venta_id = v.id), 0) AS abonado
       FROM ventas v
       WHERE v.id = ?`
    )
    .get(ventaId);

  if (!fila) return null;
  return { ...fila, saldo: fila.total - fila.abonado };
}

// Todas las ventas a crédito de un cliente, cada una con su propio saldo ya
// calculado (total - sus abonos). Sumar `saldo` de esta lista da el saldo
// total del cliente sin necesidad de una segunda consulta agregada.
function ventasCreditoDeCliente(clienteId) {
  const filas = db
    .prepare(
      `SELECT v.id AS venta_id, v.total, v.subtotal, v.descuento, v.creado_en,
              COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.venta_id = v.id), 0) AS abonado
       FROM ventas v
       WHERE v.cliente_id = ? AND v.metodo_pago = 'credito'
       ORDER BY v.id DESC`
    )
    .all(clienteId);

  return filas.map((fila) => ({ ...fila, saldo: fila.total - fila.abonado }));
}

function abonosDeCliente(clienteId) {
  return db
    .prepare(
      `SELECT a.id, a.venta_id, a.monto, a.creado_en
       FROM abonos a
       JOIN ventas v ON v.id = a.venta_id
       WHERE v.cliente_id = ?
       ORDER BY a.id DESC`
    )
    .all(clienteId);
}

// HU-13: clientes con saldo pendiente > 0, con cuánto debe cada uno y hace
// cuántos días viene pendiente su deuda más vieja (para la alerta de mora).
// El saldo de cada venta se calcula en la CTE (una fila por venta, ya neta
// de sus abonos) ANTES de agrupar por cliente — así se evita el clásico bug
// de "fan-out" de hacer JOIN ventas-abonos y agrupar directo: eso multiplica
// v.total una vez por cada abono que tenga esa venta y corrompe la suma.
//
// dias_deuda_mas_vieja usa julianday('now') - julianday(MIN(...)) en vez de
// convertir a hora colombiana como hace reportesRepo.js: acá no importa,
// porque es una RESTA de dos marcas de tiempo (duración), no una
// clasificación de "a qué día calendario pertenece" — restarle el mismo
// desplazamiento fijo a ambos lados de una resta no cambia el resultado, así
// que el ajuste de -5h se cancela solo y agregarlo sería ruido sin efecto.
function listarClientesConDeuda() {
  return db
    .prepare(
      `WITH saldos AS (
         SELECT v.id AS venta_id, v.cliente_id, v.creado_en,
                v.total - COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.venta_id = v.id), 0) AS saldo
         FROM ventas v
         WHERE v.metodo_pago = 'credito'
       )
       SELECT c.id, c.nombre, c.documento, c.telefono, c.correo,
              SUM(s.saldo) AS saldo_total,
              MIN(s.creado_en) AS venta_mas_vieja_pendiente,
              CAST(julianday('now') - julianday(MIN(s.creado_en)) AS INTEGER) AS dias_deuda_mas_vieja
       FROM saldos s
       JOIN clientes c ON c.id = s.cliente_id
       WHERE s.saldo > 0
       GROUP BY c.id
       ORDER BY saldo_total DESC`
    )
    .all();
}

module.exports = {
  registrarAbono,
  saldoDeVenta,
  ventasCreditoDeCliente,
  abonosDeCliente,
  listarClientesConDeuda,
};
