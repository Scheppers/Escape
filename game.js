const LEVELS={
 medieval:{name:"Middeleeuws alchemistenlabo",art:"assets/medieval_lab.svg",labels:["Kookpot","Oud boek","Glazen potten","Werktafel"],ingredient:"Zwavel-symbool",ingredientIcon:"🟡",code:[3,7,2,4],hiddenText:"In de as naast de kookpot ontdek je een verborgen alchemistisch teken. Je verzamelt het eerste symbool: zwavel.",intro:"Je bent aangekomen in een middeleeuws alchemistenlabo."},
 lavoisier:{name:"Labo tijdens de Franse Revolutie",art:"assets/french_lab.svg",labels:["Balans","Notities van Lavoisier","Glaswerk","Proefopstelling"],ingredient:"Koolstof-symbool",ingredientIcon:"⚫",code:[8,1,5,6],hiddenText:"Achter een lade met meetinstrumenten vind je een zwart koolstofsymbool.",intro:"De tijdreis brengt je naar het labo van Lavoisier."},
 modern:{name:"Modern chemielabo",art:"assets/modern_lab.svg",labels:["Reageerbuizen","Weegschaal","Maatkolf","Periodiek systeem"],ingredient:"Nitraat-symbool",ingredientIcon:"⚪",code:[6,4,9,2],hiddenText:"In het laboschrift staat een abstract nitraat-symbool. Je laatste ingrediënt is gevonden.",intro:"Je bereikt het moderne chemielabo. De laatste puzzels wachten."}
};
const QUESTIONS_PER_LEVEL=12, QUESTIONS_PER_PUZZLE=3, PENALTY=60;
let codeEntered={medieval:false,lavoisier:false,modern:false};
let questions=[], objectProgress={}, currentLevel="medieval", progress={}, levelSolved={}, levelQuestions={}, lockouts={}, inventory=new Set(), activeQuestion=null, activeObject=null, activeKind="question", shadowVisible=false, shadowRepelled=false, shadowTimer=null, appearanceTimer=null, codes={}, unlocked={medieval:true,lavoisier:false,modern:false};
const $=id=>document.getElementById(id);

// Optionele sidequest: elementnamen omzetten naar exact gespelde elementsymbolen.
// De vergelijking is hoofdlettergevoelig (bv. Pb is juist; PB en pb zijn fout).
const ELEMENT_SPRINT_ITEMS=[
 {name:"waterstof",symbol:"H"},{name:"helium",symbol:"He"},{name:"lithium",symbol:"Li"},{name:"beryllium",symbol:"Be"},{name:"boor",symbol:"B"},{name:"koolstof",symbol:"C"},{name:"stikstof",symbol:"N"},{name:"zuurstof",symbol:"O"},{name:"fluor",symbol:"F"},{name:"neon",symbol:"Ne"},
 {name:"natrium",symbol:"Na"},{name:"magnesium",symbol:"Mg"},{name:"aluminium",symbol:"Al"},{name:"silicium",symbol:"Si"},{name:"fosfor",symbol:"P"},{name:"zwavel",symbol:"S"},{name:"chloor",symbol:"Cl"},{name:"argon",symbol:"Ar"},{name:"kalium",symbol:"K"},{name:"calcium",symbol:"Ca"},
 {name:"scandium",symbol:"Sc"},{name:"titaan",symbol:"Ti"},{name:"vanadium",symbol:"V"},{name:"chroom",symbol:"Cr"},{name:"mangaan",symbol:"Mn"},{name:"ijzer",symbol:"Fe"},{name:"kobalt",symbol:"Co"},{name:"nikkel",symbol:"Ni"},{name:"koper",symbol:"Cu"},{name:"zink",symbol:"Zn"},
 {name:"gallium",symbol:"Ga"},{name:"germanium",symbol:"Ge"},{name:"arseen",symbol:"As"},{name:"seleen",symbol:"Se"},{name:"broom",symbol:"Br"},{name:"krypton",symbol:"Kr"},{name:"rubidium",symbol:"Rb"},{name:"strontium",symbol:"Sr"},{name:"yttrium",symbol:"Y"},{name:"zirkonium",symbol:"Zr"},
 {name:"niobium",symbol:"Nb"},{name:"molybdeen",symbol:"Mo"},{name:"technetium",symbol:"Tc"},{name:"ruthenium",symbol:"Ru"},{name:"rhodium",symbol:"Rh"},{name:"palladium",symbol:"Pd"},{name:"zilver",symbol:"Ag"},{name:"cadmium",symbol:"Cd"},{name:"indium",symbol:"In"},{name:"tin",symbol:"Sn"},
 {name:"antimoon",symbol:"Sb"},{name:"telluur",symbol:"Te"},{name:"jood",symbol:"I"},{name:"xenon",symbol:"Xe"},{name:"cesium",symbol:"Cs"},{name:"barium",symbol:"Ba"},{name:"lanthaan",symbol:"La"},{name:"cerium",symbol:"Ce"},{name:"praseodymium",symbol:"Pr"},{name:"neodymium",symbol:"Nd"},
 {name:"promethium",symbol:"Pm"},{name:"samarium",symbol:"Sm"},{name:"europium",symbol:"Eu"},{name:"gadolinium",symbol:"Gd"},{name:"terbium",symbol:"Tb"},{name:"dysprosium",symbol:"Dy"},{name:"holmium",symbol:"Ho"},{name:"erbium",symbol:"Er"},{name:"thulium",symbol:"Tm"},{name:"ytterbium",symbol:"Yb"},
 {name:"lutetium",symbol:"Lu"},{name:"hafnium",symbol:"Hf"},{name:"tantaal",symbol:"Ta"},{name:"wolfraam",symbol:"W"},{name:"rhenium",symbol:"Re"},{name:"osmium",symbol:"Os"},{name:"iridium",symbol:"Ir"},{name:"platina",symbol:"Pt"},{name:"goud",symbol:"Au"},{name:"kwik",symbol:"Hg"},
 {name:"thallium",symbol:"Tl"},{name:"lood",symbol:"Pb"},{name:"bismut",symbol:"Bi"},{name:"polonium",symbol:"Po"},{name:"astaat",symbol:"At"},{name:"radon",symbol:"Rn"},{name:"francium",symbol:"Fr"},{name:"radium",symbol:"Ra"},{name:"actinium",symbol:"Ac"},{name:"thorium",symbol:"Th"},
 {name:"protactinium",symbol:"Pa"},{name:"uranium",symbol:"U"},{name:"neptunium",symbol:"Np"},{name:"plutonium",symbol:"Pu"},{name:"americium",symbol:"Am"},{name:"curium",symbol:"Cm"},{name:"berkelium",symbol:"Bk"},{name:"californium",symbol:"Cf"},{name:"einsteinium",symbol:"Es"},{name:"fermium",symbol:"Fm"},
 {name:"mendelevium",symbol:"Md"},{name:"nobelium",symbol:"No"},{name:"lawrencium",symbol:"Lr"},{name:"rutherfordium",symbol:"Rf"},{name:"dubnium",symbol:"Db"},{name:"seaborgium",symbol:"Sg"},{name:"bohrium",symbol:"Bh"},{name:"hassium",symbol:"Hs"},{name:"meitnerium",symbol:"Mt"},{name:"darmstadtium",symbol:"Ds"},
 {name:"röntgenium",symbol:"Rg"},{name:"copernicium",symbol:"Cn"},{name:"nihonium",symbol:"Nh"},{name:"flerovium",symbol:"Fl"},{name:"moscovium",symbol:"Mc"},{name:"livermorium",symbol:"Lv"},{name:"tennessine",symbol:"Ts"},{name:"oganesson",symbol:"Og"}
];
const COSMETIC_SKINS=[
 {id:"starter",name:"Beginnende alchemist",emoji:"🧪",price:0,detail:"Je vertrouwde startuitrusting."},
 {id:"brass",name:"Messing Meester",emoji:"🥽",price:8,detail:"Een veiligheidsbril voor de echte laboprofessional."},
 {id:"crystal",name:"Kristalchemicus",emoji:"🔮",price:15,detail:"Een mysterieuze, fonkelende alchemistenskin."},
 {id:"neon",name:"Neononderzoeker",emoji:"🧑‍🔬",price:25,detail:"Een futuristische onderzoeker met flair."},
 {id:"cosmic",name:"Kosmische Alchemist",emoji:"🧑‍🚀",price:40,detail:"Voor chemici die tussen de sterren thuishoren."},
 {id:"master",name:"Meester der Elementen",emoji:"👑",price:60,detail:"De prestigieuze kroon voor verzamelaars."}
];
let labCoins=0, ownedSkins=new Set(["starter"]), equippedSkin="starter", sprintTimer=null, sprintTransitionTimer=null;
let sprintState={running:false,startingCoins:0,correct:0,answered:0,startedAt:0,queue:[],index:0,current:null,best:0,onlineSessionId:null};
// Leerlingen krijgen geen hints: verberg de knop in alle soorten vensters.
const hintButton=$("hint-button");
if(hintButton){hintButton.style.setProperty("display","none","important");hintButton.setAttribute("aria-hidden","true");hintButton.disabled=true;}
async function init(){try{const r=await fetch("vragen.json");if(!r.ok)throw Error("JSON niet geladen");questions=await r.json();resetState();log(LEVELS.medieval.intro);setStatus("Klik op een voorwerp om te beginnen.");scheduleShadow();}catch(e){setStatus("Vragen niet geladen. Start via start_windows.bat; zie LEESMIJ.txt.");console.error(e)}}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function resetState(){progress={medieval:0,lavoisier:0,modern:0};objectProgress={medieval:{object1:0,object2:0,object3:0,object4:0},lavoisier:{object1:0,object2:0,object3:0,object4:0},modern:{object1:0,object2:0,object3:0,object4:0}};levelSolved={medieval:false,lavoisier:false,modern:false};lockouts={};inventory=new Set();codes={};codeEntered={medieval:false,lavoisier:false,modern:false};unlocked={medieval:true,lavoisier:false,modern:false};Object.keys(LEVELS).forEach(l=>{levelQuestions[l]=shuffle(questions.filter(q=>q.level===l)).slice(0,12)});renderInventory();renderLevel();updateProgress();renderEconomyPanel();applyEquippedSkin()}
function setStatus(s){$("status-text").textContent=s}
function log(s){const el=$("logbook");el.textContent=s+"\n"+el.textContent}
function renderLevel(){const l=LEVELS[currentLevel];$("lab-art").src=l.art;$("lab-art").alt=l.name;document.querySelectorAll(".level-tab").forEach(b=>{b.classList.toggle("active",b.dataset.level===currentLevel);b.disabled=false;b.title=unlocked[b.dataset.level]?"Open dit tijdperk":"Voltooi eerst het vorige tijdperk en de verborgen opdracht";});["label1","label2","label3","label4"].forEach((id,i)=>{if($(id))$(id).textContent=l.labels[i]||"Puzzel";});
 // Toon het verdiende cijfer blijvend op de bijbehorende puzzelplek.
 document.querySelectorAll('.hotspot[data-object^="object"]').forEach(btn=>{const obj=btn.dataset.object;const idx=Number(obj.replace("object",""))-1;const digit=(codes[currentLevel]||[])[idx];const marker=btn.querySelector('span');if(marker){marker.textContent=digit!==undefined?String(digit):"✦";marker.setAttribute('aria-label',digit!==undefined?`Verdiend cijfer ${digit}`:"Puzzelplek nog niet voltooid");}btn.classList.toggle('puzzle-solved',(objectProgress[currentLevel]?.[obj]||0)>=3);});
 $("level-status").textContent=`${l.name}: ${Object.values(objectProgress[currentLevel]).filter(n=>n===3).length} van 4 puzzels voltooid · ${progress[currentLevel]} van 12 vragen`;
 const hiddenHotspot=document.querySelector(".hidden-hotspot");if(hiddenHotspot)hiddenHotspot.classList.toggle("solved",inventory.has(currentLevel));$("scene-caption").textContent=levelSolved[currentLevel]?"Thema voltooid! Zoek verborgen opdrachten of bezoek een ander tijdperk.":"Onderzoek de voorwerpen. Een verborgen opdracht wacht ergens in het labo.";renderEconomyPanel()}
function updateProgress(){const n=Object.values(levelSolved).filter(Boolean).length;$("progress-text").textContent=`${n} van 3 levels voltooid`;$("progress-fill").style.width=`${n/3*100}%`}
function renderInventory(){const items=[["medieval","🟡","Zwavel"],["lavoisier","⚫","Koolstof"],["modern","⚪","Nitraat"]];$("inventory-items").innerHTML=items.map(([k,icon,label])=>`<div class="inv-item ${inventory.has(k)?"collected":"empty"}">${icon}<small>${inventory.has(k)?label:"Nog zoeken"}</small></div>`).join("");$("inventory-note").textContent=`Verzameld: ${inventory.size} van 3 symbolen`;const ready=inventory.size===3&&!shadowRepelled;$("ward-button").disabled=!ready||!shadowVisible;$("ward-button").textContent=shadowRepelled?"Schaduw verdreven":"Verdrijf de Schaduw"}
function showQuestion(q){activeQuestion=q;activeKind="question";$("modal-category").textContent=`${LEVELS[currentLevel].name.toUpperCase()} · VRAAG ${progress[currentLevel]+1}/3`;$("modal-title").textContent=q.type==="numeric"?"Rekenvraag":"Meerkeuzevraag";$("question-text").textContent=q.question;const area=$("answer-area");area.innerHTML="";if(q.type==="numeric"){area.innerHTML='<input class="numeric-input" id="numeric-answer" type="number" min="0" step="1" placeholder="Vul een natuurlijk getal in" required>'}else q.options.forEach((op,i)=>{const label=document.createElement("label");label.className="option-label";label.innerHTML=`<input type="radio" name="choice" value="${i}"><span></span>`;label.querySelector("span").textContent=op;area.append(label)});$("check-button").classList.remove("hidden");$("check-button").textContent="Controleer antwoord";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden")}
function openObject(obj){if(obj==="antagonist"){if(!shadowVisible)return;showShadowEncounter();return}if(obj==="hidden"){if(inventory.has(currentLevel)){setStatus("Deze verborgen opdracht is al voltooid.");return}if(progress[currentLevel]<12){setStatus("Los eerst alle vier puzzels (12 vragen) van dit labo op om de verborgen opdracht vrij te spelen.");return}activeKind="hidden";$("modal-category").textContent="VERBORGEN OPDRACHT";$("modal-title").textContent="Een geheim voorwerp gevonden";$("question-text").textContent=LEVELS[currentLevel].hiddenText;$("answer-area").innerHTML='<p>Neem dit symbool op in je inventaris.</p>';$("hint-button").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").textContent="Verzamel voorwerp";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden");return}if(levelSolved[currentLevel]){setStatus("Dit level is al voltooid. Je kunt nog naar verborgen opdrachten zoeken.");return}if(Date.now()<(lockouts[currentLevel]?.[obj]||0)){setStatus(`Deze puzzel heeft nog ${Math.ceil((lockouts[currentLevel][obj]-Date.now())/1000)} seconden straftijd.`);showLockout(obj);return}const count=objectProgress[currentLevel]?.[obj]||0;
if(count>=3){setStatus("Deze puzzel is voltooid. Kies een andere plek in het labo.");return}
const q=levelQuestions[currentLevel].filter(x=>x.object===obj)[count];
if(!q){setStatus("Geen vraag gevonden voor deze plek. Controleer vragen.json.");return}
activeObject=obj;showQuestion(q)}
function showLockout(obj){activeKind="lockout";activeObject=obj;$("modal-category").textContent="STRAFTIJD";$("modal-title").textContent="Deze puzzel is geblokkeerd";$("question-text").textContent="Een fout antwoord geeft één minuut straftijd op deze specifieke puzzel. De andere drie plekken blijven beschikbaar."; $("answer-area").innerHTML='<div class="lockout-countdown" id="countdown"></div>';$("hint-button").classList.add("hidden");$("check-button").classList.add("hidden");$("modal-backdrop").classList.remove("hidden");const update=()=>{let left=Math.max(0,Math.ceil(((lockouts[currentLevel]||{})[obj]-Date.now())/1000));if($("countdown"))$("countdown").textContent=`Resterende tijd: ${String(Math.floor(left/60)).padStart(2,"0")}:${String(left%60).padStart(2,"0")}`;if(!left){clearInterval(window.lockInterval);if($("countdown"))$("countdown").textContent="Puzzel weer vrij";}};update();window.lockInterval=setInterval(update,250)}
async function submitAnswer(e){e.preventDefault();if(activeKind==="code-entry"){const entered=$("code-answer")?.value.trim();if(!/^\d{4}$/.test(entered||"")){feedback("Voer precies vier cijfers in.","bad");return;}const target=activeCodeTarget;if(target==="exit"){if(entered===LEVELS.modern.code.join("")){if(!shadowRepelled){feedback("De code klopt, maar verdrijf eerst de Schaduw met de drie symbolen.","bad");return;}finishGame();closeModal();log("De uitgangscode is correct. Het monster is verslagen en je bent ontsnapt!");}else feedback("Verkeerde code. Controleer de vier cijfers die je hebt verdiend.","bad");return;}const previous=target==="lavoisier"?"medieval":"lavoisier";if(entered===LEVELS[previous].code.join("")){unlocked[target]=true;currentLevel=target;closeModal();renderLevel();setStatus("Code correct! De tijdpoort is open.");log("Tijdpoort geopend: "+LEVELS[target].name);scheduleShadow();}else feedback("Verkeerde code. Controleer de vier verdiende cijfers.","bad");return;}if(activeKind==="hidden"){inventory.add(currentLevel);renderInventory();log("Verborgen ingrediënt gevonden in: "+LEVELS[currentLevel].name);setStatus("Verborgen symbool toegevoegd aan je inventaris.");unlockNextIfReady();closeModal();if(inventory.size===3)log("Alle drie symbolen gevonden. Je kunt de Schaduw verdrijven zodra hij verschijnt.");return}if(activeKind==="code"){const entered=$("numeric-answer")?.value.trim();const expected=LEVELS[currentLevel].code.join("");if(entered!==expected){feedback("Die code klopt niet. Controleer de drie cijfers en probeer opnieuw.","bad");return}codeEntered[currentLevel]=true;log("Tijdpoortcode correct ingevoerd voor: "+LEVELS[currentLevel].name);feedback("Code correct! De tijdpoort opent zodra ook de verborgen opdracht voltooid is.","good");unlockNextIfReady();renderLevel();setTimeout(()=>closeModal(),900);return}if(activeKind!=="question")return;const q=activeQuestion;let correct=false,submittedAnswer=null;if(q.type==="numeric"){const v=$("numeric-answer")?.value.trim();if(v===""){feedback("Vul eerst een antwoord in.","bad");return}submittedAnswer=Number(v);correct=submittedAnswer===Number(q.answer)}else{const s=document.querySelector('input[name="choice"]:checked');if(!s){feedback("Kies eerst een antwoord.","bad");return}submittedAnswer=Number(s.value);correct=submittedAnswer===Number(q.answer)}if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){try{const verified=await window.ChemieOnline.recordQuizAnswer(q.id,submittedAnswer);if(!verified||!verified.ok){feedback("De online controle lukte niet. Controleer je verbinding en probeer opnieuw.","bad");return}correct=Boolean(verified.correct);window.ChemieOnline.refreshDashboardSoon();}catch(err){console.error(err);feedback("Geen verbinding met de XP-server. Probeer dit antwoord opnieuw.","bad");return}}if(!correct){lockouts[currentLevel]=lockouts[currentLevel]||{};lockouts[currentLevel][activeObject]=Date.now()+PENALTY*1000;feedback("Fout antwoord! Deze puzzelplek is één minuut geblokkeerd. De andere plekken blijven beschikbaar.","bad");setStatus("Straftijd actief op "+LEVELS[currentLevel].labels[Number(activeObject.replace("object",""))-1]);$("answer-area").querySelectorAll("input").forEach(i=>i.disabled=true);$("check-button").textContent="Verder";$("check-button").onclick=e=>{e.preventDefault();closeModal();$("check-button").onclick=null};return}objectProgress[currentLevel][activeObject]=(objectProgress[currentLevel][activeObject]||0)+1;progress[currentLevel]++;
const localCount=objectProgress[currentLevel][activeObject], puzzleIndex=Number(activeObject.replace("object",""))-1;
if(localCount===3){
 codes[currentLevel]=codes[currentLevel]||[];codes[currentLevel][puzzleIndex]=LEVELS[currentLevel].code[puzzleIndex];
 log(`Puzzel ${puzzleIndex+1} voltooid in ${LEVELS[currentLevel].name}. Verdiend cijfer: ${codes[currentLevel][puzzleIndex]}.`);
 if(progress[currentLevel]===12){levelSolved[currentLevel]=true;log("Alle vier puzzels voltooid in: "+LEVELS[currentLevel].name);feedback("Alle vier puzzels opgelost! Je hebt vier cijfers verdiend. Klik bovenaan op het volgende tijdperk en voer de code zelf in.","good");setStatus("Vier puzzels voltooid. Voer de code in bij de volgende tijdpoort.");}
 else {feedback(`Puzzel ${puzzleIndex+1}/4 voltooid! Je hebt cijfer ${codes[currentLevel][puzzleIndex]} verdiend. Kies een andere plek.`,"good");setStatus("Puzzel voltooid. Kies een andere plek in het labo.");}
}else{feedback(`Juist! Vraag ${localCount} van 3 bij deze puzzel opgelost.`,"good");setStatus("Goed antwoord. Ga verder op dezelfde plek.");}
renderLevel();updateProgress();
// Ga na een juist antwoord vanzelf door naar de volgende vraag van dezelfde plek.
if(localCount<QUESTIONS_PER_PUZZLE){
 const samePuzzleQuestions=levelQuestions[currentLevel].filter(x=>x.object===activeObject);
 const nextQ=samePuzzleQuestions[localCount];
 const answeredObject=activeObject;
 const answeredLevel=currentLevel;
 setStatus(`Juist! Volgende vraag van ${LEVELS[currentLevel].labels[puzzleIndex]} wordt geopend…`);
 $("check-button").classList.add("hidden");
 // Open de volgende vraag rechtstreeks; niet afhankelijk maken van de zichtbaarheid van het venster.
 setTimeout(()=>{if(nextQ && currentLevel===answeredLevel && activeObject===answeredObject && activeKind==="question"){showQuestion(nextQ);}},650);
}else{
 // De puzzel is klaar: laat de bevestiging kort zien en sluit daarna vanzelf.
 $("answer-area").querySelectorAll("input").forEach(i=>i.disabled=true);
 $("check-button").classList.add("hidden");
 setTimeout(()=>{closeModal();},1400);
} }
function unlockNextIfReady(){if(!codeEntered[currentLevel]||!inventory.has(currentLevel))return;const order=["medieval","lavoisier","modern"];const i=order.indexOf(currentLevel);if(i>=0&&i<order.length-1){unlocked[order[i+1]]=true;setStatus("Tijdpoort geopend! Het volgende labo is nu toegankelijk.");log("Tijdpoort ontgrendeld: "+LEVELS[order[i+1]].name);renderLevel();}else if(currentLevel==="modern"){setStatus("Laatste tijdpoort geopend.")}}
function showCodeEntry(){activeKind="code";$("modal-category").textContent="TIJDPOORTCODE";$("modal-title").textContent="Open de tijdpoort";$("question-text").textContent="Voer de viercijferige code in die je met de vier puzzels hebt verdiend.";$("answer-area").innerHTML='<input class="numeric-input" id="numeric-answer" type="text" inputmode="numeric" maxlength="4" placeholder="Viercijferige code" required>';$("hint-button").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").textContent="Ontgrendel tijdpoort";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden")}
function feedback(t,k){$("feedback").textContent=t;$("feedback").className="feedback "+k}
function closeModal(){$("modal-backdrop").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").onclick=null}
function showShadowEncounter(){activeKind="shadow";$("modal-category").textContent="DE SCHADUW";$("modal-title").textContent=inventory.size===3?"Je hebt de drie symbolen verzameld!":"Een mysterieuze verschijning";$("question-text").textContent=inventory.size===3?"Je inventaris bevat alle drie symbolische ingrediënten. Gebruik de veilige, fictieve alchemistische afweer om de Schaduw terug door de tijdpoort te sturen.":"De Schaduw grijnst en verdwijnt bijna meteen. Je hebt nog niet alle drie de symbolen gevonden. Onderzoek de verborgen opdrachten in elk tijdperk."; $("answer-area").innerHTML=inventory.size===3?'<p>De drie symbolen vormen samen een fictief afweerteken. Er zijn geen echte mengverhoudingen of bereidingsstappen nodig.</p>':'<p>Tip: voltooi elk level en zoek daarna de verborgen opdracht.</p>';$("hint-button").classList.add("hidden");$("check-button").classList.toggle("hidden",inventory.size!==3);$("check-button").textContent="Activeer afweerteken";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden")}
function scheduleShadow(){
  if(appearanceTimer) clearTimeout(appearanceTimer);
  appearanceTimer=setTimeout(()=>{
    if(shadowRepelled) return;
    shadowVisible=true;
    $("antagonist").classList.remove("hidden");
    $("antagonist-status").textContent="Hij is verschenen in dit labo!";
    $("shadow-meter-fill").style.width="100%";
    setStatus("Pas op! De Schaduw is verschenen.");
    log("De Schaduw werd gezien in "+LEVELS[currentLevel].name+".");
    renderInventory();
    shadowTimer=setTimeout(()=>{
      shadowVisible=false;
      $("antagonist").classList.add("hidden");
      $("antagonist-status").textContent="De Schaduw is weer verdwenen…";
      $("shadow-meter-fill").style.width="25%";
      renderInventory();
      scheduleShadow();
    },12000+Math.random()*10000);
  },8000+Math.random()*14000);
}
function repelShadow(){shadowRepelled=true;shadowVisible=false;$("antagonist").classList.add("hidden");$("antagonist-status").textContent="Verdreven! De tijdlijn is veilig."; $("shadow-meter-fill").style.width="0%";renderInventory();log("De Schaduw is verdreven met het symbolische afweerteken.");closeModal();checkWin();if(!Object.values(levelSolved).every(Boolean))setStatus("De Schaduw is verdreven. Voltooi de overige levels!")}
function checkWin(){if(Object.values(levelSolved).every(Boolean)&&inventory.size===3&&shadowRepelled){finishGame()}}
function finishGame(){
 if(appearanceTimer)clearTimeout(appearanceTimer);
 if(shadowTimer)clearTimeout(shadowTimer);
 shadowVisible=false;
 const screen=$("win-screen");
 screen.classList.remove("hidden");
 screen.classList.add("game-finished");
 // Pas de automatische herstart: het eindscherm blijft staan tot de speler zelf de pagina verlaat.
 const heading=screen.querySelector("h1,h2,h3");
 if(heading)heading.textContent="Gewonnen! Het monster is verslagen!";
 const text=screen.querySelector("p");
 if(text)text.textContent="De Schaduw is verdreven, de tijdlijn is veilig en je bent ontsnapt. Het avontuur is afgelopen.";
 const replay=$("play-again");
 if(replay){replay.classList.add("hidden");replay.disabled=true;}
 setStatus("Escape room voltooid. Het monster is verslagen!");
}
let activeCodeTarget=null;
function askCode(target,isFinal=false){activeKind="code-entry";activeCodeTarget=target;$("modal-category").textContent="CODE-INVOER";$("modal-title").textContent=isFinal?"Laatste tijdslot":"Tijdpoort vergrendeld";$("question-text").textContent=isFinal?"Voer de vier cijfers in die je in het moderne labo hebt verdiend om de uitgang te openen.":`Voer de vier cijfers in die je in het vorige labo hebt verdiend om ${LEVELS[target].name} te betreden.`;$("answer-area").innerHTML='<input class="numeric-input" id="code-answer" type="text" inputmode="numeric" maxlength="4" placeholder="Voer de 4-cijferige code in" autocomplete="off">';$("hint-button").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").textContent="Code controleren";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden");}
document.querySelectorAll(".level-tab").forEach(b=>b.addEventListener("click",()=>{
 const target=b.dataset.level;
 if(target===currentLevel){setStatus("Je bevindt je al in dit labo.");return;}
 if(target==="medieval") { currentLevel="medieval"; renderLevel(); setStatus("Je keert terug naar het middeleeuwse labo."); return; }
 const previous=target==="lavoisier"?"medieval":"lavoisier";
 if(progress[previous]!==12){setStatus("Deze tijdpoort blijft gesloten. Los eerst alle vier puzzels (12 vragen) in het vorige labo op.");return;}
 if(unlocked[target]) { currentLevel=target; renderLevel(); setStatus("Je betreedt: "+LEVELS[currentLevel].name+"."); log(LEVELS[currentLevel].intro); return; }
 askCode(target);
}));
document.querySelectorAll(".hotspot").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.object==="door"){if(progress.modern===12)askCode("exit",true);else setStatus("De uitgang blijft gesloten. Los eerst alle vier puzzels in het moderne labo op.");return;}openObject(b.dataset.object)}));
// De verborgen opdracht is te vinden door op de onzichtbare hotspot in de scène te klikken.
const ingredientHotspot=document.querySelector(".hidden-hotspot");
if(ingredientHotspot){
 ingredientHotspot.style.opacity="0";
 ingredientHotspot.style.background="transparent";
 ingredientHotspot.style.borderColor="transparent";
 ingredientHotspot.style.color="transparent";
 ingredientHotspot.setAttribute("aria-label","Verborgen ingrediënt zoeken");
 ingredientHotspot.addEventListener("click",()=>openObject("hidden"));
}

$("answer-form").addEventListener("submit",submitAnswer);$("close-modal").addEventListener("click",closeModal);
$("ward-button").addEventListener("click",()=>{if(inventory.size===3&&shadowVisible)showShadowEncounter()});
$("check-button").addEventListener("click",e=>{if(activeKind==="shadow"&&inventory.size===3){e.preventDefault();repelShadow()}});
$("reset-button").addEventListener("click",()=>{if(!$("win-screen").classList.contains("game-finished"))location.reload();});
if($("play-again")){$("play-again").classList.add("hidden");$("play-again").disabled=true;}


// LabCoins, de optionele Elementensprint en de winkel worden door game.js opgebouwd.
// Daardoor hoeft alleen dit bestand vervangen te worden.
function initEconomyUI(){
 const side=document.querySelector(".side-panel");
 if(!side||$("labcoins-panel"))return;
 const panel=document.createElement("section");
 panel.id="labcoins-panel";panel.className="labcoins-panel";
 panel.innerHTML=`
  <div class="labcoins-heading"><div><p class="economy-eyebrow">BONUSSPEL</p><h3>🪙 LabCoins</h3></div><div class="coin-count"><span id="labcoin-balance">0</span><small>coins</small></div></div>
  <p class="labcoins-copy">Verdien munten met de optionele Elementensprint. Gewone puzzels geven alleen hun deurcijfer.</p>
  <div class="skin-preview"><span class="skin-preview-icon" id="equipped-skin-icon">🧪</span><span><small>Huidige skin</small><strong id="equipped-skin-name">Beginnende alchemist</strong></span></div>
  <button type="button" class="primary full economy-action" id="element-sprint-open">⚡ Elementensprint · 60 sec</button>
  <button type="button" class="secondary full economy-action" id="skin-shop-open">🛍️ Open de skinwinkel</button>`;
 const inventory=side.querySelector(".inventory");
 if(inventory)inventory.insertAdjacentElement("afterend",panel);else side.append(panel);
 const overlay=document.createElement("div");
 overlay.id="economy-overlay";overlay.className="economy-overlay hidden";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","economy-title");
 overlay.innerHTML=`<section class="economy-dialog"><button type="button" class="close-button" id="economy-close" aria-label="Sluiten">×</button><div id="economy-content"></div></section>`;
 document.body.append(overlay);
 const style=document.createElement("style");
 style.id="economy-inline-styles";
 style.textContent=`
 .labcoins-panel{grid-column:1/-1;margin-top:13px;padding:14px;background:linear-gradient(145deg,#132f45,#234a60);border:1px solid #476b7b;border-radius:13px;color:#fff;box-shadow:0 8px 22px #172c4018}
 .labcoins-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.labcoins-heading h3{font-size:1rem;margin:0}.economy-eyebrow{font-size:.62rem;letter-spacing:.13em;color:#85d8dc;font-weight:900;margin:0 0 3px}.coin-count{min-width:60px;text-align:center;padding:5px 9px;border-radius:10px;background:#f5c86d;color:#44300a;font-weight:900;font-size:1.25rem;line-height:1.05}.coin-count small{display:block;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}.labcoins-copy{font-size:.75rem;line-height:1.45;color:#d6e7ee;margin:9px 0}.skin-preview{display:flex;align-items:center;gap:10px;border:1px solid #557382;background:#ffffff0d;border-radius:10px;padding:8px 10px;margin:10px 0}.skin-preview-icon{display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;font-size:1.75rem;background:#ffffff12;border-radius:10px}.skin-preview small,.skin-preview strong{display:block}.skin-preview small{font-size:.65rem;color:#b8d1dc;margin-bottom:3px}.skin-preview strong{font-size:.78rem}.economy-action{margin-top:7px!important}.labcoins-panel .primary{background:#f5c86d;color:#42300c;box-shadow:0 3px 0 #b78d3d}.labcoins-panel .secondary{background:#e1eef3;color:#18394f}.economy-overlay{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:15px;background:#0c2236e8;overflow:auto}.economy-dialog{position:relative;width:min(680px,100%);max-height:92vh;overflow:auto;background:#fffdf8;border:1px solid #e3d8c6;border-radius:19px;padding:25px;box-shadow:0 24px 90px #0006;color:#203b4c}.economy-dialog .close-button{position:absolute;z-index:2;right:10px;top:7px}.economy-title{font-size:1.45rem;margin:2px 38px 7px 0}.economy-lead{font-size:.88rem;line-height:1.55;color:#526a76;margin:0 0 16px}.sprint-hud{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:14px 0}.sprint-timer{font-size:1.65rem;font-weight:1000;color:#fff;background:#17364c;border-radius:10px;padding:8px 14px;font-variant-numeric:tabular-nums}.sprint-timer.urgent{background:#9c3445;animation:sprintPulse .7s infinite alternate}@keyframes sprintPulse{to{transform:scale(1.04)}}.sprint-score{font-size:.78rem;color:#4f6672;font-weight:800}.sprint-question{padding:18px 14px;border-radius:13px;background:#edf5f7;text-align:center;margin:11px 0}.sprint-question small{display:block;color:#52707e;font-weight:800;text-transform:uppercase;letter-spacing:.1em;font-size:.66rem;margin-bottom:8px}.sprint-element-name{font-size:clamp(1.65rem,5vw,2.5rem);font-weight:1000;line-height:1.15;color:#16384c}.sprint-form{display:flex;gap:8px;margin-top:12px}.sprint-input{flex:1;min-width:0;padding:12px;border:1px solid #bdd0d8;border-radius:9px;font:inherit;font-size:1.05rem}.sprint-feedback{min-height:24px;margin:10px 0 0;font-size:.85rem;font-weight:800}.sprint-feedback.good{color:#14754e}.sprint-feedback.bad{color:#a84b2c}.sprint-rules{font-size:.8rem;line-height:1.6;color:#506874;background:#f3f5f3;padding:11px 13px;border-radius:10px;margin:12px 0}.sprint-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:17px 0}.sprint-result{padding:13px 7px;text-align:center;border:1px solid #d8e4e8;background:#f0f7f8;border-radius:11px}.sprint-result strong{display:block;font-size:1.45rem;color:#153e53}.sprint-result small{font-size:.68rem;color:#526b78}.shop-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:15px}.shop-item{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid #dbe4e7;background:#f7faf9;border-radius:13px;padding:12px}.shop-item.equipped{border-color:#4aab8a;box-shadow:inset 0 0 0 1px #4aab8a;background:#eff9f4}.shop-item-top{display:flex;align-items:center;gap:10px}.shop-item-icon{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border-radius:12px;background:linear-gradient(145deg,#e0eff2,#f6e9cf);font-size:2rem}.shop-item h3{font-size:.92rem;line-height:1.2;margin:0 0 4px}.shop-price{font-size:.75rem;font-weight:900;color:#8a6516}.shop-detail{font-size:.76rem;line-height:1.4;color:#5a707b;flex:1}.shop-item button{width:100%;font-size:.76rem;padding:9px 8px}.shop-item .primary{background:#176f96}.shop-item .secondary{background:#e6eff2}.shop-tag{display:inline-block;align-self:flex-start;background:#e2f4eb;color:#166448;padding:3px 7px;border-radius:5px;font-size:.62rem;font-weight:900}.economy-dialog .primary{background:#176f96;color:white}.economy-dialog button:disabled{opacity:.48}@media(max-width:560px){.economy-dialog{padding:22px 15px 17px}.shop-grid{grid-template-columns:1fr}.sprint-form{flex-direction:column}.sprint-form button{width:100%}.sprint-results{gap:5px}.sprint-result strong{font-size:1.25rem}}
 `;
 document.head.append(style);
 $("economy-close").addEventListener("click",closeEconomyOverlay);
 overlay.addEventListener("click",e=>{if(e.target===overlay)closeEconomyOverlay()});
 $("element-sprint-open").addEventListener("click",openElementSprint);
 $("skin-shop-open").addEventListener("click",openSkinShop);
 $("economy-content").addEventListener("click",handleEconomyClick);
 $("economy-content").addEventListener("submit",e=>{if(e.target&&e.target.id==="sprint-answer-form")submitSprintAnswer(e)});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("economy-overlay").classList.contains("hidden")){if(sprintState.running){setStatus("De Elementensprint loopt nog; sluit de opdracht pas na afloop.");return;}closeEconomyOverlay();}});
 renderEconomyPanel();applyEquippedSkin();
}
function renderEconomyPanel(){
 const balance=$("labcoin-balance");if(balance)balance.textContent=String(labCoins);
 const icon=$("equipped-skin-icon"),name=$("equipped-skin-name"),skin=COSMETIC_SKINS.find(x=>x.id===equippedSkin)||COSMETIC_SKINS[0];
 if(icon)icon.textContent=skin.emoji;if(name)name.textContent=skin.name;
 const quest=$("element-sprint-open");if(quest){quest.disabled=currentLevel!=="medieval"||sprintState.running;quest.textContent=currentLevel==="medieval"?"⚡ Elementensprint · 60 sec":"⚡ Beschikbaar in level 1";quest.title=currentLevel==="medieval"?"Start de optionele quiz over elementsymbolen":"Keer terug naar het middeleeuwse labo voor de sidequest";}
 applyEquippedSkin();
}
function applyEquippedSkin(){
 const skin=COSMETIC_SKINS.find(x=>x.id===equippedSkin)||COSMETIC_SKINS[0];
 const avatar=document.querySelector(".shadow-duel .hero");if(avatar){avatar.textContent=skin.emoji;avatar.title=skin.name;avatar.setAttribute("aria-label",skin.name);}
 const panelIcon=$("equipped-skin-icon"),panelName=$("equipped-skin-name");if(panelIcon)panelIcon.textContent=skin.emoji;if(panelName)panelName.textContent=skin.name;
}
function showEconomyOverlay(content){$("economy-content").innerHTML=content;$("economy-overlay").classList.remove("hidden");}
function closeEconomyOverlay(){if(sprintState.running){setStatus("De Elementensprint loopt nog. De timer blijft lopen tot de minuut voorbij is.");return;}$("economy-overlay").classList.add("hidden");}
function openSkinShop(){
 if(sprintState.running){setStatus("Maak eerst de Elementensprint af voor je naar de winkel gaat.");return;}
 renderShop();
}
function renderShop(){
 const owned=ownedSkins;
 const cards=COSMETIC_SKINS.map(skin=>{
  const isOwned=owned.has(skin.id),isEquipped=equippedSkin===skin.id;
  let label,disabled=false,buttonClass="primary";
  if(isEquipped){label="✓ In gebruik";disabled=true;buttonClass="secondary";}
  else if(isOwned){label="Draag deze skin";buttonClass="secondary";}
  else if(labCoins<skin.price){label=`Nog ${skin.price-labCoins} coins nodig`;disabled=true;buttonClass="secondary";}
  else label=`Koop voor ${skin.price} 🪙`;
  return `<article class="shop-item ${isEquipped?"equipped":""}"><div class="shop-item-top"><span class="shop-item-icon" aria-hidden="true">${skin.emoji}</span><div><h3>${skin.name}</h3><div class="shop-price">${skin.price===0?"Gratis startskin":`${skin.price} LabCoins`}</div></div></div>${isEquipped?'<span class="shop-tag">Momenteel gedragen</span>':""}<p class="shop-detail">${skin.detail}</p><button type="button" class="${buttonClass}" data-skin-id="${skin.id}" ${disabled?"disabled":""}>${label}</button></article>`;
 }).join("");
 showEconomyOverlay(`<p class="economy-eyebrow">LABCOIN-WINKEL</p><h2 class="economy-title" id="economy-title">🛍️ De skinwinkel</h2><p class="economy-lead">Koop alleen uiterlijke aanpassingen voor je chemicus. Skins geven geen voordeel bij de vragen. Je saldo: <strong>${labCoins} LabCoins</strong>.</p><div class="shop-grid">${cards}</div>`);
}
function openElementSprint(){
 if(currentLevel!=="medieval"){setStatus("De Elementensprint is beschikbaar in het eerste, middeleeuwse labo.");return;}
 if(sprintState.running){setStatus("De Elementensprint loopt al.");return;}
 showEconomyOverlay(`<p class="economy-eyebrow">OPTIONELE SIDEQUEST · LEVEL 1</p><h2 class="economy-title" id="economy-title">⚡ De Elementensprint</h2><p class="economy-lead">Je krijgt <strong>60 seconden</strong>. De naam van een element verschijnt; typ het juiste elementsymbool en let goed op hoofdletters. Bijvoorbeeld: lood → <strong>Pb</strong>, niet PB of pb.</p><div class="sprint-rules"><strong>Beloningen:</strong> juiste antwoorden 1–5 leveren elk 1 coin op; antwoorden 6–10 elk 2 coins; antwoorden 11–15 elk 3 coins, enzovoort. Een gewoon antwoord in de escape-roomquiz levert geen coins op.</div><button type="button" class="primary full" id="element-sprint-start">Start de 60 seconden</button><p class="muted">De sidequest is vrijwillig en verandert niets aan je deurcodes.</p>`);
}
async function startElementSprint(){
 if(currentLevel!=="medieval"){closeEconomyOverlay();setStatus("De Elementensprint is beschikbaar in het eerste labo.");return;}
 if(sprintState.running){setStatus("De Elementensprint loopt al.");return;}
 if(sprintTimer)clearInterval(sprintTimer);if(sprintTransitionTimer)clearTimeout(sprintTransitionTimer);
 let onlineSessionId=null,questionQueue=null;
 if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  const remote=await window.ChemieOnline.startSprint();
  if(!remote||!remote.ok){setStatus(remote?.error||"De online sprint kon niet starten. Probeer opnieuw.");return;}
  onlineSessionId=remote.session_id||null;
  if(Array.isArray(remote.items))questionQueue=remote.items.map(name=>ELEMENT_SPRINT_ITEMS.find(x=>x.name===name)).filter(Boolean);
  if(remote.coins!==undefined)labCoins=Number(remote.coins)||0;
 }
 sprintState={running:true,startingCoins:labCoins,correct:0,answered:0,startedAt:Date.now(),queue:questionQueue?.length?questionQueue:shuffle(ELEMENT_SPRINT_ITEMS),index:0,current:null,best:sprintState.best||0,onlineSessionId};
 renderEconomyPanel();renderSprintQuestion();tickSprintTimer();sprintTimer=setInterval(tickSprintTimer,100);
}
function tickSprintTimer(){
 if(!sprintState.running)return;
 const remaining=Math.max(0,60000-(Date.now()-sprintState.startedAt));
 const timer=$("sprint-time-left");if(timer){timer.textContent=`0:${String(Math.ceil(remaining/1000)).padStart(2,"0")}`;timer.classList.toggle("urgent",remaining<=10000);}
 if(remaining<=0)finishElementSprint();
}
function renderSprintQuestion(){
 if(!sprintState.running)return;
 const item=sprintState.queue[sprintState.index%sprintState.queue.length];sprintState.current=item;sprintState.index++;
 showEconomyOverlay(`<p class="economy-eyebrow">ELEMENTENSPRINT · LEVEL 1</p><h2 class="economy-title" id="economy-title">Noem het elementsymbool</h2><div class="sprint-hud"><div class="sprint-timer" id="sprint-time-left">1:00</div><div class="sprint-score"><span id="sprint-correct-count">${sprintState.correct}</span> juist · <span id="sprint-answered-count">${sprintState.answered}</span> beantwoord</div></div><div class="sprint-question"><small>Welk symbool hoort bij dit element?</small><div class="sprint-element-name">${item.name}</div></div><form class="sprint-form" id="sprint-answer-form"><input class="sprint-input" id="sprint-symbol-answer" name="symbol" type="text" maxlength="3" placeholder="Elementsymbool" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Elementsymbool" required><button type="submit" class="primary">Antwoord</button></form><p class="sprint-feedback" id="sprint-feedback" aria-live="polite">Let op hoofdletters, zoals Na, Fe en Pb.</p>`);
 tickSprintTimer();
 const input=$("sprint-symbol-answer");if(input)input.focus({preventScroll:true});
}
async function submitSprintAnswer(e){
 e.preventDefault();if(!sprintState.running||!sprintState.current)return;
 const input=$("sprint-symbol-answer"),submit=$("sprint-answer-form")?.querySelector('button[type="submit"]');
 const typed=(input?.value||"").trim();if(!typed){if(input)input.focus();return;}
 const item=sprintState.current;sprintState.answered++;
 let message="",kind="bad";
 if(sprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  const verified=await window.ChemieOnline.submitSprintAnswer(sprintState.onlineSessionId,item.name,typed);
  if(!verified||!verified.ok){sprintState.answered--;message=verified?.error||"De online controle is mislukt. Probeer opnieuw.";const note=$("sprint-feedback");if(note){note.textContent=message;note.className="sprint-feedback bad";}if(input)input.focus();return;}
  sprintState.correct=Number(verified.correct_count)||0;
  sprintState.answered=Number(verified.answered_count)||sprintState.answered;
  labCoins=Number(verified.coins)||0;
  if(verified.correct){message=`Juist! ${item.name} = ${item.symbol}. +${verified.reward} ${Number(verified.reward)===1?"coin":"coins"}.`;kind="good";}
  else{message=`Niet juist. ${item.name} heeft het symbool ${item.symbol}. Geen coins deze keer.`;}
  window.ChemieOnline.refreshDashboardSoon();
 }else{
  if(typed===item.symbol){const reward=Math.floor(sprintState.correct/5)+1;sprintState.correct++;labCoins+=reward;message=`Juist! ${item.name} = ${item.symbol}. +${reward} ${reward===1?"coin":"coins"}.`;kind="good";}
  else{message=`Niet juist. ${item.name} heeft het symbool ${item.symbol}. Geen coins deze keer.`;}
 }
 const note=$("sprint-feedback");if(note){note.textContent=message;note.className=`sprint-feedback ${kind}`;}
 if(input)input.disabled=true;if(submit)submit.disabled=true;
 const correctEl=$("sprint-correct-count"),answeredEl=$("sprint-answered-count");if(correctEl)correctEl.textContent=String(sprintState.correct);if(answeredEl)answeredEl.textContent=String(sprintState.answered);
 renderEconomyPanel();
 sprintTransitionTimer=setTimeout(()=>{if(sprintState.running)renderSprintQuestion();},280);
}
async function finishElementSprint(){
 if(!sprintState.running)return;
 sprintState.running=false;if(sprintTimer){clearInterval(sprintTimer);sprintTimer=null;}if(sprintTransitionTimer){clearTimeout(sprintTransitionTimer);sprintTransitionTimer=null;}
 if(sprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{const settled=await window.ChemieOnline.finishSprint(sprintState.onlineSessionId);if(settled&&settled.ok){labCoins=Number(settled.coins)||0;sprintState.correct=Number(settled.correct_count)||sprintState.correct;sprintState.answered=Number(settled.answered_count)||sprintState.answered;}else if(settled?.error){setStatus(settled.error);}}catch(err){console.error(err);}
 }
 const earned=labCoins-sprintState.startingCoins;sprintState.best=Math.max(sprintState.best,sprintState.correct);
 renderEconomyPanel();
 showEconomyOverlay(`<p class="economy-eyebrow">SIDEQUEST VOLTOOID</p><h2 class="economy-title" id="economy-title">⏱️ De minuut is voorbij!</h2><p class="economy-lead">Goed gesprint. Je beloning is toegevoegd aan je LabCoin-saldo.</p><div class="sprint-results"><div class="sprint-result"><strong>${sprintState.correct}</strong><small>Juiste antwoorden</small></div><div class="sprint-result"><strong>${sprintState.answered}</strong><small>Beantwoord</small></div><div class="sprint-result"><strong>+${earned}</strong><small>Verdiende coins</small></div></div><div class="sprint-rules">Je beste score in deze speelsessie: <strong>${sprintState.best}</strong> juiste antwoorden. Je kunt de sprint opnieuw spelen om je score te verbeteren en extra coins te verdienen.</div><button type="button" class="primary full" id="element-sprint-retry">Nog een ronde</button><button type="button" class="secondary full" id="economy-done">Terug naar het labo</button>`);
 setStatus(`Elementensprint klaar: ${sprintState.correct} juist, ${earned} coins verdiend.`);
 if(window.ChemieOnline)window.ChemieOnline.refreshDashboardSoon();
}
async function handleEconomyClick(e){
 const start=e.target.closest("#element-sprint-start");if(start){startElementSprint();return;}
 const retry=e.target.closest("#element-sprint-retry");if(retry){startElementSprint();return;}
 const done=e.target.closest("#economy-done");if(done){closeEconomyOverlay();return;}
 const skinButton=e.target.closest("[data-skin-id]");if(skinButton){
  const skin=COSMETIC_SKINS.find(x=>x.id===skinButton.dataset.skinId);if(!skin)return;
  if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
   const result=ownedSkins.has(skin.id)?await window.ChemieOnline.equipSkin(skin.id):await window.ChemieOnline.buySkin(skin.id);
   if(!result||!result.ok){setStatus(result?.error||"De skin kon niet online worden opgeslagen.");return;}
   if(window.ChemieGameBridge)window.ChemieGameBridge.applyOnlineEconomy(result.economy);
   renderEconomyPanel();renderShop();window.ChemieOnline.refreshDashboardSoon();setStatus(`${ownedSkins.has(skin.id)?"Skin uitgerust":"Nieuwe skin gekocht en uitgerust"}: ${skin.name}.`);return;
  }
  if(ownedSkins.has(skin.id)){equippedSkin=skin.id;applyEquippedSkin();renderEconomyPanel();renderShop();setStatus(`Skin uitgerust: ${skin.name}.`);return;}
  if(labCoins<skin.price)return;
  labCoins-=skin.price;ownedSkins.add(skin.id);equippedSkin=skin.id;applyEquippedSkin();renderEconomyPanel();renderShop();setStatus(`Nieuwe skin gekocht en uitgerust: ${skin.name}.`);return;
 }
}

// Public bridge used by the optional online layer; the server remains the authority for rewards and purchases.
window.ChemieGameBridge={
 getEconomyState(){return {coins:labCoins,ownedSkins:[...ownedSkins],equippedSkin};},
 applyOnlineEconomy(state){if(!state)return;if(Number.isFinite(Number(state.coins)))labCoins=Number(state.coins);if(Array.isArray(state.ownedSkins))ownedSkins=new Set(state.ownedSkins);if(state.equippedSkin&&COSMETIC_SKINS.some(x=>x.id===state.equippedSkin))equippedSkin=state.equippedSkin;renderEconomyPanel();applyEquippedSkin();},
 refresh(){renderEconomyPanel();applyEquippedSkin();}
};

initEconomyUI();
init();