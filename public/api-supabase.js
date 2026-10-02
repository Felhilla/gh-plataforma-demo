// Capa de datos de la plataforma sobre Supabase: tabla public.registros (coleccion, id, data jsonb).
// Solo las colecciones editables pasan por aquí (plan-acciones, evaluaciones). Si la base no responde,
// las lecturas caen a los datos semilla de public/data/ y GHDatos.estado pasa a 'respaldo' para que la
// interfaz muestre el aviso. Las escrituras nunca caen al respaldo: fallan con error visible.
(function(root){
  var CFG = root.GH_CONFIG || {};
  var REST = (CFG.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1/registros';
  var KEY = CFG.supabaseKey || '';
  var COLECCIONES = ['plan-acciones', 'evaluaciones'];
  var RESPALDO = { 'plan-acciones': 'data/plan.json', 'evaluaciones': 'data/evaluaciones.json' };
  var enc = encodeURIComponent;

  function headers(extra){
    var h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };
    for(var k in (extra || {})) h[k] = extra[k];
    return h;
  }
  async function revisar(res){
    if(!res.ok){ var t = await res.text().catch(function(){ return ''; }); throw new Error('supabase ' + res.status + ' ' + t); }
    return res;
  }
  function validarColeccion(col){
    if(COLECCIONES.indexOf(col) < 0) throw new Error('coleccion_invalida: ' + col);
  }
  function validarRegistro(id, data){
    if(typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('id_invalido: ' + id);
    if(!data || typeof data !== 'object' || Array.isArray(data) || data.id !== id) throw new Error('data_invalida: data.id debe ser igual a id');
  }
  async function leerRespaldo(col){
    var res = await root.fetch(RESPALDO[col], { cache: 'no-store' });
    if(!res.ok) throw new Error('respaldo ' + res.status + ' ' + RESPALDO[col]);
    var json = await res.json();
    return Array.isArray(json) ? json : (json.registros || []);
  }

  var GHDatos = {
    estado: 'sin_cargar', // 'base' | 'respaldo'
    error: null,
    colecciones: COLECCIONES.slice(),

    // Lista los registros de una colección. Si la base falla, devuelve los datos semilla.
    list: async function(col){
      validarColeccion(col);
      try{
        var res = await revisar(await root.fetch(REST + '?select=data&coleccion=eq.' + enc(col) + '&order=id', { headers: headers(), cache: 'no-store' }));
        var filas = await res.json();
        GHDatos.estado = 'base'; GHDatos.error = null;
        return filas.map(function(f){ return f.data; });
      }catch(e){
        GHDatos.estado = 'respaldo'; GHDatos.error = e.message;
        return leerRespaldo(col);
      }
    },

    get: async function(col, id){
      validarColeccion(col);
      var res = await revisar(await root.fetch(REST + '?select=data&coleccion=eq.' + enc(col) + '&id=eq.' + enc(id), { headers: headers(), cache: 'no-store' }));
      var filas = await res.json();
      return filas.length ? filas[0].data : null;
    },

    // Crea o reemplaza un solo registro. Nunca reescribe la colección completa.
    set: async function(col, id, data){
      validarColeccion(col); validarRegistro(id, data);
      await revisar(await root.fetch(REST + '?on_conflict=coleccion,id', {
        method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ coleccion: col, id: id, data: data, updated_at: new Date().toISOString() }) }));
      GHDatos.estado = 'base'; GHDatos.error = null;
      return data;
    }
  };

  root.GHDatos = GHDatos;
})(typeof window !== 'undefined' ? window : globalThis);
