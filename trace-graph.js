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

const edge = child => parent => `"${parent}" -> "${child}";`;
const edges = R.compose(
  R.unnest,
  R.map(evt => R.map(edge(evt.fields.op_id), evt.edge)),
  R.tail //ignores root
);

const startTs = evts => parseInt(evts[0].fields.Timestamp_u, 10);
const nodeString = parts =>
  `"${parts.id}" [URL="#${parts.opId}", shape=box, fontsize=10, label="${parts.layer}: ${parts.label}\n${parts.duration}ms"];`;
const nodeParts = start => evt => ({
  id: evt.fields.op_id,
  layer: evt.fields.Layer,
  label: evt.fields.Label,
  opId: evt.fields.op_id,
  duration: parseInt(evt.fields.Timestamp_u, 10) - start,
});
const node = start => R.compose(nodeString, nodeParts(start));
const nodes = evts => R.map(node(startTs(evts)), evts);

const svg = R.compose(
  svgString => svgString.substr(svgString.indexOf("<svg")),
  Viz,
  s => `digraph { rankdir=LR; ${s} }`,
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
  const headers = headersForBasicAuth(apiKey);

  localStorage.setItem('apiKey', apiKey);

  fetch(url, {mode: 'cors', headers}).then(
    response => response.json()
  ).then(
    events => {
      graph.innerHTML = svg(events);
      eventTablesDiv.innerHTML = eventTables(events);
    }
  );
}

function init() {
  const apiKey = localStorage.getItem('apiKey') || '';
  document.getElementById('apiKey').value = apiKey;
}

window.onload = init;
