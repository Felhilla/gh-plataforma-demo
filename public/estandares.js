(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Estandares = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const idDe = eje => typeof eje === 'string' ? eje : eje.id;
  function parsearPuntaje(texto) {
    if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
    if (typeof texto !== 'string' || !/^[+-]?\d+(?:[.,]\d+)?$/.test(texto.trim())) return null;
    const n = Number(texto.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function ordenar(evals) {
    return evals.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  }
  function combinar(estaticas, deBase) {
    return ordenar([...new Map([...estaticas, ...deBase].map(e => [e.id, e])).values()]);
  }
  function ejesDe(grafico, estandares) { return estandares.ejes.filter(e => e.grafico === grafico); }
  function comparar(evalA, evalB, ejes) {
    return ejes.map(eje => {
      const a = parsearPuntaje(evalA?.puntajes?.[idDe(eje)]);
      const b = parsearPuntaje(evalB?.puntajes?.[idDe(eje)]);
      return {eje, a, b, diferencia: a === null || b === null ? null : a - b};
    });
  }
  function colorPara(valor, umbrales) {
    const n = parsearPuntaje(valor);
    if (n === null || n < umbrales.escala.minimo || n > umbrales.escala.maximo) return null;
    return umbrales.cortes.find(c => c.menor_que === null || n < c.menor_que)?.color || null;
  }
  function validarEvaluacion(datos, ejes, idsExistentes) {
    const errores = {};
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    const fecha = typeof datos.fecha === 'string' ? datos.fecha.trim() : '';
    if (!nombre || nombre.length > 80) errores.nombre = 'Escribe un nombre de 1 a 80 caracteres.';
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(fecha)) errores.fecha = 'Escribe una fecha válida en formato AAAA-MM.';
    const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 67).replace(/-$/g, '') || 'evaluacion';
    const id = `eval-${fecha}-${slug}`;
    if (Array.from(idsExistentes || []).includes(id)) errores.id = 'Ya existe una evaluación con esta fecha y nombre. Cambia el nombre.';
    const puntajes = {};
    ejes.forEach(eje => {
      const clave = idDe(eje), n = parsearPuntaje(datos.puntajes?.[clave]);
      if (n === null || n < 0 || n > 5) errores[clave] = 'Escribe un puntaje entre 0 y 5.';
      else puntajes[clave] = n;
    });
    const ok = !Object.keys(errores).length;
    return {ok, errores, evaluacion: ok ? {id, nombre, fecha, origen: 'cargada', puntajes} : null};
  }
  function puntosPoligono(valores, radio, centro) {
    const [cx, cy] = Array.isArray(centro) ? centro : [centro.x, centro.y];
    return valores.map((v, i) => {
      const angulo = 2 * Math.PI * i / valores.length - Math.PI / 2;
      return [cx + radio * v / 5 * Math.cos(angulo), cy + radio * v / 5 * Math.sin(angulo)];
    });
  }
  return {combinar, ordenar, ejesDe, comparar, colorPara, validarEvaluacion, parsearPuntaje, puntosPoligono};
}));
