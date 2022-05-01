import express, { Request, Response } from "express";
import jsdom from 'jsdom';

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

const INELENCO_URL = "https://www.inelenco.com/";


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
 * Struttura dei parametri direttamente supportati da InElenco
 */
type InelencoParameters = {
	/**
	 * Nome e/o Cognome del contatto da ricercare
	 */
	nome: string,

	/**
	 * Indirizzo del contatto da ricercare
	 */
	indirizzo: string,
	cap: string,
	telefono: string,
	fax: string,
	cellulare: string,

	/**
	 * Provincia del contatto da ricercare nella forma a due lettere (ad esempio 'Roma' => 'RM')
	 */
	provincia: string,

	/**
	 * Comune del contatto da ricercare nella forma completa (ad esempio 'Roma' => 'Roma')
	 */
	comune: string,

	/**
	 * Tipologia del contatto da ricercare
	 */
	tipo: "privato" | "azienda" | "",
	categoria: string
}

type CustomParameters = {
	tipo_corrispondenza_indirizzo: "esatta" | "parziale" | "intelligente",
	/** 
	 * Indica se permettere all'API di restituire un numero di risultati > 1000
	 */
	allowBigQuery: boolean,

	/**
	 * Query da passare direttamente a InElenco, senza elaborare tutti gli altri parametri.
	 * 
	 * Attenzione: 
	 * L'utilizzo di questo parametro inibirà **tutti** gli altri parametri.
	 */
	custom_query: string,

	/**
	 * Se specificato, restringe il numero di risultati al solo civico passato come parametro. 
	 * 
	 * E' uno shorthand; equivale infatti a passare `civico_da=N` e `civico_a=N`, 
	 * dove `N` è il numero del civico.
	 */
	civico: number,
	civico_da: number,
	civico_a: number,
}

/**
 * Polyfill per il metodo nativo dei Browser `Element.innerText()`
 * 
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
 * @param allNumbers Wether to include all numbers or not
 * @returns Array with all the numbers
 */
function generateNumberSequence (start: number, end: number, allNumbers: boolean = false) {
	let numbers = Array.from({ length: end }, (v, i) => i+1).splice(start - 1);
	if (!allNumbers) numbers = numbers.filter(num => num % 2 == (start % 2));
	return numbers;
}


/**
 * A partire delle righe delal tabella dei risultati, estrae i dati dei singoli contatti.
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

/**
 * Restituisce i dettagli della ricerca effettuata, come il totale dei risultati,
 * la durata della ricerca, il numero di pagine ecc...
 * 
 * @param {jsdom.JSDOM} dom DOM della pagina
 */
function getSearchDetails (dom: jsdom.JSDOM): { pagina_min: number; pagina_max: number; totale_risultati: number; durata_ricerca: string; } {
	const contentHead = dom.window.document.getElementById("contenthead");
	if (!contentHead)
		throw new Error("Content head not found");
	
	const searchDetails = contentHead.textContent?.match(/([0-9]*) - ([0-9]*) di ([0-9]*) risultati in \(([0-9\.]*) Secondi\)/);
	if (!searchDetails)
		throw new Error("Couldn't find Search Details");

	return {
		"pagina_min": Number(searchDetails[1]),
		"pagina_max": Number(searchDetails[2]),
		"totale_risultati": Number(searchDetails[3]),
		"durata_ricerca": searchDetails[4],
	}
}

// https://medium.com/@bojanmajed/standard-json-api-response-format-c6c1aabcaa6d
const searchRoute = express.Router();
searchRoute.get('/', async (req: Request, res: Response) => {
	// Se non è stato passato nessun parametro, restituisco "Error 400 - Bad Request"
	if (Object.keys(req.query).length == 0) {
		res.status(400).json({
			"success": false,
			"message": "Devi specificare almeno un parametro.",
			"results": 0,
			"data": [],
		});
		return false;
	}

	/**
	 * Parametri da passare a InElenco così come sono.
	 * 
	 * @see https://www.inelenco.com/?dir=guida#content
	 * @type InelencoParameters
	 */
	const inelencoParameters: InelencoParameters = {
		"nome": (req.query['nome']?.toString()) || "",
		"indirizzo": (req.query['indirizzo']?.toString()) || "",
		"cap": (req.query['cap']?.toString()) || "",
		"telefono": (req.query['telefono']?.toString()) || "",
		"fax": (req.query['fax']?.toString()) || "",
		"cellulare": (req.query['cellulare']?.toString()) || "",
		"provincia": (req.query['provincia']?.toString()) || "",
		"comune": (req.query['comune']?.toString()) || "",
		"tipo": (("tipo" in req.query && req.query['tipo']) ? (req.query['tipo'].toString().trim() == "azienda" ? "azienda" : "privato") : ""),
		"categoria": (req.query['categoria']?.toString()) || "",
	}

	/**
	 * Parametri custom utilizzati unicamente nell'ambito della Route
	 */
	let customParameters: CustomParameters = {
		tipo_corrispondenza_indirizzo: "parziale",
		allowBigQuery                : (req.query['allow_big_query']?.toString().trim() || "false") == "true" ? true : false,
		custom_query                 : ((req.query['custom_query']?.toString()) || "").trim(),
		civico                       : Number((req.query['civico']?.toString().trim()) || 0),
		civico_da                    : Number((req.query['civico_da']?.toString().trim()) || 0),
		civico_a                     : Number((req.query['civico_a']?.toString().trim()) || 0),
	};
	
	/** 
	 * Utilizzo una variabile temporanea per 2 motivi:
	 *  - Per evitare di richiamare ogni volta il parametro GET e quindi semplificare il codice.
	 *  - Per far si che il sistema di tipizzazione di TypeScript funzioni al meglio
	*/
	const _tipoRicerca = (req.query['tipo_corrispondenza_indirizzo']?.toString().trim() || "");
	if (_tipoRicerca == "intelligente" || _tipoRicerca == "parziale" || _tipoRicerca == "esatta") {
		customParameters.tipo_corrispondenza_indirizzo = _tipoRicerca;
	}

	/**
	 * Array temporaneo utilizzato per costruire la query di ricerca dell'indirizzo per
	 *   le modalità di ricerca "parziale" e "intelligente".
	 */
	let queryPieces: string[] = []

	switch (customParameters.tipo_corrispondenza_indirizzo) {
		case "esatta":
			break;

		case "intelligente":
			queryPieces.push(
				inelencoParameters["indirizzo"].toString()
					.trim()                                  // 1. Rimuovo gli spazi iniziali e finali
					.replace(/\s+/, " ")                     // 2. Riduco il numero di spazi all'interno della stringa
					.split(" ")                              // 3. Divido la stringa in parole
					.map((item, index) => {                  // 4. Elaboro ogni parola della stringa cercando di generalizzare la ricerca
						// L'unica parola che andrà analizzata è la prima. Le altre restituiscile così come sono
						if (index != 0)
							return item;
						
						if (/^[\s\t]*(via|viale)/i.test(item))
							return item.replace(/^[\s\t]*(viale|via)/i, "via*");
						
						if (/^[\s\t]*(piazza|piazzale)/i.test(item))
							return item.replace(/^[\s\t]*(piazzale|piazza)/i, "piazza*");
						
						// Se non ho trovato corrispondenze, lascio intatta la parola.
						return item;
					})
					.map(item => `indirizzo:${item}`)       // 5. Aggiungo il prefisso 'indirizzo:'
					.join(" AND ")                          // 6. Unisco tutte le parole con AND
			);

			// Lo abbiamo già pushato nell'array delle parti della query da costruire, quindi 
			// lo tolgo dai parametri di inelenco
			inelencoParameters["indirizzo"] = "";
			break;
		
		case "parziale":
		default:
			queryPieces.push(
				inelencoParameters["indirizzo"].toString()
					.trim()                                  // 1. Rimuovo gli spazi iniziali e finali
					.replace(/\s+/, " ")                     // 2. Riduco il numero di spazi all'interno della stringa
					.split(" ")                              // 3. Divido la stringa in parole
					.map(item => `indirizzo:${item}`)        // 4. Aggiungo il prefisso 'indirizzo:'
					.join(" AND ")                           // 5. Unisco tutte le parole con AND
			);

			// Lo abbiamo già pushato nell'array delle parti della query da costruire, quindi 
			// lo tolgo dai parametri di inelenco
			inelencoParameters["indirizzo"] = "";
			break;
	}



	/* ------------------------- Controlli di validità vari ------------------------- */
	// Controllo se sono i numeri civici sono degli interi
	if (
		!Number.isInteger(customParameters["civico"]) || 
		!Number.isInteger(customParameters["civico_da"]) || 
		!Number.isInteger(customParameters["civico_a"]) || 
		("civico" in req.query && customParameters["civico"] <= 0)
	) {
		res.status(400).json({
			"success": false,
			"message": "I parametri 'numero_civico', 'numero_civico_da' e 'numero_civico_a' devono essere degli interi > 0",
			"results": 0,
			"data": [],
		});
		return;
	}

	// Controllo che `customParameters.civico_da` e `customParameters.civico_a` siano numeri validi
	if (customParameters["civico_da"] + customParameters["civico_a"] != 0) {
		/**
		 * Se il civico di partenza o di arrivo è un numero negativo o uguale a 0 restituisco:
		 *     Error 400 - Bad Request
		 * 
		 * Allego inoltre una spiegazione comprensibile dell'errore.
		 */
		if (customParameters["civico_da"] <= 0 || customParameters["civico_a"] <= 0){
			res.status(400).json({
				"success": false,
				"message": "Hai specificato 'numero_civico_da' o 'numero_civico_a' quindi devono essere ENTRAMBI degli interi > 0",
				"results": 0,
				"data": [],
			});
			return;
		}
		
		/**
		 * Se il civico di _partenza_ è **maggiore** di quello di _arrivo_ restituisco:
		 *     Error 400 - Bad Request
		 * 
		 * Allego inoltre una spiegazione comprensibile dell'errore.
		 */
		if (customParameters["civico_da"] > customParameters["civico_a"]){
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
	if (customParameters["civico"] != 0) {
		customParameters["civico_da"] = customParameters["civico"];
		customParameters["civico_a"] = customParameters["civico"];
	}

	let url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(customParameters["custom_query"])}`;
	if (customParameters["custom_query"] == "") {
		// Trasformo i parametri di inElenco in pezzi della query che poi andrò ad unire in seguito
		for (const [paramName, paramValue] of Object.entries(inelencoParameters)){
			if (paramValue.trim() != "")
				queryPieces.push(`${paramName}:"${paramValue}"`);
		}

		// Se sono stati specificati dei Numeri Civici limite da rispettare, aggiungili all'array delle query
		if (customParameters["civico_da"] != 0 && customParameters["civico_a"] != 0) {		
			queryPieces.push(
				"indirizzo:("
				+ generateNumberSequence(customParameters["civico_da"], customParameters["civico_a"])
					.map(num => `indirizzo:"*, ${num}"`)
					.join(" OR ")
				+ ")"
			);
		}

		url = `${INELENCO_URL}?dir=cerca&cerca=${encodeURIComponent(queryPieces.join(" AND "))}`
	}

	console.log(`[${req.correlationId()}] Requesting url: "${url}"`);

	/**
	 * Corpo HTML scaricato tramite una richiesta HTTP al sito di inelenco.
	 * 
	 * Utilizzo un proxy specificatamente per bypassare il blocco CORS.
	 */
	let html = "";
	
	/**
	 * Contiene il numero di pagine totali (aggiornato ad ogni iterazione/cambio di pagina) in cui 
	 * sono contenuti i risultati.
	 */
	let pages = 0;

	/**
	 * Numero della pagina che si sta analizzando. 
	 * Viene aumentata ad ogni iterazione fino a che non raggiunge il numero di pagine totali.
	 */
	let currentPage = 0;

	let elencoContatti: Array<APIResponse>  = [];

	try{
		const response = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}`, { headers: { "Origin": "localhost" }})
		html = await response.text();

		if (response.status != 200) {
			throw new Error(`Got HTTP Response '${response.status}'. Check proxy logs.`);
		}
	} catch (e) {
		console.error(`[${req.correlationId()}] Errore nella richiesta verso la pagina '${url}&da=${currentPage*10}': ${e}`)
		res.status(500).json({
			"success": false,
			"message": `Errore nella richiesta verso la pagina '${url}&da=${currentPage*10}': ${e}`,
			"results": 0,
			"data": []
		});
		return false;
	}


	// Inizializza l'oggetto JSDOM con l'html appena scaricato
	let dom: jsdom.JSDOM = new jsdom.JSDOM(html);
	let content = dom.window.document.getElementById("content");

	if (!content) {
		res.status(500).json({
			"success": false,
			"message":`"Errore nella richiesta verso la pagina '${url}': la pagina non ha restituito un contenuto valido`,
			"results": 0,
			"data": []
		});
		return false;
	}

	let rows = content.querySelectorAll("#content tbody > tr .cerca, .dativ, .dati");

	/**
	 * Contiene i dettagli della ricerca in corso, ottenuti attraverso l'elemento in testa alla pagina HTML
	 */
	let searchDetails = getSearchDetails(dom);

	/**
	 * Contiene solamente il totale dei risultati. Viene restituito ad ogni output json.
	 */
	let totaleRisultati = searchDetails["totale_risultati"];

	if (dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)").length !== 0) {
		pages = Math.max(
			...Array.from(
				dom.window.document.querySelectorAll("body > table > tbody > tr:nth-of-type(9) > td > table > tbody > tr:nth-of-type(5) > td:nth-of-type(4) > table > tbody > tr > td > a:not(.listapaggira)")
			)
			.map(a => Number(a.textContent))
		);
	}

	console.log(`[${req.correlationId()}] Total results: ${totaleRisultati}`)

	//! Se non sono stati trovati risultati
	let total_rows = Array.from(rows).map(row => innerText(row)).filter(row => row.replace(/\n/g, "").trim() != "").length;
	if (total_rows == 0 || searchDetails["totale_risultati"] == 0) {
		res.status(200).json({
			"success": true,
			"message": "Nessun dato trovato per i parametri cercati",
			"results": searchDetails["totale_risultati"],
			"data": [],
		});
		return;
	}
	
	//! Se sono stati trovati TROPPI risultati (> 1000)
	// TODO: Permetti di fare grandi ricerche ma restituisci solo i primi 1000 risultati
	// Questo controllo serve per evitare una sorta di DDOS e per evitare che gli utenti per errore facciano 
	// 	una richiesta che possa bloccare il mio server e appesantire quello di inElenco
	if (searchDetails["totale_risultati"] > 1000 && !customParameters.allowBigQuery) {
		res.status(200).json({
			"success": false,
			"message": `Il numero di risultati per la query fornita supera i 1000 record (${searchDetails["totale_risultati"]} trovati) e il parametro 'allow_big_query' non è stato passato o non era impostato a 'true'. Fai una ricerca più mirata.`,
			"results": searchDetails["totale_risultati"],
			"data": []
		});
		return false;
	}


	do {
		console.log(`[${req.correlationId()}] Current Page: ${currentPage} of ${pages} (${searchDetails["totale_risultati"]} results) [${searchDetails["durata_ricerca"]}s]`)
		console.log(`[${req.correlationId()}] Current URL : ${url}&da=${currentPage*10}`)
		
		
		// Scarica nuovamente i dati solo se non è la prima volta che esegui il loop
		if (currentPage != 0){
			try{
				const response = await fetch(`https://cors-anywhere-luke.herokuapp.com/${url}&da=${currentPage*10}`, { headers: { "Origin": "localhost" }})
				html = await response.text();
		
				if (response.status != 200) {
					throw new Error(`Got HTTP Response '${response.status}'. Check proxy logs.`);
				}
			} catch (e) {
				console.error(`Errore nella richiesta verso la pagina '${url}&da=${currentPage*10}': %o`, e)
				res.status(500).json({
					"success": false,
					"message": `Errore nella richiesta verso la pagina '${url}&da=${currentPage*10}': ${e}`,
					"results": searchDetails["totale_risultati"],
					"data": []
				});
				return false;
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
			searchDetails = getSearchDetails(dom); 
		}
	
		// Utilizzo la funzione `concat` in modo da rimuovere la necessità di eseguire la `flat` in seguito
		elencoContatti = elencoContatti.concat(extractData(rows));

		currentPage++;
	} while (currentPage <= pages);

	console.log(`[${req.correlationId()}] Returned results: ${elencoContatti.length}`)

	// Se il numero dei risultati trovati tramite parsing E' DIVERSO dal numero di risultati dichiarati da inElenco
	if (elencoContatti.length != totaleRisultati) {
		res.status(500).json({
			"success": false,
			"message": `Dati trovati ma il loro totale (${elencoContatti.length}) differisce da quello di inElenco (${totaleRisultati}). Contattare lo sviluppatore.`,
			"results": elencoContatti.length,
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
	let keys = Object.keys(elencoContatti[0]) as (keyof APIResponse)[];
	let uniqueData = elencoContatti.filter(
        (s => (o: APIResponse) => 
            (k => !s.has(k) && s.add(k))
            (keys.map(k => o[k]).join('|'))
        )
        (new Set)
    )

	res.json({
		"success": true,
		"message": "Dati trovati",
		"results": uniqueData.length,
		"data": uniqueData
	})
});


export default searchRoute;