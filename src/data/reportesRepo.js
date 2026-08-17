const db = require('./db');
const configuracionRepo = require('./configuracionRepo');

// Colombia es UTC-5 fijo (sin horario de verano), pero las fechas se
// guardan con datetime('now'), que SQLite escribe en UTC. Restar 5 horas a
// una marca de tiempo UTC da el instante correcto en hora colombiana, así
// que `date(columna, DESPLAZAMIENTO_COLOMBIA)` convierte cualquier
// creado_en a "qué día calendario fue eso en Colombia" antes de comparar
// contra un rango de fechas — nunca se compara la fecha guardada (UTC) tal
// cual contra fechas que el negocio entiende en hora colombiana, porque
// entre las 19:00 y 23:59 hora Colombia eso ya cuenta como el día
// siguiente en UTC y el reporte "de hoy" quedaría corrido.
const DESPLAZAMIENTO_COLOMBIA = '-5 hours';

function resumenVentasPorRango(desde, hasta) {
  const resumen = db
    .prepare(
      `SELECT
         COUNT(*) AS cantidad_ventas,
         COALESCE(SUM(total), 0) AS total_facturado,
         COALESCE(SUM(CASE WHEN metodo_pago != 'credito' THEN total ELSE 0 END), 0) AS dinero_recibido_ventas
       FROM ventas
       WHERE date(creado_en, ?) BETWEEN ? AND ?`
    )
    .get(DESPLAZAMIENTO_COLOMBIA, desde, hasta);

  const porMetodo = db
    .prepare(
      `SELECT metodo_pago,
              COUNT(*) AS cantidad,
              COALESCE(SUM(total), 0) AS total_facturado
       FROM ventas
       WHERE date(creado_en, ?) BETWEEN ? AND ?
       GROUP BY metodo_pago`
    )
    .all(DESPLAZAMIENTO_COLOMBIA, desde, hasta);

  // Ganancia: se calcula aparte de todo lo anterior, uniendo venta_items
  // (muchos) -> ventas (uno) y venta_items (muchos) -> productos (uno). Son
  // JOINs "hacia arriba" (de la tabla con más filas hacia la de menos), no
  // hacia otra tabla con muchas filas por venta (como abonos) — por eso no
  // hay fan-out: cada fila de venta_items sigue apareciendo una sola vez.
  const gananciaFila = db
    .prepare(
      `SELECT
         COALESCE(SUM((vi.precio_unitario - COALESCE(vi.precio_compra_unitario, p.precio_compra)) * vi.cantidad), 0)
           AS ganancia_total,
         SUM(CASE WHEN vi.precio_compra_unitario IS NULL THEN 1 ELSE 0 END) AS items_costo_aproximado
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       JOIN productos p ON p.id = vi.producto_id
       WHERE date(v.creado_en, ?) BETWEEN ? AND ?`
    )
    .get(DESPLAZAMIENTO_COLOMBIA, desde, hasta);

  // Abonos recibidos: consulta TOTALMENTE separada de las de arriba (no se
  // mezcla en el mismo JOIN). Un abono se cuenta en el rango por su propia
  // fecha (cuándo se pagó), no por la fecha de la venta original a la que
  // pertenece — el dinero entra a caja el día del abono, no el día de la
  // venta a crédito.
  const abonosFila = db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total
       FROM abonos
       WHERE date(creado_en, ?) BETWEEN ? AND ?`
    )
    .get(DESPLAZAMIENTO_COLOMBIA, desde, hasta);

  // IVA recaudado: puramente informativo, NO cambia totalFacturado ni
  // ningún otro número de arriba — los precios ya incluyen IVA (decisión de
  // diseño confirmada), así que "total facturado" sigue significando
  // exactamente lo mismo que antes de esta historia. Esto solo desglosa
  // cuánto de ese total ya cobrado corresponde a impuesto, usando la tasa
  // vigente en CADA venta (columna ventas.iva_porcentaje) y, para ventas
  // anteriores a esa columna (NULL), aproximando con la tasa actual del
  // negocio — mismo criterio que gananciaAproximada arriba.
  const tasaActual = configuracionRepo.obtener().iva_porcentaje;
  const ivaFila = db
    .prepare(
      `SELECT
         COALESCE(SUM(total - CAST(ROUND(total / (1.0 + COALESCE(iva_porcentaje, ?) / 100.0)) AS INTEGER)), 0)
           AS iva_recaudado,
         SUM(CASE WHEN iva_porcentaje IS NULL THEN 1 ELSE 0 END) AS ventas_iva_aproximado
       FROM ventas
       WHERE date(creado_en, ?) BETWEEN ? AND ?`
    )
    .get(tasaActual, DESPLAZAMIENTO_COLOMBIA, desde, hasta);

  return {
    cantidadVentas: resumen.cantidad_ventas,
    totalFacturado: resumen.total_facturado,
    dineroRecibidoVentas: resumen.dinero_recibido_ventas,
    abonosRecibidos: abonosFila.total,
    dineroRecibidoTotal: resumen.dinero_recibido_ventas + abonosFila.total,
    gananciaTotal: gananciaFila.ganancia_total,
    gananciaAproximada: gananciaFila.items_costo_aproximado > 0,
    ivaRecaudado: ivaFila.iva_recaudado,
    ivaAproximado: ivaFila.ventas_iva_aproximado > 0,
    porMetodoPago: porMetodo.map((fila) => ({
      metodoPago: fila.metodo_pago,
      cantidad: fila.cantidad,
      totalFacturado: fila.total_facturado,
      dineroRecibido: fila.metodo_pago === 'credito' ? 0 : fila.total_facturado,
    })),
  };
}

function productosMasVendidos({ desde, hasta } = {}) {
  const conFiltroFecha = Boolean(desde && hasta);
  const condicion = conFiltroFecha ? 'WHERE date(v.creado_en, ?) BETWEEN ? AND ?' : '';
  const parametros = conFiltroFecha ? [DESPLAZAMIENTO_COLOMBIA, desde, hasta] : [];

  return db
    .prepare(
      `SELECT vi.producto_id, p.nombre,
              SUM(vi.cantidad) AS unidades_vendidas,
              SUM(vi.subtotal) AS ingreso_generado
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       JOIN productos p ON p.id = vi.producto_id
       ${condicion}
       GROUP BY vi.producto_id
       ORDER BY unidades_vendidas DESC`
    )
    .all(...parametros);
}

module.exports = { resumenVentasPorRango, productosMasVendidos };
