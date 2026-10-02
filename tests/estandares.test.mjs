import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../public/estandares.js');
const estandares = require('../public/data/estandares.json');
const evaluaciones = require('../public/data/evaluaciones.json');
const umbrales = require('../public/config/umbrales-config.json');
const ejes = estandares.ejes;
const entrada = () => ({nombre:'Medición pública', fecha:'2027-03', puntajes:Object.fromEntries(ejes.map(e => [e.id, '3,5']))});

test('combinar reemplaza por id con la base y conserva las estáticas sin mutarlas', () => {
  const base = {...evaluaciones[0], nombre:'Revisada'};
  const copia = structuredClone(evaluaciones);
  const r = E.combinar(evaluaciones, [base]);
  assert.equal(r.length, 2); assert.equal(r.find(e => e.id === base.id).nombre, 'Revisada');
  assert.deepEqual(r.find(e => e.id === evaluaciones[1].id), evaluaciones[1]); assert.deepEqual(evaluaciones, copia);
});
test('ordenar usa fecha descendente y no modifica el arreglo; ejesDe separa 6 y 10 ejes', () => {
  assert.equal(E.ordenar(evaluaciones)[0].id, 'eval-ejemplo-2026');
  assert.equal(evaluaciones[0].id, 'eval-2025-12');
  assert.equal(E.ejesDe('etapas-ocde', estandares).length, 6);
  assert.equal(E.ejesDe('temas-ddhh', estandares).length, 10);
});
test('comparar: principal menos comparación con las dos evaluaciones reales del archivo', () => {
  const filas = E.comparar(evaluaciones[0], evaluaciones[1], ejes);
  assert.equal(filas.length, 16);
  assert.ok(Math.abs(filas[0].diferencia - (-0.583333333333333)) < 1e-12);
  assert.ok(Math.abs(filas[13].diferencia - 0.1) < 1e-12);
  assert.equal(filas[7].diferencia, 0);
  filas.forEach(f => assert.equal(f.diferencia, f.a - f.b));
  assert.equal(E.comparar(evaluaciones[0], null, ejes)[0].diferencia, null);
});
test('validar acepta 16 ejes con coma y genera registro e id normalizado', () => {
  const r = E.validarEvaluacion(entrada(), ejes, []);
  assert.equal(r.ok, true); assert.equal(r.evaluacion.id, 'eval-2027-03-medicion-publica');
  assert.equal(r.evaluacion.origen, 'cargada'); assert.equal(Object.keys(r.evaluacion.puntajes).length, 16);
  assert.ok(Object.values(r.evaluacion.puntajes).every(n => n === 3.5));
});
test('validar rechaza eje faltante, valores fuera de rango y texto', () => {
  for (const valor of [undefined, '-0,1', '5,1', 'basura', '', null]) {
    const d = entrada(); d.puntajes[ejes[0].id] = valor;
    const r = E.validarEvaluacion(d, ejes, []); assert.equal(r.ok, false); assert.ok(r.errores[ejes[0].id]); assert.equal(r.evaluacion, null);
  }
});
test('validar rechaza nombre vacío o largo, fecha inválida e id duplicado', () => {
  for (const nombre of ['', '   ', 'a'.repeat(81)]) assert.ok(E.validarEvaluacion({...entrada(), nombre}, ejes, []).errores.nombre);
  for (const fecha of ['', '2027-00', '2027-13', '2027-1', '2027-02-01', '0000-01']) assert.ok(E.validarEvaluacion({...entrada(), fecha}, ejes, []).errores.fecha);
  assert.ok(E.validarEvaluacion(entrada(), ejes, ['eval-2027-03-medicion-publica']).errores.id);
  assert.ok(E.validarEvaluacion({...entrada(), nombre:'a'.repeat(80)}, ejes, []).evaluacion.id.length <= 80);
});
test('parsearPuntaje admite coma y punto y rechaza vacíos, basura y no finitos', () => {
  assert.equal(E.parsearPuntaje('3,5'), 3.5); assert.equal(E.parsearPuntaje('3.5'), 3.5); assert.equal(E.parsearPuntaje(' 0 '), 0);
  for (const v of ['', ' ', '3,5x', '1.2.3', '0x10', 'Infinity', null, undefined, NaN, Infinity, true]) assert.equal(E.parsearPuntaje(v), null);
});
test('colorPara respeta los límites exactos de la configuración', () => {
  for (const [v, i] of [[2.99,0], [3,1], [3.99,1], [4,2], [0,0], [5,2]]) assert.equal(E.colorPara(v, umbrales), umbrales.cortes[i].color);
  assert.equal(E.colorPara(null, umbrales), null);
});
test('puntosPoligono: cero es el centro; cinco alcanza el radio en cada dirección', () => {
  assert.deepEqual(E.puntosPoligono([0,0,0,0], 100, [20,30]), [[20,30],[20,30],[20,30],[20,30]]);
  const puntos = E.puntosPoligono([5,5,5,5], 100, [20,30]);
  assert.deepEqual(puntos[0], [20.000000000000007,-70]);
  puntos.forEach(([x,y]) => assert.ok(Math.abs(Math.hypot(x-20,y-30)-100) < 1e-10));
});

// DOM mínimo para verificar contratos de la vista sin navegador, dependencias ni red.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
async function montar({estado = 'base', guardar = async () => {}, plan = []} = {}) {
  const todos = [];
  class Nodo {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.eventos = {}; this._texto = ''; todos.push(this); }
    set textContent(t) { this._texto = String(t); this.children = []; }
    get textContent() { return this._texto + this.children.map(n => n.textContent).join(''); }
    append(...nodos) { for (const n of nodos) { n.parent = this; this.children.push(n); } }
    prepend(n) { n.parent = this; this.children.unshift(n); }
    replaceChildren(...n) { for (const c of this.children) c.parent = null; this.children = []; this.append(...n); }
    setAttribute(k,v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k,fn) { this.eventos[k] = fn; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    get lastChild() { return this.children.at(-1); }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.eventos.close?.(); }
    querySelector(s) { return todos.find(n => n.isConnected && (s.startsWith('#') ? n.id === s.slice(1) : n.tag === s)) || null; }
  }
  const document = {createElement: t => new Nodo(t), createElementNS: (_,t) => new Nodo(t)};
  document.body = new Nodo('body');
  const contenedor = new Nodo('main'); document.body.append(contenedor);
  const api = {estado, list: async () => [], set: guardar}; let vista, ruta;
  const App = {el: (tag,texto,clase) => {const n = new Nodo(tag); if (texto != null) n.textContent = texto; n.className = clase; return n;}, registrarVista: (_,v) => {vista = v;}, obtenerPlan: () => Promise.resolve(plan)};
  const contexto = {App, Estandares:E, GHDatos:api, document, URLSearchParams, Intl, history:{replaceState: (_, __, url) => {ruta = url;}}}; contexto.window = contexto;
  vm.runInNewContext(readFileSync(new URL('../public/vista-estandares.js', import.meta.url), 'utf8'), contexto);
  const limpiar = vista.render(contenedor, {estandares, evaluaciones, umbrales, planConfig:require('../public/config/plan-config.json')}, {filtros:new URLSearchParams()});
  await new Promise(resolve => setImmediate(resolve));
  const buscar = pred => todos.find(n => n.isConnected && pred(n));
  const boton = texto => buscar(n => n.tag === 'button' && n.textContent === texto);
  const campo = id => buscar(n => n.id === 'e3-campo-' + id);
  return {document, todos, contenedor, limpiar, buscar, boton, campo, ruta:() => ruta};
}
test('vista: dos SVG, tablas equivalentes, URL, plan asíncrono y respaldo visible', async () => {
  const v = await montar({estado:'respaldo', plan:[{id:'accion-01', titulo:'Acción vinculada', componente:'componente-1', estado:'pendiente', ejes:['etapa-ocde-1'], vinculos_estimados:true}]});
  assert.equal(v.todos.filter(n => n.isConnected && n.tag === 'svg').length, 2);
  assert.equal(v.todos.filter(n => n.isConnected && n.tag === 'table').length, 2);
  assert.match(v.ruta(), /eval=eval-ejemplo-2026&vs=eval-2025-12/);
  assert.match(v.contenedor.textContent, /No hay conexión con la base de datos/);
  assert.match(v.contenedor.textContent, /Esta evaluación solo registra puntajes/);
  assert.match(v.contenedor.textContent, /Vínculo estimado/);
  v.boton('Cargar nueva evaluación').onclick(); assert.equal(v.boton('Guardar evaluación').disabled, true);
  v.limpiar(); assert.equal(v.buscar(n => n.tag === 'dialog'), undefined);
});
test('vista: al fallar el guardado conserva campos; al reintentar escribe un registro y selecciona la evaluación', async () => {
  let falla = true; const llamadas = [];
  const v = await montar({guardar:async (...args) => {llamadas.push(args); if (falla) throw Error('sin conexión');}});
  v.boton('Cargar nueva evaluación').onclick();
  v.campo('nombre').value = 'Medición pública'; v.campo('fecha').value = '2027-03';
  v.boton('Prellenar con la evaluación actual').onclick();
  assert.equal(v.campo('etapa-ocde-1').value, '3,5');
  const form = v.buscar(n => n.tag === 'form');
  await form.onsubmit({preventDefault(){}});
  assert.equal(v.campo('nombre').value, 'Medición pública');
  assert.match(v.buscar(n => n.attrs.role === 'alert').textContent, /Los datos escritos se conservan/);
  falla = false; await form.onsubmit({preventDefault(){}});
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1][0], 'evaluaciones'); assert.equal(llamadas[1][1], 'eval-2027-03-medicion-publica');
  assert.equal(Object.keys(llamadas[1][2].puntajes).length, 16);
  assert.match(v.ruta(), /eval=eval-2027-03-medicion-publica&vs=eval-ejemplo-2026/);
  assert.match(v.contenedor.textContent, /Cargada en la plataforma/);
  assert.equal(v.buscar(n => n.tag === 'dialog'), undefined);
});
test('vista: seleccionar la fuente muestra criterios e indicadores y el teclado cambia puntajes en décimas', async () => {
  const v = await montar();
  const selector = v.buscar(n => n.id === 'e3-eval'); selector.value = 'eval-2025-12'; selector.onchange();
  assert.match(v.contenedor.textContent, /Adopción de una política empresarial responsable/);
  assert.match(v.contenedor.textContent, /Brecha identificada/);
  assert.match(v.contenedor.textContent, /Documentos analizados/);
  v.boton('Cargar nueva evaluación').onclick();
  const input = v.campo('etapa-ocde-1'); input.value = '3,5';
  input.eventos.keydown({key:'ArrowUp', preventDefault(){}}); assert.equal(input.value, '3,6');
  input.eventos.keydown({key:'End', preventDefault(){}}); assert.equal(input.value, '5,0');
});
