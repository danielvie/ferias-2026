/* Rodada 2: mapa como seletor, atividades organizadas por dia.
   Protótipos de leitura. Sem reservas, edição ou dados em tempo real. */
const names = ['Panorama', 'Lado a lado', 'Por cidade', 'Caderno', 'Dia em foco', 'Rota e agenda'];
const cities = [
  { id:'bruges', name:'Bruges', x:15, y:32, days:[3,4], primary:3, dates:'05 e 06 dez', kind:'city', country:'Bélgica', note:'Hotel a reservar. Dia 06 pode ser em Gante.' },
  { id:'gante', name:'Gante', x:33, y:47, days:[4,5], primary:4, dates:'06 e 07 dez?', kind:'castle', country:'Bélgica', note:'Decidir entre Gante, mais um dia em Bruges e a volta a Liège.' },
  { id:'antuerpia', name:'Antuérpia', x:48, y:21, days:[7], primary:7, dates:'09 dez', kind:'train', country:'Bélgica', note:'Parada no caminho de Eindhoven. Planejar onde deixar as malas.' },
  { id:'bruxelas', name:'Bruxelas', x:39, y:73, days:[1,12,13], primary:12, dates:'03, 14 e 15 dez', kind:'city', country:'Bélgica', note:'Chegada no dia 03. Passeio e hotel no dia 14. Aeroporto no dia 15.' },
  { id:'liege', name:'Liège', x:63, y:87, days:[1,2,5,6], primary:2, dates:'03, 04, 07? e 08 dez', kind:'waffle', country:'Bélgica', note:'Nossa base na Bélgica. Volta no dia 07 ainda a decidir.' },
  { id:'maastricht', name:'Maastricht', x:74, y:64, days:[1], primary:1, dates:'03 dez', kind:'coffee', country:'Países Baixos', note:'Combinar o ponto de encontro e decidir onde almoçar.' },
  { id:'eindhoven', name:'Eindhoven', x:70, y:13, days:[7,8], primary:8, dates:'09 e 10 dez', kind:'bike', country:'Países Baixos', note:'Chegada dia 09 e passeio dia 10. Base para os bate-voltas até dia 13.' },
  { id:'helmond', name:'Helmond', x:88, y:30, days:[10], primary:10, dates:'12 dez', kind:'castle', country:'Países Baixos', note:'Confirmar a data e o horário com o amigo.' },
  { id:'asten', name:'Asten', x:88, y:47, days:[11], primary:11, dates:'13 dez', kind:'bike', country:'Países Baixos', note:'Um dia para visitar os amigos. Museu só se der vontade.' },
  { id:'valkenburg', name:'Valkenburg', x:88, y:83, days:[9], primary:9, dates:'11 dez?', kind:'star', country:'Países Baixos', note:'Bate-volta sugerido. Confirmar ingressos e datas das cavernas.' }
];
const dayCities = ['', 'maastricht', 'liege', 'bruges', 'gante', 'gante', 'liege', 'antuerpia', 'eindhoven', 'valkenburg', 'helmond', 'asten', 'bruxelas', 'bruxelas'];
let variant, selected, cityId, mapOpen = false;
let journalMapOpen = innerWidth > 760;
const view = document.body.dataset.view;
const dialog = document.getElementById('detalhes');
function readState() {
  const p = new URLSearchParams(location.search);
  variant = Number(p.get('variante') || document.body.dataset.variant || 1);
  if (!Number.isInteger(variant) || variant < 1 || variant > 6) variant = 1;
  // As páginas de segundo nível têm um único protótipo proprietário.
  if (view === 'cidade') variant = 3;
  if (view === 'rota' || view === 'agenda') variant = 6;
  selected = Number(p.get('dia') || 5) - 2;
  if (!Number.isInteger(selected) || selected < 0 || selected > 13) selected = 3;
  const candidate = cities.find(c => c.id === p.get('cidade'));
  cityId = candidate?.days.includes(selected) ? candidate.id : dayCities[selected];
}
function city() { return cities.find(c => c.id === cityId); }
function dateLabel(i = selected) { return `${days[i].week}, ${String(days[i].date).padStart(2,'0')} de dezembro`; }
function url(file = 'index.html', v = variant, i = selected, c = cityId) {
  const p = new URLSearchParams({variante:v, dia:days[i].date});
  if (c) p.set('cidade',c);
  return `${file}?${p}`;
}
function saveState() { history.pushState(null,'',url(location.pathname.split('/').pop() || 'index.html')); }
function tripButton(label = 'Notas da viagem') { return `<button class="button trip-notes-button" data-notes="trip">${icon('note')}<span>${label}</span></button>`; }
function header() {
  const nav = variant === 6 ? `<nav class="main-nav" aria-label="Navegação da viagem"><a href="${url('rota.html')}" ${view !== 'agenda'?'aria-current="page"':''}>${icon('pin')}Rota</a><a href="${url('agenda.html')}" ${view==='agenda'?'aria-current="page"':''}>${icon('grid')}Agenda</a></nav>` : `<span class="header-trip">Bélgica & Países Baixos <span>· dezembro de 2026</span></span>`;
  return `<header class="topbar"><a class="brand" href="${url()}">${icon('sun')} de férias<span>.</span></a>${nav}${tripButton()}</header>`;
}
function footer() { return `<footer class="footer"><span>02 a 15 de dezembro de 2026 · entre amigos</span><span>Roteiro provisório · horários ilustrativos</span></footer>`; }
function heading(kicker, title, right = '') { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1></div>${right}</div>`; }
function map(linkToCity = false, schematic = false) {
  const points = cities.map(c => ({...c}));
  if (schematic) {
    const positions = [[12,23],[31,23],[50,23],[12,77],[31,77],[50,77],[70,23],[89,23],[89,77],[70,77]];
    points.forEach((c,i)=>{c.x=positions[i][0];c.y=positions[i][1];});
  }
  const lines = schematic ? `<path d="M91 110H676V370H91" class="rail-line"/><path d="M91 110H676V370H91" class="rail-dashes"/>` : `<path d="M114 154 251 226 365 101 532 62 669 144 669 226" class="route-line"/><path d="M296 350 479 418 562 307 669 398" class="route-line tentative-line"/>`;
  return `<div class="map-wrap ${schematic?'schematic':''}"><div class="map-surface"><svg class="map-background" viewBox="0 0 760 480" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="map-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".19"/></pattern></defs><rect width="760" height="480" fill="url(#map-dots)"/>${schematic?'':`<path d="M0 0h215q-14 44-82 85T0 244" class="map-water"/><path d="M0 369q130-98 252-8t229 43 279-21v97H0" class="map-green"/><path d="M405 0q-22 96 66 172t137 50 152-4" class="map-border"/><path d="M752 65q-74 28-93 82t-69 124 27 209" class="map-river"/>`}${lines}</svg><span class="country-label country-be">BÉLGICA</span><span class="country-label country-nl">PAÍSES BAIXOS</span>${points.map(c=>{
    const attrs = linkToCity ? `href="${url('cidade.html',3,c.primary,c.id)}"` : `data-city="${c.id}" aria-pressed="${cityId===c.id}"`;
    const tag = linkToCity ? 'a':'button';
    return `<${tag} class="map-stop ${cityId===c.id?'active':''}" style="--x:${c.x}%;--y:${c.y}%" ${attrs} aria-label="${c.name}, ${c.dates}. Ver os dias desta cidade"><span class="map-dot" aria-hidden="true"></span><strong>${c.name}</strong>${schematic?`<small>${c.dates}</small>`:''}</${tag}>`;
  }).join('')}<span class="map-compass" aria-hidden="true">N<span>↑</span></span></div><div class="map-caption"><span>${icon('pin')}${linkToCity?'Escolha uma cidade para abrir seu roteiro.':'Toque na cidade para ver os dias.'}</span><small>Mapa esquemático, sem escala</small></div></div>`;
}
function cityDates() {
  const c = city();
  if (!c) return `<span class="travel-day">${icon('plane')} Dia de viagem</span>`;
  return `<nav class="city-dates" aria-label="Dias em ${c.name}"><span>${c.name}</span>${c.days.map(i=>`<button data-day="${i}" data-keep-city aria-pressed="${selected===i}">${String(days[i].date).padStart(2,'0')} dez${i===4||i===5?'?':''}</button>`).join('')}</nav>`;
}
function weekToggle() { return `<div class="week-toggle" role="group" aria-label="Semana da viagem"><button data-week="0" aria-pressed="${selected<7}">02 a 08 dez</button><button data-week="7" aria-pressed="${selected>=7}">09 a 15 dez</button></div>`; }
function weekStrip(illustrated = true) {
  const start = selected < 7 ? 0 : 7;
  return `<nav class="week-strip ${illustrated?'illustrated':'compact'}" aria-label="Dias da semana">${days.slice(start,start+7).map((d,n)=>{const i=start+n;return `<button class="week-day ${i===selected?'active':''}" data-day="${i}" aria-pressed="${i===selected}"><span class="weekday">${d.week}</span><strong class="day-number">${String(d.date).padStart(2,'0')}</strong>${illustrated?`<span class="day-art">${art(d.kind)}</span>`:''}<strong class="day-city">${d.city}</strong><span class="day-count">${d.acts.length} atividades ${icon('arrow')}</span></button>`;}).join('')}</nav>`;
}
function activityList(i = selected) {
  return `<div class="activity-list">${days[i].acts.map((a,n)=>`<button class="activity" data-activity="${n}" data-activity-day="${i}"><span class="activity-time">${a[0]}</span><span class="activity-icon">${icon(a[2])}</span><span class="activity-title">${a[1]}</span>${icon('arrow','activity-arrow')}</button>`).join('')}</div>`;
}
function note(i = selected) { return `<button class="place-note" data-notes="place" data-note-day="${i}">${icon('note')}<span><small>PARA LEMBRAR</small><strong>${days[i].note}</strong></span>${icon('arrow')}</button>`; }
function stay(i = selected) { return `<div class="stay">${icon('bed')}<span>${days[i].stay}</span></div>`; }
function arrows() { return `<div class="day-arrows"><button data-step="-1" aria-label="Dia anterior" ${selected===0?'disabled':''}>${icon('left')}</button><span>${selected+1} de 14 dias</span><button data-step="1" aria-label="Próximo dia" ${selected===13?'disabled':''}>${icon('arrow')}</button></div>`; }
function dayPicker() { return `<label class="day-picker">${icon('grid')}<span class="sr-only">Escolher dia da viagem</span><select id="day-picker">${days.map((d,i)=>`<option value="${i}" ${i===selected?'selected':''}>${String(d.date).padStart(2,'0')} dez · ${d.city}</option>`).join('')}</select></label>`; }
function summary(i = selected) { const d=days[i]; return `<div class="day-summary"><span class="eyebrow">${dateLabel(i)}</span><h2>${d.city}</h2><p>${d.title}</p><span class="route">${icon('pin')}${d.route}</span>${stay(i)}</div>`; }
function dayPanel() { return `<section class="day-panel" aria-label="Plano do dia selecionado"><div>${summary()}${arrows()}</div><div class="day-activities"><div class="section-heading"><h3>Atividades do dia</h3><small>${days[selected].acts.length} paradas</small></div>${activityList()}</div><aside class="day-notes"><h3>Notas do dia</h3>${note()}${tripButton('Ver notas gerais')}</aside></section>`; }
function panorama() {
  const c=city(), d=days[selected];
  return `${header()}<main id="conteudo" class="shell panorama" tabindex="-1">${heading('NOSSO ROTEIRO · DEZEMBRO 2026','Um mapa. Todos os planos.', '<span class="heading-tag">14 dias para ir junto</span>')}<section class="panorama-map"><div class="map-intro"><span class="eyebrow">${c?'PARADA SELECIONADA':'DIA DE VIAGEM'}</span><h2>${c?.name||d.city}</h2><p>${c?.country||d.country}</p><div class="intro-art">${art(c?.kind||d.kind)}</div><span class="intro-dates">${c?.dates||dateLabel()}</span><p class="map-tip">Escolha a cidade no mapa.<br>O roteiro aparece aqui embaixo.</p></div>${map()}</section>${cityDates()}<section class="week-section"><div class="section-heading"><h2>Uma semana de cada vez</h2>${weekToggle()}</div>${weekStrip()}</section>${dayPanel()}${footer()}</main>`;
}
function sideBySide() {
  const c=city(),d=days[selected];
  return `${header()}<main id="conteudo" class="shell split-shell" tabindex="-1">${heading('CIDADES NO MAPA, PLANOS NO PAPEL','Por onde vamos hoje?', dayPicker())}<div class="split-layout"><section class="split-map-panel"><div class="split-map-heading"><span class="eyebrow">NOSSA ROTA</span><span>10 cidades · 2 países</span></div>${map()}<div class="split-city"><div><span class="eyebrow">${c?.country||d.country}</span><h2>${c?.name||d.city}</h2>${cityDates()}</div><div class="split-city-art">${art(c?.kind||d.kind)}</div></div><p class="split-city-tip">${c?.note||d.note}</p></section><section class="split-agenda"><div class="section-heading"><h2>Agenda</h2>${weekToggle()}</div>${weekStrip(false)}<div class="split-date-heading"><div><span class="eyebrow">${dateLabel()}</span><h2>${d.city}</h2></div>${arrows()}</div><div class="section-heading"><h3>Atividades do dia</h3><small>${d.acts.length} paradas</small></div>${activityList()}${stay()}<div class="split-note">${note()}</div><div class="split-route">${icon('car')} ${d.route}</div></section></div>${footer()}</main>`;
}
function byCity() {
  const c=city(),d=days[selected];
  if(view==='cidade') return `${header()}<main id="conteudo" class="shell city-page" tabindex="-1"><nav class="breadcrumb" aria-label="Localização"><a href="${url('index.html')}">${icon('left')} Todas as cidades</a><span>/</span><span>${c?.name||d.city}</span></nav><div class="city-banner"><div><span class="eyebrow">${c?.country||d.country} · ${c?.dates||dateLabel()}</span><h1>${c?.name||d.city}<span>.</span></h1><p>${c?.note||d.title}</p></div><div class="city-banner-art">${art(c?.kind||d.kind)}</div></div><div class="city-page-controls">${cityDates()}${dayPicker()}</div><div class="city-page-layout"><section class="city-day-plan"><div class="city-plan-heading"><div><span class="eyebrow">${dateLabel()}</span><h2>${d.city}</h2></div>${arrows()}</div><div class="section-heading"><h3>Atividades do dia</h3><small>${d.acts.length} paradas</small></div>${activityList()}<div class="city-day-bottom"><span class="route">${icon('pin')}${d.route}</span>${stay()}</div></section><aside class="city-notebook"><span class="eyebrow">LEVAR NA MEMÓRIA</span><h2>Notas para a parada</h2>${note()}${c?`<button class="city-note-link" data-notes="city">${icon('note')} Sobre ${c.name} ${icon('arrow')}</button>`:''}${tripButton('Notas gerais da viagem')}<a class="back-map" href="${url('index.html')}">${icon('pin')} Escolher outra cidade</a></aside></div>${footer()}</main>`;
  return `${header()}<main id="conteudo" class="shell city-home" tabindex="-1">${heading('CADA CIDADE, UM PEQUENO CAPÍTULO','A viagem começa por onde?', '<span class="heading-tag">Um toque na cidade abre os planos.</span>')}<div class="city-index-layout"><section class="city-index-map">${map(true)}<div class="travel-links"><a href="${url('cidade.html',3,0,'')}">${icon('plane')}<span>02 dez<strong>Ida para a Bélgica</strong></span>${icon('arrow')}</a><a href="${url('cidade.html',3,13,'bruxelas')}">${icon('plane')}<span>15 dez<strong>Volta para o Brasil</strong></span>${icon('arrow')}</a></div></section><section class="city-directory"><div class="section-heading"><h2>Nossas paradas</h2><small>dezembro</small></div>${[...cities].sort((a,b)=>a.primary-b.primary).map(c=>`<a class="city-directory-link" href="${url('cidade.html',3,c.primary,c.id)}"><span class="directory-icon">${icon(c.kind)}</span><span><strong>${c.name}</strong><small>${c.dates}</small></span>${icon('arrow')}</a>`).join('')}</section></div><p class="uncertain-note">${icon('note')}Datas com interrogação ainda estão em aberto. Hospedagens e horários precisam de confirmação.</p>${footer()}</main>`;
}
function notebook() {
  const start=selected<7?0:7;
  return `${header()}<main id="conteudo" class="shell notebook" tabindex="-1">${heading('DEZEMBRO, DIA POR DIA','Nosso caderno de viagem.',weekToggle())}<div class="notebook-layout"><section class="journal-list" aria-label="Agenda em sequência">${days.slice(start,start+7).map((d,n)=>{const i=start+n;return `<article class="journal-day ${selected===i?'active':''}" id="dia-${d.date}"><button class="journal-day-heading" data-day="${i}" aria-expanded="${selected===i}" aria-controls="plano-${d.date}"><span class="journal-date"><strong>${String(d.date).padStart(2,'0')}</strong><small>${d.week}</small></span><span class="journal-city"><strong>${d.city}</strong><small>${d.tag}</small></span><span class="journal-count">${d.acts.length} atividades</span>${icon(selected===i?'pin':'arrow')}</button><div id="plano-${d.date}" ${selected===i?'':'hidden'}>${selected===i?`<div class="journal-day-content"><div class="journal-activities"><h2 class="sr-only">Atividades de ${d.city}</h2>${activityList(i)}${stay(i)}</div><div class="journal-doodle">${art(d.kind)}</div></div>`:''}</div></article>`}).join('')}</section><aside class="journal-sidebar"><details class="journal-map" ${journalMapOpen?'open':''}><summary>${icon('pin')}Escolher pelo mapa<span>+</span></summary>${map()}${cityDates()}</details><section class="journal-note"><div class="note-clip" aria-hidden="true"></div><span class="eyebrow">${dateLabel()}</span><h2>Não esquecer</h2>${note()}${tripButton('Notas do grupo')}</section><p class="sidebar-hint">O mapa troca a cidade.<br>O caderno mostra o dia.</p></aside></div>${footer()}</main>`;
}
function focusedDay() {
  const d=days[selected];
  return `${header()}<main id="conteudo" class="focus-shell" tabindex="-1"><div class="focus-top"><span class="eyebrow">14 DIAS JUNTOS · DEZEMBRO 2026</span><span class="focus-count">${String(selected+1).padStart(2,'0')} / 14</span></div><section class="focus-card"><details id="focus-map" ${mapOpen?'open':''}><summary>${icon('pin')}<span>Escolher cidade no mapa<small>${city()?.name||d.city} selecionada</small></span><span class="expand-mark">+</span></summary>${map()}<div class="focus-city-dates">${cityDates()}</div></details><div class="focus-heading"><div><span class="eyebrow">${dateLabel()}</span><h1>${d.city}</h1><p>${d.tag}</p></div><div class="focus-art">${art(d.kind)}</div></div><div class="focus-calendar">${weekToggle()}${weekStrip(false)}</div><div class="focus-activities"><div class="section-heading"><h2>Atividades do dia</h2><small>${d.acts.length} paradas</small></div>${activityList()}${stay()}</div><div class="focus-note">${note()}</div><div class="focus-bottom">${dayPicker()}${arrows()}</div></section><div class="focus-footer">${tripButton('Notas da viagem')}<small>Roteiro provisório · horários ilustrativos</small></div></main>`;
}
function routeAndAgenda() {
  if(view==='agenda'){
    const start=Math.min(11,Math.max(0,selected-1));
    return `${header()}<main id="conteudo" class="shell three-days" tabindex="-1">${heading('O PLANO, SEM PROCURAR','Agenda da viagem',dayPicker())}<div class="agenda-toolbar">${arrows()}<a href="${url('rota.html')}">${icon('pin')} Ver cidade na rota ${icon('arrow')}</a></div><div class="three-day-grid">${days.slice(start,start+3).map((d,n)=>{const i=start+n;return `<section class="day-column ${i===selected?'active':''}"><button class="column-heading" data-day="${i}" aria-pressed="${i===selected}"><span class="column-date"><strong>${String(d.date).padStart(2,'0')}</strong><small>${d.week} · dezembro</small></span><span class="column-art">${art(d.kind)}</span><strong class="column-city">${d.city}</strong><span class="column-tag">${d.tag}</span></button><div class="column-plan"><h2 class="sr-only">Atividades de ${d.city}, dia ${d.date}</h2>${activityList(i)}${stay(i)}</div><div class="column-note">${note(i)}</div><a class="column-map" href="${url('rota.html',6,i,dayCities[i])}">${icon('pin')} Ver na rota ${icon('arrow')}</a></section>`;}).join('')}</div><div class="agenda-reminder">${icon('note')}As três colunas acompanham o dia selecionado. Troque a data para ver o restante da viagem.</div>${footer()}</main>`;
  }
  const c=city(),d=days[selected];
  return `${header()}<main id="conteudo" class="shell route-home" tabindex="-1">${heading('UM INVERNO ENTRE AMIGOS','A próxima parada é nossa.', '<div class="route-stamp">BE + NL<small>DEZ 2026</small></div>')}<div class="route-instruction"><span>01</span><p>Escolha a cidade.</p><span>02</span><p>Abra a agenda.</p></div>${map(false,true)}<section class="route-selection"><div class="route-selection-art">${art(c?.kind||d.kind)}</div><div class="route-selection-title"><span class="eyebrow">${c?.country||d.country}</span><h2>${c?.name||d.city}</h2>${cityDates()}</div><p>${c?.note||d.note}</p><a class="primary-link" href="${url('agenda.html')}">Ver agenda ${icon('arrow')}</a></section><div class="route-overview"><div class="section-heading"><h2>Ou vá direto para um dia</h2>${weekToggle()}</div>${weekStrip(false)}</div>${footer()}</main>`;
}
function render() {
  document.body.className=`variant-${variant} view-${view}`;
  const layouts = [panorama, sideBySide, byCity, notebook, focusedDay, routeAndAgenda];
  document.getElementById('app').innerHTML=(layouts[variant-1] || panorama)();
  document.title=`${variant}. ${names[variant-1]} · rodada 2 · de férias`;
  document.getElementById('comparador').innerHTML=`<a class="compare-arrow" href="${url('index.html',variant===1?6:variant-1)}" aria-label="Variante anterior">${icon('left')}</a><div class="compare-name"><small>RODADA 2 · ${variant}/6</small><strong>${names[variant-1]}</strong></div><div class="compare-numbers">${names.map((name,n)=>`<a href="${url('index.html',n+1)}" ${variant===n+1?'aria-current="page"':''} aria-label="${n+1}. ${name}">${n+1}</a>`).join('')}</div><a class="compare-arrow" href="${url('index.html',variant===6?1:variant+1)}" aria-label="Próxima variante">${icon('arrow')}</a><a class="previous-round" href="../index.html?variant=6&day=${days[selected].date}">Rodada 1 ${icon('arrow')}</a>`;
  document.getElementById('status').textContent=`${city()?.name||days[selected].city}. ${dateLabel()}. ${days[selected].acts.length} atividades. Roteiro provisório.`;
  document.querySelectorAll('.week-strip').forEach(el=>{const active=el.querySelector('[aria-pressed="true"]');if(active) el.scrollLeft=active.offsetLeft-el.offsetLeft-(el.clientWidth-active.clientWidth)/2;});
}
function selectDay(i, keepCity = false, push = true) {
  selected=Math.max(0,Math.min(13,i));
  if (!keepCity || !city()?.days.includes(selected)) cityId=dayCities[selected];
  if(push)saveState();
  render();
}
function selectCity(id) {
  const c=cities.find(c=>c.id===id);
  if(!c) return;
  cityId=id;
  if(!c.days.includes(selected)) selected=c.primary;
  saveState();render();
}
function openDialog(title, content) {
  document.getElementById('dialog-content').innerHTML=`<div class="dialog-heading"><h2 id="titulo-dialogo">${title}</h2><button data-close aria-label="Fechar">${icon('close')}</button></div>${content}`;
  dialog.showModal();
}
function focusAfterChange(button) {
  const attrs=['data-city','data-day','data-week','data-step'];
  const attr=attrs.find(a=>button.hasAttribute(a));
  const candidate=attr?document.querySelector(`button[${attr}="${button.getAttribute(attr)}"]:not(:disabled)`):null;
  (candidate||document.querySelector('#conteudo')).focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const a=b.dataset;
  if('city' in a){selectCity(a.city);focusAfterChange(b);}
  if('day' in a){selectDay(Number(a.day),'keepCity' in a);focusAfterChange(b);}
  if('week' in a){selectDay(Number(a.week));focusAfterChange(b);}
  if('step' in a){selectDay(selected+Number(a.step));focusAfterChange(b);}
  if('close' in a)dialog.close();
  if('activity' in a){
    const i=Number(a.activityDay), activity=days[i].acts[Number(a.activity)];
    openDialog(activity[1],`<div class="dialog-art">${art(activity[2])}</div><span class="eyebrow">${dateLabel(i)} · ${activity[0]}</span><p class="detail-text">${activity[3]}</p><p class="notice">Horários ilustrativos. Confirmar antes da viagem.</p>`);
  }
  if(a.notes==='place'){
    const i=Number(a.noteDay),d=days[i];
    openDialog(`Notas de ${d.city}`,`<span class="eyebrow">${dateLabel(i)}</span><p class="detail-text">${d.note}</p>${stay(i)}<p class="notice">Plano provisório. Confirmar horários e reservas com o grupo.</p>`);
  }
  if(a.notes==='city'){
    const c=city();openDialog(`Notas de ${c.name}`,`<span class="eyebrow">${c.dates}</span><p class="detail-text">${c.note}</p><p class="notice">As datas com interrogação ainda dependem da decisão do grupo.</p>`);
  }
  if(a.notes==='trip') openDialog('Notas da viagem',`<span class="eyebrow">BÉLGICA & PAÍSES BAIXOS · 02 A 15 DEZ</span><div class="trip-notes"><section>${icon('bed')}<div><h3>Hospedagem</h3><p>Reservar hotel em Bruges e a última noite em Bruxelas.</p></div></section><section>${icon('star')}<div><h3>Mercados e cavernas</h3><p>Confirmar calendário de Natal de 2026 e ingressos de Valkenburg.</p></div></section><section>${icon('people')}<div><h3>Encontros com amigos</h3><p>Combinar os dias em Maastricht, Veldhoven, Helmond e Asten.</p></div></section><section>${icon('note')}<div><h3>O que está em aberto</h3><p>Gante ou mais um dia em Bruges? Algumas datas do roteiro original divergem. Aqui usamos o quadro geral, ainda sujeito a confirmação.</p></div></section></div><p class="notice">Protótipo de leitura. Sem edição ou reservas.</p>`);
});
document.addEventListener('change',e=>{if(e.target.id==='day-picker'){selectDay(Number(e.target.value));document.getElementById('day-picker')?.focus({preventScroll:true});}});
document.addEventListener('toggle',e=>{
  if(!e.target.isConnected)return;
  if(e.target.id==='focus-map') mapOpen=e.target.open;
  if(e.target.classList.contains('journal-map')) journalMapOpen=e.target.open;
},true);
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
window.addEventListener('popstate',()=>{readState();render();});
document.addEventListener('keydown',e=>{
  if(dialog.open||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    e.preventDefault();location.href=url('index.html',(variant-1+(e.key==='ArrowRight'?1:5))%6+1);
  }
});
readState();render();
