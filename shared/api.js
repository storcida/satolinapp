/* ============================================
   PEARS — api.js v3.0
   Helpers centralizados para Supabase.
   Requiere auth.js cargado primero.
   ============================================ */

const API = {

  /* ── Queries base ── */
  from(table) {
    return Auth.client().from(table);
  },

  /* ── Transactions (Hogar) ── */
  transactions: {
    list(mes) {
      return API.from('transactions')
        .select('*')
        .eq('month', mes)
        .order('fecha', { ascending: false });
    },
    insert(data) {
      const user = Auth.getUser();
      return API.from('transactions').insert({
        ...data,
        household_id: data.household_id,
        created_by:   user?.nombre ?? '',
        updated_by:   user?.nombre ?? '',
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      });
    },
    update(id, data) {
      const user = Auth.getUser();
      return API.from('transactions')
        .update({ ...data, updated_by: user?.nombre ?? '', updated_at: new Date().toISOString() })
        .eq('id', id);
    },
    delete(id) {
      return API.from('transactions').delete().eq('id', id);
    }
  },

  /* ── Listas (Compras) ── */
  listas: {
    list() {
      return API.from('listas')
        .select('*')
        .order('created_at', { ascending: false });
    },
    insert(titulo, createdBy) {
      return API.from('listas').insert({
        id:         crypto.randomUUID(),
        titulo,
        estado:     'activa',
        created_by: createdBy,
        created_at: new Date().toISOString()
      });
    },
    update(id, data) {
      return API.from('listas').update(data).eq('id', id);
    },
    delete(id) {
      return API.from('listas').delete().eq('id', id);
    }
  },

  /* ── Lista items ── */
  items: {
    list(listaId) {
      return API.from('lista_items')
        .select('*')
        .eq('lista_id', listaId)
        .order('created_at', { ascending: true });
    },
    insert(listaId, nombre, cantidad) {
      return API.from('lista_items').insert({
        id:        crypto.randomUUID(),
        lista_id:  listaId,
        nombre,
        cantidad:  cantidad ?? 1,
        tildado:   false,
        created_at: new Date().toISOString()
      });
    },
    update(id, data) {
      return API.from('lista_items').update(data).eq('id', id);
    },
    delete(id) {
      return API.from('lista_items').delete().eq('id', id);
    },
    deleteByLista(listaId) {
      return API.from('lista_items').delete().eq('lista_id', listaId);
    }
  },

  /* ── Viajes ── */
  viajes: {
    list() {
      return API.from('viajes')
        .select('*')
        .order('fecha_inicio', { ascending: true });
    },
    get(id) {
      return API.from('viajes').select('*').eq('id', id).single();
    }
  },

  /* ── Household ── */
  household: {
    get() {
      return API.from('households').select('*').single();
    },
    members() {
      return API.from('household_members')
        .select('*, app_users(nombre, email, avatar_url)')
        .order('joined_at');
    }
  },

  /* ── Utilidades ── */
  fmt: {
    /* Guaraníes */
    pyg(n) {
      return '₲ ' + new Intl.NumberFormat('es-PY').format(n ?? 0);
    },
    /* Dólares */
    usd(n) {
      return '$ ' + new Intl.NumberFormat('es-PY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n ?? 0);
    },
    /* Fecha corta */
    fecha(d) {
      return new Date(d).toLocaleDateString('es-PY', {
        day: '2-digit', month: 'short'
      });
    },
    /* Fecha larga */
    fechaLarga(d) {
      return new Date(d).toLocaleDateString('es-PY', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
    },
    /* Número con separador de miles */
    num(n) {
      return new Intl.NumberFormat('es-PY').format(n ?? 0);
    }
  },

  /* ── Flash messages ── */
  flash(msg, tipo = 'ok', duracion = 3000) {
    let wrap = document.getElementById('flash-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'flash-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `flash ${tipo}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), duracion);
  }
};