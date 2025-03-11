const connection = require('../conexion');

// Obtener publicaciones del usuario actual
const getMisPublicaciones = (req, res) => {
    const usuario_id = req.session.userId;

    if (!usuario_id) {
        return res.status(401).json({ error: "Usuario no autenticado" });
    }

    const sql = `
        SELECT p.id AS publicacion_id, p.contenido, p.fecha_publicacion, p.num_like, p.num_guardado,
               u.nombre, u.foto_perfil,
               (SELECT COUNT(*) FROM like_publicacion lp WHERE lp.id_publicacion = p.id AND lp.id_usuario = ?) AS dio_like,
               (SELECT COUNT(*) FROM guardar_publicacion gp WHERE gp.id_publicacion = p.id AND gp.id_usuario = ?) AS loguardo
        FROM publicaciones p
        INNER JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.usuario_id = ? AND p.oculto = FALSE
        ORDER BY p.fecha_publicacion DESC;
    `;

    connection.query(sql, [usuario_id, usuario_id, usuario_id], (err, results) => {
        if (err) {
            console.error('Error al obtener publicaciones', err);
            return res.status(500).json({ error: "Error al obtener publicaciones" });
        }
        res.render('publicaciones', { username: req.session.username, userid: usuario_id, publicaciones: results, tipo: 'mis_publicaciones' });
    });
};

// Obtener publicaciones con comentarios
const getpublicaciones = (req, res) => {
    const username = req.session.username;
    const userid = req.session.userId;
    const tipo = req.query.tipo; // Recibe el parámetro tipo=guardados desde la URL

    let sql;
    let params = [userid, userid, username];

    if (tipo === "guardados") {
        sql = `
            SELECT u.id, u.nombre, u.foto_perfil, 
                   p.id AS publicacion_id, p.contenido, 
                   p.fecha_publicacion, p.num_like, p.num_guardado,
                   (SELECT COUNT(*) FROM like_publicacion lp 
                    WHERE lp.id_publicacion = p.id AND lp.id_usuario = ?) AS dio_like,
                   (SELECT COUNT(*) FROM guardar_publicacion gp 
                    WHERE gp.id_publicacion = p.id AND gp.id_usuario = ?) AS loguardo
            FROM publicaciones p
            INNER JOIN guardar_publicacion gp ON p.id = gp.id_publicacion
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE gp.id_usuario = ? AND p.oculto = FALSE
            ORDER BY p.fecha_publicacion DESC;
        `;
        params = [userid, userid, userid]; // Solo necesita filtrar por el usuario que guardó
    } else {
        // Consulta normal para obtener publicaciones de usuarios seguidos
        sql = `
            SELECT u.id, u.nombre, u.foto_perfil, 
                   p.id AS publicacion_id, p.contenido, 
                   p.fecha_publicacion, p.num_like, p.num_guardado,
                   (SELECT COUNT(*) FROM like_publicacion lp 
                    WHERE lp.id_publicacion = p.id AND lp.id_usuario = ?) AS dio_like,
                   (SELECT COUNT(*) FROM guardar_publicacion gp 
                    WHERE gp.id_publicacion = p.id AND gp.id_usuario = ?) AS loguardo
            FROM publicaciones p 
            INNER JOIN usuarios u ON p.usuario_id = u.id 
            INNER JOIN seguimiento s ON u.id = s.seguido_id 
            INNER JOIN usuarios u2 ON s.seguidor_id = u2.id 
            WHERE u2.username = ? AND p.oculto = FALSE
            ORDER BY p.fecha_publicacion DESC;
        `;
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Error al obtener publicaciones" });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "No se encontraron publicaciones" });
        }

        const publicacionesConComentarios = [];

        results.forEach((publicacion) => {
            const sqlComentarios = `
                SELECT c.id, c.contenido, 
                       DATE_FORMAT(c.fecha_comentario, '%Y-%m-%d %H:%i:%s') AS fecha_comentario, 
                       u.nombre 
                FROM comentarios c
                INNER JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.publicacion_id = ?
            `;

            connection.query(sqlComentarios, [publicacion.publicacion_id], (err, comentarios) => {
                if (err) {
                    console.error('Error al obtener comentarios', err);
                    return res.status(500).send('Error al obtener comentarios');
                }

                publicacion.comentarios = comentarios;
                publicacionesConComentarios.push(publicacion);

                if (publicacionesConComentarios.length === results.length) {
                    res.render('publicaciones', { username: req.session.username, userid, publicaciones: publicacionesConComentarios });
                }
            });
        });
    });
};


// Obtener comentarios de una publicación
const getComentarios = (req, res) => {
    const { publicacion_id } = req.params;


    const sql = `SELECT c.id, c.contenido, c.fecha_comentario, u.nombre
                 FROM comentarios c
                 INNER JOIN usuarios u ON c.usuario_id = u.id
                 WHERE c.publicacion_id = ?
                 ORDER BY c.fecha_comentario ASC`;


    connection.query(sql, [publicacion_id], (err, results) => {
        if (err) {
            console.error('Error al obtener comentarios', err);
            res.status(500).send('Error al obtener comentarios');
            return;
        }
        res.json(results); // Devolvemos los comentarios como JSON
    });
};


// Agregar un comentario a una publicación
const agregarComentario = (req, res) => {
    const { publicacion_id, contenido } = req.body;
    const usuario_id = req.session.userId; // Tomar el ID del usuario desde la sesión


    if (!usuario_id) {
        return res.json({ error: "Usuario no autenticado" });
    }


    if (!publicacion_id || !contenido) {
        return res.json({ error: "Faltan datos en la solicitud" });
    }


    // Insertar el comentario en la base de datos
    const sql = `INSERT INTO comentarios (publicacion_id, usuario_id, contenido) VALUES (?, ?, ?)`;
    connection.query(sql, [publicacion_id, usuario_id, contenido], (err, result) => {
        if (err) {
            console.error('Error al insertar comentario', err);
            return res.json({ error: "Error al insertar comentario" });
        }


        // Recuperar el comentario recién insertado para devolverlo al frontend
        const sqlComentarios = `
        SELECT c.id, c.contenido,
               DATE_FORMAT(c.fecha_comentario, '%Y-%m-%d %H:%i:%s') AS fecha_comentario,
               u.nombre
        FROM comentarios c
        INNER JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = ?`;


        connection.query(sqlComentarios, [result.insertId], (err, comentario) => {
            if (err) {
                console.error('Error al obtener el comentario insertado', err);
                return res.json({ error: "Error al obtener el comentario insertado" });
            }


            // Devolver el comentario insertado
            if (!comentario.length) {
                return res.json({ error: "No se pudo recuperar el comentario" });
            }
            res.json(comentario[0]);
            
        });
    });
};

// Crear publicaciones
const crearPublicacion = (req, res) => {
    const { contenido } = req.body;
    const usuario_id = req.session.userId;

    if (!usuario_id) {
        return res.status(401).json({ error: "Usuario no autenticado"});
    }

    const sql = `INSERT INTO publicaciones (usuario_id, contenido) VALUES (?, ?)`;
    connection.query(sql, [usuario_id, contenido], (err, result) => {
        if (err) {
            console.error('Error al crear publicación', err);
            return res.status(500).json({ error: "Error al crear publicación"});
        }
        res.status(201).json({ message: "Publicación creada correctamente" });
    });
};

// Eliminar publicaciones
const eliminarPublicacion = (req, res) => {
    const { id } = req.params;
    const usuario_id = req.session.userId;

    if (!usuario_id) {
        return res.status(401).json({ error: "Usuario no autenticado" });
    }

    // Verificar que la publicación pertenece al usuario autenticado
    const sqlVerificar = `SELECT * FROM publicaciones WHERE id = ? AND usuario_id = ?`;
    connection.query(sqlVerificar, [id, usuario_id], (err, results) => {
        if (err) {
            console.error('Error al verificar publicación', err);
            return res.status(500).json({ error: "Error al verificar publicación" });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Publicación no encontrada o no pertenece al usuario" });
        }

        // Ocultar la publicación
        const sqlOcultar = `UPDATE publicaciones SET oculto = TRUE WHERE id = ? AND usuario_id = ?`;
        connection.query(sqlOcultar, [id, usuario_id], (err, result) => {
            if (err) {
                console.error('Error al ocultar publicación', err);
                return res.status(500).json({ error: "Error al ocultar publicación" });
            }
            res.status(200).json({ message: "Publicación ocultada correctamente" });
        });
    });
};


module.exports = {
    getpublicaciones,
    getComentarios,
    agregarComentario,
    crearPublicacion,
    eliminarPublicacion,
    getMisPublicaciones
};