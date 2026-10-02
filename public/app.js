/* Contrato de vistas: render(contenedor, datos, {id, filtros: URLSearchParams}). */
(function () {
  'use strict';
  const vistas = new Map();
  let estadoPlan = 'respaldo';
  const App = window.App = {
    datos: null,
    numero(valor, opciones = {}) { return new Intl.NumberFormat('es-CO', opciones).format(valor); },
    listaNumerada(texto) {
      const limpio = String(texto ?? '').replace(/\\n/g, '\n').trim();
      if (!limpio) return [];
      return limpio.split(/(?:^|\n)\s*\d+\.\s+/).map(t => t.trim()).filter(Boolean);
    },
    registrarVista(nombre, vista) { vistas.set(nombre, vista); },
    obtenerPlan() { return App.datos.plan; },
    estadoBase() { return estadoPlan; },
    async guardarAccion(id, cambios) {
      if (estadoPlan !== 'base') throw new Error('No hay conexión con la base de datos. No se guardaron los cambios.');
      const original = App.datos.plan.find(a => a.id === id);
      if (!original) throw new Error('No se encontró la acción.');
      const resultado = Plan.aplicarCambio(original, cambios, App.datos.planConfig, new Date().toISOString());
      if (!resultado.ok) throw new Error(resultado.errores.join(' '));
      try {
        await GHDatos.set('plan-acciones', id, resultado.accion);
      } catch (error) {
        throw new Error('No se pudo guardar el cambio. Comprueba la conexión y vuelve a intentarlo.');
      }
      App.datos.plan = App.datos.plan.map(a => a.id === id ? resultado.accion : a);
      return resultado.accion;
    },
    // Todos los textos, incluidos atributos y datos remotos, se insertan con DOM seguro.
    el(tag, texto, clase) {
      const nodo = document.createElement(tag);
      if (texto !== undefined && texto !== null) nodo.textContent = texto;
      if (clase) nodo.className = clase;
      return nodo;
    }
  };
  document.documentElement.dataset.paleta = new URLSearchParams(location.search).get('paleta') === 'b' ? 'b' : 'a';
  const el = App.el;
  let limpieza;
  function portada(contenedor, datos) {
    const hero = el('section', null, 'hero');
    hero.append(el('p', 'DE LA INFORMACIÓN A LA ACCIÓN', 'eyebrow'), el('h1', 'Una visión conectada de la sostenibilidad.'), el('p', 'Transforma el informe tradicional en datos vivos: conecta cada riesgo con su calificación y sus acciones, da seguimiento a los compromisos y compara evaluaciones.', 'intro'));
    contenedor.append(hero);
    const modulos = el('div', null, 'modulos');
    const activo = el('a', null, 'modulo activo'); activo.href = '#/ddhh/riesgos';
    activo.append(el('span', 'D1 · Disponible', 'eyebrow'), el('h2', 'Debida diligencia y DDHH'), el('p', 'Del riesgo identificado a la acción que lo gestiona.'));
    const resumen = Riesgos.resumen(datos.riesgos, datos.criticidad);
    const cifras = el('div', null, 'cifras');
    const plan = App.obtenerPlan();
    const avance = Plan.resumen(plan, datos.planConfig).avanceGlobal;
    [[datos.riesgos.length, 'riesgos'], [`${resumen.Alta} alta · ${resumen.Media} media`, 'criticidad'], [plan.length, 'acciones del plan'], [App.numero(avance, {maximumFractionDigits: 1}) + ' %', plan.some(a => a.seguimiento_ejemplo) ? 'avance del plan (ejemplo)' : 'avance del plan']].forEach(([n, t]) => {
      const c = el('div'); c.append(el('strong', n), el('span', t)); cifras.append(c);
    });
    activo.append(cifras, el('span', 'Explorar el módulo →', 'entrada')); modulos.append(activo);
    [['D2', 'Mapeo de actores'], ['D3', 'Gestión de riesgos'], ['D4', 'Materialidad']].forEach(([n, titulo]) => {
      const c = el('section', null, 'modulo pendiente'); c.setAttribute('aria-disabled', 'true');
      c.append(el('span', n, 'eyebrow'), el('h2', titulo), el('p', 'Próximamente')); modulos.append(c);
    });
    contenedor.append(modulos);
  }
  function enrutar() {
    if (!App.datos) return;
    const focoAnterior = document.activeElement;
    const focoId = focoAnterior?.id;
    const focoRiesgo = focoAnterior?.dataset.riesgo || document.querySelector('[role="dialog"]')?.dataset.riesgo;
    const habiaDialogo = !!document.querySelector('[role="dialog"]');
    if (typeof limpieza === 'function') limpieza();
    limpieza = null;
    const hash = location.hash.slice(1) || '/';
    const [ruta, query = ''] = hash.split('?');
    const match = ruta.match(/^\/ddhh\/(riesgos|estandares|plan)(?:\/(riesgo-\d+))?$/);
    if (ruta !== '/' && (!match || (match[2] && (match[1] !== 'riesgos' || !App.datos.riesgos.some(r => r.id === match[2]))))) {
      location.replace(location.pathname + location.search + '#/'); return;
    }
    const contenedor = document.getElementById('contenido');
    const nav = document.getElementById('pestanas');
    contenedor.replaceChildren(); nav.replaceChildren(); nav.hidden = !match;
    if (match) {
      nav.setAttribute('role', 'tablist');
      [['riesgos', 'Riesgos'], ['estandares', 'Alineación con estándares'], ['plan', 'Plan de acción']].forEach(([nombre, titulo]) => {
        const a = el('a', titulo); a.href = '#/ddhh/' + nombre; a.id = 'tab-' + nombre;
        a.setAttribute('role', 'tab'); a.setAttribute('aria-selected', String(nombre === match[1]));
        a.setAttribute('aria-controls', 'contenido'); a.tabIndex = nombre === match[1] ? 0 : -1;
        a.addEventListener('keydown', event => {
          const tabs = [...nav.children]; let i = tabs.indexOf(a);
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          i = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          location.hash = tabs[i].hash;
        }); nav.append(a);
      });
      contenedor.setAttribute('role', 'tabpanel'); contenedor.setAttribute('aria-labelledby', 'tab-' + match[1]);
      limpieza = vistas.get(match[1]).render(contenedor, App.datos, {id: match[2], filtros: new URLSearchParams(query)});
    } else {
      contenedor.removeAttribute('role'); contenedor.removeAttribute('aria-labelledby'); portada(contenedor, App.datos);
    }
    if (!document.querySelector('[role="dialog"]')) {
      const restaurar = focoId?.startsWith('tab-') ? nav.querySelector('[aria-selected="true"]') : focoId && document.getElementById(focoId);
      const riesgo = focoRiesgo && [...contenedor.querySelectorAll('[data-riesgo]')].find(n => n.dataset.riesgo === focoRiesgo);
      (restaurar || riesgo || contenedor).focus({preventScroll: !habiaDialogo});
    }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('.saltar').onclick = event => { event.preventDefault(); document.getElementById('contenido').focus(); };
    const archivos = {riesgos: 'data/riesgos.json', plan: 'data/plan.json', estandares: 'data/estandares.json', evaluaciones: 'data/evaluaciones.json', criticidad: 'config/criticidad-config.json', umbrales: 'config/umbrales-config.json', planConfig: 'config/plan-config.json'};
    try {
      App.datos = Object.fromEntries(await Promise.all(Object.entries(archivos).map(async ([clave, ruta]) => {
        const respuesta = await fetch(ruta);
        if (!respuesta.ok) throw new Error('No se pudo cargar ' + clave);
        return [clave, await respuesta.json()];
      })));
      const estatico = App.datos.plan;
      let espera;
      try {
        const deBase = await Promise.race([
          Promise.resolve().then(() => GHDatos.list('plan-acciones')).then(acciones => ({acciones, estado: GHDatos.estado})),
          new Promise((resolve, reject) => { espera = setTimeout(() => reject(new Error('Tiempo de espera agotado')), 5000); })
        ]);
        estadoPlan = deBase.estado === 'base' ? 'base' : 'respaldo';
        App.datos.plan = Plan.combinar(estatico, estadoPlan === 'base' ? deBase.acciones : []);
      } catch (error) {
        estadoPlan = 'respaldo';
        App.datos.plan = estatico;
      } finally { clearTimeout(espera); }
      window.addEventListener('hashchange', enrutar); enrutar();
    } catch (error) {
      const aviso = el('section', null, 'error'); aviso.setAttribute('role', 'alert');
      aviso.append(el('h1', 'No pudimos cargar la plataforma'), el('p', 'Comprueba la conexión y vuelve a intentarlo. Si el problema continúa, contacta al equipo de GH Estudios.'));
      const boton = el('button', 'Volver a intentar'); boton.onclick = () => location.reload(); aviso.append(boton);
      document.getElementById('contenido').replaceChildren(aviso);
    }
  });
}());
