'use strict';

const categories = [
  {id: 'general', label: 'Geral da via', key: 'maxspeed'},
  {id: 'motorcycle', label: 'Moto', key: 'maxspeed:motorcycle'},
  {id: 'hgv', label: 'Caminhão', key: 'maxspeed:hgv'}
];

function readLimit(tags, direction, category) {
  const otherDirection = direction === 'forward' ? 'backward' : 'forward';
  const access = ['access', 'vehicle', 'motor_vehicle'];
  if (category.id !== 'general') access.push(category.id);
  if (Object.entries(tags).some(([key, value]) => {
    const parts = key.split(':');
    return access.includes(parts[0]) && !parts.includes(otherDirection) &&
      (parts.includes('conditional') || ['no', 'private'].includes(value));
  })) return {reason: 'Conferir restrição de acesso'};

  const special = Object.keys(tags).some(key => {
    const [base, ...parts] = key.split(':');
    const relevant = parts.every(part => [category.id, direction, 'conditional', 'lanes', 'variable'].includes(part));
    return base === 'maxspeed' && relevant && parts.some(part => ['conditional', 'lanes', 'variable'].includes(part));
  });
  if (special) return {reason: 'Conferir condição, faixa ou sinal variável'};

  const parse = value => /^\d+(?:\s*km\/h)?$/.test(value) && parseInt(value) > 0 ? parseInt(value) : null;
  const raw = tags[category.key + ':' + direction] ?? tags[category.key];
  if (!raw) return {reason: category.id === 'general' ? 'Sem limite geral cadastrado' : 'Sem cadastro específico'};
  const speed = parse(raw);
  if (!speed) return {reason: 'Conferir valor na fonte'};
  const general = tags['maxspeed:' + direction] ?? tags.maxspeed;
  if (category.id !== 'general' && general && (!parse(general) || speed > parse(general))) {
    return {reason: 'Conferir divergência com o limite geral'};
  }
  return {speed};
}

function monitorPanel(way, direction, gps, consultedAt) {
  const panel = el('monitor-template').content.firstElementChild.cloneNode(true);
  const field = selector => panel.querySelector(selector);
  const readings = categories.map(category => readLimit(way.tags, direction, category));
  const directionName = compass(way.bearing + (direction === 'forward' ? 0 : 180));
  for (const [index, category] of categories.entries()) {
    const row = element('div', '');
    const reading = readings[index];
    row.className = 'limit-row';
    row.append(element('dt', category.label), element('dd', reading.speed ? reading.speed + ' km/h' : reading.reason));
    if (reading.speed) row.classList.add('numeric');
    field('dl').append(row);
  }
  const type = field('select'), speed = field('input'), comparison = field('output');
  const formatter = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1});
  function compare() {
    const raw = speed.value.trim().replace(',', '.');
    if (!raw) return '';
    if (!/^\d{1,3}(?:\.\d)?$/.test(raw)) return 'Informe a velocidade em km/h, com até uma casa decimal.';
    const {speed: limit} = readings[type.selectedIndex];
    if (!limit) return 'Comparação indisponível para esta categoria.';
    const delta = Math.round((Number(raw) - limit) * 10) / 10;
    return delta === 0 ? 'Igual ao limite cadastrado.' : formatter.format(Math.abs(delta)) + ' km/h ' + (delta > 0 ? 'acima' : 'abaixo') + ' do limite cadastrado.';
  }
  function update() { comparison.textContent = compare(); field('textarea').hidden = true; field('[role=status]').textContent = ''; }
  type.onchange = speed.oninput = update;
  field('button').onclick = async () => {
    const lines = [
      'Via Pesada · Consulta de monitoramento', consultedAt.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) + ' (Brasília)',
      nameOf(way) + ' · rumo aproximado ' + directionName,
      'GPS: ' + gps.lat + ', ' + gps.lon + ' · ' + Math.round(way.distance) + ' m da pista selecionada',
      ...categories.map((c,i) => c.label + ': ' + (readings[i].speed ? readings[i].speed + ' km/h' : readings[i].reason))
    ];
    if (speed.value.trim()) lines.push('GPS informado (' + type.selectedOptions[0].text + '): ' + speed.value + ' km/h · ' + compare());
    lines.push('Fonte: https://www.openstreetmap.org/way/' + way.id);
    if (way.timestamp) lines.push('Última edição da via: ' + new Date(way.timestamp).toLocaleDateString('pt-BR'));
    const summary = lines.join('\n');
    try { await navigator.clipboard.writeText(summary); field('[role=status]').textContent = 'Resumo copiado.'; }
    catch { const box = field('textarea'); box.hidden = false; box.value = summary; box.focus(); box.select(); field('[role=status]').textContent = 'Selecione Copiar no seu dispositivo.'; }
  };
  return panel;
}
