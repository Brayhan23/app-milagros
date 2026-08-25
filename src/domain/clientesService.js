const clientesRepo = require('../data/clientesRepo');
const auditoriaService = require('./auditoriaService');
const { ACCIONES } = auditoriaService;

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

function validarCorreo(correo) {
  return REGEX_CORREO.test(correo);
}

function crearCliente(datos = {}, usuario = null) {
  const nombre = normalizarTexto(datos.nombre);
  const documento = normalizarTexto(datos.documento);
  const telefono = normalizarTexto(datos.telefono);
  const correo = normalizarTexto(datos.correo);
  const esMayorista = Boolean(datos.esMayorista);

  if (!nombre) {
    return { exito: false, error: 'nombre_requerido', mensaje: 'El nombre del cliente es obligatorio.' };
  }

  if (correo && !validarCorreo(correo)) {
    return { exito: false, error: 'correo_invalido', mensaje: 'El correo del cliente no es válido.' };
  }

  if (documento) {
    const existente = clientesRepo.buscarPorDocumento(documento);
    if (existente) {
      return {
        exito: false,
        error: 'documento_duplicado',
        mensaje: `Ya existe un cliente con el documento "${documento}".`,
      };
    }
  }

  const cliente = clientesRepo.crear({ nombre, documento, telefono, correo, esMayorista });

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.CLIENTE_CREADO,
    entidad: 'cliente',
    entidadId: cliente.id,
    detalle: `Cliente "${cliente.nombre}" creado${esMayorista ? ' (mayorista)' : ''}.`,
  });

  return { exito: true, cliente };
}

function listarClientes({ incluirInactivos = false } = {}) {
  return { exito: true, clientes: clientesRepo.listar({ incluirInactivos }) };
}

function buscarClientePorId(id) {
  const cliente = clientesRepo.buscarPorId(id);
  if (!cliente) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }
  return { exito: true, cliente };
}

function actualizarCliente(id, datos = {}, usuario = null) {
  const actual = clientesRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }

  const nombre = datos.nombre !== undefined ? normalizarTexto(datos.nombre) : actual.nombre;
  const documento = datos.documento !== undefined ? normalizarTexto(datos.documento) : actual.documento;
  const telefono = datos.telefono !== undefined ? normalizarTexto(datos.telefono) : actual.telefono;
  const correo = datos.correo !== undefined ? normalizarTexto(datos.correo) : actual.correo;
  const esMayorista = datos.esMayorista !== undefined ? Boolean(datos.esMayorista) : Boolean(actual.es_mayorista);

  if (!nombre) {
    return { exito: false, error: 'nombre_requerido', mensaje: 'El nombre del cliente es obligatorio.' };
  }

  if (correo && !validarCorreo(correo)) {
    return { exito: false, error: 'correo_invalido', mensaje: 'El correo del cliente no es válido.' };
  }

  if (documento) {
    const existente = clientesRepo.buscarPorDocumento(documento);
    if (existente && existente.id !== id) {
      return {
        exito: false,
        error: 'documento_duplicado',
        mensaje: `Ya existe un cliente con el documento "${documento}".`,
      };
    }
  }

  const cliente = clientesRepo.actualizar(id, { nombre, documento, telefono, correo, esMayorista });

  const resumen = auditoriaService.resumirCambios(
    {
      nombre: actual.nombre,
      documento: actual.documento,
      telefono: actual.telefono,
      correo: actual.correo,
      es_mayorista: actual.es_mayorista ? 1 : 0,
    },
    { nombre, documento, telefono, correo, es_mayorista: esMayorista ? 1 : 0 },
    ['nombre', 'documento', 'telefono', 'correo', 'es_mayorista']
  );
  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.CLIENTE_ACTUALIZADO,
    entidad: 'cliente',
    entidadId: id,
    detalle: `Cliente "${cliente.nombre}" (id ${id}) actualizado: ${resumen}.`,
  });

  return { exito: true, cliente };
}

function desactivarCliente(id, usuario = null) {
  const actual = clientesRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }

  const cliente = clientesRepo.desactivar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.CLIENTE_DESACTIVADO,
    entidad: 'cliente',
    entidadId: id,
    detalle: `Cliente "${actual.nombre}" (id ${id}) desactivado.`,
  });

  return { exito: true, cliente };
}

// Reactivar un cliente previamente desactivado. Mismo patrón que
// productosService.reactivarProducto, incluyendo el mismo caso borde con la
// restricción UNIQUE de documento: reactivar solo cambia la bandera
// `activo`, nunca toca `documento`, y mientras este cliente siguió
// existiendo con `activo=0` su documento nunca quedó "libre" para que otro
// cliente lo tomara — ningún otro pudo haberse creado ni editado con ese
// mismo documento mientras tanto, así que no hace falta repetir esa
// validación acá.
function reactivarCliente(id, usuario = null) {
  const actual = clientesRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }

  const cliente = clientesRepo.reactivar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.CLIENTE_REACTIVADO,
    entidad: 'cliente',
    entidadId: id,
    detalle: `Cliente "${actual.nombre}" (id ${id}) reactivado.`,
  });

  return { exito: true, cliente };
}

// Borrado permanente: a diferencia de desactivarCliente, esto sí borra la
// fila. Solo es seguro cuando el cliente nunca tuvo una venta asociada.
// Deuda pendiente y abonos registrados no hace falta comprobarlos aparte:
// ambos SIEMPRE cuelgan de una venta a crédito de este cliente (una venta a
// crédito ES la deuda, ver el comentario en schema.sql, y un abono siempre
// referencia una venta), así que si el cliente no tiene ninguna venta
// tampoco puede tener deuda ni abonos.
function eliminarCliente(id, usuario = null) {
  const actual = clientesRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }

  const ventasAsociadas = clientesRepo.contarVentas(id);
  if (ventasAsociadas > 0) {
    return {
      exito: false,
      error: 'no_se_puede_eliminar',
      mensaje: `No se puede eliminar a "${actual.nombre}" porque tiene ${ventasAsociadas} ${
        ventasAsociadas === 1 ? 'factura asociada' : 'facturas asociadas'
      } (incluye ventas pagadas y a crédito, con su deuda y sus abonos si los tiene). Si ya no es un cliente activo, desactívalo en su lugar: deja de aparecer para ventas nuevas, pero conserva su historial.`,
    };
  }

  clientesRepo.eliminar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.CLIENTE_ELIMINADO,
    entidad: 'cliente',
    entidadId: id,
    detalle: `Cliente "${actual.nombre}" (id ${id}) eliminado de forma permanente.`,
  });

  return { exito: true };
}

module.exports = {
  crearCliente,
  listarClientes,
  buscarClientePorId,
  actualizarCliente,
  desactivarCliente,
  reactivarCliente,
  eliminarCliente,
};
