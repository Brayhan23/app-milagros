# App Milagros — Referencia técnica

> **Qué es este documento:** el QUÉ y el CÓMO exactos del sistema, extraídos
> leyendo el código real (no de memoria ni de historial de conversaciones).
> Para el POR QUÉ — decisiones de arquitectura, criterios de negocio, errores
> cometidos y lecciones aprendidas — ver
> [`CONTEXTO_PROYECTO_MILAGROS.md`](CONTEXTO_PROYECTO_MILAGROS.md). Este
> documento no repite ese contenido; lo referencia cuando hace falta.
>
> Todo lo escrito acá fue verificado leyendo el archivo correspondiente. Donde
> algo no se pudo confirmar así, se dice explícitamente en vez de asumirlo.
>
> Generado: 2026-08-30, contra el estado del código en ese momento.

---

## Tabla de contenidos

1. [Referencia completa de la API](#1-referencia-completa-de-la-api)
   - [Convenciones generales](#convenciones-generales)
   - [`authRoutes.js` — `/api/auth`](#authroutesjs--apiauth)
   - [`productosRoutes.js` — `/api/productos`](#productosroutesjs--apiproductos)
   - [`ventasRoutes.js` — `/api/ventas`](#ventasroutesjs--apiventas)
   - [`clientesRoutes.js` — `/api/clientes`](#clientesroutesjs--apiclientes)
   - [`configuracionRoutes.js` — `/api/configuracion`](#configuracionroutesjs--apiconfiguracion)
   - [`reportesRoutes.js` — `/api/reportes`](#reportesroutesjs--apireportes)
   - [`auditoriaRoutes.js` — `/api/auditoria`](#auditoriaroutesjs--apiauditoria)
   - [`backupRoutes.js` — `/api/backup`](#backuproutesjs--apibackup)
2. [Esquema de base de datos](#2-esquema-de-base-de-datos)
3. [Mapa de módulos](#3-mapa-de-módulos)
4. [Catálogo de acciones de auditoría](#4-catálogo-de-acciones-de-auditoría)
5. [Frontend](#5-frontend)
6. [Configuración (variables de entorno)](#6-configuración-variables-de-entorno)
7. [Scripts y comandos](#7-scripts-y-comandos)
8. [Suite de pruebas](#8-suite-de-pruebas)
9. [Puntos de extensión](#9-puntos-de-extensión)

---

## 1. Referencia completa de la API

### Convenciones generales

- **Formato universal de respuesta:** todo endpoint responde JSON con al
  menos `{ exito: boolean }`. En éxito, campos adicionales según el
  endpoint. En error, siempre `{ exito: false, mensaje: string }` (texto en
  español, listo para mostrar directo a la usuaria — ver
  [CONTEXTO_PROYECTO_MILAGROS.md §4](CONTEXTO_PROYECTO_MILAGROS.md), "Patrón
  de retorno universal").
- **camelCase en el request, snake_case en la respuesta.** El body que se
  envía usa nombres camelCase (`precioCompra`, `codigoBarras`, `clienteId`).
  Lo que devuelve la API son filas reales de SQLite, con sus columnas en
  snake_case (`precio_compra`, `codigo_barras`, `cliente_id`). Esta asimetría
  es consistente en las 8 rutas y no es un descuido — nunca hay un mapeo
  intermedio que renombre columnas.
- **Autenticación:** `Authorization: Bearer <token>` (UUID emitido por
  `POST /api/auth/login`). El middleware `requiereSesion`
  (`src/routes/middlewares/requiereSesion.js`) protege toda ruta que lo
  declare explícitamente. Dos respuestas posibles cuando falla, ambas 401:
  - Sin header, o header sin forma `Bearer <token>`:
    `{ exito: false, mensaje: "Debes iniciar sesión para acceder a este recurso." }`
  - Token ausente/expirado/inválido:
    `{ exito: false, mensaje: "Sesión inválida o expirada. Vuelve a iniciar sesión." }`
- **Montaje real de las rutas** (`server.js`, verificado):
  ```js
  app.use('/api/auth', authRoutes);                    // login es la única pública
  app.use('/api', requiereSesion, productosRoutes);
  app.use('/api', requiereSesion, ventasRoutes);
  app.use('/api', requiereSesion, clientesRoutes);
  app.use('/api', requiereSesion, configuracionRoutes);
  app.use('/api', requiereSesion, reportesRoutes);
  app.use('/api', requiereSesion, auditoriaRoutes);
  app.use('/api', requiereSesion, backupRoutes);
  ```
  **Nota sobre `CLAUDE.md`:** ese archivo dice que `POST /backup` "quedó
  montado en la raíz sin el prefijo /api (inconsistencia pendiente de
  corregir)". Leyendo `server.js` y `backupRoutes.js` tal como están hoy, eso
  ya no es así: `backupRoutes` está montado bajo `/api` con `requiereSesion`
  igual que el resto, y el propio `backupRoutes.js` lo documenta en un
  comentario. Es decir, `POST /api/backup` (con sesión), no `POST /backup`.
  Ver también la sección "Sorpresas" al final de este documento.
- **Errores no mapeados:** cada archivo de rutas tiene un objeto
  `ESTADO_POR_ERROR` que traduce el `error` que devuelve el servicio de
  dominio a un código HTTP. Si el servicio devuelve un `error` que no está en
  ese mapa, `responderError()` usa **400** por defecto.
- **IDs de URL:** todo `:id` numérico se parsea con `Number(valor)` +
  `Number.isInteger`; si no es un entero, la ruta responde
  `400 { exito:false, mensaje:'El id de <recurso> debe ser un número entero.' }`
  antes de tocar el servicio de dominio.

---

### `authRoutes.js` — `/api/auth`

| Método y ruta | Sesión |
|---|---|
| `POST /api/auth/login` | Pública |
| `POST /api/auth/logout` | Requiere sesión (declarada dentro del propio router) |
| `POST /api/auth/recuperar-solicitar` | Pública |
| `POST /api/auth/recuperar-validar-codigo` | Pública |
| `POST /api/auth/recuperar-confirmar` | Pública |

#### `POST /api/auth/login`

Body: `{ usuario: string, password: string }` (ambos no vacíos, se recorta
espacios de `usuario`).

Éxito `200`:
```json
{
  "exito": true,
  "usuario": { "id": 1, "usuario": "admin" },
  "token": "1d4c4470-6065-4f5e-b0d4-ae0110204a6f"
}
```

Errores:
| HTTP | `mensaje` | Causa |
|---|---|---|
| 400 | `Debes enviar usuario y password.` | falta o tipo inválido en el body |
| 401 | `Usuario o contraseña incorrectos.` | usuario inexistente o contraseña incorrecta (mismo mensaje para ambos casos, a propósito) |
| 429 | `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en N segundos.` | 5 intentos fallidos seguidos para ese usuario (5 min de bloqueo) |

Ejemplo de request:
```json
POST /api/auth/login
{ "usuario": "admin", "password": "Prueba123" }
```

#### `POST /api/auth/logout`

Header: `Authorization: Bearer <token>`. Sin body.

Éxito `200`: `{ "exito": true, "mensaje": "Sesión cerrada correctamente." }`
— además invalida el token del lado del servidor de inmediato (no solo lo
borra del navegador).

Error: `401` vía `requiereSesion` si el token ya no es válido.

#### `POST /api/auth/recuperar-solicitar`

Body: `{ usuario: string }` (acepta nombre de usuario o correo registrado).

Éxito `200` — **siempre el mismo mensaje genérico**, exista o no el usuario,
tenga o no correo configurado (para no delatar qué usuarios existen):
```json
{ "exito": true, "mensaje": "Si el usuario existe y tiene un correo registrado, recibirás un código en unos minutos." }
```

Errores:
| HTTP | `mensaje` | Causa |
|---|---|---|
| 400 | `Debes indicar tu usuario o correo.` | body vacío/inválido |
| 503 | `El envío de correo no está configurado en el servidor. Contacta al administrador.` | falta `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` en el servidor |

#### `POST /api/auth/recuperar-validar-codigo`

Paso 2 del flujo de recuperación: valida el código **sin consumirlo**.

Body: `{ usuario: string, codigo: string }` (`codigo` debe matchear `/^\d{6}$/`).

Éxito `200`: `{ "exito": true }`

Error `400`, mismo mensaje para código incorrecto, vencido, o usuario
inexistente (no distingue el motivo):
`{ "exito": false, "mensaje": "El código es inválido o ya expiró. Solicita uno nuevo." }`
(o `"Debes indicar usuario y código."` si el body es inválido).

#### `POST /api/auth/recuperar-confirmar`

Paso 3: cambia la contraseña. Consume el código (un solo uso).

Body: `{ usuario: string, codigo: string, nuevaPassword: string }`
(`nuevaPassword` mínimo 8 caracteres).

Éxito `200`: `{ "exito": true, "mensaje": "Contraseña actualizada correctamente. Ya puedes iniciar sesión." }`

Errores `400`:
- `Debes indicar usuario, código y nueva contraseña.` (body inválido)
- `El código es inválido o ya expiró. Solicita uno nuevo.` (mismo texto que el paso 2)
- `La nueva contraseña debe tener al menos 8 caracteres.`

---

### `productosRoutes.js` — `/api/productos`

Todas requieren sesión (montadas con `requiereSesion` en `server.js`).

`ESTADO_POR_ERROR`: `nombre_requerido:400, precio_invalido:400,
stock_invalido:400, cantidad_invalida:400, codigo_duplicado:409,
no_encontrado:404, no_se_puede_eliminar:409`.

| Método y ruta | Qué hace |
|---|---|
| `POST /api/productos` | Crea un producto |
| `GET /api/productos` | Lista productos |
| `GET /api/productos/:codigoBarras` | Busca por código de barras exacto |
| `PUT /api/productos/:id` | Actualiza un producto |
| `DELETE /api/productos/:id` | Desactiva (soft delete) |
| `PATCH /api/productos/:id/reactivar` | Reactiva un producto desactivado |
| `DELETE /api/productos/:id/permanente` | Borra la fila (solo si nunca se usó) |
| `PATCH /api/productos/:id/stock` | Ingresa mercancía (suma al stock) |
| `GET /api/productos/alertas/stock-bajo` | Productos con `stock_actual <= stock_minimo` |
| `GET /api/productos/stock/tiempo-real` | Stock de todos los productos activos |

#### `POST /api/productos`

Body:
```
{
  codigoBarras?: string | null,
  nombre: string,                 // obligatorio
  descripcion?: string | null,
  precioCompra: number,           // entero >= 0
  precioDetal: number,            // entero >= 0
  precioMayor: number,            // entero >= 0
  stockActual?: number,           // entero >= 0, default 0
  stockMinimo?: number            // entero >= 0, default 0
}
```

Éxito `201`:
```json
{
  "exito": true,
  "producto": {
    "id": 4, "codigo_barras": "7701234567890", "nombre": "Shampoo Reparador",
    "descripcion": null, "precio_compra": 8000, "precio_detal": 15000,
    "precio_mayor": 12000, "stock_actual": 20, "stock_minimo": 5,
    "activo": 1, "creado_en": "2026-08-30 14:02:11", "actualizado_en": "2026-08-30 14:02:11"
  },
  "advertencias": []
}
```

`advertencias` es un array de strings (nunca bloquea la creación) — ver
`generarAdvertencias()` en `src/domain/productosService.js`: compara
precio de compra vs. detal/mayor, y detal vs. mayor, avisando de posibles
errores de digitación o ventas con pérdida, sin impedir guardar.

Errores:
| HTTP | `error` | `mensaje` |
|---|---|---|
| 400 | `nombre_requerido` | `El nombre del producto es obligatorio.` |
| 400 | `precio_invalido` | `El precio {de compra\|al detal\|al por mayor} debe ser un número entero de pesos, mayor o igual a cero.` |
| 400 | `stock_invalido` | `{El stock mínimo\|El stock actual} debe ser un número entero mayor o igual a cero.` |
| 409 | `codigo_duplicado` | `Ya existe un producto con el código de barras "X".` |

#### `GET /api/productos?incluirInactivos=true`

Sin el query param (o distinto de `"true"`), solo trae `activo = 1`.

Éxito `200`: `{ "exito": true, "productos": [ { ...fila, "tiene_ventas": 0 | 1 } ] }`
— `tiene_ventas` es un `EXISTS` calculado en SQL, no una columna real; lo usa
el frontend para decidir si puede ofrecer "Eliminar".

#### `GET /api/productos/:codigoBarras`

Búsqueda **exacta** (no parcial) por `codigo_barras`.

Éxito `200`: `{ "exito": true, "producto": {...} }`
Error `404` `no_encontrado`: `No se encontró un producto con ese código de barras.`

#### `PUT /api/productos/:id`

Body: cualquier subconjunto de `{codigoBarras, nombre, descripcion,
precioCompra, precioDetal, precioMayor, stockMinimo}`. Los campos omitidos
conservan su valor actual. **`stockActual` no se puede tocar acá** — el
stock solo cambia por `PATCH /:id/stock` (ingreso) o al vender.

Éxito `200`: `{ "exito": true, "producto": {...}, "advertencias": [...] }`

Errores: `400` id no entero · `404 no_encontrado` · `400 nombre_requerido` ·
`400 precio_invalido` · `400 stock_invalido` (sobre `stockMinimo`) ·
`409 codigo_duplicado`.

#### `DELETE /api/productos/:id`

Desactiva (`activo = 0`), no borra. Éxito `200`:
`{ "exito": true, "producto": { ...(activo:0) } }`.
Errores: `400` id no entero · `404 no_encontrado`.

#### `PATCH /api/productos/:id/reactivar`

Éxito `200`: `{ "exito": true, "producto": { ...(activo:1) } }`.
Errores: `400` id no entero · `404 no_encontrado`.

#### `DELETE /api/productos/:id/permanente`

Borra la fila **de verdad**, solo si `venta_items` nunca lo referenció Y
`stock_actual = 0`.

Éxito `200`: `{ "exito": true }`
Error `409 no_se_puede_eliminar`:
`No se puede eliminar "X" porque ya se vendió N {vez|veces} y/o todavía
tiene N {unidad|unidades} en stock. Si ya no lo vas a vender, desactívalo
en su lugar: deja de aparecer en las ventas nuevas, pero conserva su historial.`

#### `PATCH /api/productos/:id/stock`

Body: `{ cantidad: number }` (entero > 0 — siempre **suma**, no hay forma de
restar stock por esta ruta).

Éxito `200`: `{ "exito": true, "producto": {...}, "bajoStock": boolean }`
Errores: `400` id no entero · `404 no_encontrado` ·
`400 cantidad_invalida`: `La cantidad a ingresar debe ser un número entero mayor a cero.`

#### `GET /api/productos/alertas/stock-bajo`

Éxito `200`: `{ "exito": true, "totalAlertas": number, "productos": [...] }`
(solo productos activos con `stock_actual <= stock_minimo`).

#### `GET /api/productos/stock/tiempo-real`

Éxito `200`:
```json
{
  "exito": true,
  "inventario": [
    { "id": 4, "codigo_barras": "7701...", "nombre": "Shampoo Reparador",
      "stock_actual": 20, "stock_minimo": 5, "bajo_stock": 0 }
  ]
}
```

---

### `ventasRoutes.js` — `/api/ventas`

`ESTADO_POR_ERROR`: `tipo_cliente_invalido:400, metodo_pago_invalido:400,
items_vacios:400, cantidad_invalida:400, descuento_invalido:400,
producto_no_encontrado:404, stock_insuficiente:409, no_encontrado:404,
correo_invalido:400, smtp_no_configurado:503, envio_fallido:502,
cliente_requerido:400, cliente_no_encontrado:404, venta_invalida:400,
monto_invalido:400, venta_no_es_credito:409, monto_supera_saldo:409`.

| Método y ruta | Qué hace |
|---|---|
| `POST /api/ventas` | Crea una venta (con sus items, descuenta stock) |
| `GET /api/ventas` | Lista todas las ventas |
| `GET /api/ventas/:id` | Detalle de una venta con sus items |
| `POST /api/ventas/:id/enviar-correo` | Envía la factura por correo |
| `POST /api/ventas/:id/abonos` | Registra un abono sobre una venta a crédito |

#### `POST /api/ventas`

Body:
```
{
  tipoCliente: 'detal' | 'mayor',
  metodoPago: 'efectivo' | 'transferencia' | 'credito',
  clienteId?: number | null,        // OBLIGATORIO si metodoPago = 'credito'
  descuento?: number,               // entero >= 0, default 0, no puede superar el subtotal
  items: [ { productoId: number, cantidad: number } ]   // cantidad entera > 0
}
```

Éxito `201`:
```json
{
  "exito": true,
  "venta": {
    "id": 152, "tipo_cliente": "detal", "metodo_pago": "efectivo",
    "cliente_id": null, "descuento": 0, "subtotal": 15000, "total": 15000,
    "iva_porcentaje": 19, "creado_en": "2026-08-30 19:10:03",
    "items": [
      { "id": 301, "venta_id": 152, "producto_id": 4, "nombre_producto": "Shampoo Reparador",
        "cantidad": 1, "precio_unitario": 15000, "precio_compra_unitario": 8000, "subtotal": 15000 }
    ],
    "ivaPorcentaje": 19, "baseGravable": 12605, "ivaMonto": 2395, "ivaAproximado": false
  }
}
```

`ivaPorcentaje`/`baseGravable`/`ivaMonto`/`ivaAproximado` los agrega
`ventasService.enriquecerConDesgloseIva()` (no vienen de la tabla) — ver
`calcularDesgloseIva()` en el mismo archivo para la fórmula exacta.

Errores (orden de validación real en `ventasService.crearVenta`):
| HTTP | `error` | Cuándo |
|---|---|---|
| 400 | `tipo_cliente_invalido` | no es `'detal'` ni `'mayor'` |
| 400 | `metodo_pago_invalido` | no es `'efectivo'`/`'transferencia'`/`'credito'` |
| 400 | `cliente_requerido` | `metodoPago:'credito'` sin `clienteId` |
| 404 | `cliente_no_encontrado` | `clienteId` no existe o está inactivo |
| 400 | `items_vacios` | `items` vacío o no es array |
| 400 | `cantidad_invalida` | alguna cantidad no es entero > 0 |
| 404 | `producto_no_encontrado` | algún `productoId` no existe o está inactivo |
| 409 | `stock_insuficiente` | la suma de cantidades de un mismo producto supera su `stock_actual` |
| 400 | `descuento_invalido` | descuento no entero ≥0, o mayor al subtotal |
| 400 | `monto_invalido` | el subtotal/total calculado excede el rango entero seguro de JS (overflow) |

#### `GET /api/ventas`

Éxito `200`: `{ "exito": true, "ventas": [ {...cada una enriquecida con IVA, con "items"} ] }`

#### `GET /api/ventas/:id`

Éxito `200`: `{ "exito": true, "venta": {...} }`
Errores: `400` id no entero · `404 no_encontrado`: `No se encontró la venta.`

#### `POST /api/ventas/:id/enviar-correo`

Body: `{ correoDestino: string }`

Éxito `200`: `{ "exito": true, "mensaje": "Factura enviada por correo correctamente." }`

Errores:
| HTTP | `error` | `mensaje` |
|---|---|---|
| 400 | (id inválido) | `El id de la venta debe ser un número entero.` |
| 404 | `no_encontrado` | `No se encontró la venta.` |
| 400 | `correo_invalido` | `El correo del destinatario no es válido.` |
| 503 | `smtp_no_configurado` | `El envío de correo no está configurado en el servidor. Contacta al administrador.` |
| 502 | `envio_fallido` | `No se pudo enviar el correo. Intenta de nuevo más tarde.` |

#### `POST /api/ventas/:id/abonos`

Body: `{ monto: number }` (entero > 0).

Éxito `201`:
```json
{ "exito": true, "abono": { "id": 9, "venta_id": 152, "monto": 20000, "creado_en": "2026-08-30 19:15:00" }, "saldoRestante": 30000 }
```

Errores: `400` id no entero · `400 venta_invalida` · `400 monto_invalido`
(monto ≤0 o no entero) · `404 no_encontrado` (venta inexistente) ·
`409 venta_no_es_credito`: `Solo se pueden registrar abonos sobre ventas a crédito.` ·
`409 monto_supera_saldo`: `El abono ($X) no puede superar el saldo pendiente ($Y).`

---

### `clientesRoutes.js` — `/api/clientes`

`ESTADO_POR_ERROR`: `nombre_requerido:400, correo_invalido:400,
documento_duplicado:409, no_encontrado:404, no_se_puede_eliminar:409`.

**Orden de rutas relevante:** `GET /clientes/deudas` está declarada ANTES
que `GET /clientes/:id` a propósito (comentario explícito en el código) —
si no, Express interpretaría `"deudas"` como un `:id` y esa ruta nunca se
alcanzaría.

| Método y ruta | Qué hace |
|---|---|
| `POST /api/clientes` | Crea un cliente |
| `GET /api/clientes` | Lista clientes |
| `GET /api/clientes/deudas` | Clientes con saldo pendiente > 0 |
| `GET /api/clientes/:id` | Un cliente |
| `GET /api/clientes/:id/deuda` | Ventas a crédito + abonos + saldo de un cliente |
| `PUT /api/clientes/:id` | Actualiza un cliente |
| `DELETE /api/clientes/:id` | Desactiva (soft delete) |
| `PATCH /api/clientes/:id/reactivar` | Reactiva |
| `DELETE /api/clientes/:id/permanente` | Borra la fila (solo si nunca tuvo ventas) |

#### `POST /api/clientes`

Body: `{ nombre: string, documento?: string|null, telefono?: string|null, correo?: string|null, esMayorista?: boolean }`

Éxito `201`: `{ "exito": true, "cliente": {...} }`
Errores: `400 nombre_requerido` · `400 correo_invalido` ·
`409 documento_duplicado`: `Ya existe un cliente con el documento "X".`

#### `GET /api/clientes?incluirInactivos=true`

Éxito `200`: `{ "exito": true, "clientes": [ {...fila, "tiene_ventas": 0|1} ] }`

#### `GET /api/clientes/deudas`

Éxito `200`:
```json
{
  "exito": true,
  "clientes": [
    { "id": 3, "nombre": "Juan Pérez", "documento": "123456789", "telefono": null,
      "correo": null, "saldo_total": 45000, "venta_mas_vieja_pendiente": "2026-07-15 20:10:00",
      "dias_deuda_mas_vieja": 46, "en_mora": true }
  ]
}
```
`en_mora` lo calcula `creditoService.listarClientesConDeuda()` con
`dias_deuda_mas_vieja > 30` (constante `DIAS_LIMITE_MORA`).

#### `GET /api/clientes/:id`

Éxito `200`: `{ "exito": true, "cliente": {...} }`
Errores: `400` id no entero · `404 no_encontrado`.

#### `GET /api/clientes/:id/deuda`

Éxito `200`:
```json
{
  "exito": true,
  "cliente": {...},
  "ventas": [ { "venta_id": 140, "total": 50000, "subtotal": 50000, "descuento": 0,
                "creado_en": "...", "abonado": 20000, "saldo": 30000 } ],
  "abonos": [ { "id": 9, "venta_id": 140, "monto": 20000, "creado_en": "..." } ],
  "saldoTotal": 30000,
  "ventasTotales": 4
}
```
`ventasTotales` cuenta **todas** las ventas del cliente (pagadas + a
crédito), no solo las que tienen deuda — es lo que usa el frontend para
decidir si mostrar el botón "Eliminar".

Errores: `400` id no entero · `404 no_encontrado`.

#### `PUT /api/clientes/:id`

Body: subconjunto de `{nombre, documento, telefono, correo, esMayorista}`.
Éxito `200`: `{ "exito": true, "cliente": {...} }`
Errores: `400` id no entero · `404 no_encontrado` · `400 nombre_requerido` ·
`400 correo_invalido` · `409 documento_duplicado`.

#### `DELETE /api/clientes/:id`

Desactiva. Éxito `200`: `{ "exito": true, "cliente": {...(activo:0)} }`
Errores: `400` id no entero · `404 no_encontrado`.

#### `PATCH /api/clientes/:id/reactivar`

Éxito `200`: `{ "exito": true, "cliente": {...(activo:1)} }`
Errores: `400` id no entero · `404 no_encontrado`.

#### `DELETE /api/clientes/:id/permanente`

Borra la fila, solo si nunca tuvo ninguna venta (pagada o a crédito).
Éxito `200`: `{ "exito": true }`
Error `409 no_se_puede_eliminar`:
`No se puede eliminar a "X" porque tiene N {factura asociada|facturas
asociadas} (incluye ventas pagadas y a crédito, con su deuda y sus abonos
si los tiene). Si ya no es un cliente activo, desactívalo en su lugar...`

---

### `configuracionRoutes.js` — `/api/configuracion`

`ESTADO_POR_ERROR`: `nombre_requerido:400, correo_invalido:400, iva_invalido:400`.

#### `GET /api/configuracion`

Éxito `200`:
```json
{
  "exito": true,
  "configuracion": {
    "id": 1, "nombre_empresa": "Milagros", "nit": "900123456-7",
    "direccion": "Calle 10 #5-20", "telefono": "3001234567",
    "correo": "contacto@milagros.com", "logo_ruta": "uploads/logo.png",
    "iva_porcentaje": 19, "actualizado_en": "2026-08-20 12:00:00"
  }
}
```
Fila única (`id=1`), siempre existe (la siembra `schema.sql`).

#### `PUT /api/configuracion`

Body: subconjunto de `{nombreEmpresa, nit, direccion, telefono, correo,
logoRuta, ivaPorcentaje}`.

Éxito `200`: `{ "exito": true, "configuracion": {...} }`

Errores:
| HTTP | `error` | `mensaje` |
|---|---|---|
| 400 | `nombre_requerido` | `El nombre de la empresa es obligatorio.` |
| 400 | `correo_invalido` | `El correo de la empresa no es válido.` |
| 400 | `iva_invalido` | `El porcentaje de IVA debe ser un número entero entre 0 y 100.` |

---

### `reportesRoutes.js` — `/api/reportes`

`ESTADO_POR_ERROR`: `fecha_invalida:400, rango_invalido:400`. Las rutas con
`desde`/`hasta` obligatorios responden `400` directo (fuera de
`ESTADO_POR_ERROR`) con `Debes indicar los parámetros desde y hasta
(AAAA-MM-DD).` si falta alguno.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/reportes/ventas-dia` | Resumen del día calendario colombiano (hoy) |
| `GET /api/reportes/historico?desde&hasta` | Mismo resumen, rango arbitrario |
| `GET /api/reportes/ventas-dia/listado` | Ventas individuales de hoy |
| `GET /api/reportes/historico/listado?desde&hasta` | Ventas individuales del rango |
| `GET /api/reportes/exportar/excel?desde&hasta` | Descarga `.xlsx` |
| `GET /api/reportes/exportar/pdf?desde&hasta` | Descarga `.pdf` |
| `GET /api/reportes/productos-mas-vendidos?desde?&hasta?` | Ranking, fechas opcionales |

#### `GET /api/reportes/ventas-dia` y `GET /api/reportes/historico`

Fechas en formato `AAAA-MM-DD`, validadas con calendario real (rechaza
`2026-02-30`, por ejemplo). `desde` no puede ser posterior a `hasta`.

Éxito `200` (mismo shape en ambos, `historico` agrega `desde`/`hasta`):
```json
{
  "exito": true,
  "fecha": "2026-08-30",
  "cantidadVentas": 12,
  "totalFacturado": 480000,
  "dineroRecibidoVentas": 350000,
  "abonosRecibidos": 60000,
  "dineroRecibidoTotal": 410000,
  "gananciaTotal": 190000,
  "gananciaAproximada": false,
  "ivaRecaudado": 76632,
  "ivaAproximado": false,
  "porMetodoPago": [
    { "metodoPago": "efectivo", "cantidad": 8, "totalFacturado": 300000, "dineroRecibido": 300000 },
    { "metodoPago": "credito", "cantidad": 4, "totalFacturado": 180000, "dineroRecibido": 0 }
  ]
}
```
`dineroRecibido` de una fila `credito` siempre es `0` (es facturado, no
recibido en caja). `gananciaAproximada`/`ivaAproximado` son `true` si
alguna venta del rango es anterior a las columnas históricas
correspondientes (ver [§2](#2-esquema-de-base-de-datos)).

Errores (ambos endpoints): `400 fecha_invalida`: `Las fechas deben tener el
formato AAAA-MM-DD y ser válidas.` · `400 rango_invalido`: `La fecha
inicial no puede ser posterior a la final.`

#### `GET /api/reportes/ventas-dia/listado` y `.../historico/listado`

Éxito `200`:
```json
{
  "exito": true, "fecha": "2026-08-30",
  "ventas": [
    { "id": 152, "creado_en": "...", "tipo_cliente": "detal", "metodo_pago": "efectivo",
      "subtotal": 15000, "descuento": 0, "total": 15000, "cliente_id": null,
      "nombre_cliente": null, "iva_porcentaje": 19 }
  ]
}
```
No trae `items` (para eso, `GET /api/ventas/:id`).

#### `GET /api/reportes/exportar/excel` y `.../exportar/pdf`

Devuelven el archivo binario directo (`res.send(buffer)`), con
`Content-Type` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
o `application/pdf`) y `Content-Disposition: attachment;
filename="reporte-ventas_<desde>_a_<hasta>.<ext>"`. **`gananciaTotal` y
`gananciaAproximada` nunca viajan en estos archivos** — ver
`exportacionService.obtenerDatosReporte()`, que arma el objeto de datos con
una allow-list explícita de campos.

Mismos errores `400` que arriba si faltan/son inválidas las fechas.

#### `GET /api/reportes/productos-mas-vendidos`

`desde`/`hasta` opcionales, pero deben venir **juntas o ninguna** (`Boolean(desde) !== Boolean(hasta)` → error).

Éxito `200`:
```json
{
  "exito": true,
  "productos": [
    { "producto_id": 4, "nombre": "Shampoo Reparador", "unidades_vendidas": 34, "ingreso_generado": 510000 }
  ]
}
```
Ordenado por `unidades_vendidas DESC`.

Error `400 rango_invalido`: `Debes indicar ambas fechas (desde y hasta) o
ninguna.` (además de `fecha_invalida`/`rango_invalido` si ambas vienen pero
son inválidas).

---

### `auditoriaRoutes.js` — `/api/auditoria`

`ESTADO_POR_ERROR`: `fecha_invalida:400, rango_invalido:400`.

#### `GET /api/auditoria?desde?&hasta?&accion?&usuario?`

Los cuatro filtros son opcionales y combinables (AND). `accion` es el
código interno (ver [§4](#4-catálogo-de-acciones-de-auditoría)). `usuario`
hace match exacto contra la columna `usuario` (texto, no `usuario_id`).

Éxito `200`:
```json
{
  "exito": true,
  "eventos": [
    { "id": 501, "usuario_id": 1, "usuario": "admin", "accion": "venta_creada",
      "entidad": "venta", "entidad_id": 152, "detalle": "Venta #152 por $15.000 (efectivo, detal), 1 producto(s).",
      "ip": "127.0.0.1", "creado_en": "2026-08-30 19:10:03" }
  ]
}
```
Máximo 500 filas por consulta (`LIMITE_FILAS` en `auditoriaRepo.js`, sin
paginación real — ver [§9](#9-puntos-de-extensión) si hace falta agregarla).

Errores: `400 fecha_invalida` · `400 rango_invalido`.

#### `GET /api/auditoria/acciones`

Éxito `200`: `{ "exito": true, "acciones": ["login_exitoso", "login_fallido", ...] }`
— el catálogo completo de `ACCIONES` (ver [§4](#4-catálogo-de-acciones-de-auditoría)),
usado por el frontend para poblar el `<select>` de filtro sin duplicar la
lista a mano.

---

### `backupRoutes.js` — `/api/backup`

#### `POST /api/backup`

Dispara un backup manual inmediato (además del automático diario — ver
`backupService.iniciarProgramacionBackup()`).

Éxito `200`:
```json
{ "exito": true, "archivo": "C:\\Users\\...\\MilagrosBackups\\milagros-2026-08-30.db", "tamanioBytes": 77824 }
```

Errores:
| HTTP | Causa |
|---|---|
| 409 | ya hay un backup en curso: `{ "exito": false, "mensaje": "Ya hay un respaldo en curso." }` |
| 500 | cualquier otro fallo — incluye el caso `BACKUP_PATH` no configurado, cuyo mensaje es literalmente `"BACKUP_PATH no está configurado en .env"` |

---

## 2. Esquema de base de datos

Fuente: `src/config/schema.sql` (ejecutado completo en cada arranque,
`CREATE TABLE IF NOT EXISTS` — idempotente) + migraciones `ALTER TABLE` en
`src/data/db.js` (para columnas nuevas sobre tablas ya existentes, ver
tabla de migraciones al final de esta sección).

Motivo de negocio de cada decisión de esquema (dinero como `INTEGER`,
"fotos" históricas, por qué no hay tabla `deudas`, etc.) ya está explicado
en [CONTEXTO_PROYECTO_MILAGROS.md §5](CONTEXTO_PROYECTO_MILAGROS.md) — acá
solo la forma exacta de cada tabla.

### `usuarios`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `usuario` | TEXT | NOT NULL, UNIQUE | nombre de inicio de sesión |
| `password_hash` | TEXT | NOT NULL | hash bcrypt (costo 12 al crear/recuperar) |
| `correo` | TEXT | nullable | para recibir el código de recuperación; agregada por migración |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | UTC |

Índice implícito: `usuario` (por `UNIQUE`).

### `productos`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `codigo_barras` | TEXT | UNIQUE, nullable | único cuando existe; varios `NULL` conviven (SQLite no compara `NULL=NULL`) |
| `nombre` | TEXT | NOT NULL | — |
| `descripcion` | TEXT | nullable | — |
| `precio_compra` | INTEGER | NOT NULL, CHECK `>= 0` | costo, en pesos enteros |
| `precio_detal` | INTEGER | NOT NULL, CHECK `>= 0` | precio de venta al detal |
| `precio_mayor` | INTEGER | NOT NULL, CHECK `>= 0` | precio de venta al por mayor |
| `stock_actual` | INTEGER | NOT NULL, default 0, CHECK `>= 0` | inventario disponible; el `CHECK` es la última línea de defensa contra sobreventa (ver `test/ventas.test.js`) |
| `stock_minimo` | INTEGER | NOT NULL, default 0, CHECK `>= 0` | umbral de alerta |
| `activo` | INTEGER | NOT NULL, default 1, CHECK `IN (0,1)` | soft delete |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | UTC |
| `actualizado_en` | TEXT | NOT NULL, default `datetime('now')` | se actualiza a mano en cada `UPDATE` (no hay trigger) |

Índice implícito: `codigo_barras` (por `UNIQUE`). Sin índice explícito
adicional (ej. sobre `activo` o `nombre`) — al volumen de una tienda local
no se detectó necesidad, pero es el primer lugar a mirar si el listado se
sintiera lento con muchos productos.

### `ventas`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | número de factura |
| `tipo_cliente` | TEXT | NOT NULL, CHECK `IN ('detal','mayor')` | qué lista de precios se usó |
| `metodo_pago` | TEXT | NOT NULL, CHECK `IN ('efectivo','transferencia','credito')` | — |
| `cliente_id` | INTEGER | FK → `clientes(id)`, nullable | **agregado por migración**; obligatorio en la práctica cuando `metodo_pago='credito'`, regla validada en `ventasService`, no expresable como `CHECK` de una sola tabla |
| `descuento` | INTEGER | NOT NULL, default 0, CHECK `>= 0` | monto fijo en pesos, no porcentaje |
| `subtotal` | INTEGER | NOT NULL, CHECK `>= 0` | suma de `venta_items.subtotal` |
| `total` | INTEGER | NOT NULL, CHECK `>= 0` | `subtotal - descuento` |
| `iva_porcentaje` | INTEGER | CHECK `BETWEEN 0 AND 100`, nullable | **agregado por migración**; foto del `configuracion_empresa.iva_porcentaje` vigente al vender; `NULL` en ventas anteriores a esta columna |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | UTC — ver zona horaria en CONTEXTO §9 |

Sin índice explícito sobre `cliente_id` (usado en varios `WHERE`/`JOIN` de
`deudasRepo.js`) ni sobre `creado_en` (usado con `date(creado_en, ...)` en
casi todas las consultas de reportes/auditoría). A este volumen no se
detectó problema de rendimiento; es el candidato más directo si algún día
lo hay.

### `venta_items`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `venta_id` | INTEGER | NOT NULL, FK → `ventas(id)` | — |
| `producto_id` | INTEGER | NOT NULL, FK → `productos(id)` | — |
| `nombre_producto` | TEXT | NOT NULL | "foto" del nombre al momento de vender |
| `cantidad` | INTEGER | NOT NULL, CHECK `> 0` | — |
| `precio_unitario` | INTEGER | NOT NULL, CHECK `>= 0` | "foto" del precio de venta (detal o mayor según correspondía) |
| `precio_compra_unitario` | INTEGER | CHECK `>= 0`, nullable | **agregado por migración**; "foto" del costo al vender, para la ganancia histórica; `NULL` en ventas anteriores |
| `subtotal` | INTEGER | NOT NULL, CHECK `>= 0` | `precio_unitario * cantidad` |

Sin índice sobre `venta_id` ni `producto_id` (ambos usados en `JOIN`s de
reportes y en `productosRepo.contarVentaItems`).

### `clientes`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `nombre` | TEXT | NOT NULL | — |
| `documento` | TEXT | UNIQUE, nullable | mismo criterio que `productos.codigo_barras` |
| `telefono` | TEXT | nullable | — |
| `correo` | TEXT | nullable | — |
| `es_mayorista` | INTEGER | NOT NULL, default 0, CHECK `IN (0,1)` | — |
| `activo` | INTEGER | NOT NULL, default 1, CHECK `IN (0,1)` | soft delete |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | — |
| `actualizado_en` | TEXT | NOT NULL, default `datetime('now')` | — |

Índice implícito: `documento` (por `UNIQUE`).

### `abonos`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `venta_id` | INTEGER | NOT NULL, FK → `ventas(id)` | a qué venta a crédito puntual aplica (no hay reparto automático entre varias) |
| `monto` | INTEGER | NOT NULL, CHECK `> 0` | — |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | fecha real del pago |

Que `venta_id` corresponda a una venta con `metodo_pago='credito'` es una
regla entre tablas, validada en `creditoService`, no expresable como
`CHECK` de SQLite. Sin índice sobre `venta_id`.

### `configuracion_empresa`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK, CHECK `= 1` | fuerza fila única |
| `nombre_empresa` | TEXT | NOT NULL, default `'Milagros'` | — |
| `nit` | TEXT | nullable | texto, no número (lleva guion y dígito de verificación) |
| `direccion` | TEXT | nullable | — |
| `telefono` | TEXT | nullable | — |
| `correo` | TEXT | nullable | — |
| `logo_ruta` | TEXT | nullable | solo la ruta/URL, nunca la imagen |
| `iva_porcentaje` | INTEGER | NOT NULL, default 19, CHECK `BETWEEN 0 AND 100` | **agregada por migración** |
| `actualizado_en` | TEXT | NOT NULL, default `datetime('now')` | — |

`INSERT OR IGNORE INTO configuracion_empresa (id, nombre_empresa) VALUES
(1, 'Milagros')` se ejecuta siempre después del `CREATE TABLE` — la fila
`id=1` existe garantizado desde el primer arranque.

### `auditoria`

| Columna | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | — |
| `usuario_id` | INTEGER | FK → `usuarios(id)`, nullable | `NULL` en un login fallido con usuario inexistente |
| `usuario` | TEXT | NOT NULL | copia del nombre ("foto"), siempre presente aunque `usuario_id` sea `NULL` |
| `accion` | TEXT | NOT NULL | código fijo, ver [§4](#4-catálogo-de-acciones-de-auditoría) |
| `entidad` | TEXT | nullable | ej. `'producto'`, `'venta'` |
| `entidad_id` | INTEGER | nullable | — |
| `detalle` | TEXT | nullable | resumen legible en una línea |
| `ip` | TEXT | nullable | capturada sobre todo en login |
| `creado_en` | TEXT | NOT NULL, default `datetime('now')` | — |

Índices explícitos: `idx_auditoria_creado_en` sobre `creado_en`,
`idx_auditoria_accion` sobre `accion` (los dos campos por los que más se
filtra).

### `auditoria_archivo`

Misma forma que `auditoria`, más una columna `purgado_en TEXT NOT NULL
default datetime('now')`. Diferencia clave: `id INTEGER PRIMARY KEY` **sin**
`AUTOINCREMENT` — conserva el mismo `id` que tenía en `auditoria` (para
poder correlacionar), no genera uno nuevo. Sin índices propios (no se
consulta en el día a día, es el destino final de la purga).

### Migraciones (`src/data/db.js`), en el orden exacto en que se aplican

Cada una está protegida por `columnaExiste(tabla, columna)` (via `PRAGMA
table_info`), así que correr el arranque muchas veces seguidas es
idempotente — verificado en `test/integridad.test.js`.

1. `schema.sql` completo (`db.exec(schema)`) — crea las 9 tablas si no
   existen, siembra `configuracion_empresa`.
2. `ALTER TABLE ventas ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)`
3. `ALTER TABLE venta_items ADD COLUMN precio_compra_unitario INTEGER CHECK (precio_compra_unitario >= 0)`
4. `ALTER TABLE usuarios ADD COLUMN correo TEXT`
5. `ALTER TABLE configuracion_empresa ADD COLUMN iva_porcentaje INTEGER NOT NULL DEFAULT 19 CHECK (iva_porcentaje BETWEEN 0 AND 100)`
6. `ALTER TABLE ventas ADD COLUMN iva_porcentaje INTEGER CHECK (iva_porcentaje BETWEEN 0 AND 100)`

---

## 3. Mapa de módulos

Formato por archivo: qué exporta (firma), de qué depende. Los servicios de
`src/domain` **nunca** hacen SQL directo (siempre vía su repo de
`src/data`) y **nunca** lanzan excepciones al llamador — devuelven
`{exito, ...}` (ver el patrón en CONTEXTO §4). Las rutas de `src/routes`
**nunca** hablan directo con un repo — siempre pasan por el servicio.

### `src/data` (repositorios — único lugar con SQL)

| Archivo | Exporta | Depende de |
|---|---|---|
| `db.js` | la conexión `better-sqlite3` ya abierta (WAL, `foreign_keys=ON`), con el esquema y las migraciones ya aplicadas | `better-sqlite3`, `src/config/schema.sql` |
| `usuariosRepo.js` | `buscarPorUsuario(usuario)`, `buscarPorCorreo(correo)`, `buscarPorId(id)`, `crearUsuario({usuario,passwordHash})`, `actualizarPassword(id,hash)`, `actualizarCorreo(id,correo)` | `db.js` |
| `productosRepo.js` | `buscarPorId`, `buscarPorCodigoBarras`, `listar({incluirInactivos})`, `crear`, `actualizar`, `desactivar`, `reactivar`, `contarVentaItems(id)`, `eliminar(id)`, `actualizarStock(id,delta)`, `listarBajoStock()`, `obtenerStockEnTiempoReal()` | `db.js` |
| `clientesRepo.js` | `buscarPorId`, `buscarPorDocumento`, `listar({incluirInactivos})`, `crear`, `actualizar`, `desactivar`, `reactivar`, `contarVentas(id)`, `eliminar(id)` | `db.js` |
| `ventasRepo.js` | `crear({...})` (transacción: inserta venta+items, descuenta stock, revalida stock dentro de la misma transacción), `buscarPorId(id)` (con `items`), `listar()` | `db.js`, `productosRepo.js` |
| `deudasRepo.js` | `registrarAbono(ventaId,monto)` (transacción, revalida que no supere el total dentro de la transacción), `saldoDeVenta(ventaId)`, `ventasCreditoDeCliente(clienteId)`, `abonosDeCliente(clienteId)`, `listarClientesConDeuda()` | `db.js` |
| `reportesRepo.js` | `resumenVentasPorRango(desde,hasta)`, `productosMasVendidos({desde,hasta})`, `listarVentasPorRango(desde,hasta)` | `db.js`, `configuracionRepo.js` (para la tasa de IVA actual, al aproximar ventas viejas) |
| `auditoriaRepo.js` | `crear({...})`, `listar({desde,hasta,accion,usuario})` (máx. 500 filas), `purgarAntiguos(diasRetencion)` (transacción: archiva antes de borrar) | `db.js` |
| `configuracionRepo.js` | `obtener()`, `actualizar({...})` | `db.js` |

### `src/domain` (lógica de negocio)

| Archivo | Exporta | Depende de |
|---|---|---|
| `authService.js` | `login(usuario,password,ip?)`, `limpiarBloqueoLogin(usuario)` | `bcrypt`, `usuariosRepo.js`, `auditoriaService.js` |
| `sesionService.js` | `crearSesion(usuario)→token`, `validarToken(token)→usuario\|null`, `eliminarSesion(token)` | `crypto` (Map en memoria, sin persistencia) |
| `recuperacionService.js` | `solicitarRecuperacion(identificador,ip?)`, `validarCodigo(identificador,codigo)`, `confirmarRecuperacion({usuario,codigo,nuevaPassword},ip?)`, `MIN_LONGITUD_PASSWORD` (8) | `bcrypt`, `usuariosRepo.js`, `authService.js` (limpia bloqueo tras reseteo), `emailService.js`, `auditoriaService.js` (Map en memoria para los códigos) |
| `productosService.js` | `crearProducto`, `listarProductos`, `buscarPorCodigoBarras`, `actualizarProducto`, `desactivarProducto`, `reactivarProducto`, `eliminarProducto`, `ingresarStock`, `obtenerAlertasStock`, `consultarStockTiempoReal` | `productosRepo.js`, `auditoriaService.js` |
| `ventasService.js` | `crearVenta`, `obtenerVenta`, `listarVentas`, `calcularDesgloseIva(total,ivaPorcentaje)` | `ventasRepo.js`, `productosRepo.js`, `clientesRepo.js`, `configuracionRepo.js`, `auditoriaService.js` |
| `clientesService.js` | `crearCliente`, `listarClientes`, `buscarClientePorId`, `actualizarCliente`, `desactivarCliente`, `reactivarCliente`, `eliminarCliente` | `clientesRepo.js`, `auditoriaService.js` |
| `creditoService.js` | `registrarAbono`, `obtenerDeudaCliente`, `listarClientesConDeuda` | `clientesRepo.js`, `deudasRepo.js`, `auditoriaService.js` |
| `emailService.js` | `enviarFacturaPorCorreo(ventaId,correoDestino,usuario?)`, `construirHtmlFactura(venta)`, `enviarCorreo({destino,asunto,html})` | `nodemailer`, `ventasService.js`, `configuracionRepo.js`, `fechaColombia.js`, `auditoriaService.js` |
| `reportesService.js` | `ventasDelDia`, `historicoPorRango(desde,hasta)`, `ventasDelDiaListado`, `historicoListado(desde,hasta)`, `productosMasVendidos({desde,hasta})` | `reportesRepo.js` |
| `exportacionService.js` | `generarExcelRango(desde,hasta)`, `generarPdfRango(desde,hasta)`, `obtenerDatosReporte` (exportado solo para pruebas, allow-list explícita que excluye ganancia) | `exceljs`, `pdfkit`, `reportesService.js`, `ventasService.js` (fórmula de IVA), `configuracionRepo.js`, `fechaColombia.js` |
| `configuracionService.js` | `obtenerConfiguracion`, `actualizarConfiguracion` | `configuracionRepo.js`, `auditoriaService.js` |
| `auditoriaService.js` | `registrar({...})` (nunca lanza), `resumirCambios(antes,despues,campos)`, `listarEventos({...})`, `purgarAntiguos()`, `iniciarProgramacionPurga()`, `ACCIONES` (catálogo congelado) | `auditoriaRepo.js` |
| `backupService.js` | `ejecutarBackup()`, `rotarBackups()`, `necesitaBackupHoy()`, `nombreArchivoParaFecha(fecha?)`, `iniciarProgramacionBackup()` | `fs`, `db.js` (usa `db.backup()` nativo de better-sqlite3) |
| `mantenimientoService.js` | `ejecutarVacuumSiFalta()`, `iniciarProgramacionVacuum()` | `fs`, `db.js` |
| `fechaColombia.js` | `fechaColombiaISO(fechaUtc)`, `formatearFechaColombia(fechaUtc,{conHora})` | ninguna (puro) |

### `src/routes` (HTTP ↔ dominio)

| Archivo | Monta en | Depende de |
|---|---|---|
| `authRoutes.js` | `/api/auth` (login público; logout requiere sesión declarada dentro del router) | `authService.js`, `sesionService.js`, `recuperacionService.js`, `auditoriaService.js`, `middlewares/requiereSesion.js` |
| `productosRoutes.js` | `/api` (con `requiereSesion`) | `productosService.js` |
| `ventasRoutes.js` | `/api` (con `requiereSesion`) | `ventasService.js`, `emailService.js`, `creditoService.js` |
| `clientesRoutes.js` | `/api` (con `requiereSesion`) | `clientesService.js`, `creditoService.js` |
| `configuracionRoutes.js` | `/api` (con `requiereSesion`) | `configuracionService.js` |
| `reportesRoutes.js` | `/api` (con `requiereSesion`) | `reportesService.js`, `exportacionService.js` |
| `auditoriaRoutes.js` | `/api` (con `requiereSesion`) | `auditoriaService.js` |
| `backupRoutes.js` | `/api` (con `requiereSesion`) | `backupService.js` |
| `middlewares/requiereSesion.js` | — (middleware) | `sesionService.js` |

### `src/config`

| Archivo | Qué es |
|---|---|
| `schema.sql` | esquema completo (ver [§2](#2-esquema-de-base-de-datos)) |
| `salidaFatal.js` | `salirConError(lineas[])` — imprime un error de arranque en español y, si corre empaquetado (`process.pkg`), espera una tecla antes de cerrar la ventana (para que no desaparezca sola). Usado por `server.js`. |

### Entrada del proceso

`server.js` (raíz del proyecto): valida que `.env` exista, hace `dotenv.config()`,
despacha subcomandos CLI (`crear-admin`/`configurar-correo`/`verificar-backup`
→ delega a los scripts de `scripts/`, ver [§7](#7-scripts-y-comandos)) o
arranca Express: monta `/uploads` (estático, `process.cwd()/uploads`),
`src/public` (estático), todas las rutas de arriba, un handler de error
genérico al final, y escucha en `127.0.0.1:PORT`. Al arrancar exitosamente
llama a `backupService.iniciarProgramacionBackup()`,
`auditoriaService.iniciarProgramacionPurga()`,
`mantenimientoService.iniciarProgramacionVacuum()`.

---

## 4. Catálogo de acciones de auditoría

Fuente: `ACCIONES` en `src/domain/auditoriaService.js` (objeto congelado,
19 códigos). Todas se registran con `auditoriaService.registrar({usuario,
accion, entidad?, entidadId?, detalle?, ip?})`, que nunca lanza — si el
`INSERT` falla, se loguea en consola y la operación de negocio ya
confirmada sigue de largo.

| Código | Quién la dispara | Qué guarda `detalle` |
|---|---|---|
| `login_exitoso` | `authService.login()`, credenciales correctas | `Inicio de sesión exitoso para "X".` (+ `ip`) |
| `login_fallido` | `authService.login()`, credenciales incorrectas **o** cuenta bloqueada | `Intento de login fallido para "X".` / `...rechazado: cuenta bloqueada temporalmente.` (+ `ip`) |
| `logout` | `POST /api/auth/logout` | `Cierre de sesión para "X".` (+ `ip`) |
| `venta_creada` | `ventasService.crearVenta()` | `Venta #N por $X (método, tipo), N producto(s).` |
| `abono_registrado` | `creditoService.registrarAbono()` | `Abono de $X sobre la venta #N. Saldo restante: $Y.` |
| `producto_creado` | `productosService.crearProducto()` | `Producto "X" creado (precio detal $Y, precio mayor $Z, stock inicial N).` |
| `producto_actualizado` | `productosService.actualizarProducto()` | resumen de campos cambiados vía `resumirCambios()`, ej. `Precio al detal: $12.000 -> $13.000` |
| `producto_desactivado` | `productosService.desactivarProducto()` | `Producto "X" (id N) desactivado.` |
| `producto_reactivado` | `productosService.reactivarProducto()` | `Producto "X" (id N) reactivado.` |
| `producto_eliminado` | `productosService.eliminarProducto()` (borrado permanente) | `Producto "X" (id N) eliminado de forma permanente.` |
| `stock_ingresado` | `productosService.ingresarStock()` | `Ingreso de stock: +N unidades de "X" (stock resultante: M).` |
| `cliente_creado` | `clientesService.crearCliente()` | `Cliente "X" creado (mayorista)` si aplica |
| `cliente_actualizado` | `clientesService.actualizarCliente()` | resumen vía `resumirCambios()` |
| `cliente_desactivado` | `clientesService.desactivarCliente()` | `Cliente "X" (id N) desactivado.` |
| `cliente_reactivado` | `clientesService.reactivarCliente()` | `Cliente "X" (id N) reactivado.` |
| `cliente_eliminado` | `clientesService.eliminarCliente()` (borrado permanente) | `Cliente "X" (id N) eliminado de forma permanente.` |
| `configuracion_actualizada` | `configuracionService.actualizarConfiguracion()` | resumen vía `resumirCambios()` |
| `recuperacion_solicitada` | `recuperacionService.solicitarRecuperacion()` | `Se solicitó recuperación de contraseña para "X".` — se registra **exista o no** el usuario (para poder detectar patrones de solicitudes a usuarios inventados); el código de 6 dígitos NUNCA se audita |
| `recuperacion_completada` | `recuperacionService.confirmarRecuperacion()`, éxito | `Contraseña restablecida mediante código de recuperación para "X".` |
| `factura_enviada_correo` | `emailService.enviarFacturaPorCorreo()`, **éxito y fallo** | `Factura de la venta #N enviada por correo a "correo@x.com".` / `Intento fallido de enviar la factura de la venta #N por correo a "correo@x.com".` |

**Traducción legible de campos:** `resumirCambios()` usa el catálogo
`CAMPOS_AUDITABLES` (mismo archivo) para traducir nombre de columna →
etiqueta en español y formatear el valor (`moneda` → `$12.000`,
`porcentaje` → `19%`, `booleano` → `Sí`/`No`, sin tipo → texto plano). Si un
servicio nuevo audita un campo que todavía no está en ese catálogo, se
muestra el nombre de columna crudo (no rompe nada, pero conviene agregarlo
— ver [§9](#9-puntos-de-extensión)).

**Qué NO se audita** (verificado, no está en `ACCIONES` ni se llama a
`registrar()` en esos archivos): ejecutar un backup (`backupService.js`),
ejecutar `VACUUM` (`mantenimientoService.js`), la propia purga de auditoría
(`purgarAntiguos()` solo imprime en consola, a propósito — evita
recursión), y cualquier lectura (`GET`).

---

## 5. Frontend

`src/public/` — sin build step, sin framework (ver reglas técnicas en
[CONTEXTO_PROYECTO_MILAGROS.md §3](CONTEXTO_PROYECTO_MILAGROS.md) y la
skill `milagros-ui` para identidad visual). Tres archivos: `index.html`
(2559 líneas `app.js`, 1511 líneas `styles.css`, verificado con `wc -l`).

### Vistas y navegación

- **`#vista-login`**: tarjeta de login + 3 sub-vistas de recuperación de
  contraseña, todas `hidden` por defecto salvo la que corresponda:
  - `#vista-recuperar-solicitar` (paso 1: pedir código)
  - `#vista-recuperar-codigo` (paso 2: verificar código, sin consumirlo)
  - `#vista-recuperar-password` (paso 3: contraseña nueva)
  Controlado por `mostrarVistaLogin()`, `mostrarVistaRecuperarSolicitar()`,
  `mostrarVistaRecuperarCodigo()`, `mostrarVistaRecuperarPassword()`
  (togglean `.hidden`, nunca desmontan el DOM).
- **`#vista-panel`**: header (logo + nombre de usuario + botón cerrar
  sesión) + `<nav class="tabs">` con 6 pestañas, cada una un
  `<button data-tab="NOMBRE">` + un `<div id="tab-NOMBRE" class="tab-panel">`:
  `productos`, `facturas`, `clientes`, `configuracion`, `reportes`,
  `auditoria`.

`verificarSesion()` (llamada en `DOMContentLoaded`) decide login vs. panel
según si hay `token` en `localStorage` — **no** valida el token contra el
servidor en ese momento; si expiró, la primera llamada `fetch` protegida
que falle con 401 es la que lo revela (no hay un manejo centralizado de
"token expiró, volver a mostrar login" verificado en el código: cada
`fetch` maneja su propio error localmente).

El click en cada pestaña (un único listener delegado sobre todos los
`.tab-btn`) alterna `.active`/`.hidden` y además dispara la carga de datos
de esa pestaña:
| `data-tab` | Qué carga al entrar |
|---|---|
| `facturas` | `cargarProductosParaVenta()`, `cargarClientesParaVenta()`, `enfocarCodigoBarras()` |
| `configuracion` | `cargarConfiguracion()` |
| `clientes` | `cargarClientesPantalla()` |
| `auditoria` | `cargarAccionesAuditoria()`, `cargarAuditoria()` |

`productos` se carga al arrancar (`cargarPanel()` en `verificarSesion()`),
no al hacer click en su pestaña (es la pestaña activa por defecto).

### Estado en memoria (caches)

Todas se llenan con `fetch` y se filtran/renderizan **en memoria** (nunca
una petición nueva por cada tecla de búsqueda): `productosCache`,
`clientesCache`, `productosDisponibles`, `clientesDisponibles`, `carrito`,
`fichaClienteActual`, `ventasHoyCache`, `ventasHistoricoCache`,
`rankingCache`, `configuracionActual`, `usuarioActual` (solo el nombre, no
persiste en `localStorage`).

### Funciones auxiliares reutilizables

| Función | Firma | Qué hace |
|---|---|---|
| `escaparHtml` | `(valor) => string` | escapa `&<>"'` antes de interpolar con `innerHTML` — usar siempre con datos que vengan del backend |
| `formatearPesos` | `(valor) => string` | `15000 → "$15.000"` (`Number.toLocaleString('es-CO')`) |
| `formatearFecha` | `(fechaStr, {conHora=true}={}) => string` | parsea `"AAAA-MM-DD HH:MM:SS"` (UTC, como lo guarda SQLite) a mano — nunca `new Date(string)` directo, para no depender de cómo cada navegador interpreta ese formato — resta 5 horas si trae hora, y arma `"18 de agosto, 2026 · 3:45 p.m."` |
| `icono` | `(nombre, claseExtra='') => string` | arma `<svg class="icon ..."><use href="#icon-NOMBRE"></use></svg>` contra el sprite de Lucide incrustado al inicio de `index.html` |
| `mostrarMensaje` | `(elemento, texto, tipo)` | `tipo: 'exito'\|'error'\|'alerta'`; con `texto` vacío limpia el mensaje |
| `mostrarMensajeConAdvertencias` | `(elemento, texto, advertencias[])` | variante para cuando además hay advertencias no bloqueantes (ej. de `POST/PUT /productos`) — las lista con tipo `alerta` |
| `obtenerHeaders` | `() => {'Content-Type', Authorization?}` | arma los headers de cada `fetch`, agregando el Bearer solo si hay token en `localStorage` |
| `activarFallbackLogoSiHaceFalta` | `(img, reserva)` | si `uploads/logo.png` no carga (404), oculta el `<img>` y muestra el ícono de reserva — chequea `img.complete && naturalWidth===0` primero por si el error ya ocurrió antes de engancharse al listener |
| `calcularDesgloseIva` | `(total, ivaPorcentaje) => {baseGravable, ivaMonto}` | espejo exacto de `ventasService.calcularDesgloseIva` del backend — mismo redondeo, para que el total mostrado en vivo mientras se arma la venta coincida siempre con lo que el servidor confirma |
| `diasTranscurridos` | `(fechaStr) => number` | duración en días desde una fecha UTC hasta ahora, para la alerta de mora en la ficha de cliente |
| `combinarClientesYDeudas` | `(clientes[], deudores[]) => cliente[]` | hace el join en memoria entre `GET /clientes` y `GET /clientes/deudas` |

### Otros patrones repetidos en `app.js`

- **Delegación de eventos:** las tablas que se regeneran con `innerHTML`
  (inventario, carrito, ficha de cliente, listados de ventas, auditoría)
  enganchan **un solo** listener `click`/`submit`/`change` sobre el
  contenedor padre y resuelven con `e.target.closest('.clase-botón')` —
  nunca un listener por fila.
- **Formulario único crear/editar:** productos y clientes reusan el mismo
  `<form>` para alta y edición (`abrirFormProducto(producto=null)` /
  `abrirFormCliente(cliente=null)`), distinguiendo por si hay un id en un
  `<input type="hidden">`.
- **Filas inline expandibles:** "ingresar stock" (inventario) y "registrar
  abono" (ficha de cliente) no abren un modal — inyectan una fila extra
  `<tr>` justo debajo de la fila del ítem, controlada por una variable de
  estado (`productoIdStockAbierto`, `abonoVentaIdAbierto`).

---

## 6. Configuración (variables de entorno)

Fuente: `.env.example`, y el uso real de `process.env.X` en cada archivo.
`server.js` exige que el archivo `.env` exista (si no, sale con un mensaje
claro — ver `src/config/salidaFatal.js`); dentro de él, cada variable
individual se comporta distinto si falta (ver tabla).

| Variable | Formato | Obligatoria | Default | Si falta |
|---|---|---|---|---|
| `PORT` | entero | No | `3000` | usa el default (`server.js`) |
| `DB_PATH` | ruta (relativa a `process.cwd()`) | No | `./data/milagros.db` | usa el default (`db.js`); la carpeta se crea sola |
| `LOGS_PATH` | ruta | No | `./logs` | usa el default (`backupService.js`, `mantenimientoService.js`) |
| `BACKUP_PATH` | ruta (debe ser una carpeta real, ej. sincronizada por Google Drive Desktop) | **Sí, en la práctica** | *(sin default)* | el backup automático queda **desactivado por completo**: `necesitaBackupHoy()` siempre `false`, se imprime una advertencia en consola al arrancar y en cada chequeo horario; `POST /api/backup` responde `500` con `"BACKUP_PATH no está configurado en .env"` |
| `BACKUP_RETENCION_DIAS` | entero | No | `30` | usa el default (`parseInt(...) \|\| 30`) |
| `ESPACIO_MINIMO_GB` | entero | No | `1` | usa el default |
| `AUDITORIA_RETENCION_DIAS` | entero | No | `30` | usa el default |
| `SMTP_HOST` | string | Solo si se usa correo | *(sin default)* | ver abajo |
| `SMTP_PORT` | entero | No | `587` | usa el default; `secure:true` solo si es exactamente `465` |
| `SMTP_USER` | string | Solo si se usa correo | *(sin default)* | ver abajo |
| `SMTP_PASS` | string ("contraseña de aplicación", nunca la contraseña real) | Solo si se usa correo | *(sin default)* | ver abajo |
| `SMTP_FROM` | string (`"Nombre <correo>"`) | No | valor de `SMTP_USER` | usa el default |

**Si falta cualquiera de `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`:** tanto
`recuperacionService.solicitarRecuperacion()` como
`emailService.enviarFacturaPorCorreo()`/`enviarCorreo()` devuelven
`{exito:false, error:'smtp_no_configurado'}` **antes** de intentar
conectarse — nunca revientan por un error de conexión SMTP real. Las rutas
mapean eso a `503`.

**Si el archivo `.env` no existe** (verificado en `server.js`): el proceso
imprime un mensaje en español indicando la ruta exacta donde lo buscó y que
hay que copiar `.env.example`, y termina con código de salida 1. Si corre
empaquetado (`process.pkg`), además espera a que se presione una tecla
antes de cerrar la ventana de consola (para que el mensaje no desaparezca
solo). En desarrollo (`node server.js`), simplemente termina — no hay
ventana que proteger.

---

## 7. Scripts y comandos

### `package.json` → `scripts`

| Comando | Qué hace |
|---|---|
| `npm start` | `node server.js` — arranca el servidor |
| `npm test` | `node --test --test-reporter=spec ... "test/*.test.js"` — corre la suite (ver [§8](#8-suite-de-pruebas)) |
| `npm run build` | `node scripts/build.js` — genera `dist/app-milagros.exe` con `@yao-pkg/pkg` |
| `npm run crear-admin -- <usuario> <password>` | `node scripts/crear-admin.js` |
| `npm run configurar-correo -- <usuario> <correo>` | `node scripts/configurar-correo.js` |
| `npm run verificar-backup [-- <ruta-al-backup.db>]` | `node scripts/verificar-backup.js` |

(El `--` es necesario con `npm run` para que los argumentos lleguen al
script y no se interpreten como flags de `npm`.)

### `scripts/crear-admin.js`

Uso: `node scripts/crear-admin.js <usuario> <password>`.
Crea el usuario con `bcrypt.hashSync(password, 12)`. Falla (código 1) si
faltan argumentos o si el usuario ya existe. Exporta `main(args)` además de
ejecutarse solo si se invoca directo (`require.main === module`) — así el
mismo código sirve para `node scripts/crear-admin.js ...` **y** para
`app-milagros.exe crear-admin ...` (ver más abajo).

### `scripts/configurar-correo.js`

Uso: `node scripts/configurar-correo.js <usuario> <correo>`.
Asocia un correo a un usuario ya existente (para que pueda usar la
recuperación de contraseña). Valida formato de correo y que el usuario
exista. Mismo patrón `main(args)` que `crear-admin.js`.

### `scripts/verificar-backup.js`

Uso: `node scripts/verificar-backup.js [ruta-al-backup.db]`. Sin
argumento, busca el más reciente en `BACKUP_PATH` (por nombre de archivo,
patrón `*-AAAA-MM-DD.db`). Abre el archivo en modo `readonly`, corre
`PRAGMA integrity_check` y cuenta objetos en `sqlite_master`. Código de
salida 0 si el respaldo es válido, 1 si está corrupto o no se pudo abrir.

### `scripts/build.js`

No es un script de usuario final — es lo que corre `npm run build`.
Orquesta: limpia `dist/`, invoca `@yao-pkg/pkg` sobre `server.js` (target
`node22-win-x64`, con los flags `--experimental-require-module` y
`--fallback-to-source` — el porqué de cada uno está comentado en el propio
archivo), copia `better_sqlite3.node` y `prebuilds/win32-x64/bcrypt.node`
sueltos junto al `.exe` (los dos addons nativos que `pkg` no puede meter en
el snapshot), y copia `.env.example`, `iniciar.bat` y `docs/instalacion.md`
a `dist/`. Detalle completo del razonamiento de empaquetado en
`docs/requisitos_app_milagros.md` (sección "Empaquetado y despliegue") y
el procedimiento de instalación paso a paso en `docs/instalacion.md`.

### Los mismos tres comandos, sin Node instalado

El PC del cliente no tiene Node — `server.js` despacha subcomandos por el
primer argumento de línea de comandos (`process.argv[2]`), delegando al
`main(args)` de cada script de arriba:

```
app-milagros.exe crear-admin <usuario> <password>
app-milagros.exe configurar-correo <usuario> <correo>
app-milagros.exe verificar-backup [ruta-al-backup.db]
```

Sin ningún argumento, el mismo `.exe` arranca el servidor normalmente. Un
comando no reconocido termina con código 1 y un mensaje listando los tres
disponibles. Esto también funciona en desarrollo (`node server.js
crear-admin ...`), no es exclusivo del `.exe` empaquetado.

---

## 8. Suite de pruebas

52 pruebas, `node:test`, `npm test`, contra bases de datos SQLite
temporales y descartables (nunca `data/milagros.db`), SMTP siempre
mockeado. El razonamiento de por qué `node:test` (y no Jest/Vitest) y el
detalle completo de qué prueba cada archivo, con ejemplos, ya está en
[`docs/pruebas.md`](pruebas.md) — acá solo el resumen y, lo que ese
documento no trae, los huecos de cobertura.

### Qué cubre cada archivo (resumen)

| Archivo | Cubre |
|---|---|
| `test/ventas.test.js` | Cálculo exacto de venta (subtotal/descuento/IVA/total), precio detal vs. mayor, overflow numérico, ventas a crédito, descuento de stock, rechazo por stock insuficiente, `CHECK` de stock nunca negativo |
| `test/creditos.test.js` | Validación de abonos (monto > saldo, ≤0, sobre venta que no es a crédito, venta inexistente), saldo exacto tras varios abonos parciales |
| `test/auth.test.js` | Login correcto/incorrecto, mensaje genérico (no delata si el usuario existe), bloqueo a los 5 intentos (por usuario, no global), middleware `requiereSesion` (sin token, token inválido, token válido, logout invalida) |
| `test/recuperacion.test.js` | Código de un solo uso, `validarCodigo` no lo consume, expiración a los 10 min (reloj simulado), límite de 5 intentos **compartido** entre `validarCodigo` y `confirmarRecuperacion` |
| `test/integridad.test.js` | Migraciones idempotentes (arrancar dos veces no duplica columnas), backup real restaurable, purga de auditoría archiva antes de borrar, producto/cliente con historial no se puede eliminar |
| `test/reportes.test.js` | Clasificación por zona horaria (venta de las 7:30pm Colombia no cae en el día UTC), totales del reporte = suma real de las ventas, ganancia contra costo histórico (no el actual), objeto y Excel exportados nunca traen la ganancia |

### Huecos de cobertura conocidos

Esto es un análisis propio, hecho leyendo qué archivos de `test/` existen
contra qué archivos de `src/` tienen lógica — no está escrito en ningún
documento previo del proyecto:

- **Sin pruebas dedicadas de `productosService.js` ni `clientesService.js`
  como tales.** Se ejercitan indirectamente vía los *fixtures*
  (`crearProductoDePrueba`/`crearClienteDePrueba`, usados por casi todos los
  demás archivos) y `eliminarProducto`/`eliminarCliente` en
  `integridad.test.js`. Pero validaciones propias de esos servicios —
  `nombre_requerido`, `precio_invalido`, `codigo_duplicado`,
  `documento_duplicado`, `correo_invalido`, las advertencias no bloqueantes
  de `generarAdvertencias()` (coherencia de precios),
  `desactivarProducto`/`reactivarProducto`/`desactivarCliente`/`reactivarCliente`,
  `obtenerAlertasStock`, `consultarStockTiempoReal` — no tienen ninguna
  prueba automatizada propia.
- **`configuracionService.js` sin ninguna prueba** (`nombre_requerido`,
  `correo_invalido`, `iva_invalido`, ni el propio `resumirCambios` aplicado
  a configuración).
- **`emailService.js` sin prueba directa de `enviarFacturaPorCorreo` ni de
  `construirHtmlFactura`.** `recuperacion.test.js` mockea
  `emailService.enviarCorreo` (la función genérica), pero el camino de
  "enviar la factura por correo" (`POST /ventas/:id/enviar-correo`) no se
  prueba en ningún archivo.
- **`auditoriaService.js`: `resumirCambios`/`etiquetaCampo`/`formatearValorCampo`/`CAMPOS_AUDITABLES`
  sin prueba directa**, ni `listarEventos` con sus filtros de fecha/acción/usuario.
- **`mantenimientoService.js` (VACUUM mensual) sin ninguna prueba.**
- **`reportesService.productosMasVendidos` sin prueba directa**, ni los
  casos de fecha inválida en `historicoPorRango`/`historicoListado` más
  allá de lo que ya cubre `reportesRoutes` indirectamente (que tampoco se
  prueba — ver el punto siguiente).
- **Ninguna prueba pasa por la capa HTTP real** (Express/`fetch`/`supertest`
  o similar). Todas llaman directo a las funciones de `src/domain`. Esto
  significa que los mapas `ESTADO_POR_ERROR` de cada archivo de rutas, los
  mensajes de "id inválido", los códigos HTTP exactos, y el propio
  middleware `requiereSesion` **integrado** con Express (se prueba como
  función aislada en `auth.test.js`, con un `req`/`res` fabricados a mano,
  no dentro de un servidor real) no están cubiertos de punta a punta.
- **Los tres scripts de `scripts/` (`crear-admin`, `configurar-correo`,
  `verificar-backup`) no tienen pruebas automatizadas**, ni tampoco el
  despacho de subcomandos CLI de `server.js`.
- **Sin pruebas de concurrencia en la suite permanente.**
  `CONTEXTO_PROYECTO_MILAGROS.md` menciona una verificación empírica (20
  ventas simultáneas contra stock=1, 20 abonos simultáneos) — no se
  encontró un archivo de prueba que la reproduzca de forma repetible; da la
  impresión de haber sido una verificación puntual hecha aparte, no algo
  que `npm test` vuelva a confirmar en cada corrida.
- **Sin prueba automatizada de las ~4.400 combinaciones de redondeo de IVA**
  mencionadas en el mismo documento — mismo caso, verificación puntual, no
  parte de la suite repetible.
- **Frontend (`app.js`) sin cobertura automatizada** — ya documentado como
  decisión consciente (pruebas manuales en navegador), no es un hueco
  nuevo.
- **Fragilidad detectada en `test/reportes.test.js`:** dos pruebas de la
  sección "Exportación: nunca incluye la ganancia del negocio" (líneas 146
  y 163) calculan `hoy` con `new Date().toISOString().slice(0, 10)` — la
  fecha en **UTC**, no en hora de Colombia. El resto del mismo archivo (dos
  pruebas más arriba) ya usa `fechaColombia.fechaColombiaISO(...)`
  precisamente porque esta discrepancia hace fallar la prueba cuando corre
  entre las 00:00 y las 04:59 UTC (7pm–11:59pm en Colombia), momento en el
  que el día calendario colombiano todavía no alcanzó al de UTC. Esas dos
  pruebas de exportación no fueron corregidas cuando se corrigieron sus
  vecinas — quedan con el mismo riesgo de fallar intermitentemente según la
  hora en que se corra `npm test`.

---

## 9. Puntos de extensión

Los cuatro casos pedidos, con los archivos exactos a tocar y en qué orden,
siguiendo los patrones ya establecidos en el código (no un patrón nuevo).

### Agregar una tabla nueva

1. `src/config/schema.sql`: agregar el `CREATE TABLE IF NOT EXISTS`, con un
   comentario por columna explicando su significado de negocio (es el
   patrón de todo el archivo — no hace falta ningún otro lugar para
   "declarar" la tabla).
2. **No hace falta ninguna migración `ALTER TABLE`** para una tabla nueva:
   `CREATE TABLE IF NOT EXISTS` ya la crea sola en el próximo arranque,
   incluso contra una base de datos existente. Las migraciones de
   `db.js` solo son necesarias para agregar **columnas** a una tabla que
   **ya existía** (ver la lista de 6 migraciones en [§2](#2-esquema-de-base-de-datos)) —
   si el día de mañana esta tabla nueva necesita una columna más, ese es el
   momento de agregar el patrón `columnaExiste()` + `ALTER TABLE` en
   `db.js`, siguiendo exactamente el mismo formato que las 6 ya existentes.
3. Crear `src/data/xRepo.js`: solo consultas parametrizadas (`db.prepare(...).run/get/all(...)`),
   nunca concatenar SQL. Si alguna operación necesita ser atómica con más
   de un `INSERT`/`UPDATE`, usar `db.transaction(...)` (ver
   `ventasRepo.crear` o `deudasRepo.registrarAbono` como ejemplo).
4. Crear `src/domain/xService.js`: valida, llama al repo, y siempre
   devuelve `{exito:true, ...}` o `{exito:false, error:'codigo_maquina',
   mensaje:'Texto para la usuaria'}` — nunca lanza una excepción hacia
   arriba.
5. Si la operación es sensible (crea/edita/borra algo), llamar a
   `auditoriaService.registrar({...})` justo después de confirmarla en la
   BD — ver [§4](#4-catálogo-de-acciones-de-auditoría) y el punto siguiente
   para agregar el código de acción.
6. Crear `src/routes/xRoutes.js`: un `ESTADO_POR_ERROR` propio + una
   función `responderError()` (copiar el patrón de cualquiera de los 8
   archivos existentes), una ruta por operación.
7. Montar en `server.js`: `app.use('/api', requiereSesion, xRoutes)` (o
   sin `requiereSesion` solo si de verdad debe ser pública, como
   `authRoutes`).
8. Si el frontend necesita mostrarla, ver "Agregar una pantalla nueva" más
   abajo.
9. Actualizar este documento (la tabla nueva en §2, el módulo nuevo en §3,
   los endpoints nuevos en §1) y, si la tabla refleja una decisión de
   negocio nueva (no solo una implementación), también
   `CONTEXTO_PROYECTO_MILAGROS.md`.

### Agregar un endpoint nuevo sobre un recurso existente

1. Agregar la función en el service correspondiente
   (`src/domain/xService.js`) con la validación + la llamada al repo +
   auditoría si aplica.
2. Si hace falta una consulta SQL nueva, agregar la función al repo
   (`src/data/xRepo.js`).
3. Agregar la ruta en `src/routes/xRoutes.js`. Si el service devuelve un
   `error` que todavía no está en `ESTADO_POR_ERROR` de ese archivo,
   agregarlo (sin eso, cae en `400` por defecto — puede ser el código
   correcto o no, según el caso).
4. Si el frontend lo consume, agregar la llamada `fetch(...,
   {headers: obtenerHeaders()})` correspondiente en `app.js`, reusando los
   helpers de la sección 5.

### Agregar una acción de auditoría nueva

1. Agregar la constante a `ACCIONES` en `src/domain/auditoriaService.js`
   (mismo patrón `snake_case`, dentro del `Object.freeze`).
2. Llamar a `auditoriaService.registrar({usuario, accion: ACCIONES.NUEVA,
   entidad, entidadId, detalle, ip?})` inmediatamente después de que la
   operación real ya se confirmó en la base de datos — nunca antes (si la
   operación falla después de auditar, quedaría un evento de algo que no
   pasó).
3. Si el evento es una edición (antes/después), usar
   `auditoriaService.resumirCambios(antes, despues, ['campo1','campo2'])`
   para el `detalle`. Si alguno de esos campos todavía no está en
   `CAMPOS_AUDITABLES` (mismo archivo), agregarlo con su `etiqueta` en
   español y, si es dinero/porcentaje/booleano, su `tipo` — si no se
   agrega, igual funciona pero muestra el nombre de columna crudo en vez de
   la etiqueta legible.
4. Agregar la traducción en `ETIQUETA_ACCION` (`src/public/app.js`) para
   que la pantalla de Auditoría la muestre en español — si no se agrega,
   se ve el código interno tal cual (no rompe nada, pero no es el
   estándar del resto de la pantalla).
5. No hace falta ninguna migración de esquema — `accion` es `TEXT` libre en
   la tabla `auditoria`.

### Agregar una pantalla nueva

1. Leer la skill `milagros-ui` antes de escribir HTML/CSS/JS (paleta,
   iconos permitidos, reglas de escritura para la usuaria no técnica).
2. En `index.html`: agregar el botón de pestaña dentro de `<nav
   class="tabs">` (mismo patrón `<button data-tab="nombre">...</button>`,
   con su ícono) y el contenedor `<div id="tab-nombre" class="tab-panel
   hidden">...</div>` con el contenido.
3. Si hace falta un ícono que no está en el sprite: agregar un
   `<symbol id="icon-X">` nuevo dentro del `<svg style="display:none">` al
   principio de `index.html` (mismo criterio que los ~25 ya incrustados —
   Lucide, monocromático, sin cargar nada por CDN).
4. En `app.js`: el listener de clic en pestañas ya está delegado sobre
   todos los `.tab-btn` — solo hace falta agregar un `if (boton.dataset.tab
   === 'nombre') { cargarNombrePantalla(); }` al bloque existente, para que
   la pestaña cargue sus datos al entrar.
5. Reusar los helpers de la sección 5 (`escaparHtml`, `formatearPesos`,
   `formatearFecha`, `mostrarMensaje`, `icono`, `obtenerHeaders`) — no crear
   versiones nuevas de ninguno.
6. Si la pantalla necesita datos del backend que todavía no existen, seguir
   primero "Agregar un endpoint nuevo" (o "Agregar una tabla nueva" si es
   un recurso enteramente distinto).

---

## Sorpresas / discrepancias encontradas con `CONTEXTO_PROYECTO_MILAGROS.md`

(Resumen — el detalle completo de cada una está en la sección
correspondiente arriba.)

1. **`POST /backup` ya no vive fuera de `/api`.** Tanto `CLAUDE.md` como el
   contexto histórico de este proyecto describen esa ruta como una
   inconsistencia pendiente ("montada en la raíz sin el prefijo"). Leyendo
   `server.js` y `backupRoutes.js` tal como están hoy, eso ya se corrigió:
   es `POST /api/backup`, montada con `requiereSesion` igual que el resto.
   Vale la pena que alguien actualice `CLAUDE.md` para que dejar de
   mencionar esa inconsistencia como pendiente.
2. **Dos pruebas de `reportes.test.js` calculan "hoy" en UTC en vez de en
   hora de Colombia** (líneas 146 y 163), el mismo bug que ya se corrigió en
   otras dos pruebas del mismo archivo (visible en el propio comentario que
   dejaron al corregirlas). Quedan con riesgo de fallar intermitentemente
   según la hora exacta en que se corra `npm test` (ventana de 00:00 a 04:59
   UTC). No estaba documentado como hueco conocido en ningún lado.
3. **`productosService.js` y `clientesService.js` no tienen archivo de
   prueba propio.** `CONTEXTO_PROYECTO_MILAGROS.md §11` resume la
   cobertura de la suite (cálculo de ventas, precios, crédito, stock,
   abonos, login, recuperación, migraciones, backup, zona horaria,
   reportes) y en ningún lado dice explícitamente qué NO cubre — al leer
   `test/` contra `src/domain/` completo, la ausencia de pruebas directas
   para la validación de productos/clientes (nombre requerido, precio
   inválido, código/documento duplicado, advertencias de coherencia de
   precios) es más grande de lo que el resumen sugiere a primera vista.
4. **La verificación de concurrencia (20 ventas/abonos simultáneos) y la de
   ~4.400 combinaciones de redondeo de IVA, mencionadas en
   `CONTEXTO_PROYECTO_MILAGROS.md §12`, no están codificadas como pruebas
   repetibles en `test/`.** Da la impresión de haber sido scripts o
   sesiones puntuales de verificación, no algo que `npm test` vuelva a
   confirmar en cada corrida — si algún cambio futuro rompe esa garantía de
   concurrencia, la suite actual no lo detectaría.
5. **Los índices de la base de datos son más escasos de lo que uno
   esperaría para un sistema con reportes por fecha.** Solo `auditoria`
   tiene índices explícitos (`creado_en`, `accion`). Ninguna de las
   columnas de fecha (`ventas.creado_en`, `abonos.creado_en`) ni las claves
   foráneas más consultadas (`ventas.cliente_id`, `venta_items.venta_id`,
   `venta_items.producto_id`) tienen índice propio — hoy no es un problema
   (volumen de una tienda local), pero no estaba mencionado en ningún
   documento existente como algo a vigilar si el volumen de datos crece.
