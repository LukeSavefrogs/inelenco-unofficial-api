import express from 'express';

import cors from 'cors';
import apicache from 'apicache';
import correlator = require('express-correlation-id');

declare global {
	namespace Express {
		export interface Request {
			correlationId(): string;
		}
	}
}

const app = express()
const port = process.env.PORT || 2000

import search_route from './routes/search';
import help_route from './routes/help/help';


let cache = apicache.middleware;
app.use(cache('20 minutes'));
app.use(cors())

app.use(correlator());

app.set('title', 'inElenco Unofficial API');

app.use('/usage', help_route);
app.use('/search', search_route);

app.get('*', function(req: express.Request, res: express.Response) {
	res.redirect("/usage")
});


// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
