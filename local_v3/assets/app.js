(() => {
  const KEY = 'taxi_bonus_free_osm_v2';
  const DEFAULT_CITY = 'станица Новоминская, Краснодарский край';
  const DEFAULT_COUNTRY = 'Россия';
  const YANDEX_KEY_STORAGE = 'taxi_bonus_yandex_api_key';
  const GOOGLE_KEY_STORAGE = 'taxi_bonus_google_api_key';
  let googleMapsPromise = null;
  const DEFAULT_REGION_BIAS = 'Краснодарский край, Каневской район, станица Новоминская';
  let mapCounter = 1;
  const geocodeCache = {};
  const routeCache = {};
  const COORD_KEY = 'taxi_bonus_manual_coords_v1';
  let manualCoords = {};
  try { manualCoords = JSON.parse(localStorage.getItem(COORD_KEY)||'{}') || {}; } catch(e){ manualCoords = {}; }
  function coordKey(addr){ return String(addr||'').trim().toLowerCase(); }
  function saveManualCoord(addr, pt){ const k=coordKey(addr); if(!k) return; manualCoords[k] = {lat:Number(pt.lat), lon:Number(pt.lon)}; localStorage.setItem(COORD_KEY, JSON.stringify(manualCoords)); geocodeCache[k] = manualCoords[k]; Object.keys(routeCache).forEach(x=>delete routeCache[x]); }
  function getManualCoord(addr){ return manualCoords[coordKey(addr)] || null; }
  const USERS = [
    {id:1, name:'Директор', login:'admin', password:'admin123', role:'director'},
    {id:2, name:'Диспетчер', login:'disp', password:'disp123', role:'dispatcher'},
    {id:3, name:'driver1', login:'driver1', password:'driver123', role:'driver', driverId:1},
    {id:4, name:'driver2', login:'driver2', password:'driver123', role:'driver', driverId:2},
  ];
  const initial = {
    currentUser:null, active:'dashboard', nextOrderId:1025,
    drivers:[
      {id:1,name:'driver1',phone:'+7 900 111-11-11',car:'KIA Rio',plate:'X123XX 777',status:'online'},
      {id:2,name:'driver2',phone:'+7 900 222-22-22',car:'Hyundai Solaris',plate:'Y456YY 777',status:'offline'},
    ],
    clients:[{id:1,name:'Иванов И.И.',phone:'+7 918 454-62-32'}],
    orders:[
      {id:1024,status:'new',driverId:1,client:'Иванов И.И.',phone:'89184546232',from:'ул. Ленина 10',fromNote:'Подъезд 2',to:'ТЦ Мега',toNote:'Парковка у входа',price:350,payment:'Наличные',time:'14:25',stage:'new'},
      {id:1023,status:'way',driverId:2,client:'Петров П.П.',phone:'89180000000',from:'ул. Пушкина 5',to:'Аэропорт',price:550,payment:'Карта',time:'14:10',stage:'to_client'},
      {id:1022,status:'done',driverId:1,client:'Сидоров С.С.',phone:'89005554433',from:'ул. Мира 3',to:'ЖД вокзал',price:420,payment:'Наличные',time:'14:05',stage:'done'},
    ],
    messages:[{from:'driver1',text:'Принял заказ #1024'},{from:'Диспетчер',text:'Хорошо, удачи!'}]
  };
  let state = load();
  const app = document.getElementById('app');

  function load(){
    try { return {...structuredClone(initial), ...JSON.parse(localStorage.getItem(KEY)||'{}')}; }
    catch(e){ return structuredClone(initial); }
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
  function set(mut){ mut(state); save(); render(); }
  function user(){ return state.currentUser; }
  function role(){ return user()?.role; }
  function driverOrders(){ return state.orders.filter(o => o.driverId === user()?.driverId && o.status !== 'done' && o.status !== 'cancel'); }
  function activeOrder(){ return driverOrders()[0] || null; }
  function statusLabel(s){ return {new:'Новый', way:'В пути', done:'Выполнен', cancel:'Отменён'}[s] || s; }
  function statusClass(s){ return {new:'b-new', way:'b-way', done:'b-done', cancel:'b-cancel'}[s] || ''; }
  function rub(n){ return Number(n||0).toLocaleString('ru-RU') + ' ₽'; }
  function speak(text){ try{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang='ru-RU'; speechSynthesis.speak(u); }catch(e){} }

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function normalizeAddress(addr){
    return String(addr||'')
      .replace(/\bст\.?\s*/gi, 'станица ')
      .replace(/\bул\.?\s*/gi, 'улица ')
      .replace(/\bпр-т\.?\s*/gi, 'проспект ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function addressQuery(addr){
    const v = normalizeAddress(addr);
    if(!v) return '';
    const lower = v.toLowerCase();
    const hasRegion = lower.includes('россия') || lower.includes('край') || lower.includes('область') || lower.includes('москва') || lower.includes('санкт');
    return hasRegion ? v : `${v}, ${DEFAULT_CITY}, ${DEFAULT_COUNTRY}`;
  }
  function debounce(fn, ms=450){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }


  function googleKey(){ return ''; }
  function setGoogleKey(value){}
  function yandexKey(){ return ''; }
  function setYandexKey(value){}
  async function googleSuggest(value){ return []; }
  async function googleGeocode(addr, placeId){ throw new Error('google disabled'); }
  async function yandexSuggest(value){ return []; }
  async function yandexGeocode(addr){ throw new Error('yandex disabled'); }

  function parseStreetHouse(value){
    const t = normalizeAddress(value).toLowerCase();
    const house = (t.match(/(?:дом\s*)?(\d+[а-яa-z\-/]*)\b/i)||[])[1] || '';
    const streets = [
      ['кубанская', 46.3169, 38.9582], ['космонавтов', 46.3138, 38.9497], ['ленина', 46.3192, 38.9558],
      ['пушкина', 46.3224, 38.9614], ['мира', 46.3118, 38.9648], ['садовая', 46.3173, 38.9672],
      ['советская',46.3141,38.9521], ['школьная',46.3201,38.9492], ['октябрьская',46.3155,38.9469],
      ['первомайская',46.3188,38.9615], ['гагарина',46.3129,38.9548], ['южная',46.3098,38.9584],
      ['северная',46.3232,38.9560], ['западная',46.3177,38.9428], ['восточная',46.3179,38.9721]
    ];
    const st = streets.find(x => t.includes(x[0]));
    if(!st) return null;
    const n = parseInt(house,10) || 1;
    const side = n % 2 ? 1 : -1;
    const step = Math.min(n, 220) * 0.000018;
    return {street: st[0][0].toUpperCase()+st[0].slice(1), house: house || '', lat: st[1] + side * 0.00011 + step, lon: st[2] + step * 1.7, confidence: house ? 'локальная улица + номер дома' : 'локальная улица'};
  }
  function smartLocalCandidate(value){
    const parsed = parseStreetHouse(value);
    if(!parsed) return null;
    const title = `Ст. Новоминская, ул. ${parsed.street}${parsed.house ? ', '+parsed.house : ''}`;
    return {title, subtitle:`${DEFAULT_REGION_BIAS}, Россия · ${parsed.confidence}`, lat:parsed.lat, lon:parsed.lon, source:'Умный локальный поиск'};
  }
  async function yandexSuggest(value){
    const key = yandexKey();
    if(!key) return [];
    const text = addressQuery(value);
    const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${encodeURIComponent(key)}&text=${encodeURIComponent(text)}&lang=ru_RU&types=geo&print_address=1&results=7&bbox=38.72,46.18~39.15,46.45&strict_bounds=0`;
    const data = await fetchJson(url);
    return (data.results||[]).map(x => ({title: x.title?.text || x.subtitle?.text || text, subtitle: x.subtitle?.text || x.address?.formatted_address || x.title?.text || text, source:'Яндекс'}));
  }
  async function yandexGeocode(addr){
    const key = yandexKey();
    if(!key) throw new Error('no yandex key');
    const url = `https://geocode-maps.yandex.ru/v1/?apikey=${encodeURIComponent(key)}&geocode=${encodeURIComponent(addressQuery(addr))}&format=json&lang=ru_RU&results=1&bbox=38.72,46.18~39.15,46.45&rspn=0`;
    const data = await fetchJson(url);
    const obj = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    const pos = obj?.Point?.pos;
    if(!pos) throw new Error('yandex not found');
    const [lon, lat] = pos.split(' ').map(Number);
    return {lat, lon, title:obj.name, subtitle:obj.description, source:'Яндекс'};
  }

  function localAddressSuggestions(value){
    const q = normalizeAddress(value).toLowerCase();
    if(q.length < 2) return [];
    const city = 'станица Новоминская, Каневской район, Краснодарский край, Россия';
    const local = [
      ['Ст. Новоминская, ул. Кубанская, 15','ул. Кубанская, 15',46.3169,38.9582],
      ['Ст. Новоминская, ул. Космонавтов, 191','ул. Космонавтов, 191',46.3138,38.9497],
      ['Ст. Новоминская, ул. Ленина, 10','ул. Ленина, 10',46.3192,38.9558],
      ['Ст. Новоминская, ул. Пушкина, 5','ул. Пушкина, 5',46.3224,38.9614],
      ['Ст. Новоминская, ул. Мира, 3','ул. Мира, 3',46.3118,38.9648],
      ['ТЦ Мега, Ст. Новоминская','ТЦ Мега',46.3181,38.9709],
      ['Аэропорт, Краснодарский край','Аэропорт',45.0360,39.1390],
      ['ЖД вокзал, Ст. Новоминская','ЖД вокзал',46.3099,38.9441],
      ['Больница, Ст. Новоминская','Больница',46.3151,38.9662],
      ['Парк Центральный, Ст. Новоминская','Парк Центральный',46.3205,38.9525]
    ];
    const found = local.filter(x => (x[0]+' '+x[1]).toLowerCase().includes(q) || q.split(/\s+/).every(w => (x[0]+' '+x[1]).toLowerCase().includes(w)))
      .slice(0,5).map(x => ({title:x[0], subtitle:city, lat:x[2], lon:x[3], source:'Локальная база'}));
    const smart = smartLocalCandidate(value);
    if(smart && !found.length) found.push({...smart, title: smart.title + ' (примерно)', subtitle: smart.subtitle + ' · перетащите метку на карте для точности'});
    return found;
  }
  async function fetchJson(url){
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('network');
    return res.json();
  }
  async function searchAddressSuggestions(value){
    const query = addressQuery(value);
    if(query.length < 4) return [];
    const local = localAddressSuggestions(value);
    const out = [...local];
    const seen = new Set(out.map(x=>`${x.lat.toFixed(5)},${x.lon.toFixed(5)}`));
    const add = item => {
      const key = `${Number(item.lat).toFixed(5)},${Number(item.lon).toFixed(5)}`;
      if(seen.has(key)) return;
      seen.add(key); out.push(item);
    };
    try{
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=ru&q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url);
      data.forEach(x => add({title:x.display_name.split(',').slice(0,2).join(', '), subtitle:x.display_name, lat:Number(x.lat), lon:Number(x.lon), source:'OpenStreetMap'}));
    }catch(e){}
    try{
      const url = `https://photon.komoot.io/api/?limit=7&lang=ru&q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url);
      (data.features||[]).forEach(f => {
        const p=f.properties||{}, c=f.geometry?.coordinates||[];
        const title=[p.name,p.street,p.housenumber].filter(Boolean).join(', ') || p.city || 'Адрес';
        const sub=[p.city,p.state,p.country].filter(Boolean).join(', ');
        if(c.length>=2) add({title, subtitle:sub, lat:Number(c[1]), lon:Number(c[0]), source:'Photon'});
      });
    }catch(e){}
    return out.slice(0,8);
  }
  function initAddressAutocomplete(){
    document.querySelectorAll('input[data-address-autocomplete]:not([data-auto-ready])').forEach(input => {
      input.dataset.autoReady = '1';
      const wrap = document.createElement('div');
      wrap.className = 'address-auto-wrap ytaxi-search';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const list = document.createElement('div');
      list.className = 'address-suggestions';
      wrap.appendChild(list);
      let lastItems = [];
      const select = it => {
        input.value = it.title;
        input.dataset.lat = it.lat; input.dataset.lon = it.lon;
        geocodeCache[input.value.trim().toLowerCase()] = {lat:Number(it.lat), lon:Number(it.lon)};
        list.classList.remove('show');
        routePreviewFromForm(true);
      };
      const show = items => {
        lastItems = items;
        if(!items.length){ list.innerHTML = '<div class="suggestion muted">Адрес не найден в онлайн-базе. Нажмите Enter — сайт построит примерную точку по улице и номеру дома.</div>'; list.classList.add('show'); return; }
        list.innerHTML = items.map((it,i)=>`<button type="button" data-i="${i}"><b>📍 ${esc(it.title)}</b><span>${esc(it.subtitle||it.title)}</span><em>${esc(it.source||'поиск')}</em></button>`).join('');
        list.classList.add('show');
        list.querySelectorAll('button').forEach(btn => btn.onclick = () => select(lastItems[Number(btn.dataset.i)]));
      };
      const run = debounce(async () => {
        const v = input.value.trim();
        delete input.dataset.lat; delete input.dataset.lon;
        if(v.length < 3){ list.classList.remove('show'); return; }
        list.innerHTML = '<div class="suggestion muted">Ищу адрес: локальная база + OpenStreetMap + Photon...</div>'; list.classList.add('show');
        const items = await searchAddressSuggestions(v);
        show(items);
      }, 420);
      input.addEventListener('input', () => { run(); routePreviewFromForm(); });
      input.addEventListener('focus', () => { if(list.innerHTML) list.classList.add('show'); });
      input.addEventListener('keydown', e => { if(e.key==='Enter'){ const smart=smartLocalCandidate(input.value); if(lastItems[0] && list.classList.contains('show')){ e.preventDefault(); select(lastItems[0]); } else if(smart){ e.preventDefault(); select(smart); } }});
      document.addEventListener('click', e => { if(!wrap.contains(e.target)) list.classList.remove('show'); });
    });
  }
  function routeSeed(text){ let h=0; for(const ch of String(text||'')) h=(h*31+ch.charCodeAt(0))>>>0; return h; }
  const KNOWN_POINTS = [
    ['ленина',18,73], ['пушкина',29,28], ['мира',44,66], ['садовая',72,39], ['советская',63,80],
    ['мега',86,25], ['аэропорт',88,18], ['вокзал',14,18], ['больница',77,77], ['галерея',52,22],
    ['центр',50,50], ['парк',24,84], ['университет',35,43], ['рынок',68,58]
  ];
  function addressPoint(addr){
    const text = String(addr||'').toLowerCase();
    const known = KNOWN_POINTS.find(p => text.includes(p[0]));
    if(known) return {x:known[1], y:known[2]};
    const seed = routeSeed(text);
    return {x:14 + (seed % 72), y:16 + ((seed >> 8) % 68)};
  }
  function snap(v, arr){ return arr.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a, arr[0]); }
  function makeRoute(from,to){
    const a = addressPoint(from), b = addressPoint(to);
    const xs = [12,24,36,48,60,72,84,92], ys = [16,28,40,52,64,76,88];
    const ay = snap(a.y, ys), by = snap(b.y, ys), midX = snap((a.x+b.x)/2, xs);
    const pts = [a, {x:a.x,y:ay}, {x:midX,y:ay}, {x:midX,y:by}, {x:b.x,y:by}, b];
    const clean = pts.filter((p,i,arr)=> i===0 || Math.abs(p.x-arr[i-1].x)>1 || Math.abs(p.y-arr[i-1].y)>1);
    const d = clean.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const km = Math.max(1.2, Math.round(clean.slice(1).reduce((sum,p,i)=>sum + Math.hypot(p.x-clean[i].x,p.y-clean[i].y),0)*0.105*10)/10);
    const min = Math.max(5, Math.round(km*3.4 + (routeSeed(from+'|'+to)%6)));
    return {a,b,d,km,min};
  }
  function routeMetrics(from,to){ const r=makeRoute(from,to); return {km:r.km,min:r.min}; }
  function offlineCitySvg(from,to,stage){
    const r = makeRoute(from,to);
    const minorRoads = [
      ['M3 16 L97 16'],['M4 30 L96 27'],['M2 44 L98 46'],['M5 58 L95 57'],['M3 72 L97 74'],['M4 88 L96 86'],
      ['M10 4 L13 96'],['M24 3 L22 98'],['M38 4 L41 96'],['M54 3 L52 98'],['M68 2 L70 98'],['M84 4 L82 96'],
      ['M0 38 C20 32 39 35 58 28 S82 22 100 27'],['M0 64 C22 60 38 68 55 63 S79 53 100 58'],
      ['M18 100 C26 80 23 67 33 51 S47 28 43 0'],['M78 100 C73 84 85 73 79 57 S65 34 73 0']
    ].map(d=>`<path class="osm-road minor" d="${d[0]}"/>`).join('');
    const majorRoads = [
      ['M0 52 C18 49 33 51 49 47 S78 40 100 42'],
      ['M6 8 C25 10 43 12 60 9 S84 5 100 9'],
      ['M47 0 C50 14 48 30 51 44 S59 70 55 100'],
      ['M91 0 C87 19 90 34 87 52 S90 75 83 100']
    ].map(d=>`<path class="osm-road major" d="${d[0]}"/>`).join('');
    const blocks = Array.from({length:84}, (_,i)=>{
      const x=4+(i*17%91), y=7+(i*29%84), w=3.6+(i%5)*1.1, h=2.2+((i+2)%4)*1.15;
      const rot=((i%7)-3)*1.5;
      return `<rect class="osm-building" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx=".45" transform="rotate(${rot} ${x+w/2} ${y+h/2})"/>`;
    }).join('');
    const labels = [
      ['ул. Ленина',18,69,-3],['пр-т Мира',44,49,-8],['Садовая ул.',61,38,-5],['Пушкина ул.',27,29,-2],['Вокзальная ул.',16,17,1],['ТЦ Мега',84,24,0],['Аэропорт',87,16,0],['парк Центральный',21,84,0],['река',74,47,64]
    ].map(l=>`<text class="osm-label" x="${l[1]}" y="${l[2]}" transform="rotate(${l[3]} ${l[1]} ${l[2]})">${l[0]}</text>`).join('');
    const pois = [
      ['P',21,84,'park'],['ТЦ',86,25,'mall'],['✈',88,18,'air'],['ЖД',14,18,'rail'],['+',77,77,'med']
    ].map(p=>`<g class="poi ${p[3]}"><circle cx="${p[1]}" cy="${p[2]}" r="2.1"/><text x="${p[1]}" y="${p[2]+.8}">${p[0]}</text></g>`).join('');
    return `<svg class="city-svg true-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Офлайн карта города с маршрутом">
      <defs>
        <pattern id="mapNoise" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" stroke="#202832" stroke-width=".18" opacity=".38"/></pattern>
        <filter id="routeGlow"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect class="osm-land" width="100" height="100"/><rect width="100" height="100" fill="url(#mapNoise)" opacity=".65"/>
      <path class="osm-water" d="M70 -8 C63 10 79 20 76 36 C73 52 83 59 79 75 C76 87 84 96 80 108 L103 108 L103 -8 Z"/>
      <path class="osm-park" d="M8 76 C18 70 31 72 38 80 C33 93 18 98 7 91 Z"/><path class="osm-park" d="M55 10 C63 5 75 7 79 15 C75 22 61 23 54 18 Z"/>
      ${blocks}${minorRoads}${majorRoads}
      <path class="route-casing" d="${r.d}"/><path class="route-path" d="${r.d}" filter="url(#routeGlow)"/>
      <circle class="point-start" cx="${r.a.x}" cy="${r.a.y}" r="3.2"/><circle class="point-finish" cx="${r.b.x}" cy="${r.b.y}" r="3.2"/>
      <text class="point-letter" x="${r.a.x}" y="${r.a.y+1.2}">A</text><text class="point-letter" x="${r.b.x}" y="${r.b.y+1.2}">B</text>
      ${pois}${labels}
      <image href="assets/icon-taxi.svg" width="8" height="8" x="-4" y="-4" class="taxi-on-route"><animateMotion dur="8s" repeatCount="indefinite" path="${r.d}" rotate="auto"/></image>
    </svg>`;
  }
  function latLonToTile(lat, lon, z){
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return {x,y,z};
  }
  function guessCoords(text){
    const q = String(text||'').toLowerCase();
    if(q.includes('москва') || q.includes('ленина') || q.includes('мега')) return [55.7558, 37.6173];
    if(q.includes('санкт') || q.includes('петербург') || q.includes('спб')) return [59.9386, 30.3141];
    if(q.includes('казан')) return [55.7961, 49.1064];
    if(q.includes('екатерин')) return [56.8389, 60.6057];
    if(q.includes('новосибир')) return [55.0302, 82.9204];
    if(q.includes('краснодар')) return [45.0355, 38.9753];
    if(q.includes('ростов')) return [47.2225, 39.7187];
    if(q.includes('сочи')) return [43.5855, 39.7231];
    if(q.includes('самар')) return [53.1959, 50.1008];
    if(q.includes('уфа')) return [54.7388, 55.9721];
    return [55.7558, 37.6173];
  }
  function osmTileLayer(from,to){
    const a=guessCoords(from), b=guessCoords(to); const lat=(a[0]+b[0])/2, lon=(a[1]+b[1])/2, z=12;
    const c=latLonToTile(lat,lon,z); let imgs='';
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const x=c.x+dx, y=c.y+dy;
      imgs += `<img class="osm-tile" style="left:%;top:%" src="assets/osm/tiles///.png" onerror="this.style.display='none'" alt="">`;
    }
    return `<div class="osm-tile-layer" aria-hidden="true"><div class="osm-missing-note">Положите OSM-тайлы РФ в assets/osm/tiles/{z}/{x}/{y}.png</div></div>`;
  }

  function knownCoords(addr){
    const manual = getManualCoord(addr);
    if(manual) return manual;
    const q = String(addr||'').toLowerCase();
    const points = [
      ['мега',46.3181,38.9709], ['аэропорт',45.0360,39.1390], ['вокзал',46.3099,38.9441],
      ['больница',46.3151,38.9662], ['галерея',46.3180,38.9630], ['центр',46.3175,38.9578],
      ['парк',46.3205,38.9525], ['университет',46.3125,38.9603], ['рынок',46.3213,38.9590]
    ];
    const found = points.find(p => q.includes(p[0]));
    return found ? {lat:found[1], lon:found[2]} : null;
  }
  async function geocodeAddress(addr){
    const key = String(addr||'').trim().toLowerCase();
    if(geocodeCache[key]) return geocodeCache[key];
    const known = knownCoords(addr);
    if(known) return geocodeCache[key] = known;
    const query = encodeURIComponent(addressQuery(addr));
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ru&q=${query}`;
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    if(!data.length){ const smart = smartLocalCandidate(addr); if(smart) return geocodeCache[key] = {lat:Number(smart.lat), lon:Number(smart.lon), approximate:true}; throw new Error('address not found'); }
    return geocodeCache[key] = {lat:Number(data[0].lat), lon:Number(data[0].lon)};
  }
  async function osrmRoute(from,to){
    const key = `${from}|${to}`.toLowerCase();
    if(routeCache[key]) return routeCache[key];
    const a = await geocodeAddress(from), b = await geocodeAddress(to);
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('route failed');
    const data = await res.json();
    if(data.code !== 'Ok' || !data.routes?.length) throw new Error('route not found');
    return routeCache[key] = {a,b, route:data.routes[0]};
  }

  async function osrmRouteCoords(a,b){
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('route failed');
    const data = await res.json();
    if(data.code !== 'Ok' || !data.routes?.length) throw new Error('route not found');
    return data.routes[0];
  }

  function initLiveMaps(){
    document.querySelectorAll('.live-map:not([data-ready])').forEach(async el => {
      el.dataset.ready = '1';
      const box = el.closest('.route-card');
      const status = box?.querySelector('.route-api-status');
      const from = el.dataset.from || '', to = el.dataset.to || '';
      const fallback = box?.querySelector('.offline-fallback');
      if(!window.L){
        if(status) status.textContent = 'Онлайн-карта недоступна — включена локальная схема.';
        el.style.display = 'none'; if(fallback) fallback.style.display = 'block'; return;
      }
      try{
        if(status) status.textContent = 'Строю маршрут через бесплатный OSRM...';
        const map = L.map(el, {zoomControl:false, attributionControl:false}).setView([46.3175,38.9578], 13);
        L.control.zoom({position:'topright'}).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map);
        L.control.attribution({prefix:false}).addAttribution('© OpenStreetMap · OSRM').addTo(map);
        const data = await osrmRoute(from,to);
        const coords = data.route.geometry.coordinates.map(c => [c[1], c[0]]);
        let line = L.polyline(coords, {weight:5}).addTo(map);
        const markerA = L.marker([data.a.lat,data.a.lon], {draggable:true}).addTo(map).bindPopup('Откуда: '+from+'<br>Если точка неверная — перетащите метку.');
        const markerB = L.marker([data.b.lat,data.b.lon], {draggable:true}).addTo(map).bindPopup('Куда: '+to+'<br>Если точка неверная — перетащите метку.');
        async function redrawByMarkers(){
          const pa = markerA.getLatLng(), pb = markerB.getLatLng();
          saveManualCoord(from, {lat:pa.lat, lon:pa.lng});
          saveManualCoord(to, {lat:pb.lat, lon:pb.lng});
          try{
            const nr = await osrmRouteCoords({lat:pa.lat, lon:pa.lng}, {lat:pb.lat, lon:pb.lng});
            line.setLatLngs(nr.geometry.coordinates.map(c=>[c[1],c[0]]));
            const km = (nr.distance/1000).toFixed(1);
            const min = Math.max(1, Math.round(nr.duration/60));
            const head = box?.querySelector('.route-head span'); if(head) head.textContent = km + ' км · ' + min + ' мин';
            const price=document.querySelector('[name="price"]'); if(price && document.activeElement?.name !== 'price') price.value = Math.max(170, Math.round((120 + Number(km)*48)/10)*10);
            if(status) status.textContent = 'Точка сохранена вручную. В следующий раз этот адрес откроется в исправленном месте.';
          }catch(e){ if(status) status.textContent = 'Точка сохранена вручную, но OSRM сейчас не перестроил маршрут.'; }
        }
        markerA.on('dragend', redrawByMarkers); markerB.on('dragend', redrawByMarkers);
        map.fitBounds(line.getBounds(), {padding:[28,28]});
        const km = (data.route.distance/1000).toFixed(1);
        const min = Math.max(1, Math.round(data.route.duration/60));
        const head = box?.querySelector('.route-head span'); if(head) head.textContent = km + ' км · ' + min + ' мин';
        if(status) status.textContent = 'Онлайн-маршрут. Если адрес показан неверно — перетащите синюю метку, точка сохранится.';
        if(fallback) fallback.style.display = 'none';
        setTimeout(()=>map.invalidateSize(), 150);
      }catch(err){
        if(status) status.textContent = 'Онлайн API недоступно или адрес не найден — включена локальная схема.';
        el.style.display = 'none'; if(fallback) fallback.style.display = 'block';
      }
    });
  }

  function navUrls(from, to){
    const f = String(from||'').trim();
    const t = String(to||'').trim();
    return {
      yandex: `https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(f)}~${encodeURIComponent(t)}&rtt=auto`,
      google: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(f)}&destination=${encodeURIComponent(t)}&travelmode=driving`,
      twoGis: `https://2gis.ru/search/${encodeURIComponent(t)}`
    };
  }

  function routeCard(order,title='Навигация'){
    const from = order?.from || 'Точка подачи не указана';
    const to = order?.to || 'Пункт назначения не указан';
    const r = routeMetrics(from,to);
    const urls = navUrls(from,to);
    const copy = esc(`Маршрут: ${from} → ${to}`).replace(/'/g,'&#39;');
    return `<div class="route-card navigator-card"><div class="route-head"><h2>${esc(title)}</h2><span>≈ ${r.km} км · ${r.min} мин</span></div>
      <div class="nav-route-box">
        <div class="nav-route-line"><div class="nav-point green"></div><div><b>Откуда</b><span>${esc(from)}</span></div></div>
        <div class="nav-route-line"><div class="nav-point red"></div><div><b>Куда</b><span>${esc(to)}</span></div></div>
      </div>
      <div class="navigator-actions">
        <a class="primary" target="_blank" rel="noopener" href="${urls.yandex}">Открыть Яндекс Навигатор</a>
        <a class="darkbtn" target="_blank" rel="noopener" href="${urls.google}">Google Maps</a>
        <a class="darkbtn" target="_blank" rel="noopener" href="${urls.twoGis}">2ГИС</a>
        <button class="outline" type="button" onclick="window.__copyRoute('${copy}')">Скопировать адреса</button>
      </div>
      <div class="offline-note">Карта внутри сайта отключена. Маршрут откроется во внешнем навигаторе, там будут пробки и точное ведение.</div>
    </div>`;
  }

  function routePreviewFromForm(forcePrice=false){
    const f=document.querySelector('[name="from"]')?.value||'';
    const t=document.querySelector('[name="to"]')?.value||'';
    const box=document.getElementById('routePreview');
    const price=document.querySelector('[name="price"]');
    if(price && (forcePrice || document.activeElement?.name !== 'price')){
      const m = routeMetrics(f,t); price.value = Math.max(170, Math.round((120 + m.km*48)/10)*10);
    }
    if(box){ box.innerHTML=routeCard({from:f,to:t}, 'Открыть маршрут'); }
  }

  function render(){
    if(!state.currentUser) { renderLogin(); return; }
    if(role()==='driver') renderDriver(); else renderPanel();
    setTimeout(() => { initAddressAutocomplete(); }, 80);
  }

  function renderLogin(){
    app.innerHTML = `<div class="login-page"><form class="login-card" id="loginForm">
      <div class="brand-title">ТАКСИ<span>БОНУС</span></div>
      <h2>Авторизация</h2><div class="muted">Вход в панель управления</div>
      <label class="field"><span>👤</span><input id="login" placeholder="Логин" autocomplete="username"></label>
      <label class="field"><span>🔒</span><input id="password" type="password" placeholder="Пароль" autocomplete="current-password"></label>
      <button class="primary full" type="submit">Войти</button>
      <div class="access"><b>Директор:</b> admin / admin123<br><b>Диспетчер:</b> disp / disp123<br><b>Водитель 1:</b> driver1 / driver123</div>
      <div id="err" class="error"></div>
    </form></div>`;
    document.getElementById('loginForm').onsubmit = e => {
      e.preventDefault();
      const login = document.getElementById('login').value.trim();
      const pass = document.getElementById('password').value.trim();
      const found = USERS.find(u => u.login === login && u.password === pass);
      if(!found){ document.getElementById('err').textContent='Неверный логин или пароль'; return; }
      state.currentUser = found; state.active = found.role==='dispatcher' ? 'orders' : 'dashboard'; save(); render();
    };
  }

  function layout(title, content){
    const nav = role()==='director' ? [
      ['dashboard','Главная'],['orders','Заказы'],['drivers','Водители'],['clients','Клиенты'],['messages','Сообщения'],['finance','Финансы'],['settings','Настройки']
    ] : [['orders','Заказы'],['map','Навигация'],['drivers','Водители'],['clients','Клиенты'],['messages','Сообщения']];
    app.innerHTML = `<div class="shell"><aside class="side">
      <div class="logo-row"><img src="assets/logo.svg"><b>Такси<br>Бонус</b></div>
      <div class="nav">${nav.map(n=>`<button class="${state.active===n[0]?'active':''}" data-nav="${n[0]}">● ${n[1]}</button>`).join('')}</div>
      <div class="profile"><b>${user().name}</b><span class="muted">${role()==='director'?'Директор':'Диспетчер'}</span><button class="darkbtn" id="logout">Выйти</button></div>
    </aside><main class="main"><div class="topbar"><h1>${title}</h1><div class="toolbar">${role()==='dispatcher'?'<button class="primary" id="newOrderTop">+ Новый заказ</button>':''}</div></div>${content}</main></div>`;
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>set(s=>s.active=b.dataset.nav));
    document.getElementById('logout').onclick=()=>set(s=>s.currentUser=null);
    const n = document.getElementById('newOrderTop'); if(n) n.onclick=()=>set(s=>s.active='newOrder');
  }
  function renderPanel(){
    if(state.active==='orders') return layout('Список заказов', ordersView());
    if(state.active==='newOrder') return layout('Новый заказ', newOrderView());
    if(state.active==='drivers') return layout('Список водителей', driversView());
    if(state.active==='clients') return layout('Клиенты', clientsView());
    if(state.active==='messages') return layout('Сообщения', messagesView());
    if(state.active==='finance') return layout('Финансы', financeView());
    if(state.active==='map') return layout('Навигация', `<div class="grid grid2">${state.orders.filter(o=>o.status!=='done'&&o.status!=='cancel').map(o=>`<div class="card">${routeCard(o, 'Заказ #'+o.id)}</div>`).join('') || '<div class="card"><h2>Активных маршрутов нет</h2></div>'}</div>`);
    return layout('Кабинет директора', dashboardView());
  }
  function dashboardView(){
    const today = state.orders.length, done = state.orders.filter(o=>o.status==='done').length, online = state.drivers.filter(d=>d.status==='online').length, money = state.orders.reduce((a,o)=>a+o.price,0);
    return `<div class="grid grid4"><div class="card stat"><span>Заказы сегодня</span><div class="num">${today}</div></div><div class="card stat"><span>Выполнено</span><div class="num">${done}</div></div><div class="card stat"><span>Водителей онлайн</span><div class="num">${online}</div></div><div class="card stat"><span>Выручка сегодня</span><div class="num">${rub(money)}</div></div></div><div class="grid grid2" style="margin-top:16px"><div class="card">${routeCard(state.orders.find(o=>o.status!=='done') || state.orders[0], 'Активный маршрут')}</div><div class="card"><h2>Последние заказы</h2>${ordersTable()}</div></div>`;
  }
  function ordersView(){ return `<div class="card"><div class="toolbar" style="justify-content:space-between"><h2>Заказы</h2><button class="primary" onclick="window.__newOrder()">+ Новый заказ</button></div>${ordersTable()}</div><div class="card" style="margin-top:16px">${routeCard(state.orders.find(o=>o.status!=='done'&&o.status!=='cancel') || state.orders[0], 'Карта города')}</div>`; }
  function ordersTable(){ return `<table class="table"><thead><tr><th>ID</th><th>Статус</th><th>Откуда</th><th>Куда</th><th>Клиент</th><th>Сумма</th><th>Время</th></tr></thead><tbody>${state.orders.map(o=>`<tr><td>#${o.id}</td><td><span class="badge ${statusClass(o.status)}">${statusLabel(o.status)}</span></td><td>${o.from}</td><td>${o.to}</td><td>${o.client}</td><td>${rub(o.price)}</td><td>${o.time}</td></tr>`).join('')}</tbody></table>`; }
  function newOrderView(){
    return `<div class="grid grid2 ytaxi-order"><div class="card"><h2>Создание нового заказа</h2><div class="ytaxi-hint">Карта внутри сайта отключена. Укажите адреса, а маршрут открывайте во внешнем навигаторе.</div><form class="form" id="newOrderForm"><label>Клиент</label><input name="client" value="Иванов И.И."><label>Телефон</label><input name="phone" value="89184546232"><div class="ytaxi-route-fields"><label>Откуда</label><input name="from" value="Ст. Новоминская, ул. Космонавтов, 191" autocomplete="off" data-address-autocomplete placeholder="Откуда забрать клиента?"><button type="button" class="swap-route" onclick="window.__swapRoute()">⇅</button><label>Куда</label><input name="to" value="Ст. Новоминская, ул. Кубанская, 15" autocomplete="off" data-address-autocomplete placeholder="Куда едем?"></div><label>Водитель</label><select name="driverId">${state.drivers.map(d=>`<option value="${d.id}">${d.name} — ${d.car}</option>`).join('')}</select><label>Стоимость</label><input name="price" type="number" value="350"><label>Оплата</label><select name="payment"><option>Наличные</option><option>Карта</option></select><br><br><div class="toolbar"><button class="outline" type="button" onclick="window.__nav('orders')">Отмена</button><button class="primary" type="submit">Создать заказ</button></div></form></div><div class="card" id="routePreview">${routeCard({from:'Ст. Новоминская, ул. Космонавтов, 191',to:'Ст. Новоминская, ул. Кубанская, 15'}, 'Открыть маршрут')}</div></div>`;
  }
  function driversView(){ return `<div class="card"><h2>Список водителей</h2><table class="table"><thead><tr><th>ID</th><th>Имя</th><th>Телефон</th><th>Статус</th><th>Авто</th></tr></thead><tbody>${state.drivers.map(d=>`<tr><td>${d.id}</td><td>${d.name}</td><td>${d.phone}</td><td style="color:${d.status==='online'?'#63d022':'#f04535'}">${d.status==='online'?'Онлайн':'Офлайн'}</td><td>${d.car}<br><span class="muted">${d.plate}</span></td></tr>`).join('')}</tbody></table></div>`; }
  function clientsView(){ return `<div class="card"><h2>Клиенты</h2><table class="table"><thead><tr><th>Имя</th><th>Телефон</th></tr></thead><tbody>${state.clients.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td></tr>`).join('')}</tbody></table></div>`; }
  function messagesView(){ return `<div class="grid grid2"><div class="card"><h2>Чаты</h2><p>driver1 <span style="color:var(--green)">онлайн</span></p><p>driver2 <span class="muted">был недавно</span></p></div><div class="card"><h2>driver1</h2>${state.messages.map(m=>`<p><b>${m.from}:</b> ${m.text}</p>`).join('')}<div class="field"><input placeholder="Введите сообщение..."><button class="primary">➤</button></div></div></div>`; }
  function financeView(){ const sum=state.orders.reduce((a,o)=>a+o.price,0); return `<div class="grid grid4"><div class="card stat"><span>Выручка</span><div class="num">${rub(sum)}</div></div><div class="card stat"><span>Наличными</span><div class="num">8 200 ₽</div></div><div class="card stat"><span>Картой</span><div class="num">4 340 ₽</div></div><div class="card stat"><span>Средний чек</span><div class="num">420 ₽</div></div></div>`; }

  function renderDriver(){
    const o = activeOrder();
    const no = `<div class="shell"><main class="main"><div class="card"><h1>Заказов нет</h1><p class="muted">Ожидайте назначение от диспетчера.</p><button class="darkbtn" id="logout">Выйти</button></div></main></div>`;
    if(!o){ app.innerHTML=no; document.getElementById('logout').onclick=()=>set(s=>s.currentUser=null); return; }
    const stage = o.stage || 'new';
    const steps = ['new','to_client','arrived','trip','done'];
    const labels = {new:'Новый',to_client:'К клиенту',arrived:'На месте',trip:'Поездка',done:'Готово'};
    const action = stage==='new' ? ['Принять заказ','accept'] : stage==='to_client' ? ['Я на месте','arrive'] : stage==='arrived' ? ['Начать поездку','start'] : stage==='trip' ? ['Завершить поездку','finish'] : ['Заказ завершён',''];
    app.innerHTML = `<div class="shell"><aside class="side"><div class="logo-row"><img src="assets/logo.svg"><b>Такси<br>Бонус</b></div><div class="profile"><b>${user().name}</b><span class="muted">Водитель</span><button class="darkbtn" id="logout">Выйти</button></div></aside><main class="main"><div class="topbar"><h1>Мой заказ</h1><span class="badge ${stage==='done'?'b-done':'b-new'}">${labels[stage]}</span></div><div class="driver-layout"><div class="card"><h2>Текущий заказ #${o.id}</h2><div class="small-tabs">${steps.map(s=>`<span class="${s===stage?'on':''}">${labels[s]}</span>`).join('')}</div><div class="kv"><span>Клиент</span><b>${o.client}</b></div><div class="kv"><span>Телефон</span><b>${o.phone}</b></div><div class="kv"><span>Подача</span><b>${o.from}</b></div><div class="kv"><span>Куда</span><b>${o.to}</b></div><div class="kv"><span>Оплата</span><b>${o.payment} · ${rub(o.price)}</b></div><div class="stage-panel"><div class="muted">Следующее действие</div><h2>${action[0]}</h2>${action[1]?`<button class="primary big-action" data-driver-action="${action[1]}">${action[0]}</button>`:''}<button class="outline big-action" data-driver-action="reject">Отказаться</button></div></div><div class="card"><h2>Навигатор</h2>${routeCard(o, stage==='to_client'?'Навигатор к клиенту':stage==='trip'?'Навигатор поездки':'Навигатор заказа')}<p class="muted">Нажмите кнопку навигатора — маршрут откроется во внешнем приложении.</p><div class="toolbar"><button class="success" data-speak>▶ Голос</button></div><div class="card" style="margin-top:14px"><b>Следующий манёвр:</b><p>${stage==='new'?'Примите заказ, чтобы начать движение к клиенту.':stage==='to_client'?'Двигайтесь к точке подачи: '+o.from:stage==='arrived'?'Ожидайте клиента и начните поездку.':stage==='trip'?'Двигайтесь к конечной точке: '+o.to:'Поездка завершена.'}</p></div></div></div></main></div>`;
    document.getElementById('logout').onclick=()=>set(s=>s.currentUser=null);
    document.querySelectorAll('[data-driver-action]').forEach(b=>b.onclick=()=>driverAction(b.dataset.driverAction));
    document.querySelector('[data-speak]').onclick=()=>speak(`Заказ номер ${o.id}. Маршрут от ${o.from} до ${o.to}`);
  }
  function driverAction(a){
    set(s=>{ const o = activeOrder(); if(!o) return; if(a==='accept'){o.stage='to_client';o.status='way'; speak('Заказ принят. Маршрут к клиенту построен.');} if(a==='arrive'){o.stage='arrived'; speak('Вы прибыли к клиенту.');} if(a==='start'){o.stage='trip'; speak('Поездка началась. Маршрут до конечной точки построен.');} if(a==='finish'){o.stage='done';o.status='done'; speak('Поездка завершена.');} if(a==='reject'){o.driverId=null;o.stage='new';o.status='new'; speak('Заказ отклонён.');} });
  }
  window.__swapRoute = () => {
    const a=document.querySelector('[name="from"]'), b=document.querySelector('[name="to"]');
    if(a&&b){ const v=a.value; a.value=b.value; b.value=v; routePreviewFromForm(true); }
  };
  window.__newOrder = () => set(s=>s.active='newOrder');
  window.__nav = a => set(s=>s.active=a);
  window.__routePreview = routePreviewFromForm;
  document.addEventListener('submit', e=>{
    if(e.target.id==='newOrderForm'){
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      set(s=>{ s.orders.unshift({id:s.nextOrderId++,status:'new',stage:'new',driverId:Number(f.driverId),client:f.client,phone:f.phone,from:f.from,to:f.to,price:Number(f.price),payment:f.payment,time:new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}); s.active='orders'; });
    }
  });
  render();
})();
