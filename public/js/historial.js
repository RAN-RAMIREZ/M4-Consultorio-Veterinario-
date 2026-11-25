const API_CONSULTORIO = '/api/consultorio';
const API_M1_BASE = localStorage.getItem('M1_URL') || 'https://nucleo-tr.onrender.com/api/registro';

let currentUser = null;
let currentAnimalId = null;

const alertBox = document.getElementById('alert-box');
const timelineContainer = document.getElementById('timeline-container');

document.addEventListener('DOMContentLoaded', async () => {
  if (!inicializarPerfil()) return;
  configurarEventos();

  const urlParams = new URLSearchParams(window.location.search);
  const paramAnimalId = urlParams.get('animalId');
  const paramCitaId = urlParams.get('citaId');

  if (currentUser.perfil === 'veterinario') {
    if (paramAnimalId) {
      document.getElementById('input-animal-id').value = paramAnimalId;
      await cargarHistorialCompleto(paramAnimalId);
      if (paramCitaId) {
        abrirFormularioAtencion(paramCitaId);
      }
    }
  } else {
    await cargarMascotasPropias();
  }
});

function inicializarPerfil() {
  const token = localStorage.getItem('token');
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

  if (!token || !usuario) {
    window.location.href = 'index.html';
    return false;
  }

  currentUser = usuario;
  document.getElementById('user-info').textContent = `${usuario.rut} (${usuario.perfil})`;

  const nav = document.getElementById('main-nav');
  if (usuario.perfil === 'veterinario') {
    nav.innerHTML = `
      <a href="agenda.html">Agenda Diaria</a>
      <a href="historial.html" class="active">Historial Clínico</a>
      <button id="btn-logout">Cerrar Sesión</button>
    `;
    document.getElementById('panel-busqueda-vet').classList.remove('hidden');
  } else if (['vecino', 'comunitario'].includes(usuario.perfil)) {
    nav.innerHTML = `
      <a href="historial.html" class="active">Historial de Mis Mascotas</a>
      <button id="btn-logout">Cerrar Sesión</button>
    `;
    document.getElementById('panel-mis-mascotas').classList.remove('hidden');
  } else {
    window.location.href = 'agenda.html';
    return false;
  }

  return true;
}

function configurarEventos() {
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });

 
  document.getElementById('btn-buscar-animal')?.addEventListener('click', () => {
    const id = document.getElementById('input-animal-id').value.trim();
    if (id) cargarHistorialCompleto(id);
  });

  document.getElementById('btn-nueva-atencion')?.addEventListener('click', () => {
    abrirFormularioAtencion('');
  });

  document.getElementById('btn-cancelar-atencion')?.addEventListener('click', () => {
    document.getElementById('form-atencion-container').classList.add('hidden');
  });

  document.getElementById('form-nueva-atencion')?.addEventListener('submit', guardarNuevaAtencion);

 
  document.getElementById('select-mis-mascotas')?.addEventListener('change', (e) => {
    const animalId = e.target.value;
    if (animalId) cargarHistorialCompleto(animalId);
  });
}


async function cargarMascotasPropias() {
  const token = localStorage.getItem('token');
  const select = document.getElementById('select-mis-mascotas');

  try {
    const res = await fetch(`${API_M1_BASE}/animales?tutorRut=${encodeURIComponent(currentUser.rut)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

   if (!res.ok) {
      mostrarAlerta('No se pudieron obtener tus mascotas desde el Registro Municipal.');
      return;
    }
    const data = await res.json();
    const animales = Array.isArray(data) ? data : (data.datos || data.data || data.animales || []);

    if (animales.length === 0) {
      select.innerHTML = '<option value="">No tienes mascotas registradas a tu RUT.</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Selecciona una mascota --</option>' +
      animales.map(a => `<option value="${a.animalId}">${a.animalId} - ${a.nombre || 'Sin nombre'} (${a.especie})</option>`).join('');


    select.value = animales[0].animalId;
    await cargarHistorialCompleto(animales[0].animalId);
  } catch (err) {
    mostrarAlerta('Error al consultar tus mascotas registradas.');
  }
}


async function cargarHistorialCompleto(animalId) {
  ocultarAlerta();
  const token = localStorage.getItem('token');
  currentAnimalId = animalId;

  try {
    const resM1 = await fetch(`${API_M1_BASE}/animales/${encodeURIComponent(animalId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!resM1.ok) {
      mostrarAlerta(`Animal ${animalId} no encontrado en el padrón municipal (HTTP ${resM1.status}).`);
      return;
    }

    const animal = await resM1.json();

    if (currentUser.perfil !== 'veterinario') {
      const esPropio = animal.tutorRut === currentUser.rut || animal.responsableRut === currentUser.rut;
      if (!esPropio) {
        mostrarAlerta('Acceso denegado (RN-05): Solo puedes consultar el historial de tus propias mascotas.');
        return;
      }
    }

    renderizarEncabezadoAnimal(animal);


    const resM4 = await fetch(`${API_CONSULTORIO}/historial/${encodeURIComponent(animalId)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
    });

    const payload = await resM4.json();

    if (!resM4.ok) {
      mostrarAlerta(`[${payload.error?.codigo || resM4.status}] ${payload.error?.mensaje || 'No autorizado para ver este historial.'}`);
      return;
    }

    const atenciones = payload.datos || [];
    renderizarTimeline(atenciones);
  } catch (err) {
    mostrarAlerta('Error de red al recuperar el historial clínico.');
  }
}

function renderizarEncabezadoAnimal(animal) {
  document.getElementById('ficha-animal-header').classList.remove('hidden');
  document.getElementById('animal-nombre-id').textContent = `${animal.nombre || 'Paciente'} (${animal.animalId})`;
  document.getElementById('animal-detalle').textContent =
    `Especie: ${animal.especie || 'N/A'} | Microchip: ${animal.microchip || 'Sin chip'} | Estado M1: ${animal.estado}`;

 
  const btnNueva = document.getElementById('btn-nueva-atencion');
  if (currentUser.perfil === 'veterinario' && animal.estado !== 'fallecido') {
    btnNueva.classList.remove('hidden');
  } else {
    btnNueva.classList.add('hidden');
  }
}


function renderizarTimeline(atenciones) {
  document.getElementById('timeline-section').classList.remove('hidden');

  if (atenciones.length === 0) {
    timelineContainer.innerHTML = '<p class="text-muted">Este paciente aún no registra atenciones clínicas en el consultorio.</p>';
    return;
  }

  const esVet = currentUser.perfil === 'veterinario';

  timelineContainer.innerHTML = atenciones.map(at => {
    const fecha = new Date(at.fechaHora).toLocaleString('es-CL');
    const notas = at.notasComplementarias || [];

    return `
      <article class="timeline-item card">
        <header class="timeline-header">
          <span class="fecha-badge">${fecha}</span>
          <span class="vet-badge">Atendido por Vet. RUT: ${at.veterinarioRut}</span>
          ${esVet ? `<span class="badge badge-sellada">FICHA SELLADA (RN-06)</span>` : ''}
        </header>

        <div class="timeline-body">
          <p><strong>Diagnóstico:</strong> ${escaparHTML(at.diagnostico)}</p>
          <p><strong>Motivo:</strong> ${escaparHTML(at.motivoConsulta)}</p>
          ${esVet ? `<p><strong>Examen físico:</strong> ${escaparHTML(at.examenFisico)}</p>` : ''}
          ${at.receta ? `<div class="receta-box"><strong>Prescripción Digital (RN-07):</strong> ${escaparHTML(at.receta)}</div>` : ''}
          ${at.vacuna ? `<p><strong>Vacuna Administrada:</strong> ${escaparHTML(at.vacuna)}</p>` : ''}
          ${at.obsEsterilizacion ? `<p class="tag-esterilizacion"><strong>Esterilización:</strong> ${escaparHTML(at.obsEsterilizacion)}</p>` : ''}
        </div>

        <!-- Notas Complementarias (Inmutabilidad RN-06) -->
        ${notas.length > 0 ? `
          <div class="notas-complementarias">
            <h4>Notas Complementarias (Anexos inmutables)</h4>
            <ul>
              ${notas.map(n => `
                <li>
                  <small>${new Date(n.fechaHora).toLocaleString('es-CL')} – Vet. ${n.veterinarioRut}:</small>
                  <p>${escaparHTML(n.texto)}</p>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Solo el veterinario puede anexar una NotaComplementaria a una atención sellada -->
        ${esVet ? `
          <div class="add-nota-box">
            <input type="text" id="nota-input-${at._id || at.atencionId}" placeholder="Agregar nota complementaria firmada (RN-06)..." />
            <button class="btn-sm btn-secondary" onclick="agregarNotaComplementaria('${at._id || at.atencionId}')">Anexar Nota</button>
          </div>
        ` : ''}
      </article>
    `;
  }).join('');
}

function abrirFormularioAtencion(citaId) {
  document.getElementById('atencion-cita-id').value = citaId;
  document.getElementById('form-atencion-container').classList.remove('hidden');
}

async function guardarNuevaAtencion(e) {
  e.preventDefault();
  ocultarAlerta();
  const token = localStorage.getItem('token');

  const body = {
    animalId: currentAnimalId,
    citaId: document.getElementById('atencion-cita-id').value || undefined,
    anamnesis: document.getElementById('anamnesis').value.trim(),
    diagnostico: document.getElementById('diagnostico').value.trim(),
    receta: document.getElementById('receta').value.trim() || null,
    vacuna: document.getElementById('vacuna').value.trim() || null,
    recomiendaEsterilizacion: document.getElementById('recomienda-esterilizacion').checked
  };

  try {
    const res = await fetch(`${API_CONSULTORIO}/atenciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarAlerta(`[${data.error?.codigo || res.status}] ${data.error?.mensaje || 'Error al sellar la atención.'}`);
      return;
    }

    document.getElementById('form-nueva-atencion').reset();
    document.getElementById('form-atencion-container').classList.add('hidden');
    await cargarHistorialCompleto(currentAnimalId);
  } catch (err) {
    mostrarAlerta('Error de conexión al registrar la atención clínica.');
  }
}


window.agregarNotaComplementaria = async function(atencionId) {
  ocultarAlerta();
  const input = document.getElementById(`nota-input-${atencionId}`);
  const texto = input.value.trim();
  if (!texto) return;

  const token = localStorage.getItem('token');

  try {
    const res = await fetch(`${API_CONSULTORIO}/atenciones/${atencionId}/notas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ texto })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarAlerta(`[${data.error?.codigo || res.status}] ${data.error?.mensaje || 'No se pudo anexar la nota.'}`);
      return;
    }

    await cargarHistorialCompleto(currentAnimalId);
  } catch (err) {
    mostrarAlerta('Error de red al guardar la nota complementaria.');
  }
};

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