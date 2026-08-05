# Especificación — App Milagros

## Arquitectura

- Backend: Node.js + Express
- Base de datos: SQLite (better-sqlite3)
- Frontend: HTML/CSS/JS servido en localhost, sin Electron
- Estructura en capas:
  - `src/domain` — lógica de negocio pura
  - `src/data` — repositorios (acceso a SQLite)
  - `src/routes` — rutas/API
  - `public/` — frontend
- Despliegue: local-first en el PC del cliente. La app debe funcionar sin conexión a internet.
- Backup: copia automática diaria del archivo de base de datos hacia almacenamiento en la nube. Requisito crítico, no romper esta lógica sin avisar.

## Reglas del proyecto (no negociables)

- No implementar facturación electrónica DIAN. Fuera de alcance por ahora.
- Contraseñas siempre con hash (bcrypt), nunca texto plano.
- Consultas SQL siempre parametrizadas, nunca concatenadas.
- `.env` y archivos `*.db` nunca se commitean a git.
- No modificar la lógica de backup sin confirmarlo antes.

---

## Historias de usuario

### Épica 1 — Autenticación

**HU-01**
Como usuario, quiero iniciar sesión con un usuario y una contraseña general, para proteger el acceso al sistema.
- Un único rol de acceso ("general").
- Bloqueo temporal tras varios intentos fallidos.
- Contraseña almacenada con hash, nunca en texto plano.

---

### Épica 2 — Gestión de productos e inventario

**HU-02**
Como usuario, quiero registrar productos con su código de barras, para identificarlos al vender.

**HU-03**
Como usuario, quiero que el stock se actualice cada vez que llegan productos nuevos, para mantener el inventario correcto.

**HU-04**
Como usuario, quiero recibir una alerta cuando un producto esté por agotarse, para reabastecer a tiempo.

**HU-05**
Como usuario, quiero ver el stock disponible en tiempo real, para saber qué puedo vender.

---

### Épica 3 — Ventas y facturación

**HU-06**
Como usuario, quiero generar una factura física por cada venta, para entregar un comprobante al cliente.

**HU-07**
Como usuario, quiero enviar una copia de la factura por correo electrónico (sin timbrado DIAN), para clientes que la prefieran digital.

**HU-08**
Como usuario, quiero aplicar descuentos a una venta, para promociones o negociación con el cliente.

**HU-09**
Como usuario, quiero registrar el método de pago (efectivo, transferencia o crédito), para controlar cómo se cobró cada venta.

**HU-10**
Como usuario, quiero diferenciar precio al detal y precio al por mayor, para vender correctamente según el tipo de cliente.

---

### Épica 4 — Clientes y créditos

**HU-11**
Como usuario, quiero registrar clientes mayoristas, para llevar su historial y condiciones especiales.

**HU-12**
Como usuario, quiero registrar ventas a crédito y las deudas asociadas, para saber cuánto me debe cada cliente.

**HU-13**
Como usuario, quiero ver una lista de clientes con deudas pendientes, para gestionar los cobros.

---

### Épica 5 — Reportes

**HU-14**
Como usuario, quiero ver las ventas del día y la ganancia generada, para conocer el rendimiento diario.

**HU-15**
Como usuario, quiero consultar el histórico de ventas por rango de fechas, para analizar el negocio periódicamente.

**HU-16**
Como usuario, quiero ver un reporte de productos más vendidos, para decidir qué reabastecer con prioridad.

---

### Épica 6 — Configuración y marca

**HU-17**
Como usuario, quiero que la interfaz use los colores de la marca (rosado, lila, verde menta), para reflejar la identidad visual de Milagros.

**HU-18**
Como usuario, quiero configurar los datos de la empresa (nombre, NIT, dirección, logo), para que aparezcan en el encabezado de cada factura.

---

## Requisitos adicionales

- Recuperación de contraseña.
- Registro de auditoría (quién hizo cada venta/cambio de stock).
- Exportar reportes a PDF/Excel.
- Soporte para impresora térmica en facturas físicas.
- Configuración de IVA en la factura.
- Modo sin conexión (offline).
- Diseño de roles ampliable a futuro (aunque hoy solo existe un login general).