require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const session = require("express-session");
const app = express();

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed");
    } else {
        console.log("Connected to MySQL!");
    }
});

app.use(cors({
    origin: "https://alfredkoome.github.io",
    credentials: true
}));

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    }
}));

// Admin authentication middleware
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin === true) {
        return next();
    }

    return res.status(401).json({
        message: "Unauthorized. Please login."
    });
}

const deleteAppointmentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});

// Home route 
app.get("/", (req, res) => {
    res.send("Hello from my backend!");
});

// About route 
app.get("/about", (req, res) => {
    res.send("This is my first backend!");
});

// Get all appointments
// ADMIN ONLY
app.get("/appointments", requireAdmin, (req, res) => {
    db.query("SELECT * FROM appointments", (err, rows) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error fetching appointments");
        }

        res.json(rows);
    });
});

// Get one appointment
// ADMIN ONLY
app.get("/appointments/:id", requireAdmin, (req, res) => {

    const id = req.params.id;

    db.query(
        "SELECT * FROM appointments WHERE id = ?",
        [id],
        (err, rows) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Error fetching appointment");
            }

            if (rows.length === 0) {
                return res.status(404).send("Appointment not found");
            }

            res.json(rows[0]);
        }
    );
});

// Create a new appointment
// PUBLIC - customers must be able to book
app.post("/appointments", (req, res) => {
    const {
        name,
        phone,
        email,
        service,
        appointment_date,
        appointment_time,
        notes
    } = req.body;

    // Check required fields 
    if (!name || !phone || !email || !service) {
        return res.status(400).send(
            "Name, phone, email and service are required."
        );
    }

    // SQL query 
    const sql = `
        INSERT INTO appointments 
        (name, phone, email, service, appointment_date, appointment_time, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?) 
    `;

    // Save appointment to MySQL 
    db.query(
        sql,
        [
            name,
            phone,
            email,
            service,
            appointment_date,
            appointment_time,
            notes
        ],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).send("Error saving appointment");
            }

            res.send(
                `Hello ${name}, your ${service} appointment on ${appointment_date} at ${appointment_time} has been received,thank you.`
            );
        }
    );
});

// Admin login
app.post("/admin/login", (req, res) => {

    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {

        req.session.regenerate((err) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Login failed");
            }

            req.session.admin = true;

            res.send("Login successful");
        });

    } else {
        res.status(401).send("Invalid username or password");
    }

});

// Check admin session
app.get("/admin/check-session", (req, res) => {

    if (req.session && req.session.admin === true) {
        return res.json({
            loggedIn: true
        });
    }

    res.status(401).json({
        loggedIn: false
    });

});

// Admin logout
app.post("/admin/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.log(err);
            return res.status(500).send("Logout failed");
        }

        res.clearCookie("connect.sid");

        res.send("Logged out successfully");
    });

});

// Update appointment status
// ADMIN ONLY
app.put("/appointments/:id/status", requireAdmin, (req, res) => {

    const id = req.params.id;
    const { status } = req.body;

    const sql = `
        UPDATE appointments 
        SET status = ? 
        WHERE id = ? 
    `;

    db.query(sql, [status, id], (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500).send("Error updating status");
        }

        if (result.affectedRows === 0) {
            return res.status(404).send("Appointment not found");
        }

        res.send("Status updated successfully");

    });

});

// Delete appointment
// ADMIN ONLY
app.delete(
    "/appointments/:id",
    requireAdmin,
    deleteAppointmentLimiter,
    (req, res) => {

        const id = req.params.id;

        db.query(
            "DELETE FROM appointments WHERE id = ?",
            [id],
            (err, result) => {

                if (err) {
                    console.log(err);
                    return res.status(500).send("Error deleting appointment");
                }

                if (result.affectedRows === 0) {
                    return res.status(404).send("Appointment not found");
                }

                res.send("Appointment deleted successfully");
            }
        );

    }
);

// Edit appointment
// ADMIN ONLY
app.put("/appointments/:id", requireAdmin, (req, res) => {

    const id = req.params.id;

    const {
        name,
        phone,
        email,
        service,
        appointment_date,
        appointment_time,
        notes,
        status
    } = req.body;

    const sql = `
        UPDATE appointments 
        SET
            name = ?,
            phone = ?,
            email = ?,
            service = ?,
            appointment_date = ?,
            appointment_time = ?,
            notes = ?,
            status = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [
            name,
            phone,
            email,
            service,
            appointment_date,
            appointment_time,
            notes,
            status,
            id
        ],
        (err, result) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Error updating appointment");
            }

            if (result.affectedRows === 0) {
                return res.status(404).send("Appointment not found");
            }

            res.send("Appointment updated successfully");
        }
    );

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`MY CURRENT SERVER IS RUNNING ON PORT ${PORT}`);
});
