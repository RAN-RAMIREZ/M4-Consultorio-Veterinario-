
const API = '/api/consultorio';

const alertBox = document.getElementById('alert-box');
const okBox = document.getElementById('ok-box');
const selectCita = document.getElementById('select-cita');
const panelRegistro = document.getElementById('panel-registro');
const panelFicha = document.getElementById('panel-ficha');

let citas = [];
let atencionActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!verificarSesion()) return;
  configurarEventos();

  const params = new URLSearchParams(window.location.search);
  if (params.get('atencionId')) {
    await cargarFicha(params.get('atencionId'));
  }
  await cargarCitasConfirmadas(params.get('citaId'));
});


function verificarSesion() {
  const token = localStorage.getItem('token');
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  if (!token || !usuario || usuario.perfil !== 'veterinario') {
    window.location.href = 'index.html';
    return false;
  }
  document.getElementById('user-info').textContent = `${usuario.nombre} (${usuario.perfil})`;
  return true;
}

function configurarEventos() {
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });
  document.getElementById('btn-recargar').addEventListener('click', () => cargarCitasConfirmadas());
  selectCita.addEventListener('change', () => {
    panelRegistro.classList.toggle('hidden', !selectCita.value);
  });
  document.getElementById('form-atencion').addEventListener('submit', registrarAtencion);
  document.getElementById('form-nota').addEventListener('submit', agregarNota);
}


async function llamarApi(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = 'index.html';
    throw new Error('Sesión vencida');
  }
  const datos = await res.json();
  return { ok: res.ok, status: res.status, datos };
}

async function cargarCitasConfirmadas(citaPreseleccionada) {
  ocultarMensajes();
  try {
    const { ok, datos } = await llamarApi('/citas?estado=confirmada');
    if (!ok) return mostrarError(datos);
    citas = datos.citas || datos.datos || [];
  } catch {
    return mostrarAlerta('No se pudo conectar con el servidor del consultorio.');
  }

  selectCita.replaceChildren();
  const vacia = new Option(citas.length ? 'Seleccione una cita...' : 'No hay citas confirmadas', '');
  selectCita.add(vacia);
  for (const cita of citas) {
    const fecha = new Date(cita.fechaHora).toLocaleString('es-CL');
    selectCita.add(new Option(`${fecha} · ${cita.animalId} · tutor ${cita.tutorRut} · ${cita.motivo}`, cita._id));
  }
  if (citaPreseleccionada && citas.some((c) => c._id === citaPreseleccionada)) {
    selectCita.value = citaPreseleccionada;
  }
  panelRegistro.classList.toggle('hidden', !selectCita.value);
}

async function registrarAtencion(evento) {
  evento.preventDefault();
  ocultarMensajes();
  const valor = (id) => document.getElementById(id).value.trim();

  const cuerpo = {
    citaId: selectCita.value,
    motivoConsulta: valor('motivoConsulta'),
    examenFisico: valor('examenFisico'),
    diagnostico: valor('diagnostico'),
    obsEsterilizacion: valor('obsEsterilizacion') || null
  };

  try {
    const { ok, datos } = await llamarApi('/atenciones', { method: 'POST', body: JSON.stringify(cuerpo) });
    if (!ok) return mostrarError(datos);
    evento.target.reset();
    panelRegistro.classList.add('hidden');
    mostrarOk('Atención registrada y ficha sellada. La cita pasó a estado atendida.');
    mostrarFicha(datos);
    await cargarCitasConfirmadas();
  } catch {
    mostrarAlerta('No se pudo registrar la atención.');
  }
}

async function cargarFicha(atencionId) {
  try {
    const { ok, datos } = await llamarApi(`/atenciones/${encodeURIComponent(atencionId)}`);
    if (!ok) return mostrarError(datos);
    mostrarFicha(datos);
  } catch {
    mostrarAlerta('No se pudo cargar la ficha.');
  }
}

function mostrarFicha(atencion) {
  atencionActual = atencion;
  const poner = (id, texto) => { document.getElementById(id).textContent = texto; };
  poner('f-id', atencion._id);
  poner('f-animal', atencion.animalId);
  poner('f-vet', atencion.veterinarioRut);
  poner('f-fecha', atencion.createdAt ? new Date(atencion.createdAt).toLocaleString('es-CL') : '—');
  poner('f-motivo', atencion.motivoConsulta);
  poner('f-examen', atencion.examenFisico);
  poner('f-diagnostico', atencion.diagnostico);
  poner('f-esterilizacion', atencion.obsEsterilizacion || 'Sin recomendación');
  document.getElementById('link-recetas').href = `recetas-vacunas.html?atencionId=${encodeURIComponent(atencion._id)}`;

  const lista = document.getElementById('lista-notas');
  lista.replaceChildren();
  const notas = atencion.notasComplementarias || [];
  if (notas.length === 0) {
    const li = document.createElement('li');
    li.className = 'text-muted';
    li.textContent = 'Sin notas complementarias.';
    lista.append(li);
  }
  for (const nota of notas) {
    const li = document.createElement('li');
    const meta = document.createElement('small');
    meta.textContent = `${new Date(nota.fecha).toLocaleString('es-CL')} – Vet. ${nota.veterinarioRut}: `;
    const texto = document.createElement('span');
    texto.textContent = nota.texto;
    li.append(meta, texto);
    lista.append(li);
  }

  panelFicha.classList.remove('hidden');
  history.replaceState(null, '', `box.html?atencionId=${encodeURIComponent(atencion._id)}`);
}

async function agregarNota(evento) {
  evento.preventDefault();
  ocultarMensajes();
  if (!atencionActual) return;
  const input = document.getElementById('texto-nota');

  try {
    const { ok, datos } = await llamarApi(`/atenciones/${atencionActual._id}/notas`, {
      method: 'POST',
      body: JSON.stringify({ texto: input.value.trim() })
    });
    if (!ok) return mostrarError(datos);
    input.value = '';
    mostrarOk('Nota complementaria agregada.');
    await cargarFicha(atencionActual._id);
  } catch {
    mostrarAlerta('No se pudo agregar la nota.');
  }
}

function mostrarError(datos) {
  mostrarAlerta(`[${datos.error?.codigo || 'ERROR'}] ${datos.error?.mensaje || 'Ocurrió un error.'}`);
}

function mostrarAlerta(mensaje) {
  alertBox.textContent = mensaje;
  alertBox.classList.remove('hidden');
}

function mostrarOk(mensaje) {
  okBox.textContent = mensaje;
  okBox.classList.remove('hidden');
}

function ocultarMensajes() {
  alertBox.classList.add('hidden');
  okBox.classList.add('hidden');
}
