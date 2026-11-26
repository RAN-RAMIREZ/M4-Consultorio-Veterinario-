M4 - Consultorio Veterinario

Descripción

Proyecto correspondiente al desarrollo del sistema de Consultorio Veterinario, implementado con Node.js, Express y MongoDB.

Requisitos previos

Para ejecutar el proyecto localmente se necesita:

Node.js versión 18 o superior.
npm.
Acceso a MongoDB Atlas.
Conexión a internet

Instalación

1. Clonar el repositorio
Ejecutar:
git clone https://github.com/RAN-RAMIREZ/M4-Consultorio-Veterinario-.git
En terminal dentro de una carpeta
2. Ingresar a la carpeta
cd M4-Consultorio-Veterinario-
3. Instalar las dependencias
npm install
4. Configurar las variables de entorno
Copiar el archivo .env.example como .env y completar la variable MONGO_URI con la cadena de conexión a MongoDB Atlas.
En PowerShell:
Copy-Item .env.example .env

Las variables PORT=3000 y NUCLEO_URL=https://nucleo-tr.onrender.com vienen predefinidas.

Importante: El archivo .env contiene información de configuración privada y no debe subirse al repositorio.

Recomendado: Crear un archivo .gitignore y poner dentro: 
node_modules/
.env

Importante: Si el .env ya está subido a GitHub, agregarlo al .gitignore no lo elimina del repositorio. Habría que retirarlo del seguimiento de Git por separado.

Ejecución del proyecto

Una vez instaladas las dependencias y configuradas las variables de entorno, iniciar el servidor con:
npm start

Si la ejecución es correcta, aparecerán mensajes indicando que MongoDB se conectó y que el servidor M4 está funcionando en el puerto 3000.

Acceso al prototipo

La aplicación estará disponible localmente en:
http://localhost:3000
Para comprobar que el servidor se encuentra funcionando, poner esto en navegador:
http://localhost:3000/api/consultorio/estado

Finalizar la ejecución

Para detener el servidor, presionar Ctrl + C en la terminal donde se está ejecutando.