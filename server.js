const express = require('express')
const cors = require('cors')
const apicache = require('apicache');

const app = express()
const port = process.env.PORT || 2000

let cache = apicache.middleware;
app.use(cache('20 minutes'));
app.use(cors())


app.set('title', 'InElenco Unofficial API');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const jsdom = require("jsdom");

// @source https://github.com/jsdom/jsdom/issues/1245#issuecomment-584677454
function innerText(el) {
  el = el.cloneNode(true) // can skip if mutability isn't a concern
  el.querySelectorAll('script,style').forEach(s => s.remove())
  return el.textContent
}

const INELENCO_URL = "https://www.inelenco.com/";

app.get('/usage', (req, res) => {
	const html = `
		<style>
			html, body {
				padding: 0;
				margin: 0;
				font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell,
					Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
			}
			* {
				box-sizing: border-box;
			}
			
			main {
				padding: 2rem 5rem;
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
			}
			
			code {
				background: #fafafa;
				border-radius: 5px;
				padding: 0.75rem;
				font-family: Menlo, Monaco, Lucida Console, Courier New, monospace;
			}
			  
			.container {
				height: 100vh;
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
			}
		</style>
		<div class="container">
			<main>
				<h1>Benvenuto!</h1>
				<h2>Dove mi trovo?</h2>
				<p>
					Ho creato questa API per poter reperire in maniera programmatica i dati da 
					<a href="https://www.inelenco.com/">InElenco</a>, con una sintassi semplice e moderna basata su delle chiamate GET.
				</p>
				<h2>Come si usa?</h2>
				<p>
					Sei un programmatore e desideri integrare le funzionalità di <a href="https://www.inelenco.com/">InElenco</a> all'interno della tua applicazione?
					<pre>
						GET ${req.hostname}/search

						Parametri InElenco:
						{
							nome
							indirizzo
							cap
							telefono
							fax
							cellulare
							comune
							provincia
							tipo (privato/azienda)
							categoria (settore azienda vedi elenco settori)
						}

						Parametri Esclusivi:
						{
							civico_da
							civico_a
						}
					</pre>
				</p>
			</main>
			<div>
				<h6>Disclaimer</h6>
				<p style="font-size: 10px;">
					Non sono affiliato nè tantomeno in qualche modo collegato al proprietario di <a href="https://www.inelenco.com/">InElenco</a>.
					Questa API non è ufficiale e non si assicura il suo mantenimento nel tempo. Usare con cautela.
				</p>
			</div>
		</div>
	`
	res.send(html)
})

function generateNumberSequence (start, end, all_numbers = false) {
	let numbers = Array.from({ length: end }, (v, i) => i+1).splice(start - 1);
	if (!all_numbers) numbers = numbers.filter(num => num % 2 == (start % 2));

	return numbers;
}

// https://medium.com/@bojanmajed/standard-json-api-response-format-c6c1aabcaa6d
app.get('/search', async (req, res) => {
	const parameters = {
		"nome": req.query['nome'] || "",
		"indirizzo": req.query['indirizzo'] || "",
		"cap": req.query['cap'] || "",
		"telefono": req.query['telefono'] || "",
		"fax": req.query['fax'] || "",
		"cellulare": req.query['cellulare'] || "",
		"provincia": req.query['provincia'] || "",
		"tipo": req.query['tipo'] || "",
		"categoria": req.query['categoria'] || "",
	}

	const expect_big_query = (req.query['allow_big_query'] || "false") == "true" ? true : false;

	const numero_civico_da = req.query['civico_da'] || 0;
	const numero_civico_a = req.query['civico_a'] || 0;

	// Trasformo i parametri in pezzi della query che poi andrò ad unire in seguito
	let query_pieces = []
	for (const param in parameters){
		if (parameters[param].trim() != "") query_pieces.push(`${param}:"${parameters[param]}"`);
	}

	// Se sono stati specificati dei Numeri Civici limite da rispettare, aggiungili all'array delle query
	if (numero_civico_da != 0 && numero_civico_a != 0) {		
		query_pieces.push("indirizzo:(" + generateNumberSequence(numero_civico_da, numero_civico_a).map(num => `indirizzo:"*, ${num}"`).join(" OR ") + ")")
	}

	let url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(query_pieces.join(" AND "))}`
	console.log("Requesting url: " + url)

	// Scarica l'html della pagina e salvalo in una variabile
	let html = await fetch("https://cors-anywhere-luke.herokuapp.com/" + url, { headers: { "Origin": "localhost" }})
					.then(res => res.text());

	let formatted_data = [];

	// Inizializza l'oggetto JSDOM con l'html appena scaricato
	let dom = new jsdom.JSDOM(html);
	let content = dom.window.document.getElementById("content");
	let contentHead = dom.window.document.getElementById("contenthead");
	let rows = content.querySelectorAll("tbody > tr");


	let search_details = contentHead.textContent.match(/([0-9]*) - ([0-9]*) di ([0-9]*) risultati in \(([0-9\.]*) Secondi\)/)
	search_details = {
		"pagina_min": search_details[1],
		"pagina_max": search_details[2],
		"totale_risultati": search_details[3],
		"durata_ricerca": search_details[4],
	}


	// Se non ci sono dati disponibili restituisci un mesaggio appropriato
	let pages = Math.max(
		...Array.from(
			dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
		)
		.map(a => a.textContent)
	);

	
	if (Array.from(rows).map(row => innerText(row)).filter(row => row.replace(/\n/g, "").trim() != "").length == 0) {
		res.status(200).json({
			"success": true,
			"message": "Nessun dato trovato per i parametri cercati",
			"data": []
		});
		return;
	}

	// TODO: Permetti di fare grandi ricerche ma restituisci solo i primi 1000 risultati
	// Questo controllo serve per evitare una sorta di DDOS e per evitare che gli utenti per errore facciano 
	// 	una richiesta che possa bloccare il mio server e appesantire quello di InElenco
	if (search_details["totale_risultati"] > 1000 && !expect_big_query) {
		res.status(200).json({
			"success": false,
			"message": `Il numero di risultati per la query fornita supera i 1000 record (${search_details["totale_risultati"]} trovati) e il parametro 'allow_big_query' non è stato passato o non era impostato a 'true'. Fai una ricerca più mirata.`,
			"data": []
		});
		return;
	}

	
	for (let current_page=0; current_page<=pages*10; current_page+=10) {
		console.log(`Current Page: ${current_page} of ${pages} (${search_details["totale_risultati"]} results) [${search_details["durata_ricerca"]}s]`)

		// Scarica nuovamente i dati solo se non è la prima volta che esegui il loop
		if (current_page != 0){
			html = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}&da=${current_page}`, { headers: { "Origin": "localhost" }})
				.then(res => res.text());
			dom = new jsdom.JSDOM(html);
			pages = Math.max(
				...Array.from(
					dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
				)
				.map(a => a.textContent)
			);

			content = dom.window.document.getElementById("content");
			rows = content.querySelectorAll("tbody > tr");
			contentHead = dom.window.document.getElementById("contenthead");
			search_details = contentHead.textContent.match(/([0-9]*) - ([0-9]*) di ([0-9]*) risultati in \(([0-9\.]*) Secondi\)/)
			search_details = {
				"pagina_min": search_details[1],
				"pagina_max": search_details[2],
				"totale_risultati": search_details[3],
				"durata_ricerca": search_details[4],
			}
		}

	
		var data = Array.from(rows).map(el => innerText(el).replace(/\r?\n/g, " ").trim()).filter((element, index, array) => {
			return element.trim() != "" 
				|| (
					element.trim() == "" && (array[index-1] == "" || array[index+1] == "")
				)
		});
		
		// Creo un Array contenente Array(4) con i dati
		const temp_array = []; 
		let slice_start = null;
		for (let key in data) {
			let value = data[key];
			if (value.trim() != "" && slice_start == null) {
				slice_start = key;
			} else if (value.trim() == "" && slice_start != null) {
				temp_array.push(data.slice(slice_start, key-1));
				slice_start = null;
			}
		}
		
		formatted_data.push(temp_array.map(data_group => {
			return {
				"nominativo": data_group[0],
				"telefono": data_group[1].replace(/telefono\s*/i, ""),
				"indirizzo": data_group[2],
				"zona": data_group[3],
				// "original": data_group
			};
		}));

		// console.log("Fine")
	}

	console.log("Total results: " + formatted_data.flat().length)

	res.json({
		"success": true,
		"message": "Dati trovati",
		"data": formatted_data.flat()
	})
	// res.send(pages.map(el => el.element.parentElement.innerHTML).join(" "))
	// res.send(content.innerHTML)
})

app.get('*', function(req, res){
	res.redirect("/usage")
});
  
app.set('title', 'InElenco Unofficial API');

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
