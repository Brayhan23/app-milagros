const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const reportesService = require('./reportesService');
const ventasService = require('./ventasService');
const configuracionRepo = require('../data/configuracionRepo');
const { fechaColombiaISO } = require('./fechaColombia');

const ETIQUETA_TIPO_CLIENTE = { detal: 'Detal', mayor: 'Mayor' };
const ETIQUETA_METODO_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' };

function formatearPesos(valor) {
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

// Punto único de ensamblado de datos para ambos formatos: reutiliza
// reportesService.historicoPorRango (resumen + validación de fechas, ya
// existente) y reportesService.historicoListado (ventas individuales, ya
// existente) — ninguna consulta se duplica aquí, solo se combinan y filtran
// sus resultados.
//
// SOLO se copian explícitamente los campos que sí deben salir del negocio
// (allow-list, no un spread del objeto completo): gananciaTotal y
// gananciaAproximada de resumen NUNCA se leen ni se asignan a ningún lado
// de este objeto, así que estructuralmente no hay forma de que terminen en
// un archivo exportado por un descuido futuro en el renderizador.
function obtenerDatosReporte(desde, hasta) {
  const resumen = reportesService.historicoPorRango(desde, hasta);
  if (!resumen.exito) return resumen; // fecha_invalida / rango_invalido, mismo shape que ya usan las rutas de reportes

  const listado = reportesService.historicoListado(desde, hasta);
  if (!listado.exito) return listado;

  const empresa = configuracionRepo.obtener();

  // El listado no trae el desglose de IVA por venta (esa cuenta vive en
  // ventasService, para no duplicar la fórmula): se calcula acá reutilizando
  // ventasService.calcularDesgloseIva, la misma que ya usa la factura
  // individual (mismo criterio de aproximación con la tasa actual cuando
  // iva_porcentaje quedó NULL en una venta anterior a esa columna).
  const ventas = listado.ventas.map((venta) => {
    const ivaPorcentaje = venta.iva_porcentaje ?? empresa.iva_porcentaje;
    const { ivaMonto } = ventasService.calcularDesgloseIva(venta.total, ivaPorcentaje);
    return { ...venta, ivaMonto };
  });

  return {
    exito: true,
    desde,
    hasta,
    empresa,
    cantidadVentas: resumen.cantidadVentas,
    totalFacturado: resumen.totalFacturado,
    dineroRecibidoTotal: resumen.dineroRecibidoTotal,
    ivaRecaudado: resumen.ivaRecaudado,
    ivaAproximado: resumen.ivaAproximado,
    porMetodoPago: resumen.porMetodoPago,
    ventas,
  };
}

function nombreArchivo(desde, hasta, extension) {
  return `reporte-ventas_${desde}_a_${hasta}.${extension}`;
}

function lineaEmpresa(empresa) {
  return [empresa.nit ? `NIT ${empresa.nit}` : null, empresa.direccion, empresa.telefono].filter(Boolean).join(' · ');
}

// --- Excel ---

function agregarFilaMoneda(hoja, etiqueta, valor) {
  const fila = hoja.addRow([etiqueta, valor]);
  fila.getCell(2).numFmt = '$#,##0';
  return fila;
}

async function construirExcel(datos) {
  const { empresa, desde, hasta, cantidadVentas, totalFacturado, dineroRecibidoTotal, ivaRecaudado, ivaAproximado, porMetodoPago, ventas } =
    datos;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = empresa.nombre_empresa || 'Milagros';
  workbook.created = new Date();

  const hoja = workbook.addWorksheet('Reporte de Ventas');
  hoja.columns = [
    { key: 'a', width: 20 },
    { key: 'b', width: 26 },
    { key: 'c', width: 12 },
    { key: 'd', width: 16 },
    { key: 'e', width: 14 },
    { key: 'f', width: 14 },
    { key: 'g', width: 14 },
    { key: 'h', width: 14 },
  ];

  hoja.addRow([empresa.nombre_empresa || 'Milagros']).font = { bold: true, size: 14 };
  const datosEmpresa = lineaEmpresa(empresa);
  if (datosEmpresa) hoja.addRow([datosEmpresa]);
  hoja.addRow([`Reporte de ventas: ${desde} a ${hasta}`]).font = { bold: true };
  hoja.addRow([]);

  hoja.addRow(['Resumen']).font = { bold: true, underline: true };
  hoja.addRow(['Cantidad de ventas', cantidadVentas]);
  agregarFilaMoneda(hoja, 'Total facturado', totalFacturado);
  agregarFilaMoneda(hoja, `IVA recaudado${ivaAproximado ? ' (aproximado)' : ''}`, ivaRecaudado);
  agregarFilaMoneda(hoja, 'Dinero recibido en caja', dineroRecibidoTotal);
  hoja.addRow([]);

  hoja.addRow(['Desglose por método de pago']).font = { bold: true };
  hoja.addRow(['Método', 'Cantidad', 'Total facturado', 'Recibido en caja']).font = { bold: true };
  porMetodoPago.forEach((m) => {
    const fila = hoja.addRow([ETIQUETA_METODO_PAGO[m.metodoPago] || m.metodoPago, m.cantidad, m.totalFacturado, m.dineroRecibido]);
    fila.getCell(3).numFmt = '$#,##0';
    fila.getCell(4).numFmt = '$#,##0';
  });
  hoja.addRow(['Nota: "Crédito" es dinero facturado que todavía NO se ha recibido en caja.']).font = { italic: true, size: 9 };
  hoja.addRow([]);

  hoja.addRow(['Detalle de ventas']).font = { bold: true, underline: true };
  const filaEncDetalle = hoja.addRow(['Fecha', 'Cliente', 'Tipo', 'Método', 'Subtotal', 'Descuento', 'IVA', 'Total']);
  filaEncDetalle.font = { bold: true };
  filaEncDetalle.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
  });

  let sumaSubtotal = 0;
  let sumaDescuento = 0;
  let sumaIva = 0;
  let sumaTotal = 0;
  ventas.forEach((v) => {
    const fila = hoja.addRow([
      fechaColombiaISO(v.creado_en),
      v.nombre_cliente || 'Sin cliente',
      ETIQUETA_TIPO_CLIENTE[v.tipo_cliente] || v.tipo_cliente,
      ETIQUETA_METODO_PAGO[v.metodo_pago] || v.metodo_pago,
      v.subtotal,
      v.descuento,
      v.ivaMonto,
      v.total,
    ]);
    [5, 6, 7, 8].forEach((col) => {
      fila.getCell(col).numFmt = '$#,##0';
    });
    sumaSubtotal += v.subtotal;
    sumaDescuento += v.descuento;
    sumaIva += v.ivaMonto;
    sumaTotal += v.total;
  });

  const filaTotal = hoja.addRow(['', '', '', 'TOTAL GENERAL', sumaSubtotal, sumaDescuento, sumaIva, sumaTotal]);
  filaTotal.font = { bold: true };
  [5, 6, 7, 8].forEach((col) => {
    filaTotal.getCell(col).numFmt = '$#,##0';
  });

  return workbook.xlsx.writeBuffer();
}

// --- PDF ---

// Columnas del detalle, en el mismo orden que la hoja de Excel. Altura de
// fila fija (en vez de dejar que doc.y avance solo tras cada .text()): así
// las 8 columnas de una misma fila quedan siempre alineadas en el mismo eje
// Y, sin depender de cuánto haya movido el cursor la última columna escrita.
// Anchos verificados con un cliente de nombre largo real (ver pruebas): sin
// el truncamiento de truncarTexto() de abajo, un nombre que exceda su
// columna no solo se ve mal — pdfkit sigue dibujando el texto completo más
// allá del límite declarado, invadiendo la columna siguiente.
const COLUMNAS_DETALLE = [
  { titulo: 'Fecha', ancho: 55 },
  { titulo: 'Cliente', ancho: 120 },
  { titulo: 'Tipo', ancho: 35 },
  { titulo: 'Método', ancho: 62 },
  { titulo: 'Subtotal', ancho: 58 },
  { titulo: 'Descuento', ancho: 58 },
  { titulo: 'IVA', ancho: 55 },
  { titulo: 'Total', ancho: 58 },
];
const ALTURA_FILA = 14;

function construirPdf(datos) {
  return new Promise((resolve, reject) => {
    const { empresa, desde, hasta, cantidadVentas, totalFacturado, dineroRecibidoTotal, ivaRecaudado, ivaAproximado, porMetodoPago, ventas } =
      datos;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margenIzquierdo = doc.page.margins.left;
    const anchoDisponible = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Recorta con "…" cualquier texto que no quepa en el ancho de columna
    // (medido de verdad con doc.widthOfString, con la fuente/tamaño ya
    // aplicados) — sin esto, un nombre de cliente largo se dibuja completo
    // más allá del límite de su columna e invade la columna siguiente.
    function truncarTexto(texto, anchoMax) {
      const textoStr = String(texto);
      if (doc.widthOfString(textoStr) <= anchoMax) return textoStr;
      let resultado = textoStr;
      while (resultado.length > 1 && doc.widthOfString(`${resultado}…`) > anchoMax) {
        resultado = resultado.slice(0, -1);
      }
      return `${resultado}…`;
    }

    function dibujarFila(valores, { negrita = false } = {}) {
      let x = margenIzquierdo;
      const y = doc.y;
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      valores.forEach((valor, i) => {
        const anchoColumna = COLUMNAS_DETALLE[i].ancho;
        doc.text(truncarTexto(valor, anchoColumna - 4), x, y, { width: anchoColumna, lineBreak: false });
        x += anchoColumna;
      });
      doc.y = y + ALTURA_FILA;
    }

    // Fila de total: la etiqueta ocupa las primeras 4 columnas (Fecha a
    // Método) como una sola caja ancha alineada a la derecha, en vez de
    // forzarla dentro de una sola columna angosta como cualquier otra celda.
    function dibujarFilaTotal(etiqueta, sumas) {
      const anchoEtiqueta = COLUMNAS_DETALLE.slice(0, 4).reduce((suma, col) => suma + col.ancho, 0);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text(etiqueta, margenIzquierdo, y, { width: anchoEtiqueta, align: 'right', lineBreak: false });

      let x = margenIzquierdo + anchoEtiqueta;
      sumas.forEach((valor, i) => {
        const anchoColumna = COLUMNAS_DETALLE[4 + i].ancho;
        doc.text(valor, x, y, { width: anchoColumna, lineBreak: false });
        x += anchoColumna;
      });
      doc.y = y + ALTURA_FILA;
    }

    function dibujarLineaSeparadora() {
      doc
        .moveTo(margenIzquierdo, doc.y)
        .lineTo(margenIzquierdo + anchoDisponible, doc.y)
        .strokeColor('#cccccc')
        .stroke();
      doc.y += 4;
    }

    function dibujarEncabezadoTabla() {
      dibujarFila(
        COLUMNAS_DETALLE.map((c) => c.titulo),
        { negrita: true }
      );
      dibujarLineaSeparadora();
    }

    function saltarPaginaSiHaceFalta() {
      if (doc.y > doc.page.height - doc.page.margins.bottom - ALTURA_FILA) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        dibujarEncabezadoTabla();
      }
    }

    // Encabezado de empresa
    doc.font('Helvetica-Bold').fontSize(16).text(empresa.nombre_empresa || 'Milagros');
    const datosEmpresa = lineaEmpresa(empresa);
    if (datosEmpresa) {
      doc.font('Helvetica').fontSize(9).fillColor('#767676').text(datosEmpresa);
      doc.fillColor('#000000');
    }
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(13).text(`Reporte de ventas: ${desde} a ${hasta}`);
    doc.moveDown();

    // Resumen
    doc.font('Helvetica-Bold').fontSize(11).text('Resumen');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Cantidad de ventas: ${cantidadVentas}`);
    doc.text(`Total facturado: ${formatearPesos(totalFacturado)}`);
    doc.text(`IVA recaudado${ivaAproximado ? ' (aproximado)' : ''}: ${formatearPesos(ivaRecaudado)}`);
    doc.text(`Dinero recibido en caja: ${formatearPesos(dineroRecibidoTotal)}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(11).text('Desglose por método de pago');
    doc.font('Helvetica').fontSize(10);
    porMetodoPago.forEach((m) => {
      doc.text(
        `${ETIQUETA_METODO_PAGO[m.metodoPago] || m.metodoPago}: ${m.cantidad} venta(s), facturado ${formatearPesos(
          m.totalFacturado
        )}, recibido en caja ${formatearPesos(m.dineroRecibido)}`
      );
    });
    doc.font('Helvetica-Oblique').fontSize(8).text('El método "Crédito" es dinero facturado pero todavía no recibido en caja.');
    doc.moveDown();

    // Detalle de ventas
    doc.font('Helvetica-Bold').fontSize(11).text('Detalle de ventas');
    doc.moveDown(0.3);
    dibujarEncabezadoTabla();

    let sumaSubtotal = 0;
    let sumaDescuento = 0;
    let sumaIva = 0;
    let sumaTotal = 0;
    ventas.forEach((v) => {
      saltarPaginaSiHaceFalta();
      dibujarFila([
        fechaColombiaISO(v.creado_en),
        v.nombre_cliente || 'Sin cliente',
        ETIQUETA_TIPO_CLIENTE[v.tipo_cliente] || v.tipo_cliente,
        ETIQUETA_METODO_PAGO[v.metodo_pago] || v.metodo_pago,
        formatearPesos(v.subtotal),
        formatearPesos(v.descuento),
        formatearPesos(v.ivaMonto),
        formatearPesos(v.total),
      ]);
      sumaSubtotal += v.subtotal;
      sumaDescuento += v.descuento;
      sumaIva += v.ivaMonto;
      sumaTotal += v.total;
    });

    saltarPaginaSiHaceFalta();
    dibujarLineaSeparadora();
    dibujarFilaTotal('TOTAL GENERAL', [
      formatearPesos(sumaSubtotal),
      formatearPesos(sumaDescuento),
      formatearPesos(sumaIva),
      formatearPesos(sumaTotal),
    ]);

    doc.end();
  });
}

// --- API pública del servicio ---

const MIME_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PDF = 'application/pdf';

async function generarExcelRango(desde, hasta) {
  const datos = obtenerDatosReporte(desde, hasta);
  if (!datos.exito) return datos;

  const buffer = await construirExcel(datos);
  return { exito: true, buffer, nombreArchivo: nombreArchivo(desde, hasta, 'xlsx'), contentType: MIME_EXCEL };
}

async function generarPdfRango(desde, hasta) {
  const datos = obtenerDatosReporte(desde, hasta);
  if (!datos.exito) return datos;

  const buffer = await construirPdf(datos);
  return { exito: true, buffer, nombreArchivo: nombreArchivo(desde, hasta, 'pdf'), contentType: MIME_PDF };
}

module.exports = {
  generarExcelRango,
  generarPdfRango,
  // Exportado únicamente para pruebas automatizadas: permite verificar por
  // código que el objeto que alimenta tanto al Excel como al PDF nunca trae
  // gananciaTotal/gananciaAproximada (allow-list explícita más arriba en
  // este archivo), sin depender de parsear el binario de un PDF generado.
  obtenerDatosReporte,
};
