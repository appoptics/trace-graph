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
  `"${parts.id}" [URL="#${parts.opId}", shape=box,style=filled,color="${colour_node(parts)}", fontsize=10, label="${parts.layer}: ${parts.label}\n${parts.duration}ms"];`;
const nodeParts = start => evt => ({
  id: evt.fields.op_id,
  layer: evt.fields.Layer,
  label: evt.fields.Label,
  opId: evt.fields.op_id,
  service: evt.fields.Service,
  tid: evt.fields.TID,
  duration: parseInt(evt.fields.Timestamp_u, 10) - start,
});
const node = start => R.compose(nodeString, nodeParts(start));
const nodes = evts => R.map(node(startTs(evts)), evts);



const svg = R.compose(
  svgString => svgString.substr(svgString.indexOf('<svg')),
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
      //console.log(events)
      fields_to_array(events,'Service');
	  //list_layers(events);
      graph.innerHTML = svg(events);
      eventTablesDiv.innerHTML = eventTables(events);
	  show_services();
	  auto_zoom();
    }
  );
}

function init() {
 var slider = document.getElementById("myRange");
 slider.oninput = function() {
        document.getElementById('traceGraph').style.zoom = this.value / 100;
    	console.log(this.value);
  };
  const apiKey = localStorage.getItem('apiKey') || '';
  document.getElementById('apiKey').value = apiKey;
  const basic_url = localStorage.getItem('url') || '';
  document.getElementById('traceUrl').value = basic_url;

}

var last_thread = 0
var last_colour = 0

function colour_node(event){
	var colour = service_colours[unique_fields.indexOf(event.service)]



	if(colour == undefined && thread_colours[event.tid] == undefined  ){
		colour = last_colour;
	}
	else if (colour == undefined && event.tid != undefined){
		colour = thread_colours[event.tid];
	}
	else if (colour != undefined && event.tid != undefined){
		thread_colours[event.tid] = colour;
	}
	last_colour = colour;
	last_thread = event.tid;
	//console.log(event.service)
	//console.log(event.tid)
	return colour

}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

// usage example:
//var a = ['a', 1, 'a', 2, '1'];
//var unique = a.filter( onlyUnique );

service_colours = ['#81ecec','#74b9ff','#fd79a8','yellow'];
thread_colours = {}
var unique_services = []
var services = []
var layers =[]
var legend = []




function fields_to_array(events,field){
	i=events.length;

	while (i--) {
   	if (events[i].fields[field]){
   		legend.push(events[i].fields[field]);
	   		}
   	}

unique_fields = legend.filter( onlyUnique );
console.log(unique_fields);
}


function show_services(){
	for (var c in unique_fields) {
    var newElement = document.createElement('div');
	colour = service_colours[unique_fields.indexOf(unique_fields[c])];
    newElement.id = unique_fields[c]; newElement.className = "service";
	newElement.style = 'padding:10px;position:relative;border-bottom:1px solid rgb(221, 221, 221)';
	//newElement.style.background = service_colours[unique_services.indexOf(unique_services[c])];
    //newElement.innerHTML = unique_services[c] + '<div style="position:relative;width:10px;height:10px;background:'+ colour +' " </div>' ;
    document.getElementById('Services').appendChild(newElement);

	var newElement = document.createElement('div');
    newElement.id = unique_fields[c]+'color_box'; newElement.className = "color box"; newElement.style = 'float:left;width:10px;height:10px;margin-top:5px;margin-right:10px;background:'+ colour;
    //newElement.innerHTML = unique_services[c];
	document.getElementById(unique_fields[c]).appendChild(newElement);

	var newElement = document.createElement('span');
    newElement.id = unique_fields[c]+'name'; newElement.className = "service_name"; newElement.style = 'width:auto;text-indent:10px;'
    newElement.innerHTML = unique_fields[c];
	document.getElementById(unique_fields[c]).appendChild(newElement);
};

}

function auto_zoom(){
	var graph_0_w = document.getElementById('graph0').getBoundingClientRect().width;
	var graph_0_h = document.getElementById('graph0').getBoundingClientRect().height;
	var traceGraph_w = document.getElementById('traceGraph').getBoundingClientRect().width;
	var traceGraph_h = document.getElementById('traceGraph').getBoundingClientRect().height;

	w_ratio = (window.innerWidth * .9) / graph_0_w
	h_ratio = (window.innerHeight * .6) / graph_0_h;

	if(w_ratio < h_ratio){
		document.getElementById('traceGraph').style.zoom = w_ratio;
		document.getElementById('myRange').value = w_ratio * 100;
	}
	else{
		document.getElementById('traceGraph').style.zoom = h_ratio;
		document.getElementById('myRange').value = h_ratio * 100;
	}
};





window.onload = function() {
  init();
  //doSomethingElse();
}
