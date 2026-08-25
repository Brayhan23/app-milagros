---
name: milagros-ui
description: Reglas de diseño e identidad visual para el frontend de App Milagros (punto de venta e inventario de productos capilares). Úsala SIEMPRE que trabajes en cualquier archivo de src/public/ (index.html, app.js, styles.css), cuando se hable de rediseñar, mejorar, maquetar o dar estilo a cualquier pantalla, cuando se agregue una sección o componente nuevo a la interfaz, cuando se mencionen colores, tipografía, iconos, espaciado o layout, o cuando se hable de hacer la app más fácil de usar para la cajera. Aplícala incluso si el pedido parece puramente funcional pero toca algo visible en pantalla.
---

# Identidad visual y reglas de UI — App Milagros

## Contexto del producto

Punto de venta e inventario para la marca **Milagros** (productos capilares), operado por
**Distribuidora Oficial San Roque, Antioquia**. La usa una sola persona en el mostrador de una
tienda física, en un PC de gama baja (Intel Pentium, 4GB RAM, pantalla de laptop 15").

**La usuaria no es técnica.** No sabe qué es una API, ni un endpoint, ni un ID. Cada pantalla
debe poder usarse sin entrenamiento previo y sin miedo a "romper algo".

## Paleta de colores

Definir siempre como variables CSS en `:root`, nunca colores sueltos repartidos por el archivo.

```css
:root {
  /* Marca */
  --rosa: #C2185B;           /* Único color dominante: títulos, botones primarios, acentos */
  --rosa-claro: #FDF2F5;     /* Fondo general de la app */
  --lila: #DAC9DF;           /* Acento de detalle — nunca superficie */
  --verde-menta: #D0FDD7;    /* Acento de confirmación — nunca superficie */

  /* Neutros */
  --texto: #2B2B2B;
  --texto-suave: #6B6B6B;
  --borde: #E8E0E4;
  --blanco: #FFFFFF;

  /* Estados (derivados de la paleta, no colores nuevos al azar) */
  --exito: #1E7A34;          /* verde oscuro: texto/ícono sobre --verde-menta, contraste ~4.8:1 */
  --exito-fondo: var(--verde-menta);
  --alerta: #F5A623;
  --error: #C62828;
}
```

**Regla de dominancia — la que manda sobre todas las demás de esta sección:** el rosa es el
ÚNICO color dominante de la interfaz. Ningún otro color le hace competencia. Lila y verde menta
son **acentos**, no superficies: en cualquier pantalla, el área total cubierta por lila +
verde menta (sumando ambos) no debe superar aproximadamente el **5% de la pantalla**. Si al
mirar una pantalla terminada el ojo duda entre dos colores "principales", algo se aplicó mal —
casi siempre porque lila o verde menta se usaron como fondo de una superficie grande en vez de
como detalle.

**Cómo usar cada color:**

- **Rosa** (`--rosa`): identidad de la marca y único color dominante. Títulos de sección, botón
  principal de cada pantalla (uno solo por pantalla), pestaña activa (texto + subrayado),
  enlaces. No lo uses para todo — pierde fuerza.
- **Rosa claro** (`--rosa-claro`): fondo de la aplicación completa. Las tarjetas y paneles van en
  **blanco** encima de este fondo — todos, sin excepción, incluyendo barras laterales y paneles
  de resumen.
- **Lila** (`--lila`): SOLO en detalles pequeños:
  - bordes finos (1–2px) de tarjetas o paneles;
  - líneas divisorias entre secciones dentro de una tarjeta;
  - fondo de hover al pasar el mouse sobre una fila de tabla (transitorio, nunca fijo);
  - badges pequeños de información neutra (tipo de cliente, método de pago).
  **Nunca** como fondo de un panel, tarjeta, barra lateral, o encabezado de tabla completo —
  el lila y el rosa son tonos cercanos con distinta saturación, y dos colores dominantes
  compitiendo en la misma pantalla no funcionan juntos. Nunca en acciones destructivas.
- **Verde menta** (`--verde-menta`): SOLO en:
  - mensajes de éxito que aparecen y desaparecen solos;
  - badges pequeños de estado positivo (stock saludable, deuda saldada, cliente al día).
  Nada más — ni fondos de fila, ni paneles, ni texto de totales.

**Contraste sobre fondos claros:** `--lila` y `--verde-menta` son colores claros — texto gris
medio (`--texto-suave`, #6B6B6B) pierde legibilidad encima (contraste ~3.4:1, por debajo del
mínimo de 4.5:1). Como ambos quedaron limitados a detalles pequeños (badges, bordes, hover), en
la práctica el texto que va directamente sobre un fondo lila o verde menta sólido es casi
siempre el texto corto de un badge: usa `--texto` (~8.7:1 sobre lila) o `--exito` (~4.8:1 sobre
verde menta) para ese texto, nunca `--texto-suave` ni negro puro.

Regla: si necesitas un color que no está en la paleta, primero intenta resolverlo con opacidad
o con un tono derivado de los existentes.

### Dónde está aplicado hoy (referencia para fases 3, 4 y 5)

- **Lila:** borde de 1px en `.venta-resumen` (el panel de resumen de la venta, que es blanco);
  borde superior de 1px en `.resumen-totales` como línea divisoria antes del total; fondo de
  hover en filas de tabla (`.tabla-inventario tbody tr:hover`, un tinte de lila al 25% de
  opacidad, transitorio); badges neutros (`.badge-neutro`) para tipo de cliente y método de pago
  en la factura generada y en los listados de ventas.
- **Verde menta:** mensajes de éxito (`.mensaje.exito`); badge de stock saludable (`badge-ok` en
  el inventario); badge "Al día — deuda saldada" en el detalle de deuda de un cliente cuando el
  saldo llega a $0; badge de dinero recibido en el resumen de Reportes.
- Encabezados de tabla, la pestaña activa y el panel de resumen de la venta volvieron a su
  versión neutra (rosa claro/rosa o blanco) después de un primer intento que los pintó de lila
  como superficie completa — quedó mal, competía con el rosa. No repetir ese error.

## Iconos

**Nunca uses emojis.** Ni 📊 ni 🔍 ni ⚙️ ni ninguno. Se ven distintos en cada sistema, no se
pueden colorear, y dan aspecto de prototipo.

Usa **Lucide** (https://lucide.dev) como set de iconos: son SVG monocromáticos, limpios,
de trazo consistente y se colorean con `currentColor`.

- Inclúyelos como SVG inline en el HTML, o vía CDN si la app tuviera conexión (recuerda:
  debe funcionar sin internet, así que **incrustar los SVG localmente es lo correcto**).
- Un solo color por icono, heredando el color del texto que acompañan.
- Tamaño consistente: 20px en navegación y botones, 16px inline en texto.
- Nunca un icono suelto sin etiqueta de texto al lado, salvo en botones de acción obvios
  dentro de una fila de tabla (editar, eliminar) y aun ahí con `title` para que muestre
  el nombre al pasar el mouse.

## Encabezado

Arriba a la izquierda, siempre visible:

- Logo de Milagros (PNG con fondo transparente), altura ~48px, sin deformar.
- Al lado o debajo del logo, en texto pequeño y en `--texto-suave`:
  **"Distribuidora Oficial San Roque, Antioquia"**
- A la derecha del encabezado: nombre de usuario y botón de cerrar sesión (discreto,
  secundario, nunca en rosa fuerte).

El logo se carga desde `uploads/logo.png` — nunca lo incrustes en base64 ni lo dupliques.

## Reglas de escritura en la interfaz

- **Nunca muestres códigos de historia de usuario** ("HU-02", "HU-14") en pantalla. Son notas
  internas de desarrollo, no información para la usuaria. Si aparecen en el código actual, quítalos.
- Nunca muestres nombres técnicos: no "endpoint", no "token", no "ID" (di "número de factura",
  "número de cliente").
- Mensajes de error en lenguaje natural y accionable: no "Error 400: validación fallida",
  sino "Falta el nombre del producto".
- Montos siempre formateados como pesos colombianos con separador de miles: `$15.000`, no `15000`.
- Fechas en formato legible local: `18 de agosto, 2026`, no `2026-08-18T14:23:00Z`.

## Principios de usabilidad

### La pantalla de venta es la más importante

Es la que se usa decenas de veces al día. Todo lo demás puede tener un clic extra; esta no.

- El campo de **código de barras debe tener el foco automáticamente** al entrar a la pantalla,
  y recuperarlo después de cada producto agregado.
- El escáner USB actúa como un teclado: escribe el código y manda un Enter. Al detectar ese
  Enter, el producto debe **agregarse directo a la factura**, sin confirmaciones intermedias.
- La cantidad se ajusta **después**, en la línea del producto ya agregado (botones + / − y
  campo editable). No pidas la cantidad antes de escanear.
- Si el código no existe, avisa sin interrumpir el flujo (mensaje inline, no un popup que
  haya que cerrar) y deja el foco listo para el siguiente escaneo.
- El total debe estar siempre visible y grande, sin necesidad de bajar la página.

### Buscar información no debe requerir varios pasos

Patrón general: **buscar una cosa, y desde ahí llegar a todo lo relacionado.**

- En clientes: al buscar un cliente, su ficha debe mostrar directamente sus facturas, su deuda
  y sus abonos. Nunca obligar a buscar el cliente en un lado y sus facturas en otro.
- En reportes: desde el listado de ventas del período, poder abrir cada factura completa
  sin salir de la pantalla.
- Toda tabla con más de 10 filas necesita un campo de búsqueda encima.

### Confirmaciones y errores

- Acciones destructivas (desactivar producto, desactivar cliente) siempre piden confirmación,
  con un mensaje que diga exactamente qué va a pasar.
- Acciones frecuentes (agregar producto a la venta) nunca piden confirmación.
- Después de cada acción exitosa, un mensaje breve en verde menta que desaparece solo.

## Layout y estructura

- Máximo ancho de contenido: 1200px, centrado. En pantallas de laptop no debe quedar todo
  pegado a los bordes.
- Tarjetas blancas con `border-radius: 12px`, sombra muy sutil, sobre el fondo rosa claro.
- Espaciado generoso pero consistente: usa múltiplos de 8px (8, 16, 24, 32).
- Tipografía: una sola familia sans-serif del sistema (`system-ui`), sin cargar fuentes
  externas (debe funcionar sin internet). Jerarquía por tamaño y peso, no por familias distintas.
- Navegación por pestañas en la parte superior, con la pestaña activa marcada en rosa.

## Restricciones técnicas del proyecto

- **Sin frameworks**: HTML, CSS y JavaScript puro. Nada de React, Vue, Tailwind ni build step.
- **Sin dependencias por CDN**: la app debe funcionar sin conexión a internet. Todo recurso
  (iconos, fuentes, estilos) vive localmente en `src/public/`.
- **Sin `localStorage` para datos de negocio**: solo se usa para el token de sesión, como ya está.
- **Rendimiento**: el PC es de gama baja. Evita animaciones pesadas, sombras múltiples,
  filtros CSS costosos o re-renderizados innecesarios de tablas grandes.
- **Escapar siempre el HTML** que venga de la base de datos antes de interpolarlo
  (ya existe una función `escaparHtml`, úsala).

## Animaciones

Discretas y funcionales, nunca decorativas:

- Transiciones de 150–200ms en hover de botones y cambio de pestaña.
- Mensajes de éxito que aparecen y desaparecen con un fade suave.
- Nada de animaciones de entrada en cada carga de tabla, ni efectos de scroll.
- Respetar `prefers-reduced-motion`.
