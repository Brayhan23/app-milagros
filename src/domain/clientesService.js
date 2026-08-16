const clientesRepo = require('../data/clientesRepo');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

function validarCorreo(correo) {
  return REGEX_CORREO.test(correo);
}

function crearCliente(datos = {}) {
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

function actualizarCliente(id, datos = {}) {
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
  return { exito: true, cliente };
}

function desactivarCliente(id) {
  const actual = clientesRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }
  return { exito: true, cliente: clientesRepo.desactivar(id) };
}

module.exports = { crearCliente, listarClientes, buscarClientePorId, actualizarCliente, desactivarCliente };
