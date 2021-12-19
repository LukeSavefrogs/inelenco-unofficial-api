const express = require('express')
const cors = require('cors')
const apicache = require('apicache');

const app = express()
const port = process.env.PORT || 2000

const search_route = require('./routes/search');
const help_route = require('./routes/help/help');


let cache = apicache.middleware;
app.use(cache('20 minutes'));
app.use(cors())



app.set('title', 'InElenco Unofficial API');

app.use('/usage', help_route);
app.use('/search', search_route);

app.get('*', function(req, res){
	res.redirect("/usage")
});


// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
