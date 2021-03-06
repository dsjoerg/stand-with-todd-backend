/* GLOBALS */
var APP_HOST = "http://stand-with-todd.herokuapp.com";
var REDIRECT_AFTER_SIGNED = "http://www.lettoddwork.org?signed=true";

/* DEPENDENCIES */
var express = require('express')
  , http = require('http')
  , path = require('path')
  , mongoose = require('mongoose')
  , findOrCreate = require('mongoose-findorcreate')
  , passport = require('passport')
  , FacebookStrategy = require('passport-facebook').Strategy
  , TwitterStrategy = require('passport-twitter').Strategy;

/* MONGOOSE + SIGNATURE MODEL */
mongoose.connect(process.env.MONGOHQ_URL || 'mongodb://localhost/stand-with-todd');

var signatureSchema = new mongoose.Schema({
  socialType: String,
  socialId: String,
  name: String,
  picture_url: { type: String, index: true },
  created: { type: Date, default: Date.now, index: true }
});

signatureSchema.plugin(findOrCreate);

var Signature = mongoose.model('Signature', signatureSchema);

var createSignature = function(socialType, socialId, userParams, cb){
  Signature.findOrCreate({socialType: socialType, socialId: socialId}, userParams, function(err, user) {
    if (err) return err;
    cb();
  });
}

/* BOILERPLATE EXPRESS SETUP */
var app = express();

app.set("trust proxy", true);

app.use(function(req,res,next){
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: process.env.EXPRESS_SESSION_SECRET }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

/* MAIN API ENDPOINT */
app.get('/', function(req, res){
  Signature.count(function(err, count){
    Signature.find({ picture_url: {'$ne': null } })
             .sort('-created')
             .skip(parseInt(req.query.skip || 0))
             .limit(parseInt(req.query.limit || 20))
             .exec(function(err, results){

      res.send({
        signers: results,
        count: count
      });

    });
  });
});

/* PASSPORT STRATEGIES */
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    callbackURL: APP_HOST + "/sign/facebook/callback",
    profileFields: ['id', 'displayName', 'photos']
  },
  function(accessToken, refreshToken, profile, done) {
    createSignature('fb', profile.id, {
      name: profile.displayName,
      picture_url: (profile.photos[0] && profile.photos[0].value.replace('_q.jpg', '_n.jpg'))
    }, done);
  }
));

passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: APP_HOST + "/sign/twitter/callback"
  },
  function(token, tokenSecret, profile, done) {
    createSignature('twitter', profile.id, {
      name: profile.displayName,
      picture_url: (profile.photos[0] && profile.photos[0].value.replace('_normal', ''))
    }, done);
  }
));

var passport_redirects = { successRedirect: REDIRECT_AFTER_SIGNED, failureRedirect: REDIRECT_AFTER_SIGNED };

app.get('/sign/facebook', passport.authenticate('facebook', { scope: 'email' }));
app.get('/sign/facebook/callback', passport.authenticate('facebook', passport_redirects));
app.get('/sign/twitter', passport.authenticate('twitter'));
app.get('/sign/twitter/callback', passport.authenticate('twitter', passport_redirects));

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
