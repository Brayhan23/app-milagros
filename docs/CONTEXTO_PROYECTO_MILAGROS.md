# App Milagros — Documento maestro del proyecto

> **Propósito de este documento:** contexto completo del sistema para retomar el
> trabajo en cualquier momento, con cualquier asistente de IA o desarrollador,
> sin depender del historial de conversaciones previas. Contiene decisiones de
> arquitectura, lecciones aprendidas, errores cometidos y todo lo que se necesita
> saber antes de tocar una línea de código.
>
> Última actualización: entrega inicial al cliente, agosto 2026.

---

## 1. Qué es este proyecto

Sistema de punto de venta e inventario para **Milagros**, marca de productos
capilares, operado por **Distribuidora Oficial San Roque** (Antioquia, Colombia).

Es una aplicación **local-first**: corre como servidor en el PC de la tienda y se
usa desde el navegador en `http://localhost:3000`. No hay nube, no hay backend
remoto, no requiere internet para vender.

**Contexto comercial:** primer proyecto freelance cobrado del desarrollador. El
cliente es un familiar, pero el software se construyó con estándares de producto
comercial con la intención de venderlo a otros negocios después.

### Usuaria final

Una sola persona, en el mostrador, **no técnica**. No sabe qué es una API, un
endpoint ni un ID. Cada pantalla debe usarse sin entrenamiento y sin miedo a
"romper algo". Este criterio manda sobre cualquier elegancia técnica.

---

## 2. Hardware de destino

PC del cliente (HP 15-DA2000):

| Componente | Especificación |
|---|---|
| Procesador | Intel Pentium 6405U @ 2.40GHz (gama baja, sin turbo) |
| RAM | 4.00 GB (3.81 GB utilizable) |
| Gráficos | Intel UHD integrada, 128MB |
| Almacenamiento | 119 GB (~48 GB libres al momento de la entrega) |
| Sistema | Windows 11, 64 bits |
| Sin Node.js instalado | El ejecutable trae su propio runtime |

**Periféricos:**
- Escáner de código de barras **Jaltech POS, omnidireccional, USB**. Actúa como
  teclado: escribe el código y envía Enter automáticamente. No requiere driver.
- Impresora térmica **Jaltech POS-80**, papel de 80mm (área imprimible real ~72mm).

Este hardware limitado **condiciona todas las decisiones técnicas**. Cualquier
propuesta futura debe pasar el filtro de "¿corre bien en 4GB de RAM?".

---

## 3. Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | Node.js + Express 5 | Ligero, gran soporte, fácil de mantener en solitario |
| Base de datos | SQLite vía `better-sqlite3` | Embebida, sin proceso servidor aparte, un solo archivo |
| Frontend | HTML/CSS/JS puro | Sin build step, sin frameworks, sin CDN |
| Hash de contraseñas | `bcrypt` (costo 12) | Estándar, resistente a ataques offline |
| Correo | `nodemailer` + Gmail SMTP | Suficiente para facturas por correo |
| Excel | `exceljs` | 100% JS, sin binarios nativos, buena API de estilos |
| PDF | `pdfkit` | Liviano, no requiere navegador headless |
| Pruebas | `node:test` nativo | Cero dependencias nuevas, viene con Node 18+ |
| Empaquetado | `@yao-pkg/pkg` | El `pkg` original está sin mantenimiento desde 2023 |

**Node.js requerido:** >= 22 (declarado en `engines` de `package.json` y `.nvmrc`).

### Decisiones descartadas y por qué

- **Electron:** consume 150-300MB extra solo de motor. Inviable con 4GB de RAM.
- **Docker:** en Windows usa WSL2 (virtualización). Peor rendimiento, no mejor.
- **Puppeteer/Playwright para PDF:** arrastran Chromium completo. Inviable.
- **Cloud/SaaS:** el negocio debe poder vender sin internet. No negociable.
- **Frameworks frontend (React/Vue/Tailwind):** build step innecesario, peso extra.

---

## 4. Arquitectura

### Estructura de carpetas

```
app-milagros/
├── server.js                 Punto de entrada, monta rutas y middlewares
├── package.json
├── .env                      NUNCA se commitea
├── .env.example              Plantilla con placeholders
├── .nvmrc
├── CLAUDE.md                 Contexto para asistentes de IA
├── .claude/
│   ├── settings.json         Permisos de Claude Code
│   └── skills/milagros-ui/   Skill de identidad visual
├── docs/
│   ├── requisitos_app_milagros.md
│   └── pruebas.md
├── scripts/
│   ├── crear-admin.js
│   ├── configurar-correo.js
│   └── verificar-backup.js
├── test/                     52 pruebas con node:test
└── src/
    ├── config/schema.sql     Esquema completo, idempotente
    ├── data/                 Repositorios (acceso SQLite)
    ├── domain/               Lógica de negocio pura
    ├── routes/               Rutas HTTP
    │   └── middlewares/
    └── public/               Frontend (index.html, app.js, styles.css)
        └── uploads/          Logo (contenido de runtime, gitignored)
```

### Arquitectura en capas

- **`src/domain`** — lógica de negocio pura. No conoce HTTP ni SQL directo.
- **`src/data`** — repositorios. Único lugar donde se escriben consultas SQL.
- **`src/routes`** — traducción HTTP ↔ dominio. Mapea errores a códigos de estado.
- **`src/public`** — frontend, consume la API con `fetch`.

**Regla:** una ruta nunca habla directo con un repositorio, siempre pasa por el
servicio de dominio.

### Patrón de retorno universal

Todos los servicios de dominio devuelven la misma forma, **nunca lanzan excepciones**:

```js
// Éxito
{ exito: true, producto: {...}, advertencias: [] }

// Error
{ exito: false, error: 'codigo_maquina', mensaje: 'Texto para la usuaria' }
```

Las rutas mapean `error` a códigos HTTP con un objeto `ESTADO_POR_ERROR`.

**Respétalo siempre.** Es lo que hace predecible todo el sistema.

---

## 5. Modelo de datos

### Tablas

| Tabla | Propósito |
|---|---|
| `usuarios` | Autenticación. Un solo rol "general" |
| `productos` | Inventario, precios, stock |
| `ventas` | Cabecera de venta |
| `venta_items` | Líneas de cada venta, con precios históricos |
| `clientes` | Clientes, mayoristas o no |
| `abonos` | Pagos parciales sobre ventas a crédito |
| `configuracion_empresa` | Fila única (`CHECK id = 1`) con datos del negocio |
| `auditoria` | Registro de acciones sensibles |
| `auditoria_archivo` | Destino de la purga de auditoría (no se borra nunca) |

### Decisiones críticas del esquema

**Todo el dinero se guarda como `INTEGER`, nunca `REAL`.**
SQLite no tiene tipo decimal. El punto flotante binario arrastra errores de
redondeo (`0.1 + 0.2 !== 0.3`), inaceptables con plata. El peso colombiano no
circula en fracciones, así que un entero de pesos completos es exacto. Si algún
día se necesitaran centavos, la migración sería a "centavos como entero" (×100),
**nunca** a `REAL`/`DECIMAL`.

**`venta_items` guarda `precio_unitario` Y `precio_compra_unitario`.**
Ambos son "foto" del momento de la venta. Sin el precio de compra histórico, la
ganancia de reportes viejos cambiaría sola cada vez que se actualiza el costo de
un producto. Las ventas anteriores a esta corrección tienen `NULL` y se aproximan
con el costo actual, marcándolas con `gananciaAproximada: true`.

**`ventas.iva_porcentaje` también es foto histórica**, mismo criterio.

**`codigo_barras` es `TEXT UNIQUE` nullable.**
SQLite trata cada `NULL` como distinto, así que varios productos sin código
conviven sin chocar, y la unicidad solo aplica a los códigos presentes.

**`activo` en productos y clientes: se desactiva, no se borra.**
El historial de ventas los referencia. Ver sección 7 sobre borrado.

**La deuda NO es una tabla.**
Una venta a crédito **es** la deuda. Modelarla aparte solo duplicaría `venta_id`
sin agregar información, y complicaría la atomicidad. El saldo siempre se calcula
como `ventas.total - SUM(abonos.monto)`, nunca se guarda cacheado — así es
matemáticamente imposible que el saldo mostrado mienta.

**Los abonos se aplican a UNA venta puntual**, no a un saldo general del cliente.
Preserva la trazabilidad de "¿este pago fue por cuál compra?".

### Migraciones

`schema.sql` usa `CREATE TABLE IF NOT EXISTS` y se ejecuta **en cada arranque**.
Es idempotente: no toca lo existente, crea lo que falte.

Para columnas nuevas en tablas existentes, `db.js` usa `ALTER TABLE` protegido
por `PRAGMA table_info` (SQLite falla con "duplicate column name" si se corre dos
veces). Ejemplos: `ventas.cliente_id`, `venta_items.precio_compra_unitario`,
`usuarios.correo`, `ventas.iva_porcentaje`.

**Al agregar una columna nueva, sigue exactamente este patrón.**

---

## 6. Funcionalidades implementadas

### Autenticación y sesiones
- Login con usuario/contraseña, hash bcrypt costo 12
- Bloqueo tras 5 intentos fallidos por usuario, 5 minutos
- Token de sesión: `crypto.randomUUID()` en un `Map` en memoria, expira a 12h
- Middleware `requiereSesion` protege todas las rutas bajo `/api` excepto login
  y los dos pasos de recuperación
- Logout invalida el token del lado del servidor
- Recuperación de contraseña por código numérico de 6 dígitos enviado por correo
  (no enlace: la app corre en localhost y un link no abriría desde el celular),
  válido 10 minutos, un solo uso, 5 intentos máximo

### Productos e inventario
- CRUD completo con código de barras
- Registro de entrada de stock
- Alertas de stock bajo configurables por producto
- Desactivar/reactivar (soft delete)
- Eliminar permanente **solo si nunca se usó** (sin ventas asociadas y stock 0)
- Advertencias no bloqueantes de coherencia de precios

### Ventas
- Escaneo de código de barras con foco automático, producto entra directo
- Búsqueda por nombre como respaldo
- Cantidad ajustable en la línea, escaneo repetido incrementa en vez de duplicar
- Precio detal vs mayorista según tipo de cliente
- Descuento en pesos, validado contra el subtotal
- Métodos de pago: efectivo, transferencia, crédito
- Factura imprimible (térmica) y envío por correo
- IVA incluido en el precio, desglosado en la factura

### Clientes y créditos
- CRUD de clientes, marcables como mayoristas
- Ventas a crédito **obligan** a asociar cliente (validado en `ventasService`)
- Abonos parciales, validados contra el saldo
- Listado de deudores con saldo y antigüedad
- Alerta de mora a los 30 días
- Ficha unificada: datos, facturas, saldos y abonos en una sola pantalla

### Reportes
- Ventas y ganancia del día
- Histórico por rango de fechas
- Productos más vendidos
- IVA recaudado
- Exportación a Excel y PDF
- **La ganancia NUNCA sale en los archivos exportados** (ver sección 7)

### Configuración
- Datos de la empresa (nombre, NIT, dirección, teléfono, correo, logo)
- Porcentaje de IVA general

### Auditoría
- Registra: login exitoso/fallido, logout, ventas, abonos, CRUD de productos y
  clientes, cambios de configuración, envío de facturas, recuperación de contraseña
- Nunca guarda contraseñas ni tokens
- Purga automática a los 30 días, **archivando** en `auditoria_archivo` antes de
  borrar (un log que se auto-destruye es peor que no tener log)
- Textos legibles: `Precio al detal: $12.000 -> $13.000`, no `precio_detal: 12000`

### Infraestructura
- Backup automático diario con `db.backup()` nativo de SQLite (no copia de archivo)
- Rotación configurable, por defecto 30 copias
- Destino: carpeta local sincronizada por Google Drive Desktop (no la API)
- `VACUUM` mensual automático
- Monitoreo de espacio en disco con advertencia bajo umbral
- Script de verificación de integridad de backups

---

## 7. Reglas no negociables

Estas reglas se establecieron por razones concretas. **No las cambies sin entender
por qué existen.**

### 1. Sin facturación electrónica DIAN
Fuera de alcance por decisión explícita del proyecto. **Debe quedar por escrito en
el contrato con cualquier cliente.** En Colombia, la facturación electrónica es
obligatoria para muchos negocios según ingresos y actividad. Un PDF enviado por
correo **no sustituye** una factura electrónica válida. Si un cliente futuro la
necesita, es una integración con proveedor autorizado (Factus, Alegra, Siigo),
no algo que se resuelve internamente.

### 2. La ganancia nunca sale en archivos exportados
Los reportes exportados van al contador o a terceros. La ganancia revela los
márgenes del negocio. `exportacionService.js` construye un objeto intermedio con
**allow-list explícita** de campos permitidos, para que agregar un campo nuevo al
reporte interno no lo cuele automáticamente al exportado.

### 3. Dinero siempre como `INTEGER`
Ver sección 5.

### 4. Consultas SQL siempre parametrizadas
Nunca concatenar. Verificado en auditoría: cero inyecciones en las 9 tablas.

### 5. El servidor escucha solo en `127.0.0.1`
`app.listen(PORT, '127.0.0.1', ...)`. Sin esto, Node escucha en `0.0.0.0` y
cualquier dispositivo de la WiFi de la tienda alcanza la API sin autenticación
de red ni HTTPS. Fue un hallazgo real de auditoría.

### 6. Escapar HTML de la base de datos
Existe `escaparHtml`, usarla siempre al interpolar datos de la BD en HTML
(frontend y correos).

### 7. Rutas de escritura con `process.cwd()`, no `__dirname`
Dentro de un snapshot de `pkg`, `__dirname` apunta a una ruta de solo lectura y
la escritura falla en silencio. Aplica a `data/`, `logs/`, `uploads/`.

### 8. Borrar solo si nunca se usó
Un producto con ventas o un cliente con facturas **no se elimina**, se desactiva.
Borrarlos rompería el historial, los reportes y el cálculo de ganancia.
**Regla general: si un registro está referenciado por algo que ya pasó (una venta,
un pago), no se borra.**

### 9. La app debe funcionar sin internet
Sin CDN, sin fuentes externas, sin dependencias remotas en runtime. Solo el envío
de correo y la sincronización de Drive requieren conexión, y su fallo no bloquea
las ventas.

### 10. El backup nunca debe fallar en silencio
Si `BACKUP_PATH` no está configurado, se advierte al arrancar y en cada chequeo.

---

## 8. Identidad visual

### Paleta

```css
--rosa: #C2185B;        /* Principal: títulos, botón primario, pestaña activa */
--rosa-claro: #FDF2F5;  /* Fondo general */
--lila: #DAC9DF;        /* Acento: bordes, hover, badges neutros */
--verde-menta: #D0FDD7; /* Acento: éxito, estados positivos */
```

**Regla crítica aprendida a golpes:** el rosa es el **único** color dominante.
Lila y verde menta juntos no deben superar ~5% del área de pantalla. Son acentos,
nunca superficies.

En un intento inicial se usó el lila como fondo de paneles completos y el
resultado fue visualmente malo: lila y rosa son tonos cercanos con distinta
saturación, y en bloques grandes compiten en vez de complementarse.

### Otras reglas

- **Sin emojis.** Iconos SVG de Lucide, incrustados localmente, monocromáticos.
- Encabezado con logo (~48px) y "Distribuidora Oficial San Roque, Antioquia".
- Nunca mostrar códigos de historia ("HU-02") ni términos técnicos en pantalla.
- Montos como `$15.000`, fechas como `18 de agosto, 2026`.
- Tipografía `system-ui`, jerarquía por tamaño y peso.
- Espaciado en múltiplos de 8px, tarjetas blancas con `border-radius: 12px`.
- Animaciones de 150-200ms, respetando `prefers-reduced-motion`.

La skill `.claude/skills/milagros-ui/SKILL.md` contiene el detalle completo.

---

## 9. Zona horaria

**Colombia es UTC-5.** SQLite guarda con `datetime('now')`, que es UTC.

- En SQL: `date(columna, '-5 hours')` para filtrar y agrupar por día
- En JS: función auxiliar única (`fechaColombia.js` en backend, `formatearFecha`
  en frontend)

**Caso borde crítico:** una venta a las 8 p.m. hora Colombia se guarda como la 1
a.m. UTC del día siguiente. Sin el ajuste, aparece en el reporte del día
equivocado — error contable real, no cosmético. Este bug existió y fue corregido.

**Excepción:** para calcular *duraciones* (ej. días de antigüedad de una deuda) no
se ajusta, porque el desplazamiento se cancela entre ambos extremos de la resta.

---

## 10. Impresión térmica

Las térmicas **queman el papel**, no imprimen tinta. Solo hay dos estados. Cualquier
gris se convierte en punteado disperso ilegible.

Reglas del `@media print`:
- Todo el texto en `#000000`, sin grises, sin `opacity`
- Peso mínimo 600 para datos importantes, 500 para el resto
- Nada por debajo de 11px
- Colores de marca no aparecen en la impresión
- `@page` con ancho de 80mm, contenido ajustado a ~72mm (área imprimible real)
- Encabezados de tabla abreviados ("CANT", "PRECIO") para que quepan en una línea

**Configuración manual en Chrome del PC del cliente** (se hace una vez por impresora):
- Desmarcar "Encabezados y pies de página" en Más ajustes
- Márgenes: "Ninguno"
- Escala: 100%

Si sale claro, subir la densidad desde el driver de Windows (Preferencias →
"Density" o "Darkness").

---

## 11. Pruebas

52 pruebas con `node:test`, ejecutables con `npm test`, ~2 segundos.

Cubren: cálculo de ventas (subtotal, descuento, IVA, total), precios detal/mayor,
overflow, ventas a crédito sin cliente, stock, abonos, ganancia histórica, login
y bloqueo, rutas protegidas, logout, recuperación de contraseña, migraciones
idempotentes, backup restaurable, purga con archivado, borrado con historial,
zona horaria, reportes y exportación sin ganancia.

Cada prueba corre contra una base SQLite temporal descartable, nunca contra
`data/milagros.db`. SMTP siempre mockeado.

**Regla:** si una prueba falla, investiga si el bug es real. **Nunca ajustes el
código de producción para que una prueba pase.**

---

## 12. Auditoría de seguridad realizada

Se hicieron 8 pasadas completas. Resumen de hallazgos y correcciones:

| Pasada | Hallazgos corregidos |
|---|---|
| 1. Auth y sesiones | Bind a localhost, logout server-side, timing leaks en login y recuperación, bcrypt 10→12 |
| 2. SQL y validación | Cota `Number.isSafeInteger`, middleware de errores global, escape de HTML |
| 3. Secretos | Advertencia cuando falta `BACKUP_PATH` (fallaba en silencio) |
| 4. Autorización | Auditoría faltante en desactivar cliente y enviar factura |
| 5. Lógica financiera | Transacciones explícitas en ventas/abonos, defensa en saldo, overflow en cálculos |
| 6. Dependencias | `engines` y `.nvmrc` declarados |
| 7. Infraestructura | Simulacro de restauración, `VACUUM` mensual, monitoreo de disco |
| 8. Empaquetado | Rutas `pkg`-compatibles, checklist actualizado |

**Sin hallazgos críticos abiertos al momento de la entrega.**

### Verificado empíricamente
- Concurrencia: 20 requests simultáneos de venta con stock=1 → exactamente 1
  exitosa, stock nunca negativo
- Concurrencia: 20 abonos simultáneos sobre deuda de $10.000 → exactamente 10
  exitosos, saldo final exacto $0
- Redondeo de IVA: ~4.400 combinaciones probadas, cero discrepancias entre la
  implementación JS y la SQL

---

## 13. Limitaciones conocidas

**Un solo rol de usuario.** No hay concepto de pertenencia. Las 11 rutas con `:id`
no verifican a quién corresponde el registro, porque no hay nada contra qué
comparar.

**Ventas y abonos no guardan quién los hizo.** Solo queda en `auditoria`, que se
purga a los 30 días (aunque se archiva). Si algún día se necesita soporte
multiusuario con visibilidad restringida, hace falta una migración de esquema, y
**esa información histórica no se puede reconstruir** para ventas ya guardadas.

**Sesiones en memoria.** Un reinicio del servidor desloguea a todos. Aceptable
para un PC de una tienda.

**Sin límite de tasa por IP.** Solo hay bloqueo por usuario. Impacto bajo sin
auto-registro y con la app en localhost.

**Sin HTTPS.** Innecesario en localhost, pero relevante si algún día se expone.

**El logo no está en el backup.** Vive en `uploads/`, fuera de la BD y de Drive.
Guardar una copia aparte.

**Vulnerabilidad conocida no explotable:** `uuid` vía `exceljs` (GHSA-w5hq-g745-h8pq).
Afecta `v3/v5/v6` con buffer propio; `exceljs` solo usa `v4()` sin argumentos, y
en un módulo (formato condicional) que este proyecto nunca ejercita. Arreglarla
con `--force` degradaría `exceljs` a una versión mayor anterior. No tocar.

**`better-sqlite3` desactualizada** (11.10.0 vs 13.x). Sin CVE conocido. La v13
exige Node >= 22. Actualizar como tarea propia, con pruebas completas después.

---

## 14. Despliegue

### Estructura en el PC del cliente

```
C:\AppMilagros\
├── app-milagros.exe          Reemplazable en actualizaciones
├── better_sqlite3.node       Addon nativo, va suelto
├── prebuilds\win32-x64\bcrypt.node
├── iniciar.bat
├── .env                      NO tocar al actualizar
├── data\milagros.db          NO tocar al actualizar
├── logs\                     NO tocar al actualizar
└── uploads\logo.png          NO tocar al actualizar
```

**Al actualizar: reemplazar solo el `.exe` y los `.node`. Nunca `.env`, `data/`,
`logs/` ni `uploads/`.**

### Procedimiento de instalación

1. Instalar Google Drive Desktop, cuenta del negocio conectada
2. Crear `C:\AppMilagros\` y copiar el contenido de `dist\`
3. Copiar `.env.example` a `.env` y completar `BACKUP_PATH` (carpeta de Drive) y
   credenciales SMTP (contraseña de aplicación de Gmail, no la normal)
4. Abrir consola en la carpeta y ejecutar (nota el `.\`):
   ```
   .\app-milagros.exe crear-admin <usuario> <contraseña>
   .\app-milagros.exe configurar-correo <usuario> <correo>
   ```
5. Copiar el logo a `uploads\logo.png`
6. Doble clic en el `.exe`. **Windows SmartScreen va a bloquearlo** → "Más
   información" → "Ejecutar de todas formas". Solo la primera vez.
7. Entrar a `http://localhost:3000`, iniciar sesión
8. Completar Configuración: datos de empresa, ruta del logo (`uploads/logo.png`),
   **IVA confirmado con el cliente**
9. Configurar Chrome para impresión térmica (ver sección 10)
10. Acceso directo de `iniciar.bat` en `shell:startup`

### Verificación final

- [ ] Login funciona
- [ ] Backup llega a Drive **y aparece en drive.google.com**
- [ ] Desde otro dispositivo de la WiFi, `http://<IP>:3000` **no** carga
- [ ] Factura imprime legible en la térmica
- [ ] Escáner agrega productos a la venta
- [ ] Reinicio completo: la app arranca sola
- [ ] Datos de prueba borrados
- [ ] Exportación a Excel y PDF funciona

---

## 15. Flujo de trabajo de desarrollo

### Git

- `main` — versiones estables entregadas
- `develop` — integración
- `feature/nombre-descriptivo` — una por tarea

Nunca push directo a `main`. PR hacia `develop`, revisión, merge.
Commits en español: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.

**Error cometido en este proyecto:** un PR se mergeó accidentalmente a `main` en
vez de `develop`. Al crear un PR, verificar siempre el desplegable de "base".

**Otro error:** trabajo de dos historias distintas terminó mezclado en la misma
rama sin commitear. Se resolvió con `git add -p` para separar por fragmentos.
**Lección: commitear cada historia apenas termina, no acumular.**

### Con asistentes de IA

Prompt template que funcionó bien:

```
Lee CLAUDE.md y docs/requisitos_app_milagros.md antes de empezar.
[Si es frontend: lee también la skill milagros-ui]

[Qué construir, con criterios concretos]

Restricciones:
[Qué NO tocar]

Al terminar muéstrame:
- Diff completo
- Cómo lo probaste

No hagas commit todavía, espera mi aprobación.
```

**Claves que dieron buen resultado:**
- Pedir la justificación de diseño **antes** del código en tareas complejas
- Exigir pruebas contra datos reales, no mocks, cuando sea posible
- "No ajustes el código para que una prueba pase"
- Revisar el diff manualmente antes de aprobar
- Probar en el navegador después de cada tarea

Permisos sugeridos (`.claude/settings.json`): edición automática de archivos,
confirmación manual para `git push`, `merge` y `rm`, denegado leer `.env` y `*.db`.

---

## 16. Lecciones aprendidas

**Manual review atrapa lo que la automatización no.** Casi todos los problemas de
diseño visual, legibilidad de impresión y flujo de uso salieron de probar a mano,
no de las pruebas automatizadas.

**Los bugs más caros son los silenciosos.** El backup que no corre sin avisar, la
escritura que falla dentro de `pkg`, la hora desplazada 5 horas. Ninguno lanza un
error; todos causan daño real.

**Pedir justificación antes de implementar mejora el resultado.** Cuando se pidió
"explícame tu decisión antes del diff", las decisiones fueron notablemente mejores.

**La solución simple suele ganar.** Se perdió tiempo optimizando anchos de columna
cuando la respuesta era cambiar "CANTIDAD" por "CANT".

**Probar en una máquina limpia es indispensable.** El PC de desarrollo esconde
dependencias instaladas, rutas asumidas y permisos.

**Empezar simple y extender.** Un IVA general, no por producto. Un rol, no varios.
Se puede extender si el negocio lo pide; sobre-diseñar por adelantado cuesta y
casi nunca acierta.

---

## 17. Hoja de ruta

### Pendientes conocidos
- Manual de usuario con capturas
- Instalador con Inno Setup (hoy la instalación es manual)
- Actualizar `better-sqlite3` a v13
- Límite de tasa por IP
- Subida de logo por formulario (hoy es copiar el archivo a mano)

### Para vender a otros clientes
- Facturación electrónica DIAN (integración con proveedor autorizado) — es lo que
  más sube el valor percibido
- Parametrizar identidad visual (colores, logo, nombre) para no tocar código por cliente
- Soporte multiusuario con roles (requiere migración, ver sección 13)
- IVA por producto (hoy es general)
- Script de instalación automatizado

### Referencia comercial
Mercado colombiano 2026: sistemas a medida de esta categoría entre $8M y $80M COP.
Alternativas SaaS que compiten: Loggro desde ~$109.000/mes, Siigo con POS desde
~$25.000/mes adicionales. El argumento de venta es pago único + software propio +
funciona sin internet, versus suscripción indefinida.

---

## 18. Referencia rápida

### Comandos

```bash
npm start                    # Servidor en desarrollo
npm test                     # 52 pruebas
npm run build                # Genera el ejecutable
npm run crear-admin -- <usuario> <contraseña>
npm run configurar-correo -- <usuario> <correo>
npm run verificar-backup     # Valida el último backup
```

En el PC del cliente (PowerShell, nota el `.\`):
```powershell
.\app-milagros.exe crear-admin <usuario> <contraseña>
.\app-milagros.exe configurar-correo <usuario> <correo>
```

### Variables de entorno

```
PORT=3000
DB_PATH=./data/milagros.db
LOGS_PATH=./logs
BACKUP_PATH=<carpeta sincronizada por Google Drive Desktop>
BACKUP_RETENCION_DIAS=30
AUDITORIA_RETENCION_DIAS=30
ESPACIO_MINIMO_GB=1
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<correo del negocio>
SMTP_PASS=<contraseña de aplicación de 16 caracteres>
SMTP_FROM="Milagros <correo del negocio>"
```

### Restaurar un backup

1. Cerrar la app completamente
2. Guardar aparte el `milagros.db` actual "por las dudas"
3. Copiar el backup elegido sobre `data\milagros.db`
4. Borrar archivos `-wal` y `-shm` viejos si existen
5. Arrancar y verificar: login, productos, ventas, deudas

Procedimiento completo en `docs/requisitos_app_milagros.md`.
