// Skrzynkomat — logika gry (oryginalny skrypt autora).
(function(){
"use strict";

/* ================= DANE ================= */
var TIERS=[
  {n:"Zwykły",c:"var(--t0)",hex:"#7aa2ff",odds:.7992,base:3},
  {n:"Rzadki",c:"var(--t1)",hex:"#9b6bff",odds:.1598,base:12},
  {n:"Elitarny",c:"var(--t2)",hex:"#e04fd0",odds:.032,base:45},
  {n:"Tajny",c:"var(--t3)",hex:"#ff4b4b",odds:.0064,base:180},
  {n:"Legendarny",c:"var(--t4)",hex:"#ffc247",odds:.0026,base:1200}
];
var WEARS=[
  {n:"Prosto z fabryki",max:.07,m:1},
  {n:"Niewiele zużyte",max:.15,m:.85},
  {n:"Przetestowane w boju",max:.38,m:.65},
  {n:"Dobrze zużyte",max:.45,m:.5},
  {n:"Zniszczone",max:1,m:.4}
];
function I(n,t,h,p,v){return {n:n,t:t,h:h,p:p,v:v||1};}
var CASES=[
 {id:"stal",name:"Skrzynka Stalowa",price:8,mult:1,hue:210,items:[
  [I("AR-9 | Szara Stal","rifle",215,"stripe"),I("P-18 | Pył Hangaru","pistol",30,"dots"),I("SG-3 | Zimny Śrut","rifle",200,"hex"),I("P-22 | Wypalony","pistol",15,"camo")],
  [I("AR-9 | Kuźnia","rifle",20,"flame"),I("SN-7 | Stalowy Wilk","sniper",205,"stripe"),I("P-18 | Rdzawy Kod","pistol",10,"hex")],
  [I("AR-12 | Cyna i Ogień","rifle",25,"flame"),I("SN-7 | Śrubokręt","sniper",190,"wave"),I("P-22 | Nit","pistol",220,"hex")],
  [I("AR-12 | Młot Pneumatyczny","rifle",5,"flame",1.2),I("SN-9 | Ostatnia Zmiana","sniper",0,"stripe",1.5)],
  [I("★ Nóż Szpon | Stal Hartowana","knife",210,"wave"),I("★ Nóż Szpon | Patyna","knife",160,"camo",.8),I("★ Nóż Motyl | Cień Huty","knife",260,"hex",1.6)]
 ]},
 {id:"neon",name:"Skrzynka Neonowa",price:15,mult:1.8,hue:300,items:[
  [I("AR-9 | Fiolet Nocy","rifle",280,"stripe"),I("P-18 | Tramwaj Nocny","pistol",320,"wave"),I("SG-3 | Zgaszone Światło","rifle",250,"dots"),I("P-22 | Kolor Plazmy","pistol",300,"hex")],
  [I("AR-12 | Różowy Szum","rifle",325,"wave"),I("SN-7 | Linia Metra","sniper",270,"stripe"),I("P-18 | Laser Disco","pistol",290,"dots")],
  [I("AR-12 | Reklama","rifle",310,"hex"),I("SN-9 | Mrugająca Litera","sniper",340,"flame"),I("P-22 | Syrena","pistol",260,"wave")],
  [I("AR-15 | Hologram","rifle",300,"hex",1.3),I("SN-9 | Ostatni Neon","sniper",330,"stripe",1.4)],
  [I("★ Nóż Szpon | Świetlówka","knife",290,"stripe"),I("★ Nóż Motyl | Pulsar","knife",320,"wave",1.4),I("★ Nóż Kord | Miasto w Deszczu","knife",270,"hex",1.1)]
 ]},
 {id:"pustynia",name:"Skrzynka Pustynna",price:24,mult:3,hue:35,items:[
  [I("AR-9 | Piasek","rifle",40,"dots"),I("P-18 | Karawana","pistol",30,"stripe"),I("SG-3 | Suchy Wiatr","rifle",50,"camo"),I("P-22 | Szakal","pistol",25,"camo")],
  [I("AR-12 | Miraż","rifle",45,"wave"),I("SN-7 | Skorpion","sniper",35,"hex"),I("P-18 | Oaza","pistol",90,"dots")],
  [I("AR-12 | Burza Piaskowa","rifle",30,"wave"),I("SN-9 | Złoty Czas","sniper",48,"flame"),I("P-22 | Wydma","pistol",38,"stripe")],
  [I("AR-15 | Faraon","rifle",50,"hex",1.3),I("SN-9 | Sfinks","sniper",42,"camo",1.4)],
  [I("★ Nóż Kord | Pustynny Szlak","knife",35,"camo"),I("★ Nóż Szpon | Skorpion","knife",20,"hex",1.2),I("★ Nóż Motyl | Zachód Słońca","knife",15,"wave",1.8)]
 ]},
 {id:"arktyka",name:"Skrzynka Arktyczna",price:48,mult:6,hue:190,items:[
  [I("AR-9 | Szron","rifle",195,"dots"),I("P-18 | Zamarznięty","pistol",200,"stripe"),I("SG-3 | Biały Szum","rifle",185,"camo"),I("P-22 | Zamieć","pistol",210,"wave")],
  [I("AR-12 | Lodowa Igła","rifle",190,"hex"),I("SN-7 | Biały Niedźwiedź","sniper",205,"camo"),I("P-18 | Śnieżyca","pistol",180,"dots")],
  [I("AR-12 | Tafla","rifle",175,"wave"),I("SN-9 | Zorza","sniper",150,"flame"),I("P-22 | Kryształ","pistol",200,"hex")],
  [I("AR-15 | Wieczna Zmarzlina","rifle",195,"stripe",1.3),I("SN-9 | Lodołamacz","sniper",170,"hex",1.5)],
  [I("★ Nóż Kord | Zorza Polarna","knife",160,"wave",1.2),I("★ Nóż Szpon | Pęknięty Lód","knife",195,"hex"),I("★ Nóż Motyl | Absolutne Zero","knife",205,"stripe",1.9)]
 ]},
 {id:"las",name:"Skrzynka Leśna",price:11,mult:1.4,hue:125,items:[
  [I("AR-9 | Mech","rifle",120,"camo"),I("P-18 | Ściółka","pistol",95,"dots"),I("SG-3 | Paproć","rifle",135,"wave"),I("P-22 | Kora","pistol",30,"stripe")],
  [I("AR-12 | Gąszcz","rifle",110,"camo"),I("SN-7 | Wilcza Jagoda","sniper",280,"dots"),I("P-18 | Zarośla","pistol",145,"hex")],
  [I("AR-12 | Podszycie","rifle",100,"stripe"),I("SN-9 | Wiatrołom","sniper",25,"wave"),I("P-22 | Muchomor","pistol",355,"dots")],
  [I("AR-15 | Leśny Duch","rifle",135,"flame",1.3),I("SN-9 | Zmierzch w Borze","sniper",160,"camo",1.4)],
  [I("★ Nóż Kord | Pień Dębu","knife",28,"wave"),I("★ Nóż Szpon | Pazur Rysia","knife",100,"camo",1.1),I("★ Nóż Motyl | Zielona Żmija","knife",125,"hex",1.5)]
 ]},
 {id:"wulkan",name:"Skrzynka Wulkaniczna",price:19,mult:2.4,hue:8,items:[
  [I("AR-9 | Popiół","rifle",10,"dots"),I("P-18 | Pumeks","pistol",20,"hex"),I("SG-3 | Żużel","rifle",0,"camo"),I("P-22 | Szara Lawa","pistol",15,"wave")],
  [I("AR-12 | Krater","rifle",15,"flame"),I("SN-7 | Dym","sniper",5,"wave"),I("P-18 | Żar","pistol",25,"stripe")],
  [I("AR-12 | Strumień Magmy","rifle",18,"flame"),I("SN-9 | Obsydian","sniper",260,"hex"),I("P-22 | Siarka","pistol",55,"dots")],
  [I("AR-15 | Erupcja","rifle",8,"flame",1.3),I("SN-9 | Piekielny Kominek","sniper",0,"stripe",1.5)],
  [I("★ Nóż Szpon | Magma","knife",12,"flame"),I("★ Nóż Kord | Żar Wieczny","knife",28,"wave",1.2),I("★ Nóż Motyl | Rozżarzony Węgiel","knife",5,"hex",1.7)]
 ]},
 {id:"kosmos",name:"Skrzynka Kosmiczna",price:72,mult:9,hue:262,items:[
  [I("AR-9 | Pył Gwiezdny","rifle",250,"dots"),I("P-18 | Orbita","pistol",270,"wave"),I("SG-3 | Mała Mgławica","rifle",290,"hex"),I("P-22 | Księżyc","pistol",230,"camo")],
  [I("AR-12 | Aurora Orbitalna","rifle",170,"wave"),I("SN-7 | Kometa","sniper",200,"stripe"),I("P-18 | Czarna Dziura","pistol",270,"hex")],
  [I("AR-12 | Supernowa","rifle",330,"flame"),I("SN-9 | Pas Asteroid","sniper",240,"camo"),I("P-22 | Horyzont Zdarzeń","pistol",280,"wave")],
  [I("AR-15 | Kwazar","rifle",300,"hex",1.3),I("SN-9 | Ostatni Foton","sniper",190,"stripe",1.5)],
  [I("★ Nóż Szpon | Droga Mleczna","knife",260,"dots"),I("★ Nóż Kord | Grawitacja","knife",285,"wave",1.2),I("★ Nóż Motyl | Wielki Wybuch","knife",340,"flame",1.9)]
 ]},
 {id:"zloto",name:"Skrzynka Złotej Gorączki",price:120,mult:15,hue:46,items:[
  [I("AR-9 | Mosiądz","rifle",42,"stripe"),I("P-18 | Piryt","pistol",50,"hex"),I("SG-3 | Sztabka","rifle",46,"dots"),I("P-22 | Miedź","pistol",22,"wave")],
  [I("AR-12 | Nugget","rifle",48,"camo"),I("SN-7 | Złoty Strzał","sniper",44,"stripe"),I("P-18 | Klondike","pistol",38,"flame")],
  [I("AR-12 | Królewskie Złoto","rifle",50,"hex"),I("SN-9 | Skarbiec","sniper",40,"wave"),I("P-22 | Dublon","pistol",46,"dots")],
  [I("AR-15 | Midas","rifle",48,"flame",1.3),I("SN-9 | Złota Żyła","sniper",52,"camo",1.5)],
  [I("★ Nóż Szpon | Czyste Złoto","knife",50,"stripe"),I("★ Nóż Kord | Korona","knife",44,"hex",1.3),I("★ Nóż Motyl | Diamentowy Pył","knife",190,"dots",2)]
 ]},
 {id:"podworko",name:"Skrzynka Podwórkowa",price:4,mult:.6,hue:80,items:[
  [I("AR-9 | Trzepak","rifle",70,"stripe"),I("P-18 | Kreda","pistol",55,"dots"),I("SG-3 | Płot","rifle",95,"hex"),I("P-22 | Piaskownica","pistol",45,"camo")],
  [I("AR-12 | Ławka","rifle",85,"wave"),I("SN-7 | Blokowisko","sniper",60,"camo"),I("P-18 | Guma do Żucia","pistol",330,"dots")],
  [I("AR-12 | Wieczorny Mecz","rifle",100,"stripe"),I("SN-9 | Klatka Schodowa","sniper",40,"hex"),I("P-22 | Zepsuta Latarnia","pistol",50,"flame")],
  [I("AR-15 | Osiedlowy Szeryf","rifle",90,"hex",1.2),I("SN-9 | Dach Wieżowca","sniper",200,"stripe",1.3)],
  [I("★ Nóż Kord | Scyzoryk Dziadka","knife",35,"camo"),I("★ Nóż Szpon | Gwóźdź Programu","knife",80,"stripe",1.1),I("★ Nóż Motyl | Latawiec","knife",170,"wave",1.4)]
 ]},
 {id:"rafa",name:"Skrzynka Rafowa",price:32,mult:4,hue:165,items:[
  [I("AR-9 | Piana","rifle",175,"wave"),I("P-18 | Muszla","pistol",20,"dots"),I("SG-3 | Wodorost","rifle",150,"camo"),I("P-22 | Kotwica","pistol",200,"stripe")],
  [I("AR-12 | Koralowiec","rifle",350,"hex"),I("SN-7 | Płaszczka","sniper",185,"wave"),I("P-18 | Latarnik","pistol",170,"stripe")],
  [I("AR-12 | Głębia","rifle",200,"wave"),I("SN-9 | Syrena Morska","sniper",160,"dots"),I("P-22 | Perła","pistol",180,"dots")],
  [I("AR-15 | Kraken","rifle",170,"hex",1.3),I("SN-9 | Rekin Młot","sniper",210,"camo",1.4)],
  [I("★ Nóż Kord | Fala Przypływu","knife",185,"wave",1.1),I("★ Nóż Szpon | Ząb Rekina","knife",200,"hex",1.3),I("★ Nóż Motyl | Rafa w Słońcu","knife",150,"stripe",1.8)]
 ]},
 {id:"burza",name:"Skrzynka Burzowa",price:60,mult:7.5,hue:235,items:[
  [I("AR-9 | Grzmot","rifle",230,"stripe"),I("P-18 | Kropla","pistol",215,"dots"),I("SG-3 | Mżawka","rifle",245,"wave"),I("P-22 | Chmura","pistol",225,"camo")],
  [I("AR-12 | Wyładowanie","rifle",250,"flame"),I("SN-7 | Piorun Kulisty","sniper",220,"hex"),I("P-18 | Ulewa","pistol",240,"wave")],
  [I("AR-12 | Oko Cyklonu","rifle",235,"wave"),I("SN-9 | Burza Magnetyczna","sniper",255,"stripe"),I("P-22 | Błyskawica","pistol",50,"flame")],
  [I("AR-15 | Zeus","rifle",48,"hex",1.3),I("SN-9 | Huragan","sniper",215,"camo",1.4)],
  [I("★ Nóż Kord | Wicher","knife",230,"wave",1.2),I("★ Nóż Szpon | Szkwał","knife",245,"stripe",1.3),I("★ Nóż Motyl | Elektryczna Zorza","knife",52,"hex",1.9)]
 ]},
 {id:"rubin",name:"Skrzynka Rubinowa",price:96,mult:12,hue:345,items:[
  [I("AR-9 | Granat","rifle",350,"hex"),I("P-18 | Wiśnia","pistol",345,"dots"),I("SG-3 | Burgund","rifle",335,"wave"),I("P-22 | Rdza Rubinowa","pistol",8,"camo")],
  [I("AR-12 | Karmazyn","rifle",348,"stripe"),I("SN-7 | Szkarłat","sniper",340,"flame"),I("P-18 | Krwawnik","pistol",355,"wave")],
  [I("AR-12 | Rubin Królewski","rifle",346,"hex"),I("SN-9 | Czerwony Karzeł","sniper",330,"stripe"),I("P-22 | Płatek Maku","pistol",352,"dots")],
  [I("AR-15 | Serce Smoka","rifle",350,"flame",1.3),I("SN-9 | Purpurowy Zachód","sniper",320,"wave",1.5)],
  [I("★ Nóż Kord | Wino i Złoto","knife",345,"stripe",1.2),I("★ Nóż Szpon | Szkarłatny Pazur","knife",350,"flame",1.4),I("★ Nóż Motyl | Rubin Absolutny","knife",340,"hex",2)]
 ]}
];
CASES.sort(function(a,b){return a.price-b.price;});

/* ================= GRAFIKA: modele broni z części ================= */
var uid=0;
function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}

/* ---- helpery kształtów ---- */
function rr(x,y,w,h,r){
  if(!r)return "M"+x+" "+y+"H"+(x+w)+"V"+(y+h)+"H"+x+"Z";
  return "M"+(x+r)+" "+y+"H"+(x+w-r)+"Q"+(x+w)+" "+y+" "+(x+w)+" "+(y+r)+"V"+(y+h-r)+"Q"+(x+w)+" "+(y+h)+" "+(x+w-r)+" "+(y+h)+"H"+(x+r)+"Q"+x+" "+(y+h)+" "+x+" "+(y+h-r)+"V"+(y+r)+"Q"+x+" "+y+" "+(x+r)+" "+y+"Z";
}
function cyc(cx,cy,r){return "M"+(cx-r)+" "+cy+"A"+r+" "+r+" 0 1 0 "+(cx+r)+" "+cy+"A"+r+" "+r+" 0 1 0 "+(cx-r)+" "+cy+"Z";}
function vt(x0,x1,st,y0,y1){var s="";for(var x=x0;x<=x1;x+=st)s+="M"+x+" "+y0+"V"+y1;return s;}
function sw(x0,x1,st,y0,y1,dx){var s="";for(var x=x0;x<=x1;x+=st)s+="M"+x+" "+y0+"L"+(x+dx)+" "+y1;return s;}
function hz(y0,y1,st,x0,x1){var s="";for(var y=y0;y<=y1;y+=st)s+="M"+x0+" "+y+"H"+x1;return s;}

/* ---- modele: skin = lakierowane części, metal = stal, dark = polimer, glass = soczewki ---- */
var MODELS={
 "AR-9":function(){return{
  skin:["M4 51L8 43Q10 41 14 41.5L62 47L66 48V70L30 77Q14 81 8 72Z","M66 41Q66 37.5 70 37L128 36Q140 36 142 42L146 48V68L66 70Z","M148 40Q168 37 196 41Q204 43 206 48H148Z","M148 49H204Q211 50 212 56V62Q211 69 202 69.5L148 69Z"],
  metal:["M142 33Q176 31 214 36V40.5Q176 37 142 39Z","M112 30L132 29.5L134 36H110Z","M212 51H262V56.5H212Z","M236 37H246L248 51H235Z","M240.5 30H243.5V37H240.5Z","M262 47H282Q285 47 285 50V57.5Q285 60 282 60H262Z","M104 69H144V74H104Z","M66 69H100V72H66Z"],
  dark:["M70 70L92 69.5Q96 70 97 74L101 100Q102 105 97 106L85 107Q80 107 79 102Z","M108 74H134Q136 94 152 110Q155 114 151 116L145 118Q112 100 108 74Z"],
  lines:"M78 44L124 43M96 52H128Q130 52 130 55H96ZM94 71Q98 84 112 84L116 80M150 53H202M150 58H202M150 63H202"+vt(266,280,4,49,58)+"M12 54L58 58M10 62L56 66M112 83L124 100M120 90L140 108",
  hi:"M68 41L128 40M150 41L196 43M12 44L60 49",
  ex:function(k){return '<rect x="96" y="49" width="30" height="5" rx="1.5" fill="#05070a" fill-opacity=".7"/><circle cx="10" cy="60" r="1.6" fill="#05070a" fill-opacity=".6"/><circle cx="52" cy="52" r="1.4" fill="#05070a" fill-opacity=".6"/><circle cx="150" cy="44" r="1.4" fill="#05070a" fill-opacity=".6"/>';},
  st:[92,56]};},
 "AR-12":function(){return{
  skin:["M62 38H126Q134 38 136 44V57H62Z","M62 57H116L123 62V72Q123 74 120 74H66Q62 74 62 70Z","M136 38H204Q210 39 210 46V58Q210 63 204 63H136Z"],
  metal:["M62 31H178V38H62Z","M68 24H80V31H68Z","M194 27H202V38H194Z","M210 45H262V51H210Z","M262 41H283Q285 41 285 43V51Q285 53 283 53H262Z","M30 42H62V53H30Z","M110 74H122V77H110Z"],
  dark:["M4 40Q4 38 8 38H32V53L42 53L48 65H34L28 71H10Q4 71 4 65Z","M100 74H118L126 99Q127 103 123 104L112 105Q108 105 107 101Z","M124 66H144L152 101Q153 105 149 105H135Q131 105 130 101Z"],
  glass:[],
  lines:vt(66,172,4,31,38)+"M138 43H202M138 50H202M138 57H202M70 47H124M80 62H112"+vt(34,58,6,43,52)+"M105 74Q108 84 120 84L124 77"+vt(266,280,4,43,51),
  hi:"M64 39H124M138 39H202M6 40H30",
  ex:function(k){return '<rect x="86" y="43" width="22" height="5" rx="1.5" fill="#05070a" fill-opacity=".7"/><path d="M170 24H178V31H170Z" fill="#05070a" fill-opacity=".35"/>';},
  st:[88,58]};},
 "AR-15":function(){return{
  skin:["M6 40L52 44L66 46V68L30 74L8 62Z","M66 40H140Q146 40 148 46V68H66Z","M148 38H208Q214 38 214 44V62Q214 68 208 68H148Z"],
  metal:["M66 32H178V38H66Z","M150 28H162V38H150Z","M214 45H258V52H214Z","M258 40H286Q288 40 288 42V54Q288 56 286 56H258Z","M236 54H250V60H236Z"],
  dark:["M2 40Q2 38 6 38H10L12 66L8 66Q2 66 2 62Z","M104 68H124L122 74H106Z","M130 68H150L158 99Q159 103 155 104L141 104Q137 104 136 100Z","M92 18H136Q142 18 142 24V36H92Z"],
  glass:[[116,29,2,8]],
  ex:function(k){return '<circle cx="114" cy="92" r="19" fill="url(#'+k+'d)" stroke="#05070a" stroke-width="1"/><circle cx="114" cy="92" r="12" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/><circle cx="114" cy="92" r="4" fill="#000" fill-opacity=".5"/><path d="M114 74V110M96 92H132M101 79L127 105M127 79L101 105" stroke="#000" stroke-opacity=".3" stroke-width="1"/><path d="M98 80Q114 72 130 80" fill="none" stroke="#fff" stroke-opacity=".3"/>';},
  lines:"M72 50H140M76 57H138"+hz(44,62,6,156,206)+vt(262,282,5,42,54),
  hi:"M68 41H146M150 39H208M8 41L50 44",
  st:[88,52]};},
 "SG-3":function(){return{
  skin:["M4 49Q4 45 9 44L42 46L76 50V64L42 74L26 79Q10 79 6 70Z","M76 42H136Q146 42 148 48V62H76Z","M150 56H206Q212 56 212 61V66Q212 71 206 71H150Z"],
  metal:["M148 43H270V49.5H148Z","M148 52H252V58H148Z","M250 51H258V59H250Z","M266 37H270V43H266Z","M76 62H108V66H76Z","M210 58H230V62H210Z"],
  dark:["M2 49Q2 46 6 46L8 74Q3 74 2 70Z"],
  lines:"M94 66Q96 78 108 78L112 66"+vt(156,200,5,57,70)+"M84 50H124Q128 50 128 53H84Z M10 56L40 52M12 64L42 62",
  hi:"M78 43H134M8 46L40 47M152 57H204",
  ex:function(k){return '<rect x="96" y="45" width="24" height="5" rx="1.5" fill="#05070a" fill-opacity=".7"/>';},
  st:[84,55]};},
 "SN-7":function(){return{
  skin:["M4 50Q4 46 10 45L60 47L100 51L190 58Q196 59 196 64Q196 70 190 71L132 73L106 77L72 76Q52 78 44 90L14 83Q4 78 4 68Z"],
  metal:["M98 41H164Q168 41 168 45V55H98Z","M134 45H146L154 56L150 60L142 54H134Z","M150 60A4 4 0 1 0 158 60A4 4 0 1 0 150 60Z","M166 46H262V51H166Z","M262 43H280Q282 43 282 45V52Q282 54 280 54H262Z","M114 34H120V41H114Z","M174 34H180V41H174Z","M180 71L204 88L206 85L184 69Z"],
  dark:["M104 20H190Q196 20 196 24V32Q196 36 190 36H104Q98 36 98 32V24Q98 20 104 20Z","M190 18L214 14V42L190 38Z","M88 22L98 23V35L88 34Z"],
  glass:[[214,28,3,12],[88,28,2,6]],
  lines:"M100 68Q100 80 114 80L120 72M28 56L70 58M26 66L66 66M108 24H186"+vt(268,278,5,45,52),
  hi:"M100 42H162M108 22H188M8 50L36 46M10 49L60 49",
  st:[108,55]};},
 "SN-9":function(){return{
  skin:["M6 44Q6 41 10 41L40 45L96 44V66L50 70L22 90Q18 91 15 88L8 82Z","M96 40H168Q172 40 172 44V64H96Z","M172 42H242Q246 42 246 46V60Q246 62 242 62H172Z"],
  metal:["M246 47H266V53H246Z","M138 10H150V16H138Z","M110 30H118V40H110Z","M170 30H178V40H170Z","M196 62H200L194 102H190Z","M204 62H208L216 102H212Z","M44 38H76V44H44Z"],
  dark:["M100 16H192Q198 16 198 22V28Q198 32 192 32H100Q94 32 94 28V22Q94 16 100 16Z","M190 12L216 10V38L190 36Z","M86 16L94 17V31L86 32Z","M266 42H292Q296 42 296 46V56Q296 60 292 60H266Z","M118 64H142L144 90L120 92Z","M150 64H168L174 96L158 98Z"],
  glass:[[216,24,3,13],[86,24,2,7]],
  lines:vt(180,238,8,46,58)+hz(76,86,5,120,141)+"M20 84L52 70M12 60L44 58"+vt(270,290,6,44,58)+"M110 22H186",
  hi:"M98 41H168M174 43H240M102 18H190M8 42L38 46",
  st:[104,48]};},
 "P-18":function(){return{
  skin:["M70 31H224Q232 31 234 37V53H70Z"],
  metal:["M232 38H243V49H232Z","M74 24H86V31H74Z","M220 25H228V31H220Z","M176 53H214V59H176Z","M98 111H138V115H98Z"],
  dark:["M70 53H178L172 63H152L146 74L138 110Q137 114 133 114H104Q99 114 100 109L106 70L70 62Z"],
  lines:vt(76,98,4,33,51)+"M150 64Q152 77 164 77L172 62"+hz(80,100,7,106,136)+"M104 68L108 66H136M184 38H214",
  hi:"M72 32H224M106 72L102 102",
  ex:function(k){return '<rect x="186" y="34" width="24" height="6" rx="1.5" fill="#05070a" fill-opacity=".7"/><circle cx="224" cy="40" r="1.5" fill="#fff" fill-opacity=".4"/>';},
  st:[132,36]};},
 "P-22":function(){return{
  skin:["M60 38L74 29L84 32L82 36H150V74H100L60 66Z"],
  metal:["M112 36H152Q158 36 158 42V68Q158 74 152 74H112Q106 74 106 68V42Q106 36 112 36Z","M158 42H262V54H158Z","M158 54H222V63H158Z","M254 34H262V42H254Z","M88 34H110V39H88Z","M226 56H234V66H226Z"],
  dark:["M60 60L100 64L104 108Q104 112 100 112L76 114Q72 114 70 110L62 92Z"],
  lines:vt(118,148,6,42,68)+"M104 76Q106 90 124 90L130 74M66 72L96 76M68 84L98 88M70 96L100 98M160 48H258",
  hi:"M62 39H80M160 43H260M114 38H150",
  st:[66,46]};},
 "dagger":function(){return{
  skin:["M126 50L240 47Q282 52 300 66L126 63Z"],
  metal:["M126 63L300 66Q272 74 240 75L126 73Z","M112 40Q112 38 114 38H124Q126 38 126 40V82Q126 84 124 84H114Q112 84 112 82Z","M12 50Q12 48 16 48H22Q24 48 24 50V76Q24 78 22 78H16Q12 78 12 76Z"],
  dark:["M24 52H112V74H24Q16 74 16 63Q16 52 24 52Z"],
  lines:vt(32,104,7,54,72)+"M130 58L284 63M126 50L128 72",
  hi:"M130 52L240 49Q276 54 296 65M130 68L260 70",
  ex:function(k){return '<path d="M128 56L238 52Q276 56 296 66" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/><circle cx="18" cy="63" r="2.4" fill="#05070a" stroke="#9aa3b0" stroke-width=".8"/>';},
  st:[40,58]};},
 "claw":function(){return{
  skin:["M118 70Q172 54 232 42Q268 34 292 8Q298 40 266 74Q232 102 176 106Q140 108 118 94Z"],
  metal:["M118 70Q172 54 232 42Q268 34 292 8Q274 42 238 52Q180 64 118 80Z","M104 64H120Q122 64 122 66V96Q122 98 120 98H106Q104 98 104 96Z"],
  dark:["M30 70H104V92H30Q18 92 18 81Q18 70 30 70Z"],
  lines:vt(38,98,8,72,90)+"M132 88Q200 84 260 56",
  hi:"M126 80Q176 66 234 52Q270 42 290 14",
  ex:function(k){return '<ellipse cx="18" cy="80" rx="15" ry="13" fill="none" stroke="#05070a" stroke-width="7"/><ellipse cx="18" cy="80" rx="15" ry="13" fill="none" stroke="#9aa3b0" stroke-width="4"/><ellipse cx="18" cy="78" rx="15" ry="12" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-dasharray="14 70"/>';},
  st:[44,76]};},
 "wide":function(){return{
  skin:["M130 44L226 36Q276 40 298 60L130 60Z"],
  metal:["M130 60L298 60Q276 80 226 84L130 76Z","M112 38H128Q130 38 130 40V80Q130 82 128 82H114Q112 82 112 80Z","M8 52Q8 50 12 50H18Q20 50 20 52V74Q20 76 18 76H12Q8 76 8 74Z"],
  dark:["M20 54H112V72H20Q12 72 12 63Q12 54 20 54Z"],
  lines:vt(28,104,8,56,70)+"M134 56H284M136 50L220 44",
  hi:"M134 46L226 39Q272 43 294 59M134 78L226 82Q262 80 288 66",
  ex:function(k){return '<path d="M134 48L226 40Q274 44 296 60" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.1"/><circle cx="14" cy="62" r="2.4" fill="#05070a" stroke="#9aa3b0" stroke-width=".8"/>';},
  st:[40,58]}}
};
function modelOf(it){
  var key;
  if(it.t==="knife"){key=it.n.indexOf("Szpon")>-1?"claw":(it.n.indexOf("Motyl")>-1?"wide":"dagger");}
  else key=it.n.split(" ")[0];
  return (MODELS[key]||MODELS["AR-9"])();
}
function noiseF(id,fq,oct,seed,rgb,am,aa){
  return '<filter id="'+id+'" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="'+fq+'" numOctaves="'+oct+'" seed="'+seed+'"/><feColorMatrix type="matrix" values="0 0 0 0 '+rgb[0]+' 0 0 0 0 '+rgb[1]+' 0 0 0 0 '+rgb[2]+' '+am+' 0 0 0 '+aa+'"/></filter>';
}
function pat(p,h,R){
  var l1="hsl("+((h+24)%360)+",64%,58%)",l2="hsl("+((h+196)%360)+",38%,76%)",dk="hsl("+h+",52%,11%)",md="hsl("+((h+345)%360)+",52%,38%)",s="",i,x,y;
  if(p==="stripe"){
    for(i=-2;i<9;i++){x=i*44;
      s+='<path d="M'+x+' 130L'+(x+46)+' -10L'+(x+60)+' -10L'+(x+14)+' 130Z" fill="'+l1+'" opacity=".9"/>';
      s+='<path d="M'+(x+22)+' 130L'+(x+68)+' -10L'+(x+73)+' -10L'+(x+27)+' 130Z" fill="'+dk+'" opacity=".8"/>';
      s+='<path d="M'+(x+32)+' 130L'+(x+78)+' -10L'+(x+80)+' -10L'+(x+34)+' 130Z" fill="'+l2+'" opacity=".85"/>';}
  }else if(p==="dots"){
    for(y=4;y<125;y+=9)for(x=((y/9)%2)*5;x<305;x+=10){var r=1.3+R()*1.5;s+='<circle cx="'+(x+R()*2).toFixed(1)+'" cy="'+(y+R()*2).toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+(R()>.5?l1:l2)+'" opacity="'+(.55+R()*.35).toFixed(2)+'"/>';}
  }else if(p==="camo"){
    var cols=[dk,md,l1,l2];
    for(i=0;i<46;i++){var cx=R()*310,cy=R()*130;
      s+='<path d="M'+cx.toFixed(0)+' '+cy.toFixed(0)+'q'+(R()*30-8).toFixed(0)+' '+(-14-R()*10).toFixed(0)+' '+(18+R()*22).toFixed(0)+' '+(R()*8-4).toFixed(0)+'q'+(R()*10).toFixed(0)+' '+(12+R()*10).toFixed(0)+' '+(-14-R()*18).toFixed(0)+' '+(10+R()*6).toFixed(0)+'q'+(-10-R()*10).toFixed(0)+' '+(-6)+' '+(-4-R()*6).toFixed(0)+' '+(-16)+'Z" fill="'+cols[i%4]+'" opacity="'+(.7+R()*.25).toFixed(2)+'"/>';}
  }else if(p==="flame"){
    for(x=-10;x<310;x+=18){var hg=40+R()*70,b=130;
      s+='<path d="M'+x+' '+b+'C'+(x-8)+' '+(b-hg*.5)+' '+(x+8)+' '+(b-hg*.7)+' '+(x+10)+' '+(b-hg)+'C'+(x+16)+' '+(b-hg*.6)+' '+(x+30)+' '+(b-hg*.4)+' '+(x+20)+' '+b+'Z" fill="'+l1+'" opacity=".88"/>';
      s+='<path d="M'+(x+4)+' '+b+'C'+(x+2)+' '+(b-hg*.4)+' '+(x+8)+' '+(b-hg*.5)+' '+(x+10)+' '+(b-hg*.62)+'C'+(x+13)+' '+(b-hg*.4)+' '+(x+20)+' '+(b-hg*.3)+' '+(x+16)+' '+b+'Z" fill="#f4d98a" opacity=".7"/>';}
  }else if(p==="hex"){
    for(var r2=0;r2<14;r2++)for(var c=0;c<22;c++){var cx2=c*15+(r2%2?7.5:0),cy2=r2*13;
      s+='<path d="M'+cx2+' '+(cy2-7)+'l6.5 3.7v7.4l-6.5 3.7l-6.5-3.7v-7.4z" fill="'+(R()>.7?l1:"none")+'" fill-opacity=".4" stroke="'+l1+'" stroke-width="1" opacity=".75"/>';}
  }else if(p==="wave"){
    for(i=0;i<11;i++){y=i*12-4;var d="M-12 "+y;for(var k=0;k<14;k++)d+="q12-11 24 0t24 0";
      s+='<path d="'+d+'" fill="none" stroke="'+(i%2?l2:l1)+'" stroke-width="2.6" opacity=".72"/>';}
  }
  return s;
}
function buildSVG(it,f,hq){
  var D=modelOf(it),h=it.h,seed=hash(it.n+"|"+f),R=rng(seed),k="a"+(++uid),sn=(seed%97)+1,i;
  var skinD=D.skin.join(""),metD=D.metal.join(""),darkD=D.dark.join(""),allD=skinD+metD+darkD;
  var thr=Math.max(.52,.76-.22*f);
  var o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><defs>'];
  /* farba: łagodniejszy gradient lakieru */
  o.push('<linearGradient id="'+k+'k" gradientUnits="userSpaceOnUse" x1="0" y1="26" x2="0" y2="114"><stop offset="0" stop-color="hsl('+h+',46%,66%)"/><stop offset=".4" stop-color="hsl('+h+',54%,38%)"/><stop offset="1" stop-color="hsl('+h+',50%,15%)"/></linearGradient>');
  /* stal: ciemny gunmetal z wąskim refleksem */
  o.push('<linearGradient id="'+k+'m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe5ee"/><stop offset=".12" stop-color="#8a95a5"/><stop offset=".34" stop-color="#47505d"/><stop offset=".62" stop-color="#262c35"/><stop offset=".86" stop-color="#3a424d"/><stop offset="1" stop-color="#14181e"/></linearGradient>');
  /* polimer: matowy */
  o.push('<linearGradient id="'+k+'d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6674"/><stop offset=".3" stop-color="#2b313a"/><stop offset=".8" stop-color="#14171d"/><stop offset="1" stop-color="#1f242b"/></linearGradient>');
  o.push('<linearGradient id="'+k+'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".32" stop-color="#fff" stop-opacity=".05"/><stop offset=".46" stop-color="#fff" stop-opacity=".26"/><stop offset=".58" stop-color="#fff" stop-opacity="0"/></linearGradient>');
  o.push('<linearGradient id="'+k+'h" gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="112"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>');
  o.push('<linearGradient id="'+k+'v" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#1a120a" stop-opacity="0"/><stop offset="1" stop-color="#1a120a" stop-opacity=".75"/></linearGradient>');
  o.push('<radialGradient id="'+k+'l"><stop offset="0" stop-color="#cdeeff"/><stop offset=".45" stop-color="#3b86c4"/><stop offset="1" stop-color="#06101a"/></radialGradient>');
  if(hq){
    o.push('<filter id="'+k+'t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="'+sn+'" result="n"/><feDiffuseLighting in="n" lighting-color="#fff" surfaceScale=".8" diffuseConstant="1.05" result="l"><feDistantLight azimuth="235" elevation="62"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.25" k2="0" k3="0" k4="0"/></filter>');
    o.push(noiseF(k+"b1",".01 .9",2,sn,[0,0,0],1.9,-.7));
    o.push(noiseF(k+"b2",".01 .9",2,sn+3,[1,1,1],-1.9,1.1));
    o.push(noiseF(k+"gr",".95",1,sn+7,[0,0,0],1.2,-.42));
    o.push(noiseF(k+"c1",".04",3,sn,[.1,.11,.13],18,-18*(thr-.035)));
    o.push(noiseF(k+"c2",".04",3,sn,[.68,.71,.76],18,-18*thr));
    o.push('<filter id="'+k+'i" x="-5%" y="-10%" width="110%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>');
  }
  o.push('<filter id="'+k+'s"><feGaussianBlur stdDeviation="4"/></filter>');
  o.push('<clipPath id="'+k+'sc"><path d="'+skinD+'"/></clipPath><clipPath id="'+k+'mc"><path d="'+metD+'"/></clipPath><clipPath id="'+k+'dc"><path d="'+darkD+'"/></clipPath><clipPath id="'+k+'ac"><path d="'+allD+'"/></clipPath>');
  o.push('</defs>');
  o.push('<ellipse cx="150" cy="114" rx="122" ry="4.5" fill="#000" opacity=".42" filter="url(#'+k+'s)"/>');
  /* polimer + ziarno */
  D.dark.forEach(function(d){o.push('<path d="'+d+'" fill="url(#'+k+'d)"/>');});
  if(hq)o.push('<g clip-path="url(#'+k+'dc)"><rect width="300" height="120" filter="url(#'+k+'gr)" opacity=".55"/></g>');
  /* stal */
  D.metal.forEach(function(d){o.push('<path d="'+d+'" fill="url(#'+k+'m)"/>');});
  if(hq)o.push('<g clip-path="url(#'+k+'mc)"><rect width="300" height="120" filter="url(#'+k+'b1)" opacity=".55"/><rect width="300" height="120" filter="url(#'+k+'b2)" opacity=".22"/><rect width="300" height="120" filter="url(#'+k+'gr)" opacity=".3"/></g>');
  /* cień kontaktowy skórki na metalu i polimerze */
  o.push('<path d="'+skinD+'" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="3" transform="translate(0,1.4)"'+(hq?' filter="url(#'+k+'i)"':'')+'/>');
  /* lakier */
  o.push('<g clip-path="url(#'+k+'sc)"><g'+(hq?' filter="url(#'+k+'t)"':'')+'><rect width="300" height="120" fill="url(#'+k+'k)"/>'+pat(it.p,h,R)+'</g>');
  o.push('<rect width="300" height="120" fill="url(#'+k+'h)"/>');
  /* wewnętrzny cień przy krawędziach */
  o.push('<path d="'+skinD+'" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5"'+(hq?' filter="url(#'+k+'i)"':'')+'/>');
  o.push('<rect width="300" height="120" fill="url(#'+k+'v)" opacity="'+(f*.9).toFixed(2)+'"/>');
  if(f>.07){
    if(hq)o.push('<rect width="300" height="120" filter="url(#'+k+'c1)"/><rect width="300" height="120" filter="url(#'+k+'c2)"/>');
    var sc="",n=Math.round(4+f*40),x,y,L,a;
    for(i=0;i<n;i++){x=R()*290;y=26+R()*86;L=8+R()*34;a=(R()-.5)*.5;
      sc+='<path d="M'+x.toFixed(1)+' '+y.toFixed(1)+'l'+(Math.cos(a)*L).toFixed(1)+' '+(Math.sin(a)*L).toFixed(1)+'" stroke="#fff" stroke-opacity="'+(.15+R()*.3).toFixed(2)+'" stroke-width="'+(.4+R()*.5).toFixed(2)+'"/>';
      sc+='<path d="M'+x.toFixed(1)+' '+(y+.9).toFixed(1)+'l'+(Math.cos(a)*L).toFixed(1)+' '+(Math.sin(a)*L).toFixed(1)+'" stroke="#000" stroke-opacity=".22" stroke-width=".5"/>';}
    o.push(sc);
  }
  /* połysk lakieru: miękki pas światła */
  o.push('<rect width="300" height="120" fill="url(#'+k+'g)" opacity="'+((1-f)*.5+.08).toFixed(2)+'"/>');
  o.push('</g>');
  /* fazowanie: jasna górna, ciemna dolna krawędź */
  o.push('<g clip-path="url(#'+k+'ac)"><g transform="translate(0,.9)"><path d="'+allD+'" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.1"/></g><g transform="translate(0,-.9)"><path d="'+allD+'" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.1"/></g></g>');
  o.push('<path d="'+D.lines+'" fill="none" stroke="#05070a" stroke-opacity=".6" stroke-width=".9" stroke-linecap="round"/>');
  o.push('<path d="'+D.lines+'" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width=".7" stroke-linecap="round" transform="translate(0,.9)"/>');
  o.push('<path d="'+D.hi+'" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>');
  if(D.ex)o.push(D.ex(k));
  if(D.glass)D.glass.forEach(function(g){o.push('<ellipse cx="'+g[0]+'" cy="'+g[1]+'" rx="'+g[2]+'" ry="'+g[3]+'" fill="url(#'+k+'l)" stroke="#05070a" stroke-width=".9"/><ellipse cx="'+(g[0]-g[2]*.3).toFixed(1)+'" cy="'+(g[1]-g[3]*.35).toFixed(1)+'" rx="'+(g[2]*.35).toFixed(1)+'" ry="'+(g[3]*.4).toFixed(1)+'" fill="#fff" opacity=".7"/>');});
  if(it.st)o.push('<rect x="'+D.st[0]+'" y="'+D.st[1]+'" width="24" height="9" rx="1.5" fill="#150c05" stroke="#ff9a3d" stroke-width=".8"/><text x="'+(D.st[0]+12)+'" y="'+(D.st[1]+7)+'" font-family="monospace" font-size="7" font-weight="700" fill="#ff9a3d" text-anchor="middle">'+("0"+Math.floor(R()*900+10)).slice(-4)+'</text>');
  o.push('<path d="'+allD+'" fill="none" stroke="#020305" stroke-opacity=".75" stroke-width=".9" stroke-linejoin="round"/>');
  o.push('</svg>');
  return o.join("");
}
var ART={};
function artURL(it){
  var f=(typeof it.f==="number")?it.f:.03,hq=PR.hq!==false;
  var fb=Math.round(f*25)/25;
  var key=it.n+"|"+fb+"|"+(it.st?1:0)+"|"+(hq?1:0);
  if(!ART[key])ART[key]="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(buildSVG(it,fb,hq));
  return ART[key];
}
function art(it){return '<img class="wimg" alt="'+esc(it.n)+'" src="'+artURL(it)+'" decoding="async" draggable="false">';}

/* skrzynka */
var CR={};
function symOf(id,c){
  var i,s="",a;
  var F='fill="'+c+'" stroke="#05070a" stroke-width="1.4" stroke-linejoin="round"';
  switch(id){
  case "stal":
    for(i=0;i<8;i++){a=i*45;s+='<rect x="-3.5" y="-19" width="7" height="8" '+F+' transform="rotate('+a+')"/>';}
    return s+'<circle r="14" '+F+'/><circle r="5.5" fill="#0a0d12" stroke="#05070a" stroke-width="1.2"/>';
  case "las":return '<path d="M-15 14Q-18 -10 14 -16Q18 14 -15 14Z" '+F+'/><path d="M-15 14Q0 -2 12 -12" fill="none" stroke="#05070a" stroke-width="1.6" stroke-opacity=".7"/>';
  case "neon":return '<path d="M4 -19L-10 3H-1L-5 19L11 -5H2Z" '+F+'/>';
  case "wulkan":return '<path d="M-18 16L-6 -6L0 2L6 -14L18 16Z" '+F+'/><path d="M-3 -10Q0 -20 6 -22" fill="none" stroke="'+c+'" stroke-width="2.4" stroke-linecap="round"/>';
  case "pustynia":
    for(i=0;i<8;i++)s+='<path d="M0 -20V-14" stroke="'+c+'" stroke-width="3" stroke-linecap="round" transform="rotate('+(i*45)+')"/>';
    return s+'<circle r="10" '+F+'/>';
  case "arktyka":
    for(i=0;i<3;i++)s+='<path d="M0 -19V19M-5 -14L0 -9L5 -14M-5 14L0 9L5 14" fill="none" stroke="'+c+'" stroke-width="2.6" stroke-linecap="round" transform="rotate('+(i*60)+')"/>';
    return s;
  case "kosmos":return '<path d="M0 -18L5 -6L18 -6L8 3L12 16L0 8L-12 16L-8 3L-18 -6L-5 -6Z" '+F+'/>';
  case "zloto":return '<path d="M0 -17L15 -4L0 17L-15 -4Z" '+F+'/><path d="M-15 -4H15M-6 -4L0 -17L6 -4L0 17Z" fill="none" stroke="#05070a" stroke-opacity=".6" stroke-width="1.1"/>';
  case "podworko":return '<circle r="17" '+F+'/><circle r="10" fill="#0a0d12" stroke="#05070a"/><circle r="4" '+F+'/><path d="M-22 0H-12M12 0H22M0 -22V-12M0 12V22" stroke="'+c+'" stroke-width="2.4"/>';
  case "rafa":return '<path d="M-19 -9Q-14 -15 -9.5 -9T0 -9T9.5 -9T19 -9M-19 1Q-14 -5 -9.5 1T0 1T9.5 1T19 1M-19 11Q-14 5 -9.5 11T0 11T9.5 11T19 11" fill="none" stroke="'+c+'" stroke-width="3.4" stroke-linecap="round"/>';
  case "burza":return '<path d="M-15 3Q-18 -6 -8 -6Q-6 -16 5 -12Q15 -13 14 -3Q19 3 12 5Z" '+F+'/><path d="M2 5L-5 15H0L-3 22L7 11H2Z" fill="#fff" stroke="#05070a" stroke-width="1.2"/>';
  case "rubin":return '<path d="M-13 -5L-7 -15H7L13 -5L0 17Z" '+F+'/><path d="M-13 -5H13M-7 -15L-3 -5L0 17L3 -5L7 -15" fill="none" stroke="#05070a" stroke-opacity=".6" stroke-width="1.1"/>';
  }
  return '<path d="M0 -17L15 0L0 17L-15 0Z" '+F+'/>';
}
function crateURL(h,id){
  var ck=h+"|"+(id||"");
  if(CR[ck])return CR[ck];
  var k="z"+(++uid),s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 210"><defs>',i;
  var ac="hsl("+((h+22)%360)+",92%,60%)";
  s+='<linearGradient id="'+k+'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl('+h+',24%,44%)"/><stop offset=".5" stop-color="hsl('+h+',26%,26%)"/><stop offset="1" stop-color="hsl('+h+',28%,11%)"/></linearGradient>';
  s+='<linearGradient id="'+k+'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl('+h+',44%,62%)"/><stop offset=".45" stop-color="hsl('+h+',48%,38%)"/><stop offset="1" stop-color="hsl('+h+',52%,20%)"/></linearGradient>';
  s+='<linearGradient id="'+k+'m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a414c"/><stop offset=".22" stop-color="#e2e8f0"/><stop offset=".5" stop-color="#8793a3"/><stop offset=".78" stop-color="#475060"/><stop offset="1" stop-color="#20262f"/></linearGradient>';
  s+='<linearGradient id="'+k+'p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b222c"/><stop offset="1" stop-color="#090c11"/></linearGradient>';
  s+='<radialGradient id="'+k+'g"><stop offset="0" stop-color="hsl('+h+',95%,70%)" stop-opacity=".9"/><stop offset=".45" stop-color="hsl('+h+',95%,55%)" stop-opacity=".4"/><stop offset="1" stop-color="hsl('+h+',95%,50%)" stop-opacity="0"/></radialGradient>';
  s+='<linearGradient id="'+k+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl('+h+',100%,78%)" stop-opacity="0"/><stop offset=".5" stop-color="hsl('+h+',100%,80%)" stop-opacity=".95"/><stop offset="1" stop-color="hsl('+h+',100%,78%)" stop-opacity="0"/></linearGradient>';
  s+='<filter id="'+k+'t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".85 .35" numOctaves="2" seed="4" result="n"/><feDiffuseLighting in="n" lighting-color="#fff" surfaceScale="1.1" result="l"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.3" k2="0" k3="0" k4="0"/></filter>';
  s+='<filter id="'+k+'f"><feGaussianBlur stdDeviation="5"/></filter><filter id="'+k+'e"><feGaussianBlur stdDeviation="1.6"/></filter>';
  s+='<clipPath id="'+k+'h"><rect x="30" y="82" width="240" height="16"/></clipPath></defs>';
  s+='<ellipse cx="150" cy="197" rx="128" ry="8" fill="#000" opacity=".55" filter="url(#'+k+'f)"/>';
  /* korpus */
  s+='<path d="M32 96H268V172Q268 186 254 186H46Q32 186 32 172Z" fill="url(#'+k+'b)" filter="url(#'+k+'t)"/>';
  s+='<path d="M40 104H260V176Q260 180 256 180H44Q40 180 40 176Z" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/><path d="M41 105H259" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/>';
  s+='<path d="M32 96V70Q32 40 62 40H238Q268 40 268 70V96Z" fill="url(#'+k+'l)" filter="url(#'+k+'t)"/>';
  s+='<path d="M40 60Q44 46 62 46H238" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2.4" stroke-linecap="round"/>';
  s+='<path d="M42 90V72Q42 52 62 52" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/>';
  /* pas ostrzegawczy */
  s+='<g clip-path="url(#'+k+'h)"><rect x="30" y="82" width="240" height="16" fill="#0a0c10"/>';
  for(i=-2;i<22;i++)s+='<path d="M'+(30+i*14)+' 98L'+(44+i*14)+' 82H'+(52+i*14)+'L'+(38+i*14)+' 98Z" fill="'+ac+'"/>';
  s+='<rect x="30" y="82" width="240" height="4" fill="#fff" opacity=".18"/><rect x="30" y="94" width="240" height="4" fill="#000" opacity=".35"/></g>';
  /* świecąca szczelina */
  s+='<rect x="34" y="97" width="232" height="3" fill="url(#'+k+'s)" filter="url(#'+k+'e)"/><path d="M32 98H268" stroke="#05070a" stroke-width="1.6"/>';
  /* uchwyt */
  s+='<path d="M112 42V28Q112 18 124 18H176Q188 18 188 28V42" fill="none" stroke="#05070a" stroke-width="11" stroke-linecap="round"/><path d="M112 42V28Q112 18 124 18H176Q188 18 188 28V42" fill="none" stroke="url(#'+k+'m)" stroke-width="6.5" stroke-linecap="round"/>';
  /* pasy stalowe + nity */
  [[56],[230]].forEach(function(p){var x=p[0];
    s+='<rect x="'+x+'" y="42" width="16" height="142" fill="url(#'+k+'m)" stroke="#05070a" stroke-width="1.6"/>';
    [56,92,130,170].forEach(function(y){s+='<circle cx="'+(x+8)+'" cy="'+y+'" r="3.1" fill="#2a313b" stroke="#aab3c0" stroke-width=".9"/><circle cx="'+(x+7)+'" cy="'+(y-1)+'" r="1" fill="#fff" fill-opacity=".6"/>';});});
  /* narożniki */
  s+='<path d="M32 172V150H44V174H70V186H46Q32 186 32 172Z" fill="url(#'+k+'m)" stroke="#05070a" stroke-width="1.4"/><path d="M268 172V150H256V174H230V186H254Q268 186 268 172Z" fill="url(#'+k+'m)" stroke="#05070a" stroke-width="1.4"/>';
  /* zatrzaski */
  [[116],[168]].forEach(function(p){var x=p[0];
    s+='<rect x="'+x+'" y="86" width="16" height="26" rx="3" fill="url(#'+k+'m)" stroke="#05070a" stroke-width="1.6"/><rect x="'+(x+3)+'" y="92" width="10" height="9" rx="2" fill="#0d1117" stroke="#c4ccd6" stroke-width=".8"/><circle cx="'+(x+8)+'" cy="106" r="2" fill="#20262e"/>';});
  /* tablica z godłem */
  s+='<circle cx="150" cy="144" r="46" fill="url(#'+k+'g)"/>';
  s+='<rect x="96" y="118" width="108" height="56" rx="6" fill="url(#'+k+'p)" stroke="#05070a" stroke-width="2"/><rect x="99" y="121" width="102" height="50" rx="4" fill="none" stroke="'+ac+'" stroke-opacity=".75" stroke-width="1.4"/>';
  [[102,124],[198,124],[102,168],[198,168]].forEach(function(p){s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.8" fill="#8793a3"/>';});
  s+='<g transform="translate(150 146) scale(1.08)">'+symOf(id,ac)+'</g>';
  s+='<path d="M96 124Q96 118 102 118H198" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.4"/>';
  s+='</svg>';
  CR[ck]="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s);
  return CR[ck];
}
function crateImg(h,id){return '<img src="'+crateURL(h,id)+'" alt="Skrzynka" decoding="async" draggable="false">';}

/* ================= STAN ================= */
var KEY="skrzynkomat.v1",PK="skrzynkomat.prefs";
function fresh(){return {bal:200,inv:[],spent:0,sold:0,opened:0,tiers:[0,0,0,0,0],best:null,hist:[],seq:0,topped:0,ex:{up:0,upW:0,con:0},xp:0,bat:{w:0,l:0,t:0,hist:[]},nick:"",col:0};}
var S=fresh();
try{var raw=localStorage.getItem(KEY);if(raw){var p0=JSON.parse(raw);if(p0&&typeof p0.bal==="number")S=Object.assign(fresh(),p0);}}catch(e){}
if(!S.ex)S.ex={up:0,upW:0,con:0};
if(!S.bat||typeof S.bat!=="object")S.bat={w:0,l:0,t:0,hist:[]};
if(!S.bat.hist)S.bat.hist=[];
if(typeof S.xp!=="number")S.xp=0;
if(typeof S.col!=="number")S.col=0;
if(typeof S.nick!=="string"||!S.nick)S.nick="Gracz"+(1000+Math.floor(Math.random()*9000));
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}if(typeof pushLb==="function")pushLb();}
var PR={snd:true,ui:true,vol:70,fast:false,fx:true,hq:true,rounds:3};
try{var pr=JSON.parse(localStorage.getItem(PK)||"null");if(pr)PR=Object.assign(PR,pr);}catch(e){}
function savePrefs(){try{localStorage.setItem(PK,JSON.stringify(PR));}catch(e){}}
var $=function(s){return document.querySelector(s);};
function fmt(v){return v.toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł";}
var MQ=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
var REDUCED=MQ||!PR.fx;

/* ================= LOSOWANIE ================= */
function rollTier(){var r=Math.random(),a=0;for(var i=0;i<TIERS.length;i++){a+=TIERS[i].odds;if(r<a)return i;}return 0;}
function rollWear(){
  var f=Math.random()<.55?.45+Math.random()*.55:Math.random()*.45,wi=0;
  for(wi=0;wi<WEARS.length;wi++){if(f<=WEARS[wi].max)break;}
  return {i:Math.min(wi,4),f:f};
}
function priceOf(it,c,wi,st){return Math.max(.05,Math.round(TIERS[it.tier].base*c.mult*it.v*WEARS[wi].m*(st?1.6:1)*100)/100);}
function makeItem(c,tier,calm){
  var pool=c.items[tier],b=pool[Math.floor(Math.random()*pool.length)];
  var w=rollWear(),st=Math.random()<.1;
  if(calm){var fs=[.03,.3,.7];w={f:fs[Math.floor(Math.random()*3)],i:0};st=false;}
  var o={uid:++S.seq,case:c.id,tier:tier,n:b.n,t:b.t,h:b.h,p:b.p,v:b.v,wear:w.i,f:w.f,st:st};
  o.price=priceOf(o,c,w.i,st);return o;
}

/* ================= DŹWIĘK (WebAudio, wszystko syntezowane) ================= */
var AU={ctx:null,master:null,rev:null,nb:null};
function ac(){
  if(!PR.snd)return null;
  if(!AU.ctx){
    try{
      var C=window.AudioContext||window.webkitAudioContext,c=new C(),comp=c.createDynamicsCompressor();
      AU.ctx=c;AU.master=c.createGain();AU.master.gain.value=PR.vol/100;AU.master.connect(comp);comp.connect(c.destination);
      var len=Math.floor(c.sampleRate*1.8),b=c.createBuffer(2,len,c.sampleRate);
      for(var ch=0;ch<2;ch++){var d=b.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}
      AU.rev=c.createConvolver();AU.rev.buffer=b;var rg=c.createGain();rg.gain.value=.5;AU.rev.connect(rg);rg.connect(comp);
      var nl=c.sampleRate*2,nb=c.createBuffer(1,nl,c.sampleRate),nd=nb.getChannelData(0);for(var j=0;j<nl;j++)nd[j]=Math.random()*2-1;AU.nb=nb;
    }catch(e){AU.ctx=null;return null;}
  }
  if(AU.ctx.state==="suspended"){try{AU.ctx.resume();}catch(e){}}
  return AU.ctx;
}
function env(g,t,a,d,v){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
function tone(f,t,d,type,v,o){
  var c=ac();if(!c)return;o=o||{};
  var os=c.createOscillator(),g=c.createGain(),a=o.a||.005;
  os.type=type||"sine";os.frequency.setValueAtTime(f,t);if(o.to)os.frequency.exponentialRampToValueAtTime(o.to,t+d);
  env(g,t,a,d,v||.1);
  if(o.lp){var fl=c.createBiquadFilter();fl.type="lowpass";fl.frequency.setValueAtTime(o.lp,t);if(o.lpTo)fl.frequency.exponentialRampToValueAtTime(o.lpTo,t+d);os.connect(fl);fl.connect(g);}else os.connect(g);
  g.connect(AU.master);
  if(o.rev){var rg=c.createGain();rg.gain.value=o.rev;g.connect(rg);rg.connect(AU.rev);}
  os.start(t);os.stop(t+a+d+.05);
}
function noise(t,d,type,f,v,o){
  var c=ac();if(!c)return;o=o||{};
  var s=c.createBufferSource(),g=c.createGain(),fl=c.createBiquadFilter();
  s.buffer=AU.nb;fl.type=type;fl.frequency.setValueAtTime(f,t);if(o.fTo)fl.frequency.exponentialRampToValueAtTime(o.fTo,t+d);fl.Q.value=o.q||1;
  env(g,t,o.a||.005,d,v);s.connect(fl);fl.connect(g);g.connect(AU.master);
  if(o.rev){var rg=c.createGain();rg.gain.value=o.rev;g.connect(rg);rg.connect(AU.rev);}
  s.start(t,Math.random());s.stop(t+(o.a||.005)+d+.05);
}
var SFX={
  click:function(){var c=ac();if(!c||PR.ui===false)return;tone(1500,c.currentTime,.04,"triangle",.05);},
  tick:function(){var c=ac();if(!c)return;var t=c.currentTime;noise(t,.03,"bandpass",2600+Math.random()*500,.1,{q:6});tone(480+Math.random()*70,t,.06,"sine",.06);},
  rumble:function(){var c=ac();if(!c)return;var t=c.currentTime;noise(t,.95,"lowpass",120,.35,{fTo:320,a:.1});for(var i=0;i<8;i++)noise(t+i*.11,.05,"bandpass",1500+Math.random()*1800,.09,{q:4});},
  clank:function(){var c=ac();if(!c)return;var t=c.currentTime;tone(190,t,.35,"square",.07,{lp:1800});tone(285,t,.3,"square",.05,{lp:2200});noise(t,.14,"highpass",3500,.14);tone(90,t,.5,"sine",.3,{to:38});},
  whoosh:function(){var c=ac();if(!c)return;noise(c.currentTime,.7,"bandpass",300,.2,{q:1.2,fTo:3800,a:.15});},
  reveal:function(tier){
    var c=ac();if(!c)return;var t=c.currentTime,i;
    if(tier===0){tone(392,t,.25,"triangle",.1,{rev:.2});tone(523,t+.08,.3,"triangle",.07,{rev:.2});}
    else if(tier===1){tone(523,t,.5,"sine",.12,{rev:.5});tone(659,t+.12,.55,"sine",.11,{rev:.5});tone(784,t+.24,.7,"sine",.09,{rev:.6});}
    else if(tier===2){[523,659,784,1047,1319].forEach(function(f,j){tone(f,t+j*.09,.7,"triangle",.1,{rev:.6});});noise(t,.5,"highpass",5000,.05,{rev:.5});tone(130,t,.6,"sine",.2,{to:60});}
    else if(tier===3){
      noise(t,.6,"bandpass",200,.2,{q:2,fTo:4200,a:.3});tone(110,t,.6,"sawtooth",.05,{to:440,lp:600,lpTo:3200});
      var u=t+.6;[220,261.6,329.6].forEach(function(f){tone(f,u,1.3,"sawtooth",.07,{lp:2400,rev:.5});tone(f*2,u,1.3,"triangle",.05,{rev:.5});});
      tone(55,u,1.5,"sine",.45,{to:34});noise(u,.3,"lowpass",800,.25);
      for(i=0;i<6;i++)tone(1800+Math.random()*2500,u+.1+i*.11,.4,"sine",.04,{rev:.8});
    }else{
      noise(t,1,"bandpass",160,.22,{q:2,fTo:5200,a:.5});tone(98,t,1,"sawtooth",.05,{to:520,lp:500,lpTo:4200});
      var w=t+1;[261.6,329.6,392,523.2].forEach(function(f,j){tone(f,w+j*.05,2.2,"sawtooth",.07,{lp:3200,rev:.6});tone(f*2,w+j*.05,2.2,"triangle",.06,{rev:.7});});
      tone(49,w,2,"sine",.55,{to:30});noise(w,.4,"lowpass",1000,.35);
      [1046.5,1318.5,1568,2093].forEach(function(f,j){tone(f,w+.25+j*.14,1.4,"sine",.08,{rev:.9});});
      for(i=0;i<14;i++)tone(2200+Math.random()*3800,w+Math.random()*1.6,.5,"sine",.035,{rev:.9});
    }
  },
  sell:function(){var c=ac();if(!c)return;var t=c.currentTime;tone(1318,t,.45,"sine",.12,{rev:.3});tone(1760,t+.09,.6,"sine",.1,{rev:.3});noise(t,.03,"highpass",6000,.08);},
  coins:function(){var c=ac();if(!c)return;var t=c.currentTime;for(var i=0;i<6;i++){tone(1500+Math.random()*900,t+i*.07,.35,"sine",.08,{rev:.3});}},
  err:function(){var c=ac();if(!c)return;tone(150,c.currentTime,.14,"square",.07,{lp:500});},
  lose:function(){var c=ac();if(!c)return;var t=c.currentTime;tone(330,t,.6,"sawtooth",.07,{to:70,lp:1200,lpTo:200});tone(165,t+.15,.7,"square",.05,{to:50,lp:500});noise(t,.4,"lowpass",600,.18,{fTo:90});},
  hover:function(){var c=ac();if(!c||PR.ui===false)return;tone(880,c.currentTime,.03,"sine",.025);},
  start:function(){var c=ac();if(!c)return;var t=c.currentTime;tone(220,t,.9,"sawtooth",.04,{lp:900,rev:.6});tone(330,t+.05,.9,"sawtooth",.035,{lp:1200,rev:.6});tone(440,t+.1,1.1,"triangle",.05,{rev:.7});}
};

/* ================= EFEKTY (cząsteczki, błysk, wstrząs) ================= */
var fx=$("#fx"),fc=fx.getContext("2d"),parts=[],fxRun=false;
function fxSize(){var d=Math.min(2,window.devicePixelRatio||1);fx.width=innerWidth*d;fx.height=innerHeight*d;fc.setTransform(d,0,0,d,0,0);}
fxSize();window.addEventListener("resize",fxSize);
function rgb(hex){var n=parseInt(hex.slice(1),16);return [n>>16,(n>>8)&255,n&255];}
function burst(x,y,hex,n,gold){
  var c=rgb(hex),i;if(REDUCED)n=Math.round(n/4);
  for(i=0;i<n;i++){
    var a=Math.random()*Math.PI*2,sp=(gold?3:2)+Math.random()*(gold?13:9);
    parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,l:1,d:.008+Math.random()*.014,c:c,s:1+Math.random()*2.2,k:"s"});
  }
  if(gold){for(i=0;i<Math.round(n/3);i++){parts.push({x:x+(Math.random()-.5)*innerWidth*.6,y:-20-Math.random()*200,vx:(Math.random()-.5)*3,vy:2+Math.random()*4,l:1,d:.004+Math.random()*.004,c:rgb(["#ffc247","#fff2b0","#ff9a3d","#ffffff"][i%4]),s:4+Math.random()*5,k:"c",r:Math.random()*6,vr:(Math.random()-.5)*.4});}}
  if(!fxRun){fxRun=true;requestAnimationFrame(fxLoop);}
}
function fxLoop(){
  fc.clearRect(0,0,innerWidth,innerHeight);
  for(var i=parts.length-1;i>=0;i--){
    var p=parts[i];p.vy+=p.k==="s"?.22:.06;p.x+=p.vx;p.y+=p.vy;p.vx*=p.k==="s"?.985:.995;p.l-=p.d;
    if(p.l<=0||p.y>innerHeight+40){parts.splice(i,1);continue;}
    var col="rgba("+p.c[0]+","+p.c[1]+","+p.c[2]+","+Math.max(0,p.l)+")";
    if(p.k==="s"){fc.globalCompositeOperation="lighter";fc.strokeStyle=col;fc.lineWidth=p.s;fc.lineCap="round";fc.beginPath();fc.moveTo(p.x,p.y);fc.lineTo(p.x-p.vx*2.2,p.y-p.vy*2.2);fc.stroke();}
    else{fc.globalCompositeOperation="source-over";p.r+=p.vr;fc.save();fc.translate(p.x,p.y);fc.rotate(p.r);fc.fillStyle=col;fc.fillRect(-p.s,-p.s/2,p.s*2,p.s);fc.restore();}
  }
  if(parts.length)requestAnimationFrame(fxLoop);else{fxRun=false;fc.clearRect(0,0,innerWidth,innerHeight);}
}
function flash(color,peak,ms){
  var f=$("#flash");f.style.background=color;
  if(f.animate&&!REDUCED)f.animate([{opacity:peak},{opacity:0}],{duration:ms,easing:"ease-out"});
}
function ring(x,y,hex){var r=document.createElement("div");r.className="ring";r.style.left=x+"px";r.style.top=y+"px";r.style.setProperty("--rc",hex);document.body.appendChild(r);setTimeout(function(){r.remove();},950);}
function shake(){var s=$("#stageIn");s.classList.remove("shake");void s.offsetWidth;s.classList.add("shake");}

/* ================= WIDOKI ================= */
function toast(m){var t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(function(){t.style.display="none";},2200);}
function caseOf(id){return CASES.filter(function(c){return c.id===id;})[0];}
function itemCard(it,acts){
  var T=TIERS[it.tier];
  return '<div class="item'+(it.tier>=2?' hi':'')+'" style="--tc:'+T.c+'">'+(it.st?'<span class="st">LICZNIK</span>':'')+
   '<div class="art">'+art(it)+'</div><div class="nm">'+esc(it.n)+'</div>'+
   '<div class="wr">'+WEARS[it.wear].n+' · '+it.f.toFixed(4)+'</div>'+
   '<div class="pr">'+fmt(it.price)+'</div>'+(acts||"")+'</div>';
}
var shown=S.bal,twr=0;
function renderBal(){
  $("#invn").textContent=S.inv.length;
  var from=shown,to=S.bal,t0=performance.now(),el=$("#bal");
  cancelAnimationFrame(twr);
  if(from===to){el.textContent=fmt(to);return;}
  if(el.animate&&!REDUCED)el.animate([{color:to>from?"#5fd68a":"#ff6b6b"},{color:"#e8edf4"}],{duration:700});
  (function f(t){var k=Math.min(1,(t-t0)/450);shown=from+(to-from)*k;el.textContent=fmt(shown);if(k<1)twr=requestAnimationFrame(f);else shown=to;})(t0);
}
var NEWC=["podworko","rafa","burza","rubin"];
function renderCases(){
  $("#caseGrid").innerHTML=CASES.map(function(c){
    var top=c.items[4].map(function(b){return {b:b,p:priceOf(Object.assign({tier:4},b),c,2,false)};}).sort(function(a,b){return b.p-a.p;})[0];
    return '<article class="case"'+(NEWC.indexOf(c.id)>-1?' data-new="1"':'')+' style="--h:'+c.hue+'"><div class="art">'+crateImg(c.hue,c.id)+'</div><div class="info"><h3>'+c.name+'</h3>'+
     '<div class="meta">15 przedmiotów · 5 poziomów rzadkości</div>'+
     '<div class="chase"><span>Główna wygrana</span><b>'+esc(top.b.n)+'</b><em>ok. '+fmt(top.p)+'</em></div>'+
     '<div class="price">'+fmt(c.price)+'</div>'+
     '<div class="row"><button class="btn main" data-open="'+c.id+'" '+(S.bal<c.price?'disabled':'')+'>Otwórz</button><button class="btn" data-peek="'+c.id+'">Zawartość</button></div></div></article>';
  }).join("");
}
var invFilter=-1,invSort="new",confirmKey=null;
function renderInv(){
  var tools='<button class="chip" data-f="-1" aria-pressed="'+(invFilter===-1)+'">Wszystkie</button>'+
   TIERS.map(function(t,i){return '<button class="chip" data-f="'+i+'" aria-pressed="'+(invFilter===i)+'" style="'+(invFilter===i?'':'color:'+t.c)+'">'+t.n+'</button>';}).join("")+
   '<span style="flex:1"></span>'+
   '<button class="chip" data-s="new" aria-pressed="'+(invSort==="new")+'">Najnowsze</button>'+
   '<button class="chip" data-s="price" aria-pressed="'+(invSort==="price")+'">Najdroższe</button>'+
   '<button class="btn sm" data-bulk="low">'+(confirmKey==="low"?'Potwierdź: sprzedaj zwykłe i rzadkie':'Sprzedaj zwykłe i rzadkie')+'</button>'+
   '<button class="btn sm danger" data-bulk="all">'+(confirmKey==="all"?'Potwierdź: sprzedaj wszystko':'Sprzedaj wszystko')+'</button>';
  var list=S.inv.filter(function(i){return invFilter===-1||i.tier===invFilter;}).sort(function(a,b){return invSort==="price"?b.price-a.price:b.uid-a.uid;});
  var total=S.inv.reduce(function(s,i){return s+i.price;},0);
  $("#invTools").innerHTML=tools+'<span style="font:400 12px var(--mono);color:var(--mute)">Wartość: '+fmt(total)+'</span>';
  $("#invGrid").innerHTML=list.length?list.map(function(i){return itemCard(i,'<div class="act"><button class="btn sm" data-sell="'+i.uid+'">Sprzedaj</button></div>');}).join(""):
   '<div class="empty" style="grid-column:1/-1">'+(S.inv.length?'Brak przedmiotów w tym filtrze.':'Ekwipunek jest pusty. Otwórz pierwszą skrzynkę.')+'</div>';
}
function renderStats(){
  var invVal=S.inv.reduce(function(s,i){return s+i.price;},0),net=S.bal+invVal-200-S.topped;
  var tiles=[["Otwarte skrzynki",S.opened],["Upgrader (wygrane)",S.ex.upW+" / "+S.ex.up],["Kontrakty",S.ex.con],["Bitwy (W / P / R)",S.bat.w+" / "+S.bat.l+" / "+S.bat.t],["Wydano",fmt(S.spent)],["Zarobiono ze sprzedaży",fmt(S.sold)],["Wartość ekwipunku",fmt(invVal)],
   ["Wynik netto",'<span class="'+(net>=0?'pos':'neg')+'">'+(net>=0?'+':'')+fmt(net)+'</span>'],
   ["Najlepszy łup",S.best?'<span style="color:'+TIERS[S.best.tier].c+';font-size:15px">'+esc(S.best.n)+'</span><br><span style="font-size:14px">'+fmt(S.best.price)+'</span>':"-"]];
  $("#statTiles").innerHTML=tiles.map(function(t){return '<div class="stat"><small>'+t[0]+'</small><b>'+t[1]+'</b></div>';}).join("");
  $("#tierTable").innerHTML='<tr><th>Poziom</th><th>Wypadło</th><th>Twój udział</th><th>Szansa</th></tr>'+TIERS.map(function(t,i){
    var pc=S.opened?(S.tiers[i]/S.opened*100):0;
    return '<tr style="--tc:'+t.c+'"><td><span class="dot"></span>'+t.n+'</td><td>'+S.tiers[i]+'</td><td>'+pc.toFixed(2).replace(".",",")+'%</td><td>'+(t.odds*100).toFixed(2).replace(".",",")+'%</td></tr>';
  }).join("");
  $("#hist").innerHTML=S.hist.length?S.hist.slice(-40).reverse().map(function(t){return '<span style="--tc:'+TIERS[t].c+'" title="'+TIERS[t].n+'"></span>';}).join(""):'<div class="empty" style="width:100%">Jeszcze nic nie otwarto.</div>';
}
function renderAll(){renderBal();renderCases();renderInv();renderStats();renderMe();if(!$("#v-exch").hidden&&!EX.busy)renderEx();if(!$("#v-battle").hidden)renderBattle();if(!$("#v-top").hidden)renderTop();}
function showView(v){
  ["cases","battle","inv","exch","top","stats"].forEach(function(k){$("#v-"+k).hidden=k!==v;$("#tab-"+k).setAttribute("aria-selected",k===v);});
  renderAll();
}
function peek(id){
  var c=caseOf(id),h='<h2>'+c.name+'</h2><p class="sub">Cena: '+fmt(c.price)+'. Każdy przedmiot ma też 10% szans na licznik, który podnosi cenę o 60%. Podgląd pokazuje skórki prosto z fabryki.</p>';
  for(var t=4;t>=0;t--){
    h+='<div style="margin:16px 0 6px;font:700 16px var(--display);letter-spacing:.1em;text-transform:uppercase;color:'+TIERS[t].c+'">'+TIERS[t].n+' · '+(TIERS[t].odds*100).toFixed(2).replace(".",",")+'%</div><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">';
    c.items[t].forEach(function(b){
      h+='<div class="item'+(t>=2?' hi':'')+'" style="--tc:'+TIERS[t].c+'"><div class="art">'+art(b)+'</div><div class="nm">'+esc(b.n)+'</div><div class="pr" style="color:var(--mute);font-weight:400;font-size:12px">ok. '+fmt(priceOf(Object.assign({tier:t},b),c,2,false))+'</div></div>';
    });
    h+='</div>';
  }
  h+='<div style="margin-top:20px"><button class="btn main" id="cClose" type="button">Zamknij</button></div>';
  $("#cBox").innerHTML=h;$("#contents").classList.add("on");
  $("#cClose").onclick=function(){$("#contents").classList.remove("on");};
}

/* ================= OTWIERANIE ================= */
var cur=null,anim=null,timers=[];
function later(fn,ms){var t=setTimeout(fn,ms);timers.push(t);return t;}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function openCase(id){
  var c=caseOf(id);
  if(!c||S.bal<c.price){SFX.err();toast("Za mało salda. Doładuj lub sprzedaj przedmioty.");return;}
  clearTimers();cancelAnimationFrame(anim);
  S.bal=Math.round((S.bal-c.price)*100)/100;S.spent+=c.price;S.opened++;addXp(10);
  var win=makeItem(c,rollTier());
  S.inv.push(win);S.tiers[win.tier]++;S.hist.push(win.tier);
  if(!S.best||win.price>S.best.price)S.best={n:win.n,tier:win.tier,price:win.price};
  save();renderBal();
  cur={c:c,win:win,done:false,phase:"crate"};
  var N=64,WIN=52,tiles=[],i;
  for(i=0;i<N;i++)tiles.push(i===WIN?win:makeItem(c,rollTier(),true));
  var sc="hsl("+c.hue+",70%,45%)";
  var st=$("#stage");st.style.setProperty("--sc",sc);
  $("#stTitle").textContent=c.name;
  $("#strip").className="strip";
  $("#strip").innerHTML=tiles.map(function(it,i){
    return '<div class="tile" style="--tc:'+TIERS[it.tier].c+'"><span class="tt">'+TIERS[it.tier].n+'</span><div class="art">'+art(it)+'</div><div class="n">'+esc(it.n)+'</div></div>';
  }).join("");
  $("#strip").style.transform="translateX(0)";
  $("#rail").classList.remove("on");$("#rail").style.display="";
  $("#result").classList.remove("on");
  $("#stBtns").style.display="flex";
  var cb=$("#crateBox");cb.innerHTML=crateImg(c.hue,c.id);cb.className="crateBox";
  st.classList.add("on");st.scrollTop=0;document.body.style.overflow="hidden";
  if(PR.fast||REDUCED){cur.phase="roll";startRoll();return;}
  cb.classList.add("on","shaking");SFX.rumble();
  later(function(){cb.classList.remove("shaking");cb.classList.add("opening");SFX.clank();flash(sc,.5,400);burst(innerWidth/2,innerHeight/2,"#ffffff",40);},900);
  later(startRoll,1180);
  renderCases();
}
function startRoll(){
  if(!cur||cur.phase==="roll"&&cur.rolling)return;
  clearTimers();cur.phase="roll";cur.rolling=true;
  $("#crateBox").className="crateBox";
  $("#rail").classList.add("on");
  SFX.whoosh();
  var strip=$("#strip"),railW=$("#rail").clientWidth,tileW=strip.children[0].offsetWidth+8,WIN=52;
  var jitter=(Math.random()*.7-.35)*tileW;
  var target=WIN*tileW+tileW/2+jitter-railW/2;
  var dur=PR.fast?2400:6800,t0=null,last=-1,needle=$("#needle");
  cur.target=target;cur.WIN=WIN;
  function ease(x){return 1-Math.pow(1-x,4);}
  function step(ts){
    if(t0===null)t0=ts;
    var k=Math.min(1,(ts-t0)/dur),pos=target*ease(k);
    strip.style.transform="translateX("+(-pos)+"px)";
    var idx=Math.floor((pos+railW/2)/tileW);
    if(idx!==last){last=idx;SFX.tick();if(needle.animate&&!REDUCED)needle.animate([{transform:"translateX(-1.5px) scaleX(3)",filter:"brightness(2)"},{transform:"translateX(-1.5px) scaleX(1)",filter:"brightness(1)"}],{duration:110});}
    if(k<1)anim=requestAnimationFrame(step);else finish();
  }
  anim=requestAnimationFrame(step);
}
function finish(){
  if(!cur||cur.done)return;
  if(cur.phase==="crate"){
    cur.phase="roll";clearTimers();$("#crateBox").className="crateBox";$("#rail").classList.add("on");
    var s=$("#strip"),rw=$("#rail").clientWidth,tw=s.children[0].offsetWidth+8;cur.WIN=52;cur.target=52*tw+tw/2-rw/2;
  }
  cur.done=true;cancelAnimationFrame(anim);clearTimers();
  var strip=$("#strip");
  strip.style.transform="translateX("+(-cur.target)+"px)";
  strip.classList.add("done");strip.children[cur.WIN].classList.add("win");
  revealResult(cur.win,true);
}
function revealResult(w,again){
  var T=TIERS[w.tier];
  $("#stBtns").style.display="none";
  var r=$("#result");r.style.setProperty("--tc",T.c);
  $("#rT").textContent=T.n+(w.st?" · LICZNIK":"");
  $("#rArt").innerHTML=art(w);$("#rN").textContent=w.n;
  $("#rW").textContent=WEARS[w.wear].n+" · float "+w.f.toFixed(4);
  $("#rSell").textContent="Sprzedaj za "+fmt(w.price);
  $("#rAgain").style.display=again?"":"none";
  if(again)$("#rAgain").disabled=S.bal<cur.c.price;
  r.classList.remove("on");void r.offsetWidth;r.classList.add("on");
  $("#stage").style.setProperty("--sc",T.hex);
  var rc=$("#rArt").getBoundingClientRect(),cx=rc.left+rc.width/2,cy=rc.top+rc.height/2;
  if(cy<0||cy>innerHeight){cx=innerWidth/2;cy=innerHeight/2;}
  SFX.reveal(w.tier);
  var cnt=[26,60,120,220,360][w.tier];
  burst(cx,cy,T.hex,cnt,w.tier===4);
  if(w.tier>=1)ring(cx,cy,T.hex);
  if(w.tier>=2){flash(T.hex,w.tier===4?.85:.4,w.tier===4?900:500);}
  if(w.tier>=3&&!REDUCED){shake();later(function(){burst(cx,cy,T.hex,Math.round(cnt/2),w.tier===4);ring(cx,cy,T.hex);},350);}
  if(w.tier===4)later(function(){burst(innerWidth*.25,innerHeight*.6,"#ffc247",120,true);burst(innerWidth*.75,innerHeight*.6,"#fff2b0",120,true);},700);
  renderBal();renderStats();
}
function showResult(w,title){
  clearTimers();cancelAnimationFrame(anim);
  cur={c:null,win:w,done:true,phase:"x"};
  $("#stTitle").textContent=title;
  $("#crateBox").className="crateBox";
  $("#rail").classList.remove("on");$("#rail").style.display="none";
  $("#result").classList.remove("on");
  var st=$("#stage");st.classList.add("on");st.scrollTop=0;document.body.style.overflow="hidden";
  revealResult(w,false);
}
function closeStage(){
  cancelAnimationFrame(anim);clearTimers();
  if(cur&&!cur.done)cur.done=true;
  $("#stage").classList.remove("on");document.body.style.overflow="";
  save();renderAll();
}
function sell(uid){
  var ix=-1;for(var i=0;i<S.inv.length;i++)if(S.inv[i].uid===uid){ix=i;break;}
  if(ix<0)return 0;
  var it=S.inv.splice(ix,1)[0];
  S.bal=Math.round((S.bal+it.price)*100)/100;S.sold+=it.price;save();return it.price;
}

/* ================= PANELE ================= */
function panel(html){
  $("#cBox").innerHTML=html;$("#contents").classList.add("on");
  var f=$("#cBox .x");if(f&&f.focus)f.focus();
}
function mh(title){return '<div class="mh"><h2>'+title+'</h2><button class="x" id="cX" type="button" aria-label="Zamknij">&#10005;</button></div>';}
function syncPrefs(){
  REDUCED=MQ||!PR.fx;
  if(AU.master)AU.master.gain.value=PR.snd?PR.vol/100:0;
}
function swRow(key,title,desc,on){
  return '<div class="srow"><div><b>'+title+'</b><small>'+desc+'</small></div><button class="swb" type="button" role="switch" aria-checked="'+(!!on)+'" aria-label="'+title+'" data-tg="'+key+'"></button></div>';
}
function segRow(key,title,desc,opts,cur){
  return '<div class="srow"><div><b>'+title+'</b><small>'+desc+'</small></div><div class="seg" role="group" aria-label="'+title+'">'+opts.map(function(o){
    return '<button type="button" data-seg="'+key+'" data-sv="'+o[0]+'" aria-pressed="'+(String(cur)===String(o[0]))+'">'+o[1]+'</button>';
  }).join("")+'</div></div>';
}
var stTab="snd";
var ST_TABS=[["snd","Dźwięk"],["gfx","Grafika"],["game","Rozgrywka"],["profile","Profil"],["data","Dane"]];
function settingsBody(){
  var h="",L=lvlOf(S.xp);
  if(stTab==="snd"){
    h+=swRow("snd","Dźwięk","Główny przełącznik wszystkich odgłosów",PR.snd);
    h+='<div class="srow"><div><b>Głośność</b><small>Ogólny poziom dźwięku</small></div><div class="rng"><input id="sVol" type="range" min="0" max="100" value="'+PR.vol+'" aria-label="Głośność"><output id="sVolO">'+PR.vol+'%</output></div></div>';
    h+=swRow("ui","Dźwięki interfejsu","Kliknięcia i najechanie na przyciski menu",PR.ui);
    h+='<div class="srow"><div><b>Test dźwięku</b><small>Odtwarza krótki sygnał z aktualną głośnością</small></div><button class="btn" type="button" data-test="1">Odtwórz</button></div>';
  }else if(stTab==="gfx"){
    h+=swRow("fx","Efekty graficzne","Cząsteczki, błyski, wstrząsy ekranu i animacje",PR.fx);
    h+=swRow("hq","Wysoka jakość tekstur","Szczotkowany metal, ziarno lakieru i rysy. Wyłącz na słabszych urządzeniach",PR.hq!==false);
  }else if(stTab==="game"){
    h+=segRow("fast","Tryb otwierania","Pełny pokazuje otwarcie skrzynki, szybki skraca animacje",[["0","Pełny"],["1","Szybki"]],PR.fast?1:0);
    h+=segRow("rounds","Rundy w bitwie","Domyślna liczba skrzynek otwieranych przez każdego gracza",[[1,"1"],[3,"3"],[5,"5"]],PR.rounds);
  }else if(stTab==="profile"){
    var b=lvlBase(L),n=lvlBase(L+1);
    h+='<div class="srow"><div><b>Pseudonim</b><small>Widoczny dla rywali w bitwach i w topce (3 do 16 znaków)</small></div><input class="inp" id="nickIn" maxlength="16" value="'+esc(S.nick)+'" autocomplete="off" aria-label="Pseudonim"></div>';
    h+='<div class="srow"><div><b>Kolor gracza</b><small>Znacznik przy twoim imieniu</small></div><div class="sws">'+COLS.map(function(c,i){return '<button type="button" data-col="'+i+'" style="--c:'+c+'" aria-label="Kolor '+(i+1)+'" aria-pressed="'+(S.col===i)+'"></button>';}).join("")+'</div></div>';
    h+='<div class="srow"><div><b>Poziom '+L+'</b><small>'+(S.xp-b)+' / '+(n-b)+' PD do poziomu '+(L+1)+'. Punkty zdobywasz za skrzynki, zamiany i bitwy</small></div><div class="xp wide" style="--p:'+((S.xp-b)/(n-b)*100).toFixed(0)+'%"><div></div></div></div>';
    h+='<div class="srow"><div><b>Rekord bitew</b><small>Wygrane, przegrane i remisy</small></div><span class="mono">'+S.bat.w+" / "+S.bat.l+" / "+S.bat.t+'</span></div>';
  }else{
    h+='<div class="srow"><div><b>Połączenie online</b><small>Bitwy z graczami i wspólna topka</small></div><span class="tag '+(netOn()?"ok":"")+'">'+(netOn()?"POŁĄCZONO":"OFFLINE")+'</span></div>';
    h+='<div class="srow"><div><b>Zapis gry</b><small>Saldo, ekwipunek i statystyki są zapisane w tej przeglądarce</small></div><span class="mono">'+S.inv.length+' szt.</span></div>';
    h+='<div class="srow"><div><b>Postęp</b><small>Usuwa saldo, ekwipunek, statystyki i poziom. Pseudonim zostaje</small></div><button class="btn danger" id="sReset" type="button">Zresetuj postęp</button></div>';
  }
  return h;
}
function openSettings(tab,focusSel){
  if(tab)stTab=tab;
  $("#cBox").innerHTML=mh("Ustawienia")+'<div class="setw"><div class="setnav" role="tablist">'+ST_TABS.map(function(t){
    return '<button type="button" role="tab" data-stt="'+t[0]+'" aria-selected="'+(stTab===t[0])+'">'+t[1]+'</button>';
  }).join("")+'</div><div class="setc setlist">'+settingsBody()+'</div></div><div class="mf"><button class="btn main" id="cClose" type="button">Gotowe</button></div>';
  $("#contents").classList.add("on");
  var f=focusSel&&$("#cBox "+focusSel);if(f&&f.focus)f.focus();
}
function openHelp(){
  panel(mh("Jak grać")+'<div class="help">'+
   '<p><b>Skrzynki.</b> Wybierz skrzynkę, zapłać wirtualnymi złotówkami i obejrzyj losowanie. Każda ma pięć poziomów rzadkości, a szansa na Legendarny przedmiot to 0,26%.</p>'+
   '<p><b>Bitwa.</b> Wybierz skrzynkę i liczbę rund. Ty i rywal otwieracie te same skrzynki, a wygrywa wyższa suma wartości. Zwycięzca zabiera wszystkie przedmioty. Jeśli w ciągu kilku sekund nikt nie dołączy, zagrasz z botem.</p>'+
   '<p><b>Ekwipunek.</b> Wylosowane przedmioty zostają u ciebie. Możesz je sprzedać za wirtualne saldo albo użyć w zamianie. Cena zależy od zużycia, a licznik podnosi ją o 60%.</p>'+
   '<p><b>Upgrader.</b> Zaznacz swoje przedmioty i wybierz droższy cel. Szansa to wartość wkładu podzielona przez cenę celu, pomniejszona o 5%, maksymalnie 90%. Wygrana daje cel, przegrana zabiera cały wkład.</p>'+
   '<p><b>Kontrakt.</b> Oddaj 10 przedmiotów tego samego poziomu, a dostaniesz jeden z poziomu wyżej.</p>'+
   '<p><b>Topka.</b> Ranking pokazuje graczy z wynikami netto, wygranymi bitwami i najlepszymi łupami. Boty są oznaczone etykietą BOT.</p>'+
   '<p><b>Pamiętaj.</b> To tylko symulator. Nie ma tu prawdziwych pieniędzy ani nagród.</p>'+
   '</div><div class="mf"><button class="btn main" id="cClose" type="button">Rozumiem</button></div>');
}

/* ================= MENU GŁÓWNE ================= */
var menuEl=$("#menu"),appEl=$("#app");
function buildMenuBg(){
  var pool=[],h="",i;
  CASES.forEach(function(c){c.items.forEach(function(arr){arr.forEach(function(b){pool.push(b);});});});
  for(i=0;i<9;i++){
    var b=pool[Math.floor(Math.random()*pool.length)],sz=180+Math.random()*260;
    h+='<div class="fl" style="top:'+(Math.random()*88).toFixed(0)+'%;width:'+sz.toFixed(0)+'px;animation-duration:'+(28+Math.random()*34).toFixed(0)+'s;animation-delay:-'+(Math.random()*40).toFixed(0)+'s;opacity:'+(.12+Math.random()*.2).toFixed(2)+';--r:'+(Math.random()*40-20).toFixed(0)+'deg">'+art(b)+'</div>';
  }
  $("#mbg").innerHTML=h;
}
function renderShow(){
  var c=CASES[Math.floor(Math.random()*CASES.length)],pool=c.items[3].concat(c.items[4]),w=pool[Math.floor(Math.random()*pool.length)],el=$("#mshow");
  if(!el)return;
  el.style.setProperty("--h",c.hue);
  el.innerHTML='<div class="msGlow"></div><img class="msCrate" src="'+crateURL(c.hue,c.id)+'" alt=""><div class="msGun">'+art(w)+'</div><div class="msCap"><small>Wyróżniona skrzynka</small><b>'+c.name.replace("Skrzynka ","")+'</b><span>'+fmt(c.price)+'</span></div>';
}
function renderMenu(){
  var best=S.best?'<span style="color:'+TIERS[S.best.tier].c+'">'+esc(S.best.n)+'</span>':"-";
  $("#mfoot").innerHTML='<div><small>Poziom</small><b>'+lvlOf(S.xp)+'</b></div><div><small>Bitwy W / P / R</small><b>'+S.bat.w+' / '+S.bat.l+' / '+S.bat.t+'</b></div><div><small>Saldo</small><b>'+fmt(S.bal)+'</b></div><div><small>Otwarte skrzynki</small><b>'+S.opened+'</b></div><div><small>W ekwipunku</small><b>'+S.inv.length+'</b></div><div><small>Najlepszy łup</small><b style="font-size:14px">'+best+'</b></div>';
}
function enterApp(view){
  menuEl.classList.remove("on");appEl.hidden=false;showView(view);window.scrollTo(0,0);
}
function toMenu(){appEl.hidden=true;menuEl.classList.add("on");renderMenu();}
function menuAct(m){
  if(m==="play"){SFX.start();enterApp("cases");}
  else if(m==="battle"){SFX.start();enterApp("battle");}
  else if(m==="top")enterApp("top");
  else if(m==="exch")enterApp("exch");
  else if(m==="inv")enterApp("inv");
  else if(m==="stats")enterApp("stats");
  else if(m==="settings")openSettings();
  else if(m==="help")openHelp();
}

/* ================= ZAMIANA SKINÓW ================= */
var CAT=[];
CASES.forEach(function(c){c.items.forEach(function(arr,t){arr.forEach(function(b,i){
  CAT.push({k:c.id+"-"+t+"-"+i,b:b,tier:t,c:c,price:priceOf(Object.assign({tier:t},b),c,2,false)});
});});});
CAT.sort(function(a,b){return a.price-b.price;});
var EX={mode:"up",sel:[],target:null,busy:false,rot:0,msg:""};
function selItems(){return S.inv.filter(function(i){return EX.sel.indexOf(i.uid)>-1;});}
function selValue(){return selItems().reduce(function(s,i){return s+i.price;},0);}
function chanceOf(v,price){return Math.min(.9,Math.max(.01,v/price*.95));}
function pct(x){return (x*100).toFixed(x<.1?1:0).replace(".",",")+"%";}
function wearIdx(f){for(var i=0;i<WEARS.length;i++){if(f<=WEARS[i].max)return i;}return 4;}
function catOf(k){return CAT.filter(function(c){return c.k===k;})[0]||null;}
function exCard(it,cls,extra){
  var T=TIERS[it.tier];
  return '<div class="item sm'+cls+'" style="--tc:'+T.c+'" '+extra+' tabindex="0">'+(it.st?'<span class="st">LICZNIK</span>':'')+'<div class="art">'+art(it)+'</div><div class="nm">'+esc(it.n)+'</div><div class="wr">'+WEARS[it.wear].n+'</div><div class="pr">'+fmt(it.price)+'</div></div>';
}
function renderEx(){
  EX.sel=EX.sel.filter(function(u){return S.inv.some(function(i){return i.uid===u;});});
  $("#exTabs").innerHTML='<button class="chip" data-x="up" aria-pressed="'+(EX.mode==="up")+'">Upgrader · zamiana z szansą</button><button class="chip" data-x="con" aria-pressed="'+(EX.mode==="con")+'">Kontrakt · 10 za 1 wyższy</button>';
  var b=$("#exBody");
  if(EX.mode==="up"){
    b.innerHTML='<div class="exTop"><div id="exGauge"></div></div><div class="exCols"><div><h3 class="exh">1. Twoje przedmioty</h3><div class="tools" id="exInvTools"></div><div class="cards sm scrollbox" id="exInv"></div></div><div><h3 class="exh">2. Wybierz cel</h3><div class="cards sm scrollbox" id="exTg"></div></div></div>';
    renderExInv();renderExTargets();renderGauge();
  }else{
    b.innerHTML='<div class="exTop"><div id="exCon"></div></div><div><h3 class="exh">Wybierz 10 przedmiotów tego samego poziomu</h3><div class="tools" id="exInvTools"></div><div class="cards sm scrollbox" id="exInv"></div></div>';
    renderExInv();renderCon();
  }
}
function renderExInv(){
  var tools="",list=S.inv.slice().sort(function(a,b){return b.price-a.price;}),t;
  if(EX.mode==="up")tools='<button class="chip" data-all="1">Zaznacz wszystko</button><button class="chip" data-clear="1">Wyczyść</button>';
  else{
    tools='<button class="chip" data-clear="1">Wyczyść</button>';
    for(t=0;t<4;t++){
      var n=S.inv.filter(function(i){return i.tier===this;},t).length;
      if(n>=10)tools+='<button class="chip" data-auto="'+t+'" style="color:'+TIERS[t].c+'">Auto: '+TIERS[t].n+' ('+n+')</button>';
    }
  }
  $("#exInvTools").innerHTML=tools;
  var ct=(EX.mode==="con"&&EX.sel.length)?selItems()[0].tier:-1;
  $("#exInv").innerHTML=list.length?list.map(function(i){
    var on=EX.sel.indexOf(i.uid)>-1,dim=EX.mode==="con"&&((ct>-1&&i.tier!==ct&&!on)||i.tier===4);
    return exCard(i,(on?" sel":"")+(dim?" dim":"")+(i.tier>=2?" hi":""),'data-pick="'+i.uid+'"');
  }).join(""):'<div class="empty" style="grid-column:1/-1">Ekwipunek jest pusty. Otwórz kilka skrzynek.</div>';
}
function renderExTargets(){
  var V=selValue(),el=$("#exTg");
  if(V<=0){el.innerHTML='<div class="empty" style="grid-column:1/-1">Zaznacz przedmioty, aby zobaczyć możliwe cele.</div>';EX.target=null;return;}
  var list=CAT.filter(function(c){return c.price>=V*1.04&&c.price<=V*30;}).slice(0,48);
  if(!list.some(function(c){return c.k===EX.target;}))EX.target=null;
  el.innerHTML=list.length?list.map(function(c){
    var T=TIERS[c.tier],ch=chanceOf(V,c.price),it=Object.assign({tier:c.tier,f:.26,wear:2,price:c.price},c.b);
    return '<div class="item sm'+(c.k===EX.target?' sel':'')+(c.tier>=2?' hi':'')+'" style="--tc:'+T.c+'" data-target="'+c.k+'" tabindex="0"><span class="ch">'+pct(ch)+'</span><div class="art">'+art(it)+'</div><div class="nm">'+esc(c.b.n)+'</div><div class="wr">'+WEARS[2].n+'</div><div class="pr">'+fmt(c.price)+'</div></div>';
  }).join(""):'<div class="empty" style="grid-column:1/-1">Brak celów dla tej wartości. Zaznacz mniej lub tańsze przedmioty.</div>';
}
function renderGauge(){
  var V=selValue(),tg=catOf(EX.target),ch=tg?chanceOf(V,tg.price):0,C=2*Math.PI*110,col=tg?TIERS[tg.tier].hex:"#5fd68a",i,tk="";
  for(i=0;i<36;i++){
    var a=i*10*Math.PI/180,r2=(i%3)?128:132;
    tk+='<line x1="'+(130+Math.sin(a)*124).toFixed(1)+'" y1="'+(130-Math.cos(a)*124).toFixed(1)+'" x2="'+(130+Math.sin(a)*r2).toFixed(1)+'" y2="'+(130-Math.cos(a)*r2).toFixed(1)+'" stroke="#3a485b" stroke-width="1.5"/>';
  }
  var inner=tg?art(Object.assign({tier:tg.tier,f:.26,wear:2},tg.b))+'<div class="pc" style="color:'+col+'">'+pct(ch)+'</div><small>'+esc(tg.b.n)+'</small>':'<small>Zaznacz przedmioty i wybierz cel</small>';
  $("#exGauge").innerHTML='<div class="gauge" style="--tc:'+(tg?TIERS[tg.tier].c:"var(--mute)")+'"><div class="gwrap"><svg viewBox="0 0 260 260" aria-hidden="true"><circle cx="130" cy="130" r="110" fill="none" stroke="#202a38" stroke-width="16"/><circle cx="130" cy="130" r="110" fill="none" stroke="'+col+'" stroke-width="16" stroke-dasharray="'+(ch*C).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 130 130)" style="filter:drop-shadow(0 0 6px '+col+')"/>'+tk+'<g id="gPtr" transform="rotate('+EX.rot.toFixed(2)+' 130 130)"><path d="M130 130 L130 40" stroke="#eef2f8" stroke-opacity=".35" stroke-width="2"/><path d="M130 38 L120 8 L140 8 Z" fill="#eef2f8"/></g><circle cx="130" cy="130" r="5" fill="#eef2f8"/></svg><div class="gc">'+inner+'</div></div>'+
   '<div class="gsum"><span>Wkład <b>'+fmt(V)+'</b></span><span>Cel <b>'+(tg?fmt(tg.price):"-")+'</b></span><span>Szansa <b>'+(tg?pct(ch):"-")+'</b></span></div>'+
   '<button class="btn main" id="exGo" type="button" '+((!tg||V<=0||EX.busy)?'disabled':'')+'>Zamień</button><div class="exMsg" id="exMsg">'+EX.msg+'</div></div>';
}
function renderCon(){
  var items=selItems(),n=items.length,t=n?items[0].tier:-1,sum=selValue(),i,sl="";
  for(i=0;i<10;i++)sl+='<span class="'+(i<n?'f':'')+'" '+(i<n?'style="--tc:'+TIERS[t].c+'"':'')+'></span>';
  var out=n?'Wynik: 1 przedmiot poziomu <b style="color:'+TIERS[t+1].c+'">'+TIERS[t+1].n+'</b> z jednej ze skrzynek wkładu':'Zaznacz 10 przedmiotów tego samego poziomu';
  $("#exCon").innerHTML='<div class="gauge" style="--tc:'+(n?TIERS[t+1].c:"var(--mute)")+'"><div class="slots">'+sl+'</div><div class="gsum"><span>Zaznaczono <b>'+n+' / 10</b></span><span>Wartość wkładu <b>'+fmt(sum)+'</b></span></div><div class="exMsg">'+out+'</div><button class="btn main" id="conGo" type="button" '+((n===10&&!EX.busy)?'':'disabled')+'>Podpisz kontrakt</button><div class="exMsg">'+EX.msg+'</div></div>';
}
function exRefresh(){
  renderExInv();
  if(EX.mode==="up"){renderExTargets();renderGauge();}else renderCon();
}
function exPick(uid){
  if(EX.busy)return;
  var it=S.inv.filter(function(i){return i.uid===uid;})[0];if(!it)return;
  var ix=EX.sel.indexOf(uid);
  if(ix>-1)EX.sel.splice(ix,1);
  else{
    if(EX.mode==="con"){
      if(it.tier===4){toast("Legendarnych przedmiotów nie da się wymienić w kontrakcie");return;}
      var have=selItems();
      if(have.length&&have[0].tier!==it.tier){toast("W kontrakcie wszystkie przedmioty muszą mieć ten sam poziom");return;}
      if(have.length>=10){toast("Kontrakt przyjmuje dokładnie 10 przedmiotów");return;}
    }
    EX.sel.push(uid);
  }
  EX.msg="";SFX.tick();exRefresh();
}
function exTarget(k){
  if(EX.busy)return;
  EX.target=(EX.target===k)?null:k;EX.msg="";SFX.tick();
  renderExTargets();renderGauge();
}
function exAuto(t){
  var list=S.inv.filter(function(i){return i.tier===t;}).sort(function(a,b){return a.price-b.price;}).slice(0,10);
  EX.sel=list.map(function(i){return i.uid;});EX.msg="";exRefresh();
}
function exSpin(){
  if(EX.busy)return;
  var V=selValue(),tg=catOf(EX.target);
  if(!tg||V<=0)return;
  var items=selItems(),ch=chanceOf(V,tg.price),win=Math.random()<ch,ids=EX.sel.slice();
  EX.busy=true;EX.msg="";
  S.inv=S.inv.filter(function(i){return ids.indexOf(i.uid)<0;});S.ex.up++;addXp(15);save();
  EX.sel=[];renderBal();renderExInv();
  var arc=ch*360,stop,rest=360-arc;
  if(win)stop=arc>8?3+Math.random()*(arc-6):arc*Math.random();
  else stop=arc+(rest>8?3+Math.random()*(rest-6):rest*Math.random());
  var from=EX.rot,final=Math.ceil(from/360)*360+360*(PR.fast?3:6)+stop,dur=PR.fast?2600:6200,t0=null,lastTick=Math.floor(from/12);
  var btn=$("#exGo");if(btn)btn.disabled=true;
  function step(ts){
    if(t0===null)t0=ts;
    var k=Math.min(1,(ts-t0)/dur),r=from+(final-from)*(1-Math.pow(1-k,4)),p=$("#gPtr");
    if(p)p.setAttribute("transform","rotate("+r.toFixed(2)+" 130 130)");
    var tk=Math.floor(r/12);if(tk!==lastTick){lastTick=tk;SFX.tick();}
    if(k<1)requestAnimationFrame(step);else{EX.rot=final%360;exDone(win,tg,items,V);}
  }
  SFX.whoosh();requestAnimationFrame(step);
}
function exDone(win,tg,items,V){
  EX.busy=false;EX.target=null;
  if(win){
    var it={uid:++S.seq,case:tg.c.id,tier:tg.tier,n:tg.b.n,t:tg.b.t,h:tg.b.h,p:tg.b.p,v:tg.b.v,wear:2,f:.15+Math.random()*.22,st:false,price:tg.price};
    S.inv.push(it);S.ex.upW++;addXp(25);save();EX.msg="";
    flash("#5fd68a",.35,500);
    showResult(it,"Upgrader · wygrana");
  }else{
    save();SFX.lose();flash("#ff3b3b",.4,600);
    EX.msg='<span class="neg">Nie udało się. Tracisz '+items.length+' szt. o wartości '+fmt(V)+'.</span>';
    renderEx();
  }
  renderBal();
}
function doContract(){
  if(EX.busy)return;
  var items=selItems();if(items.length!==10)return;
  var tier=items[0].tier+1,src=items[Math.floor(Math.random()*10)],c=caseOf(src.case)||CASES[0];
  var pool=c.items[tier],b=pool[Math.floor(Math.random()*pool.length)];
  var avg=items.reduce(function(s,i){return s+i.f;},0)/10,wi=wearIdx(avg);
  var out={uid:++S.seq,case:c.id,tier:tier,n:b.n,t:b.t,h:b.h,p:b.p,v:b.v,wear:wi,f:avg,st:false};
  out.price=priceOf(out,c,wi,false);
  var ids=EX.sel.slice();
  S.inv=S.inv.filter(function(i){return ids.indexOf(i.uid)<0;});S.inv.push(out);S.ex.con++;addXp(20);save();
  EX.sel=[];EX.msg="";SFX.clank();flash(TIERS[tier].hex,.4,500);renderBal();
  showResult(out,"Kontrakt zrealizowany");
}

/* ================= PROFIL I POZIOMY ================= */
var COLS=["#7aa2ff","#9b6bff","#e04fd0","#ff4b4b","#ffc247","#5fd68a","#4fd1d9","#ff9a3d"];
function colOf(i){return COLS[Math.abs(parseInt(i,10)||0)%COLS.length];}
function lvlOf(xp){return 1+Math.floor(Math.sqrt(Math.max(0,xp)/40));}
function lvlBase(l){return 40*(l-1)*(l-1);}
function addXp(n){var b=lvlOf(S.xp);S.xp+=n;if(lvlOf(S.xp)>b){toast("Nowy poziom: "+lvlOf(S.xp));SFX.coins();}}
function cleanNick(s){
  var t=String(s==null?"":s);
  try{t=t.replace(/[^\p{L}\p{N} _.\-]/gu,"");}catch(e){t=t.replace(/[^A-Za-z0-9 _.\-]/g,"");}
  return t.trim().slice(0,16);
}
function num(v,max){v=Number(v);if(!isFinite(v))return 0;return Math.max(-max,Math.min(max,v));}
function renderMe(){
  var L=lvlOf(S.xp),a=lvlBase(L),b=lvlBase(L+1);
  $("#me").style.setProperty("--pc",colOf(S.col));
  $("#me").innerHTML='<i class="dotc"></i><span class="meN"><b>'+esc(S.nick)+'</b><span class="xp" style="--p:'+((S.xp-a)/(b-a)*100).toFixed(0)+'%"><span></span></span></span><span class="lv">Poz. '+L+'</span>';
}

/* ================= ONLINE (baza współdzielona, pokój) ================= */
var NET={db:null,user:null,room:null,uid:null,canWrite:null,peers:0,open:[],lb:[],ready:false};
var SEARCH_MS=8000;
function netOn(){return !!(NET.db&&NET.uid);}
function netWrite(){return netOn()&&NET.canWrite!==false;}
function netInit(){
  if(!window.claude||typeof window.claude.use!=="function"){return;}
  Promise.all([window.claude.use("db"),window.claude.use("user"),window.claude.use("room")]).then(function(r){
    NET.db=r[0];NET.user=r[1];NET.room=r[2];
    return NET.user?Promise.all([NET.user.id(),NET.user.can("data.write")]):[null,null];
  }).then(function(v){
    NET.uid=v[0];NET.canWrite=v[1];
    if(netOn())netStart();
    NET.ready=true;renderNet();
  }).catch(function(){NET.ready=true;renderNet();});
}
function netDead(e){
  if(e&&(e.code==="revoked"||e.code==="not_granted"||e.code==="capability_disabled")){NET.db=null;renderNet();}
}
function netStart(){
  try{
    NET.db.collection("battles").where("st","==","open").limit(60).onSnapshot(function(snap){
      NET.open=snap.docs.map(function(d){var o=d.data()||{};o.id=d.id;return o;});
      renderLobby();gcBattles();
    },netDead);
    NET.db.collection("lb").limit(300).onSnapshot(function(snap){
      NET.lb=snap.docs.map(function(d){var o=d.data()||{};o.id=d.id;return o;});
      if(!$("#v-top").hidden)renderTop();
    },netDead);
  }catch(e){NET.db=null;}
  if(NET.room){
    try{
      NET.room.presence({nick:S.nick}).catch(function(){});
      NET.room.onPeers(function(ch){
        NET.peers=ch.peers.filter(function(p){return p.kind==="viewer";}).length;
        renderOnline();
      },function(){});
    }catch(e){}
  }
  pushLb(true);
}
function gcBattles(){
  if(!netWrite())return;
  var old=NET.open.filter(function(r){return Date.now()-(Number(r.t)||0)>300000;}).slice(0,3);
  old.forEach(function(r){try{NET.db.doc("battles/"+r.id).delete().catch(function(){});}catch(e){}});
}
function renderNet(){renderOnline();renderLobby();if(!$("#v-top").hidden)renderTop();}
function renderOnline(){
  var el=$("#bOnline");if(!el)return;
  var on=netOn();
  el.className="online"+(on?"":" off");
  el.innerHTML='<i></i>'+(on?('Online'+(NET.peers?(' · graczy w grze: '+NET.peers):'')+(NET.canWrite===false?' · tylko podgląd, rywale to boty':'')):'Offline · rywale to boty');
}
var lbT=0,lbBusy=false,lbLast="";
function lbDoc(){
  var iv=S.inv.reduce(function(s,i){return s+i.price;},0);
  return {nick:S.nick,col:S.col,xp:S.xp,w:S.bat.w,l:S.bat.l,net:Math.round((S.bal+iv-200-S.topped)*100)/100,best:S.best?S.best.price:0,bestN:S.best?S.best.n:"",bestT:S.best?S.best.tier:0,ts:Date.now()};
}
function pushLb(now){
  if(!netWrite())return;
  clearTimeout(lbT);lbT=setTimeout(doPush,now?250:3500);
}
function doPush(){
  if(lbBusy||!netWrite())return;
  var d=lbDoc(),sig=JSON.stringify(Object.assign({},d,{ts:0}));
  if(sig===lbLast)return;
  lbBusy=true;
  NET.db.doc("lb/"+NET.uid).set(d).then(function(){lbLast=sig;lbBusy=false;}).catch(function(e){
    lbBusy=false;if(e&&e.code==="invalid_argument")NET.canWrite=false;
  });
}

/* ================= BITWY ================= */
var BOTS=["KrzychuDrop","Mati_Skrzynka","Lootzilla","SkinHunter","Pani_Legenda","NocnyZbieracz","Wojtas77","ZlotaRaczka","Kapsel","AgaOpens","Szczurek","Pixel_Pawel"];
var BT={cid:null,rounds:null,search:null,joining:false};
function seededItem(c,R){
  var r=R(),a=0,tier=TIERS.length-1,i;
  for(i=0;i<TIERS.length;i++){a+=TIERS[i].odds;if(r<a){tier=i;break;}}
  var pool=c.items[tier],b=pool[Math.floor(R()*pool.length)];
  var f=R()<.55?.45+R()*.55:R()*.45,wi=wearIdx(f),st=R()<.1;
  var o={case:c.id,tier:tier,n:b.n,t:b.t,h:b.h,p:b.p,v:b.v,wear:wi,f:f,st:st};
  o.price=priceOf(o,c,wi,st);return o;
}
function battleDrops(c,seed,slot,n){
  var R=rng(hash(seed+"|"+slot)),out=[],i;
  for(i=0;i<n;i++)out.push(seededItem(c,R));
  return out;
}
function battleCtx(){
  if(!BT.cid)BT.cid=CASES[0].id;
  if(!BT.rounds)BT.rounds=[1,3,5].indexOf(PR.rounds)>-1?PR.rounds:3;
  var c=caseOf(BT.cid);return {c:c,cost:Math.round(c.price*BT.rounds*100)/100};
}
function renderBattle(){
  var el=$("#bForm");if(!el)return;
  var x=battleCtx(),s=BT.search,busy=!!s||!!AR;
  var h='<h3 class="exh">1. Skrzynka</h3><div class="cpick">'+CASES.map(function(c){
    return '<button class="cpk" type="button" data-bc="'+c.id+'" aria-pressed="'+(c.id===BT.cid)+'" '+(busy?'disabled':'')+'><img src="'+crateURL(c.hue,c.id)+'" alt=""><span><b>'+c.name.replace("Skrzynka ","")+'</b><small>'+fmt(c.price)+'</small></span></button>';
  }).join("")+'</div>';
  h+='<h3 class="exh" style="margin-top:18px">2. Liczba rund</h3><div class="seg" role="group" aria-label="Liczba rund">'+[1,3,5].map(function(n){
    return '<button type="button" data-br="'+n+'" aria-pressed="'+(BT.rounds===n)+'" '+(busy?'disabled':'')+'>'+n+(n===1?' runda':' rundy'.replace("rundy",n===5?"rund":"rundy"))+'</button>';
  }).join("")+'</div>';
  h+='<div class="bsum"><span>Wkład <b>'+fmt(x.cost)+'</b></span><span>Do wygrania <b>wszystkie przedmioty</b></span></div>';
  if(s){
    h+='<div class="searching"><div class="spin"></div><div><b id="srTxt">Szukam przeciwnika</b><small id="srSub"></small></div><button class="btn" type="button" data-bcancel="1">Anuluj</button></div>';
  }else{
    h+='<div class="bbtns"><button class="btn main" type="button" data-bs="human" '+(busy||S.bal<x.cost?'disabled':'')+'>Szukaj przeciwnika</button><button class="btn" type="button" data-bs="bot" '+(busy||S.bal<x.cost?'disabled':'')+'>Graj z botem</button></div>';
    if(S.bal<x.cost)h+='<div class="exMsg"><span class="neg">Za mało salda. Doładuj lub sprzedaj przedmioty.</span></div>';
    else h+='<div class="hint">Gdy nikt nie dołączy w ciągu '+(SEARCH_MS/1000)+' s, zagrasz z botem.</div>';
  }
  el.innerHTML=h;
  renderOnline();renderLobby();renderHist();
}
function renderLobby(){
  var el=$("#bLobby");if(!el)return;
  var x=battleCtx(),now=Date.now();
  var rows=NET.open.filter(function(r){return r.st==="open"&&!r.guest&&r.host!==NET.uid&&now-(Number(r.t)||0)<30000&&caseOf(r.case)&&[1,3,5].indexOf(r.rounds)>-1;});
  var h='<h3 class="exh">Otwarte bitwy</h3>';
  if(!netOn())h+='<div class="empty">Tryb offline. Twoimi rywalami będą boty.</div>';
  else if(NET.canWrite===false)h+='<div class="empty">Masz dostęp tylko do podglądu, więc w bitwach zagrasz z botem.</div>';
  else if(!rows.length)h+='<div class="empty">Nikt teraz nie szuka rywala. Wystartuj bitwę, a gdy nikt nie dołączy, zagrasz z botem.</div>';
  else h+=rows.map(function(r){
    var c=caseOf(r.case),cost=Math.round(c.price*r.rounds*100)/100;
    return '<div class="lrow" style="--pc:'+colOf(r.hc)+'"><i class="dotc"></i><div class="lmain"><b>'+esc(cleanNick(r.hn)||"Gracz")+'</b><small>'+c.name+' · '+r.rounds+' '+(r.rounds===1?'runda':'rund')+' · wkład '+fmt(cost)+'</small></div><button class="btn sm main" type="button" data-bj="'+esc(r.id)+'" '+((S.bal<cost||BT.joining||BT.search||AR)?'disabled':'')+'>Dołącz</button></div>';
  }).join("");
  el.innerHTML=h;
}
function renderHist(){
  var el=$("#bHist");if(!el)return;
  var hs=S.bat.hist||[];
  el.innerHTML=hs.length?'<div class="scroll"><table><tr><th>Wynik</th><th>Rywal</th><th>Skrzynka</th><th>Ty</th><th>Rywal</th></tr>'+hs.map(function(r){
    var lab=r.r==="win"?'<span class="pos">WYGRANA</span>':r.r==="lose"?'<span class="neg">PRZEGRANA</span>':'REMIS';
    return '<tr><td>'+lab+'</td><td>'+esc(r.opp)+(r.bot?' <span class="tag">BOT</span>':'')+'</td><td>'+esc(r.c)+' x'+r.n+'</td><td>'+fmt(r.me)+'</td><td>'+fmt(r.op)+'</td></tr>';
  }).join("")+'</table></div>':'<div class="empty">Nie rozegrano jeszcze żadnej bitwy.</div>';
}
function updSearchUI(){
  var s=BT.search;if(!s)return;
  var t=$("#srTxt"),u=$("#srSub");if(!t)return;
  var left=Math.max(0,Math.ceil((s.end-Date.now())/1000));
  t.textContent=s.forced?"Dobieram bota":"Szukam przeciwnika";
  u.textContent=s.live?("Pozostało "+left+" s, potem zagrasz z botem"):(s.forced?"Za chwilę zaczynamy":"Nikogo online, dołączy bot");
}
function endSearch(s){
  s.done=true;clearTimeout(s.timer);clearInterval(s.iv);
  if(s.unsub){try{s.unsub();}catch(e){}s.unsub=null;}
  if(BT.search===s)BT.search=null;
}
function startSearch(forceBot){
  var x=battleCtx();
  if(BT.search||AR||BT.joining)return;
  if(S.bal<x.cost){SFX.err();toast("Za mało salda na tę bitwę");return;}
  var s=BT.search={cid:BT.cid,rounds:BT.rounds,seed:Math.random().toString(36).slice(2,10),done:false,live:false,ref:null,timer:null,unsub:null,end:0};
  var online=!forceBot&&netWrite();
  s.live=online;s.forced=!!forceBot;
  s.end=Date.now()+(online?SEARCH_MS:1800+Math.random()*1200);
  s.iv=setInterval(updSearchUI,300);
  renderBattle();updSearchUI();
  if(!online){s.timer=setTimeout(function(){botMatch(s);},Math.max(300,s.end-Date.now()));return;}
  var ref=NET.db.collection("battles").doc();s.ref=ref;
  ref.set({host:NET.uid,hn:S.nick,hc:S.col,case:s.cid,rounds:s.rounds,seed:s.seed,t:Date.now(),guest:null,st:"open"}).then(function(){
    if(s.done){ref.delete().catch(function(){});return;}
    s.unsub=ref.onSnapshot(function(snap){
      if(s.done||!snap.exists)return;
      var d=snap.data()||{};
      if(d.st==="live"&&d.guest){
        endSearch(s);
        startMatch({cid:s.cid,rounds:s.rounds,seed:s.seed,slot:0,opp:{nick:cleanNick(d.gn)||"Gracz",col:d.gc,bot:false},ref:ref,host:true});
      }
    },function(){});
    s.timer=setTimeout(function(){hostTimeout(s);},Math.max(300,s.end-Date.now()));
  }).catch(function(e){
    if(s.done)return;
    if(e&&e.code==="invalid_argument")NET.canWrite=false;
    s.live=false;s.timer=setTimeout(function(){botMatch(s);},1200);
  });
}
function hostTimeout(s){
  if(s.done)return;
  s.ref.acquire({holder:NET.uid,ttlMs:3000}).then(function(a){
    if(s.done)return;
    if(!a.acquired){s.timer=setTimeout(function(){hostTimeout(s);},1200);return;}
    return s.ref.get().then(function(snap){
      if(s.done)return;
      var d=snap.data()||{};
      if(d.guest&&d.st==="live")return;
      return s.ref.update({st:"cancel"}).then(function(){s.ref.delete().catch(function(){});botMatch(s);});
    });
  }).catch(function(){botMatch(s);});
}
function botMatch(s){
  if(s.done)return;
  endSearch(s);
  var nm=BOTS[Math.floor(Math.random()*BOTS.length)];
  startMatch({cid:s.cid,rounds:s.rounds,seed:s.seed,slot:0,opp:{nick:nm,col:Math.floor(Math.random()*COLS.length),bot:true},ref:null,host:true});
}
function cancelSearch(){
  var s=BT.search;if(!s)return;
  var ref=s.ref;endSearch(s);
  if(ref)ref.delete().catch(function(){});
  renderBattle();
}
function joinBattle(id){
  if(BT.joining||BT.search||AR||!netWrite())return;
  var row=NET.open.filter(function(r){return r.id===id;})[0];if(!row)return;
  var c=caseOf(row.case);if(!c||[1,3,5].indexOf(row.rounds)<0)return;
  var cost=Math.round(c.price*row.rounds*100)/100;
  if(S.bal<cost){SFX.err();toast("Za mało salda na tę bitwę");return;}
  BT.joining=true;renderLobby();
  var ref=NET.db.doc("battles/"+id);
  ref.acquire({holder:NET.uid,ttlMs:4000}).then(function(a){
    if(!a.acquired)throw {code:"busy"};
    return ref.get();
  }).then(function(snap){
    var d=snap.exists?snap.data():null;
    if(!d||d.st!=="open"||d.guest||d.host===NET.uid||!caseOf(d.case)||[1,3,5].indexOf(d.rounds)<0||typeof d.seed!=="string")throw {code:"gone"};
    return ref.update({guest:NET.uid,gn:S.nick,gc:S.col,st:"live"}).then(function(){return d;});
  }).then(function(d){
    BT.joining=false;
    startMatch({cid:d.case,rounds:d.rounds,seed:String(d.seed).slice(0,24),slot:1,opp:{nick:cleanNick(d.hn)||"Gracz",col:d.hc,bot:false},ref:ref,host:false});
  }).catch(function(e){
    BT.joining=false;
    if(e&&e.code==="invalid_argument")NET.canWrite=false;
    toast("Ta bitwa jest już zajęta");renderLobby();
  });
}
function startMatch(m){
  var c=caseOf(m.cid),cost=Math.round(c.price*m.rounds*100)/100;
  if(S.bal<cost){toast("Za mało salda na tę bitwę");renderBattle();return;}
  S.bal=Math.round((S.bal-cost)*100)/100;S.spent+=cost;save();renderBal();
  m.c=c;m.cost=cost;
  var dr=[battleDrops(c,m.seed,0,m.rounds),battleDrops(c,m.seed,1,m.rounds)];
  m.mine=dr[m.slot];m.theirs=dr[1-m.slot];
  runArena(m);
}

/* ---------- arena ---------- */
var AR=null;
function arTimer(fn,ms){var t=setTimeout(fn,ms);if(AR)AR.timers.push(t);return t;}
function sideHTML(id,nick,col,bot,you){
  return '<div class="arSide" id="ar'+id+'" style="--pc:'+colOf(col)+'"><div class="arP"><i class="dotc"></i><b>'+esc(nick)+(you?' (ty)':'')+'</b>'+(bot?'<span class="tag">BOT</span>':'')+'<span class="tot" id="tot'+id+'">'+fmt(0)+'</span></div>'+
   '<div class="rail sm on" id="rail'+id+'"><div class="needle"></div><div class="strip" id="strip'+id+'"></div></div><div class="arDrops" id="drop'+id+'"></div></div>';
}
function runArena(m){
  AR={m:m,round:0,sums:[0,0],done:false,skip:false,timers:[],raf:0,spinning:false};
  var el=$("#arena");
  $("#arIn").innerHTML='<div class="arHead"><small id="arSub">'+esc(m.c.name)+' · '+m.rounds+' '+(m.rounds===1?'runda':'rund')+'</small><h3 id="arTitle">Bitwa</h3></div>'+
   '<div class="arGrid">'+sideHTML("A",S.nick,S.col,false,true)+'<div class="arVs">VS</div>'+sideHTML("B",m.opp.nick,m.opp.col,m.opp.bot,false)+'</div>'+
   '<div class="stage-btns" id="arBtns"><button class="btn" id="arSkip" type="button">Pomiń animację</button></div>'+
   '<div class="arRes" id="arRes"><div class="big" id="arBig"></div><div class="arSum" id="arSum"></div><div class="btns"><button class="btn main" id="arAgain" type="button">Rewanż</button><button class="btn" id="arClose" type="button">Zamknij</button></div></div>';
  el.classList.add("on");el.scrollTop=0;document.body.style.overflow="hidden";
  SFX.start();
  arTimer(nextRound,450);
}
function arTiles(c,drop){
  var N=40,WIN=32,t=[],i;
  for(i=0;i<N;i++)t.push(i===WIN?drop:makeItem(c,rollTier(),true));
  return t.map(function(it){
    return '<div class="tile" style="--tc:'+TIERS[it.tier].c+'"><span class="tt">'+TIERS[it.tier].n+'</span><div class="art">'+art(it)+'</div><div class="n">'+esc(it.n)+'</div></div>';
  }).join("");
}
function nextRound(){
  var a=AR;if(!a||a.done)return;
  if(a.round>=a.m.rounds){finishArena();return;}
  var r=a.round,m=a.m;
  $("#arTitle").textContent="Runda "+(r+1)+" z "+m.rounds;
  var sA=$("#stripA"),sB=$("#stripB"),rA=$("#railA"),rB=$("#railB");
  sA.className="strip";sB.className="strip";
  sA.innerHTML=arTiles(m.c,m.mine[r]);sB.innerHTML=arTiles(m.c,m.theirs[r]);
  sA.style.transform="translateX(0)";sB.style.transform="translateX(0)";
  if(a.skip){revealRound(true);nextRound();return;}
  SFX.whoosh();
  var tw=sA.children[0].offsetWidth+8,WIN=32,specs=[],durBase=PR.fast?1500:3600;
  [[sA,rA,0],[sB,rB,1]].forEach(function(p){
    var rw=p[1].clientWidth,jit=(Math.random()*.7-.35)*tw;
    specs.push({strip:p[0],tw:tw,rw:rw,target:WIN*tw+tw/2+jit-rw/2,dur:durBase+(p[2]?260+Math.random()*300:0),tick:p[2]===0});
  });
  var t0=null,fin=[false,false],last=[-1,-1];
  a.spinning=true;
  function step(ts){
    if(!AR||AR!==a||a.done||a.skip)return;
    if(t0===null)t0=ts;
    specs.forEach(function(sp,i){
      var k=Math.min(1,(ts-t0)/sp.dur),pos=sp.target*(1-Math.pow(1-k,4));
      sp.strip.style.transform="translateX("+(-pos)+"px)";
      if(sp.tick){var idx=Math.floor((pos+sp.rw/2)/sp.tw);if(idx!==last[i]){last[i]=idx;SFX.tick();}}
      if(k>=1)fin[i]=true;
    });
    if(fin[0]&&fin[1]){a.spinning=false;a.target=specs.map(function(s){return s.target;});revealRound(false);}
    else a.raf=requestAnimationFrame(step);
  }
  a.specs=specs;
  a.raf=requestAnimationFrame(step);
}
function dropHTML(it){
  return '<div class="drop" style="--tc:'+TIERS[it.tier].c+'"><div class="art">'+art(it)+'</div><div class="dn">'+esc(it.n)+'</div><div class="pr">'+fmt(it.price)+'</div></div>';
}
function revealRound(quiet){
  var a=AR;if(!a)return;
  var r=a.round,mine=a.m.mine[r],opp=a.m.theirs[r];
  a.round++;
  a.sums[0]+=mine.price;a.sums[1]+=opp.price;
  $("#dropA").insertAdjacentHTML("beforeend",dropHTML(mine));
  $("#dropB").insertAdjacentHTML("beforeend",dropHTML(opp));
  $("#totA").textContent=fmt(a.sums[0]);$("#totB").textContent=fmt(a.sums[1]);
  if(quiet)return;
  ["A","B"].forEach(function(id,i){
    var strip=$("#strip"+id),sp=a.specs[i];
    strip.style.transform="translateX("+(-sp.target)+"px)";
    strip.classList.add("done");
    var w=strip.children[32];if(w){w.classList.add("win");
      var rc=w.getBoundingClientRect(),it=i?opp:mine;
      burst(rc.left+rc.width/2,rc.top+rc.height/2,TIERS[it.tier].hex,[18,40,80,140,220][it.tier],it.tier===4);
      if(it.tier>=2)ring(rc.left+rc.width/2,rc.top+rc.height/2,TIERS[it.tier].hex);}
  });
  SFX.reveal(Math.max(mine.tier,opp.tier));
  arTimer(nextRound,PR.fast?650:(Math.max(mine.tier,opp.tier)>=3?2300:1400));
}
function skipArena(){
  var a=AR;if(!a||a.done||a.skip)return;
  a.skip=true;cancelAnimationFrame(a.raf);a.timers.forEach(clearTimeout);a.timers=[];
  while(a.round<a.m.rounds)revealRound(true);
  finishArena();
}
function finishArena(){
  var a=AR;if(!a||a.done)return;
  a.done=true;cancelAnimationFrame(a.raf);a.timers.forEach(clearTimeout);a.timers=[];
  var m=a.m,me=Math.round(a.sums[0]*100)/100,op=Math.round(a.sums[1]*100)/100;
  var res=me>op?"win":(me<op?"lose":"tie"),gain=[];
  if(res==="win")gain=m.mine.concat(m.theirs);else if(res==="tie")gain=m.mine.slice();
  var worth=0;
  gain.forEach(function(it){
    var o=Object.assign({},it,{uid:++S.seq});S.inv.push(o);worth+=o.price;
  });
  m.mine.forEach(function(it){
    S.opened++;S.tiers[it.tier]++;S.hist.push(it.tier);
    if(!S.best||it.price>S.best.price)S.best={n:it.n,tier:it.tier,price:it.price};
  });
  S.bat[res==="win"?"w":res==="lose"?"l":"t"]++;
  S.bat.hist.unshift({r:res,c:m.c.name,n:m.rounds,opp:m.opp.nick,bot:m.opp.bot,me:me,op:op,t:Date.now()});
  S.bat.hist=S.bat.hist.slice(0,12);
  addXp(res==="win"?30:res==="tie"?20:12);
  save();pushLb(true);renderBal();
  if(m.host&&m.ref)m.ref.delete().catch(function(){});
  $("#arBtns").style.display="none";
  if(res==="win"){$("#arA").classList.add("win");$("#arB").classList.add("lose");}
  else if(res==="lose"){$("#arB").classList.add("win");$("#arA").classList.add("lose");}
  var big=$("#arBig"),T=res==="win"?TIERS[4].hex:res==="lose"?TIERS[3].hex:TIERS[0].hex;
  big.textContent=res==="win"?"Wygrywasz":res==="lose"?"Przegrywasz":"Remis";
  big.style.color=T;big.style.textShadow="0 0 30px "+T;
  $("#arSum").innerHTML='Ty <b>'+fmt(me)+'</b> · '+esc(m.opp.nick)+' <b>'+fmt(op)+'</b><br>'+(res==="win"?('Zgarniasz przedmioty ('+gain.length+') o wartości <b class="pos">'+fmt(worth)+'</b> (wkład '+fmt(m.cost)+')'):res==="tie"?('Remis. Każdy zatrzymuje swoje przedmioty o wartości <b>'+fmt(worth)+'</b>'):('Tracisz wkład <b class="neg">'+fmt(m.cost)+'</b>. Przedmioty zabiera rywal'));
  $("#arAgain").disabled=S.bal<m.cost;
  $("#arRes").classList.add("on");
  if(res==="win"){SFX.reveal(4);burst(innerWidth/2,innerHeight*.45,"#ffc247",200,true);flash("#ffc247",.5,700);}
  else if(res==="lose"){SFX.lose();flash("#ff3b3b",.3,600);}
  else SFX.sell();
  $("#arRes").scrollIntoView&&$("#arRes").scrollIntoView({block:"nearest",behavior:"smooth"});
}
function closeArena(){
  if(AR){cancelAnimationFrame(AR.raf);AR.timers.forEach(clearTimeout);}
  var wasBot=AR&&AR.m.opp.bot;
  AR=null;
  $("#arena").classList.remove("on");document.body.style.overflow="";
  renderAll();return wasBot;
}

/* ================= TOPKA ================= */
var LBS="net";
var BOTLB=["Lootzilla","SkinHunter","KrzychuDrop","Pani_Legenda","NocnyZbieracz","Wojtas77","ZlotaRaczka","Mati_Skrzynka","Kapsel","AgaOpens","Szczurek","Pixel_Pawel"];
function botRows(){
  var day=Math.floor(Date.now()/86400000);
  return BOTLB.map(function(n,i){
    var R=rng(hash(n+"|"+day)),R0=rng(hash(n)),base=R0();
    var it=CAT[Math.min(CAT.length-1,Math.floor(base*base*CAT.length))];
    var w=Math.round(4+base*55+R()*5),l=Math.round(8+base*30+R()*6);
    return {id:"bot"+i,bot:true,nick:n,col:Math.floor(R0()*COLS.length),xp:Math.round(80+base*base*9000+R()*90),w:w,l:l,
      net:Math.round((base-.38)*900+R()*140-30),best:it.price,bestN:it.b.n,bestT:it.tier};
  });
}
function topRows(){
  var rows=[];
  NET.lb.forEach(function(r){
    if(r.id===NET.uid)return;
    rows.push({id:r.id,bot:false,nick:cleanNick(r.nick)||"Gracz",col:r.col,xp:num(r.xp,1e9),w:num(r.w,1e6),l:num(r.l,1e6),net:num(r.net,1e9),best:num(r.best,1e9),bestN:String(r.bestN||"").slice(0,40),bestT:Math.max(0,Math.min(4,num(r.bestT,4)|0))});
  });
  var me=lbDoc();me.id="me";me.me=true;me.bot=false;rows.push(me);
  botRows().forEach(function(b){rows.push(b);});
  var k=LBS;
  rows.sort(function(a,b){
    var va=k==="lvl"?a.xp:k==="win"?a.w:k==="best"?a.best:a.net,vb=k==="lvl"?b.xp:k==="win"?b.w:k==="best"?b.best:b.net;
    return vb-va||b.xp-a.xp;
  });
  return rows;
}
function renderTop(){
  var rows=topRows(),mi=0,i;
  for(i=0;i<rows.length;i++)if(rows[i].me){mi=i;break;}
  var humans=rows.filter(function(r){return !r.bot;}).length;
  $("#lbSum").innerHTML='<div class="stat"><small>Twoja pozycja</small><b>#'+(mi+1)+' <span style="font-size:14px;color:var(--mute)">z '+rows.length+'</span></b></div><div class="stat"><small>Prawdziwi gracze</small><b>'+humans+'</b></div><div class="stat"><small>Twój poziom</small><b>'+lvlOf(S.xp)+'</b></div>';
  $("#lbTools").innerHTML=[["net","Wynik netto"],["win","Wygrane bitwy"],["best","Najlepszy łup"],["lvl","Poziom"]].map(function(t){
    return '<button class="chip" type="button" data-lbs="'+t[0]+'" aria-pressed="'+(LBS===t[0])+'">'+t[1]+'</button>';
  }).join("");
  $("#lbTable").innerHTML='<tr><th>#</th><th>Gracz</th><th>Poz.</th><th>Wynik netto</th><th>Bitwy W / P</th><th>Najlepszy łup</th></tr>'+rows.slice(0,50).map(function(r,i){
    var net=r.net;
    return '<tr class="'+(r.me?'meRow':'')+'" style="--pc:'+colOf(r.col)+'"><td class="rk rk'+(i<3?i+1:0)+'">'+(i+1)+'</td><td><span class="pn"><i class="dotc"></i><b>'+esc(r.nick)+'</b>'+(r.me?' <span class="tag you">TY</span>':'')+(r.bot?' <span class="tag">BOT</span>':'')+'</span></td><td>'+lvlOf(r.xp)+'</td><td class="'+(net>=0?'pos':'neg')+'">'+(net>=0?'+':'')+fmt(net)+'</td><td>'+r.w+' / '+r.l+'</td><td>'+(r.best?'<span style="color:'+TIERS[r.bestT].c+'">'+esc(r.bestN)+'</span> · '+fmt(r.best):'-')+'</td></tr>';
  }).join("");
  $("#lbNote").textContent=netOn()?"Wyniki prawdziwych graczy zapisują się online. Boty z etykietą BOT uzupełniają tabelę i zmieniają wyniki co dzień.":"Tryb offline: w tabeli widzisz tylko siebie i boty z etykietą BOT.";
}

/* ================= ZDARZENIA ================= */
var rsT=0;
function resetFlow(btn){
  if(!rsT){rsT=1;btn.textContent="Kliknij ponownie, aby usunąć cały postęp";setTimeout(function(){rsT=0;if(btn)btn.textContent="Zresetuj postęp";},3500);return;}
  var nk=S.nick,cl=S.col;
  S=fresh();S.nick=nk;S.col=cl;shown=S.bal;save();rsT=0;btn.textContent="Zresetuj postęp";lbLast="";
  EX.sel=[];EX.target=null;EX.msg="";renderAll();renderMenu();pushLb(true);toast("Postęp zresetowany");
}
function toggle(k){
  if(k==="snd")PR.snd=!PR.snd;else if(k==="ui")PR.ui=!PR.ui;else if(k==="fx")PR.fx=!PR.fx;
  else if(k==="hq"){PR.hq=PR.hq===false;ART={};}
  savePrefs();syncPrefs();openSettings(null,'[data-tg="'+k+'"]');
  if(k==="hq"){buildMenuBg();renderAll();}
}
document.addEventListener("click",function(e){
  var pk=e.target.closest("[data-pick]");
  if(pk){exPick(+pk.dataset.pick);return;}
  var tg=e.target.closest("[data-target]");
  if(tg){exTarget(tg.dataset.target);return;}
  if(e.target===$("#contents")){$("#contents").classList.remove("on");return;}
  var t=e.target.closest("button");if(!t)return;
  if(!t.disabled)SFX.click();
  var d=t.dataset;
  if(d.m)menuAct(d.m);
  else if(d.stt){stTab=d.stt;openSettings(null,'[data-stt="'+d.stt+'"]');}
  else if(d.tg)toggle(d.tg);
  else if(d.seg){
    if(d.seg==="fast")PR.fast=d.sv==="1";
    else if(d.seg==="rounds"){PR.rounds=+d.sv;BT.rounds=+d.sv;}
    savePrefs();openSettings(null,'[data-seg="'+d.seg+'"][data-sv="'+d.sv+'"]');
  }
  else if(d.col!==undefined){S.col=+d.col;save();renderMe();pushLb(true);openSettings(null,'[data-col="'+d.col+'"]');}
  else if(d.test!==undefined)SFX.sell();
  else if(d.bc){BT.cid=d.bc;renderBattle();}
  else if(d.br){BT.rounds=+d.br;PR.rounds=BT.rounds;savePrefs();renderBattle();}
  else if(d.bs)startSearch(d.bs==="bot");
  else if(d.bcancel!==undefined)cancelSearch();
  else if(d.bj)joinBattle(d.bj);
  else if(d.lbs){LBS=d.lbs;renderTop();}
  else if(d.v)showView(d.v);
  else if(d.open)openCase(d.open);
  else if(d.peek)peek(d.peek);
  else if(d.f!==undefined){invFilter=+d.f;renderInv();}
  else if(d.s){invSort=d.s;renderInv();}
  else if(d.sell){var v=sell(+d.sell);if(v){SFX.sell();toast("Sprzedano za "+fmt(v));}renderAll();}
  else if(d.bulk){
    var k=d.bulk;
    if(confirmKey!==k){confirmKey=k;renderInv();return;}
    var tot=0,n=0;
    S.inv.slice().forEach(function(i){if(k==="all"||i.tier<=1){tot+=sell(i.uid);n++;}});
    confirmKey=null;if(n)SFX.coins();toast(n?("Sprzedano "+n+" szt. za "+fmt(tot)):"Nic do sprzedania");renderAll();
  }
  else if(d.x){if(EX.busy)return;EX.mode=d.x;EX.sel=[];EX.target=null;EX.msg="";renderEx();}
  else if(d.auto!==undefined)exAuto(+d.auto);
  else if(d.clear!==undefined){if(EX.busy)return;EX.sel=[];EX.target=null;EX.msg="";exRefresh();}
  else if(d.all!==undefined){if(EX.busy)return;EX.sel=S.inv.map(function(i){return i.uid;});EX.msg="";exRefresh();}
  else if(t.id==="exGo")exSpin();
  else if(t.id==="conGo")doContract();
  else if(t.id==="arSkip")skipArena();
  else if(t.id==="arClose")closeArena();
  else if(t.id==="arAgain"){var bot=closeArena();startSearch(bot);}
  else if(t.id==="cClose"||t.id==="cX")$("#contents").classList.remove("on");
  else if(t.id==="sReset"||t.id==="reset")resetFlow(t);
});
document.addEventListener("input",function(e){
  if(e.target.id==="sVol"){PR.vol=+e.target.value;$("#sVolO").textContent=PR.vol+"%";syncPrefs();savePrefs();}
});
document.addEventListener("change",function(e){
  if(e.target.id==="sVol")SFX.tick();
  if(e.target.id==="nickIn"){
    var v=cleanNick(e.target.value);
    if(v.length<3){toast("Pseudonim musi mieć co najmniej 3 znaki");e.target.value=S.nick;return;}
    S.nick=v;e.target.value=v;save();renderMe();pushLb(true);
    if(NET.room&&NET.room.presence)NET.room.presence({nick:v}).catch(function(){});
    toast("Zapisano pseudonim");
  }
});
document.addEventListener("keydown",function(e){
  var el=e.target;
  if((e.key==="Enter"||e.key===" ")&&el&&el.matches&&el.matches("[data-pick],[data-target]")){e.preventDefault();el.click();return;}
  if(e.key==="Escape"){
    if($("#contents").classList.contains("on"))$("#contents").classList.remove("on");
    else if(AR){if(AR.done)closeArena();else skipArena();}
    else if($("#stage").classList.contains("on")){if(cur&&cur.done)closeStage();else finish();}
  }
  if(menuEl.classList.contains("on")&&(e.key==="ArrowDown"||e.key==="ArrowUp")){
    var bs=[].slice.call(document.querySelectorAll("#mnav button")),ix=bs.indexOf(document.activeElement);
    ix=e.key==="ArrowDown"?(ix+1)%bs.length:(ix-1+bs.length)%bs.length;bs[ix].focus();e.preventDefault();
  }
});
$("#mnav").addEventListener("mouseover",function(e){if(e.target.closest("button")&&AU.ctx&&PR.snd)SFX.hover();});
$("#topup").onclick=function(){S.bal=Math.round((S.bal+100)*100)/100;S.topped+=100;save();SFX.coins();renderAll();toast("Dodano 100 zł wirtualnego salda");};
$("#openSet").onclick=function(){openSettings("snd");};
$("#me").onclick=function(){openSettings("profile");};
$("#toMenu").onclick=toMenu;
$("#skip").onclick=function(){finish();};
$("#rKeep").onclick=closeStage;
$("#rSell").onclick=function(){var v=sell(cur.win.uid);SFX.sell();toast("Sprzedano za "+fmt(v));closeStage();};
$("#rAgain").onclick=function(){var id=cur.c.id;closeStage();openCase(id);};
setInterval(function(){if(!$("#v-battle").hidden&&!BT.joining&&!AR)renderLobby();},2000);
buildMenuBg();renderShow();renderMenu();syncPrefs();renderMe();renderAll();netInit();
})();
