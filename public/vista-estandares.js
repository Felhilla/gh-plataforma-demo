(function () {
  'use strict';
  const E = window.Estandares, el = App.el;
  const graficos = [['etapas-ocde', 'Etapas de la debida diligencia (Guía OCDE)'], ['temas-ddhh', 'Temas de DDHH']];
  const respaldo = 'No hay conexión con la base de datos: se muestran los datos de respaldo; las evaluaciones nuevas no se pueden guardar ahora.';
  const formato = new Intl.NumberFormat('es-CO', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const numero = n => n === null || n === undefined ? 'Sin información' : formato.format(n);
  const delta = n => n === null ? '—' : `${Math.abs(n) < 0.05 ? '=' : n > 0 ? '▲' : '▼'} ${n > 0.049 ? '+' : ''}${numero(Math.abs(n) < 0.05 ? 0 : n)}`;
  const etiqueta = e => {
    const nombre = e.nombre.replace(e.fecha, '').replace(new RegExp('\\s+' + e.fecha.slice(0, 4) + '$'), '').replace(/\s*\(ejemplo\)\s*/gi, '').trim();
    const fecha = new Intl.DateTimeFormat('es-CO', {month: 'short', year: 'numeric'}).format(new Date(e.fecha + '-01T12:00:00')).replace(' de ', ' ');
    return `${nombre} · ${fecha}${e.origen === 'ejemplo' ? ' (ejemplo)' : e.origen === 'cargada' ? ' · Cargada en la plataforma' : ''}`;
  };
  function svg(tag, attrs, texto) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  function lineas(texto, limite) {
    return texto.split(/\s+/).reduce((r, palabra) => {
      if (!r.length || r[r.length - 1].length + palabra.length + 1 > limite) r.push(palabra);
      else r[r.length - 1] += ' ' + palabra;
      return r;
    }, []);
  }
  function indicador(i) {
    const n = el('article', null, 'e3-indicador');
    n.append(el('h4', i.pregunta), el('p', `Incorporado: ${i.incorporado === 'si' ? 'Sí' : i.incorporado === 'no' ? 'No' : 'Sin información'} · Calificación: ${numero(i.calificacion)}`));
    const detalle = el('details'); detalle.append(el('summary', 'Descripción'), el('p', i.descripcion || 'Sin descripción registrada', 'texto-dato'));
    n.append(detalle, el('p', i.brecha ? `Brecha identificada: ${i.brecha}` : 'Sin brecha registrada', 'e3-brecha texto-dato'), el('p', `Documentos analizados: ${i.documentos || 'Sin documentos registrados'}`, 'ayuda texto-dato'));
    return n;
  }
  App.registrarVista('estandares', {render(contenedor, datos, params) {
    let activo = true, dialogo, evaluaciones = [], principal, comparada, ejeSeleccionado, sinBase = false;
    const raiz = el('section', null, 'e3');
    raiz.append(el('h1', 'Alineación con estándares'), el('p', 'Brechas de gestión frente a los estándares. Escala de 0 a 5; 0 significa sin información.', 'intro'));
    const aviso = el('p', 'Cargando evaluaciones…', 'e3-aviso'); aviso.setAttribute('role', 'status');
    const controles = el('div', null, 'e3-controles'), cuerpo = el('div');
    raiz.append(aviso, controles, cuerpo); contenedor.append(raiz);
    function url() {
      const q = new URLSearchParams({eval: principal.id, vs: comparada?.id || '', eje: ejeSeleccionado.id});
      history.replaceState(null, '', '#/ddhh/estandares?' + q);
    }
    function avisoBase() { aviso.textContent = sinBase ? respaldo : ''; aviso.hidden = !sinBase; }
    function seleccionar(eje) {
      ejeSeleccionado = eje; url(); dibujar();
      const titulo = cuerpo.querySelector('#e3-eje-titulo'); titulo.focus({preventScroll: true}); titulo.scrollIntoView({block: 'nearest'});
    }
    function grafico(tipo, titulo) {
      const ejes = E.ejesDe(tipo, datos.estandares), filas = E.comparar(principal, comparada, ejes);
      const seccion = el('section', null, 'superficie e3-grafico'); seccion.append(el('h2', titulo));
      const dibujo = svg('svg', {viewBox: '0 0 720 700', role: 'group', 'aria-label': titulo});
      const centro = [360, 350], radio = 240;
      const puntos = valores => E.puntosPoligono(valores, radio, centro);
      const cadena = ps => ps.map(p => p.map(n => n.toFixed(2)).join(',')).join(' ');
      for (let nivel = 0; nivel <= 5; nivel++) {
        dibujo.append(svg('polygon', {points: cadena(puntos(ejes.map(() => nivel))), class: 'e3-anillo'}));
        dibujo.append(svg('text', {x: 366, y: 350 - radio * nivel / 5 - 4, class: 'e3-nivel'}, String(nivel)));
      }
      const extremos = puntos(ejes.map(() => 5));
      extremos.forEach(([x, y]) => dibujo.append(svg('line', {x1: 360, y1: 350, x2: x, y2: y, class: 'e3-anillo'})));
      if (filas.every(f => f.a !== null)) dibujo.append(svg('polygon', {points: cadena(puntos(filas.map(f => f.a))), class: 'e3-principal'}));
      if (comparada && filas.every(f => f.b !== null)) dibujo.append(svg('polygon', {points: cadena(puntos(filas.map(f => f.b))), class: 'e3-comparada'}));
      const posiciones = puntos(filas.map(f => f.a ?? 0));
      filas.forEach((f, i) => {
        const [x, y] = posiciones[i], [ex, ey] = extremos[i];
        const diferencia = f.diferencia === null ? '' : ` (${f.diferencia >= 0 ? '+' : ''}${numero(f.diferencia)})`;
        const texto = comparada ? `${f.eje.nombre}: ${numero(f.b)} → ${numero(f.a)}${diferencia}` : `${f.eje.nombre}: ${numero(f.a)}`;
        const grupo = svg('g', {tabindex: 0, role: 'button', 'aria-label': texto, 'aria-pressed': String(ejeSeleccionado.id === f.eje.id), class: 'e3-vertice'});
        grupo.append(svg('title', {}, texto), svg('circle', {cx: x, cy: y, r: 6, fill: E.colorPara(f.a, datos.umbrales) || 'var(--secundario)'}), svg('text', {x: x + 10, y: y - 9, class: 'e3-puntaje'}, numero(f.a)));
        const lx = 360 + (ex - 360) * 1.18, ly = 350 + (ey - 350) * 1.18;
        const partes = lineas(f.eje.nombre, 16), anchor = 'middle';
        const label = svg('text', {x: lx, y: ly - (partes.length - 1) * 9, 'text-anchor': anchor, class: 'e3-etiqueta'});
        partes.forEach((p, j) => label.append(svg('tspan', {x: lx, dy: j ? 18 : 0}, p))); grupo.append(label);
        grupo.addEventListener('click', () => seleccionar(f.eje));
        grupo.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); seleccionar(f.eje); } });
        grupo.addEventListener('focus', () => { lectura.textContent = texto; });
        grupo.addEventListener('mouseenter', () => { lectura.textContent = texto; });
        dibujo.append(grupo);
      });
      const lectura = el('p', 'Enfoca o señala un eje para ver su comparación.', 'e3-lectura'); lectura.setAttribute('aria-live', 'polite');
      seccion.append(dibujo, lectura, el('p', `Área rellena: ${etiqueta(principal)}`, 'e3-leyenda-principal'));
      if (comparada) seccion.append(el('p', `Línea discontinua: ${etiqueta(comparada)}`, 'e3-leyenda-comparada'));
      const tabla = el('table', null, 'e3-tabla'); tabla.append(el('caption', 'Puntajes por eje · Diferencia = evaluación principal menos comparación'));
      const head = el('thead'), tr = el('tr'); ['Eje', 'Puntaje', 'Comparación', 'Diferencia'].forEach(t => { const th = el('th', t); th.scope = 'col'; tr.append(th); }); head.append(tr); tabla.append(head);
      const body = el('tbody');
      filas.forEach(f => {
        const fila = el('tr'), celda = el('th'), boton = el('button', f.eje.nombre); celda.scope = 'row';
        boton.setAttribute('aria-pressed', String(ejeSeleccionado.id === f.eje.id)); boton.onclick = () => seleccionar(f.eje); celda.append(boton); fila.append(celda);
        [numero(f.a), comparada ? numero(f.b) : '—', delta(f.diferencia)].forEach((t, j) => { const td = el('td', t); td.dataset.etiqueta = ['Puntaje', 'Comparación', 'Diferencia'][j]; fila.append(td); }); body.append(fila);
      }); tabla.append(body); const detalleTabla = el('details', null, 'e3-datos'); detalleTabla.append(el('summary', 'Ver puntajes por eje'), tabla); seccion.append(detalleTabla); return seccion;
    }
    function dibujar() {
      cuerpo.replaceChildren();
      const colores = el('div', null, 'e3-colores');
      datos.umbrales.cortes.forEach((c, i) => {
        const desde = i ? datos.umbrales.cortes[i - 1].menor_que : datos.umbrales.escala.minimo;
        const item = el('span', `${c.nombre}: ${numero(desde)} ${c.menor_que === null ? 'a ' + numero(datos.umbrales.escala.maximo) : 'a menos de ' + numero(c.menor_que)}`);
        const punto = el('span', '● '); punto.style.color = c.color; item.prepend(punto); colores.append(item);
      }); cuerpo.append(colores);
      if (datos.umbrales.hipotesis) cuerpo.append(el('p', datos.umbrales.nota, 'ayuda'));
      const charts = el('div', null, 'e3-graficos'); graficos.forEach(([g, t]) => charts.append(grafico(g, t))); cuerpo.append(charts);
      const panel = el('section', null, 'superficie e3-detalle'), titulo = el('h2', ejeSeleccionado.nombre); titulo.id = 'e3-eje-titulo'; titulo.tabIndex = -1;
      panel.append(titulo, el('p', `Evaluación: ${etiqueta(principal)} · Puntaje: ${numero(principal.puntajes[ejeSeleccionado.id])}`));
      const h = ejeSeleccionado.hallazgos;
      if (principal.id !== h.evaluacion || principal.origen !== 'fuente') panel.append(el('p', 'Esta evaluación solo registra puntajes; los hallazgos detallados corresponden al análisis de diciembre de 2025'));
      else if (h.grupos) h.grupos.forEach((g, i) => {
        const criterio = ejeSeleccionado.criterios[i], bloque = el('section', null, 'e3-criterio');
        bloque.append(el('h3', `${criterio.nombre} · Calificación: ${numero(criterio.calificacion)}`), el('p', g.nombre));
        g.indicadores.forEach(ind => bloque.append(indicador(ind))); panel.append(bloque);
      });
      else h.indicadores.forEach(ind => panel.append(indicador(ind)));
      const acciones = el('section'); acciones.append(el('h3', 'Acciones del plan que cierran este eje'), el('p', 'Cargando acciones…')); panel.append(acciones); cuerpo.append(panel);
      const idEje = ejeSeleccionado.id;
      (async () => {
        try {
          const plan = await Promise.resolve(App.obtenerPlan());
          if (!activo || !acciones.isConnected) return;
          acciones.lastChild.remove();
          const vinculadas = plan.filter(a => a.ejes?.includes(idEje));
          if (!vinculadas.length) acciones.append(el('p', 'No hay acciones vinculadas a este eje.'));
          vinculadas.forEach(a => {
            const tarjeta = el('article', null, 'accion'), enlace = el('a', a.titulo); enlace.href = '#/ddhh/plan?accion=' + encodeURIComponent(a.id);
            tarjeta.append(enlace, el('p', `${datos.planConfig.componentes.find(c => c.id === a.componente)?.nombre || a.componente} · Estado: ${a.estado.replace(/-/g, ' ')}`));
            if (a.vinculos_estimados) tarjeta.append(el('span', 'Vínculo estimado', 'aviso')); acciones.append(tarjeta);
          });
        } catch (_) { if (activo && acciones.isConnected) acciones.lastChild.textContent = 'No se pudieron cargar las acciones del plan.'; }
      })();
    }
    function prepararControles() {
      controles.replaceChildren();
      [['Evaluación', principal?.id, false], ['Comparar con', comparada?.id || '', true]].forEach(([texto, valor, vs]) => {
        const label = el('label', texto), select = el('select'); select.id = vs ? 'e3-vs' : 'e3-eval';
        if (vs) { const op = el('option', 'Sin comparación'); op.value = ''; select.append(op); }
        evaluaciones.forEach(e => { const op = el('option', etiqueta(e)); op.value = e.id; select.append(op); }); select.value = valor;
        select.onchange = () => { if (vs) comparada = evaluaciones.find(e => e.id === select.value) || null; else principal = evaluaciones.find(e => e.id === select.value); url(); dibujar(); };
        label.append(select); controles.append(label);
      });
      const cargar = el('button', 'Cargar nueva evaluación'); cargar.onclick = () => abrirFormulario(cargar); controles.append(cargar);
    }
    function abrirFormulario(disparador) {
      dialogo = el('dialog', null, 'e3-dialogo'); dialogo.setAttribute('role', 'dialog'); dialogo.setAttribute('aria-labelledby', 'e3-form-titulo');
      const modal = dialogo;
      const form = el('form'); form.noValidate = true;
      const titulo = el('h2', 'Cargar nueva evaluación'); titulo.id = 'e3-form-titulo';
      const cerrar = el('button', 'Cerrar'); cerrar.type = 'button'; cerrar.onclick = () => modal.close();
      const mensaje = el('div', null, 'e3-error'); mensaje.setAttribute('role', 'alert'); mensaje.tabIndex = -1;
      form.append(cerrar, titulo, el('p', 'Esta es una demostración pública: lo que guardes será visible para cualquiera con el enlace.', 'e3-aviso'));
      if (sinBase) form.append(el('p', respaldo, 'e3-aviso'));
      const campos = new Map();
      function campo(padre, id, nombre, puntaje) {
        const label = el('label', nombre), input = el('input'); input.id = 'e3-campo-' + id; input.name = id; input.required = true; input.type = 'text';
        if (puntaje) {
          input.inputMode = 'decimal'; input.setAttribute('role', 'spinbutton');
          input.setAttribute('aria-valuemin', '0'); input.setAttribute('aria-valuemax', '5');
          input.setAttribute('aria-description', 'De 0 a 5. Flechas arriba y abajo cambian 0,1. Admite coma o punto.'); input.placeholder = '0 a 5';
          const actualizar = () => {
            const n = E.parsearPuntaje(input.value);
            if (n === null) input.removeAttribute('aria-valuenow'); else input.setAttribute('aria-valuenow', String(n));
          };
          input.addEventListener('input', actualizar);
          input.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const valor = event.key === 'Home' ? 0 : event.key === 'End' ? 5 : (E.parsearPuntaje(input.value) ?? 0) + (event.key === 'ArrowUp' ? 0.1 : -0.1);
            input.value = numero(Math.max(0, Math.min(5, valor))); actualizar();
          });
        }
        else if (id === 'nombre') input.maxLength = 80;
        else { input.placeholder = 'AAAA-MM'; input.pattern = '[0-9]{4}-(0[1-9]|1[0-2])'; }
        const error = el('span', '', 'e3-error'); error.id = input.id + '-error'; input.setAttribute('aria-describedby', error.id);
        label.append(input, error); padre.append(label); campos.set(id, {input, error});
      }
      campo(form, 'nombre', 'Nombre', false); campo(form, 'fecha', 'Fecha (AAAA-MM)', false);
      graficos.forEach(([g, t]) => { const fieldset = el('fieldset'); fieldset.append(el('legend', t)); E.ejesDe(g, datos.estandares).forEach(e => campo(fieldset, e.id, e.nombre, true)); form.append(fieldset); });
      const prellenar = el('button', 'Prellenar con la evaluación actual'); prellenar.type = 'button'; prellenar.onclick = () => datos.estandares.ejes.forEach(e => { const input = campos.get(e.id).input; input.value = numero(principal.puntajes[e.id]); input.setAttribute('aria-valuenow', String(E.parsearPuntaje(input.value))); });
      const guardar = el('button', 'Guardar evaluación'); guardar.type = 'submit'; guardar.disabled = sinBase;
      form.append(prellenar, mensaje, guardar); dialogo.append(form); document.body.append(dialogo);
      modal.addEventListener('close', () => { modal.remove(); if (dialogo === modal) dialogo = null; if (activo) disparador.focus(); });
      form.onsubmit = async ev => {
        ev.preventDefault(); if (guardar.disabled) return;
        const entrada = {nombre: campos.get('nombre').input.value, fecha: campos.get('fecha').input.value, puntajes: {}};
        datos.estandares.ejes.forEach(e => { entrada.puntajes[e.id] = campos.get(e.id).input.value; });
        const resultado = E.validarEvaluacion(entrada, datos.estandares.ejes, evaluaciones.map(e => e.id));
        campos.forEach(({input, error}, id) => { error.textContent = resultado.errores[id] || ''; input.setAttribute('aria-invalid', String(!!resultado.errores[id])); });
        if (!resultado.ok) { mensaje.textContent = resultado.errores.id || 'Revisa los campos señalados.'; (campos.get(Object.keys(resultado.errores)[0])?.input || mensaje).focus(); return; }
        guardar.disabled = true; mensaje.textContent = 'Guardando evaluación…';
        try {
          // Releer antes de escribir reduce el riesgo de reemplazar un id añadido desde otra sesión.
          const actuales = await GHDatos.list('evaluaciones');
          if (GHDatos.estado === 'respaldo') { sinBase = true; avisoBase(); throw new Error('respaldo'); }
          evaluaciones = E.combinar(evaluaciones, actuales);
          if (evaluaciones.some(e => e.id === resultado.evaluacion.id)) { mensaje.textContent = 'Ya existe una evaluación con esta fecha y nombre. Cambia el nombre.'; return; }
          await GHDatos.set('evaluaciones', resultado.evaluacion.id, resultado.evaluacion);
          if (!activo) return;
          const anterior = principal; principal = resultado.evaluacion; comparada = anterior;
          evaluaciones = E.combinar(evaluaciones, [principal]); sinBase = false; avisoBase(); modal.close(); prepararControles(); url(); dibujar(); controles.querySelector('select').focus();
        } catch (_) { mensaje.textContent = 'No se pudo guardar la evaluación. Revisa la conexión e inténtalo de nuevo. Los datos escritos se conservan.'; }
        finally { guardar.disabled = false; }
      };
      dialogo.showModal(); campos.get('nombre').input.focus();
    }
    (async () => {
      let base = [];
      try { base = await GHDatos.list('evaluaciones'); sinBase = GHDatos.estado === 'respaldo'; }
      catch (_) { sinBase = true; }
      if (!activo) return;
      evaluaciones = E.combinar(datos.evaluaciones, base);
      principal = evaluaciones.find(e => e.id === params.filtros.get('eval')) || evaluaciones[0];
      comparada = params.filtros.has('vs') ? evaluaciones.find(e => e.id === params.filtros.get('vs')) || null : evaluaciones[evaluaciones.indexOf(principal) + 1] || null;
      ejeSeleccionado = datos.estandares.ejes.find(e => e.id === params.filtros.get('eje')) || datos.estandares.ejes[0];
      avisoBase(); prepararControles(); url(); dibujar();
    })();
    return () => { activo = false; if (dialogo) { dialogo.remove(); dialogo = null; } };
  }});
}());
