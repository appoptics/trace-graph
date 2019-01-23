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

const edge = child => parent => `"${parent}" -> "${child}" [dir=right color="${colour_arrows(parent,child)}" penwidth=${arrow_width(parent,child)} ]`;
const edges = R.compose(
  R.unnest,
  R.map(evt => R.map(edge(evt.fields.op_id), evt.edge)),
  R.tail //ignores root
);


const startTs = evts => parseInt(evts[0].fields.Timestamp_u, 10);
const nodeString = parts =>
  `"${parts.id}" [URL="#${parts.opId}", shape=${shape_node(parts)},style=filled,color="${colour_node(parts)}", fontsize=10, label="${parts.Layer}: ${parts.Label}\n${parts.duration}ms"];`;
const nodeParts = start => evt => ({
  id: evt.fields.op_id,
  Layer: evt.fields.Layer,
  Label: evt.fields.Label,
  opId: evt.fields.op_id,
  Service: evt.fields.Service,
  Hostname: evt.fields.Hostname,
  HostInstanceId: evt.fields.HostInstanceId,
  HostAZ: evt.fields.HostAZ,
  TID: evt.fields.TID,
  Query: evt.fields.Query,
  RemoteURL: evt.fields.RemoteURL,
  Latency: evt.fields.latency,
  Timestamp: evt.fields.Timestamp_u,
  duration: (parseInt(evt.fields.Timestamp_u, 10) - start)/1000,
});
const node = start => R.compose(nodeString, nodeParts(start));
const nodes = evts => R.map(node(startTs(evts)), evts);


const svg = R.compose(
  svgString => svgString.substr(svgString.indexOf('<svg')),
  Viz,
  s => `digraph { `+ group_string + `  rankdir=LR; style=filled; color=red; bgcolor="`+ bg_color + `"; ${s} }`,
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

var global_events =[];
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
      global_events = events;
      time_stamps();
      calculate_latency();
      normalize_latency();
	  normalize_timestamps();
      fields_to_array(events,dimension);
	  prep_groups(events,dimension);

      graph.innerHTML = svg(events);
      eventTablesDiv.innerHTML = eventTables(events);
      show_legend();
      if(zoom == true){
         auto_zoom();
      };
      zoom=false;
      add_node_listener();
    }
  );
}

function init() {
 var slider = document.getElementById("myRange");
 slider.oninput = function() {
    document.getElementById('traceGraph').style.zoom = this.value / 100;
  };
  const apiKey = localStorage.getItem('apiKey') || '';
  document.getElementById('apiKey').value = apiKey;
  const basic_url = localStorage.getItem('url') || '';
  document.getElementById('traceUrl').value = basic_url;

}

var zoom = true;
var last_thread = 0
var last_colour = 0
var thread_colours = {};
var unique_services = [];
var services = [];
var layers =[];
var legend = [];
var dimension = 'Service';
fade_by_latency = false;
fade_by_timestamp = false;

var subgraph_color = '#171f22'
var bg_color = '#171f22'
var bg_hex = '171f22'
var arrow_color = '#FFA500'
var group_arrow_color = '#EEEEEE'

//use these for all colours
service_colours = ['#81ecec','#74b9ff','#fd79a8','#ffff99','#e17055','#00b894',
  '#FF6633', '#FFB399', '#FF33FF', '#FFFF99', '#00B3E6',
  '#E6B333', '#3366E6', '#999966', '#99FF99', '#B34D4D',
  '#80B300', '#809900', '#E6B3B3', '#6680B3', '#66991A',
  '#FF99E6', '#CCFF1A', '#FF1A66', '#E6331A', '#33FFCC',
  '#66994D', '#B366CC', '#4D8000', '#B33300', '#CC80CC',
  '#66664D', '#991AFF', '#E666FF', '#4DB3FF', '#1AB399',
  '#E666B3', '#33991A', '#CC9999', '#B3B31A', '#00E680',
  '#4D8066', '#809980', '#E6FF80', '#1AFF33', '#999933',
  '#FF3380', '#CCCC00', '#66E64D', '#4D80CC', '#9900B3',
  '#E64D66', '#4DB380', '#FF4D4D', '#99E6E6']


//called when building string for Viz
function colour_node(event){
  var colour = service_colours[unique_fields.indexOf(event[dimension])]
  opacity = latency_to_opacity(event['Latency'])
  if (fade_by_timestamp ==true){
    opacity = timestamp_to_opacity(event['Timestamp'])
  }

  //special casing since not every event reports Service KV
  if(dimension == 'Service'){

    if(colour == undefined && thread_colours[event.TID] == undefined  ){
      colour = last_colour;
    }
    else if (colour == undefined && event.TID != undefined){
      colour = thread_colours[event.TID];
    }
    else if (colour != undefined && event.TID != undefined){
      thread_colours[event.TID] = colour;
    }
    last_colour = colour;
    last_thread = event.TID;

    colour = fade(colour, opacity);
    return colour
  }

  else{
    if(colour == undefined ){
      colour = 'gray';
      return colour;
    }
    else{
      colour = fade(colour, opacity);
      return colour;
    }
  }
}

function fade(color1,temp_ratio) {
  if (fade_by_latency != true && fade_by_timestamp != true){
	  return color1
  }

  color1 = color1.slice(1)
  color2 = bg_hex //background colour
  var hex = function(x) {
    x = x.toString(16);
    return (x.length == 1) ? '0' + x : x;
  };



  var r = Math.ceil(parseInt(color1.substring(0,2), 16) * temp_ratio + parseInt(color2.substring(0,2), 16) * (1-temp_ratio));
  var g = Math.ceil(parseInt(color1.substring(2,4), 16) * temp_ratio + parseInt(color2.substring(2,4), 16) * (1-temp_ratio));
  var b = Math.ceil(parseInt(color1.substring(4,6), 16) * temp_ratio + parseInt(color2.substring(4,6), 16) * (1-temp_ratio));

  var middle = hex(r) + hex(g) + hex(b);
  return '#'+middle
}



function shape_node(event){
  if(event['Query']){
    return 'cylinder'
  }
  else if(event['RemoteURL']){
    return 'cds'
  }
  else{
    return 'box'
  }
}

//small helper function
function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}


//loop through all events, and create an array out of unique field values
function fields_to_array(events,field){
  legend =[];
  i=events.length;

  while (i--) {
    if (events[i].fields[field]){
      legend.push(events[i].fields[field]);
    }
  }
  i=events.length;
  while( i--){
    if(field == 'Service'){
	  console.log(i)
	  console.log(events[i])
  	  if(events[i].fields.RemoteURL && events[i].fields.Label == 'exit'){
  		  domain = extractDomain(events[i].fields.RemoteURL)
  		  events[i].fields.Service = domain
  		  legend.push(events[i].fields[field]);
  	  }
    }

  }
  unique_fields = legend.filter( onlyUnique );
}

function extractDomain(url) {
    var hostname;
    //find & remove protocol (http, ftp, etc.) and get hostname

    if (url.indexOf("//") > -1) {
        hostname = url.split('/')[2];
    }
    else {
        hostname = url.split('/')[0];
    }

    //find & remove port number
    hostname = hostname.split(':')[0];
    //find & remove "?"
    hostname = hostname.split('?')[0];

    return hostname;
}

var group_string = '';

temp_val = '';
const temp_string = R.compose(
s => `subgraph ` +  temp_val + ` {rankdir=LR; fontcolor="#FFFFFF"; margin=50;pad=50;fontsize=40; color="#FFFFFF"; bgcolor="`+ subgraph_color+ `" label="` + label + `"; ${s} } `,
R.join(" "),
evts => nodes(evts),
// sort root first, then by timestamp
R.sort(evt => evt.edge.length == 0 ? 0 : evt.fields.Timestamp_u),
//R.filter(belongs,evt),
);

temp_group =[]

function prep_groups(events,group){

group_string = ''

for (i in unique_fields){

  temp_group = []
  for (x in events){
	  if (events[x].fields[group] == unique_fields[i]){
		  console.log(events[x])
		  temp_group.push(events[x])

	  }
  }


  temp_val = 'cluster_' + i
  label = unique_fields[i]
  new_string = temp_string(temp_group)
  group_string = group_string + new_string

}
//console.log(group_string)
}

//create a colour coded legend
function show_legend(){

  //make sure element is empty
  var legend_div = document.getElementById("Legend");
  while (legend_div.firstChild) {
    legend_div.removeChild(legend_div.firstChild);
  };

  //create header
  var newElement = document.createElement('div');
  newElement.id = 'legend_header'; newElement.className = "service";
  newElement.style = 'padding:10px;position:relative;border-bottom:1px solid rgb(221, 221, 221)';
  document.getElementById('Legend').appendChild(newElement);
  newElement.innerHTML = dimension


  for (var c in unique_fields) {
    var newElement = document.createElement('div');
    colour = service_colours[unique_fields.indexOf(unique_fields[c])];

    //create row / field
    newElement.id = unique_fields[c]; newElement.className = "service";
    newElement.style = 'padding:10px;position:relative;border-bottom:1px solid rgb(221, 221, 221)';
    document.getElementById('Legend').appendChild(newElement);

    //add coloured box
    var newElement = document.createElement('div');
    newElement.id = unique_fields[c]+'color_box'; newElement.className = "color box"; newElement.style = 'float:left;width:10px;height:10px;margin-top:5px;margin-right:10px;background:'+ colour;
    document.getElementById(unique_fields[c]).appendChild(newElement);

    //add field name
    var newElement = document.createElement('span');
    newElement.id = unique_fields[c]+'name'; newElement.className = "service_name"; newElement.style = 'width:auto;text-indent:10px;'
    newElement.innerHTML = unique_fields[c];
    document.getElementById(unique_fields[c]).appendChild(newElement);
  };

}

// because I don't know how SVGs work
function auto_zoom(){
  var graph_0_w = document.getElementById('graph0').getBoundingClientRect().width;
  var graph_0_h = document.getElementById('graph0').getBoundingClientRect().height;
  var traceGraph_w = document.getElementById('graph_container').getBoundingClientRect().width;
  var traceGraph_h = document.getElementById('graph_container').getBoundingClientRect().height;

  w_ratio = (traceGraph_w * .9) / graph_0_w
  h_ratio = (traceGraph_h * .9) / graph_0_h;

  if(w_ratio < h_ratio){
    document.getElementById('traceGraph').style.zoom = w_ratio;
    document.getElementById('myRange').value = w_ratio * 100;
  }
  else{
    document.getElementById('traceGraph').style.zoom = h_ratio;
    document.getElementById('myRange').value = h_ratio * 100;
  }
};

//pops up legend with all KVs when you click on a node
function add_node_listener(){
  var nodes = document.querySelectorAll('.node');

  for (var i = 0; i < nodes.length; i++) {
    nodes[i].addEventListener('click', function(event) {
        selected_node = this.firstElementChild.textContent;
        data_from_table = document.getElementsByName(selected_node);
        document.getElementById('details').innerHTML = data_from_table[0].innerHTML;
        document.getElementById('details').style.display = 'block';
    });
  }
}

//toggle between chart and raw list of events
function switch_views(){
	document.getElementById('details').style.display='none';
  if( document.getElementById('eventTables').style.display != 'block'){

    document.getElementById('graph_container').style.display = 'none';

    document.getElementById('eventTables').style.display = 'block';
    document.getElementById('eventTables').style['z-index'] = 1;
  }
  else{
    document.getElementById('eventTables').style.display = 'none';
    document.getElementById('eventTables').style['z-index'] = 500;

    document.getElementById('graph_container').style.display = 'block';
  }
}

//count entry and exit pairs for each layer, alert with status
function check_missing(){
  i=global_events.length;

  var layer_counts = {};
  while (i--) {
     if (global_events[i].fields.Layer){
       layer = global_events[i].fields.Layer
       label = global_events[i].fields.Label

       if(!layer_counts[layer]){
         layer_counts[layer] = {};
       }
       if(label){
         if(layer_counts[layer][label]){
           layer_counts[layer][label] = layer_counts[layer][label] +1;
         }
         else{
           layer_counts[layer][label] = 1;
         }
       }
    }
  }
    error_string ='';
    missing = 0;
    for (i in layer_counts){
      if (layer_counts[i].entry > layer_counts[i].exit){
        missing = 1;
        error_string = error_string.concat('Layer ',i,' is missing ',layer_counts[i].entry - layer_counts[i].exit,' exit events \n');
      }
    }
    if (missing==1){
      alert(error_string);
    }
    else{
      alert('Seems OK. Check console for event counts');
    }
    console.log(layer_counts);

}

var timestamps= {};
var timestamps_array = [];
var latency_array = [];

function time_stamps(){
  events = global_events;
  i=events.length;

  while (i--) {
	timestamps_array.push(parseInt(events[i].fields['Timestamp_u']))
    if (events[i].fields['op_id']){
      timestamps[events[i].fields['op_id']] = {};
      timestamps[events[i].fields['op_id']]['timestamp'] = events[i].fields.Timestamp_u;
    }
  }
}

function colour_arrows(parent,child){
  x = timestamps[child].timestamp - timestamps[parent].timestamp ;
  if(fade_by_timestamp == true){
    x = timestamp_to_opacity(timestamps[child].timestamp)
  }
  else{
    x=latency_to_opacity(x)
  }

  par_evt = events.find(evt => evt.fields.op_id === parent)
  chil_evt = events.find(evt => evt.fields.op_id === child)

  if(typeof(par_evt) == 'undefined' || typeof(chil_evt) == 'undefined'){
	  colour = arrow_color
  }

  if(par_evt.fields.Service == chil_evt.fields.Service){
	  colour = arrow_color
  }
  else{
	  colour = group_arrow_color
  }

  colour = fade(colour,x)
  return colour
}

function service_match(cur_event) {
	console.log(cur_event)
    return cur_event.edge[0] === cur_edge;
}

function arrow_width(parent,child){

  par_evt = events.find(evt => evt.fields.op_id === parent)
  chil_evt = events.find(evt => evt.fields.op_id === child)

  if(typeof(par_evt) == 'undefined' || typeof(chil_evt) == 'undefined'){
	  return 1
  }

  if(par_evt.fields.Service == chil_evt.fields.Service){
	  width=1
  }
  else{
	  width=4 + ' style=dashed'
  }
  //console.log(cur_service)
  return width
}

function calculate_latency(){
  events= global_events
  i=events.length;

  while (i--) {

    if (timestamps[events[i].fields.op_id] != undefined){
      if(timestamps[events[i].fields.op_id].latency != undefined ){
        max_latency = timestamps[events[i].fields.op_id].latency
      }
      else{
        //max_latency = timestamps[events[i].fields.op_id].latency
        max_latency = 0;
      }

    }
    else{
      //console.log(timestamps[events[i].fields.op_id])
      max_latency = 0;
    }
    if (events[i].fields['op_id']){
      i2 = events[i].edge.length
      //loop through all events
      while(i2--){
        latency = events[i].fields.Timestamp_u - timestamps[events[i].edge[i2]].timestamp
        if( latency >  max_latency){
          timestamps[events[i].fields.op_id]['latency'] = latency;
          events[i].fields.latency = latency;
          if(latency > timestamps[events[i].edge[i2]].latency || !timestamps[events[i].edge[i2]].latency){
            timestamps[events[i].edge[i2]].latency = latency;
          }
          latency_array.push(latency);
        }
      }
    }
  }
  i=events.length;
  while (i--) {
    latency = events[i].fields.latency
    max_latency = timestamps[events[i].fields.op_id].latency
    if (max_latency > latency || latency == undefined){
      global_events[i].fields.latency = max_latency
   }
}
}



ratio = 0
function normalize_latency(){
  ratio = Math.max.apply(Math, latency_array) / 100;
}

timestamp_ratio = 0
function normalize_timestamps(){
  timestamp_ratio = Math.max.apply(Math, timestamps_array) / 100;
}

function latency_to_opacity(latency){
  x = percentRank(latency_array,latency)
  x = (Math.round(x * 100) / 100)
  y = (latency / ratio) / 100
  y = (x + y) / 2
  if (!y){
    y = .05
  }
  return y
}

function timestamp_to_opacity(timestamp){
  console.log(timestamp)
  x = percentRank(timestamps_array,timestamp)
  x = (Math.round(x * 100) / 100)
  y = (timestamp / timestamp_ratio) / 100
  y = (x + y) / 2
  y = Math.pow(y,5)
  if (!y){
    y = .01
  }
  console.log('opacity')
  console.log(y)
  return y
}

function percentRank(array, n) {
    var L = 0;
    var S = 0;
    var N = array.length

    for (var i = 0; i < array.length; i++) {
        if (array[i] < n) {
            L += 1
        } else if (array[i] === n) {
            S += 1
        } else {

        }
    }
    if (fade_by_timestamp == true){
        var pct = (L + (.5 * S)) / N
    }
	else{
		var pct = (L + (0.5 * S)) / N
	}

    return pct
}
function latency_toggle() {
	if (fade_by_latency == false){
		fade_by_latency = true;
		fade_by_timestamp=false;
		document.getElementById('latency').style['background-color']='hsla(197,72%,38%,1.00)'
		document.getElementById('timestamp').style['background-color']='transparent';
		load()
	}
	else{
		fade_by_latency = false;
		document.getElementById('latency').style['background-color']='transparent';
		load();
	}

}

function timestamp_toggle() {
	if (fade_by_timestamp == false){
		fade_by_timestamp = true;
		document.getElementById('timestamp').style['background-color']='hsla(197,72%,38%,1.00)'
		fade_by_latency = false;
		document.getElementById('latency').style['background-color']='transparent';
		load()
	}
	else{
		fade_by_timestamp = false;
		document.getElementById('timestamp').style['background-color']='transparent';
		load();
	}

}

window.onload = function() {
  init();
  //doSomethingElse();
}
