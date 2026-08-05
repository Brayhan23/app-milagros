# Proyecto: App Milagros

## Arquitectura
- Node.js + Express + SQLite (better-sqlite3)
- Capas: src/domain (lógica negocio), src/data (repositorios/SQLite), src/routes (API)
- Frontend simple en /public, servido local, sin Electron

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

## Historias en curso
Ver docs/requisitos_app_milagros.md para el detalle completo de historias de usuario.