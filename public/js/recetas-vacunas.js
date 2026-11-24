
const API_CONSULTORIO = '/api/consultorio';
const API_M1_BASE = localStorage.getItem('M1_URL') || 'https://nucleo-tr.onrender.com/api/registro';
let solicitudMascota = 0;

const token = localStorage.getItem('token');
let usuario = null;

try {
    usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
} catch (error) {
    usuario = null;
}

const seccionVeterinario = document.getElementById('seccion-veterinario');
const seccionTutor = document.getElementById('seccion-tutor');
const formReceta = document.getElementById('form-receta');
const formVacuna = document.getElementById('form-vacuna');
const mensajeVeterinario = document.getElementById('mensaje-veterinario');
const mensajeTutor = document.getElementById('mensaje-tutor');
const mensajeAcceso = document.getElementById('mensaje-acceso');
const selectMascota = document.getElementById('select-mascota');
const listaAtenciones = document.getElementById('lista-atenciones');

if (!token || !usuario) {
    window.location.href = 'index.html';
} else if (usuario.perfil === 'veterinario') {
    seccionVeterinario.hidden = false;
    formReceta.addEventListener('submit', registrarReceta);
    formVacuna.addEventListener('submit', registrarVacuna);
} else if (['vecino', 'comunitario'].includes(usuario.perfil)) {
    seccionTutor.hidden = false;
    selectMascota.addEventListener('change', () => {
        cargarHistorialMascota(selectMascota.value);
    });
    cargarMascotasPropias();
} else {
    mensajeAcceso.textContent = 'Tu perfil no tiene permiso para consultar ni registrar recetas o vacunas.';
    mensajeAcceso.hidden = false;
}

async function leerRespuesta(respuesta) {
    let resultado;
    try {
        resultado = await respuesta.json();
    } catch (error) {
        throw new Error('El servidor devolvió una respuesta que no se pudo leer.');
    }

    if (!respuesta.ok) {
        const detalle = resultado && resultado.error;
        const mensaje = typeof detalle === 'string'
            ? detalle
            : detalle?.mensaje || resultado?.mensaje;
        throw new Error(mensaje || `Error HTTP ${respuesta.status}.`);
    }
    return resultado;
}

async function enviarRegistro(recurso, datos) {
    const respuesta = await fetch(`${API_CONSULTORIO}/${recurso}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(datos)
    });
    return leerRespuesta(respuesta);
}

function mostrarError(elemento, error, mensajePredeterminado) {
    elemento.textContent = error instanceof Error ? error.message : mensajePredeterminado;
}

async function registrarReceta(evento) {
    evento.preventDefault();
    mensajeVeterinario.textContent = '';

    const submit = formReceta.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const datos = {
        atencionId: document.getElementById('atencion-id-receta').value.trim(),
        medicamento: document.getElementById('medicamento').value.trim(),
        dosis: document.getElementById('dosis').value.trim(),
        frecuencia: document.getElementById('frecuencia').value.trim(),
        duracion: document.getElementById('duracion').value.trim()
    };

    if (Object.values(datos).some((valor) => !valor)) {
        mensajeVeterinario.textContent = 'Completa el ID de atención y todos los campos de la receta.';
        return;
    }

    submit.disabled = true;
    try {
        await enviarRegistro('recetas', datos);
        mensajeVeterinario.textContent = 'Receta registrada correctamente.';
        formReceta.reset();
    } catch (error) {
        mostrarError(mensajeVeterinario, error, 'No se pudo guardar la receta.');
    } finally {
        submit.disabled = false;
    }
}

function fechaEnUTC(valor) {
    if (!valor) return null;
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

async function registrarVacuna(evento) {
    evento.preventDefault();
    mensajeVeterinario.textContent = '';

    const submit = formVacuna.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const fechaAplicacion = fechaEnUTC(document.getElementById('fecha-aplicacion').value);
    const fechaProximaDosis = fechaEnUTC(document.getElementById('proxima-dosis').value);
    const datos = {
        atencionId: document.getElementById('atencion-id-vacuna').value.trim(),
        tipo: document.getElementById('tipo-vacuna').value.trim(),
        lote: document.getElementById('lote-vacuna').value.trim(),
        fechaAplicacion
    };

    if (!datos.atencionId || !datos.tipo || !datos.lote || !fechaAplicacion) {
        mensajeVeterinario.textContent = 'Completa el ID de atención, tipo, lote y fecha de aplicación válida.';
        return;
    }

    if (document.getElementById('proxima-dosis').value && !fechaProximaDosis) {
        mensajeVeterinario.textContent = 'Ingresa una fecha válida para la próxima dosis.';
        return;
    }

    if (fechaProximaDosis && fechaProximaDosis < fechaAplicacion) {
        mensajeVeterinario.textContent = 'La próxima dosis no puede ser anterior a la fecha de aplicación.';
        return;
    }

    if (fechaProximaDosis) datos.proximaDosis = fechaProximaDosis;

    submit.disabled = true;
    try {
        await enviarRegistro('vacunas', datos);
        mensajeVeterinario.textContent = 'Vacuna registrada correctamente.';
        formVacuna.reset();
    } catch (error) {
        mostrarError(mensajeVeterinario, error, 'No se pudo guardar la vacuna.');
    } finally {
        submit.disabled = false;
    }
}

async function cargarMascotasPropias() {
    mensajeTutor.textContent = 'Cargando tus mascotas...';
    try {
        const respuesta = await fetch(
            `${API_M1_BASE}/animales?tutorRut=${encodeURIComponent(usuario.rut)}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const resultado = await leerRespuesta(respuesta);
        const mascotas = Array.isArray(resultado)
            ? resultado
            : resultado.datos || resultado.data || resultado.animales || [];
        if (!Array.isArray(mascotas)) {
            throw new Error('La respuesta del Registro Municipal no contiene una lista de mascotas.');
        }

        selectMascota.replaceChildren();
        const opcionInicial = document.createElement('option');
        opcionInicial.value = '';
        opcionInicial.textContent = '-- Selecciona una mascota --';
        selectMascota.append(opcionInicial);

        const mascotasValidas = mascotas.filter((mascota) => {
            if (!mascota || !mascota.animalId) return false;
            const tieneDatosTutor = mascota.tutorRut || mascota.responsableRut || mascota.tutor?.rut;
            return !tieneDatosTutor ||
                mascota.tutorRut === usuario.rut ||
                mascota.responsableRut === usuario.rut ||
                mascota.tutor?.rut === usuario.rut;
        });
        mascotasValidas.forEach((mascota) => {
            const opcion = document.createElement('option');
            opcion.value = mascota.animalId;
            opcion.textContent = `${mascota.animalId} - ${mascota.nombre || 'Sin nombre'} (${mascota.especie || 'Especie no informada'})`;
            selectMascota.append(opcion);
        });

        mensajeTutor.textContent = mascotasValidas.length
            ? 'Selecciona una mascota para consultar sus atenciones.'
            : 'No se encontraron mascotas asociadas a tu RUT.';
    } catch (error) {
        mostrarError(mensajeTutor, error, 'No se pudieron cargar tus mascotas.');
        selectMascota.replaceChildren();
        const opcionError = document.createElement('option');
        opcionError.value = '';
        opcionError.textContent = 'No se pudieron cargar las mascotas';
        selectMascota.append(opcionError);
    }
}

async function cargarHistorialMascota(animalId) {
    const solicitudActual = ++solicitudMascota;
    listaAtenciones.replaceChildren();
    if (!animalId) {
        mensajeTutor.textContent = 'Selecciona una mascota para consultar sus registros.';
        return;
    }

    mensajeTutor.textContent = 'Cargando atenciones, recetas y vacunas...';
    try {
        const respuesta = await fetch(
            `${API_CONSULTORIO}/atenciones/animal/${encodeURIComponent(animalId)}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const resultado = await leerRespuesta(respuesta);
        if (solicitudActual !== solicitudMascota) return;
        const atenciones = resultado.atenciones || [];

        if (atenciones.length === 0) {
            mensajeTutor.textContent = 'Esta mascota aún no tiene atenciones clínicas registradas.';
            return;
        }

        await Promise.all(atenciones.map((atencion) =>
            cargarRegistrosAtencion(atencion, solicitudActual)
        ));
        if (solicitudActual === solicitudMascota) mensajeTutor.textContent = 'Consulta completada.';
    } catch (error) {
        if (solicitudActual === solicitudMascota) {
            mostrarError(mensajeTutor, error, 'No se pudo consultar el historial de esta mascota.');
        }
    }
}

async function cargarRegistrosAtencion(atencion, solicitudActual) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'card';
    const titulo = document.createElement('h3');
    titulo.textContent = `Atención del ${formatearFecha(atencion.createdAt)}`;
    tarjeta.append(titulo);
    listaAtenciones.append(tarjeta);

    try {
        const [resultadoRecetas, resultadoVacunas] = await Promise.all([
            consultarRecurso('recetas', atencion._id),
            consultarRecurso('vacunas', atencion._id)
        ]);
        if (solicitudActual !== solicitudMascota) return;
        agregarSeccionRegistros(tarjeta, 'Recetas e indicaciones médicas', resultadoRecetas.recetas || [], [
            ['Medicamento', 'medicamento'],
            ['Dosis', 'dosis'],
            ['Frecuencia', 'frecuencia'],
            ['Duración', 'duracion']
        ]);
        agregarSeccionRegistros(tarjeta, 'Historial de vacunas', resultadoVacunas.vacunas || [], [
            ['Tipo de vacuna', 'tipo'],
            ['Lote', 'lote'],
            ['Fecha de aplicación', 'fechaAplicacion', true],
            ['Próxima dosis', 'proximaDosis', true]
        ]);
    } catch (error) {
        if (solicitudActual !== solicitudMascota) return;
        const detalle = document.createElement('p');
        detalle.setAttribute('role', 'alert');
        detalle.textContent = error.message || 'No se pudieron cargar los registros de esta atención.';
        tarjeta.append(detalle);
    }
}

async function consultarRecurso(recurso, atencionId) {
    const respuesta = await fetch(
        `${API_CONSULTORIO}/${recurso}/${encodeURIComponent(atencionId)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return leerRespuesta(respuesta);
}

function agregarSeccionRegistros(contenedor, tituloTexto, registros, campos) {
    const seccion = document.createElement('section');
    const titulo = document.createElement('h4');
    titulo.textContent = tituloTexto;
    seccion.append(titulo);
    renderizarRegistros(seccion, registros, campos);
    contenedor.append(seccion);
}

function renderizarRegistros(contenedor, registros, campos) {
    if (registros.length === 0) {
        const vacio = document.createElement('p');
        vacio.textContent = 'No hay registros para esta atención clínica.';
        contenedor.append(vacio);
        return;
    }

    registros.forEach((registro) => {
        const articulo = document.createElement('article');
        campos.forEach(([etiqueta, propiedad, esFecha]) => {
            const linea = document.createElement('p');
            const nombre = document.createElement('strong');
            nombre.textContent = `${etiqueta}: `;
            const valor = registro[propiedad];
            linea.append(nombre, document.createTextNode(
                esFecha ? formatearFecha(valor) : (valor || 'No informado')
            ));
            articulo.append(linea);
        });
        contenedor.append(articulo);
    });
}

function formatearFecha(valor) {
    if (!valor) return 'No indicada';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return 'Fecha no válida';
    return fecha.toLocaleDateString('es-CL', { timeZone: 'UTC' });
}
