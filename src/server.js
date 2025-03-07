const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
//importamos las rutas
const loginRoutes = require('./routes/login');
const imageRoutes = require('./routes/image');
const publicacionesRoutes = require('./routes/publicaciones');
const likeRoutes = require("./routes/like");
const guardadoRoutes = require("./routes/elementoguardado");
const connection = require('./conexion');


const terminosRoutes = require('./routes/terminos');
const acercaRoutes = require('./routes/acerca');
const contactoRoutes = require('./routes/contacto');


const app = express();
const port = 3000;


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'secret', // Cambia esta cadena secreta
    resave: false,
    saveUninitialized: true
}));


// Buscar usuarios
app.get('/buscar', (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.json([]); // Si no hay consulta, devuelve una lista vacía
    }

    const searchQuery = `
        SELECT id, nombre, apellido, username, foto_perfil 
        FROM usuarios 
        WHERE nombre LIKE ? OR apellido LIKE ? OR username LIKE ?
        LIMIT 5
    `;

    connection.query(searchQuery, [`%${query}%`, `%${query}%`, `%${query}%`], (error, results) => {
        if (error) {
            console.error("Error al buscar usuarios:", error);
            return res.status(500).json({ error: "Error en la búsqueda" });
        }

        const users = results.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            username: user.username,
            foto: user.foto_perfil ? `data:image/jpeg;base64,${user.foto_perfil.toString("base64")}` : "https://via.placeholder.com/40"
        }));

        res.json(users);
    });
});

app.get("/perfilajeno/:username", (req, res) => {
    const username = req.params.username;

    const queryUsuario = `SELECT * FROM usuarios WHERE username = ?`;
    const querySeguidos = `
        SELECT COUNT(*) as seguidos
        FROM seguimiento s
        INNER JOIN usuarios u ON s.seguidor_id = u.id
        WHERE u.username = ?`;

    const querySeguidores = `
        SELECT COUNT(*) as seguidores
        FROM seguimiento s
        INNER JOIN usuarios u ON s.seguido_id = u.id
        WHERE u.username = ?`;

    connection.query(queryUsuario, [username], (err, result) => {
        if (err) {
            console.error("Error al obtener perfil ajeno:", err);
            res.status(500).send("Error interno del servidor");
        } else if (result.length === 0) {
            res.status(404).send("Usuario no encontrado");
        } else {
            connection.query(querySeguidos, [username], (errSeguidos, resultSeguidos) => {
                if (errSeguidos) {
                    console.error("Error al obtener seguidos:", errSeguidos);
                    return res.status(500).send("Error interno del servidor");
                }

                connection.query(querySeguidores, [username], (errSeguidores, resultSeguidores) => {
                    if (errSeguidores) {
                        console.error("Error al obtener seguidores:", errSeguidores);
                        return res.status(500).send("Error interno del servidor");
                    }
                    res.render("perfilAjeno", { 
                        usuario: result[0], 
                        seguidos: resultSeguidos[0].seguidos, 
                        seguidores: resultSeguidores[0].seguidores,
                        username: req.session.username,
                        mensaje: null // 👈 Evita el error si no hay mensaje
                    });
                });
            });
        }
    });
});


// buscar usuarios
const busquedaRoutes = require("./routes/busqueda");
app.use("/", busquedaRoutes);




// Configuración para servir archivos estáticos
app.use(express.static(__dirname));


//plantillas
app.set('view engine', 'ejs');
app.set('views', './src/views');


// Routes
app.use('/', loginRoutes);
app.use('/', imageRoutes);
app.use('/', publicacionesRoutes);
app.use('/', likeRoutes);
app.use('/', guardadoRoutes);
app.use('/', terminosRoutes);
app.use('/', acercaRoutes);
app.use('/', contactoRoutes);


app.use((req, res, next) => {
    console.log("Sesión activa:", req.session);
    console.log("Usuario autenticado:", req.session.userId);
    next();
});


const comentariosRoutes = require('./routes/comentarios'); // Importa la ruta de comentarios
app.use("/", comentariosRoutes); // Activa la ruta de comentarios




// Nueva ruta para actualizar las redes sociales, la descripcion y la informacion personal
app.post('/actualizar-perfil', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.redirect('/perfil?mensaje=error');
    }


    //Recoger todos los campos del formulario
    const{
        nombre,
        apellido,
        fecha_nacimiento,
        telefono,
        descripcion,
        twitter,
        instagram,
        linkedin,
        github
    } = req.body;


    // Query para actualizar todos los campos
    const query = `
        UPDATE usuarios
        SET
            nombre = ?,
            apellido = ?,
            fecha_nacimiento = ?,
            telefono = ?,
            descripcion = ?,
            twitter = ?,
            instagram = ?,
            linkedin = ?,
            github = ?
        WHERE id = ?
    `;


    connection.query(
        query,
        [
            nombre,
            apellido,
            fecha_nacimiento,
            telefono,
            descripcion,
            twitter,
            instagram,
            linkedin,
            github,
            userId
        ],
        (error, results) => {
            if (error) {
                console.error('Error al actualizar el perfil:', error);
                return res.redirect('/perfil?mensaje=error');
            }
            res.redirect('/perfil?mensaje=exito');
        }
    );
});


app.get('/perfil', (req, res) => {
    const userId = req.session.userId;


    if (!userId) {
        return res.status(401).send('Usuario no autenticado');
    }


    // Consulta actualizada para obtener todos los campos necesarios
    const query = `
        SELECT
            nombre,
            apellido,
            fecha_nacimiento,
            telefono,
            descripcion,
            twitter,
            instagram,
            linkedin,
            github
        FROM usuarios
        WHERE id = ?
    `;


    connection.query(query, [userId], (error, results) => {
        if (error) {
            console.error('Error al obtener el perfil:', error);
            return res.status(500).send('Error al cargar el perfil');
        }


        const usuario = results[0] || {};


        // Asegurar formato de fecha válido
        if (usuario.fecha_nacimiento) {
            usuario.fecha_nacimiento = new Date(usuario.fecha_nacimiento)
                .toISOString()
                .split('T')[0];
        }


        const mensaje = req.query.mensaje;

       
        res.render('perfil', {
            usuario,
            seguidos: 0,
            seguidores: 0,
            mensaje
        });
    });
});


app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});

