#!/usr/bin/env python3
"""Extrae exclusivamente los insumos locales de Solgas; nunca modifica las fuentes.

Uso: python3 scripts/extraer_solgas.py /carpeta/de/fuentes
Dependencias: openpyxl, python-docx; Node para reutilizar el cálculo UMD.
"""
import argparse
import calendar
import json
import re
import subprocess
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
MAT = '20260116 Anexo 2 Matriz de Riesgos en Derechos Humanos Solgas Consolidada Validada.xlsx'
BRE = '20250721 Anexo 1 Análisis de Brechas Solgas VF.xlsx'
INF = '20251216Informe de resultados y estrategía.docx'

# Tabla explícita de texto original completo (F) -> ámbitos; no inferencia por palabras.
AMBITOS = {
    '1. Operación\n2. Cadena de distribución': ['operacion-propia', 'cadena-distribucion'],
    '1. Operación': ['operacion-propia'],
    '1. Operación\n2. Cadena de distribución\n3. Proveedores': ['operacion-propia', 'cadena-distribucion', 'cadena-suministro'],
    '1. Operación\n2. Instalaciones de clientes B2B\n3. Cadena de distribución.\n4. Comunidades receptoras': ['operacion-propia', 'cadena-distribucion'],
    '1. Cadena de distribución': ['cadena-distribucion'],
    '1. Cadena de proveedores\n2. Cadena de distribución': ['cadena-suministro', 'cadena-distribucion'],
    '1. Operación\n2. Operación de contratistas': ['operacion-propia', 'cadena-suministro'],
    '1. Cadena de suministros\n2. Contratistas en obras y servicios': ['cadena-suministro'],
    '1. Cadena de suministros\n2. Cadena de distribución': ['cadena-suministro', 'cadena-distribucion'],
    '1. Operación (ámbito administrativo)': ['operacion-propia'],
    '1. Cadena de distribución.\n2. Proveedores': ['cadena-distribucion', 'cadena-suministro'],
}
AMBITOS_ESTIMADOS = {
    'Instalaciones de clientes B2B': 'cadena-distribucion',
    'Comunidades receptoras': 'cadena-distribucion',
    'Operación de contratistas': 'cadena-suministro',
    'Contratistas en obras y servicios': 'cadena-suministro',
}
VINCULACIONES = {'Causa': 'causa', 'Contribuye': 'contribuye', 'Directamente Vinculada': 'directamente-vinculada'}
COMPONENTES = [
    'Fortalecimiento del compromiso organizacional',
    'Articulación estructurada de gestión en empresa y derechos humanos',
    'Acciones de gestión y manejo de los riesgos e impactos en DDHH',
    'Mecanismo de reclamación y reparación',
    'Mecanismo de medición y seguimiento',
    'Modelo de comunicación y reporte',
]
# Valores deliberadamente fijos. La fecha mensual no inventa un día de evaluación.
EJEMPLO = [3.5, 3.5, 3.4, 3.5, 3.3, 4.0, 3.9, 4.0, 4.2, 3.5, 4.2, 4.5, 4.4, 4.4, 4.3, 4.0]


def texto(value):
    return None if value is None else str(value).strip()


def normalizar(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', value)).strip().casefold()


def fuente(folder, name):
    matches = [p for p in folder.iterdir() if unicodedata.normalize('NFC', p.name) == name]
    if len(matches) != 1:
        raise ValueError('No se encontró una fuente única: ' + name)
    return matches[0]


def unicos(values):
    return list(dict.fromkeys(values))


def config_criticidad(mat):
    s = mat['Parámetros de control']
    gravedad = mat['Parámetros de gravedad']
    return {
        'gravedad': {
            'criterios': ['escala', 'alcance', 'irreparable'],
            'escala': {'minimo': 1, 'maximo': 3, 'enteros': True},
            'agregacion': 'promedio',
            'cortes': [{'nivel': 'Baja', 'menor_que': 1.5}, {'nivel': 'Media', 'menor_que': 2.5}, {'nivel': 'Alta', 'menor_que': None}],
            'parametros': {key: [{'valor': gravedad.cell(r, 3).value, 'descripcion': texto(gravedad.cell(r, 5).value)} for r in rows]
                           for key, rows in [('escala', range(10, 13)), ('alcance', range(13, 16)), ('irreparable', range(16, 19))]},
        },
        'probabilidad': ['alta', 'media', 'baja'],
        'vinculacion': {VINCULACIONES[texto(s.cell(r, 3).value)]: {
            'nivel': texto(s.cell(r, 2).value).lower(),
            'medidas': {'impacto_potencial': texto(s.cell(r, 4).value), 'impacto_manifestado': texto(s.cell(r, 5).value)},
        } for r in range(11, 14)},
        'matriz': {'x': 'probabilidad', 'y': 'gravedad'},
        'agregacion_riesgo': 'maximo',
        'ambitos': [{'id': k, 'etiqueta': v} for k, v in [('operacion-propia', 'Operación propia'), ('cadena-suministro', 'Cadena de suministro'), ('cadena-distribucion', 'Cadena de distribución')]],
        'normalizaciones_ambito': AMBITOS,
        'normalizaciones_estimadas': {'origen': 'estimado', 'asignaciones': AMBITOS_ESTIMADOS},
        'origen': 'fuente',
        'campos_propuestos': ['gravedad.cortes'],
        'nota': 'Cortes definidos por el encargo; se corrige el caso exacto 2,5 de la fórmula Excel: Alta. Vinculación y probabilidad no intervienen en la criticidad.',
    }


def extraer_riesgos(mat, traducciones):
    s = mat['Matriz de riesgos DDHH']
    rows = [r for r in range(12, 74) if s.cell(r, 2).value]
    if len(rows) != 20:
        raise ValueError('Se esperaban 20 filas de riesgos; se encontraron ' + str(len(rows)))
    responsables, faltantes = {}, set()
    for r in rows:
        # Solo aquí se procesan nombres privados. Nunca se incorporan al JSON.
        raw = re.sub(r'\([^)]*\)', '/', texto(s.cell(r, 16).value) or '')
        names = [n.strip() for n in re.split(r'[/\n]+', raw) if n.strip()]
        if not names:
            raise ValueError('Responsable vacío en MAT, fila ' + str(r))
        for name in names:
            if name not in traducciones or not isinstance(traducciones[name], str) or not traducciones[name].strip() or traducciones[name].strip() == 'POR_CONFIRMAR':
                faltantes.add(name)
        responsables[r] = unicos(traducciones[n].strip() for n in names if n not in faltantes)
    if faltantes:
        raise ValueError('Responsables sin traducción pública confirmada:\n' + '\n'.join(sorted(faltantes)))
    grouped = {}
    fields = {'derecho_humano': 8, 'localizacion': 7, 'actividades': 5, 'medidas_control': 15, 'analisis_controles': 18, 'accion_recomendada': 19}
    for r in rows:
        value = lambda col: s.cell(r, col).value
        nombre = texto(value(2))
        key = normalizar(nombre)
        if key not in grouped:
            grouped[key] = {'id': 'riesgo-%02d' % (len(grouped) + 1), 'nombre': nombre,
                            **{f: [] for f in fields}, 'ambitos': [], 'responsables': [], 'evaluaciones': [], 'origen': 'fuente',
                            'fuente': {'archivo': MAT, 'hoja': s.title, 'filas': []}}
        risk = grouped[key]
        for field, col in fields.items():
            if texto(value(col)):
                risk[field] = unicos(risk[field] + [texto(value(col))])
        raw_ambito = texto(value(6))
        if raw_ambito not in AMBITOS:
            raise ValueError('Ámbito sin normalización explícita: ' + str(raw_ambito))
        risk['ambitos'] = unicos(risk['ambitos'] + AMBITOS[raw_ambito])
        if any(a in raw_ambito for a in AMBITOS_ESTIMADOS):
            risk['campos_propuestos'] = ['ambitos']
        risk['responsables'] = unicos(risk['responsables'] + responsables[r])
        evaluation = {'actor_genera': texto(value(3)), 'actor_reporta': texto(value(4)),
                      'escala': value(9), 'alcance': value(10), 'irreparable': value(11),
                      'vinculacion': VINCULACIONES[texto(value(14))],
                      'probabilidad': texto(value(17)).lower() if texto(value(17)) else None, 'fila_fuente': r}
        if any(type(evaluation[k]) is not int or not 1 <= evaluation[k] <= 3 for k in ('escala', 'alcance', 'irreparable')):
            raise ValueError('Gravedad fuera de escala en fila ' + str(r))
        if evaluation['probabilidad'] not in ('alta', 'media', 'baja', None):
            raise ValueError('Probabilidad desconocida en fila ' + str(r))
        risk['evaluaciones'].append(evaluation)
        risk['fuente']['filas'].append(r)
    if len(grouped) != 18:
        raise ValueError('Se esperaban exactamente 18 riesgos; se encontraron ' + str(len(grouped)))
    for risk in grouped.values():
        for field in fields:
            risk[field] = '\n\n'.join(risk[field]) or None
    return list(grouped.values())


def indicador(s, row):
    v = lambda c: s.cell(row, c).value
    result = {'pregunta': texto(v(3)), 'incorporado': 'si' if v(4) is not None else 'no',
              'documentos': texto(v(6)), 'descripcion': texto(v(7)), 'calificacion': v(8), 'brecha': texto(v(9)),
              'origen': 'fuente', 'fila_fuente': row}
    if v(4) is None and v(5) is None:
        # BRE DD!105: no hay marca; la brecha indica ausencia de evidencia.
        result.update(campos_propuestos=['incorporado'], incorporado_fuente=None,
                      nota='Sin marca sí/no en la fuente; no estimado por falta de evidencia de capacitación periódica. Revisar.')
    return result


def extraer_estandares(bre):
    axes, scores = [], {}
    graph = bre['Análisis Gráfico DD']
    for r in range(6, 18):
        if graph.cell(r, 4).value:
            axis = {'id': 'etapa-ocde-' + str(len(axes) + 1), 'grafico': 'etapas-ocde', 'nombre': texto(graph.cell(r, 4).value),
                    'criterios': [], 'hallazgos': {'evaluacion': 'eval-2025-12', 'grupos': []}, 'origen': 'fuente'}
            axes.append(axis)
            scores[axis['id']] = graph.cell(r, 5).value
        axis['criterios'].append({'nombre': texto(graph.cell(r, 2).value), 'calificacion': graph.cell(r, 3).value})
    s = bre['Análisis de brechas DD']
    axis_index = -1
    for r in range(12, 107):
        if s.cell(r, 1).value:
            axis_index += 1
        if s.cell(r, 2).value:
            group = {'nombre': texto(s.cell(r, 2).value), 'indicadores': []}
            axes[axis_index]['hallazgos']['grupos'].append(group)
        # Los totales son celdas C:G fusionadas; no son indicadores. Incluye DD!82 sin «¿».
        if s.cell(r, 3).value and any(s.cell(r, c).value is not None for c in (4, 5, 6, 7, 9)):
            group['indicadores'].append(indicador(s, r))
    graph = bre['Análisis grafico DDHH']
    for r in range(6, 16):
        axis = {'id': 'tema-ddhh-' + str(r - 5), 'grafico': 'temas-ddhh', 'nombre': texto(graph.cell(r, 2).value),
                'hallazgos': {'evaluacion': 'eval-2025-12', 'indicadores': []}, 'origen': 'fuente'}
        axes.append(axis)
        scores[axis['id']] = graph.cell(r, 3).value
    s = bre['Análisis gestión en DDHH']
    axis_index = 5
    for r in range(7, 92):
        if s.cell(r, 2).value:
            axis_index += 1
        if s.cell(r, 3).value and any(s.cell(r, c).value is not None for c in (4, 5, 6, 7, 9)):
            axes[axis_index]['hallazgos']['indicadores'].append(indicador(s, r))
    scale = [{'valor': bre['Metodología'].cell(r, 2).value, 'descripcion': texto(bre['Metodología'].cell(r, 3).value)} for r in range(5, 11)]
    evaluations = [
        {'id': 'eval-2025-12', 'nombre': 'Evaluación de brechas 2025-12', 'fecha': '2025-12', 'origen': 'fuente', 'puntajes': scores},
        {'id': 'eval-ejemplo-2026', 'nombre': 'Evaluación de ejemplo 2026', 'fecha': '2026-12', 'origen': 'ejemplo', 'puntajes': dict(zip(scores, EJEMPLO))},
    ]
    return {'ejes': axes, 'escala': scale, 'origen': 'fuente'}, evaluations


def encontrar_tabla(doc, headers):
    matches = [(i, t) for i, t in enumerate(doc.tables) if [texto(c.text) for c in t.rows[0].cells] == headers]
    if len(matches) != 1:
        raise ValueError('Tabla ausente o ambigua: ' + ' | '.join(headers))
    return matches[0]


def sumar_meses(base, meses):
    d = date.fromisoformat(base)
    year, month = divmod(d.year * 12 + d.month - 1 + meses, 12)
    return date(year, month + 1, min(d.day, calendar.monthrange(year, month + 1)[1])).isoformat()


def niveles_riesgos(riesgos, config):
    # Una sola implementación de la fórmula, también al proponer los plazos.
    code = "const fs=require('node:fs'), R=require('./public/riesgos.js'); const x=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify(x.riesgos.map(r=>R.criticidad(r,x.cfg).nivel)));"
    result = subprocess.run(['node', '-e', code], cwd=ROOT, input=json.dumps({'riesgos': riesgos, 'cfg': config}), text=True, capture_output=True, check=True)
    return dict(zip((r['id'] for r in riesgos), json.loads(result.stdout)))


# Correspondencia explícita MAT / tabla de medidas INF; valida también el orden de ids.
RIESGO_IDS = {'Exceso de horas de trabajo durante picos de demanda o contingencias operativas': 'riesgo-01',
 'Acoso, hostigamiento y trato irrespetuoso en las operaciones internas de SOLGAS': 'riesgo-02',
 'Riesgos ergonómicos por manipulación de cilindros pesados (25–45 kg)': 'riesgo-03',
 'Pago insuficiente o no justo': 'riesgo-04',
 'Exposición a GLP, fugas, incendios y explosiones tanto en operaciones internas de Solgas como por prácticas externas de adulteración de cilindros.': 'riesgo-05',
 'Exposición de los trabajadores a sustancias químicas y peligrosas': 'riesgo-06',
 'Presencia de menores de edad en las actividades proveedores y la cadena de distribución': 'riesgo-07',
 'Deficiencias en condiciones de trabajo en la cadena de valor (jornadas, descansos, servicios)': 'riesgo-08',
 'Acoso, hostigamiento y trato irrespetuoso en las operaciones de la cadena de valor.': 'riesgo-09',
 'Incumplimientos sociolaborales por parte de contratistas y proveedores': 'riesgo-10',
 'Informalidad en las actividades de distribuidores y proveedores locales pequeños que pueden generar incumplimientos laborales': 'riesgo-11',
 'Afectaciones al mínimo vital por problemas en el suministro de GLP a comunidades': 'riesgo-12',
 'Riesgos de afectación comunitaria por tránsito pesado, ruido y restricciones al libre tránsito': 'riesgo-13',
 'Discriminación a personas con discapacidad por brechas de accesibilidad e inclusión.': 'riesgo-14',
 'Riesgos de corrupción o ilícitos corporativos': 'riesgo-15',
 'Deficiencias en los mecanismos de comunicación con grupos de interés': 'riesgo-16',
 'Afectaciones a los derechos humanos en las operaciones de SOLGAS, en su cadena de suministros y su cadena de distribución, que no son informados.': 'riesgo-17',
 'Limitaciones a la libertad sindical en la cadena de distribución y en las operaciones de los proveedores': 'riesgo-18'}
ACOSO_AGRUPADO = 'Acoso, hostigamiento y trato irrespetuoso en las operaciones internas de SOLGAS y su cadena de valor'
ACOSO_ACTORES = {'Supervisores': 'riesgo-02', 'Colaboradores': 'riesgo-02', 'Operadores': 'riesgo-02', 'Jefes de planta': 'riesgo-02', 'Proveedores': 'riesgo-09', 'Distribuidores': 'riesgo-09'}
TITULOS_MEDIDAS = [
    'Control digital de horarios y alertas de exceso de jornada',
    'Bienestar de conductores y canales para reportar condiciones laborales',
    'Formación a supervisores sobre denuncias, confidencialidad y no represalia',
    'Capacitación a colaboradores sobre denuncias y Código de Ética',
    'Capacitación operativa sobre denuncias y protección frente al acoso',
    'Formación a jefes de planta para investigar denuncias y preservar evidencia',
    'Socialización del canal ético y valores corporativos con proveedores',
    'Prevención contractual del acoso y seguimiento a distribuidores',
    'Fortalecimiento del programa de prevención ergonómica para operadores',
    'Capacitación y cláusulas ergonómicas para distribuidores',
    'Capacitación a gerentes sobre la política de compensaciones',
    'Capacitación a jefes de planta sobre la política de compensaciones',
    'Verificación y auditorías laborales a proveedores',
    'Transparencia y cláusulas salariales para distribuidores',
    'Trazabilidad y verificación de inspecciones de criticidad en operaciones',
    'Verificación de cilindros, válvulas y sellos antes de la carga',
    'Mantenimiento preventivo e inspecciones técnicas en clientes B2B',
    'Capacitación especializada en manejo seguro de sustancias químicas',
    'Homologación de proveedores por calidad química y seguridad',
    'Capacitación a distribuidores sobre sustancias químicas',
    'Cláusulas y verificación de edad para prevenir trabajo infantil en proveedores',
    'Monitoreo contractual contra trabajo infantil en distribución',
    'Cláusulas exigibles sobre condiciones laborales de proveedores',
    'Formalización de políticas de conducción segura para distribuidores',
    'Homologación sociolaboral de contratistas',
    'Homologación y evidencia de cumplimiento sociolaboral de distribuidores',
    'Monitoreo continuo de obligaciones laborales de proveedores pequeños',
    'Control de subcontratación y auditorías a distribuidores',
    'Diversificación y homologación de proveedores para continuidad del suministro de GLP',
    'Mapeo territorial de puntos críticos para distribución',
    'Protocolo de inclusión laboral y ajustes razonables para personas con discapacidad',
    'Actualización de prevención de delitos ante riesgos emergentes',
    'Trazabilidad documental de decisiones de compra',
    'Comunicación bidireccional y retroalimentación de grupos de interés',
    'Capacitación para identificar y reportar afectaciones en DDHH',
    'Cláusulas de libertad sindical y negociación colectiva con proveedores',
    'Seguimiento de riesgos sindicales y conflictos laborales en distribución',
]


def extraer_plan(doc, riesgos, criticidad_cfg):
    cfg = {
        'componentes': [{'id': 'componente-' + str(i), 'nombre': name} for i, name in enumerate(COMPONENTES, 1)],
        'estados': ['pendiente', 'en-curso', 'cumplida'], 'fecha_base': '2026-01-01',
        'plazo_propuesto': {'unidad': 'meses', 'por_criticidad': {'Alta': 6, 'Media': 12, 'Baja': 18}, 'sin_riesgo': 12},
        'origen': 'fuente', 'campos_propuestos': ['estados', 'fecha_base', 'plazo_propuesto'],
    }
    levels = niveles_riesgos(riesgos, criticidad_cfg)
    by_id = {r['id']: r for r in riesgos}
    for risk in riesgos:
        if RIESGO_IDS.get(risk['nombre']) != risk['id']:
            raise ValueError('Cambió el nombre u orden de la matriz; revisar RIESGO_IDS')
    acciones, ajustes = [], []
    policy_i, policies = encontrar_tabla(doc, ['POLÍTICA', 'PROPUESTA COMPLEMENTARIA'])
    measures_i, measures = encontrar_tabla(doc, ['RIESGO IDENTIFICADO', 'ACTOR QUE GENERA EL RIESGO', 'MEDIAS DE GESTIÓN'])
    indicators_i, indicators = encontrar_tabla(doc, ['TIPO DE INDICADOR', 'INDICADORES'])
    groups_i, groups = encontrar_tabla(doc, ['GRUPO DE INTERÉS', 'RECOMENDACIONES'])
    indicator_text = '\n'.join(c.text for r in indicators.rows[1:] for c in r.cells)
    if 'Número de protocolos, planes y programas implementados' not in indicator_text:
        raise ValueError('Cambió la tabla de indicadores; revisar las propuestas')

    def add(component, title, description, axes=(), risk_ids=(), responsible='Por definir', source=None, actor=None, estimated=False, metric=None):
        if len(title) > 90:
            raise ValueError('Título excede 90 caracteres: ' + title)
        proposed = ['titulo', 'plazo', 'estado', 'avance', 'indicador']
        if risk_ids:
            responsible = ' / '.join(unicos(area for rid in risk_ids for area in by_id[rid]['responsables']))
            months = min(cfg['plazo_propuesto']['por_criticidad'][levels[rid]] for rid in risk_ids)
        else:
            months = cfg['plazo_propuesto']['sin_riesgo']
        if responsible == 'Por definir':
            proposed.append('responsable')
        action = {'id': 'accion-%02d' % (len(acciones) + 1), 'componente': 'componente-' + str(component),
                  'titulo': title, 'descripcion': description, 'riesgos': list(risk_ids), 'ejes': list(axes),
                  'responsable': responsible, 'plazo': sumar_meses(cfg['fecha_base'], months), 'estado': 'pendiente', 'avance': 0,
                  'indicador': metric or 'Número de medidas de gestión implementadas para esta acción',
                  'origen': 'fuente', 'campos_propuestos': proposed, 'fuente': {'archivo': INF, **source}}
        if not risk_ids or estimated:
            action['vinculos_estimados'] = True
        if actor:
            action['actor_genera'] = actor
        acciones.append(action)

    # Una acción por política conserva todas sus propuestas complementarias.
    for row, record in enumerate(policies.rows[1:], 1):
        policy, desc = [texto(c.text) for c in record.cells]
        add(1, 'Complementar ' + policy[0].lower() + policy[1:], desc,
            axes=['etapa-ocde-1'] + (['etapa-ocde-6'] if row in (4, 5) else []),
            source={'tabla': policy_i, 'fila': row}, metric='Número de políticas y procedimientos actualizados en DDHH')

    # Los índices de párrafos son base cero (python-docx); comprobar límites evita arrastrar otra sección.
    def paragraphs(component, start, end, title, axes, responsible='Por definir', metric=None):
        text = '\n'.join(p.text.strip() for p in doc.paragraphs[start:end] if p.text.strip())
        add(component, title, text, axes, responsible=responsible,
            source={'parrafos': [start, end - 1]}, metric=metric)

    anchors = {762: COMPONENTES[0], 777: COMPONENTES[1], 814: COMPONENTES[2], 820: COMPONENTES[3],
               840: COMPONENTES[4], 846: COMPONENTES[5], 869: 'Articulación al sistema integrado de gestión de la organización'}
    for index, expected in anchors.items():
        if texto(doc.paragraphs[index].text) != expected:
            raise ValueError('Cambió la estructura de INF en párrafo ' + str(index))
    paragraphs(1, 770, 773, 'Identificación participativa de riesgos en proveedores y distribuidores', ['etapa-ocde-2'],
               metric='Número de proveedores y distribuidores evaluados en DDHH')
    paragraphs(1, 773, 777, 'Promoción, seguimiento y cultura de DDHH en la cadena de valor', ['etapa-ocde-1', 'etapa-ocde-4', 'etapa-ocde-5'],
               metric='Número de proveedores acompañados en gestión de DDHH')
    paragraphs(2, 779, 786, 'Constituir el subcomité de debida diligencia y derechos humanos', ['etapa-ocde-1'], 'Sostenibilidad',
               metric='Subcomité de DDHH constituido y en funcionamiento')
    paragraphs(2, 789, 798, 'Implementar las funciones del subcomité de DDHH', ['etapa-ocde-1', 'etapa-ocde-2', 'etapa-ocde-3', 'etapa-ocde-4', 'etapa-ocde-5', 'etapa-ocde-6'], 'Sostenibilidad')
    paragraphs(2, 800, 807, 'Coordinar la debida diligencia desde Sostenibilidad', ['etapa-ocde-1', 'etapa-ocde-4', 'etapa-ocde-5'], 'Sostenibilidad')
    paragraphs(2, 807, 809, 'Desarrollar formación y comunicación en DDHH desde Gestión Humana', ['etapa-ocde-1', 'etapa-ocde-5'], 'Gestión Humana',
               metric='Número de empleados, contratistas y proveedores capacitados en DDHH')
    paragraphs(2, 809, 811, 'Aprobar medidas de DDHH y articular la participación de otras áreas', ['etapa-ocde-1'], 'Gerencia general')

    if len(measures.rows) - 1 != len(TITULOS_MEDIDAS):
        raise ValueError('Cambió el número de filas de medidas; revisar títulos y correspondencias')
    unmatched = []
    for row, record in enumerate(measures.rows[1:], 1):
        name, actor, description = [texto(c.text) for c in record.cells]
        estimated = False
        rid = RIESGO_IDS.get(name)
        if rid is None and name == ACOSO_AGRUPADO:
            rid = ACOSO_ACTORES.get(actor)
            estimated = True
            ajustes.append({'fila': row, 'nombre': name, 'actor': actor, 'riesgo': rid, 'resolucion': 'Separación por actor de acoso interno y cadena de valor', 'origen': 'estimado'})
        if rid is None:
            unmatched.append({'fila': row, 'nombre': name, 'actor': actor})
            continue
        add(3, TITULOS_MEDIDAS[row - 1], description, risk_ids=[rid], actor=actor, estimated=estimated,
            source={'tabla': measures_i, 'fila': row})
    if unmatched:
        raise ValueError('Filas de medidas sin correspondencia; no se escribe ninguna salida:\n' + json.dumps(unmatched, ensure_ascii=False, indent=2))
    paragraphs(4, 823, 831, 'Implementar el procedimiento de reparación ante vulneraciones de DDHH', ['etapa-ocde-6'],
               metric='Número de medidas de reparación implementadas')
    paragraphs(4, 833, 838, 'Implementar un mecanismo operativo de reclamación en DDHH', ['etapa-ocde-6'],
               metric='Número de reclamos de DDHH recibidos y respondidos')
    paragraphs(4, 839, 840, 'Incorporar mecanismos no operativos de reclamación para la cadena de suministro', ['etapa-ocde-6'],
               metric='Número de reclamos de la cadena de suministro abordados')
    for row, record in enumerate(indicators.rows[1:], 1):
        kind, desc = [texto(c.text) for c in record.cells]
        add(5, 'Medir ' + kind[0].lower() + kind[1:], desc, axes=['etapa-ocde-4'], source={'tabla': indicators_i, 'fila': row},
            metric='Porcentaje de indicadores definidos con medición y seguimiento')
    for row, record in enumerate(groups.rows[1:], 1):
        group, desc = [texto(c.text) for c in record.cells]
        # Gestión Humana: mandato expreso para formación/comunicación a empleados y cadena.
        add(6, 'Comunicar compromisos de DDHH a ' + group.lower(), desc, axes=['etapa-ocde-5'],
            responsible='Gestión Humana' if row in (1, 2) else 'Por definir', source={'tabla': groups_i, 'fila': row},
            metric='Número de espacios de comunicación en DDHH con ' + group.lower())
    paragraphs(6, 863, 869, 'Incluir la debida diligencia en DDHH en el informe de sostenibilidad', ['etapa-ocde-5'], 'Sostenibilidad',
               metric='Capítulo de DDHH publicado en el informe de sostenibilidad')
    return cfg, acciones, ajustes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fuentes', type=Path)
    args = parser.parse_args()
    traducciones = json.loads((ROOT / 'privado/areas-responsables.json').read_text(encoding='utf-8'))
    mat = openpyxl.load_workbook(fuente(args.fuentes, MAT), data_only=True)
    bre = openpyxl.load_workbook(fuente(args.fuentes, BRE), data_only=True)
    doc = Document(fuente(args.fuentes, INF))
    cfg = config_criticidad(mat)
    riesgos = extraer_riesgos(mat, traducciones)
    estandares, evaluaciones = extraer_estandares(bre)
    plan_cfg, plan, ajustes = extraer_plan(doc, riesgos, cfg)
    umbrales = {'escala': {'minimo': 0, 'maximo': 5}, 'cortes': [
        {'menor_que': 3.0, 'nombre': 'naranja', 'color': '#9A3412'},
        {'menor_que': 4.0, 'nombre': 'amarillo', 'color': '#806000'},
        {'menor_que': None, 'nombre': 'verde', 'color': '#166534'}],
        'hipotesis': True, 'origen': 'propuesta', 'nota': 'Umbrales y colores por confirmar. Tonos oscuros legibles sobre fondo claro.'}
    outputs = {'public/config/criticidad-config.json': cfg, 'public/config/plan-config.json': plan_cfg,
               'public/config/umbrales-config.json': umbrales, 'public/data/riesgos.json': riesgos,
               'public/data/estandares.json': estandares, 'public/data/evaluaciones.json': evaluaciones, 'public/data/plan.json': plan}
    serialized = {path: json.dumps(value, ensure_ascii=False, indent=2) + '\n' for path, value in outputs.items()}
    # Barrera previa a cualquier escritura. No mostrar nombres en archivos ni diagnósticos públicos.
    private_names = [name for name in traducciones if ' ' in name and not name.startswith('_')]
    for path, content in serialized.items():
        if any(normalizar(name) in normalizar(content) for name in private_names):
            raise ValueError('Dato personal detectado en ' + path + '; no se escribe ninguna salida')
    for path, content in serialized.items():
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
    print('Extraídos: %d riesgos, %d evaluaciones por actor, %d ejes, %d evaluaciones de araña, %d acciones.' %
          (len(riesgos), sum(len(r['evaluaciones']) for r in riesgos), len(estandares['ejes']), len(evaluaciones), len(plan)))
    print('Correspondencias no literales resueltas (tabla y filas base cero):')
    print(json.dumps(ajustes, ensure_ascii=False, indent=2))
    print('Sin filas descartadas. Políticas: 5 filas; medidas: 37 filas más encabezado.')
    print('Revisar BRE DD!105: incorporado estimado no; BRE DDHH!80: calificación null conservada.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
        print('ERROR:', exc, file=sys.stderr)
        if isinstance(exc, subprocess.CalledProcessError):
            print(exc.stderr, file=sys.stderr)
        sys.exit(1)
