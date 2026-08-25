const nodemailer = require('nodemailer');
const ventasService = require('./ventasService');
const configuracionRepo = require('../data/configuracionRepo');
const auditoriaService = require('./auditoriaService');
const { formatearFechaColombia } = require('./fechaColombia');
const { ACCIONES } = auditoriaService;

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ETIQUETA_TIPO_CLIENTE = { detal: 'Detal', mayor: 'Mayor' };
const ETIQUETA_METODO_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' };

function formatearPesos(valor) {
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

function validarCorreo(correo) {
  return typeof correo === 'string' && REGEX_CORREO.test(correo.trim());
}

// Convierte texto libre guardado en la BD (nombre de producto, nombre de
// empresa, NIT, dirección, teléfono) a HTML seguro antes de interpolarlo en
// el correo. Sin esto, un nombre de producto guardado como
// "<img src=x onerror=...>" se interpretaría como HTML real dentro de la
// factura emailada en vez de mostrarse como texto.
function escaparHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Arma el HTML del correo a partir de una venta ya resuelta con sus items
// (mismos datos que arma ventasService.obtenerVenta / ventasRepo.buscarPorId:
// no se duplica ninguna consulta ni cálculo de totales).
//
// El logo (HU-18) NO se incrusta en el correo a propósito: esta app corre
// local y no es accesible desde internet, así que un <img src="ruta local">
// llegaría roto para quien lo reciba (los clientes de correo tampoco cargan
// rutas de archivo por seguridad). Incrustarlo de verdad requeriría
// adjuntarlo con Content-ID, que es una pieza más grande no pedida en esta
// historia. El nombre/NIT/dirección/teléfono sí son texto plano y siempre
// se ven bien en cualquier lector de correo, así que esos sí se usan aquí.
function construirHtmlFactura(venta) {
  const empresa = configuracionRepo.obtener() || {};
  const nombreEmpresa = escaparHtml(empresa.nombre_empresa || 'Milagros');
  const lineaEmpresa = [empresa.nit ? `NIT ${escaparHtml(empresa.nit)}` : null, escaparHtml(empresa.direccion), escaparHtml(empresa.telefono)]
    .filter(Boolean)
    .join(' · ');

  const filas = venta.items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e3e3;">${escaparHtml(item.nombre_producto)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e3e3;text-align:center;">${item.cantidad}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e3e3;text-align:right;">${formatearPesos(item.precio_unitario)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e3e3;text-align:right;">${formatearPesos(item.subtotal)}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; color:#2e2e2e; max-width:560px; margin:0 auto;">
      <h2 style="color:#c2185b; margin-bottom:0;">${nombreEmpresa}</h2>
      ${lineaEmpresa ? `<p style="margin:2px 0; color:#767676; font-size:0.85em;">${lineaEmpresa}</p>` : ''}
      <p style="margin-top:2px; color:#767676;">Comprobante de venta</p>
      <p>Factura N.° <strong>${venta.id}</strong> — ${formatearFechaColombia(venta.creado_en)}</p>
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        <thead>
          <tr style="background:#fce4ec; color:#c2185b;">
            <th style="padding:6px 8px; text-align:left;">Producto</th>
            <th style="padding:6px 8px;">Cantidad</th>
            <th style="padding:6px 8px; text-align:right;">Precio Unit.</th>
            <th style="padding:6px 8px; text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="text-align:right; margin-top:12px;">
        <p>Tipo de cliente: <strong>${ETIQUETA_TIPO_CLIENTE[venta.tipo_cliente] || venta.tipo_cliente}</strong></p>
        <p>Método de pago: <strong>${ETIQUETA_METODO_PAGO[venta.metodo_pago] || venta.metodo_pago}</strong></p>
        <p>Subtotal: <strong>${formatearPesos(venta.subtotal)}</strong></p>
        <p>Descuento: <strong>${formatearPesos(venta.descuento)}</strong></p>
        <p style="font-size:1.1em;">Total: <strong style="color:#c2185b;">${formatearPesos(venta.total)}</strong></p>
        <p style="font-size:0.85em; color:#767676;">Incluye IVA (${venta.ivaPorcentaje}%): ${formatearPesos(venta.ivaMonto)}${
    venta.ivaAproximado ? ' (aproximado, venta anterior a la configuración de IVA)' : ''
  }</p>
      </div>
      <p style="margin-top:20px; font-size:0.8em; color:#767676;">
        Este comprobante no tiene validez como factura electrónica DIAN.
      </p>
    </div>
  `;
}

function crearTransportador() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function enviarFacturaPorCorreo(ventaId, correoDestino, usuario = null) {
  const resultadoVenta = ventasService.obtenerVenta(ventaId);
  if (!resultadoVenta.exito) {
    return resultadoVenta; // ya trae { exito:false, error:'no_encontrado', mensaje }
  }

  if (!validarCorreo(correoDestino)) {
    return { exito: false, error: 'correo_invalido', mensaje: 'El correo del destinatario no es válido.' };
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return {
      exito: false,
      error: 'smtp_no_configurado',
      mensaje: 'El envío de correo no está configurado en el servidor. Contacta al administrador.',
    };
  }

  const venta = resultadoVenta.venta;
  const nombreEmpresa = (configuracionRepo.obtener() || {}).nombre_empresa || 'Milagros';
  const correoDestinoLimpio = correoDestino.trim();

  try {
    const transportador = crearTransportador();
    await transportador.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: correoDestinoLimpio,
      subject: `${nombreEmpresa} — Factura N.° ${venta.id}`,
      html: construirHtmlFactura(venta),
    });

    // Única vía por la que datos de una venta salen del sistema hacia un
    // tercero: queda trazado igual que el resto de acciones sensibles, para
    // poder responder después "quién envió qué factura, a qué correo".
    auditoriaService.registrar({
      usuario,
      accion: ACCIONES.FACTURA_ENVIADA_CORREO,
      entidad: 'venta',
      entidadId: venta.id,
      detalle: `Factura de la venta #${venta.id} enviada por correo a "${correoDestinoLimpio}".`,
    });

    return { exito: true };
  } catch (error) {
    // Nunca loguear el objeto de configuración/credenciales, solo el mensaje del error.
    console.error('Error al enviar factura por correo:', error.message);

    auditoriaService.registrar({
      usuario,
      accion: ACCIONES.FACTURA_ENVIADA_CORREO,
      entidad: 'venta',
      entidadId: venta.id,
      detalle: `Intento fallido de enviar la factura de la venta #${venta.id} por correo a "${correoDestinoLimpio}".`,
    });

    return {
      exito: false,
      error: 'envio_fallido',
      mensaje: 'No se pudo enviar el correo. Intenta de nuevo más tarde.',
    };
  }
}

// Envío genérico de un correo HTML simple, para flujos que no giran
// alrededor de una venta (ej. el código de recuperación de contraseña).
// Reutiliza el mismo transportador y las mismas variables de entorno SMTP
// que enviarFacturaPorCorreo, para no duplicar esa configuración en dos
// lugares del código.
async function enviarCorreo({ destino, asunto, html }) {
  if (!validarCorreo(destino)) {
    return { exito: false, error: 'correo_invalido', mensaje: 'El correo del destinatario no es válido.' };
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return {
      exito: false,
      error: 'smtp_no_configurado',
      mensaje: 'El envío de correo no está configurado en el servidor. Contacta al administrador.',
    };
  }

  try {
    const transportador = crearTransportador();
    await transportador.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destino.trim(),
      subject: asunto,
      html,
    });
    return { exito: true };
  } catch (error) {
    console.error('Error al enviar correo:', error.message);
    return {
      exito: false,
      error: 'envio_fallido',
      mensaje: 'No se pudo enviar el correo. Intenta de nuevo más tarde.',
    };
  }
}

module.exports = { enviarFacturaPorCorreo, construirHtmlFactura, enviarCorreo };
