/* Cálculo del plan: sin DOM ni persistencia. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plan = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const campos = ['estado', 'avance', 'responsable', 'plazo', 'nota_seguimiento'];
  const copiar = valor => JSON.parse(JSON.stringify(valor));
  const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function combinar(estaticas, deBase) {
    const registros = new Map(estaticas.map(a => [a.id, copiar(a)]));
    (deBase || []).forEach(a => registros.set(a.id, {...registros.get(a.id), ...copiar(a)}));
    return [...registros.values()];
  }
  function fechaValida(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
      Number.isFinite(Date.parse(valor)) && new Date(valor).toISOString().slice(0, 10) === valor;
  }
  function aplicarCambio(original, cambios, cfg, ahora) {
    const errores = [];
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return {ok: false, accion: original, errores: ['Cambios inválidos.']};
    Object.keys(cambios).forEach(campo => {
      const valor = cambios[campo];
      if (!campos.includes(campo)) errores.push('No se puede editar el campo ' + campo + '.');
      else if (campo === 'estado' && !cfg.estados.includes(valor)) errores.push('Selecciona un estado válido.');
      else if (campo === 'avance' && (!Number.isInteger(valor) || valor < 0 || valor > 100)) errores.push('El avance debe ser un entero entre 0 y 100.');
      else if (campo === 'plazo' && !fechaValida(valor)) errores.push('El plazo debe ser una fecha válida AAAA-MM-DD.');
      else if (['responsable', 'nota_seguimiento'].includes(campo) && (typeof valor !== 'string' || valor.length > (campo === 'responsable' ? 120 : 500))) errores.push('Texto inválido o demasiado largo en ' + campo + '.');
    });
    if (errores.length) return {ok: false, accion: original, errores};
    const accion = {...copiar(original), ...cambios};
    // Un estado explícito tiene prioridad si se envían ambos campos a la vez.
    if (cambios.estado === 'pendiente') accion.avance = 0;
    else if (cambios.estado === 'cumplida') accion.avance = 100;
    else if (Object.hasOwn(cambios, 'avance') && accion.avance < 100 && accion.estado === 'cumplida') accion.estado = 'en-curso';
    if (accion.avance === 100) accion.estado = 'cumplida';
    else if (accion.avance > 0 && accion.estado === 'pendiente') accion.estado = 'en-curso';
    if (accion.estado === 'cumplida') accion.avance = 100;
    const fecha = new Date(ahora === undefined ? Date.now() : ahora).toISOString();
    const modificados = campos.filter(c => accion[c] !== original[c]);
    accion.actualizado = fecha;
    // No se agregan identidades ni metadatos del editor al historial.
    accion.historial = [...(original.historial || []), ...modificados.map(campo => ({fecha, campo, antes: original[campo] ?? '', despues: accion[campo]}))].slice(-20);
    accion.campos_propuestos = (original.campos_propuestos || []).filter(c => !Object.hasOwn(cambios, c) && !modificados.includes(c));
    return {ok: true, accion, errores};
  }
  function vencida(accion, hoy) { return fechaValida(accion.plazo) && accion.plazo < hoy && accion.estado !== 'cumplida'; }
  function resumen(acciones, cfg, hoy) {
    const promedio = lista => lista.length ? lista.reduce((s, a) => s + a.avance, 0) / lista.length : 0;
    return {
      avanceGlobal: promedio(acciones),
      porEstado: Object.fromEntries(cfg.estados.map(e => [e, acciones.filter(a => a.estado === e).length])),
      vencidas: acciones.filter(a => vencida(a, hoy)).length,
      porComponente: cfg.componentes.map(c => {
        const lista = acciones.filter(a => a.componente === c.id);
        return {componente: c.id, nombre: c.nombre, n: lista.length, avance: promedio(lista)};
      })
    };
  }
  function filtrar(acciones, filtros) {
    const f = filtros instanceof URLSearchParams ? Object.fromEntries(filtros) : filtros;
    return acciones.filter(a => (!f.componente || a.componente === f.componente) && (!f.estado || a.estado === f.estado) &&
      (!f.riesgo || (a.riesgos || []).includes(f.riesgo)) && (!f.eje || (a.ejes || []).includes(f.eje)) &&
      (!f.q || normalizar(a.titulo + ' ' + a.descripcion).includes(normalizar(f.q).trim())));
  }
  return {combinar, aplicarCambio, resumen, filtrar, vencida};
}));
