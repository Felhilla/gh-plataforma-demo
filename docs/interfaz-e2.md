# Interfaz E2

Sitio estático sin compilación ni dependencias de ejecución, con rutas relativas para GitHub Pages. Se conserva la carga de `config.js` y `api-supabase.js`. E2 no consulta ni escribe en Supabase. Las vistas de estándares y plan son únicamente marcadores «En construcción».

## Datos y vistas

`app.js` define `window.App` antes de cargar las vistas. En `DOMContentLoaded` solicita en paralelo los siete archivos locales y publica `App.datos` con las claves `riesgos`, `plan`, `estandares`, `evaluaciones`, `criticidad`, `umbrales` y `planConfig`. Un fallo muestra un aviso con opción de reintentar. `App.obtenerPlan()` es el único punto de lectura del plan y actualmente devuelve `App.datos.plan` de forma síncrona.

Para E3/E4, sustituir el marcador en el archivo de la vista correspondiente:

```js
App.registrarVista('estandares', {
  render(contenedor, datos, params) {
    // params.id: riesgo abierto, si corresponde.
    // params.filtros: URLSearchParams de la ruta por hash.
    contenedor.append(App.el('h1', 'Alineación con estándares'));
    // Retorno opcional: función que libera eventos o elementos externos.
    return () => {};
  }
});
```

Para el plan, registrar `plan` y leer `params.filtros.get('accion')`. El orden de scripts es configuración, API, cálculo puro, App y las tres vistas, todos con `defer`. No hace falta modificar el enrutador para E3/E4. `App.el` usa `textContent`; las vistas también usan nodos DOM y `append`, nunca HTML con datos interpolados.

Rutas: `#/`, `#/ddhh/riesgos`, `#/ddhh/riesgos/riesgo-xx`, `#/ddhh/estandares` y `#/ddhh/plan`. Las desconocidas, incluida una ficha inexistente, llevan a la portada. Los filtros usan `criticidad`, `ambito`, `vinculacion` y `derecho`. Se combinan con «y»; vinculación considera cualquier evaluación del riesgo. Los valores desconocidos producen cero coincidencias. Abrir y cerrar la ficha conserva la consulta. Las tarjetas de resumen cambian solo criticidad; «Limpiar filtros» elimina todos.

`Riesgos.ubicar` usa exclusivamente la evaluación dominante, conserva una posición por riesgo y separa probabilidad ausente. `opcionesFiltro` usa orden de configuración para categorías y orden lexicográfico para derechos, independiente del orden de entrada. Los nombres cortos de las fichas son truncamientos del nombre fuente, que permanece íntegro en la lista, el título accesible y el panel.

## Diseño y contraste

Paletas seleccionables mediante `?paleta=b` antes del hash; `a` es la predeterminada. Fondo claro en ambas. Montserrat se declara mediante Google Fonts para títulos y cifras, con alternativa `system-ui`; cuerpo en fuente del sistema. Durante este encargo no se descargaron fuentes ni se accedió a servicios externos. El navegador del sitio podrá solicitar Google Fonts cuando tenga conexión.

| Variable | A · Verde GH | B · GH sobrio |
|---|---|---|
| Principal | `#076633` | `#123f49` |
| Acento | `#3aaa35` | `#3aaa35` |
| Fondo | `#f7f8f4` | `#ffffff` |
| Superficie suave | `#edf4eb` | `#eef4f5` |

Texto principal `#24342e`, secundario `#526158`, bordes `#c5cfc7`. El verde claro es decorativo: no se usa para texto pequeño sobre blanco. Principal A sobre blanco: **7,10:1**; principal B: **11,46:1**; texto secundario: **6,54:1**.

Etiquetas de criticidad con texto y borde del mismo color, siempre sobre blanco:

| Criticidad | Color | Contraste medido |
|---|---|---|
| Alta | `#a61b1b` | **7,52:1** |
| Media | `#9a3412` | **7,31:1** |
| Baja | `#806000` | **5,85:1** |

Medición: luminancia relativa sRGB linealizada, ponderada con 0,2126 / 0,7152 / 0,0722; razón `(Lclaro + 0,05) / (Loscuro + 0,05)`. Todas las etiquetas superan 4,5:1 (AA para texto normal). La atenuación de las fichas que no coinciden con filtros es un estado visual inactivo; mantienen nombre accesible e indicación textual de no coincidencia, y recuperan opacidad completa al enfocarse o pasar el puntero.

### Mapa de calor

Convención explícita `MAPA_CALOR` en `vista-riesgos.js`; no proviene de las fuentes, no modifica la criticidad y no añade una medida de riesgo calculada. Las celdas incluyen ambas coordenadas escritas.

| Gravedad ↓ / Probabilidad → | Baja | Media | Alta |
|---|---|---|---|
| Alta | Medio | Alto | Alto |
| Media | Bajo | Medio | Alto |
| Baja | Bajo | Bajo | Medio |

Fondos: bajo `#faf5d8`, medio `#fff0de`, alto `#fbe8e5`. La franja sin probabilidad queda fuera del mapa. En escritorio la matriz es 3 × 3; bajo 768 px las celdas se apilan en una columna con sus coordenadas explícitas. La tabla también se transforma en registros de una columna. La ficha lateral ocupa toda la pantalla en móvil.

## Accesibilidad y procedencia

Pestañas con `tablist`, `tab`, `tabpanel`, selección y controles asociados; flechas, Inicio y Fin cambian de pestaña. Enlaces nativos permiten abrir riesgos con teclado. Diálogo con nombre accesible, `aria-modal`, foco inicial en cierre, contención de Tab/Mayús+Tab, cierre con Esc, fondo inerte y devolución del foco a un enlace del riesgo. Cambio de filtros conserva el foco en el control. Enlace para saltar al contenido y respeto de movimiento reducido.

Ámbitos estimados, cortes propuestos y campos/vínculos propuestos o estimados de acciones muestran avisos con `title`, descripción accesible y foco por teclado. Los controles, análisis, responsables, derechos, evaluaciones y acciones se leen de los datos; las etiquetas son propias de la interfaz.

## Verificación

`npm test`: **28 pruebas, 28 aprobadas, 0 fallos, 0 omitidas**. Incluye las 8 nuevas pruebas de E2, además de las pruebas existentes de API, datos, cálculo y privacidad. Sintaxis JavaScript y `git diff --check` correctos.

Se intentó servir `public/` con `python3 -m http.server 8765 --bind 127.0.0.1 --directory public`: el entorno rechazó la apertura del puerto con `PermissionError: [Errno 1] Operation not permitted`. Chrome local en modo headless, con solicitudes externas bloqueadas, terminó con código 134. No fue posible verificar visualmente ni revisar la consola de navegador. Quedan pendientes el recorrido de rutas (incluidos filtros y ficha directa), paletas, anchos 1280/1920 y móvil, foco/teclado con navegador y lector de pantalla, carga fallida y carga de Montserrat. La medición de contraste es numérica; no sustituye ese recorrido.

No se modificaron datos, configuraciones, scripts de extracción, Supabase ni CI. Sin commit ni push.
