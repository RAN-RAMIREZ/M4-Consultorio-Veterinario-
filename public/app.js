const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', function(event) {
    event.preventDefault();

    const rut = document.getElementById('rut');
    const password = document.getElementById('password');

    const postData = {
        rut: rut.value,
        clave: password.value
    };

    fetch('https://nucleo-tr.onrender.com/api/nucleo/sesiones', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify({
                rut: data.rut,
                perfil: data.perfil,
                nombre: data.nombre
            }));

            if (['funcionario', 'veterinario'].includes(data.perfil)) {
                window.location.href = 'agenda.html';
            } else {
                window.location.href = 'historial.html';
            }
        } else {
            alert(data.error.mensaje);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
});