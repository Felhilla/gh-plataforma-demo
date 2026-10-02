# Interfaz E3 · Alineación con estándares

La vista presenta brechas de gestión en seis etapas OCDE y diez temas DDHH. No incorpora el inventario ni los cálculos de riesgos. Solo se modifican `public/estandares.js`, `public/vista-estandares.js`, `public/estilos-estandares.css`, `tests/estandares.test.mjs` y este documento.

## Contratos y evaluaciones

`estandares.js` es UMD, sin DOM ni dependencias. Expone `combinar`, `ordenar`, `ejesDe`, `comparar`, `colorPara`, `validarEvaluacion`, `parsearPuntaje` y `puntosPoligono`. Orden descendente por fecha y, en empate, por id. La base sustituye los registros estáticos del mismo id. Las funciones no modifican sus entradas.

`comparar(a, b, ejes)` devuelve el objeto eje, ambos puntajes y `diferencia = a - b`. Sin comparación o sin puntaje, la diferencia es `null`. `puntosPoligono` devuelve pares `[x, y]`, empieza arriba y recorre los ejes en sentido horario; admite centro como par o como objeto `{x, y}`. Los puntajes originales se conservan en el cálculo; la presentación usa un decimal y coma decimal.

La selección inicial es la evaluación más reciente y la siguiente anterior. Los parámetros `eval`, `vs` y `eje` se leen del hash y se actualizan con `history.replaceState`, evitando recargar la vista y consultar la base al cambiar un selector. `vs=` representa Sin comparación. Los parámetros desconocidos recuperan una selección válida. Las etiquetas Ejemplo y Cargada en la plataforma figuran en selectores, leyendas y encabezado del detalle.

La vista espera `GHDatos.list('evaluaciones')`; ante respaldo o error conserva los JSON estáticos y muestra el aviso solicitado. El plan se consulta mediante `await Promise.resolve(App.obtenerPlan())`, compatible con retorno síncrono o asíncrono. Los resultados tardíos no actualizan vistas desmontadas ni paneles reemplazados.

## Arañas, hallazgos y accesibilidad

Dos SVG propios con anillos 0–5, radios y nombres completos partidos en líneas. Área principal rellena con `--principal`; comparación con `--media` y trazo discontinuo. Cada vértice lleva color según la configuración y puntaje, y permite seleccionar el eje con clic, Enter o Espacio. El título nativo y una lectura visible bajo el gráfico presentan la comparación desde la evaluación comparada hacia la principal. El nombre accesible incluye ambos puntajes y diferencia.

Cada gráfico tiene una tabla con encabezados, botones de eje y diferencia con ▲, ▼ o =. Valores que redondean a cero se presentan como igualdad. La leyenda explica intervalos y muestra la nota configurada cuando `hipotesis` es verdadera. Cero conserva el significado Sin información indicado junto al título.

Los gráficos se disponen lado a lado desde 1200 px y se apilan por debajo. El detalle se ubica debajo; en móvil las tablas se presentan como registros verticales y los controles ocupan una columna. Los tamaños del SVG son proporcionales; las tablas conservan una alternativa legible a las etiquetas reducidas en móvil. Los estilos están limitados a clases `e3-*` y reutilizan variables y clases de E2.

Los hallazgos solo se muestran para la evaluación fuente `eval-2025-12`. Se agrupan los indicadores OCDE bajo su criterio, usando la correspondencia ordinal existente entre `criterios` y `hallazgos.grupos`; se conservan las dos denominaciones cuando difieren. En temas se muestran los indicadores directamente. Las descripciones son desplegables; brechas, documentos, incorporación y calificación siempre tienen etiquetas, incluidos valores ausentes. Los enlaces del plan incluyen título, componente, estado y Vínculo estimado cuando corresponde.

## Formulario y persistencia

Diálogo nativo con `showModal`, nombre accesible, foco inicial, cierre con Esc y devolución del foco. El navegador aporta fondo inerte y contención de foco. Los puntajes usan campos de texto numérico con `inputmode=decimal` y semántica `spinbutton`, para admitir coma y punto consistentemente: flechas arriba/abajo ajustan 0,1 y las teclas Inicio/Fin llevan a 0/5. El prellenado copia los 16 puntajes redondeados a una décima; nombre y fecha quedan a elección del usuario.

La validación central exige nombre de 1–80 caracteres, fecha mensual válida, todos los ejes entre 0 y 5 e id no repetido. El slug elimina tildes y caracteres incompatibles y limita el id a 80 caracteres, conforme a GHDatos. Los errores se asocian a sus campos y enfocan el primer campo inválido. Se muestra el aviso de demostración pública.

Antes de guardar se releen las evaluaciones para detectar ids creados mientras estaba abierto el formulario. Después se escribe únicamente `GHDatos.set('evaluaciones', id, evaluacion)`. Un fallo conserva los campos y permite reintentar. El respaldo inicial deshabilita Guardar. Tras éxito se selecciona la nueva evaluación y se compara con la principal que estaba seleccionada. La API existente usa upsert: la comprobación previa reduce colisiones, pero no puede garantizar exclusión atómica entre dos escrituras simultáneas; eso requeriría cambiar el contrato de persistencia, fuera de E3.

Todos los datos se insertan con nodos DOM, `textContent` y atributos; no se usa `innerHTML` ni bibliotecas externas.

## Verificación

`npm test`: **51 pruebas, 51 aprobadas, 0 fallos, 0 omitidas**. Las pruebas de `plan.test.mjs` también pasaron; no fue necesario ignorarlas. E3 aporta 12 pruebas: combinación, orden, ejes, comparación con datos fuente, validación, parser, colores, geometría y tres recorridos de vista con DOM simulado. Estos últimos comprueban respaldo, tablas, plan asíncrono, hallazgos, pasos de teclado, conservación de campos tras fallo, escritura de un registro y selección tras éxito.

Sintaxis JavaScript y `git diff --check` revisados. No se accedió a la red ni se hicieron commit o push.

No hay herramienta de navegador disponible en esta sesión. Quedan sin comprobar en un navegador real: disposición y posibles solapamientos a 1280/1920 px y móvil, ambas paletas, lector de pantalla, comportamiento nativo del diálogo y foco, interacción real de puntero y persistencia contra Supabase. Las pruebas con DOM simulado no sustituyen esa revisión visual ni una prueba de integración con la base.
