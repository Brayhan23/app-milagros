# Impresión térmica (Jaltech POS-80, papel de 80mm)

## Configuración del navegador — solo hace falta hacerla una vez

Chrome agrega por su cuenta una fecha, la dirección de la página y el
título en la parte de arriba y abajo de cada impresión. Eso no se puede
quitar solo con estilos de la página — es una opción del propio navegador,
y hay que desactivarla a mano:

1. Al hacer clic en **Imprimir** en la factura, se abre el diálogo de
   impresión de Chrome.
2. Elegir la impresora térmica (Jaltech POS-80) en el selector de arriba.
3. Hacer clic en **"Más ajustes"** (o **"Más opciones"**, según la versión
   de Chrome) para desplegar las opciones avanzadas.
4. Buscar la casilla **"Encabezados y pies de página"** y **desmarcarla**.
5. Imprimir.

Chrome recuerda esta preferencia para la próxima vez — no hay que repetir
estos pasos en cada factura, solo la primera vez que se configure el
puesto de trabajo (o si alguna actualización de Chrome la vuelve a
activar sola, lo cual pasa ocasionalmente).

## Qué verificar imprimiendo de verdad

Esto se probó generando una factura real y revisando el resultado, pero
una impresora térmica física puede comportarse distinto a la vista previa
del navegador — antes de dar esto por terminado, imprimir al menos una
factura real y revisar:

- **Que el texto salga oscuro y parejo**, sin puntos dispersos ni zonas
  grises — sobre todo en el NIT, la dirección y los encabezados de la
  tabla, que eran los que peor se veían antes.
- **Que el nombre de la empresa entre en una sola línea.**
- **Que no aparezca la fecha/URL/título que agrega Chrome** arriba o abajo
  del papel (ver la configuración de arriba si aparece).
- **Que el total se vea claramente como lo más grande y destacado del
  papel.**
- **Que no se corte ningún monto a la mitad** (ej. "$25.000" partido en
  dos líneas) — se ajustaron los anchos de columna de la tabla para que
  esto no pase, pero vale la pena confirmarlo con un producto de nombre
  largo y con un total de varias cifras.
- **Que el papel no se corte mucho más largo de lo necesario** después del
  total (esto depende del controlador/driver de la impresora, no de esta
  hoja de estilos).
