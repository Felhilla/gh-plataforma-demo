import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Plan from '../public/plan.js';
const leer = p => JSON.parse(readFileSync(new URL('../public/' + p, import.meta.url), 'utf8'));
const acciones = leer('data/plan.json');
const cfg = leer('config/plan-config.json');
const ahora = '2026-10-02T12:00:00.000Z';
const cambiar = (c, a = acciones[0]) => Plan.aplicarCambio(a, c, cfg, ahora);

test('combinar conserva 58 estáticas, reemplaza por id e incluye ids nuevos sin mutar', () => {
  const base = [{...acciones[0], responsable: 'Área editada'}, {...acciones[1], id: 'accion-99'}];
  const resultado = Plan.combinar(acciones, base);
  assert.equal(resultado.length, 59);
  assert.equal(resultado[0].responsable, 'Área editada');
  assert.deepEqual(resultado.slice(1, 58), acciones.slice(1));
  resultado[0].riesgos.push('nuevo'); assert.equal(base[0].riesgos.length, 0);
  assert.equal(Plan.combinar(acciones, []).length, 58);
});

test('consistencia: cumplida implica 100 y avance 100 implica cumplida', () => {
  assert.equal(cambiar({estado: 'cumplida'}).accion.avance, 100);
  assert.equal(cambiar({avance: 100}).accion.estado, 'cumplida');
});
test('consistencia: avanzar una pendiente la pone en curso; pendiente vuelve a cero', () => {
  assert.equal(cambiar({avance: 20}).accion.estado, 'en-curso');
  assert.equal(cambiar({estado: 'pendiente'}, {...acciones[0], estado: 'en-curso', avance: 70}).accion.avance, 0);
  assert.equal(cambiar({avance: 40}, {...acciones[0], estado: 'cumplida', avance: 100}).accion.estado, 'en-curso');
  assert.equal(cambiar({estado: 'pendiente', avance: 100}).accion.avance, 0);
});
test('rechaza valores y campos inválidos', () => {
  [{estado: 'otro'}, {avance: -1}, {avance: 101}, {avance: 33.5}, {avance: '20'}, {plazo: '2026-02-30'}, {plazo: 'mañana'}, {plazo: '2026-2-01'}, {responsable: 'a'.repeat(121)}, {nota_seguimiento: 'a'.repeat(501)}, {titulo: 'nuevo'}, {riesgos: []}].forEach(c => {
    const r = cambiar(c); assert.equal(r.ok, false, JSON.stringify(c)); assert.ok(r.errores.length); assert.strictEqual(r.accion, acciones[0]);
  });
  assert.equal(cambiar({plazo: '2028-02-29', responsable: 'a'.repeat(120), nota_seguimiento: 'a'.repeat(500)}).ok, true);
});
test('historial, propuestas, fecha y ausencia de mutaciones', () => {
  const original = structuredClone(acciones[0]); const antes = structuredClone(original);
  const r = cambiar({avance: 10, responsable: 'Equipo'}, original).accion;
  assert.deepEqual(original, antes); assert.equal(r.actualizado, ahora);
  assert.equal(r.historial.length, 3);
  assert.deepEqual(r.historial.find(h => h.campo === 'avance'), {fecha: ahora, campo: 'avance', antes: 0, despues: 10});
  assert.ok(!r.campos_propuestos.includes('avance')); assert.ok(!r.campos_propuestos.includes('responsable'));
  assert.ok(r.campos_propuestos.includes('titulo'));
  let a = r; for (let i = 0; i < 25; i++) a = cambiar({nota_seguimiento: String(i)}, a).accion;
  assert.equal(a.historial.length, 20); assert.equal(a.historial.at(-1).despues, '24');
  assert.ok(!cambiar({plazo: original.plazo}, original).accion.campos_propuestos.includes('plazo'));
});
test('resumen y vencimientos con fecha fija, incluye seis componentes vacíos', () => {
  const r = Plan.resumen(acciones, cfg, '2026-01-01');
  assert.equal(r.avanceGlobal, 0); assert.equal(r.porEstado.pendiente, 58); assert.equal(r.vencidas, 0); assert.equal(r.porComponente.length, 6);
  const muestra = [{...acciones[0], plazo: '2026-01-01'}, {...acciones[1], avance: 50, estado: 'en-curso', plazo: '2026-01-02'}, {...acciones[2], avance: 100, estado: 'cumplida', plazo: '2025-01-01'}];
  const s = Plan.resumen(muestra, cfg, '2026-01-02'); assert.equal(s.avanceGlobal, 50); assert.equal(s.vencidas, 1);
  assert.deepEqual(s.porEstado, {pendiente: 1, 'en-curso': 1, cumplida: 1}); assert.equal(s.porComponente[0].avance, 50);
  assert.equal(Plan.resumen([], cfg, '2026-01-01').avanceGlobal, 0);
  assert.equal(Plan.vencida(muestra[1], '2026-01-02'), false);
});
test('filtros combinados y búsqueda ignoran mayúsculas y tildes', () => {
  const a = {...acciones[0], titulo: 'MEDICIÓN', descripcion: 'Comunicación', riesgos: ['riesgo-01'], ejes: ['eje-01']};
  const f = {componente: a.componente, estado: 'pendiente', riesgo: 'riesgo-01', eje: 'eje-01', q: 'medicion', accion: 'otra'};
  assert.deepEqual(Plan.filtrar([a], f), [a]); assert.equal(Plan.filtrar([a], {...f, q: 'COMUNICACION'}).length, 1);
  for (const campo of ['componente', 'estado', 'riesgo', 'eje', 'q']) assert.equal(Plan.filtrar([a], {...f, [campo]: 'inexistente'}).length, 0);
  assert.equal(Plan.filtrar([a], new URLSearchParams('q=medicion')).length, 1);
});

async function iniciar({set = async () => {}, list, timeout = false} = {}) {
  const eventos = {}; const nodos = new Map();
  const nodo = () => ({dataset: {}, children: [], append(...n) {this.children.push(...n);}, replaceChildren(...n) {this.children = n;}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, focus() {}, querySelector() { return null; }});
  const document = {documentElement: nodo(), activeElement: null, addEventListener(t, fn) {eventos[t] = fn;}, createElement: nodo, querySelector: s => s === '.saltar' ? nodo() : null, getElementById: id => {if (!nodos.has(id)) nodos.set(id, nodo()); return nodos.get(id);}};
  const api = {estado: 'base', set, list: list || (async () => [])};
  const contexto = {document, location: {search: '', hash: '#/', pathname: '/'}, URLSearchParams, Plan, Riesgos: {resumen: () => ({Alta: 1, Media: 8})}, GHDatos: api, setTimeout: timeout ? (fn, ms) => {assert.equal(ms, 5000); queueMicrotask(fn); return 1;} : setTimeout, clearTimeout: timeout ? () => {} : clearTimeout, fetch: async ruta => ({ok: true, json: async () => leer(ruta)})};
  contexto.window = contexto; contexto.addEventListener = () => {};
  vm.runInNewContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), contexto);
  await eventos.DOMContentLoaded(); return contexto.App;
}
test('App carga combina la base y mantiene obtenerPlan síncrono', async () => {
  const app = await iniciar({list: async () => [{...acciones[0], avance: 30, estado: 'en-curso'}]});
  assert.equal(app.obtenerPlan().length, 58); assert.equal(app.obtenerPlan()[0].avance, 30); assert.equal(app.estadoBase(), 'base');
});
test('App.guardarAccion escribe una sola acción completa y actualiza memoria tras éxito', async () => {
  const llamadas = []; const app = await iniciar({set: async (...args) => llamadas.push(args)});
  const r = await app.guardarAccion('accion-01', {avance: 30});
  assert.equal(llamadas.length, 1); const [coleccion, id, data] = llamadas[0];
  assert.equal(coleccion, 'plan-acciones'); assert.equal(id, data.id); assert.equal(data.descripcion, acciones[0].descripcion);
  assert.equal(app.obtenerPlan()[0], r); assert.equal(r.avance, 30);
  await assert.rejects(app.guardarAccion('accion-01', {titulo: 'No'})); assert.equal(llamadas.length, 1);
});
test('App.guardarAccion no cambia memoria al fallar set', async () => {
  const app = await iniciar({set: async () => {throw Error('fallo');}}); const memoria = app.obtenerPlan(); const antes = JSON.stringify(memoria);
  await assert.rejects(app.guardarAccion('accion-01', {avance: 20}), /No se pudo guardar/);
  assert.strictEqual(app.obtenerPlan(), memoria); assert.equal(JSON.stringify(memoria), antes);
});
test('App usa respaldo ante error o espera agotada y bloquea escrituras', async () => {
  for (const opciones of [{list: async () => {throw Error('sin conexión');}}, {list: () => new Promise(() => {}), timeout: true}]) {
    const app = await iniciar(opciones); assert.equal(app.estadoBase(), 'respaldo'); assert.equal(app.obtenerPlan().length, 58);
    await assert.rejects(app.guardarAccion('accion-01', {avance: 10}), /No hay conexión/);
  }
});
