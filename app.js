const http = require('http')
const axios = require("axios")
const express = require("express")
const crypto = require("crypto");
const cryptoRandomString = require("crypto-random-string");
const cookieParser = require('cookie-parser');
const mongoose = require("mongoose")
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
// const keygrip = require('keygrip')
const fs = require("fs");
const jwt = require("jsonwebtoken");
const ms = require("ms");
const pug = require("pug")
const bodyParser = require("body-parser")
const { oneOf, body, query, validationResult } = require("express-validator");

const Config = require("./config/config.json");

const AUTH_PUBLIC_KEY = fs.readFileSync(__dirname + '/config' + '/public.key');
const AUTH_HOST = Config.AuthHost;
const AUTH_HOST_IP = Config.AuthHostIP;
const AUTH_HOST_PORT = Config.AuthHostPort;

const CLIENT_ID = Config.ClientID;
const HOST = Config.Host;
const PORT = Config.Port;

const DB_HOST = Config.DBHost;
const DB_NAME = Config.DBName;

mongoose.connect(DB_HOST, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    dbName: DB_NAME
});

let db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log("Website: Connected to database...");
});

let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set("view engine", "pug")
app.set("views", __dirname + "/templates");

const MAX_AGE = Config.Cookie.MaxAge;
const MAX_PERSISTENSE_AGE = Config.Cookie.MaxPersistenseAge;

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(session({
    secret: Config.Cookie.Secret,
    cookie: {
        secure: false, //don't forget to set to true in https
        sameSite: true,
        maxAge: MAX_AGE,
    },
    resave: false,
    rolling: false,
    saveUninitialized: false,
    store: new MongoStore({ mongooseConnection: mongoose.connection })
}));

app.use(express.static('public'))

//------------------------------
// Request Handler
//------------------------------
function keepSessionPersistense(cookie) {
    cookie.expires = new Date(Date.now() + MAX_PERSISTENSE_AGE);
    cookie.maxAge = MAX_PERSISTENSE_AGE;
    cookie.rolling = true;
}

function destorySessionOnBrowserClose(cookie) {
    cookie.expires = false;
}

function revokeRefreshToken(session) {
    if (session.user_id == undefined || null)
    return;

    let params = {
        refresh_token: session.refresh_token,
        client_id: CLIENT_ID,
        user_id: session.user_id
    }

    const data = JSON.stringify(params);

    const options = {
        hostname: AUTH_HOST_IP,
        port: AUTH_HOST_PORT,
        path: '/token/revoke',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const myReq = http.request(options, revokeRes => { });

    myReq.write(data);
    myReq.end();
}

function getDataFromIDToken(token, session) {
    jwt.verify(token, AUTH_PUBLIC_KEY, (err, payload) => {
        if (err) {
            return false;
        }

        session.name = payload.name;
        session.email = payload.email;
        session.user_id = payload.sub;

        return true;
    });
}

function logout(session, callback) {
    revokeRefreshToken(session);
    session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        callback(err);
    });
}

app.get("/", (req, res) => {
    res.redirect("/home");
});

app.get("/home", (req, res) => {
    let info = {
        hasFailToLogin: req.session.hasFailToLogin,
        authorized: req.session.authenticated,
        user: {
            name: req.session.name
        }
    }
    res.render("index", info);
});

app.get("/lobby", (req, res) => {
    res.render("lobby");
});

app.post("/user/login", (req, res) => {
    let code_verifier = cryptoRandomString({length: Config.CodeVerifierLength});

    let code_challenge_method = Config.CodeChallengeMethod;
    let code_challenge = crypto.createHash(code_challenge_method).update(code_verifier).digest("hex").toString();

    let state = cryptoRandomString({length: Config.StateLength});
    let hashState = crypto.createHash(code_challenge_method).update(state).digest("hex").toString();

    let redirect_uri = HOST + "/oauth2callback";

    let url = AUTH_HOST + "/auth?response_type=code" +
              "&client_id=" + CLIENT_ID +
              "&code_challenge=" + code_challenge +
              "&code_challenge_method=" + code_challenge_method +
              "&state=" + hashState +
              "&redirect_uri=" + redirect_uri

    req.session.redirect_uri = redirect_uri;
    req.session.code_verifier = code_verifier;
    req.session.code_challenge = code_challenge;
    req.session.code_challenge_method = code_challenge_method;
    req.session.state = state;

    res.status(301).redirect(url);
});

app.post("/user/logout", (req, res) => {
    if (req.session) {
        logout(req.session, (err) => {
            if (err) {
                res.status(500).send();
            }
            else {
                res.redirect("/home");
            }
        });
    }
});

app.post("/signup", (req, res) => {
    let state = cryptoRandomString({length: Config.StateLength });
    let hashState = crypto.createHash(Config.CodeChallengeMethod).update(state).digest("hex").toString();
    let redirect_uri = HOST;

    let url = AUTH_HOST + "/signup?state=" + hashState +
              "&client_id=" + CLIENT_ID +
              "&state=" + hashState +
              "&redirect_uri=" + redirect_uri
    
    res.redirect(url);
});

app.get("/oauth2callback", [
    query("code").exists(),
    query("state").exists(),
    query("remember_me").optional().isBoolean()
],
(req, res, next) => {
    try {
        validationResult(req).throw();

        let localCodeChallengeMethod = req.session.code_challenge_method;
        let localState = req.session.state;
        let localStateHash = crypto.createHash(localCodeChallengeMethod).update(localState).digest("hex").toString();

        if (localStateHash !== req.query.state) {
            res.status(403).send();
            return;
        }

        if (req.query.remember_me) {
            req.session.attemptRememberMe = true;
        }
        else {
            req.session.attemptRememberMe = false;
        }

        next();
    }
    catch (error) {
        res.status(400).send();
    }
}, (req, res, next) => {
    // let url = (AUTH_HOST + "/token");
    let params = {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: req.query.code,
        code_verifier: req.session.code_verifier,
        response_type: "id_token"
    }

    const data = JSON.stringify(params);

    const options = {
        hostname: AUTH_HOST_IP,
        port: AUTH_HOST_PORT,
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const myReq = http.request(options, authRes => {

        if (authRes.statusCode != 200) {
            res.status(authRes.statusCode).send();
            return;
        }

        authRes.on('data', d => {
            let result = JSON.parse(d);

            if (result.auth) {
                try {
                    let success = getDataFromIDToken(result.id_token, req.session);
                    if (success == false) {
                        throw "Cannot get data from server..";
                    }
                }
                catch (err) {
                    console.log(err);

                    req.session.authenticated = false;
                    req.session.hasFailToLogin = true;

                    logout(req.session, (err) => {
                        if (err) {
                            res.status(500).send();
                        }
                        else {
                            res.redirect("/home");
                        }
                    });

                    return;
                }

                req.session.access_token = result.access_token;
                req.session.refresh_token = result.refresh_token;
                req.session.hasFailToLogin = false;
                req.session.authenticated = result.auth;

                if (req.session.attemptRememberMe) {
                    keepSessionPersistense(req.session.cookie);
                }
                else {
                    destorySessionOnBrowserClose(req.session.cookie);
                }

                res.redirect("/home");
            }
            else {
                req.session.hasFailToLogin = true;
                res.redirect("/home");
            }
        });
    });

    myReq.on('error', error => {
        console.error(error)
        res.status(401).send();
    })

    myReq.write(data);
    myReq.end();
});

//serve the page that check user verify stage here..
//check by client side?
//append this path to query on signup page of auth
app.get("/user/verify/confirm/callback", [
    query("id").exists()
    //get verify status account is a public api
],
(req, res) => {
    if (req.query.id) {
        //GET to check status from auth server...
        //then serve the page
        res.status(200).send();
    }
    else {
        res.redirect("/home");
    }
});

app.get("/user/me", (req, res) => {
    if (req.session.authenticated) {
        let url = "/user/" + req.session.user_id + "/profile";
        res.redirect(url);
    } else {
        res.redirect("/home");
    }
});

app.get("/user/:id/profile", (req, res) => {
    //fetch public user info from resource service
    //post operation involve change something in resource need a user access token (authenticated first)
    res.send('Profile of id : ' + req.params.id);
});

app.get("/leaderboard", (req, res) => {
    //fetch leaderboard from resource service
    res.send('TODO : leaderboard');
});

app.get("/download", (req, res) => {
    res.send('TODO : game binary download page with md5 checksum (server/client)');
});

app.get("/about", (req, res) => {
    res.send('TODO : about page');
});

app.listen(process.env.PORT || PORT, () => {
    console.log("Website server has started...");
});
