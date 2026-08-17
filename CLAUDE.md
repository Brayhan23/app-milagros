# Proyecto: App Milagros

## Arquitectura
- Node.js + Express + SQLite (better-sqlite3)
- Capas: src/domain (lógica negocio), src/data (repositorios/SQLite), src/routes (API)
- Frontend en **src/public** (no en /public — esa carpeta en la raíz quedó vacía y sin
  uso), servido local vía `express.static`, sin Electron, sin framework ni build step:
  un único `index.html` con vistas/pestañas que se muestran u ocultan por JS
  (`app.js`, vanilla) + `styles.css`. Se conecta al backend por `fetch` a `/api/...`
  (mismo origen). La "sesión" hoy es solo cosmética: el frontend guarda un string fijo
  en `localStorage` tras un login exitoso y lo manda como `Authorization: Bearer ...`,
  pero **ningún endpoint del backend valida ese header todavía** (no hay middleware de
  auth) — no es protección real, pendiente de resolver antes de exponer esto fuera de
  un entorno confiable.
- API bajo `/api` (`/api/auth/login`, `/api/productos`, `/api/ventas`), excepto
  `POST /backup`, que quedó montado en la raíz sin el prefijo (inconsistencia pendiente
  de corregir).

## Reglas del proyecto
- NO implementar facturación electrónica DIAN (fuera de alcance por ahora)
- Backup automático a la nube es requisito crítico, no tocar esa lógica sin avisar
- Contraseñas siempre con bcrypt, nunca texto plano
- Consultas SQL siempre parametrizadas, nunca concatenadas
- .env y *.db nunca se commitean

## Git
- Rama base: develop
- Cada historia en su propia rama: feature/hu-XX-nombre
- Nunca push directo a main ni develop sin avisar antes
- Commits en español, formato: "feat: descripción" / "fix: descripción"

## Estado de historias
Ver docs/requisitos_app_milagros.md para el detalle completo. Resumen (actualizado tras
inventario del código):
- **Completas**: HU-01, HU-02, HU-03, HU-04, HU-05, HU-08, HU-09, HU-10
- **Parciales**: HU-06 (la venta y la factura imprimible funcionan; falta encabezado con
  datos reales de la empresa —depende de HU-18— y reimprimir facturas pasadas desde la
  UI); HU-17 (solo se aplicó el rosado de marca; faltan lila y verde menta)
- **Sin empezar**: HU-07, HU-11, HU-12, HU-13, HU-14, HU-15, HU-16, HU-18
- **Próxima historia: HU-07** (copia de factura por correo, sin timbrado DIAN)
- Nota: HU-12 (ventas a crédito) tiene un hueco de diseño — ya se puede marcar una venta
  como `metodo_pago: 'credito'`, pero sin tabla de clientes ni de deudas (HU-11/HU-13) esa
  venta no queda asociada a nadie ni hay forma de cobrarla.