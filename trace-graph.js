const apiURL = R.compose(
  str => str + '/events',
  R.replace(/apm\/\d+\/services\/\S+?\//, 'metrics-api/v1/apm/')
);
const authorizationHeaders = headerValue => {
  const h = new Headers();
  h.append('Authorization', headerValue);
  return h;
};
const headersForBasicAuth = R.compose(
  authorizationHeaders,
  b64Encoded => 'Basic ' + b64Encoded,
  btoa,
  apiKey => 'token:'+apiKey
);

const edge = child => parent => `"${parent}" -> "${child}" [dir=right color="orange"];`;
const edges = R.compose(
  R.unnest,
  R.map(evt => R.map(edge(evt.fields.op_id), evt.edge)),
  R.tail //ignores root
);


const startTs = evts => parseInt(evts[0].fields.Timestamp_u, 10);
const nodeString = parts =>
  `"${parts.id}" [URL="#${parts.opId}", shape=box,style=filled,color="${colour_node(parts.service)}", fontsize=10, label="${parts.layer}: ${parts.label}\n${parts.duration}ms"];`;
const nodeParts = start => evt => ({
  id: evt.fields.op_id,
  layer: evt.fields.Layer,
  label: evt.fields.Label,
  opId: evt.fields.op_id,
  service: evt.fields.Service,
  duration: parseInt(evt.fields.Timestamp_u, 10) - start,
});
const node = start => R.compose(nodeString, nodeParts(start));
const nodes = evts => R.map(node(startTs(evts)), evts);



const svg = R.compose(
  svgString => svgString.substr(svgString.indexOf("<svg")),
  Viz,
  s => `digraph { rankdir=LR; style=filled; color=red; bgcolor="#171f22"; ${s} }`,
  R.join(" "),
  evts => nodes(evts).concat(edges(evts)),
  // sort root first, then by timestamp
  R.sortBy(evt => evt.edge.length == 0 ? 0 : evt.fields.Timestamp_u)
);

const eventEdges = R.compose(
  edgesString => `<tr><td>Edges</td><td>${edgesString}</td></tr>`,
  R.join(', '),
  R.map(edge => `<a href="#${edge}">${edge}</a>`)
);

const eventTable = event => R.compose(
  R.join('\n'),
  R.prepend(`<a name="${event.fields.op_id}"><table>`),
  R.append('</table></a>'),
  R.append(eventEdges(event.edge)),
  R.map(pair => `<tr><td>${pair[0]}</td><td>${pair[1]}</td></tr>`),
  R.toPairs,
  R.prop('fields')
)(event);

const eventTables = R.compose(
  R.join('\n'),
  R.map(eventTable)
);


function load() {
  const apiKey = document.getElementById('apiKey').value;
  const graph = document.getElementById('traceGraph');
  const eventTablesDiv = document.getElementById('eventTables');
  const url = apiURL(document.getElementById('traceUrl').value);
  const basic_url = document.getElementById('traceUrl').value;
  const headers = headersForBasicAuth(apiKey);

  localStorage.setItem('apiKey', apiKey);
  localStorage.setItem('url', basic_url);

  fetch(url, {mode: 'cors', headers}).then(
    response => response.json()
  ).then(
    events => {
      console.log(events)
      list_services(events)
      graph.innerHTML = svg(events);
      eventTablesDiv.innerHTML = eventTables(events);
    }
  );
}

function init() {
  const apiKey = localStorage.getItem('apiKey') || '';
  document.getElementById('apiKey').value = apiKey;
  const basic_url = localStorage.getItem('url') || '';
  document.getElementById('traceUrl').value = basic_url;

}

function colour_node(service_name){
	var colour = service_colours[unique_services.indexOf(service_name)]
	if(colour == undefined ){
		colour = 'white';
	}
	console.log(colour);
	return colour

}

function onlyUnique(value, index, self) { 
    return self.indexOf(value) === index;
}

// usage example:
//var a = ['a', 1, 'a', 2, '1'];
//var unique = a.filter( onlyUnique );

service_colours = ['blue','green','orange','yellow']
var unique_services = []
var services = []
function list_services(events){
	i=events.length;
	var services = [];
	
	while (i--) {
   	if (events[i].fields['Service']){
   		console.log(events[i].fields['Service']);
   		services.push(events[i].fields['Service']);
	   		}
   	}

unique_services = services.filter( onlyUnique );
console.log(unique_services);
}   




window.onload = init;
