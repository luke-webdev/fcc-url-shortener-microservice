'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const dns = require('dns');
const util = require('util');
const mongo = require('mongodb');
const mongoose = require('mongoose');

const cors = require('cors');

const Schema = mongoose.Schema;

const app = express();

const lookup = util.promisify(dns.lookup);

// Basic Configuration 
const port = process.env.PORT || 3000;

/** this project needs a db !! **/
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .catch((err) => {
    console.error(err);
});

const shortUriSchema = new Schema({
  original_url: String,
  short_url: Number
});

const ShortURI = mongoose.model('ShortURI', shortUriSchema);

const requestLogger = (req, res, next) => {
  console.log(`${req.method} ${req.path} - ${req.ip}`);
  next();
}

app.use(requestLogger);
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

const formatUrl = (url) => {
  return url.replace(/(^\w+:|^)\/\//, '');
}

const isUrlValid = async (url) => {
  try {
    const formattedUrl = formatUrl(url);
    await lookup(formattedUrl);
    return true;
  } catch(err) {
    if(err.code === 'ENOTFOUND') {
      console.log(`Could not resolve url: ${url}`);
    } else {
      console.log('DNS Lookup error', err);
    }
    return false;
  }
}

/* 
  Reads the url property in the body and returns an object of the form:
  { original_url: <url>, short_url: <id> }

  The short url can be constructed like so:
  {appURL}/api/shorturl/<short_url>
*/
app.post('/api/shorturl/new', async (req, res) => {
  const url = req.body.url;

  const found = await ShortURI.findOne({ original_url: url  });

  if(!found) {
    const isValid = await isUrlValid(url);

    if(!isValid) {
      res.send({ error: "invalid URL" });
      return;
    }

    const shortUriCount = await ShortURI.countDocuments({});
    const data = { original_url: url, short_url: shortUriCount + 1 };
    const newUri = new ShortURI(data);
  
    newUri.save((err) => {
      if(err) console.error(err);
      res.json(data);
    });

  } else {
    const { original_url, short_url } = found;
    res.json({ original_url, short_url});
  }
});

// Redirects the user to the original url if the {short_url}
// parameter matches a record in the database
app.get('/api/shorturl/:short_url', async (req, res) => {
  const short_url = req.params.short_url;
  const found = await ShortURI.findOne({ short_url  });
  if(found) {
    res.redirect(found.original_url);
  } else {
    res.json({ error: 'Short url does not exist' });
  }
})


app.listen(port, () => {
  console.log('Node.js listening on port', port);
});