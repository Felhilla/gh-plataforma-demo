import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../public/riesgos.js');
const json = path => JSON.parse(readFileSync(new URL('../public/' + path, import.meta.url)));
const riesgos = json('data/riesgos.json');
const acciones = json('data/plan.json');
const cfg = json('config/criticidad-config.json');

test('ubicar: corrupción Alta × Baja; riesgo sin probabilidad; 18 riesgos únicos', () => {
  const u = R.ubicar(riesgos, cfg);
  assert.ok(u.celdas['Alta|baja'].includes('riesgo-15'));
  assert.ok(u.sinProbabilidad.includes('riesgo-17'));
  const ids = [...Object.values(u.celdas).flat(), ...u.sinProbabilidad];
  assert.equal(ids.length, 18); assert.equal(new Set(ids).size, 18);
  assert.equal(Object.keys(u.celdas).length, 9);
});
test('cada riesgo de dos actores se ubica por la evaluación dominante', () => {
  const u = R.ubicar(riesgos, cfg); const multiples = riesgos.filter(r => r.evaluaciones.length > 1);
  assert.equal(multiples.length, 2);
  for (const r of multiples) {
    const c = R.criticidad(r, cfg);
    assert.ok(u.celdas[c.nivel + '|' + c.evaluacionDominante.probabilidad].includes(r.id));
    assert.equal(Object.values(u.celdas).filter(ids => ids.includes(r.id)).length, 1);
  }
});
test('filtrar combina los cuatro criterios con y, considerando todos los actores', () => {
  for (const r of riesgos) {
    const filtros = {criticidad:R.criticidad(r, cfg).nivel, ambito:r.ambitos[0], vinculacion:r.evaluaciones.at(-1).vinculacion, derecho:r.derecho_humano};
    const result = R.filtrar(riesgos, filtros, cfg);
    assert.ok(result.includes(r));
    assert.deepEqual(result, riesgos.filter(x => R.criticidad(x,cfg).nivel === filtros.criticidad && x.ambitos.includes(filtros.ambito) && x.evaluaciones.some(e => e.vinculacion === filtros.vinculacion) && x.derecho_humano === filtros.derecho));
  }
});
test('filtros vacíos devuelven todo y valores desconocidos devuelven vacío', () => {
  assert.deepEqual(R.filtrar(riesgos, {}, cfg), riesgos);
  assert.deepEqual(R.filtrar(riesgos, {criticidad:'', ambito:'', vinculacion:'', derecho:''}, cfg), riesgos);
  for (const key of ['criticidad','ambito','vinculacion','derecho']) assert.deepEqual(R.filtrar(riesgos, {[key]:'desconocido'}, cfg), []);
});
test('accionesDe cubre cada riesgo y no inventa asociaciones', () => {
  for (const r of riesgos) {
    assert.ok(R.accionesDe(r.id,acciones).length > 0);
    assert.deepEqual(R.accionesDe(r.id,acciones),acciones.filter(a => a.riesgos.includes(r.id)));
  }
  assert.deepEqual(R.accionesDe('inexistente',acciones), []);
});
test('opciones presentes, únicas y estables aunque cambie el orden de entrada', () => {
  const o = R.opcionesFiltro(riesgos,cfg);
  assert.deepEqual(o, R.opcionesFiltro([...riesgos].reverse(),cfg));
  for (const values of Object.values(o)) assert.equal(values.length,new Set(values).size);
  assert.deepEqual(o.criticidad,['Alta','Media','Baja']);
  assert.deepEqual(o.derecho,[...new Set(riesgos.map(r => r.derecho_humano))].sort());
  const uno = R.opcionesFiltro([riesgos[0]],cfg);
  assert.deepEqual(uno.criticidad,[R.criticidad(riesgos[0],cfg).nivel]);
  assert.deepEqual(new Set(uno.ambito),new Set(riesgos[0].ambitos));
  assert.deepEqual(new Set(uno.vinculacion),new Set(riesgos[0].evaluaciones.map(e=>e.vinculacion)));
  assert.deepEqual(R.opcionesFiltro([],cfg),{criticidad:[],ambito:[],vinculacion:[],derecho:[]});
});
test('las funciones nuevas no mutan datos, filtros ni configuración', () => {
  const antes = JSON.stringify({riesgos,acciones,cfg}); const filtro = Object.freeze({criticidad:'Media'});
  R.filtrar(riesgos,filtro,cfg); R.ubicar(riesgos,cfg); R.accionesDe(riesgos[0].id,acciones); R.opcionesFiltro(riesgos,cfg);
  assert.equal(JSON.stringify({riesgos,acciones,cfg}),antes);
});
test('index carga scripts locales diferidos y en orden válido', () => {
  const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)src="([^"]+)"[^>]*>/g)];
  assert.deepEqual(scripts.map(m=>m[2]),['config.js','api-supabase.js','riesgos.js','app.js','vista-riesgos.js','vista-estandares.js','vista-plan.js']);
  assert.ok(scripts.every(m=>m[1].includes('defer')));
});
