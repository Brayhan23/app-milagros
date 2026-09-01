# Instalación en el PC del cliente

Notas para instalar la app en una máquina limpia (Windows 11, 64 bits, sin
Node.js instalado). Pensado para seguirse en orden, una sola vez por
instalación.

## 0. Antes de empezar

- Instalar **Google Drive Desktop** en el PC y dejar la cuenta de Google del
  negocio logueada — `BACKUP_PATH` (más abajo) depende de que esa carpeta ya
  exista y esté sincronizando.
- Tener a mano: el correo real del negocio + su "contraseña de aplicación"
  (no la contraseña normal — ver el comentario en `.env.example`), y el
  usuario/contraseña que va a tener quien use la caja.

## 1. Copiar los archivos

Crear `C:\AppMilagros\` y copiar ahí adentro **todo** el contenido de la
carpeta `dist\` que generó `npm run build`:

```
C:\AppMilagros\
├── app-milagros.exe
├── better_sqlite3.node
├── prebuilds\win32-x64\bcrypt.node
├── .env.example
└── iniciar.bat
```

No hace falta instalar nada más — el .exe trae su propio Node.js adentro.

## 2. Configurar .env

Copiar `.env.example` a `.env` (mismo lugar) y completar:

- `BACKUP_PATH`: ruta real de la carpeta de Google Drive Desktop del cliente.
- `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`: correo real del negocio.

`DB_PATH` y `LOGS_PATH` se pueden dejar como vienen (relativas) — así
`data\` y `logs\` se crean solas dentro de `C:\AppMilagros\` en el primer
arranque.

## 3. Primer arranque y usuario administrador

1. Abrir una consola (`cmd`) en `C:\AppMilagros\`.
2. Crear el primer usuario:
   ```
   app-milagros.exe crear-admin <usuario> <contraseña>
   ```
   Esto crea `data\milagros.db` con el esquema completo si todavía no
   existía (no hace falta ningún paso previo para eso).
3. (Opcional) Asociarle un correo para la recuperación de contraseña:
   ```
   app-milagros.exe configurar-correo <usuario> <correo>
   ```
4. Hacer doble clic en `app-milagros.exe` (o correrlo desde la misma
   consola). Se abre una ventana de consola y debería aparecer:
   ```
   Servidor corriendo en http://127.0.0.1:3000
   ```
   Dejarla abierta y entrar desde el navegador a `http://localhost:3000`.
   Iniciar sesión con el usuario del paso 2.

Si algo falla acá (falta el `.env`, un archivo de la carpeta no llegó a
copiarse, etc.), la ventana muestra un mensaje en español explicando qué
pasó y espera a que se presione una tecla antes de cerrarse — no debería
aparecer un stack trace ni cerrarse sola.

## 4. Logo y datos de la empresa

1. Pedir el logo (PNG, fondo transparente) y copiarlo a
   `C:\AppMilagros\uploads\logo.png` (la carpeta `uploads\` se crea sola en
   el primer arranque si no existe).
2. Desde la pantalla de **Configuración** de la app, completar nombre, NIT,
   dirección, teléfono, correo y el porcentaje de IVA real del negocio, y en
   el campo del logo escribir `uploads/logo.png`.

## 5. Inicio automático con Windows

1. Presionar `Win + R`, escribir `shell:startup` y Enter.
2. Ahí dentro, crear un **acceso directo** (no copiar el archivo) a
   `C:\AppMilagros\iniciar.bat`.

Así, la próxima vez que se prenda el PC, la app arranca sola minimizada, sin
que la usuaria tenga que hacer nada.

## 6. Verificación final antes de entregar

- [ ] `http://localhost:3000` carga y se puede iniciar sesión.
- [ ] Desde **otro** dispositivo de la misma red (celular, otro PC), la
      misma URL **no** debería cargar — confirma que quedó atado a
      `127.0.0.1` y no expuesta en la red local.
- [ ] Generar una venta de prueba y verificar que la factura imprime bien.
- [ ] Esperar a que corra un backup (o revisar `logs\backup.log`) y
      confirmar que aparece un archivo en `BACKUP_PATH`.
- [ ] Reiniciar el PC completo y confirmar que la app arranca sola,
      minimizada, sin que aparezca ninguna consola molesta.
- [ ] Borrar cualquier producto, cliente o venta de prueba, y crear (o
      renombrar) el usuario definitivo que va a usar la persona del negocio.

## Actualizar la app más adelante

Reemplazar únicamente `app-milagros.exe` (y los `.node`, si cambiaron) por
los nuevos — **nunca tocar** `.env`, `data\`, `logs\` ni `uploads\`. Esos
cuatro son los únicos que guardan información real del negocio; todo lo
demás es reemplazable sin pérdida.
