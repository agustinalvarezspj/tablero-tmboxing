# 🥊 Tablero Operativo — TM Boxing

Tablero semanal de tareas del equipo de TM Boxing (sedes Rosario y Funes).

- **Web:** https://agustinalvarezspj.github.io/tablero-tmboxing/
- **Datos:** [Google Sheet "Tablero TM Boxing"](https://docs.google.com/spreadsheets/d/1RaUzLTlE1hZd86IwfSP7STBlVEtddz3R3JVWDrE3CWU/edit)
- **Backend:** Google Apps Script (código en [`apps-script/Code.gs`](apps-script/Code.gs))

## Qué hace

- Tareas semanales por área y por persona, con prioridad, fecha límite y notas.
- **Traslado automático:** lo que queda pendiente al terminar la semana pasa solo a la semana siguiente, con la etiqueta «↪ Arrastrada».
- **Mail diario:** cada persona recibe a la mañana un mail con sus pendientes.
- **App instalable** en el celular (PWA): botón «Instalar» en Android, o Safari → Compartir → «Agregar a pantalla de inicio» en iPhone.
- Admins (Agustín, Franco, Tiago) crean/editan/borran tareas; el resto marca las suyas y agrega notas.

## Instalación del backend (una sola vez)

1. Abrí el [Google Sheet del tablero](https://docs.google.com/spreadsheets/d/1RaUzLTlE1hZd86IwfSP7STBlVEtddz3R3JVWDrE3CWU/edit) → **Extensiones → Apps Script**.
2. Borrá el contenido del editor y pegá todo el código de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Completá los mails del equipo en la constante `EMAILS` (los vacíos no reciben nada).
4. Guardá (Ctrl+S). En el desplegable de funciones elegí **`configurarDisparadorDiario`** y tocá **▶ Ejecutar** (aceptá los permisos la primera vez). Esto deja programado el mail diario a las 8:00.
5. **Implementar → Nueva implementación → ⚙️ Aplicación web** con:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier persona**
6. Copiá la **URL de la aplicación web** (termina en `/exec`) y pegala en `index.html`, en la constante `API_URL` (reemplazando `TU_URL_DE_APPS_SCRIPT_AQUI`). Subí el cambio al repo.

> ⚠️ Para futuros cambios del script: **Implementar → Administrar implementaciones → ✏️ → Nueva versión**. Nunca crees una implementación nueva (cambia la URL y hay que volver a tocar `index.html`).

Para probar: `probarEmailAhora` manda el mail ya mismo; `probarTrasladoAhora` mueve los pendientes viejos a la semana actual.

## Configuración

- **Hora del mail:** constante `HORA_MAIL` en `Code.gs` (volver a ejecutar `configurarDisparadorDiario` después de cambiarla).
- **Personas y áreas:** arrays `PERSONS` y `AREAS` en `index.html` + `NOMBRES`, `AREAS_NOMBRE` y `EMAILS` en `Code.gs` (deben coincidir los ids).
