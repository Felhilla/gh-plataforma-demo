# Datos E1 · D1 DDHH Solgas

Datos extraídos de MAT (matriz validada de enero de 2026), BRE (análisis de brechas) e INF (informe de resultados de diciembre de 2025). Las fuentes se abren en modo lectura, los libros con `data_only=True`; no se recalculan fórmulas de Excel. No hay acceso a red. Los análisis de brechas y riesgos son independientes: el plan los conecta mediante acciones, nunca mediante relaciones directas riesgo–eje.

## Archivos y diccionario

| Archivo | Estructura y registros |
|---|---|
| `public/data/riesgos.json` | Arreglo de 18 riesgos y 20 evaluaciones por actor. Ids `riesgo-01`…`riesgo-18` según primera aparición en MAT. |
| `public/data/estandares.json` | Objeto: `ejes` (6 etapas OCDE y 10 temas DDHH), `escala` (6 niveles, 0–5). Contiene 12 criterios, 83 indicadores de etapas y 76 de temas. |
| `public/data/evaluaciones.json` | Arreglo de 2 evaluaciones, cada una con 16 `puntajes` indexados por id de eje. |
| `public/data/plan.json` | Arreglo de 58 acciones `accion-01`…`accion-58`, con referencias a riesgos o ejes. |
| `public/config/criticidad-config.json` | 1 configuración: 3 criterios, 3 cortes, 3 probabilidades, 3 vinculaciones con medidas literales, 3 ámbitos y 11 normalizaciones explícitas. |
| `public/config/umbrales-config.json` | 1 configuración: 3 cortes de color, escala 0–5, hipótesis pendiente de confirmación. |
| `public/config/plan-config.json` | 1 configuración: 6 componentes, 3 estados, fecha base y plazos propuestos. |
| `public/riesgos.js` | Módulo UMD puro: `gravedad`, `criticidad`, `resumen`. |
| `scripts/extraer_solgas.py` | Extractor determinista de los 7 JSON, sin modificar los originales. |
| `tests/datos.test.mjs` | 15 pruebas de datos y cálculo con `node:test`, sin dependencias. |
| `docs/datos-e1.md` | Este diccionario y registro de decisiones. |

**Riesgos.** `nombre` conserva el texto de B; `derecho_humano` es H, el estándar asociado. `ambitos` usa ids normalizados de F. `localizacion`, `actividades`, `medidas_control`, `analisis_controles` y `accion_recomendada` son textos de G/E/O/R/S, o `null` si faltan. Al agrupar actores se concatenan valores distintos en orden de aparición, separados por dos saltos de línea; no se pierde ninguna versión. `responsables` contiene exclusivamente áreas públicas deduplicadas. `evaluaciones` conserva actores de C/D, los tres enteros de gravedad, vinculación, probabilidad y `fila_fuente`. La probabilidad de MAT!71 permanece `null`. `fuente.filas` identifica todas las filas originales del riesgo. La criticidad no se persiste.

**Hallazgos.** Cada eje lleva `grafico`, `nombre`, `origen` y `hallazgos.evaluacion = eval-2025-12`. Las etapas tienen `criterios[]` con nombre y calificación exactos de «Análisis Gráfico DD» y `hallazgos.grupos[]` con el criterio mínimo literal de «Análisis de brechas DD» y sus `indicadores[]`. Los temas tienen `hallazgos.indicadores[]` de «Análisis gestión en DDHH». Cada indicador conserva pregunta, incorporación (`si`/`no`), documentos, descripción, calificación y brecha (puede ser `null`), con su fila de origen. Las etiquetas distintas entre gráfico y detalle no se corrigen. La fila DD!82 es un indicador aunque no tenga signo de apertura de pregunta.

**Evaluaciones.** `id`, `nombre`, `fecha`, `origen`, `puntajes`. `fecha` tiene precisión mensual (`AAAA-MM`): el encargo fija diciembre, no un día concreto. La evaluación fuente conserva los números de BRE sin redondear. El JSON de ejemplo usa números de precisión de un decimal; los enteros equivalen a `4.0`.

**Acciones.** `id`, `componente`, `titulo` (resumen de hasta 90 caracteres), `descripcion` literal, `riesgos[]`, `ejes[]`, `responsable` (cadena, áreas múltiples separadas por ` / `), `plazo` (`AAAA-MM-DD`), `estado`, `avance` (0–100), `indicador`, `origen`, `campos_propuestos[]` y `fuente`. Las acciones del componente 3 conservan además el `actor_genera` del informe. Tablas y filas de Word se numeran desde cero, con el encabezado en fila 0; `fuente.parrafos` indica extremos inclusivos, también desde cero. Los índices de estructura se validan para fallar si cambia el documento.

## Cálculo y trazabilidad

`Riesgos.gravedad(evaluacion, cfg)` devuelve `{promedio, nivel}`. `Riesgos.criticidad(riesgo, cfg)` devuelve `{nivel, promedio, evaluacionDominante}`; esta última es el objeto original de la evaluación de mayor promedio. En empate conserva la primera. No modifica las entradas. `Riesgos.resumen(riesgos, cfg)` incluye todos los niveles, también los que tengan conteo cero.

La escala, agregaciones y cortes se leen de la configuración: promedio de escala, alcance e irreparable; menor que 1,5 Baja, menor que 2,5 Media, resto Alta. El límite exacto 2,5 corrige el caso falso de la fórmula de Excel según el encargo. Probabilidad y vinculación son dimensiones independientes. La matriz tiene X probabilidad, Y gravedad. Resultado verificado: **1 Alta, 8 Media y 9 Baja**. El módulo rechaza configuración incompleta, agregaciones no soportadas y valores fuera de escala. Las categorías ausentes deben expresarse con `null`, nunca cadenas vacías.

Los plazos reutilizan ese mismo módulo desde Python mediante Node, sin duplicar la fórmula: fecha base 2026-01-01; Alta +6 meses (2026-07-01), Media +12 (2027-01-01), Baja +18 (2027-07-01), sin riesgo +12. Si una acción tiene varios riesgos, se toma el plazo más corto. No son compromisos acordados con la empresa.

`origen: fuente` describe el contenido extraído. `campos_propuestos` distingue títulos resumidos, plazos, indicadores, estados iniciales, avances y responsables «Por definir». `vinculos_estimados: true` identifica todos los enlaces acción–eje y las seis correspondencias no literales de acoso. Los indicadores de acción son propuestas breves basadas en la tabla 49 (políticas/procedimientos, formación, proveedores evaluados, medidas implantadas, quejas/reparación y comunicación); requieren validación operacional.

## Normalizaciones y diferencias de fuente

- La tabla explícita `AMBITOS` cubre los 11 textos completos distintos de F. Proveedores/cadena de proveedores se normalizan a suministro; operación administrativa a operación propia.
- «Instalaciones de clientes B2B» y «Comunidades receptoras» se aproximan a cadena de distribución: son destinos/receptores del suministro, no ámbitos independientes en el modelo permitido. Requieren confirmación. No se modifica el texto de localización.
- «Operación de contratistas» y «Contratistas en obras y servicios» se aproximan a cadena de suministro. Las cuatro asignaciones se registran como estimadas en configuración, y los riesgos afectados marcan `ambitos` en `campos_propuestos`.
- INF tabla 47 contiene **5 políticas**, no 7 filas. Se conserva una acción por fila con todas las propuestas de su celda; se agregan 2 acciones de las viñetas de cadena de suministro.
- INF tabla 48 contiene **38 filas contando el encabezado: 37 acciones**. Ninguna se descarta. El nombre combinado de acoso no coincide literalmente con MAT: filas 3–6 (supervisores, colaboradores, operadores, jefes de planta) se vinculan a `riesgo-02`; filas 7–8 (proveedores, distribuidores), a `riesgo-09`. Tabla explícita por actor, vínculos marcados estimados. «Pago insuficiente o no justo» coincide después de recortar el salto final. Cualquier correspondencia nueva desconocida aborta antes de escribir.
- BRE «Análisis de brechas DD» fila 105 no tiene marca de sí/no. Se propone `incorporado: no`, por falta de evidencia de capacitación periódica indicada en la brecha; se conserva `incorporado_fuente: null` y se marca `campos_propuestos: [incorporado]`. **Revisar esta interpretación.**
- BRE «Análisis gestión en DDHH» fila 80 tiene calificación y descripción vacías: permanecen `null`. No se inventa un cero ni se recalcula el agregado del gráfico.
- Los responsables se traducen con el archivo privado en cada ejecución. Se separan `/`, saltos de línea y anotaciones entre paréntesis; en MAT!28 las anotaciones también separan nombres consecutivos. Se usa únicamente la correspondencia privada exacta. Nombres desconocidos o valores `POR_CONFIRMAR` abortan y se imprimen únicamente en el diagnóstico local. Los campos personales nunca se serializan.
- «Gestión Humana» y «Sostenibilidad» se toman del mandato de formación/comunicación y dirección técnica del subcomité. Las áreas de MAT conservan los valores públicos del diccionario privado, aun cuando su denominación sea diferente. Donde el informe no asigna área se usa «Por definir».
- Se excluye íntegramente la sección de articulación al sistema integrado de gestión por el error de otro cliente. No se corrigen las restantes redacciones de las fuentes.

| Componente | Acciones | Con campos propuestos |
|---|---:|---:|
| 1 · Compromiso organizacional | 7 | 7 |
| 2 · Articulación y subcomité | 5 | 5 |
| 3 · Gestión de riesgos | 37 | 37 |
| 4 · Reclamación y reparación | 3 | 3 |
| 5 · Medición y seguimiento | 2 | 2 |
| 6 · Comunicación y reporte | 4 | 4 |
| Total | 58 | 58 |

## Evaluación de ejemplo

Escenario fijo de diciembre de 2026, sin carácter de medición real. Las primeras cuatro etapas tienen las brechas de madurez más grandes y mejoran entre +0,3 y +0,8 sobre su valor exacto: aproximadamente +0,58, +0,55, +0,48 y +0,73. Se priorizan políticas, identificación, prevención y seguimiento. El trabajo infantil permanece en 4,0; horario de trabajo baja 0,1 para evitar un escenario de mejora uniforme. Los demás cambios son moderados y todos los valores quedan entre 0 y 5.

| Eje | Puntaje de ejemplo |
|---|---:|
| etapa-ocde-1 · Políticas y sistemas | 3,5 |
| etapa-ocde-2 · Identificar impactos | 3,5 |
| etapa-ocde-3 · Cesar, prevenir o mitigar | 3,4 |
| etapa-ocde-4 · Seguimiento | 3,5 |
| etapa-ocde-5 · Comunicación | 3,3 |
| etapa-ocde-6 · Remediación | 4,0 |
| tema-ddhh-1 · Trabajo forzoso | 3,9 |
| tema-ddhh-2 · Trabajo infantil | 4,0 |
| tema-ddhh-3 · Discriminación, acoso y violencia | 4,2 |
| tema-ddhh-4 · Igualdad de género | 3,5 |
| tema-ddhh-5 · Libertad de asociación | 4,2 |
| tema-ddhh-6 · Salud y seguridad | 4,5 |
| tema-ddhh-7 · Remuneración | 4,4 |
| tema-ddhh-8 · Horario de trabajo | 4,4 |
| tema-ddhh-9 · Condiciones laborales | 4,3 |
| tema-ddhh-10 · Derechos ambientales | 4,0 |

## Regeneración y comprobación

Requiere Python 3.9 con `openpyxl` y `python-docx`, Node y el diccionario local `privado/areas-responsables.json`. No requiere instalar dependencias nuevas ni acceder a red.

```sh
python3 scripts/extraer_solgas.py "<carpeta de fuentes>"
npm test
```

Los 7 JSON se escriben en UTF-8 con 2 espacios y orden estable, solo después de validar todas las correspondencias y la ausencia de nombres personales. Una segunda ejecución debe producir los mismos bytes. En CI las pruebas de datos no leen los documentos originales; los puntajes esperados están escritos en las pruebas. La prueba de privacidad se omite con `skip` si falta el diccionario privado; en local revisa también `docs`, `scripts` y `tests` además de `public`.
