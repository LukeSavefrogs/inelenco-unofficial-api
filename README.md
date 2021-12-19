<!-- 
Per modificare:
	https://socialify.git.ci/LukeSavefrogs/inelenco-unofficial-api?description=1&descriptionEditable=Unofficial%20API%20for%20retrieving%20data%20from%20InElenco&font=Raleway&issues=1&language=1&logo=https%3A%2F%2Fwww.inelenco.com%2Fimg%2FlogoElenco.png&name=1&owner=1&pattern=Plus&stargazers=1&theme=Light 
-->
![[object Object]](https://socialify.git.ci/LukeSavefrogs/inelenco-unofficial-api/image?description=1&descriptionEditable=Unofficial%20API%20for%20retrieving%20data%20from%20InElenco&font=Raleway&issues=1&language=1&logo=https%3A%2F%2Fwww.inelenco.com%2Fimg%2FlogoElenco.png&name=1&owner=1&pattern=Plus&stargazers=1&theme=Light)

[![GitHub latest commit](https://badgen.net/github/last-commit/LukeSavefrogs/inelenco-unofficial-api/main)](https://GitHub.com/LukeSavefrogs/inelenco-unofficial-api/commit/main)

## :mortar_board: Introduzione
### Perchè?
Inizialmente l'idea di creare un'API per inElenco è nata dalla necessità di filtrare i numeri civici, cosa complicata da fare manualmente in quanto l'unico modo per farlo è fare manualmente (cercando quindi talvolta su centinaia di indirizzi a volte anche duplicati) oppure usare una query personalizzata usando il formato descritto dalla guida sul loro sito.  

Da qui è nata la sfida. Creare un'interfaccia che utilizzasse inElenco ma permettesse di fare ricerche mirate sfruttando il suo notevole sistema di query.

> ATTENZIONE:  
> L'obbiettivo non è mai stato nè mai sarà *sostituirsi* a inElenco, bensì fare da "framework", fornendo un'interfaccia ad alto livello che permetta di sfruttare in modo intuitivo i filtri messi a disposizione da inElenco stesso.

A queste query si affiancano alcune funzionalità extra, come la possibilità di ricercare in modo semplice un singolo civico (usando il parametro GET `civico`) oppure cercare un range di civici (combinando `civico_da` e `civico_a`).

Questo progetto è stato quindi creato per scopo didattico, si rifa a dati pubblici, e non mira a ledere nè a discriminare l'operato di altri (compresi gli sviluppatori di inElenco).


### Back-End
> https://inelenco-unofficial-api.herokuapp.com

### Front-End
:rocket: _In arrivo_ :rocket:

## :books: Documentazione
### Endpoint richieste
<pre>
GET inelenco-unofficial-api.herokuapp.com/search
</pre>

### Parametri richieste
<table align="center">
	<thead>
		<tr>
			<th colspan="5" align="center">Parametri inElenco</th>
		</tr>
		<tr>
			<th>Nome</th>
			<th>Valori possibili</th>
			<th>Descrizione</th>
			<th>Esempio</th>
			<th>Obbligatorio</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>indirizzo</td>
			<td><i>Qualsiasi</i></td>
			<td>L'indirizzo da cercare</td>
			<td><code>Via Roma</code></td>
			<td><strong>SI</strong></td>
		</tr>
		<tr>
			<td>cap</td>
			<td><i>Numero</i></td>
			<td>Il CAP dell'indirizzo da cercare</td>
			<td><code>00046</code></td>
			<td>NO (ma consigliato)</td>
		</tr>
		<tr>
			<td>comune</td>
			<td><i>Qualsiasi</i></td>
			<td>Il comune dell'indirizzo da cercare</td>
			<td><code>Grottaferrata</code></td>
			<td>NO (ma consigliato)</td>
		</tr>
		<tr>
			<td>provincia</td>
			<td><i>Qualsiasi</i></td>
			<td>Codice della provincia dell'indirizzo da cercare</td>
			<td><code>RM</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>tipo</td>
			<td><i>Stringa</i></td>
			<td>Il tipo di record da cercare (privato/azienda)</td>
			<td><code>privato</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>nome</td>
			<td><i>Qualsiasi</i></td>
			<td>Nominativo da cercare</td>
			<td><code>Mario Ross*</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>telefono</td>
			<td><i>Numero</i></td>
			<td>Il numero di telefono da cercare</td>
			<td><code>1234567890</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>fax</td>
			<td><i>Numero</i></td>
			<td>Il numero di fax da cercare</td>
			<td><code>1234567890</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>cellulare</td>
			<td><i>Numero</i></td>
			<td>Il numero di cellulare da cercare</td>
			<td><code>1234567890</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>categoria</td>
			<td><i>Qualsiasi</i></td>
			<td>Settore azienda; vedere elenco settori sul sito di inElenco (parte non chiara)</td>
			<td></td>
			<td>NO</td>
		</tr>
	</tbody>
</table>

<table align="center">
	<thead>
		<tr>
			<th colspan="5" align="center">Parametri aggiuntivi</th>
		</tr>
		<tr>
			<th>Nome</th>
			<th>Valori possibili</th>
			<th>Descrizione</th>
			<th>Esempio</th>
			<th>Obbligatorio</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>civico</td>
			<td><i>Numero</i></td>
			<td>Il civico da cercare</td>
			<td><code>125</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>civico_da</td>
			<td><i>Numero</i></td>
			<td>Civico di inizio intervallo. Usare in congiunta a <code>civico_a</code> per specificare un range di civici da restituire nei risultati</td>
			<td><code>16</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>civico_a</td>
			<td><i>Numero</i></td>
			<td>Civico di fine intervallo. Usare in congiunta a <code>civico_da</code> per specificare un range di civici da restituire nei risultati</td>
			<td><code>24</code></td>
			<td>NO</td>
		</tr>
		<tr>
			<td>custom_query</td>
			<td><i>Qualsiasi</i></td>
			<td>
				Se è presente questo parametro TUTTI gli altri verranno ignorati. Specifica una query personalizzata da sottoporre alla ricerca di inElenco. Per maggiori informazioni sulle query supportate vedere la <a href="https://www.inelenco.com/?dir=guida">guida di inElenco</a>.
				<br>
				E' molto importante che nella richiesta la query venga codificata utilizzando la funzione JS <code>encodeURIComponent(query)</code> (o un suo equivalente in caso si stesse utilizzando un altro linguaggio)
				<br>
				<br>
				La query nell'esempio restituirà tutti i nominativi che hanno nel nome la parola "Rossi" e che abitano al CAP 20100 (Milano) e che NON contengono nel nome la parola "Fra" seguita da qualsiasi numero di caratteri (quindi ad esempio non saranno inclusi nei risultati Francesco, Franco, ecc..)
			</td>
			<td><code>nome:Rossi cap:20100 AND -nome:"Fra*"</code></td>
			<td>NO</td>
		</tr>
	</tbody>
</table>


### Esempio richiesta
```Bash
curl -sG "https://inelenco-unofficial-api.herokuapp.com/search?indirizzo=Via%20Roma&cap=00046&comune=Grottaferrata&provincia=RM&civico_da=68&civico_a=90"
```

## :bell: Disclaimer
- Non sono affiliato nè tantomeno in qualche modo collegato al proprietario di <a href="https://www.inelenco.com/">inElenco</a>.
- Questa API non è ufficiale e non si assicura il suo mantenimento nel tempo. Usare con cautela.

## Copyright
Per qualsiasi dibattito legale o per problemi legati al Copyright vi invito a contattarmi aprendo un [issue](https://github.com/LukeSavefrogs/inelenco-unofficial-api/issues) e risponderò al più presto.
