const mysql = require('mysql');
require('dotenv').config();
const express = require('express');
const bodyParser = require("body-parser");
const session=require('express-session')
const bcrypt = require('bcryptjs');  
const encoder = bodyParser.urlencoded();
const app = express();
app.use("/assets", express.static("assets"));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
});

connection.connect(function (error) {
    if (error) throw error;
    else console.log('Connected to the database successfully!!');
});

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.post("/", encoder, function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    connection.query("SELECT * FROM loginuser WHERE user_name = ?", [username], function (error, results) {
        if (error) {
            console.log(error);
            res.redirect("/");
            return;
        }
        if (results.length > 0) {
            bcrypt.compare(password, results[0].user_pass, function (err, isMatch) {
                if (err) throw err;
                if (isMatch) {
                    req.session.user = { username: username };
                    res.redirect("/welcome"); 
                } else {
                    res.send("Invalid credentials.");
                }
            });
        } else {
            res.send("User not found.");
        }
    });
});
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    } else {
        res.redirect("/");
    }
}

app.get("/welcome", isAuthenticated, function (req, res) {
    res.sendFile(__dirname + "/welcome.html");
});

app.get("/signup", function (req, res) {
    res.sendFile(__dirname + "/signup.html");
});
app.post('/signup', encoder, function (req, res) {
    var fullname = req.body.fullname;
    var username = req.body.username;
    var password = req.body.password;
    var confirmPassword = req.body.confirm_password;
    var code = req.body.sec_code;
    if (password === confirmPassword) {
        connection.query("SELECT * FROM loginuser WHERE user_name = ?", [username], function (error, results, fields) {
            if (results.length > 0) {
                res.send("User already exists, please login.");
            } else {
                bcrypt.hash(password, 10, function (err, hashedPassword) {
                    if (err) throw err;
                    connection.query("INSERT INTO loginuser (user_name, user_pass, sec_code) VALUES (?, ?, ?)", [username, hashedPassword, code], function (error, results, fields) {
                        if (error) {
                            res.send("Error while signing up.");
                        } else {
                            res.redirect("/"); 
                        }
                    });
                });
            }
        });
    } else {
        res.send("Passwords do not match.");
    }
});
app.get('/forgot-password', (req, res) => {
    res.sendFile(__dirname + '/forgot-password.html');
});
app.post('/forgot-password', encoder, (req, res) => {
    const email = req.body.email;
    connection.query("SELECT * FROM loginuser WHERE user_name = ?", [email], function (error, results, fields) {
        if (error) {
            console.log(error);
            res.send("An error occurred.");
            return;
        }
        if (results.length > 0) {
            res.redirect('/sec-code?email=' + email); 
        } else {
            res.send("Email not found.");
        }
    });
});
app.get('/sec-code',(req, res) => {
    const email = req.query.email;
    res.sendFile(__dirname + '/security-code.html');
});
app.post('/sec-code', encoder, (req, res) => {
    const enteredCode = req.body.security;
const email = req.body.email;
connection.query('SELECT * FROM loginuser WHERE user_name = ?', [email], (err, results) => {
    if (err) {
        console.error(err);
        return res.send("An error occurred.");
    }

    if (results.length > 0) {
        const storedCode = results[0].sec_code;

        if (enteredCode === storedCode) {
            res.redirect('/reset-password?email=' + email);
        } else {
            res.redirect('/forgot-password');
        }
    } else {
        res.send("Email not found.");
    }
});
});
app.get('/reset-password', (req, res) => {
    const email = req.query.email;
    res.sendFile(__dirname + '/reset-password.html');
});
app.post('/reset-password', encoder, (req, res) => {
    const newPassword = req.body.password;
    const email = req.body.email;

    bcrypt.hash(newPassword, 10, function (err, hashedPassword) {
        if (err) throw err;
        connection.query("UPDATE loginuser SET user_pass = ? WHERE user_name = ?", [hashedPassword, email], function (error, results) {
            if (error) {
                res.send("Error while resetting password.");
            } else {
                res.send("Password reset successfully.");
            }
        });
    });
});
app.get("/logout", function (req, res) {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            res.send("Error logging out.");
        } else {
            res.redirect("/"); 
        }
    });
});

app.listen(4500, function () {
    console.log('Server is running on port 4500');
});
