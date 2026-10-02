# Plan de acción · E4

La pestaña combina las 58 acciones estáticas con los registros editados de `plan-acciones`, por id. Incluye también ids que solo existan en la base. No siembra registros ni escribe colecciones completas. `App.obtenerPlan()` continúa siendo síncrona, por lo que la portada y la ficha de riesgo usan el plan combinado sin cambiar sus contratos.

La carga inicial espera como máximo cinco segundos por la lectura de la base después de leer los JSON locales. Si falla, devuelve respaldo o vence el tiempo, conserva el estático y muestra el aviso de conexión con controles deshabilitados. `App.estadoBase()` mantiene el estado propio de esta carga; una respuesta tardía no reemplaza el respaldo ni habilita la edición. Recargar permite volver a intentar la conexión.

`App.guardarAccion(id, cambios)` valida mediante `Plan.aplicarCambio`, escribe exclusivamente la acción completa con `GHDatos.set('plan-acciones', id, accion)` y solo después reemplaza ese registro en memoria. Un error conserva la memoria y se presenta en la interfaz; permite reintentar. Durante la escritura se deshabilitan los controles de esa acción. La vista muestra «Guardando…», «Guardado» o el error y actualiza resumen y lista sin recargar. Los cambios de otras sesiones se consultan al cargar la página, no mediante suscripción en tiempo real.

## Cálculo y edición

`public/plan.js` publica `Plan` en navegador y `module.exports` en Node; no usa DOM ni red. Exporta `combinar`, `aplicarCambio`, `resumen`, `filtrar` y `vencida`. No muta las entradas. El resumen promedia avances, cuenta estados y vencidas e incluye los seis componentes, incluso vacíos. Vencida significa plazo estrictamente anterior al día local y estado distinto de cumplida.

Solo se editan estado, avance entero 0–100, responsable de hasta 120 caracteres, plazo calendario AAAA-MM-DD y nota de hasta 500 caracteres. Cumplida fuerza 100; 100 fuerza cumplida; avanzar una pendiente la pone en curso; seleccionar pendiente devuelve el avance a cero. Si se envían estado y avance contradictorios juntos, pendiente o cumplida explícitos tienen prioridad. Reducir el avance de una cumplida la reabre en curso. Para reabrir una cumplida se puede reducir el avance o seleccionar pendiente.

Cada edición registra `actualizado` ISO y conserva las últimas 20 entradas `{fecha, campo, antes, despues}`, incluyendo ajustes automáticos. No agrega nombres, correos ni identificadores del editor. La interfaz pide usar áreas responsables y evitar datos personales en los textos públicos; no hay detección automática del contenido libre. Confirmar un campo, aunque conserve el valor, elimina su marca de propuesta. Los campos modificados por consistencia también dejan de estar propuestos. Un valor sin cambio no añade entrada al historial.

**Concurrencia:** si dos personas editan a la vez, gana la última escritura de la acción completa. Esto puede reemplazar cambios previos de otra persona, incluso de otro campo, y su historial. Es el comportamiento aceptado para esta demostración; no hay bloqueo, combinación entre sesiones ni control de versiones.

## Interfaz

Los filtros combinan componente, estado, riesgo, eje y texto de título/descripción sin distinguir mayúsculas ni tildes. Se conservan en `#/ddhh/plan?componente=…&estado=…&riesgo=…&eje=…&q=…`. La búsqueda se confirma con Enter o al salir del campo. `accion` abre el panel y no restringe la lista. Limpiar filtros vuelve a la ruta sin consulta. Los componentes del resumen filtran la lista; su resumen global permanece basado en todas las acciones. Cada grupo plegable resume sus acciones visibles.

La lista muestra avance, estado, responsable, plazo y vencimiento, indicador, enlaces a riesgos y ejes, propuestas por campo, vínculos estimados y fecha de actualización. Su edición rápida ofrece estado y un deslizador en pasos de 10 %. El panel presenta descripción completa, archivo/tabla/fila de fuente, formulario independiente por campo y el historial. Conserva borradores de otros campos al guardar uno. Las fechas se presentan en español de Colombia; el campo de fecha usa el control nativo del navegador.

El panel tiene `role="dialog"`, nombre accesible, foco inicial en Cerrar, contención de Tab, Esc y restauración del foco al enlace de la acción cuando está visible. El resto del documento queda inerte mientras está abierto. Los eventos y el panel se limpian al navegar. El estado de guardado usa una región viva. Todo dato remoto se inserta con `textContent` o propiedades DOM, sin `innerHTML` ni bibliotecas.

`estilos-plan.css` reutiliza variables y clases existentes. Componentes y filtros tienen tres columnas en escritorio y una bajo 768 px; el panel ocupa toda la anchura móvil. El aviso de demostración pública permanece visible en la pestaña.

## Verificación

`npm test` (última ejecución): 48 pruebas aprobadas, 0 fallos, 0 omitidas, incluidas las pruebas de estándares del encargo paralelo. No fue necesario ignorar fallos. Las 11 pruebas E4 cubren combinación, validación, consistencia, propuestas, historial, inmutabilidad, resumen, vencimientos, filtros y App mediante VM con API falsa. Incluyen lectura combinada, escritura de un registro, rechazo sin alterar memoria y respaldo ante fallo o tiempo de espera. No se realizaron solicitudes de red ni escrituras reales a Supabase.

Se verificó sintaxis de los tres JavaScript y espacios del diff. No se verificaron en navegador el diseño a 1280/1920 px y móvil, el recorrido de teclado/foco con tecnología de asistencia, los controles nativos de fecha y deslizador, ni la persistencia entre dos sesiones reales. Esos puntos requieren una comprobación visual y funcional posterior en navegador.

Solo se editaron los seis archivos autorizados de E4. Sin commit ni push.
