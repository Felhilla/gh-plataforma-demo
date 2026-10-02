(function () {
  'use strict';
  const el = App.el;
  // Convención visual, no modifica la criticidad calculada desde la fuente.
  const MAPA_CALOR = {
    'Alta|baja': 'medio', 'Alta|media': 'alto', 'Alta|alta': 'alto',
    'Media|baja': 'bajo', 'Media|media': 'medio', 'Media|alta': 'alto',
    'Baja|baja': 'bajo', 'Baja|media': 'bajo', 'Baja|alta': 'medio'
  };
  const etiqueta = valor => valor ? valor.charAt(0).toUpperCase() + valor.slice(1).replaceAll('-', ' ') : 'Sin asignar';
  function textoLista(texto) {
    const items = App.listaNumerada(texto);
    const nodo = el(items.length > 1 ? 'ol' : 'p', items.length === 1 ? items[0] : undefined, 'texto-dato');
    if (items.length > 1) items.forEach(t => nodo.append(el('li', t)));
    return nodo;
  }
  const numero = r => r.id.split('-').at(-1);
  const badge = nivel => el('span', nivel, 'criticidad ' + nivel.toLowerCase());
  function aviso(texto, detalle) {
    const n = el('span', texto, 'aviso'); n.title = detalle; n.tabIndex = 0;
    n.setAttribute('aria-label', texto + ': ' + detalle); return n;
  }
  function ambitos(r, cfg) {
    const n = el('span', r.ambitos.map(id => cfg.ambitos.find(a => a.id === id)?.etiqueta || etiqueta(id)).join(' · '));
    if (r.campos_propuestos?.includes('ambitos')) n.append(' ', aviso('Estimado', 'La correspondencia de ámbitos es estimada y requiere confirmación.'));
    return n;
  }
  function render(contenedor, datos, params) {
    const cfg = datos.criticidad;
    const filtros = Object.fromEntries(params.filtros);
    const visibles = Riesgos.filtrar(datos.riesgos, filtros, cfg);
    const ids = new Set(visibles.map(r => r.id));
    const base = () => '#/ddhh/riesgos' + (params.filtros.size ? '?' + params.filtros : '');
    const rutaRiesgo = id => '#/ddhh/riesgos/' + id + (params.filtros.size ? '?' + params.filtros : '');
    function cambiar(clave, valor) {
      const q = new URLSearchParams(params.filtros);
      if (valor) q.set(clave, valor); else q.delete(clave);
      location.hash = '#/ddhh/riesgos' + (q.size ? '?' + q : '');
    }
    contenedor.append(el('p', 'D1 · DEBIDA DILIGENCIA Y DDHH', 'eyebrow'), el('h1', 'Riesgos en derechos humanos'), el('p', 'Identifica prioridades y sigue el vínculo entre evaluación, controles y acciones.', 'intro'));
    const resumen = Riesgos.resumen(datos.riesgos, cfg);
    const tarjetas = el('div', null, 'resumen');
    [['', datos.riesgos.length, 'Total de riesgos'], ...Object.entries(resumen).reverse().map(([nivel, n]) => [nivel, n, 'Criticidad ' + nivel])].forEach(([nivel, n, titulo]) => {
      const b = el('button', null, 'resumen-item'); b.id = 'resumen-' + (nivel || 'total');
      b.setAttribute('aria-pressed', String((filtros.criticidad || '') === nivel));
      b.append(el('strong', n), el('span', titulo)); b.onclick = () => cambiar('criticidad', nivel); tarjetas.append(b);
    }); contenedor.append(tarjetas);
    const form = el('form', null, 'filtros'); form.setAttribute('aria-label', 'Filtrar riesgos'); form.onsubmit = e => e.preventDefault();
    const opciones = Riesgos.opcionesFiltro(datos.riesgos, cfg);
    [['criticidad', 'Criticidad'], ['ambito', 'Ámbito'], ['vinculacion', 'Tipo de vinculación'], ['derecho', 'Derecho humano impactado']].forEach(([clave, titulo]) => {
      const label = el('label', titulo); const select = el('select'); select.id = 'filtro-' + clave;
      const todos = el('option', 'Todos'); todos.value = ''; select.append(todos);
      const values = [...opciones[clave]];
      if (filtros[clave] && !values.includes(filtros[clave])) values.push(filtros[clave]);
      values.forEach(valor => {
        const texto = clave === 'ambito' ? cfg.ambitos.find(a => a.id === valor)?.etiqueta || etiqueta(valor) : etiqueta(valor);
        const option = el('option', texto); option.value = valor; select.append(option);
      }); select.value = filtros[clave] || ''; select.onchange = () => cambiar(clave, select.value);
      label.append(select); form.append(label);
    });
    const limpiar = el('a', 'Limpiar filtros', 'boton secundario'); limpiar.id = 'limpiar-filtros'; limpiar.href = '#/ddhh/riesgos'; form.append(limpiar); contenedor.append(form);
    const estado = el('p', `${visibles.length} de ${datos.riesgos.length} riesgos coinciden con los filtros.`, 'resultado'); estado.setAttribute('role', 'status'); contenedor.append(estado);
    const seccion = el('section', null, 'superficie');
    seccion.append(el('h2', 'Mapa de riesgos'), el('p', 'Los riesgos atenuados no coinciden con los filtros. El fondo es orientativo; la etiqueta expresa la criticidad.', 'ayuda'));
    const ubicacion = Riesgos.ubicar(datos.riesgos, cfg);
    function fichaPequena(id) {
      const r = datos.riesgos.find(r => r.id === id); const a = el('a', null, 'ficha-mini' + (ids.has(id) ? '' : ' atenuado'));
      a.href = rutaRiesgo(id); a.dataset.riesgo = id; a.title = r.nombre;
      a.setAttribute('aria-label', `${numero(r)}. ${r.nombre}${ids.has(id) ? '' : '. No coincide con los filtros'}`);
      a.append(el('strong', numero(r)), el('span', r.nombre.length > 65 ? r.nombre.slice(0, 62) + '…' : r.nombre));
      if (r.evaluaciones.length > 1) a.append(el('small', r.evaluaciones.length + ' actores'));
      return a;
    }
    const matriz = el('div', null, 'matriz');
    matriz.append(el('span', 'Gravedad', 'eje-gravedad'));
    ['Alta', 'Media', 'Baja'].forEach(g => {
      matriz.append(el('span', g, 'eje-fila'));
      ['baja', 'media', 'alta'].forEach(p => {
        const celda = el('section', null, 'celda calor-' + MAPA_CALOR[g + '|' + p]);
        celda.setAttribute('aria-label', `Gravedad ${g} · Probabilidad ${etiqueta(p)}`);
        ubicacion.celdas[g + '|' + p].forEach(id => celda.append(fichaPequena(id)));
        if (!ubicacion.celdas[g + '|' + p].length) celda.append(el('span', 'Sin riesgos', 'ayuda'));
        matriz.append(celda);
      });
    });
    const columnas = el('div', null, 'eje-columnas');
    ['Baja', 'Media', 'Alta'].forEach(t => columnas.append(el('span', t)));
    matriz.append(columnas, el('p', 'Probabilidad de ocurrencia según controles', 'eje-probabilidad'));
    seccion.append(matriz);
    const sin = el('section', null, 'sin-probabilidad'); sin.append(el('h3', 'Sin probabilidad asignada'));
    ubicacion.sinProbabilidad.forEach(id => sin.append(fichaPequena(id))); seccion.append(sin); contenedor.append(seccion);
    const listado = el('section', null, 'superficie listado'); listado.append(el('h2', 'Detalle de riesgos'));
    const tabla = el('table'); const caption = el('caption', 'Riesgos que coinciden con los filtros, ordenados por criticidad y número.', 'solo-lectores'); tabla.append(caption);
    const head = el('thead'); const hr = el('tr');
    ['Número', 'Riesgo', 'Criticidad', 'Ámbitos', 'Vinculación', 'Acciones'].forEach(t => {const th = el('th', t); th.scope = 'col'; hr.append(th);}); head.append(hr); tabla.append(head);
    const body = el('tbody'); const niveles = cfg.gravedad.cortes.map(c => c.nivel).reverse();
    [...visibles].sort((a, b) => niveles.indexOf(Riesgos.criticidad(a, cfg).nivel) - niveles.indexOf(Riesgos.criticidad(b, cfg).nivel) || a.id.localeCompare(b.id)).forEach(r => {
      const tr = el('tr');
      const link = el('a', r.nombre); link.href = rutaRiesgo(r.id); link.dataset.riesgo = r.id; link.id = 'fila-' + r.id;
      [numero(r), link, badge(Riesgos.criticidad(r, cfg).nivel), ambitos(r, cfg), [...new Set(r.evaluaciones.map(e => etiqueta(e.vinculacion)))].join(' · '), Riesgos.accionesDe(r.id, App.obtenerPlan()).length].forEach((valor, i) => {
        const td = el('td'); td.dataset.etiqueta = hr.children[i].textContent; td.append(valor); tr.append(td);
      }); tr.onclick = e => {if (!e.target.closest('a, .aviso')) location.hash = rutaRiesgo(r.id);}; body.append(tr);
    }); tabla.append(body); listado.append(tabla);
    if (!visibles.length) listado.append(el('p', 'No hay riesgos que coincidan. Prueba otra combinación o limpia los filtros.'));
    contenedor.append(listado);
    if (!params.id) return;
    return abrirDialogo(datos.riesgos.find(r => r.id === params.id), datos, base());
  }
  function abrirDialogo(r, datos, rutaCerrar) {
    const cfg = datos.criticidad;
    const fondo = el('div', null, 'fondo-dialogo');
    const panel = el('section', null, 'panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'titulo-riesgo'); panel.tabIndex = -1; panel.dataset.riesgo = r.id;
    const cerrar = el('button', 'Cerrar ficha ×', 'cerrar'); cerrar.onclick = () => {location.hash = rutaCerrar;};
    const titulo = el('h2', `${numero(r)} · ${r.nombre}`); titulo.id = 'titulo-riesgo';
    panel.append(cerrar, titulo, badge(Riesgos.criticidad(r, cfg).nivel), el('h3', 'Ámbitos'), ambitos(r, cfg));
    function bloque(titulo, texto) {panel.append(el('h3', titulo), textoLista(texto || 'Sin información en la fuente'));}
    bloque('Estándar asociado', r.derecho_humano);
    panel.append(el('h3', 'Calificación'));
    const dominante = Riesgos.criticidad(r, cfg).evaluacionDominante;
    const tabla = el('table', null, 'calificaciones'); tabla.append(el('caption', 'Evaluaciones por actor'));
    const encabezado = el('thead'); const fila = el('tr');
    const columnas = ['Actor que genera', 'Escala', 'Alcance', 'Irremediabilidad', 'Promedio', 'Gravedad', 'Vinculación', 'Probabilidad', 'Evaluación'];
    columnas.forEach(t => {const th = el('th', t); th.scope = 'col'; fila.append(th);}); encabezado.append(fila); tabla.append(encabezado);
    const cuerpo = el('tbody');
    r.evaluaciones.forEach(e => {
      const g = Riesgos.gravedad(e, cfg); const tr = el('tr');
      [e.actor_genera, e.escala, e.alcance, e.irreparable, App.numero(g.promedio, {maximumFractionDigits: 2}), g.nivel, etiqueta(e.vinculacion), etiqueta(e.probabilidad), e === dominante ? 'Dominante' : 'No dominante'].forEach((v, i) => {const td = el('td'); td.append(i === 0 ? textoLista(v) : typeof v === 'number' ? App.numero(v) : v); td.dataset.etiqueta = columnas[i]; tr.append(td);}); cuerpo.append(tr);
    }); tabla.append(cuerpo); panel.append(tabla);
    const nombres = {escala: 'escala', alcance: 'alcance', irreparable: 'irremediabilidad'};
    const reglas = cfg.gravedad.cortes.map((c, i) => `${c.nivel}: ${c.menor_que === null ? 'desde ' + App.numero(cfg.gravedad.cortes[i - 1].menor_que) : 'menor que ' + App.numero(c.menor_que)}`).join('; ');
    bloque('Cómo se calcula', `Gravedad = ${cfg.gravedad.agregacion.replace('maximo', 'máximo')} de ${cfg.gravedad.criterios.map(c => nombres[c] || c).join(', ')}. Escala de ${App.numero(cfg.gravedad.escala.minimo)} a ${App.numero(cfg.gravedad.escala.maximo)}. ${reglas}. Criticidad del riesgo: ${cfg.agregacion_riesgo.replace('maximo', 'máximo')} entre evaluaciones. La probabilidad y la vinculación son dimensiones independientes.`);
    if (cfg.campos_propuestos?.includes('gravedad.cortes')) panel.append(aviso('Propuesta', 'Los cortes de gravedad están definidos por el encargo y corrigen el límite exacto de la fuente.'));
    bloque('Localización', r.localizacion); bloque('Actividades', r.actividades);
    bloque('Actores que reportan', r.evaluaciones.map(e => e.actor_reporta).join('\n'));
    bloque('Acción recomendada', r.accion_recomendada);
    bloque('Medidas de control actuales', r.medidas_control); bloque('Análisis de controles', r.analisis_controles); bloque('Responsables', r.responsables.join(' · '));
    panel.append(el('h3', 'Acciones del plan'));
    Riesgos.accionesDe(r.id, App.obtenerPlan()).forEach(a => {
      const card = el('article', null, 'accion'); const link = el('a', a.titulo); link.href = '#/ddhh/plan?accion=' + encodeURIComponent(a.id);
      card.append(link, el('p', datos.planConfig.componentes.find(c => c.id === a.componente)?.nombre || etiqueta(a.componente)), el('p', `${etiqueta(a.estado)} · Plazo: ${a.plazo}`));
      if (a.campos_propuestos?.length) card.append(aviso('Propuesta', 'Campos propuestos pendientes de validación: ' + a.campos_propuestos.map(etiqueta).join(', ') + '.'));
      if (a.vinculos_estimados) card.append(aviso('Estimado', 'Esta acción contiene vínculos estimados con riesgos o ejes; requieren confirmación.'));
      panel.append(card);
    });
    fondo.append(panel); document.body.append(fondo); document.body.classList.add('dialogo-abierto');
    const regiones = [...document.querySelectorAll('body > header, body > main, body > footer, body > .saltar')]; regiones.forEach(n => {n.inert = true;});
    cerrar.focus();
    function teclado(e) {
      if (e.key === 'Escape') {e.preventDefault(); location.hash = rutaCerrar;}
      if (e.key === 'Tab') {
        const focos = [...panel.querySelectorAll('button, a[href], [tabindex="0"]')]; const primero = focos[0]; const ultimo = focos.at(-1);
        if (e.shiftKey && document.activeElement === primero) {e.preventDefault(); ultimo.focus();}
        else if (!e.shiftKey && document.activeElement === ultimo) {e.preventDefault(); primero.focus();}
      }
    }
    document.addEventListener('keydown', teclado);
    return () => {
      document.removeEventListener('keydown', teclado); regiones.forEach(n => {n.inert = false;}); fondo.remove(); document.body.classList.remove('dialogo-abierto');
      document.getElementById('fila-' + r.id)?.focus();
    };
  }
  App.registrarVista('riesgos', {render});
}());
