/* Cálculo puro: los cortes, escalas y reglas viven en criticidad-config.json. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Riesgos = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function exigir(condition, message) {
    if (!condition) throw new Error(message);
  }
  function objeto(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function lista(values) {
    return Array.isArray(values) && values.length > 0 &&
      values.every(v => typeof v === 'string' && v.trim()) && new Set(values).size === values.length;
  }
  function validar(cfg) {
    const error = 'Configuración de criticidad incompleta o inválida: ';
    exigir(objeto(cfg) && objeto(cfg.gravedad), error + 'gravedad');
    const g = cfg.gravedad;
    exigir(lista(g.criterios) && ['escala', 'alcance', 'irreparable'].every(k => g.criterios.includes(k)), error + 'criterios');
    exigir(objeto(g.escala) && Number.isInteger(g.escala.minimo) && Number.isInteger(g.escala.maximo) &&
      g.escala.minimo < g.escala.maximo && g.escala.enteros === true, error + 'escala');
    exigir(g.agregacion === 'promedio', error + 'agregación de gravedad no soportada');
    exigir(Array.isArray(g.cortes) && g.cortes.length > 0 && g.cortes.every(objeto) &&
      lista(g.cortes.map(c => c.nivel)), error + 'cortes');
    let anterior = g.escala.minimo;
    g.cortes.forEach((c, index) => {
      const ultimo = index === g.cortes.length - 1;
      exigir(ultimo ? c.menor_que === null : Number.isFinite(c.menor_que) &&
        c.menor_que > anterior && c.menor_que <= g.escala.maximo, error + 'límites ordenados y corte final');
      anterior = c.menor_que;
    });
    exigir(cfg.agregacion_riesgo === 'maximo', error + 'agregación de riesgo no soportada');
    exigir(lista(cfg.probabilidad), error + 'probabilidad');
    exigir(objeto(cfg.vinculacion) && Object.keys(cfg.vinculacion).length > 0, error + 'vinculación');
    Object.values(cfg.vinculacion).forEach(v => {
      exigir(objeto(v) && cfg.probabilidad.includes(v.nivel) && objeto(v.medidas) &&
        ['impacto_potencial', 'impacto_manifestado'].every(k => typeof v.medidas[k] === 'string' && v.medidas[k].trim()), error + 'medidas de vinculación');
    });
    exigir(objeto(cfg.matriz) && cfg.matriz.x === 'probabilidad' && cfg.matriz.y === 'gravedad', error + 'ejes de matriz');
    exigir(Array.isArray(cfg.ambitos) && cfg.ambitos.every(objeto) && lista(cfg.ambitos.map(a => a.id)) &&
      cfg.ambitos.every(a => typeof a.etiqueta === 'string' && a.etiqueta.trim()), error + 'ámbitos');
  }
  function calcularGravedad(evaluacion, cfg) {
    exigir(objeto(evaluacion), 'Evaluación ausente o inválida');
    const g = cfg.gravedad;
    const valores = g.criterios.map(key => {
      const value = evaluacion[key];
      exigir(Number.isInteger(value) && value >= g.escala.minimo && value <= g.escala.maximo,
        'Evaluación: ' + key + ' fuera de escala; se requiere un entero entre ' + g.escala.minimo + ' y ' + g.escala.maximo);
      return value;
    });
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    const corte = g.cortes.find(c => c.menor_que === null || promedio < c.menor_que);
    return { promedio, nivel: corte.nivel };
  }
  function gravedad(evaluacion, cfg) {
    validar(cfg);
    return calcularGravedad(evaluacion, cfg);
  }
  function calcularCriticidad(riesgo, cfg) {
    exigir(objeto(riesgo) && Array.isArray(riesgo.evaluaciones) && riesgo.evaluaciones.length > 0,
      'Riesgo sin evaluaciones por actor');
    let dominante;
    riesgo.evaluaciones.forEach(evaluacion => {
      const valor = calcularGravedad(evaluacion, cfg);
      exigir(evaluacion.probabilidad === null || cfg.probabilidad.includes(evaluacion.probabilidad),
        'Evaluación: probabilidad inválida');
      exigir(evaluacion.vinculacion === null || Object.prototype.hasOwnProperty.call(cfg.vinculacion, evaluacion.vinculacion),
        'Evaluación: vinculación inválida');
      // En empate de promedio se conserva la primera fila, sin mutar la entrada.
      if (!dominante || valor.promedio > dominante.promedio) dominante = { ...valor, evaluacionDominante: evaluacion };
    });
    return dominante;
  }
  function criticidad(riesgo, cfg) {
    validar(cfg);
    return calcularCriticidad(riesgo, cfg);
  }
  function resumen(riesgos, cfg) {
    validar(cfg);
    exigir(Array.isArray(riesgos), 'Se esperaba un arreglo de riesgos');
    const conteos = Object.fromEntries(cfg.gravedad.cortes.map(c => [c.nivel, 0]));
    riesgos.forEach(r => { conteos[calcularCriticidad(r, cfg).nivel] += 1; });
    return conteos;
  }
  return { gravedad, criticidad, resumen };
}));
