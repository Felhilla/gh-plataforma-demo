import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Plan from '../public/plan.js';
import Riesgos from '../public/riesgos.js';

const leer = ruta => readFileSync(new URL('../public/' + ruta, import.meta.url), 'utf8');
function montar(nombre, consulta = '') {
  const vistas = new Map();
  const todos = [];
  class Nodo {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.className = ''; this._texto = ''; this.classList = {add() {}, remove() {}}; todos.push(this); }
    set textContent(t) { this._texto = String(t); this.children = []; }
    get textContent() { return this._texto + this.children.map(n => typeof n === 'string' ? n : n.textContent).join(''); }
    append(...ns) { ns.forEach(n => { if (typeof n === 'object') n.parentElement = this; this.children.push(n); }); }
    replaceChildren(...ns) { this.children.forEach(n => { if (typeof n === 'object') n.parentElement = null; }); this.children = []; this._texto = ''; this.append(...ns); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {}
    focus() { document.activeElement = this; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    querySelectorAll(s) {
      const resultado = [];
      const coincide = n => s.startsWith('[data-') ? Object.hasOwn(n.dataset, s.slice(6, -1)) : s.startsWith('.') ? n.className.split(' ').includes(s.slice(1)) : n.tagName === s.toUpperCase();
      const recorrer = padre => padre.children.forEach(n => { if (typeof n !== 'object') return; if (coincide(n)) resultado.push(n); recorrer(n); });
      recorrer(this); return resultado;
    }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  }
  const document = {documentElement: new Nodo('html'), createElement: t => new Nodo(t), addEventListener() {}, querySelectorAll: () => [], getElementById: id => todos.find(n => n.isConnected && n.id === id)};
  document.body = new Nodo('body');
  const contexto = {document, Plan, Riesgos, URLSearchParams, Intl, location: {search: '', hash: ''}, queueMicrotask}; contexto.window = contexto;
  vm.runInNewContext(leer('app.js'), contexto);
  const App = contexto.App;
  const datos = Object.fromEntries(Object.entries({plan: 'data/plan.json', riesgos: 'data/riesgos.json', estandares: 'data/estandares.json', criticidad: 'config/criticidad-config.json', planConfig: 'config/plan-config.json'}).map(([k, p]) => [k, JSON.parse(leer(p))]));
  App.datos = datos; App.estadoBase = () => 'base'; App.registrarVista = (n, v) => vistas.set(n, v);
  App.guardarAccion = async (id, cambios) => { const r = Plan.aplicarCambio(datos.plan.find(a => a.id === id), cambios, datos.planConfig, '2026-10-02'); assert.equal(r.ok, true); datos.plan = datos.plan.map(a => a.id === id ? r.accion : a); return r.accion; };
  vm.runInNewContext(leer('vista-' + nombre + '.js'), contexto);
  const raiz = new Nodo('main'); document.body.append(raiz);
  vistas.get(nombre).render(raiz, datos, {filtros: new URLSearchParams(consulta), id: nombre === 'riesgos' ? 'riesgo-01' : undefined});
  return {raiz, datos, contexto, todos, document};
}

test('E6 plan: filas, una etiqueta, grupos abiertos y edición rápida actualizan el seguimiento', async () => {
  const v = montar('plan');
  const filas = v.raiz.querySelectorAll('.plan-fila');
  assert.equal(filas.length, 58);
  assert.ok(v.raiz.querySelectorAll('.plan-grupo').every(n => n.open));
  assert.ok(filas.every(n => n.querySelectorAll('.aviso').length === 1));
  assert.ok(filas.every(n => !n.textContent.includes('Indicador:')));
  assert.match(v.raiz.querySelector('.plan-ejemplo').textContent, /El avance que se muestra es ilustrativo/);
  assert.match(v.raiz.querySelector('.plan-vencidas').href, /vencidas=1/);
  const a = v.datos.plan.find(a => a.avance < 100);
  const control = v.document.getElementById('plan-avance-' + a.id + '-mas');
  await control.onclick();
  const actualizada = v.datos.plan.find(n => n.id === a.id);
  assert.equal(actualizada.avance, Math.min(100, a.avance + 10));
  assert.equal(actualizada.seguimiento_ejemplo, undefined);
  const fila = v.raiz.querySelectorAll('.plan-fila').find(n => n.textContent.includes(a.titulo));
  assert.equal(fila.querySelector('.aviso').textContent, 'Propuesta');
  assert.equal(v.raiz.querySelectorAll('.plan-fila').length, 58);
});

test('E6 riesgo: ejes externos, coordenadas accesibles, listas y coma decimal', () => {
  const v = montar('riesgos');
  assert.equal(v.raiz.querySelectorAll('.eje-gravedad').length, 1);
  assert.equal(v.raiz.querySelectorAll('.eje-probabilidad').length, 1);
  const celdas = v.raiz.querySelectorAll('.celda');
  assert.equal(celdas.length, 9);
  assert.ok(celdas.every(n => n.attrs['aria-label'].startsWith('Gravedad ') && !n.querySelector('h3')));
  const panel = v.document.body.querySelector('.panel');
  assert.match(panel.textContent, /menor que 1,5/);
  assert.match(panel.textContent, /máximo entre evaluaciones/);
  assert.doesNotMatch(panel.textContent, /maximo|1\. Colaboradores/);
  assert.ok(panel.querySelectorAll('ol').length >= 4);
});
