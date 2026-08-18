# Proyecto: App Milagros

## Arquitectura
- Node.js + Express + SQLite (better-sqlite3)
- Capas: src/domain (lógica negocio), src/data (repositorios/SQLite), src/routes (API)
- Frontend en **src/public** (no en /public — esa carpeta en la raíz quedó vacía y sin
  uso), servido local vía `express.static`, sin Electron, sin framework ni build step:
  un único `index.html` con vistas/pestañas que se muestran u ocultan por JS
  (`app.js`, vanilla) + `styles.css`. Se conecta al backend por `fetch` a `/api/...`
  (mismo origen). La sesión usa un token real: `sesionService.js` emite un UUID
  (`crypto.randomUUID()`) al loguearse, el frontend lo guarda en `localStorage` y lo
  manda como `Authorization: Bearer ...`. El middleware `requiereSesion.js` valida ese
  token en cada ruta protegida bajo `/api` (montado en `server.js`); sin token válido,
  responde 401. La sesión expira sola a las 12 horas o se puede cerrar antes desde el
  servidor con `POST /api/auth/logout` (invalida el token en el acto, no solo lo borra
  del navegador).
- API bajo `/api` (`/api/auth/login`, `/api/productos`, `/api/ventas`), excepto
  `POST /backup`, que quedó montado en la raíz sin el prefijo (inconsistencia pendiente
  de corregir).

## Reglas del proyecto
- NO implementar facturación electrónica DIAN (fuera de alcance por ahora)
- Backup automático a la nube es requisito crítico, no tocar esa lógica sin avisar
- Contraseñas siempre con bcrypt, nunca texto plano
- Consultas SQL siempre parametrizadas, nunca concatenadas
- .env y *.db nunca se commitean

## Limitaciones de arquitectura conocidas
- El sistema asume un solo usuario/rol viendo y operando todos los datos (HU-01 no
  distingue "admin" de "cajero", ni tiene concepto de "esto es mío" vs. "esto es de
  otro"). Por eso ningún endpoint verifica pertenencia sobre un `:id` (productos,
  ventas, clientes, abonos): cualquier sesión válida puede ver/editar cualquier
  registro, y eso es correcto hoy porque no hay nada contra qué comparar.
- Las ventas y los abonos NO guardan quién los hizo. El `usuario` que llega a
  `ventasService.crearVenta` / `creditoService.registrarAbono` se usa solo para el
  registro de auditoría — la fila de `ventas`/`abonos` en sí no tiene columna
  `usuario_id`/`vendedor_id`. Lo único que hoy responde "quién hizo esta venta" es la
  tabla `auditoria`, que se purga a los `AUDITORIA_RETENCION_DIAS` (30 días por
  defecto; los registros vencidos se archivan en `auditoria_archivo` antes de
  borrarse de la tabla activa, no se pierden, pero quedan fuera de las consultas
  normales).
- Si en el futuro se necesita soporte multiusuario con visibilidad restringida (ej.
  un cajero que solo vea sus propias ventas), hace falta una migración de esquema
  para agregar esa columna — y esa información **no se puede reconstruir
  retroactivamente** para las ventas ya guardadas antes del cambio: la única pista
  que existiría es cruzar con `auditoria`/`auditoria_archivo` por `entidad_id`, y solo
  para lo que no se haya perdido en el tiempo.

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