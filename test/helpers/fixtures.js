'use strict';

// Fábricas de datos de prueba reutilizadas por varios archivos de test.
// Requiere los servicios reales (no mocks): cada producto/cliente creado
// pasa por las mismas validaciones que usaría la aplicación de verdad,
// contra la base de datos temporal que ya haya fijado dbTemporal.js.
const productosService = require('../../src/domain/productosService');
const clientesService = require('../../src/domain/clientesService');
const usuariosRepo = require('../../src/data/usuariosRepo');

let contador = 0;
function siguiente() {
  contador += 1;
  return contador;
}

// Fila real en `usuarios` (no un objeto inventado): auditoriaService.registrar
// guarda usuario_id como FOREIGN KEY hacia usuarios(id), así que un id que no
// existe de verdad hace fallar el INSERT de auditoría en cada llamada de
// las pruebas (registrar() nunca lanza, así que el test seguía "pasando",
// pero llenaba la salida de errores de FOREIGN KEY y nunca probaba de
// verdad el camino real de auditoría con usuario).
const USUARIO_PRUEBA = usuariosRepo.crearUsuario({
  usuario: 'usuario_de_prueba',
  passwordHash: 'no-se-usa-password-en-estas-pruebas',
});

function crearProductoDePrueba(overrides = {}) {
  const n = siguiente();
  const resultado = productosService.crearProducto(
    {
      nombre: `Producto Prueba ${n}`,
      precioCompra: 1000,
      precioDetal: 2000,
      precioMayor: 1500,
      stockActual: 100,
      stockMinimo: 5,
      ...overrides,
    },
    USUARIO_PRUEBA
  );
  if (!resultado.exito) {
    throw new Error(`No se pudo crear el producto de prueba: ${resultado.mensaje}`);
  }
  return resultado.producto;
}

function crearClienteDePrueba(overrides = {}) {
  const n = siguiente();
  const resultado = clientesService.crearCliente(
    {
      nombre: `Cliente Prueba ${n}`,
      ...overrides,
    },
    USUARIO_PRUEBA
  );
  if (!resultado.exito) {
    throw new Error(`No se pudo crear el cliente de prueba: ${resultado.mensaje}`);
  }
  return resultado.cliente;
}

module.exports = { crearProductoDePrueba, crearClienteDePrueba, USUARIO_PRUEBA };
