'use strict';

// Script mínimo, pensado para ejecutarse como proceso hijo aparte (no
// requerido directamente por ningún archivo de test): simplemente carga
// src/data/db.js, que es exactamente lo que corre schema.sql (CREATE TABLE
// IF NOT EXISTS) más las migraciones puntuales guardadas con
// columnaExiste(). Se usa dos veces seguidas contra el MISMO archivo .db
// para probar que "arrancar dos veces" es idempotente — si alguna
// migración no estuviera bien guardada, la segunda ejecución fallaría acá
// con un error de columna duplicada.
require('../../src/data/db');
process.exit(0);
