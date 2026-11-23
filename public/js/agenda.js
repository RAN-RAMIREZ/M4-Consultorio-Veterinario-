const API_BASE = '/api/consultorio';
const state = {
  page: 1,
  limit: 10,
  totalPages: 1,
  fecha: new Date().toISOString().split('T')[0],
  estado: '',
  usuario: null
};


const tbody = document.getElementById('agenda-tbody');
const alertBox = document.getElementById('alert-box');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const pageIndicator = document.getElementById('page-indicator');

document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
  document.getElementById('filtro-fecha').value = state.fecha;
  configurarEventos();
  cargarAgenda();
});

function verificarSesion() {
  const token = localStorage.getItem('token');
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

  
  if (!token || !usuario || !['funcionario', 'veterinario'].includes(usuario.perfil)) {
    window.location.href = 'index.html';
    return;
  }
  state.usuario = usuario;
  document.getElementById('user-info').textContent = `${usuario.rut} (${usuario.perfil})`;
}

function configurarEventos() {
  document.getElementById('btn-filtrar').addEventListener('click', () => {
    state.fecha = document.getElementById('filtro-fecha').value;
    state.estado = document.getElementById('filtro-estado').value;
    state.page = 1;
    cargarAgenda();
  });

  document.getElementById('limit-select').addEventListener('change', (e) => {
    state.limit = Number(e.target.value);
    state.page = 1;
    cargarAgenda();
  });

  btnPrev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      cargarAgenda();
    }
  });

  btnNext.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      cargarAgenda();
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });
}

async function cargarAgenda() {
  ocultarAlerta();
  const token = localStorage.getItem('token');

 
  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit
  });
  if (state.fecha) params.append('fecha', state.fecha);
  if (state.estado) params.append('estado', state.estado);

  try {
    const res = await fetch(`${API_BASE}/citas?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const payload = await res.json();

    if (!res.ok) {
      if (res.status === 401) window.location.href = 'index.html';
      mostrarAlerta(payload.error?.mensaje || 'Error al cargar la agenda.');
      return;
    }

    const citas = payload.data || payload.items || [];
    const pag = payload.pagination || { page: state.page, totalPages: 1, total: citas.length };

    renderizarTabla(citas);
    actualizarPaginacion(pag);
  } catch (err) {
    mostrarAlerta('Error de conexión con el servidor del consultorio.');
  }
}

function renderizarTabla(citas) {
  if (citas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay citas registradas para los filtros seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = citas.map(cita => {
    const horaFormateada = new Date(cita.fechaHora).toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <tr>
        <td><strong>${horaFormateada}</strong></td>
        <td><a href="historial.html?animalId=${encodeURIComponent(cita.animalId)}">${cita.animalId}</a></td>
        <td>${cita.tutorRut}</td>
        <td>${escaparHTML(cita.motivo || 'Consulta general')}</td>
        <td><span class="badge badge-${cita.estado}">${cita.estado.toUpperCase()}</span></td>
        <td class="actions-cell">${generarBotonesEstado(cita)}</td>
      </tr>
    `;
  }).join('');
}



function generarBotonesEstado(cita) {
  const rol = state.usuario.perfil;
  const acciones = [];

  if (cita.estado === 'agendada') {
    if (rol === 'funcionario') {
      acciones.push(`<button class="btn-sm btn-success" onclick="cambiarEstado('${cita._id || cita.citaId}', 'confirmada')">Confirmar</button>`);
    }
    acciones.push(`<button class="btn-sm btn-danger" onclick="cambiarEstado('${cita._id || cita.citaId}', 'cancelada')">Cancelar</button>`);
  }

  if (cita.estado === 'confirmada') {
    if (rol === 'veterinario') {
      acciones.push(`<a class="btn-sm btn-primary" href="historial.html?animalId=${encodeURIComponent(cita.animalId)}&citaId=${encodeURIComponent(cita._id || cita.citaId)}">Registrar Atención</a>`);
    }
    acciones.push(`<button class="btn-sm btn-warning" onclick="cambiarEstado('${cita._id || cita.citaId}', 'ausente')">Marcar Ausente</button>`);
    acciones.push(`<button class="btn-sm btn-danger" onclick="cambiarEstado('${cita._id || cita.citaId}', 'cancelada')">Cancelar</button>`);
  }

  if (['atendida', 'ausente', 'cancelada'].includes(cita.estado)) {
    return '<span class="text-muted">Estado final</span>';
  }

  return acciones.join(' ');
}


window.cambiarEstado = async function(citaId, nuevoEstado) {
  ocultarAlerta();
  const token = localStorage.getItem('token');

  try {
    const res = await fetch(`${API_BASE}/citas/${citaId}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ estado: nuevoEstado })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarAlerta(`[${data.error?.codigo || res.status}] ${data.error?.mensaje || 'Transición no permitida.'}`);
      return;
    }

    cargarAgenda();
  } catch (err) {
    mostrarAlerta('No se pudo actualizar el estado de la cita.');
  }
};

function actualizarPaginacion(pag) {
  state.totalPages = Math.max(1, pag.totalPages || Math.ceil((pag.total || 0) / state.limit));
  pageIndicator.textContent = `Página ${state.page} de ${state.totalPages} (Total: ${pag.total ?? 0})`;
  btnPrev.disabled = state.page <= 1;
  btnNext.disabled = state.page >= state.totalPages;
}

function mostrarAlerta(msg) {
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
}

function ocultarAlerta() {
  alertBox.classList.add('hidden');
}

function escaparHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}