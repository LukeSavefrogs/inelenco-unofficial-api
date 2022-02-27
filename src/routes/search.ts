const INELENCO_URL = "https://www.inelenco.com/";

import express from 'express';
var router = express.Router();

/**
 * Non posso utilizzare la sintassi CJS perchè è stata deprecata con la versione node-fetch@3.0.0.
 * Non posso nemmeno usare la sintassi ESM perchè il progetto è scritto in CJS.
 * 
 * @see https://stackoverflow.com/a/70192405/8965861
 * @see https://github.com/node-fetch/node-fetch/issues/1279
 * 
 * * Funziona senza TypeScript
 * const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args);
 * 
 * * Funziona CON TypeScript, ma viene rotto in fase di compilazione TS -> JS:
 * const fetch = <T extends any[]> (...args: T) => fetchP.then((fn: any) => fn(...args));
 *  
 * * Non funziona perchè il progetto è scritto in CJS:
 * import fetch from 'node-fetch';
 */
const importDynamic = new Function('modulePath', 'return import(modulePath)');
const fetch = async (...args:any[]) => {
	const module = await importDynamic('node-fetch');
	return module.default(...args);
};


/* 
	Libreria che implementa le funzioni di analisi della DOM (document.querySelectorAll, ecc...)
*/
import jsdom from 'jsdom';

// TODO: Create an interface for the GET Parameters
interface Map {
	[key: string]: string;
}

/**
 * Object representing one result from InElenco.
 */
type APIResponse = {
	nominativo: string,
	indirizzo: string,
	telefono: string,
	zona: string
}


/**
 * Polyfill per il metodo nativo dei Browser `Element.innerText()`
 * @param element Elemento da cui estrarre il testo
 * @see https://github.com/jsdom/jsdom/issues/1245#issuecomment-584677454
 */
function innerText(element: Element): string {
	if (!element) return "";
	let el = element.cloneNode(true) as Element; // can skip if mutability isn't a concern
	el.querySelectorAll('script,style').forEach(s => s.remove());
	return el.textContent || "";
}


/**
 * Generates an array of numbers from `start` to `end`.
 * 
 * @param start Start of the sequence
 * @param end End of sequence
 * @param all_numbers Wether to include all numbers or not
 * @returns Array with all the numbers
 */
function generateNumberSequence (start: number, end: number, all_numbers: boolean = false) {
	let numbers = Array.from({ length: end }, (v, i) => i+1).splice(start - 1);
	if (!all_numbers) numbers = numbers.filter(num => num % 2 == (start % 2));
	return numbers;
}


/**
 * 
 * @param rows Righe della tabella con cui è formato il layout della pagina
 * @returns Oggetto con le informazioni sui nominativi
 */
function extractData (rows: NodeListOf<Element>): APIResponse[] {
	if (rows.length == 0) return [];

	const rows_array = Array.from(rows); 
	const result: string[][] = [];

	let temp_array = [];
	for (let row of rows_array) {
		if (!row) continue;

		// Se ho incontrato un nominativo, reinizializzo l'array
		if (row.classList.contains("cerca")) {
			if (temp_array.length > 0) result.push(temp_array);
			temp_array = [];
		}
		
		temp_array.push(innerText(row).replace(/\r?\n/g, " ").trim())
	}
	if (temp_array.length > 0) result.push(temp_array);

	// First execute `map` on the array, then it `flat`tens the result
	return result.flatMap(data_group => {
		return {
			"nominativo": data_group[0],
			"telefono": data_group[1].replace(/telefono\s*/i, ""),
			"indirizzo": data_group[2],
			"zona": data_group[3],
			// "altro": data_group[4]
		};
	});
}


function get_current_search_details (contentHead: HTMLElement) {
	if (!contentHead) throw new Error("Content head not found");
	
	const search_details = contentHead?.textContent?.match(/([0-9]*) - ([0-9]*) di ([0-9]*) risultati in \(([0-9\.]*) Secondi\)/)
	
	if (!search_details) throw new Error("Couldn't find Search Details");

	return {
		"pagina_min": Number(search_details[1]),
		"pagina_max": Number(search_details[2]),
		"totale_risultati": Number(search_details[3]),
		"durata_ricerca": search_details[4],
	}
}

// https://medium.com/@bojanmajed/standard-json-api-response-format-c6c1aabcaa6d

// define the home page route
router.get('/', async (req, res) => {
	// Se non ho passato nessun parametro, restituisco un errore
	if (Object.keys(req.query).length == 0) {
		res.status(400).json({
			"success": false,
			"message": "Devi specificare almeno un parametro.",
			"results": 0,
			"data": [],
		});
		return;
	}

	// Inizializzo l'oggetto contenente i parametri proprietari di inElenco
	const inelenco_parameters: Map = {
		"nome": (req.query['nome']?.toString()) || "",
		"indirizzo": (req.query['indirizzo']?.toString()) || "",
		"cap": (req.query['cap']?.toString()) || "",
		"telefono": (req.query['telefono']?.toString()) || "",
		"fax": (req.query['fax']?.toString()) || "",
		"cellulare": (req.query['cellulare']?.toString()) || "",
		"provincia": (req.query['provincia']?.toString()) || "",
		"comune": (req.query['comune']?.toString()) || "",
		"tipo": (req.query['tipo']?.toString()) || "",
		"categoria": (req.query['categoria']?.toString()) || "",
	}

	const expect_big_query = (req.query['allow_big_query'] || "false") == "true" ? true : false;
	const EXACT_MATCH = (req.query['tipo_corrispondenza_indirizzo'] || "esatta") == "esatta" ? true : false;
	const custom_query = (req.query['custom_query']?.toString() || "").trim();

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
		let query_pieces = []
		if (!EXACT_MATCH) {
			query_pieces.push(
				inelenco_parameters["indirizzo"]
					.toString()
					.replace(/\s+/, " ")
					.split(" ")
					.map(item => `indirizzo:${item}`)
					.join(" AND ")
			);

			// Lo abbiamo già pushato nell'array delle parti della query da costruire, quindi 
			// lo tolgo dai parametri di inelenco
			inelenco_parameters["indirizzo"] = "";	
		}
		
		// Trasformo i parametri in pezzi della query che poi andrò ad unire in seguito
		for (const param in inelenco_parameters){
			if (inelenco_parameters[param].trim() != "") {
				query_pieces.push(`${param}:"${inelenco_parameters[param]}"`);
			}
		}

		// Se sono stati specificati dei Numeri Civici limite da rispettare, aggiungili all'array delle query
		if (numero_civico_da != 0 && numero_civico_a != 0) {		
			query_pieces.push("indirizzo:(" + generateNumberSequence(numero_civico_da, numero_civico_a).map(num => `indirizzo:"*, ${num}"`).join(" OR ") + ")")
		}

		url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(query_pieces.join(" AND "))}`
	}

	console.log("Requesting url: " + url)

	// Scarica l'html della pagina e salvalo in una variabile
	let html = "";
	let current_page = 0;

	try{
		html = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}`, { headers: { "Origin": "localhost" }})
			.then(res => res.text());
	} catch (e) {
		console.error(`Errore nella richiesta verso la pagina '${url}&da=${current_page*10}': %o`, e)
		res.status(500).json({
			"success": false,
			"message": `Errore nella richiesta verso la pagina '${url}&da=${current_page*10}': ${e}`,
			"results": 0,
			"data": []
		});
		return;
	}
	let formatted_data: Array<APIResponse>  = [];

	// Inizializza l'oggetto JSDOM con l'html appena scaricato
	let dom = new jsdom.JSDOM(html);
	let content = dom.window.document.getElementById("content");

	if (!content) {
		res.status(500).json({
			"success": false,
			"message": "Errore nella richiesta verso la pagina '" + url + "': la pagina non ha restituito un contenuto valido",
			"results": 0,
			"data": []
		});
		return;
	}

	let contentHead = dom.window.document.getElementById("contenthead");
	let rows = content.querySelectorAll("#content tbody > tr .cerca, .dativ, .dati");

	let search_details = get_current_search_details(contentHead as HTMLElement);

	let totale_risultati = search_details["totale_risultati"];
	console.log("Total results: " + totale_risultati)

	// Se non ci sono dati disponibili restituisci un mesaggio appropriato
	let pages = 0
	if (dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)").length !== 0) {
		pages = Math.max(
			...Array.from(
				dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
			)
			.map(a => Number(a.textContent))
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
		return false;
	}


	do {
		// current_page = 80 // For TEST
		console.log(`Current Page: ${current_page} of ${pages} (${search_details["totale_risultati"]} results) [${search_details["durata_ricerca"]}s]`)
		console.log(`${url}&da=${current_page*10}`)
		
		
		// Scarica nuovamente i dati solo se non è la prima volta che esegui il loop
		if (current_page != 0){
			try{
				html = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}&da=${current_page*10}`, { headers: { "Origin": "localhost" }})
					.then(res => res.text());
			} catch (e) {
				console.error(`Errore nella richiesta verso la pagina '${url}&da=${current_page*10}': %o`, e)
				res.status(500).json({
					"success": false,
					"message": `Errore nella richiesta verso la pagina '${url}&da=${current_page*10}': ${e}`,
					"results": search_details["totale_risultati"],
					"data": []
				});
				return;
			}
			
			dom = new jsdom.JSDOM(html);
			pages = Math.max(
				...Array.from(
					dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
				)
				.map(a => Number(a.textContent))
			);

			content = dom.window.document.getElementById("content");

			if (!content) {
				res.status(500).json({
					"success": false,
					"message": "Errore nella richiesta verso la pagina '" + url + "': la pagina non ha restituito un contenuto valido",
					"results": 0,
					"data": []
				});
				return;
			}
			
			rows = content.querySelectorAll("#content tbody > tr .cerca, .dativ, .dati");
			contentHead = dom.window.document.getElementById("contenthead");
			search_details = get_current_search_details(contentHead as HTMLElement); 
		}
	
		// Prima pulisce l'HTML e lo trasforma in un Array e poi parsa quell'array e lo trasforma in un JSON
		// formatted_data.push(parseHTML(normalizeContentHTML(rows)));
		formatted_data = formatted_data.concat(extractData(rows));

		// break // For TEST
		current_page++;
	} while (current_page <= pages);

	console.log("Returned results: " + formatted_data.length)

	// Se il numero dei risultati trovati tramite parsing E' DIVERSO dal numero di risultati dichiarati da inElenco
	if (formatted_data.length != totale_risultati) {
		res.status(500).json({
			"success": false,
			"message": `Dati trovati ma il loro totale (${formatted_data.length}) differisce da quello di inElenco (${totale_risultati}). Contattare lo sviluppatore.`,
			"results": formatted_data.length,
			"data": []
		})
		return false;
	}
	
	/**
	 * Rimuovi i dati duplicati
	 * 
	 * @see https://stackoverflow.com/questions/53542882/es6-removing-duplicates-from-array-of-objects
	 * 
	 */
	let keys = Object.keys(formatted_data[0]) as (keyof APIResponse)[];
	let filtered = formatted_data.filter(
        (s => (o: APIResponse) => 
            (k => !s.has(k) && s.add(k))
            (keys.map(k => o[k]).join('|'))
        )
        (new Set)
    )

	const output_data = filtered;
	res.json({
		"success": true,
		"message": "Dati trovati",
		"results": output_data.length,
		"data": output_data
	})
});


module.exports = router;