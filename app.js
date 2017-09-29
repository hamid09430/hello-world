var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var lessMiddleware = require('less-middleware');
var jwt = require('jsonwebtoken');
var moment = require('moment');
var mysql = require('mysql');

//const Sequelize = require('sequelize');
//const sequelize = new Sequelize('chat', 'root', '', {
//  host: 'localhost',
//  dialect: 'mysql',
//
//  pool: {
//    max: 5,
//    min: 0,
//    idle: 10000
//  },
//
//  // SQLite only
//  storage: 'path/to/database.sqlite'
//});
//
//sequelize
//  .authenticate()
//  .then(() => {
//    console.log('Connection has been established successfully.');
//  })
//  .catch(err => {
//    console.error('Unable to connect to the database:', err);
//  });
//
//const User = sequelize.define('user', {});
//
//User.findOne().then(user => {
//  console.log(user.get('name'));
//});
//

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "chat"
});

//con.connect(function (err) {
//    if (err)
//        throw err;
//    console.log("Connected!");
//    var sql = "SELECT * FROM contacts";
//    con.query(sql, function (err, result) {
//        if (err)
//            throw err;
//        console.log("Result: " + result[0].name);
//    });
//
//
//});




//var index = require('./routes/index');
//var users = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(lessMiddleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

//app.use('/', index);
//app.use('/users', users);

app.set('jwtTokenSecret', 'ueldOkGmguXx9MqkzM35P66NyDY5uB9H');

var http = require('http').Server(app);
var io = require('socket.io')(http);
var users = {};


http.listen(3000,'192.168.10.13', function () {
    console.log('listening on *:3000');
});

app.get('/listofconversations', function (req, res) {


    con.connect(function (err) {
        var user_id = 3;
        var sql = " SELECT * FROM (SELECT m.id,m.sender_id,m.is_seen,m.message_type,m.receiver_id,m.conv_id,m.message,DATE_FORMAT( m.created_at ,'%d %b %Y') as created_at, u.image, u.name,u.sinch_id,u.firebase_id,u.phone FROM messages m    \n\
                    LEFT JOIN users u ON     \n\
                    u.id = (CASE WHEN m.sender_id = " + user_id + "    \n\
                                   THEN m.receiver_id    \n\
                                   ELSE m.sender_id    \n\
                               END)    \n\
                    WHERE ( sender_id = " + user_id + " OR receiver_id = " + user_id + " )     \n\
                    ORDER BY m.id DESC    \n\
                    LIMIT 9999999999    \n\
                    ) AS orderedTable     \n\
                    GROUP BY orderedTable.conv_id    \n\
                    ORDER BY orderedTable.conv_id DESC";
        con.query(sql, function (err, result) {
            res.send(result);

        });
    });
});

app.get('/messageHistory', function (req, res) {

    con.connect(function (err) {
        var user_id = 3;
        var conv_id = 2;
        var sql = " SELECT *,DATE_FORMAT( created_at ,'%d %b %Y') as created_at FROM messages       \n\
                    WHERE ( sender_id = " + user_id + " OR receiver_id = " + user_id + " ) AND conv_id = " + conv_id + "        \n\
                    ORDER BY id ASC";
        con.query(sql, function (err, result) {
            res.send(result);
        });
    });
});


app.get('/users', function (req, res) {
    con.connect(function (err) {
        var sql = " SELECT id,name FROM users ";
        con.query(sql, function (err, result) {
            var html = "<ul>";
            result.forEach(function (user, index) {
                html += "<li><a href='chatting/" + user.id + "' >" + user.name + "</a></li>";
            });
            html += "</ul>";
            res.send(html);
        });
    });
});

app.get('/chatting', function (req, res) {

//    res.render('index',{name:'test'});
    res.sendFile(__dirname + '/views/index.html');
});

//--------------Middleware to authenticate the user---------
io.use((socket, next) => {
    var token = socket.handshake.query.token;
//    var token = req.cookies;

    if (token) {
        jwt.verify(token, app.get('jwtTokenSecret'), (err, decoded) => {
            if (err) {
                console.log('INVALID TOKEN : REJECTING SOCKET CONNECTION!');
                return next(new Error('Invalid token'));
            } else {
                socket.userData = decoded;
                console.log('CONNECTION ACCEPTED FOR: ', socket.userData.sub);
                next();
            }
        });
    } else {
        console.log('CONNECTION REJECTED: ', socket.id);
        return next(new Error('Token not provided'));
    }
});

app.get('/login', function (req, res) {

    var profile = {
        first_name: 'Michal Scofield',
        email: 'michal.scofield@gmail.com',
        id: 200
    };

    // we are sending the profile in the token
    var token = jwt.sign(profile, app.get('jwtTokenSecret'));

//    res.writeHead(200, {
//        'Set-Cookie': 'token='+token,
//        'Content-Type': 'text/plain'
//    });
//    res.end('LoggedIn\n');
    res.json({token: token});


});

io.on("connection", function (socket) {

    console.log("connected " + socket.userData.sub);

    if (typeof users[socket.userData.sub] !== 'undefined') {
        users[socket.userData.sub].push(socket.id);
    } else {
        users[socket.userData.sub] = [socket.id];
    }

    socket.on("sendMessage", function (msg, partner_id) {
        if (typeof users[partner_id] !== 'undefined') {
            users[partner_id].forEach(function (socketId) {
                socket.broadcast.to(socketId).emit("receiveMessage", socket.userData.sub, msg);
            });
        }
    });

    socket.on("disconnect", function () {
        users[socket.userData.sub].pop(socket.id);
        if (users[socket.userData.sub].length === 0) {
            delete users[socket.userData.sub];
        }
        console.log("Online Users:");
        console.log(users);
    });
    console.log("Online Users:");
    console.log(users);

});






// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
