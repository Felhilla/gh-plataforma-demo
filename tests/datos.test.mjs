import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const riesgos = read('public/data/riesgos.json');
const estandares = read('public/data/estandares.json');
const evaluaciones = read('public/data/evaluaciones.json');
const plan = read('public/data/plan.json');
const cfg = read('public/config/criticidad-config.json');
const planCfg = read('public/config/plan-config.json');
const umbrales = read('public/config/umbrales-config.json');
const R = createRequire(import.meta.url)('../public/riesgos.js');
const copy = value => JSON.parse(JSON.stringify(value));
const near = (a, b, tolerance = 0.001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

// Valores independientes, leídos de BRE (E6/E8/E12/E14/E16/E17 y C6:C15).
const puntajesFuente = {
  'etapa-ocde-1': 2.916666666666667,
  'etapa-ocde-2': 2.946113782051282,
  'etapa-ocde-3': 2.916666666666667,
  'etapa-ocde-4': 2.770833333333333,
  'etapa-ocde-5': 3,
  'etapa-ocde-6': 3.8333333333333335,
  'tema-ddhh-1': 3.75,
  'tema-ddhh-2': 4,
  'tema-ddhh-3': 4.071428571428571,
  'tema-ddhh-4': 3,
  'tema-ddhh-5': 4.0625,
  'tema-ddhh-6': 4.4,
  'tema-ddhh-7': 4.3,
  'tema-ddhh-8': 4.5,
  'tema-ddhh-9': 4.166666666666667,
  'tema-ddhh-10': 3.7777777777777777,
};
// Nombre corto -> id estable -> nivel esperado, cotejado contra MAT.
const correspondencia = {
  'Exceso de horas': ['riesgo-01', 'Media'],
  'Acoso interno': ['riesgo-02', 'Baja'],
  'Ergonómicos': ['riesgo-03', 'Media'],
  'Pago insuficiente': ['riesgo-04', 'Baja'],
  'Exposición a GLP': ['riesgo-05', 'Media'],
  'Sustancias químicas': ['riesgo-06', 'Baja'],
  'Menores de edad': ['riesgo-07', 'Baja'],
  'Condiciones de trabajo en cadena de valor': ['riesgo-08', 'Media'],
  'Acoso en cadena de valor': ['riesgo-09', 'Baja'],
  'Incumplimientos sociolaborales': ['riesgo-10', 'Media'],
  'Informalidad': ['riesgo-11', 'Media'],
  'Mínimo vital': ['riesgo-12', 'Media'],
  'Tránsito pesado y ruido': ['riesgo-13', 'Baja'],
  'Discriminación por discapacidad': ['riesgo-14', 'Baja'],
  'Corrupción': ['riesgo-15', 'Alta'],
  'Comunicación con grupos de interés': ['riesgo-16', 'Media'],
  'Afectaciones no informadas': ['riesgo-17', 'Baja'],
  'Libertad sindical': ['riesgo-18', 'Baja'],
};

function idsValidos(records, pattern) {
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  records.forEach(r => assert.match(r.id, pattern));
}
function* files(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const name = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* files(name);
    else if (entry.isFile()) yield name;
  }
}

test('ids únicos, ordenados y con patrones válidos', () => {
  idsValidos(riesgos, /^riesgo-\d{2}$/);
  idsValidos(estandares.ejes, /^(etapa-ocde-\d|tema-ddhh-\d{1,2})$/);
  idsValidos(evaluaciones, /^eval-[a-z0-9-]+$/);
  idsValidos(plan, /^accion-\d{2,3}$/);
  idsValidos(planCfg.componentes, /^componente-[1-6]$/);
  assert.equal(riesgos.length, 18);
  assert.equal(evaluaciones.length, 2);
  assert.deepEqual(riesgos.map(r => r.id), Object.values(correspondencia).map(([id]) => id));
  assert.deepEqual(estandares.ejes.map(e => e.id), Object.keys(puntajesFuente));
  assert.deepEqual(plan.map(a => a.id), plan.map((_, i) => `accion-${String(i + 1).padStart(2, '0')}`));
});

test('criticidad: 1 Alta (corrupción), 8 Media y 9 Baja por id', () => {
  assert.deepEqual(R.resumen(riesgos, cfg), { Baja: 9, Media: 8, Alta: 1 });
  for (const [nombre, [id, nivel]] of Object.entries(correspondencia)) {
    assert.equal(R.criticidad(riesgos.find(r => r.id === id), cfg).nivel, nivel, nombre);
  }
  riesgos.forEach(r => {
    assert.ok(!Object.hasOwn(r, 'criticidad'));
    assert.ok(!Object.hasOwn(r, 'ejes'));
    assert.ok(r.derecho_humano.trim());
    assert.equal(r.origen, 'fuente');
    r.ambitos.forEach(a => assert.ok(cfg.ambitos.some(x => x.id === a)));
  });
});

test('20 evaluaciones: enteros, vinculación y probabilidad válidos; vacío preservado', () => {
  const rows = riesgos.flatMap(r => r.evaluaciones);
  assert.equal(rows.length, 20);
  assert.deepEqual(riesgos.filter(r => r.evaluaciones.length === 2).map(r => r.id), ['riesgo-01', 'riesgo-03']);
  for (const e of rows) {
    for (const key of ['escala', 'alcance', 'irreparable']) assert.ok(Number.isInteger(e[key]) && e[key] >= 1 && e[key] <= 3);
    assert.ok(e.vinculacion === null || Object.hasOwn(cfg.vinculacion, e.vinculacion));
    assert.ok(e.probabilidad === null || cfg.probabilidad.includes(e.probabilidad));
    assert.ok(e.actor_genera && e.actor_reporta);
  }
  assert.deepEqual(rows.filter(e => e.probabilidad === null).map(e => e.fila_fuente), [71]);
});

test('arañas: 16 ejes, fuente exacta y ejemplo fijo con mejora, estabilidad y descenso', () => {
  for (const e of evaluaciones) {
    assert.deepEqual(Object.keys(e.puntajes).sort(), Object.keys(puntajesFuente).sort());
    Object.values(e.puntajes).forEach(p => assert.ok(Number.isFinite(p) && p >= 0 && p <= 5));
  }
  const original = evaluaciones.find(e => e.id === 'eval-2025-12');
  assert.equal(original.origen, 'fuente');
  for (const [id, expected] of Object.entries(puntajesFuente)) near(original.puntajes[id], expected);
  const ejemplo = evaluaciones.find(e => e.id === 'eval-ejemplo-2026');
  assert.equal(ejemplo.origen, 'ejemplo');
  assert.match(ejemplo.nombre, /Evaluación de ejemplo/);
  assert.equal(ejemplo.fecha, '2026-12');
  assert.deepEqual(Object.values(ejemplo.puntajes), [3.5, 3.5, 3.4, 3.5, 3.3, 4, 3.9, 4, 4.2, 3.5, 4.2, 4.5, 4.4, 4.4, 4.3, 4]);
  Object.values(ejemplo.puntajes).forEach(p => near(p * 10, Math.round(p * 10), 1e-10));
  for (let i = 1; i <= 4; i++) {
    const id = `etapa-ocde-${i}`;
    const delta = ejemplo.puntajes[id] - original.puntajes[id];
    assert.ok(delta >= 0.3 && delta <= 0.8);
  }
  assert.equal(ejemplo.puntajes['tema-ddhh-2'], original.puntajes['tema-ddhh-2']);
  near(ejemplo.puntajes['tema-ddhh-8'] - original.puntajes['tema-ddhh-8'], -0.1);
});

test('etapas iguales al promedio de sus criterios; 159 indicadores sin perder vacíos', () => {
  const etapas = estandares.ejes.filter(e => e.grafico === 'etapas-ocde');
  const temas = estandares.ejes.filter(e => e.grafico === 'temas-ddhh');
  assert.equal(etapas.length, 6);
  assert.equal(temas.length, 10);
  assert.deepEqual(etapas.map(e => e.criterios.length), [2, 4, 2, 2, 1, 1]);
  for (const e of etapas) {
    near(puntajesFuente[e.id], e.criterios.reduce((sum, c) => sum + c.calificacion, 0) / e.criterios.length, 0.01);
    assert.equal(e.hallazgos.grupos.length, e.criterios.length);
  }
  const dd = etapas.flatMap(e => e.hallazgos.grupos.flatMap(g => g.indicadores));
  const ddhh = temas.flatMap(e => e.hallazgos.indicadores);
  assert.equal(dd.length, 83);
  assert.equal(ddhh.length, 76);
  assert.ok(dd.some(i => i.fila_fuente === 82));
  for (const i of [...dd, ...ddhh]) {
    for (const key of ['pregunta', 'incorporado', 'documentos', 'descripcion', 'calificacion', 'brecha']) assert.ok(Object.hasOwn(i, key));
    assert.ok(['si', 'no'].includes(i.incorporado));
    assert.ok(i.calificacion === null || (i.calificacion >= 0 && i.calificacion <= 5));
  }
  const vacio = dd.find(i => i.fila_fuente === 105);
  assert.equal(vacio.incorporado_fuente, null);
  assert.ok(vacio.campos_propuestos.includes('incorporado'));
  assert.equal(ddhh.find(i => i.fila_fuente === 80).calificacion, null);
  assert.deepEqual(estandares.escala.map(n => n.valor), [0, 1, 2, 3, 4, 5]);
  assert.ok(estandares.escala.every(n => n.descripcion.trim()));
});

test('plan: componentes, cobertura total, referencias y 37 filas originales', () => {
  assert.equal(plan.length, 58);
  const ids = new Set(riesgos.map(r => r.id));
  const axes = new Set(estandares.ejes.map(e => e.id));
  const coverage = new Set();
  const componentCount = {};
  for (const a of plan) {
    assert.ok(planCfg.componentes.some(c => c.id === a.componente));
    componentCount[a.componente] = (componentCount[a.componente] || 0) + 1;
    assert.ok(planCfg.estados.includes(a.estado));
    assert.equal(a.estado, 'pendiente');
    assert.ok(a.avance >= 0 && a.avance <= 100);
    assert.equal(a.avance, 0);
    assert.ok(a.titulo.length > 0 && a.titulo.length <= 90);
    assert.ok(a.descripcion.trim() && a.indicador.trim());
    assert.ok(a.riesgos.length + a.ejes.length > 0);
    a.riesgos.forEach(id => { assert.ok(ids.has(id)); coverage.add(id); });
    a.ejes.forEach(id => assert.ok(axes.has(id)));
    if (a.componente === 'componente-3') {
      assert.ok(a.riesgos.length > 0);
      assert.equal(a.ejes.length, 0);
      const areas = [...new Set(a.riesgos.flatMap(id => riesgos.find(r => r.id === id).responsables))];
      assert.equal(a.responsable, areas.join(' / '));
    } else {
      assert.equal(a.riesgos.length, 0);
      assert.equal(a.vinculos_estimados, true);
    }
    for (const field of ['titulo', 'plazo', 'estado', 'avance', 'indicador']) assert.ok(a.campos_propuestos.includes(field));
    if (a.responsable === 'Por definir') assert.ok(a.campos_propuestos.includes('responsable'));
    assert.ok(!a.descripcion.includes('Nettalco'));
  }
  assert.equal(coverage.size, 18);
  assert.deepEqual(componentCount, { 'componente-1': 7, 'componente-2': 5, 'componente-3': 37, 'componente-4': 3, 'componente-5': 2, 'componente-6': 4 });
  const medidas = plan.filter(a => a.componente === 'componente-3');
  assert.deepEqual(medidas.map(a => a.fuente.fila), Array.from({ length: 37 }, (_, i) => i + 1));
  assert.deepEqual(medidas.filter(a => a.vinculos_estimados).map(a => a.riesgos[0]), ['riesgo-02', 'riesgo-02', 'riesgo-02', 'riesgo-02', 'riesgo-09', 'riesgo-09']);
});

test('plazos propuestos según criticidad agregada y fecha base', () => {
  assert.equal(planCfg.fecha_base, '2026-01-01');
  assert.deepEqual(planCfg.plazo_propuesto.por_criticidad, { Alta: 6, Media: 12, Baja: 18 });
  const plazos = { Alta: '2026-07-01', Media: '2027-01-01', Baja: '2027-07-01' };
  for (const a of plan) {
    assert.equal(a.plazo, a.riesgos.length ? plazos[R.criticidad(riesgos.find(r => r.id === a.riesgos[0]), cfg).nivel] : '2027-01-01');
    assert.match(a.plazo, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('responsables públicos completos y sin POR_CONFIRMAR', () => {
  riesgos.forEach(r => assert.ok(r.responsables.length > 0));
  const responsables = [...riesgos.flatMap(r => r.responsables), ...plan.map(a => a.responsable)];
  responsables.forEach(r => assert.ok(typeof r === 'string' && r.trim() && !r.includes('POR_CONFIRMAR')));
});

const privateMap = path.join(root, 'privado/areas-responsables.json');
test('sin nombres privados en public, docs, scripts ni tests', {
  skip: fs.existsSync(privateMap) ? false : 'Tabla privada de traducciones no disponible (CI)',
}, () => {
  const names = Object.keys(JSON.parse(fs.readFileSync(privateMap, 'utf8'))).filter(n => n.includes(' '));
  let findings = 0;
  const normalized = s => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const folder of ['public', 'docs', 'scripts', 'tests']) {
    for (const file of files(path.join(root, folder))) {
      const content = normalized(fs.readFileSync(file, 'utf8'));
      findings += names.filter(n => content.includes(normalized(n))).length;
    }
  }
  assert.equal(findings, 0, 'Se detectaron nombres privados; se omiten sus valores del diagnóstico');
});

test('errores claros por configuración incompleta o reglas no soportadas', () => {
  for (const key of ['gravedad', 'probabilidad', 'vinculacion', 'matriz', 'agregacion_riesgo', 'ambitos']) {
    const c = copy(cfg); delete c[key];
    assert.throws(() => R.criticidad(riesgos[0], c), /Configuración/);
    assert.throws(() => R.gravedad(riesgos[0].evaluaciones[0], c), /Configuración/);
    assert.throws(() => R.resumen([], c), /Configuración/);
  }
  for (const change of [
    c => { c.gravedad.cortes[0].menor_que = 3; },
    c => { c.gravedad.cortes.at(-1).menor_que = 4; },
    c => { c.gravedad.escala.enteros = false; },
    c => { c.gravedad.criterios = []; },
    c => { c.gravedad.agregacion = 'suma'; },
    c => { c.agregacion_riesgo = 'promedio'; },
    c => { c.vinculacion.causa.medidas = {}; },
  ]) {
    const c = copy(cfg); change(c);
    assert.throws(() => R.criticidad(riesgos[0], c), /Configuración/);
  }
  assert.throws(() => R.gravedad({}, {}), /Configuración/);
  assert.throws(() => R.resumen([], null), /Configuración/);
});

test('rechaza valores fuera de escala, riesgos sin evaluaciones y categorías inválidas', () => {
  for (const key of ['escala', 'alcance', 'irreparable']) {
    for (const bad of [0, 4, 1.5, null, undefined, NaN, Infinity, '2']) {
      assert.throws(() => R.gravedad({ ...riesgos[0].evaluaciones[0], [key]: bad }, cfg), /fuera de escala/);
    }
  }
  assert.throws(() => R.criticidad({ evaluaciones: [] }, cfg), /sin evaluaciones/);
  assert.throws(() => R.gravedad(null, cfg), /Evaluación/);
  for (const field of ['probabilidad', 'vinculacion']) {
    const r = copy(riesgos[0]); r.evaluaciones[0][field] = 'desconocido';
    assert.throws(() => R.criticidad(r, cfg), /inválida/);
  }
});

test('máximo por actor, empate estable y sin mutaciones ni dependencia de probabilidad', () => {
  const input = copy(riesgos[0]);
  const before = copy(input);
  const configBefore = copy(cfg);
  const result = R.criticidad(input, cfg);
  assert.equal(result.evaluacionDominante, input.evaluaciones[0]);
  near(result.promedio, 5 / 3);
  assert.deepEqual(input, before);
  assert.deepEqual(cfg, configBefore);
  input.evaluaciones.reverse();
  assert.equal(R.criticidad(input, cfg).evaluacionDominante, input.evaluaciones[1]);
  const same = copy(input.evaluaciones[1]);
  input.evaluaciones = [same, { ...same }];
  assert.equal(R.criticidad(input, cfg).evaluacionDominante, same);
  same.probabilidad = null; same.vinculacion = 'directamente-vinculada';
  assert.equal(R.criticidad(input, cfg).nivel, result.nivel);
  assert.deepEqual(R.resumen([], cfg), { Baja: 0, Media: 0, Alta: 0 });
});

test('cortes configurables y fronteras exactas 1,5 y 2,5', () => {
  const c = copy(cfg);
  c.gravedad.criterios.push('cuarto');
  assert.equal(R.gravedad({ escala: 1, alcance: 1, irreparable: 1, cuarto: 1 }, c).nivel, 'Baja');
  assert.equal(R.gravedad({ escala: 2, alcance: 2, irreparable: 1, cuarto: 1 }, c).nivel, 'Media');
  assert.equal(R.gravedad({ escala: 3, alcance: 3, irreparable: 2, cuarto: 2 }, c).nivel, 'Alta');
  c.gravedad.cortes[0].menor_que = 1.8;
  c.gravedad.cortes[1].menor_que = 2.8;
  assert.equal(R.gravedad({ escala: 2, alcance: 2, irreparable: 1, cuarto: 1 }, c).nivel, 'Baja');
  assert.equal(R.gravedad({ escala: 3, alcance: 3, irreparable: 2, cuarto: 2 }, c).nivel, 'Media');
});

test('UMD navegador funciona sin DOM ni red', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'public/riesgos.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.Riesgos.gravedad, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.Riesgos.resumen(riesgos, cfg))), { Baja: 9, Media: 8, Alta: 1 });
});

test('umbrales de araña 0–5, hipótesis explícita y colores legibles', () => {
  assert.equal(umbrales.hipotesis, true);
  assert.equal(umbrales.origen, 'propuesta');
  assert.deepEqual(umbrales.escala, { minimo: 0, maximo: 5 });
  assert.deepEqual(umbrales.cortes.map(c => c.menor_que), [3, 4, null]);
  for (const c of umbrales.cortes) {
    assert.match(c.color, /^#[0-9A-F]{6}$/i);
    const rgb = c.color.match(/[0-9A-F]{2}/gi).map(v => parseInt(v, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    assert.ok(1.05 / (luminance + 0.05) >= 4.5);
  }
});
