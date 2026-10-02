(function () {
  'use strict';
  const el = App.el;
  const nombres = {pendiente: 'Pendiente', 'en-curso': 'En curso', cumplida: 'Cumplida', estado: 'Estado', avance: 'Avance', responsable: 'Responsable', plazo: 'Plazo', nota_seguimiento: 'Nota de seguimiento'};
  const porcentaje = n => new Intl.NumberFormat('es-CO', {maximumFractionDigits: 1}).format(n) + ' %';
  function fecha(valor) {
    const d = new Date(valor.length === 10 ? valor + 'T12:00:00' : valor);
    return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString('es-CO', {day: 'numeric', month: 'long', year: 'numeric'});
  }
  function barra(valor, nombre) {
    const caja = el('div', null, 'plan-avance');
    const progreso = el('progress'); progreso.max = 100; progreso.value = valor; progreso.setAttribute('aria-label', nombre);
    caja.append(progreso, el('span', porcentaje(valor))); return caja;
  }
  App.registrarVista('plan', {render(contenedor, datos, params) {
    const cfg = datos.planConfig;
    const filtros = new URLSearchParams(params.filtros);
    const hoy = new Date();
    const dia = [hoy.getFullYear(), String(hoy.getMonth() + 1).padStart(2, '0'), String(hoy.getDate()).padStart(2, '0')].join('-');
    let vivo = true, fondo, limpiarDialogo = () => {};
    const cerrados = new Set();
    const pendientes = new Set();
    const mensajes = new Map();
    const raiz = el('section', null, 'vista-plan');
    const resumen = el('section', null, 'superficie');
    const lista = el('section');
    const aviso = el('p', 'No hay conexión con la base de datos: se muestran los datos de respaldo y no se pueden guardar cambios ahora.', 'plan-conexion');
    aviso.setAttribute('role', 'status'); aviso.hidden = App.estadoBase() === 'base';
    raiz.append(el('h1', 'Plan de acción'), aviso, el('p', 'Demostración pública: los cambios se guardan y los ve cualquiera con el enlace.', 'ayuda'), resumen);
    contenedor.append(raiz);
    function ruta(cambios) {
      const q = new URLSearchParams(filtros);
      Object.entries(cambios).forEach(([k, v]) => v ? q.set(k, v) : q.delete(k));
      return '#/ddhh/plan' + (q.size ? '?' + q.toString() : '');
    }
    function propuesta(a, campo, nodo) {
      if ((a.campos_propuestos || []).includes(campo)) nodo.append(el('span', 'Propuesta', 'aviso'));
      return nodo;
    }
    function selector(opciones, valor) {
      const s = el('select'); opciones.forEach(([id, nombre]) => { const o = el('option', nombre); o.value = id; s.append(o); }); s.value = valor; return s;
    }
    const controles = el('form', null, 'plan-filtros');
    controles.addEventListener('submit', e => e.preventDefault());
    [['componente', 'Componente', cfg.componentes.map(c => [c.id, c.nombre])], ['estado', 'Estado', cfg.estados.map(e => [e, nombres[e]])], ['riesgo', 'Riesgo vinculado', datos.riesgos.map(r => [r.id, r.id.replace('riesgo-', '') + ' · ' + r.nombre])], ['eje', 'Eje de brecha', datos.estandares.ejes.map(e => [e.id, e.nombre])]].forEach(([campo, nombre, opciones]) => {
      const label = el('label', nombre); const s = selector([['', 'Todos'], ...opciones], filtros.get(campo) || ''); s.id = 'plan-filtro-' + campo;
      s.onchange = () => { location.hash = ruta({[campo]: s.value}); }; label.append(s); controles.append(label);
    });
    const buscar = el('label', 'Buscar en título y descripción'); const entrada = el('input'); entrada.type = 'search'; entrada.id = 'plan-buscar'; entrada.value = filtros.get('q') || '';
    entrada.onchange = () => { location.hash = ruta({q: entrada.value}); }; buscar.append(entrada); controles.append(buscar);
    const limpiar = el('a', 'Limpiar filtros', 'boton'); limpiar.href = '#/ddhh/plan'; controles.append(limpiar);
    raiz.append(controles, lista);
    function estadoGuardado(id) {
      const mensaje = el('p', mensajes.get(id) || '', 'plan-guardado'); mensaje.setAttribute('role', 'status'); mensaje.setAttribute('aria-live', 'polite'); mensaje.dataset.guardado = id; return mensaje;
    }
    function anunciar(id, texto) {
      mensajes.set(id, texto);
      [raiz, fondo].filter(Boolean).forEach(n => n.querySelectorAll('[data-guardado]').forEach(p => { if (p.dataset.guardado === id) p.textContent = texto; }));
    }
    async function guardar(id, campo, valor, control) {
      if (pendientes.has(id)) return;
      pendientes.add(id); control.disabled = true; anunciar(id, 'Guardando…');
      [raiz, fondo].filter(Boolean).forEach(n => n.querySelectorAll('[data-edita]').forEach(c => { if (c.dataset.edita === id) c.disabled = true; }));
      try {
        await App.guardarAccion(id, {[campo]: valor});
        if (!vivo) return;
        anunciar(id, 'Guardado');
        dibujar();
        if (fondo) {
          formulario.querySelectorAll('[data-campo]').forEach(c => { if (c.dataset.campo === campo) c.dataset.sucio = ''; });
          actualizarDetalle();
        }
      } catch (error) { if (vivo) anunciar(id, error.message); }
      finally {
        pendientes.delete(id);
        if (vivo) {
          control.disabled = App.estadoBase() !== 'base';
          [raiz, fondo].filter(Boolean).forEach(n => n.querySelectorAll('[data-edita]').forEach(c => { c.disabled = App.estadoBase() !== 'base' || pendientes.has(c.dataset.edita); }));
          if (!fondo) document.getElementById(control.id)?.focus({preventScroll: true});
        }
      }
    }
    function editarControl(control, a) { control.dataset.edita = a.id; control.disabled = App.estadoBase() !== 'base' || pendientes.has(a.id); return control; }
    function dibujar() {
      const acciones = App.obtenerPlan(); const r = Plan.resumen(acciones, cfg, dia);
      resumen.replaceChildren(el('h2', 'Avance global'), barra(r.avanceGlobal, 'Avance global'));
      const cuentas = el('p', cfg.estados.map(e => nombres[e] + ': ' + r.porEstado[e]).join(' · ') + ' · Vencidas: ' + r.vencidas); resumen.append(cuentas);
      const componentes = el('div', null, 'plan-componentes');
      r.porComponente.forEach(c => {
        const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(filtros.get('componente') === c.componente));
        b.append(el('strong', c.nombre), el('span', c.n + ' acciones'), barra(c.avance, c.nombre)); b.onclick = () => { location.hash = ruta({componente: c.componente}); }; componentes.append(b);
      }); resumen.append(componentes);
      const visibles = Plan.filtrar(acciones, Object.fromEntries(filtros));
      lista.replaceChildren(el('p', visibles.length + ' acciones', 'resultado'));
      if (!visibles.length) lista.append(el('p', 'No hay acciones que coincidan con los filtros.'));
      cfg.componentes.forEach(c => {
        const grupo = visibles.filter(a => a.componente === c.id); if (!grupo.length) return;
        const d = el('details', null, 'superficie plan-grupo'); d.open = !cerrados.has(c.id);
        d.ontoggle = () => { if (d.isConnected) d.open ? cerrados.delete(c.id) : cerrados.add(c.id); };
        const cabecera = el('summary', c.nombre + ' · ' + grupo.length + ' acciones'); cabecera.append(barra(Plan.resumen(grupo, cfg, dia).avanceGlobal, 'Avance del grupo')); d.append(cabecera);
        grupo.forEach(a => {
          const tarjeta = el('article', null, 'accion');
          const titulo = el('h3'); const enlace = el('a', a.titulo); enlace.href = ruta({accion: a.id}); enlace.id = 'plan-abrir-' + a.id;
          titulo.append(enlace); tarjeta.append(propuesta(a, 'titulo', titulo));
          tarjeta.append(propuesta(a, 'estado', el('span', nombres[a.estado] || a.estado, 'criticidad')), propuesta(a, 'avance', barra(a.avance, 'Avance de ' + a.titulo)));
          tarjeta.append(propuesta(a, 'responsable', el('p', 'Responsable: ' + a.responsable)), propuesta(a, 'plazo', el('p', 'Plazo: ' + fecha(a.plazo) + (Plan.vencida(a, dia) ? ' · Vencida' : ''), Plan.vencida(a, dia) ? 'alta' : '')));
          tarjeta.append(propuesta(a, 'indicador', el('p', 'Indicador: ' + a.indicador)));
          const vinculos = el('div', null, 'plan-vinculos');
          (a.riesgos || []).forEach(id => { const r = datos.riesgos.find(r => r.id === id); const l = el('a', id.replace('riesgo-', '') + ' · ' + (r?.nombre || id).slice(0, 85)); l.href = '#/ddhh/riesgos/' + encodeURIComponent(id); l.title = r?.nombre || id; vinculos.append(l); });
          (a.ejes || []).forEach(id => { const eje = datos.estandares.ejes.find(e => e.id === id); const l = el('a', eje?.nombre || id); l.href = '#/ddhh/estandares?eje=' + encodeURIComponent(id); vinculos.append(l); });
          if (a.vinculos_estimados) vinculos.append(el('span', 'Vínculo estimado', 'aviso')); tarjeta.append(vinculos);
          if (a.actualizado) tarjeta.append(el('small', 'Actualizado el ' + fecha(a.actualizado)));
          const rapida = el('div', null, 'plan-rapida'); const label = el('label', 'Estado');
          const s = editarControl(selector(cfg.estados.map(e => [e, nombres[e]]), a.estado), a); s.id = 'plan-estado-' + a.id; s.onchange = () => guardar(a.id, 'estado', s.value, s); label.append(s); rapida.append(label);
          const avance = el('label', 'Avance (pasos de 10 %)'); const rango = editarControl(el('input'), a); rango.type = 'range'; rango.min = 0; rango.max = 100; rango.step = 10; rango.value = a.avance; rango.id = 'plan-avance-' + a.id;
          rango.setAttribute('aria-valuetext', porcentaje(a.avance)); rango.oninput = () => rango.setAttribute('aria-valuetext', porcentaje(Number(rango.value))); rango.onchange = () => guardar(a.id, 'avance', Number(rango.value), rango);
          avance.append(rango); rapida.append(avance); tarjeta.append(rapida, estadoGuardado(a.id)); d.append(tarjeta);
        }); lista.append(d);
      });
    }
    let detalle, formulario, historia, tituloDetalle;
    const accionId = filtros.get('accion');
    function actualizarDetalle() {
      const a = App.obtenerPlan().find(a => a.id === accionId); if (!a) return;
      // Conserva las entradas no confirmadas de los otros campos.
      formulario.querySelectorAll('[data-campo]').forEach(c => {
        if (c.dataset.sucio !== 'si') c.value = a[c.dataset.campo] ?? '';
        const marca = c.parentElement.querySelector('.aviso'); if (marca && !a.campos_propuestos.includes(c.dataset.campo)) marca.remove();
      });
      historia.replaceChildren(el('h3', 'Historial de cambios'));
      if (!a.historial?.length) historia.append(el('p', 'Todavía no hay cambios registrados.'));
      [...(a.historial || [])].reverse().forEach(h => {
        const valor = v => h.campo === 'plazo' && v ? fecha(String(v)) : nombres[v] || String(v);
        historia.append(el('p', fecha(h.fecha) + ' · ' + (nombres[h.campo] || h.campo) + ': ' + valor(h.antes) + ' → ' + valor(h.despues)));
      });
    }
    dibujar();
    if (accionId) {
      const a = App.obtenerPlan().find(a => a.id === accionId);
      if (!a) lista.prepend(el('p', 'No se encontró la acción solicitada.', 'plan-conexion'));
      else {
        fondo = el('div', null, 'fondo-dialogo'); detalle = el('section', null, 'panel plan-panel'); detalle.setAttribute('role', 'dialog'); detalle.setAttribute('aria-modal', 'true'); detalle.setAttribute('aria-labelledby', 'plan-detalle-titulo');
        const cerrar = el('button', 'Cerrar'); cerrar.className = 'cerrar'; cerrar.onclick = () => { location.hash = ruta({accion: ''}); };
        tituloDetalle = el('h2', a.titulo); tituloDetalle.id = 'plan-detalle-titulo'; detalle.append(cerrar, tituloDetalle, el('p', a.descripcion, 'texto-dato'));
        detalle.append(el('small', 'Fuente: ' + (a.fuente?.archivo || 'Sin referencia') + (a.fuente?.tabla !== undefined ? ' · Tabla ' + a.fuente.tabla : '') + (a.fuente?.fila !== undefined ? ' · Fila ' + a.fuente.fila : '')));
        formulario = el('div', null, 'plan-formulario');
        formulario.append(el('p', 'Confirma cada campo para guardarlo. Usa áreas responsables y evita incluir datos personales.', 'ayuda'));
        ['estado', 'avance', 'responsable', 'plazo', 'nota_seguimiento'].forEach(campo => {
          const form = el('form'); const label = propuesta(a, campo, el('label', nombres[campo]));
          const input = editarControl(campo === 'estado' ? selector(cfg.estados.map(e => [e, nombres[e]]), a.estado) : el(campo === 'nota_seguimiento' ? 'textarea' : 'input'), a);
          input.id = 'plan-detalle-' + campo; input.dataset.campo = campo; input.value = a[campo] ?? '';
          if (campo === 'avance') { input.type = 'number'; input.min = 0; input.max = 100; input.step = 1; input.required = true; }
          if (campo === 'plazo') { input.type = 'date'; input.required = true; }
          if (campo === 'responsable') input.maxLength = 120;
          if (campo === 'nota_seguimiento') input.maxLength = 500;
          input.oninput = () => { input.dataset.sucio = 'si'; };
          label.append(input); const confirmar = editarControl(el('button', 'Guardar ' + nombres[campo].toLowerCase()), a); confirmar.type = 'submit'; confirmar.id = 'plan-confirmar-' + campo;
          form.onsubmit = async event => { event.preventDefault(); if (pendientes.has(a.id)) return; await guardar(a.id, campo, campo === 'avance' ? Number(input.value) : input.value, confirmar); };
          form.append(label, confirmar); formulario.append(form);
        });
        historia = el('section'); detalle.append(formulario, estadoGuardado(a.id), historia); fondo.append(detalle); document.body.append(fondo);
        const inertes = [...document.body.children].filter(n => n !== fondo && !['SCRIPT', 'STYLE'].includes(n.tagName)).map(n => [n, n.inert]); inertes.forEach(([n]) => { n.inert = true; }); document.body.classList.add('dialogo-abierto');
        const teclado = event => {
          if (event.key === 'Escape') { event.preventDefault(); cerrar.click(); }
          if (event.key === 'Tab') {
            const elementos = [...detalle.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')]; const primero = elementos[0], ultimo = elementos.at(-1);
            if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
            else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
          }
        };
        detalle.addEventListener('keydown', teclado); actualizarDetalle(); cerrar.focus();
        limpiarDialogo = () => { fondo.remove(); inertes.forEach(([n, previo]) => { n.inert = previo; }); document.body.classList.remove('dialogo-abierto'); queueMicrotask(() => { if (location.hash.startsWith('#/ddhh/plan') && !new URLSearchParams(location.hash.split('?')[1]).has('accion')) document.getElementById('plan-abrir-' + accionId)?.focus(); }); };
      }
    }
    return () => { vivo = false; limpiarDialogo(); };
  }});
}());
