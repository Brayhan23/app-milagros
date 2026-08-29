# Pruebas automatizadas — App Milagros

## Cómo correrlas

```
npm test
```

Un solo comando, sin nada que instalar antes: el corredor de pruebas es
`node:test`, incluido en Node.js desde la versión 18 (el proyecto ya exige
Node 22+ en `package.json`). No agrega ninguna dependencia nueva al
proyecto.

Al terminar, la consola muestra un resumen como este:

```
ℹ tests 52
ℹ suites 19
ℹ pass 52
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2382.3209
```

Si algo falla, aparece además una sección `✖ failing tests:` con el nombre
exacto de cada prueba que falló, en qué archivo y línea, y qué esperaba
contra qué recibió — alcanza con leer eso para saber qué se rompió, sin
tener que entender el corredor de pruebas.

## Por qué `node:test` y no Jest/Vitest

El proyecto hoy no tiene ninguna dependencia de desarrollo (`devDependencies`
está vacío) y corre en un PC de gama baja en la tienda. Tres razones
concretas para no sumar un framework de testing externo:

1. **Cero instalación.** `node:test` viene incluido en el propio Node.js.
   Jest o Vitest agregarían decenas de paquetes a `node_modules` (con su
   propio motor de transformación de código, en el caso de Vitest) solo
   para correr pruebas — peso y complejidad que no le aportan nada a la
   usuaria final ni al negocio, y si sus versiones quedan viejas hay que
   mantenerlas al día por separado del resto del proyecto.
2. **Mismo criterio que ya usa el resto del proyecto.** El frontend es HTML/
   CSS/JS sin build step ni framework, a propósito (ver CLAUDE.md). Elegir
   un framework de testing pesado hubiera sido inconsistente con esa
   decisión ya tomada — la simplicidad no es solo del código de producción.
3. **`node:test` alcanza y sobra para lo que hace falta acá:** trae
   `describe`/`test` para organizar, mocks nativos (`t.mock.method`) para
   nunca tocar SMTP real al probar la recuperación de contraseña, y un
   reloj simulado (`t.mock.timers`) para probar que un código vence a los
   10 minutos sin que la prueba tarde 10 minutos de verdad. No hace falta
   `sinon` ni ninguna librería de mocks aparte.

La única "dependencia" que se usó y que no es `node:test` en sí es
`exceljs`, que **ya era una dependencia de producción** (la usa
`exportacionService.js` para generar el Excel real) — se reutiliza en una
prueba para abrir el Excel generado de verdad y confirmar que ninguna celda
tiene la ganancia del negocio. No se agregó nada nuevo al `package.json`
para eso.

## Contra qué corren

**Nunca contra `data/milagros.db`.** Cada archivo de prueba crea su propia
base de datos SQLite temporal y descartable, en una carpeta del sistema
operativo (`os.tmpdir()`), justo antes de cargar cualquier código de la
aplicación — así el mismo `schema.sql` y las mismas migraciones que usa la
app real se ejecutan también en cada corrida de pruebas. Al terminar cada
archivo, se cierra la conexión y se borra la carpeta entera (verificado:
correr la suite varias veces seguidas no deja ninguna carpeta
`milagros-test-*` atrás en el temporal del sistema).

Tampoco escriben en `BACKUP_PATH` ni `LOGS_PATH` reales: cada archivo de
prueba fija esas dos variables a subcarpetas de su propio temporal.

Ningún correo sale de verdad: `emailService.enviarCorreo` se reemplaza por
un mock (`t.mock.method`) en las pruebas de recuperación de contraseña. Las
variables `SMTP_*` se rellenan con valores falsos solo para que el código no
rechace de entrada por "SMTP no configurado" — en ningún momento se abre una
conexión de red real.

## Qué cubre cada archivo

| Archivo | Qué prueba |
|---|---|
| `test/ventas.test.js` | Cálculo de venta (subtotal, descuento, IVA desglosado, total — que siempre cuadren exacto), precio detal vs. mayor según tipo de cliente, descuento mayor al subtotal rechazado, overflow numérico rechazado, ventas a crédito (con/sin cliente), descuento de stock al vender, rechazo por stock insuficiente, y que el stock nunca pueda quedar negativo (incluida la restricción `CHECK` de la propia base de datos). |
| `test/creditos.test.js` | Abonos: monto mayor al saldo rechazado, monto cero o negativo rechazado, abono sobre una venta que no es a crédito rechazado, y que el saldo quede exacto después de varios abonos parciales. |
| `test/auth.test.js` | Login con credenciales correctas/incorrectas, bloqueo tras 5 intentos fallidos (por usuario, no global), y el middleware `requiereSesion`: rechaza sin token y con token inventado, deja pasar con token válido, y que cerrar sesión invalide el token del lado del servidor. |
| `test/recuperacion.test.js` | Código de recuperación de un solo uso, que expire a los 10 minutos (con reloj simulado, sin esperar de verdad), y que el límite de 5 intentos sea **compartido** entre "validar código" y "confirmar" — no una segunda vía para adivinar sin límite. |
| `test/integridad.test.js` | Que arrancar la app dos veces seguidas contra el mismo archivo no rompa nada (migraciones idempotentes), que el backup genere un archivo `.db` real y abrible con los datos correctos, que la purga de auditoría archive antes de borrar, y que un producto o cliente con historial no se pueda eliminar de forma permanente. |
| `test/reportes.test.js` | Que una venta a las 7:30pm hora Colombia se clasifique en el día calendario correcto (y no en el de UTC), que los totales de un reporte coincidan exactamente con la suma de las ventas reales del período, que la ganancia se calcule contra el costo histórico del producto (no el actual), y que ni el objeto de datos ni el Excel generado de verdad contengan la ganancia del negocio en ninguna parte. |

Los nombres de cada prueba están en español y describen qué verifican —
pensados para poder leer el resumen de una corrida fallida sin tener que
abrir el archivo.

## Limitación conocida

Las pruebas de exportación verifican el Excel generado abriéndolo de verdad
con `exceljs` (la misma librería que lo genera). El PDF no se abre de la
misma forma — `pdfkit` comprime el contenido del archivo, así que buscar
texto en el binario no es confiable. En su lugar, se agregó una exportación
nueva **solo para pruebas** en `exportacionService.js`
(`obtenerDatosReporte`) que expone el objeto de datos que alimenta *tanto*
al Excel como al PDF, y la prueba confirma que ese objeto nunca trae
`gananciaTotal` ni `gananciaAproximada` — como los dos formatos parten del
mismo objeto, la garantía cubre a ambos aunque el PDF no se abra
directamente.
