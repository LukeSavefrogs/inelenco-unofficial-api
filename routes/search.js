const INELENCO_URL = "https://www.inelenco.com/";

var express = require('express');
var router = express.Router();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const jsdom = require("jsdom");


// @source https://github.com/jsdom/jsdom/issues/1245#issuecomment-584677454
function innerText(el) {
  el = el.cloneNode(true) // can skip if mutability isn't a concern
  el.querySelectorAll('script,style').forEach(s => s.remove())
  return el.textContent
}

function generateNumberSequence (start, end, all_numbers = false) {
	let numbers = Array.from({ length: end }, (v, i) => i+1).splice(start - 1);
	if (!all_numbers) numbers = numbers.filter(num => num % 2 == (start % 2));

	return numbers;
}


/*  
	Pulisce e normalizza l'HTML del 'content', nello specifico rimuove tutti gli spazi superflui.
	Restituisce un array con la struttura: 
	[
		"Nome Cognome",
		"Telefono",
		"Indirizzo",
		"CAP Città Provincia",
		"",
		"",
		"",
	]
*/
function normalizeContentHTML (rows) {
	return Array.from(rows).map(el => innerText(el).replace(/\r?\n/g, " ").trim()).filter((element, index, array) => {
		return element.trim() != "" 
			|| (
				element.trim() == "" && (array[index-1] == "" || array[index+1] == "")
			)
	});
}


// Creo un Array contenente Array(4) con i dati
function parseHTML (data) {
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
	
	return temp_array.map(data_group => {
		return {
			"nominativo": data_group[0],
			"telefono": data_group[1].replace(/telefono\s*/i, ""),
			"indirizzo": data_group[2],
			"zona": data_group[3],
		};
	});
}



// https://medium.com/@bojanmajed/standard-json-api-response-format-c6c1aabcaa6d

// define the home page route
router.get('/', async (req, res) => {
	if (Object.keys(req.query).length == 0) {
		res.status(400).json({
			"success": false,
			"message": "Devi specificare almeno un parametro.",
			"results": 0,
			"data": [],
		});
		return;
	}

	const inelenco_parameters = {
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
	const custom_query = req.query['custom_query']?.trim() || "";

	const numero_civico = Number(req.query['civico'] || 0);
	let numero_civico_da = Number(req.query['civico_da'] || 0);
	let numero_civico_a = Number(req.query['civico_a'] || 0);

	/* ------------------------- Controlli di validità vari ------------------------- */
	// Controllo se sono i numeri civici sono degli interi
	if (
		!Number.isInteger(numero_civico) || 
		!Number.isInteger(numero_civico_da) || 
		!Number.isInteger(numero_civico_a) || 
		("civico" in req.query && numero_civico <= 0)
	) {
		res.status(400).json({
			"success": false,
			"message": "I parametri 'numero_civico', 'numero_civico_da' e 'numero_civico_a' devono essere degli interi > 0",
			"results": 0,
			"data": [],
		});
		return;
	}

	// Controllo se numero_civico_da e numero_civico_a siano numeri validi
	if (numero_civico_da + numero_civico_a != 0) {
		if (numero_civico_da <= 0 || numero_civico_a <= 0){
			res.status(400).json({
				"success": false,
				"message": "Hai specificato 'numero_civico_da' o 'numero_civico_a' quindi devono essere ENTRAMBI degli interi > 0",
				"results": 0,
				"data": [],
			});
			return;
		}
		if (numero_civico_da > numero_civico_a){
			res.status(400).json({
				"success": false,
				"message": "Il parametro 'numero_civico_da' deve essere sempre INFERIORE al parametro 'numero_civico_a'",
				"results": 0,
				"data": [],
			});
			return;
		}
	}

	// Passare il parametro `civico` equivale a passare `civico_a` e `civico_da` identici
	if (numero_civico != 0) {
		numero_civico_da = numero_civico;
		numero_civico_a = numero_civico;
	}
	
	let url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(custom_query)}`;
	if (custom_query == "") {
		// Trasformo i parametri in pezzi della query che poi andrò ad unire in seguito
		let query_pieces = []
		for (const param in inelenco_parameters){
			if (inelenco_parameters[param].trim() != "") query_pieces.push(`${param}:"${inelenco_parameters[param]}"`);
		}

		// Se sono stati specificati dei Numeri Civici limite da rispettare, aggiungili all'array delle query
		if (numero_civico_da != 0 && numero_civico_a != 0) {		
			query_pieces.push("indirizzo:(" + generateNumberSequence(numero_civico_da, numero_civico_a).map(num => `indirizzo:"*, ${num}"`).join(" OR ") + ")")
		}

		url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(query_pieces.join(" AND "))}`
	}

	console.log("Requesting url: " + url)

	// Scarica l'html della pagina e salvalo in una variabile
	let html = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}`, { headers: { "Origin": "localhost" }})
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

	console.log("Total results: " + search_details["totale_risultati"])

	// Se non ci sono dati disponibili restituisci un mesaggio appropriato
	let pages = 0
	if (dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)").length !== 0) {
		pages = Math.max(
			...Array.from(
				dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
			)
			.map(a => a.textContent)
		);
	}


	//! Se non sono stati trovati risultati
	let total_rows = Array.from(rows).map(row => innerText(row)).filter(row => row.replace(/\n/g, "").trim() != "").length;
	if (total_rows == 0 || search_details["totale_risultati"] == 0) {
		res.status(200).json({
			"success": true,
			"message": "Nessun dato trovato per i parametri cercati",
			"results": search_details["totale_risultati"],
			"data": [],
		});
		return;
	}
	
	//! Se sono stati trovati TROPPI risultati (> 1000)
	// TODO: Permetti di fare grandi ricerche ma restituisci solo i primi 1000 risultati
	// Questo controllo serve per evitare una sorta di DDOS e per evitare che gli utenti per errore facciano 
	// 	una richiesta che possa bloccare il mio server e appesantire quello di inElenco
	if (search_details["totale_risultati"] > 1000 && !expect_big_query) {
		res.status(200).json({
			"success": false,
			"message": `Il numero di risultati per la query fornita supera i 1000 record (${search_details["totale_risultati"]} trovati) e il parametro 'allow_big_query' non è stato passato o non era impostato a 'true'. Fai una ricerca più mirata.`,
			"results": search_details["totale_risultati"],
			"data": []
		});
		return;
	}


	let current_page = 0;
	do {
		console.log(`Current Page: ${current_page} of ${pages} (${search_details["totale_risultati"]} results) [${search_details["durata_ricerca"]}s]`)

		// Scarica nuovamente i dati solo se non è la prima volta che esegui il loop
		if (current_page != 0){
			html = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}&da=${current_page*10}`, { headers: { "Origin": "localhost" }})
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
	
		// Prima pulisce l'HTML e lo trasforma in un Array e poi parsa quell'array e lo trasforma in un JSON
		formatted_data.push(parseHTML(normalizeContentHTML(rows)));

		current_page++;
	} while (current_page <= pages);

	const flattened_data = formatted_data.flat()
	console.log("Returned results: " + flattened_data.length)

	res.json({
		"success": true,
		"message": "Dati trovati",
		"results": flattened_data.length,
		"data": flattened_data
	})
});


module.exports = router;