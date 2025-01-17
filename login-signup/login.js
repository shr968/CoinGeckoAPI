require('dotenv').config();
const mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cron = require('node-cron');
const encoder = bodyParser.urlencoded();
const app = express();
const CURRENCY = 'usd';
let lastPrice = null;

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

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shreyanayakb26@gmail.com', 
        pass: 'kmsi xckb wxdl cery'
    }
});

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/main.html");
});
app.get("/index",function(req,res){
    res.sendFile(__dirname+'/index.html');
})
app.post("/index", encoder, function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    connection.query("SELECT * FROM loginuser WHERE user_name = ?", [username], function (error, results) {
        if (error) {
            console.log(error);
            res.redirect("/?error=An%20error%20occurred");
            return;
        }
        if (results.length > 0) {
            bcrypt.compare(password, results[0].user_pass, function (err, isMatch) {
                if (err) throw err;
                if (isMatch) {
                    req.session.user = { username: username };
                    res.redirect("/welcome");
                } else {
                    res.redirect("/?error=Invalid%20credentials");
                }
            });
        } else {
            res.redirect("/?error=User%20not%20found");
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

app.get('/welcome', isAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/welcome.html');
});

app.get("/signup", function (req, res) {
    res.sendFile(__dirname + "/signup.html");
});

app.post('/signup', encoder, function (req, res) {
    const fullname = req.body.fullname;
    const username = req.body.username;
    const password = req.body.password;
    const confirmPassword = req.body.confirm_password;
    const code = req.body.sec_code;
    const cryptos = req.body.cryptos;
    const changePercent = parseFloat(req.body.change_percent);

    if (password === confirmPassword) {
        // Query to check if username, password, or sec_code already exists
        connection.query(
            "SELECT * FROM loginuser WHERE user_name = ? OR sec_code = ? OR user_pass = ?",
            [username, code, password],
            function (error, results) {
                if (error) {
                    console.error("Error checking existing records:", error.message);
                    return res.redirect("/signup?error=Internal%20server%20error");
                }

                // Check if username, sec_code, or password is already used
                if (results.length > 0) {
                    const duplicateFields = results.map(row => {
                        if (row.user_name === username) return "email";
                        if (row.sec_code === code) return "security code";
                        if (row.user_pass === password) return "password";
                    });
                    const message = `The ${duplicateFields.join(", ")} you entered is already in use.`;
                    return res.redirect(`/signup?error=${encodeURIComponent(message)}`);
                }

                // Hash the password if it is unique
                bcrypt.hash(password, 10, function (err, hashedPassword) {
                    if (err) {
                        console.error("Error hashing password:", err.message);
                        return res.redirect("/signup?error=Internal%20server%20error%20while%20hashing%20password");
                    }

                    // Insert user into the database
                    connection.query(
                        "INSERT INTO loginuser (user_name, user_pass, sec_code, cryptos, change_percent) VALUES (?, ?, ?, ?, ?)",
                        [username, hashedPassword, code, cryptos, changePercent],
                        function (error, results) {
                            if (error) {
                                console.error("Error inserting user into the database:", error.message);
                                return res.redirect("/signup?error=Error%20while%20signing%20up");
                            }
                            res.redirect("/index?success=Account%20created%20successfully");
                        }
                    );
                });
            }
        );
    } else {
        res.redirect("/signup?error=Passwords%20do%20not%20match");
    }
});


cron.schedule('0 0 */3 * *', async () => {
    console.log('Cron job executed at: ' + new Date().toLocaleString());

    connection.query("SELECT * FROM loginuser", async (error, users) => {
        if (error) return console.error(error);

        for (const user of users) {
            const cryptos = user.cryptos.split(',').map(crypto => crypto.trim().toUpperCase());
            const threshold = user.change_percent;
            const email = user.user_name;
            const fetchCryptoPrice = async () => {
                try {
                    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
                        params: {
                            ids: cryptos.join(','),
                            vs_currencies: CURRENCY,
                        },
                    });

                    const prices = {};
                    cryptos.forEach(crypto => {
                        if (response.data[crypto.toLowerCase()]) {
                            prices[crypto] = response.data[crypto.toLowerCase()][CURRENCY];
                        } else {
                            console.log(`Error: Price for ${crypto} not found.`);
                            prices[crypto] = null;
                        }
                    });
                    return prices;
                } catch (error) {
                    console.error('Error fetching crypto prices:', error.message);
                    return null;
                }
            };

            const currentPrices = await fetchCryptoPrice();

            if (currentPrices) {
                console.log('Current prices:', currentPrices);
                const sendEmail = async (crypto, price, changePercent) => {
                    const mailOptions = {
                        from: 'shreyanayakb26@gmail.com',
                        to: email,
                        subject: `Crypto Alert: ${crypto.toUpperCase()} Price Changed`,
                        text: `The price of ${crypto.toUpperCase()} has changed by ${changePercent.toFixed(2)}% and is now ${price} ${CURRENCY}.`,
                    };

                    try {
                        await transporter.sendMail(mailOptions);
                        console.log('Email sent successfully to:', email);
                    } catch (error) {
                        console.error('Error sending email:', error.message);
                    }
                };

                for (const crypto of cryptos) {
                    const currentPrice = currentPrices[crypto];
                    if (currentPrice !== null) {
                        console.log(`Current price of ${crypto}: ${currentPrice} ${CURRENCY}`);
                        connection.query("SELECT last_price FROM crypto_prices WHERE user_id = ?", [user.user_id], async (err, results) => {
                            if (err) {
                                console.error("Error fetching last price for user:", user.user_id);
                                return;
                            }

                            let lastPrice = results.length > 0 ? results[0].last_price : null;

                            if (lastPrice !== null) {
                                const changePercent = ((currentPrice - lastPrice) / lastPrice) * 100;
                                console.log(`Price change: ${changePercent.toFixed(2)}%`);

                                if (Math.abs(changePercent) >= threshold) {
                                    console.log('Threshold reached. Sending email...');
                                    await sendEmail(crypto, currentPrice, changePercent);
                                }
                            }
                            connection.query("INSERT INTO crypto_prices (user_id, crypto, last_price) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_price = ?", [user.user_id, crypto, currentPrice, currentPrice], (err) => {
                                if (err) console.error('Error updating last price in database:', err);
                            });
                        });
                    } else {
                        console.log(`Unable to fetch the current price for ${crypto}.`);
                    }
                }
            } else {
                console.log('Unable to fetch cryptocurrency prices.');
            }
        }
    });
});
app.listen(4500, function () {
    console.log('Server is running on port 4500');
});
