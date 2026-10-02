import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const codigo = readFileSync(new URL('../public/api-supabase.js', import.meta.url), 'utf8');
function cargar(fetchFalso){
  const llamadas = [];
  const window = {GH_CONFIG: {supabaseUrl: 'https://x.supabase.co/', supabaseKey: 'k'},
    fetch: async (url, opt = {}) => { llamadas.push({url, opt}); return fetchFalso(url, opt); }};
  vm.runInNewContext(codigo, {window, Response, URLSearchParams});
  return {D: window.GHDatos, llamadas};
}
const ok = body => new Response(JSON.stringify(body), {status: 200});

test('list lee de la base y marca estado base', async () => {
  const {D, llamadas} = cargar(() => ok([{data: {id: 'accion-01'}}]));
  assert.deepEqual(await D.list('plan-acciones'), [{id: 'accion-01'}]);
  assert.equal(D.estado, 'base');
  assert.match(llamadas[0].url, /^https:\/\/x\.supabase\.co\/rest\/v1\/registros\?select=data&coleccion=eq\.plan-acciones/);
});

test('list cae al respaldo si la base falla y lo informa', async () => {
  const {D} = cargar(url => url.startsWith('data/') ? ok([{id: 'accion-01', origen: 'semilla'}]) : new Response('caida', {status: 503}));
  assert.deepEqual(await D.list('plan-acciones'), [{id: 'accion-01', origen: 'semilla'}]);
  assert.equal(D.estado, 'respaldo');
  assert.match(D.error, /503/);
});

test('set escribe un solo registro con upsert', async () => {
  const {D, llamadas} = cargar(() => new Response(null, {status: 201}));
  await D.set('evaluaciones', 'eval-2025-12', {id: 'eval-2025-12'});
  const body = JSON.parse(llamadas[0].opt.body);
  assert.equal(llamadas[0].opt.method, 'POST');
  assert.equal(body.coleccion, 'evaluaciones');
  assert.equal(body.id, 'eval-2025-12');
  assert.match(llamadas[0].opt.headers.Prefer, /merge-duplicates/);
});

test('set rechaza colecciones, ids y datos inválidos sin llamar a la base', async () => {
  const {D, llamadas} = cargar(() => ok([]));
  await assert.rejects(D.set('riesgos', 'riesgo-01', {id: 'riesgo-01'}), /coleccion_invalida/);
  await assert.rejects(D.set('evaluaciones', 'Eval 1', {id: 'Eval 1'}), /id_invalido/);
  await assert.rejects(D.set('evaluaciones', 'eval-1', {id: 'eval-2'}), /data_invalida/);
  await assert.rejects(D.set('evaluaciones', 'eval-1', [1]), /data_invalida/);
  assert.equal(llamadas.length, 0);
});

test('set propaga el error de la base (sin respaldo para escrituras)', async () => {
  const {D} = cargar(() => new Response('no', {status: 401}));
  await assert.rejects(D.set('plan-acciones', 'accion-01', {id: 'accion-01'}), /supabase 401/);
});
