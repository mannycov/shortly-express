var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');
var morgan = require('morgan');
var colors = require('colors');
var session = require('express-session');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var checkUser = require('./lib/utility').checkUser;

var app = express();


app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
//logger
app.use(morgan('dev'));
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  secret: 'shhhh, very secret'
}));

app.get('/', checkUser, function(req, res) {
  res.render('index');
});
app.get('/create', checkUser, function(req, res) {
  res.render('index');
});

app.get('/links', checkUser, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(Links.models);
  });
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  new User({ username: req.body.username}).fetch().then(function(found) {
    if (found) {
      res.redirect('/login');
    } else {
      bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(req.body.password, salt, null, function(err, hash) {

          var newUser = {
            username: req.body.username,
            password: hash
          };
          new User(newUser).save()
            .then(function(user) {
              req.session.user = user;
              res.redirect('/');
            });
        });
      });
    }
  });
});

app.post('/login', function(req, res) {
  Users.query({where: {username: req.body.username}})
    .fetchOne()
    .then(function(user) {
      if (user) {
        bcrypt.compare(req.body.password, user.get('password'), function(err, match) {
          if (match) {
            req.session.user = user; //creating session
            res.redirect('/');
          } else {
            res.redirect('/login');
          }
        });
      } else {
        res.redirect('/login');
      }
    });
});

app.post('/logout', function(req, res) {
  if (req.session.user){
    req.session.destroy(function(){
    });
  }
  res.redirect('/login');
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
          .then(function(newLink) {
            res.status(200).send(newLink);
          });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
