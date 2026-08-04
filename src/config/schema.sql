-- Esquema de base de datos: App Milagros
-- HU-01: Autenticación

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
