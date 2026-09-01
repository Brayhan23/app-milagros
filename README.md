# app-milagros

## Pruebas

```
npm test
```

Corre la suite automatizada (`node:test`, sin dependencias nuevas) contra
una base de datos temporal descartable — nunca `data/milagros.db`. Qué
cubre cada archivo y por qué se eligió este enfoque: [docs/pruebas.md](docs/pruebas.md).

## Empaquetado (ejecutable de Windows)

```
npm run build
```

Genera `dist\app-milagros.exe` (con `@yao-pkg/pkg`) y junta al lado todo lo
que necesita para correr en un PC sin Node.js instalado. Qué copiar al PC
del cliente y el procedimiento de instalación paso a paso:
[docs/instalacion.md](docs/instalacion.md). Detalle técnico de cómo se
resolvió cada punto (addons nativos, assets, etc.):
[docs/requisitos_app_milagros.md](docs/requisitos_app_milagros.md#empaquetado-y-despliegue).