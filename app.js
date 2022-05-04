const express = require('express')
const path = require("path");
require('dotenv').config()
var bodyParser = require('body-parser')
const moesif = require('moesif-nodejs');
const Stripe = require('stripe');
// npm i --save node-fetch@2.6.5
const fetch = require('node-fetch');

const app = express();
app.use(express.static(path.join(__dirname)));
const port = 5000;
const stripe = Stripe(process.env.STRIPE_KEY);
var jsonParser = bodyParser.json();

const moesifMiddleware = moesif({
  applicationId: process.env.MOESIF_APPLICATION_ID
});

app.use(moesifMiddleware);

app.post('/register', jsonParser,
  async (req, res) => {
    console.log(req.body);

    // create Stripe customer
    const customer = await stripe.customers.create({
      email: req.body.email,
      name: `${req.body.firstname} ${req.body.lastname}`,
      description: 'Customer created through /register endpoint',
    });

    // create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        { price: process.env.STRIPE_PRICE_KEY },
      ],
    });

    //create Kong consumer  
    var body = { username: req.body.email, custom_id: customer.id };
    console.log(body);
    var response = await fetch(`${process.env.KONG_URL}/consumers/`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: {'Content-Type': 'application/json'}
    });
    var data = await response.json();
    console.log("Kong create consumer");
    console.log(data);

    // create user and company in Moesif
    var company = { companyId: subscription.id };
    moesifMiddleware.updateCompany(company);
    console.log("Moesif create company");

    var user = { 
      userId: customer.id,
      companyId: subscription.id,
      metadata: {
        email: req.body.email,
        firstName: req.body.firstname,
        lastName: req.body.lastname,
      }
    };
    moesifMiddleware.updateUser(user);
    console.log("Moesif create user");

    // send back a new API key for use
    var response = await fetch(`${process.env.KONG_URL}/consumers/${req.body.email}/key-auth`, {
      method: 'post',
    });
    console.log(response);
    var data = await response.json();
    console.log("Kong create API key");
    console.log(data);
    var kongAPIKey = data.key;

    var user = { 
      userId: customer.id,
      metadata: {
        apikey: kongAPIKey,
      }
    };
    moesifMiddleware.updateUser(user);
    console.log("Moesif create user");

    res.status(200)
    res.send({ apikey: kongAPIKey });
  }
)

app.get("/", function (_req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
  res.sendFile(path.join(__dirname, "index.js"));
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})
