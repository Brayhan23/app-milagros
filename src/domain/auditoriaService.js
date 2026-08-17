const auditoriaRepo = require('../data/auditoriaRepo');

// Códigos fijos de acción, usados por el resto de servicios al llamar a
// registrar() y por la ruta de consulta para validar filtros. Evita que una
// acción quede mal escrita ("venta_creada" vs "ventaCreada") y rompa
// silenciosamente los filtros del listado.
const ACCIONES = Object.freeze({
  LOGIN_EXITOSO: 'login_exitoso',
  LOGIN_FALLIDO: 'login_fallido',
  VENTA_CREADA: 'venta_creada',
  ABONO_REGISTRADO: 'abono_registrado',
  PRODUCTO_CREADO: 'producto_creado',
  PRODUCTO_ACTUALIZADO: 'producto_actualizado',
  PRODUCTO_DESACTIVADO: 'producto_desactivado',
  STOCK_INGRESADO: 'stock_ingresado',
  CLIENTE_CREADO: 'cliente_creado',
  CLIENTE_ACTUALIZADO: 'cliente_actualizado',
  CONFIGURACION_ACTUALIZADA: 'configuracion_actualizada',
  RECUPERACION_SOLICITADA: 'recuperacion_solicitada',
  RECUPERACION_COMPLETADA: 'recuperacion_completada',
});

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !REGEX_FECHA.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaParseada = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fechaParseada.getUTCFullYear() === anio && fechaParseada.getUTCMonth() === mes - 1 && fechaParseada.getUTCDate() === dia
  );
}

// Punto único de escritura de auditoría: lo llaman los demás servicios justo
// después de que la operación real ya se confirmó en la base de datos.
// `usuario` acepta el objeto { id, usuario } que req.usuario ya trae gracias
// a requiereSesion, o directamente un string (caso del login, donde todavía
// no hay sesión creada y a veces ni siquiera existe un usuario real).
//
// Contrato "nunca lanza": si falla el INSERT de auditoría (BD bloqueada,
// disco lleno, lo que sea), se registra el error en consola y se sigue de
// largo. La venta, el abono o el cambio de stock ya ocurrieron de verdad;
// no tiene sentido revertirlos ni fallarle a la usuaria porque el log de
// auditoría no se pudo escribir.
function registrar({ usuario, accion, entidad = null, entidadId = null, detalle = null, ip = null }) {
  try {
    const usuarioId = usuario && typeof usuario === 'object' && usuario.id !== undefined ? usuario.id : null;
    const usuarioTexto =
      usuario && typeof usuario === 'object' && usuario.usuario ? usuario.usuario : String(usuario || 'desconocido');

    auditoriaRepo.crear({
      usuarioId,
      usuario: usuarioTexto,
      accion,
      entidad,
      entidadId,
      detalle,
      ip,
    });
  } catch (error) {
    console.error('No se pudo registrar el evento de auditoría (la operación original sí se completó):', error.message);
  }
}

// Compara los campos indicados entre el estado "antes" y "después" de una
// edición y arma un resumen legible de solo lo que cambió (ej.
// "precio_detal: 12000 -> 13000"). No guarda el objeto completo: para poder
// auditar después alcanza con saber qué campo cambió y entre qué valores.
function resumirCambios(antes, despues, campos) {
  const cambios = [];
  for (const campo of campos) {
    const valorAntes = antes ? antes[campo] : undefined;
    const valorDespues = despues ? despues[campo] : undefined;
    if (valorAntes !== valorDespues) {
      const textoAntes = valorAntes === null || valorAntes === undefined ? 'vacío' : valorAntes;
      const textoDespues = valorDespues === null || valorDespues === undefined ? 'vacío' : valorDespues;
      cambios.push(`${campo}: ${textoAntes} -> ${textoDespues}`);
    }
  }
  return cambios.length > 0 ? cambios.join('; ') : 'sin cambios en los campos registrados';
}

function listarEventos({ desde, hasta, accion, usuario } = {}) {
  if (desde && !esFechaValida(desde)) {
    return { exito: false, error: 'fecha_invalida', mensaje: 'La fecha "desde" debe tener el formato AAAA-MM-DD y ser válida.' };
  }
  if (hasta && !esFechaValida(hasta)) {
    return { exito: false, error: 'fecha_invalida', mensaje: 'La fecha "hasta" debe tener el formato AAAA-MM-DD y ser válida.' };
  }
  if (desde && hasta && desde > hasta) {
    return { exito: false, error: 'rango_invalido', mensaje: 'La fecha "desde" no puede ser posterior a "hasta".' };
  }

  const eventos = auditoriaRepo.listar({
    desde: desde || null,
    hasta: hasta || null,
    accion: accion || null,
    usuario: usuario || null,
  });

  return { exito: true, eventos };
}

module.exports = { registrar, resumirCambios, listarEventos, ACCIONES };
