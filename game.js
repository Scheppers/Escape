const LEVELS={
 medieval:{name:"Middeleeuws alchemistenlabo",art:"assets/medieval_lab.svg",labels:["Scheidingstechnieken","Aspecten en wetten","Atoommodellen","De chemische binding"],code:[3,7,2,4],intro:"Je bent aangekomen in een middeleeuws alchemistenlabo."},
 lavoisier:{name:"Labo tijdens de Franse Revolutie",art:"assets/french_lab.svg",labels:["Reacties in waterig midden","Kwantitatieve aspecten","Koolstofchemie","Redoxreacties"],code:[8,1,5,6],intro:"De tijdreis brengt je naar het labo van Lavoisier."},
 modern:{name:"Modern chemielabo",art:"assets/modern_lab.svg",labels:["Chemisch evenwicht","pH van een oplossing","Redoxreacties","Elektronenconfiguratie"],code:[6,4,9,2],intro:"Je bereikt het moderne chemielabo."},
 future:{name:"Futuristisch chemielabo",art:"assets/futuristic_lab.svg",labels:["Koolwaterstoffen","Monofunctionele verbindingsklassen","Polyfunctionele verbindingsklassen","Kunststoffen"],code:[5,2,8,1],intro:"Je stapt de toekomst binnen. Het futuristische labo bewaakt de laatste tijdcode."}
};
const LEVEL_ORDER=Object.keys(LEVELS);
const LEVEL_TOTAL=LEVEL_ORDER.length;
const QUESTIONS_PER_LEVEL=12, QUESTIONS_PER_PUZZLE=3, PENALTY=60;
const DIFFICULTIES={basis:"Basis",gemiddeld:"Gemiddeld",moeilijk:"Moeilijk"};
let teacherMode=false;
let codeEntered=Object.fromEntries(Object.keys(LEVELS).map(k=>[k,false]));
let questions=[], pendingOnlineQuestionBank=null, objectProgress={}, puzzleSolved={}, puzzleCompletions={}, currentLevel="medieval", progress={}, levelSolved={}, levelQuestions={}, lockouts={}, inventory={kno3:0,carbon:0,sulfur:0}, activeQuestion=null, activeObject=null, activeKind="question", activeAttemptId=null, activeAttemptQuestions=[], activeAttemptCorrectIds=[], activeAttemptIndex=0, activeAttemptRequired=QUESTIONS_PER_PUZZLE, activeDifficulty="basis", activeRunLevel=null, activeRunObject=null, activeRunToken=0, shadowVisible=false, shadowTimer=null, appearanceTimer=null, shadowEncounterId=null, localShadowMaterial=null, codes={}, unlocked=Object.fromEntries(Object.keys(LEVELS).map((k,i)=>[k,i===0]));
const $=id=>document.getElementById(id);
const LABCOIN_ICON='<svg class="labcoin-coin-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="13.4" fill="#f5c85c" stroke="#9a681c" stroke-width="1.5"/><circle cx="16" cy="16" r="10.2" fill="none" stroke="#fff0a3" stroke-width="1.4"/><path d="M16 9.6l1.9 4.1 4.5.5-3.3 3 1 4.4-4.1-2.2-4.1 2.2 1-4.4-3.3-3 4.5-.5z" fill="#936015"/></svg>';

const MATERIAL_INFO={
 kno3:{name:"kaliumnitraat",formula:"KNO3",emoji:"🧂"},
 carbon:{name:"koolstof",formula:"C",emoji:"⚫"},
 sulfur:{name:"zwavel",formula:"S",emoji:"🟡"}
};
const EMPTY_MATERIALS=()=>({kno3:0,carbon:0,sulfur:0});
function normalizeMaterials(value){const source=value?.inventory||value||{};return {kno3:Math.max(0,Math.floor(Number(source.kno3??source.kno3_mol)||0)),carbon:Math.max(0,Math.floor(Number(source.carbon??source.carbon_mol)||0)),sulfur:Math.max(0,Math.floor(Number(source.sulfur??source.sulfur_mol)||0))};}
function readLocalMaterials(){try{return normalizeMaterials(JSON.parse(localStorage.getItem("chemie-escape-materials")||"{}"));}catch{return EMPTY_MATERIALS();}}
function saveLocalMaterials(){try{localStorage.setItem("chemie-escape-materials",JSON.stringify(inventory));}catch{}}
function applyMaterials(value){inventory=normalizeMaterials(value);saveLocalMaterials();renderInventory();}

// Houd de inventarisweergave synchroon met de grondstoffenvoorraad.
// Deze functie wordt aangeroepen bij het laden, na een Schaduw-drop en na de kluisreactie.
function renderInventory(){
 const target=$("inventory-items");
 if(!target)return;
 target.innerHTML=Object.entries(MATERIAL_INFO).map(([key,item])=>{
  const amount=Math.max(0,Math.floor(Number(inventory?.[key])||0));
  const stockClass=amount>0?"has-stock":"empty";
  return `<div class="material-item ${stockClass}" aria-label="${item.name}: ${amount} mol">
   <span class="material-icon">${item.emoji}</span>
   <strong>${item.name}</strong>
   <b>${amount} mol</b>
   <small>${item.formula}</small>
  </div>`;
 }).join("");
}


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

// Bonusspel level 2: zuren en zuurrestnamen. De gegevens volgen de tabel van de leerkracht.
const ACID_REFERENCE_ITEMS = [
 {formula:"HNO3",systematic:"waterstofnitraat",common:"salpeterzuur",residueFormula:"NO3-",residueName:"nitraat"},
 {formula:"H2SO4",systematic:"diwaterstofsulfaat",common:"zwavelzuur",residueFormula:"SO42-",residueName:"sulfaat"},
 {formula:"H2CO3",systematic:"diwaterstofcarbonaat",common:"koolzuur",residueFormula:"CO32-",residueName:"carbonaat"},
 {formula:"H3PO4",systematic:"triwaterstoffosfaat",common:"fosforzuur",residueFormula:"PO43-",residueName:"fosfaat"},
 {formula:"HClO3",systematic:"waterstofchloraat",common:"chloorzuur",residueFormula:"ClO3-",residueName:"chloraat"},
 {formula:"HBrO3",systematic:"waterstofbromaat",common:"broomzuur",residueFormula:"BrO3-",residueName:"bromaat"},
 {formula:"HIO3",systematic:"waterstofjodaat",common:"joodzuur",residueFormula:"IO3-",residueName:"jodaat"}
];
const ACID_FIELDS = [
 {key:"formula",label:"de brutoformule van het zuur",answerLabel:"de brutoformule van het zuur",type:"formula"},
 {key:"systematic",label:"de systematische naam van het zuur",answerLabel:"de systematische naam van het zuur",type:"name"},
 {key:"common",label:"de gebruiksnaam van het zuur",answerLabel:"de gebruiksnaam van het zuur",type:"name"},
 {key:"residueFormula",label:"de formule van de zuurrest",answerLabel:"de formule van de zuurrest",type:"formula"},
 {key:"residueName",label:"de naam van de zuurrest",answerLabel:"de naam van de zuurrest",type:"name"}
];
// Weergavenotatie voor de zuur- en zuurrestformules: indices als subscript,
// ionladingen als superscript. De ruwe ASCII-formules blijven ongewijzigd voor
// de server-side antwoordcontrole in Supabase.
const ACID_FORMULA_DISPLAY = new Map([
 ["HNO3","HNO₃"],["NO3-","NO₃⁻"],
 ["H2SO4","H₂SO₄"],["SO42-","SO₄²⁻"],
 ["H2CO3","H₂CO₃"],["CO32-","CO₃²⁻"],
 ["H3PO4","H₃PO₄"],["PO43-","PO₄³⁻"],
 ["HClO3","HClO₃"],["ClO3-","ClO₃⁻"],
 ["HBrO3","HBrO₃"],["BrO3-","BrO₃⁻"],
 ["HIO3","HIO₃"],["IO3-","IO₃⁻"]
]);
function displayAcidAnswer(value,type){
 const raw=String(value??"");
 return type==="formula"?(ACID_FORMULA_DISPLAY.get(raw)||raw):raw;
}
function displayAcidPrompt(value){
 let prompt=String(value??"");
 // Langste formules eerst; zo kan een kortere formule nooit een deel vervangen.
 for(const [raw,pretty] of [...ACID_FORMULA_DISPLAY.entries()].sort((a,b)=>b[0].length-a[0].length)){
  prompt=prompt.split(raw).join(pretty);
 }
 return escapeHtml(prompt);
}
function createAcidSprintQueue(){
 const items=[];
 for(const acid of ACID_REFERENCE_ITEMS){
  for(const source of ACID_FIELDS){
   for(const target of ACID_FIELDS){
    if(source.key===target.key)continue;
    items.push({
     prompt_text:`Gegeven ${source.label}: ${acid[source.key]}. Wat is ${target.answerLabel}?`,
     answer_type:target.type,
     expected_answer:acid[target.key]
    });
   }
  }
 }
 return shuffle(items);
}
function normaliseAcidAnswer(value,type){
 let answer=String(value??"").trim().replace(/\s+/g,"");
 if(type!=="formula")return answer.toLocaleLowerCase("nl-BE");
 const sub={"₀":"0","₁":"1","₂":"2","₃":"3","₄":"4","₅":"5","₆":"6","₇":"7","₈":"8","₉":"9","⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁺":"+","⁻":"-","−":"-"};
 return [...answer].map(ch=>sub[ch]??ch).join("");
}

// Bonusspel level 3: oxidatiegetallen. Formules zijn bewust met Unicode-subscripts opgeslagen.
const OXIDATION_ITEMS=[
 {formula:"MgSO₄",element:"Mg",answer:"+II"},
 {formula:"H₂SO₄",element:"S",answer:"+VI"},
 {formula:"O₂",element:"O",answer:"0"},
 {formula:"NaCl",element:"Cl",answer:"-I"},
 {formula:"H₂O",element:"O",answer:"-II"},
 {formula:"CO₂",element:"C",answer:"+IV"},
 {formula:"NH₃",element:"N",answer:"-III"},
 {formula:"CaO",element:"Ca",answer:"+II"},
 {formula:"KBr",element:"Br",answer:"-I"},
 {formula:"HCl",element:"Cl",answer:"-I"},
 {formula:"Fe₂O₃",element:"Fe",answer:"+III"},
 {formula:"CuO",element:"Cu",answer:"+II"},
 {formula:"SO₂",element:"S",answer:"+IV"},
 {formula:"SO₃",element:"S",answer:"+VI"},
 {formula:"HNO₃",element:"N",answer:"+V"},
 {formula:"HNO₂",element:"N",answer:"+III"},
 {formula:"Na₂CO₃",element:"C",answer:"+IV"},
 {formula:"CaCO₃",element:"C",answer:"+IV"},
 {formula:"KMnO₄",element:"Mn",answer:"+VII"},
 {formula:"K₂Cr₂O₇",element:"Cr",answer:"+VI"},
 {formula:"H₃PO₄",element:"P",answer:"+V"},
 {formula:"H₃PO₃",element:"P",answer:"+III"},
 {formula:"Na₂SO₃",element:"S",answer:"+IV"},
 {formula:"LiF",element:"Li",answer:"+I"},
 {formula:"H₂O₂",element:"O",answer:"-I"},
 {formula:"Na₂O₂",element:"O",answer:"-I"},
 {formula:"Cl₂",element:"Cl",answer:"0"},
 {formula:"FeCl₂",element:"Fe",answer:"+II"},
 {formula:"FeCl₃",element:"Fe",answer:"+III"},
 {formula:"Cu₂O",element:"Cu",answer:"+I"},
 {formula:"CuSO₄",element:"Cu",answer:"+II"},
 {formula:"Al₂O₃",element:"Al",answer:"+III"},
 {formula:"NaOH",element:"O",answer:"-II"},
 {formula:"Ca(OH)₂",element:"Ca",answer:"+II"},
 {formula:"NH₄Cl",element:"N",answer:"-III"},
 {formula:"NaNO₃",element:"N",answer:"+V"},
 {formula:"NaNO₂",element:"N",answer:"+III"},
 {formula:"KClO₃",element:"Cl",answer:"+V"},
 {formula:"KClO₄",element:"Cl",answer:"+VII"},
 {formula:"HClO",element:"Cl",answer:"+I"},
 {formula:"HClO₃",element:"Cl",answer:"+V"},
 {formula:"HClO₄",element:"Cl",answer:"+VII"},
 {formula:"MnO₂",element:"Mn",answer:"+IV"},
 {formula:"KMnO₄",element:"O",answer:"-II"},
 {formula:"CrO₃",element:"Cr",answer:"+VI"},
 {formula:"Na₂CrO₄",element:"Cr",answer:"+VI"},
 {formula:"K₃PO₄",element:"P",answer:"+V"},
 {formula:"Ca₃(PO₄)₂",element:"P",answer:"+V"},
 {formula:"H₂S",element:"S",answer:"-II"},
 {formula:"OF₂",element:"O",answer:"+II"}
];
function normaliseOxidationAnswer(value){return String(value??"").trim().replace(/\s+/g,"").replace(/−/g,"-").toUpperCase();}
function formatOxidationFormula(value){const subs={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"};return [...String(value??"")].map(ch=>subs[ch]??ch).join("");}

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
let acidSprintTimer=null, acidSprintTransitionTimer=null;
let acidSprintState={running:false,startingCoins:0,correct:0,answered:0,startedAt:0,queue:[],index:0,current:null,best:0,onlineSessionId:null};
let ogSprintTimer=null, ogSprintTransitionTimer=null;
let ogSprintState={running:false,startingCoins:0,correct:0,answered:0,startedAt:0,expiresAt:0,queue:[],index:0,current:null,best:0,onlineSessionId:null};
// Leerlingen krijgen geen hints: verberg de knop in alle soorten vensters.
const hintButton=$("hint-button");
if(hintButton){hintButton.style.setProperty("display","none","important");hintButton.setAttribute("aria-hidden","true");hintButton.disabled=true;}
async function init(){try{const r=await fetch("vragen.json");if(!r.ok)throw Error("JSON niet geladen");questions=await r.json();if(pendingOnlineQuestionBank)questions=pendingOnlineQuestionBank;resetState();log(LEVELS.medieval.intro);setStatus("Klik op een voorwerp om te beginnen.");scheduleShadow();}catch(e){setStatus("Vragen niet geladen. Start via start_windows.bat; zie LEESMIJ.txt.");console.error(e)}}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function rebuildQuestionSets(){Object.keys(LEVELS).forEach(level=>{levelQuestions[level]=[];["object1","object2","object3","object4"].forEach(obj=>levelQuestions[level].push(...shuffle(questions.filter(q=>q.level===level&&q.object===obj))));});}
function resetState(){progress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,0]));objectProgress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));puzzleSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:false,object2:false,object3:false,object4:false}]));puzzleCompletions=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));levelSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,false]));lockouts={};inventory=readLocalMaterials();shadowVisible=false;shadowEncounterId=null;localShadowMaterial=null;codes={};codeEntered=Object.fromEntries(LEVEL_ORDER.map(l=>[l,false]));unlocked=Object.fromEntries(LEVEL_ORDER.map((l,i)=>[l,i===0]));activeAttemptId=null;activeAttemptQuestions=[];activeAttemptCorrectIds=[];activeAttemptIndex=0;rebuildQuestionSets();renderInventory();renderLevel();updateProgress();renderEconomyPanel();applyEquippedSkin()}
function setStatus(s){$("status-text").textContent=s}
function log(s){const el=$("logbook");el.textContent=s+"\n"+el.textContent}
function renderLevel(){
 const l=LEVELS[currentLevel];$("lab-art").src=l.art;$("lab-art").alt=l.name;
 document.querySelectorAll(".level-tab").forEach(b=>{b.classList.toggle("active",b.dataset.level===currentLevel);b.disabled=false;b.title=unlocked[b.dataset.level]?"Open dit tijdperk":"Voltooi eerst de puzzels van het vorige tijdperk en voer de code in";});
 ["label1","label2","label3","label4"].forEach((id,i)=>{if($(id))$(id).textContent=l.labels[i]||"Puzzel";});
 document.querySelectorAll('.hotspot[data-object^="object"]').forEach(btn=>{
  const obj=btn.dataset.object,idx=Number(obj.replace("object",""))-1,digit=(puzzleSolved[currentLevel]?.[obj])?LEVELS[currentLevel].code[idx]:undefined,marker=btn.querySelector('span');
  if(marker){marker.textContent=digit!==undefined?String(digit):"✦";marker.setAttribute('aria-label',digit!==undefined?`Verdiend cijfer ${digit}`:"Puzzelplek nog niet voltooid");}
  btn.classList.toggle('puzzle-solved',Boolean(puzzleSolved[currentLevel]?.[obj]));
 });
 const solvedCount=Object.values(puzzleSolved[currentLevel]||{}).filter(Boolean).length;
 const inProgress=Object.values(objectProgress[currentLevel]||{}).reduce((a,b)=>a+Number(b||0),0);
 $("level-status").textContent=`${l.name}: ${solvedCount} van 4 puzzels voor het eerst voltooid · ${inProgress} vragen juist in de huidige poging`;
 $("scene-caption").textContent=levelSolved[currentLevel]?"Alle vier puzzels zijn minstens één keer opgelost. Je kunt ze opnieuw oefenen en LabCoins verdienen.":"Onderzoek de voorwerpen. Kies per puzzel je moeilijkheid. Let op: de Schaduw kan elk moment verschijnen.";
 renderInventory();renderEconomyPanel();
}
function updateProgress(){const n=Object.values(levelSolved).filter(Boolean).length;$("progress-text").textContent=`${n} van ${LEVEL_TOTAL} levels voltooid`;$("progress-fill").style.width=`${n/LEVEL_TOTAL*100}%`;}
function localAttemptStorageKey(level,obj){return `chemie-escape-attempt:${level}:${obj}`;}
function loadLocalAttempt(level,obj){
 try{return JSON.parse(localStorage.getItem(localAttemptStorageKey(level,obj))||'null');}catch{return null;}
}
function saveLocalAttempt(){
 if(activeAttemptId||!activeRunLevel||!activeRunObject||!activeAttemptQuestions.length)return;
 try{localStorage.setItem(localAttemptStorageKey(activeRunLevel,activeRunObject),JSON.stringify({
  difficulty:activeDifficulty,required:activeAttemptRequired,questions:activeAttemptQuestions,
  correctIds:activeAttemptCorrectIds
 }));}catch(error){console.warn('Lokale puzzelpoging kon niet worden opgeslagen.',error);}
}
function removeLocalAttempt(level,obj){try{localStorage.removeItem(localAttemptStorageKey(level,obj));}catch{}}
function installPuzzleAttempt(result,level,obj){
 activeRunToken++;
 activeRunLevel=level;activeRunObject=obj;activeObject=obj;
 activeAttemptId=result.attempt_id||null;
 activeDifficulty=result.difficulty||activeDifficulty;
 activeAttemptRequired=Number(result.required_count||result.required)||QUESTIONS_PER_PUZZLE;
 activeAttemptQuestions=(result.questions||[]).map(q=>({
  id:String(q.question_id??q.id),type:q.question_type||q.type||'multiple_choice',
  question:q.question_text||q.question,options:Array.isArray(q.options)?q.options:[],answer:q.answer
 }));
 activeAttemptCorrectIds=[...(result.correct_question_ids||result.correctIds||[])].map(String);
 objectProgress[level]=objectProgress[level]||{};
 objectProgress[level][obj]=Number(result.correct_count??activeAttemptCorrectIds.length)||0;
 if(!activeAttemptId)saveLocalAttempt();
}
function currentRunMatches(level,obj){
 return Boolean(activeRunLevel===level&&activeRunObject===obj&&activeAttemptQuestions.length&&activeAttemptCorrectIds.length<activeAttemptRequired);
}
function nextUnansweredQuestion(){
 const answered=new Set(activeAttemptCorrectIds.map(String));
 return activeAttemptQuestions.find(item=>!answered.has(String(item.id)));
}
function showQuestion(q){
 activeQuestion=q;activeKind="question";
 const number=activeAttemptCorrectIds.length+1;
 $("modal-category").textContent=`${LEVELS[currentLevel].name.toUpperCase()} · ${DIFFICULTIES[activeDifficulty]} · VRAAG ${number}/${activeAttemptRequired}`;
 $("modal-title").textContent=q.type==="numeric"?"Rekenvraag":q.type==="short_answer"?"Kort antwoord":"Meerkeuzevraag";$("question-text").textContent=q.question;
 const area=$("answer-area");area.innerHTML="";
 if(q.type==="numeric"){
  area.innerHTML='<input class="numeric-input" id="numeric-answer" type="number" step="1" placeholder="Vul een geheel getal in" required>';
 }else if(q.type==="short_answer"){
  area.innerHTML='<input class="numeric-input short-answer-input" id="short-answer" type="text" maxlength="200" placeholder="Typ je antwoord…" autocomplete="off" autocapitalize="sentences" required>';
 }else{
  (q.options||[]).forEach((op,i)=>{const label=document.createElement("label");label.className="option-label";label.innerHTML=`<input type="radio" name="choice" value="${i}"><span></span>`;label.querySelector("span").textContent=op;area.append(label);});
 }
 $("check-button").classList.remove("hidden");$("check-button").textContent="Controleer antwoord";$("check-button").disabled=false;$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden");
}
function showDifficultyChoice(obj){
 activeObject=obj;activeKind="difficulty-choice";
 const name=LEVELS[currentLevel].labels[Number(obj.replace("object",""))-1]||"deze puzzel";
 $("modal-category").textContent=`${LEVELS[currentLevel].name.toUpperCase()} · ${name.toUpperCase()}`;
 $("modal-title").textContent="Kies je uitdaging";$("question-text").textContent=puzzleSolved[currentLevel]?.[obj]?"Deze puzzel is al vrijgespeeld. Kies één moeilijkheid om een nieuwe oefenreeks te starten.":"Kies één keer de moeilijkheidsgraad. Daarna volgen je vragen automatisch.";
 $("answer-area").innerHTML=Object.entries(DIFFICULTIES).map(([key,label])=>`<button type="button" class="difficulty-choice difficulty-${key}" data-puzzle-difficulty="${key}"><strong>${label}</strong><small>${key==="basis"?"Basiskennis en eenvoudige toepassingen":key==="gemiddeld"?"Toepassen en verbanden leggen":"Complexere toepassingen en redeneringen"}</small></button>`).join("");
 $("check-button").classList.add("hidden");$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden");
}
async function startPuzzleRun(difficulty){
 if(!Object.hasOwn(DIFFICULTIES,difficulty)||!/^object[1-4]$/.test(activeObject||''))return;
 const runLevel=currentLevel,runObject=activeObject;
 activeDifficulty=difficulty;setStatus(`Vragen voor ${DIFFICULTIES[difficulty]} worden geselecteerd…`);
 try{
  let attemptResult=null;
  if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
   attemptResult=await window.ChemieOnline.startPuzzleAttempt(runLevel,runObject,difficulty);
   if(!attemptResult?.ok)throw new Error(attemptResult?.error||"De puzzel kon niet worden gestart.");
   installPuzzleAttempt(attemptResult,runLevel,runObject);
  }else{
   const pool=questions.filter(q=>q.level===runLevel&&q.object===runObject&&(q.difficulty||"basis")===difficulty);
   if(pool.length<QUESTIONS_PER_PUZZLE)throw new Error(`Voor deze puzzel zijn er maar ${pool.length} ${DIFFICULTIES[difficulty].toLowerCase()} vragen beschikbaar. In de lokale versie zijn standaardvragen voorlopig als Basis gelabeld.`);
   const localQuestions=shuffle(pool).slice(0,QUESTIONS_PER_PUZZLE).map(q=>({...q,id:String(q.id||q.question_id)}));
   installPuzzleAttempt({difficulty,required:QUESTIONS_PER_PUZZLE,questions:localQuestions,correctIds:[]},runLevel,runObject);
  }
  currentLevel=runLevel;activeObject=runObject;
  const next=nextUnansweredQuestion();
  if(!next)throw new Error("Deze poging heeft geen open vragen meer. Start een nieuwe oefenreeks.");
  showQuestion(next);setStatus(`Je oefent ${LEVELS[runLevel].labels[Number(runObject.replace("object",""))-1]} op niveau ${DIFFICULTIES[activeDifficulty]}. Je hoeft het niveau niet opnieuw te kiezen.`);
  if(window.ChemieOnline?.isAuthenticated()&&attemptResult?.resumed)log("Je onafgewerkte puzzelpoging is hervat met dezelfde moeilijkheidsgraad.");
 }catch(error){console.error(error);closeModal();setStatus(error.message||"De vragen konden niet worden geladen.");}
}
async function resumePuzzleRun(level,obj){
 if(currentRunMatches(level,obj)){activeObject=obj;const next=nextUnansweredQuestion();if(next){showQuestion(next);setStatus(`Je gaat verder op niveau ${DIFFICULTIES[activeDifficulty]}.`);return true;}}
 if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{
   const result=await window.ChemieOnline.getActivePuzzleAttempt(level,obj);
   if(result?.has_attempt){installPuzzleAttempt(result,level,obj);activeObject=obj;const next=nextUnansweredQuestion();if(next){currentLevel=level;showQuestion(next);setStatus(`Je onafgewerkte reeks wordt hervat. Niveau: ${DIFFICULTIES[activeDifficulty]}.`);return true;}}
  }catch(error){
   console.error('Hervatten van puzzelpoging is mislukt:',error);
   setStatus(error.message||'De bewaarde puzzelpoging kon niet worden opgehaald.');
   return false;
  }
 }else{
  const saved=loadLocalAttempt(level,obj);
  if(saved?.questions?.length){installPuzzleAttempt(saved,level,obj);activeObject=obj;const next=nextUnansweredQuestion();if(next){currentLevel=level;showQuestion(next);setStatus(`Je gaat verder op niveau ${DIFFICULTIES[activeDifficulty]}.`);return true;}}
 }
 return false;
}
async function openObject(obj){
 if(obj==="antagonist"){if(!shadowVisible)return;collectShadowDrop();return;}
 if(teacherMode){setStatus("Leerkrachtweergave: je kunt de vier labo’s vrij bekijken. Puzzels hoef je met dit account niet op te lossen.");return;}
 if(!/^object[1-4]$/.test(obj))return;
 if(Date.now()<(lockouts[currentLevel]?.[obj]||0)){setStatus(`Deze puzzel heeft nog ${Math.ceil((lockouts[currentLevel][obj]-Date.now())/1000)} seconden straftijd.`);showLockout(obj);return;}
 activeObject=obj;
 if(await resumePuzzleRun(currentLevel,obj))return;
 showDifficultyChoice(obj);
}
function showLockout(obj){activeKind="lockout";activeObject=obj;$("modal-category").textContent="STRAFTIJD";$("modal-title").textContent="Deze puzzel is geblokkeerd";$("question-text").textContent="Een fout antwoord geeft één minuut straftijd op deze specifieke puzzel. De andere drie plekken blijven beschikbaar."; $("answer-area").innerHTML='<div class="lockout-countdown" id="countdown"></div>';$("hint-button").classList.add("hidden");$("check-button").classList.add("hidden");$("modal-backdrop").classList.remove("hidden");const update=()=>{let left=Math.max(0,Math.ceil(((lockouts[currentLevel]||{})[obj]-Date.now())/1000));if($("countdown"))$("countdown").textContent=`Resterende tijd: ${String(Math.floor(left/60)).padStart(2,"0")}:${String(left%60).padStart(2,"0")}`;if(!left){clearInterval(window.lockInterval);if($("countdown"))$("countdown").textContent="Puzzel weer vrij";}};update();window.lockInterval=setInterval(update,250)}
async function submitAnswer(e){
 e.preventDefault();
 if(activeKind==="code-entry"){
  const entered=$("code-answer")?.value.trim();if(!/^\d{4}$/.test(entered||"")){feedback("Voer precies vier cijfers in.","bad");return;}
  const target=activeCodeTarget;
  if(target==="exit"){
   if(entered===LEVELS.future.code.join("")){finishGame();closeModal();log("De uitgangscode is correct. De kluis is geopend en je bent ontsnapt!");}
   else feedback("Verkeerde code. Controleer de vier cijfers die je hebt verdiend.","bad");
   return;
  }
  const previous=LEVEL_ORDER[LEVEL_ORDER.indexOf(target)-1];
  if(entered===LEVELS[previous].code.join("")){
   try{if(window.ChemieOnline?.isAuthenticated())await window.ChemieOnline.unlockLevel(target,entered);}
   catch(error){feedback(error.message||"De tijdpoort kon online niet worden vrijgegeven.","bad");return;}
   unlocked[target]=true;currentLevel=target;closeModal();renderLevel();setStatus("Code correct! De tijdpoort is open.");log("Tijdpoort geopend: "+LEVELS[target].name);scheduleShadow();
  }else feedback("Verkeerde code. Controleer de vier verdiende cijfers.","bad");
  return;
 }
 if(activeKind==="code"){
  const entered=$("numeric-answer")?.value.trim();const expected=LEVELS[currentLevel].code.join("");
  if(entered!==expected){feedback("Die code klopt niet. Controleer de vier cijfers en probeer opnieuw.","bad");return;}
  codeEntered[currentLevel]=true;log("Tijdpoortcode correct ingevoerd voor: "+LEVELS[currentLevel].name);feedback("Code correct! De tijdpoort opent.","good");unlockNextIfReady();renderLevel();setTimeout(()=>closeModal(),900);return;
 }
 if(activeKind!=="question"||!activeQuestion)return;
 const q=activeQuestion;let submittedAnswer=null;
 if(q.type==="numeric"){
  const value=$("numeric-answer")?.value.trim();if(value===""||value===undefined){feedback("Vul eerst een antwoord in.","bad");return;}submittedAnswer=Number(value);
 }else if(q.type==="short_answer"){
  const value=$("short-answer")?.value??"";if(!value.trim()){feedback("Vul eerst een antwoord in.","bad");$("short-answer")?.focus();return;}submittedAnswer=value.trim();
 }else{
  const selected=document.querySelector('input[name="choice"]:checked');if(!selected){feedback("Kies eerst een antwoord.","bad");return;}submittedAnswer=Number(selected.value);
 }
 const button=$("check-button");if(button)button.disabled=true;
 let verified={correct:false};
 const online=Boolean(activeAttemptId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated());
 try{
  if(online){
   if(!activeAttemptId)throw new Error("Deze online puzzelpoging is niet gekoppeld. Open de puzzel opnieuw om je reeks te hervatten.");
   verified=await window.ChemieOnline.submitPuzzleAnswer(activeAttemptId,String(q.id),submittedAnswer,q.type);
   if(!verified||!verified.ok)throw new Error(verified?.error||"De online controle lukte niet.");
  }else{
   const localCorrect=q.type==="numeric"
    ? submittedAnswer===Number(q.answer)
    : q.type==="short_answer"
     ? String(submittedAnswer??"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("nl-BE")===String(q.answer??"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("nl-BE")
     : submittedAnswer===Number(q.answer);
   const nextCount=(activeAttemptCorrectIds.length||0)+(localCorrect?1:0);
   verified={ok:true,correct:localCorrect,completed:localCorrect&&nextCount>=activeAttemptRequired,correct_count:nextCount,required_count:activeAttemptRequired,xp_awarded:0,coins_awarded:0};
  }
 }catch(err){console.error(err);if(button)button.disabled=false;feedback(err.message||"Geen verbinding met de controle. Probeer opnieuw.","bad");return;}
 if(!verified.correct){
  lockouts[currentLevel]=lockouts[currentLevel]||{};lockouts[currentLevel][activeObject]=Date.now()+PENALTY*1000;
  feedback("Fout antwoord! Deze puzzelplek is één minuut geblokkeerd. Daarna ga je verder met dezelfde moeilijkheid en dezelfde vragenreeks.","bad");
  setStatus("Straftijd actief op "+LEVELS[currentLevel].labels[Number(activeObject.replace("object",""))-1]);
  $("answer-area").querySelectorAll("input").forEach(i=>i.disabled=true);if(button){button.disabled=false;button.textContent="Verder";button.onclick=e=>{e.preventDefault();closeModal();button.onclick=null;};}return;
 }
 const oldSolved=Boolean(puzzleSolved[currentLevel]?.[activeObject]);
 const qid=String(q.id);
 if(!activeAttemptCorrectIds.map(String).includes(qid))activeAttemptCorrectIds.push(qid);
 objectProgress[currentLevel][activeObject]=Number(verified.correct_count)||activeAttemptCorrectIds.length;
 progress[currentLevel]=Object.values(objectProgress[currentLevel]||{}).reduce((a,b)=>a+Number(b||0),0);
 if(!activeAttemptId)saveLocalAttempt();
 const puzzleIndex=Number(activeObject.replace("object",""))-1;
 if(verified.completed||activeAttemptCorrectIds.length>=activeAttemptRequired){
  puzzleSolved[currentLevel][activeObject]=true;
  puzzleCompletions[currentLevel][activeObject]=(puzzleCompletions[currentLevel][activeObject]||0)+1;
  codes[currentLevel]=codes[currentLevel]||[];codes[currentLevel][puzzleIndex]=LEVELS[currentLevel].code[puzzleIndex];
  const rewarded=Number(verified.coins_awarded)||0;
  if(rewarded&&verified.economy&&window.ChemieGameBridge)window.ChemieGameBridge.applyOnlineEconomy(verified.economy);
  else if(rewarded&&Number.isFinite(Number(verified.coins)))labCoins=Number(verified.coins);
  levelSolved[currentLevel]=Object.values(puzzleSolved[currentLevel]).every(Boolean);
  if(!online&&oldSolved){labCoins+=10;renderEconomyPanel();}
  const rewardText=rewarded||(!online&&oldSolved)?` Je ontvangt ${rewarded||10} LabCoins.`:"";
  if(!oldSolved)log(`Puzzel ${puzzleIndex+1} voor het eerst voltooid in ${LEVELS[currentLevel].name}. Verdiend cijfer: ${codes[currentLevel][puzzleIndex]}.`);
  else log(`Puzzel ${puzzleIndex+1} opnieuw voltooid op niveau ${DIFFICULTIES[activeDifficulty]}.${rewardText}`);
  if(levelSolved[currentLevel]){log("Alle vier puzzels zijn minstens één keer voltooid in: "+LEVELS[currentLevel].name);setStatus("Alle vier cijfers zijn verdiend. Je kunt het volgende labo openen door de code in te voeren.");}
  else setStatus(`Puzzel ${puzzleIndex+1} voltooid.${rewardText}`);
  feedback(`Puzzel voltooid! ${oldSolved?"Je hebt deze puzzel opnieuw geoefend.":`Je hebt cijfer ${codes[currentLevel][puzzleIndex]} verdiend.`}${rewardText}`,"good");
  if(online)window.ChemieOnline.refreshDashboardSoon();
  renderLevel();updateProgress();$("answer-area").querySelectorAll("input").forEach(i=>i.disabled=true);$("check-button").classList.add("hidden");
  const completedLevel=activeRunLevel,completedObject=activeRunObject;removeLocalAttempt(completedLevel,completedObject);
  activeRunToken++;activeRunLevel=null;activeRunObject=null;activeAttemptId=null;activeAttemptQuestions=[];activeAttemptCorrectIds=[];
  setTimeout(()=>closeModal(),1600);return;
 }
 const token=activeRunToken;
 const answeredAttemptId=activeAttemptId;
 const answeredObject=activeObject,answeredLevel=currentLevel;
 const nextQ=nextUnansweredQuestion();
 saveLocalAttempt();
 feedback(`Juist! Vraag ${activeAttemptCorrectIds.length} van ${activeAttemptRequired} opgelost.`,"good");
 setStatus("Goed antwoord. De volgende vraag wordt automatisch geopend…");
 if(verified.economy&&window.ChemieGameBridge)window.ChemieGameBridge.applyOnlineEconomy(verified.economy);
 // Een fout in een nevenweergave (zoals de inventaris) mag de vragenreeks
 // nooit onderbreken. De volgende vraag wordt daarom onafhankelijk ingepland.
 try{renderLevel();updateProgress();}catch(renderError){console.error("Weergave bijwerken is mislukt; de vragenreeks loopt door.",renderError);}
 $("check-button").classList.add("hidden");
 if(nextQ)setTimeout(()=>{
  const sameRun=token===activeRunToken&&currentLevel===answeredLevel&&activeRunLevel===answeredLevel&&activeObject===answeredObject&&activeRunObject===answeredObject&&String(activeAttemptId||"")===String(answeredAttemptId||"");
  if(sameRun){
   showQuestion(nextQ);
   setStatus(`Goed! Vraag ${activeAttemptCorrectIds.length+1} van ${activeAttemptRequired} wordt geopend.`);
   const input=$("numeric-answer")||$("short-answer")||document.querySelector('input[name="choice"]');
   input?.focus?.();
  }
 },550);
 else setTimeout(()=>{if(token===activeRunToken)setStatus("Je reeks is opgeslagen. Open dezelfde puzzel om verder te gaan.");},550);
}
function unlockNextIfReady(){if(!codeEntered[currentLevel])return;const i=LEVEL_ORDER.indexOf(currentLevel);if(i>=0&&i<LEVEL_ORDER.length-1){const next=LEVEL_ORDER[i+1];unlocked[next]=true;setStatus("Tijdpoort geopend! Het volgende labo is nu toegankelijk.");log("Tijdpoort ontgrendeld: "+LEVELS[next].name);renderLevel();}else if(currentLevel==="future"){setStatus("Laatste tijdpoort geopend.")}}
function showCodeEntry(){activeKind="code";$("modal-category").textContent="TIJDPOORTCODE";$("modal-title").textContent="Open de tijdpoort";$("question-text").textContent="Voer de viercijferige code in die je met de vier puzzels hebt verdiend.";$("answer-area").innerHTML='<input class="numeric-input" id="numeric-answer" type="text" inputmode="numeric" maxlength="4" placeholder="Viercijferige code" required>';$("hint-button").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").textContent="Ontgrendel tijdpoort";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden")}
function feedback(t,k){$("feedback").textContent=t;$("feedback").className="feedback "+k}
function closeModal(){$("modal-backdrop").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").onclick=null}
function showSafeFeedback(html,kind='info'){
 const box=$("safe-feedback");if(!box)return;box.innerHTML=html;box.className=`safe-feedback ${kind}`;
}
function hideSafeFeedback(){const box=$("safe-feedback");if(box){box.className="safe-feedback hidden";box.textContent="";}}
function updateShadowStatus(text){const node=$("antagonist-status");if(node)node.textContent=text;}
function moveShadowToRandomSpot(){const node=$("antagonist");if(!node)return;const left=12+Math.random()*72;const top=10+Math.random()*57;node.style.left=`${left}%`;node.style.top=`${top}%`;}
function hideShadow(scheduleNext=true){if(shadowTimer){clearTimeout(shadowTimer);shadowTimer=null;}shadowVisible=false;shadowEncounterId=null;localShadowMaterial=null;const node=$("antagonist");if(node)node.classList.add("hidden");const fill=$("shadow-meter-fill");if(fill)fill.style.width="0%";updateShadowStatus("De Schaduw is weer verdwenen…");if(scheduleNext)scheduleShadow();}
async function spawnShadow(){
 let encounter=null,visibleMs=10000;
 const online=Boolean(window.ChemieOnline&&window.ChemieOnline.isAuthenticated());
 if(online){
  // Online spelers krijgen uitsluitend een servergeregistreerde drop. Zo kan de inventaris niet lokaal worden vervalst.
  encounter=await window.ChemieOnline.startShadowEncounter(currentLevel);
  if(!encounter||!encounter.ok||!encounter.encounter_id)throw new Error(encounter?.error||"De server kon de Schaduw niet starten.");
  shadowEncounterId=encounter.encounter_id;localShadowMaterial=null;
  visibleMs=Math.min(10000,Math.max(1000,Number(encounter.visible_seconds||10)*1000));
 }else{
  shadowEncounterId=null;localShadowMaterial=shuffle(['kno3','carbon','sulfur'])[0];
 }
 shadowVisible=true;const node=$("antagonist");if(!node)throw new Error("De Schaduwknop ontbreekt op de pagina.");
 moveShadowToRandomSpot();node.classList.remove("hidden");node.disabled=false;
 updateShadowStatus("Hij is verschenen! Klik snel op De Schaduw om 1 mol grondstof te verzamelen.");
 const fill=$("shadow-meter-fill");if(fill){fill.style.transition='none';fill.style.width='100%';requestAnimationFrame(()=>{fill.style.transition=`width ${visibleMs}ms linear`;fill.style.width='0%';});}
 setStatus("Pas op! De Schaduw is verschenen. Klik snel op hem!");log("De Schaduw verschijnt onverwacht in "+LEVELS[currentLevel].name+".");
 shadowTimer=setTimeout(()=>{hideShadow(true);setStatus("De Schaduw is alweer verdwenen. Misschien verschijnt hij straks opnieuw.");},visibleMs);
}
function scheduleShadow(delay=null){
 if(shadowVisible||appearanceTimer||document.getElementById('win-screen')?.classList.contains('game-finished'))return;
 const wait=delay??(10000+Math.random()*15000);
 appearanceTimer=setTimeout(async()=>{
  appearanceTimer=null;
  try{await spawnShadow();}
  catch(error){
   console.warn('Schaduw-ontmoeting kon niet worden gestart:',error);
   updateShadowStatus(window.ChemieOnline?.isAuthenticated()?"De Schaduw kan de online inventaris niet bereiken. Controleer de Supabase-update; hij probeert het opnieuw.":"De Schaduw is nog niet verschenen. Hij probeert het opnieuw.");
   scheduleShadow(6500+Math.random()*5500);
  }
 },Math.max(500,wait));
}
function onOnlineLogin(){
 // Een timer die vóór het aanmelden begon, wordt vervangen door een server-gekoppelde verschijning.
 if(appearanceTimer){clearTimeout(appearanceTimer);appearanceTimer=null;}
 if(shadowVisible&&!shadowEncounterId)hideShadow(false);
 scheduleShadow(3500+Math.random()*4500);
}
function onOnlineLogout(){
 if(appearanceTimer){clearTimeout(appearanceTimer);appearanceTimer=null;}
 if(shadowVisible)hideShadow(false);
 scheduleShadow(4500+Math.random()*5000);
}
async function collectShadowDrop(){
 if(!shadowVisible)return;
 const node=$("antagonist");if(node)node.disabled=true;
 try{
   let material=null;
   if(shadowEncounterId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
     const result=await window.ChemieOnline.collectShadowDrop(shadowEncounterId);
     if(!result||!result.ok)throw new Error(result?.error||'De Schaduw is net te laat verdwenen.');
     material=result.material;applyMaterials(result.inventory||result.materials||{});
   }else{
     material=localShadowMaterial||shuffle(['kno3','carbon','sulfur'])[0];
     inventory[material]=(inventory[material]||0)+1;saveLocalMaterials();renderInventory();
   }
   const label=MATERIAL_INFO[material]?.name||'grondstof';
   hideShadow(false);updateShadowStatus(`Gevangen! De Schaduw liet 1 mol ${label} vallen.`);
   setStatus(`Goed getimed! Je verzamelde 1 mol ${label}.`);log(`De Schaduw liet 1 mol ${label} vallen.`);scheduleShadow();
 }catch(error){
   hideShadow(false);updateShadowStatus('De Schaduw is ontsnapt. Probeer het bij zijn volgende verschijning.');
   setStatus(error.message||'De grondstof kon niet worden verzameld.');scheduleShadow();
 }finally{if(node)node.disabled=false;}
}
const REACTION_EQUATION='2 KNO₃ + 3 C + S → K₂S + 3 CO₂ + N₂';
function showInsufficientMaterials(){
 showSafeFeedback(`<strong>Onvoldoende grondstoffen.</strong><div class="reaction-equation">${REACTION_EQUATION}</div><p>Weet je zeker dat je de juiste ingrediënten hebt?</p>`, 'needs-items');
 setStatus('Je hebt nog niet voldoende grondstoffen om de virtuele reactie uit te voeren.');
}
async function blowSafe(){
 const button=$("blow-safe-button");if(button)button.disabled=true;hideSafeFeedback();
 try{
   if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
     const result=await window.ChemieOnline.blowSafe();
     if(result?.insufficient){if(result.inventory)applyMaterials(result.inventory);showInsufficientMaterials();return;}
     if(!result||!result.ok)throw new Error(result?.error||'De kluis kon niet worden geopend.');
     if(result.inventory)applyMaterials(result.inventory);
     if(result.economy&&window.ChemieGameBridge)window.ChemieGameBridge.applyOnlineEconomy(result.economy);
     else if(Number.isFinite(Number(result.coins)))labCoins=Number(result.coins);
     renderEconomyPanel();
     showSafeFeedback(`<strong>De virtuele reactie is uitgevoerd!</strong><p>De kluis is open. Je ontvangt <b>30 LabCoins</b>.</p><small>De inventaris is bijgewerkt.</small>`,'success');
     log('De kluis werd geopend met de virtuele reactie. +30 LabCoins.');setStatus('De kluis is open! Je hebt 30 LabCoins verdiend.');
     window.ChemieOnline.refreshDashboardSoon();
   }else{
     if(inventory.kno3<2||inventory.carbon<3||inventory.sulfur<1){showInsufficientMaterials();return;}
     inventory.kno3-=2;inventory.carbon-=3;inventory.sulfur-=1;saveLocalMaterials();renderInventory();labCoins+=30;renderEconomyPanel();
     showSafeFeedback(`<strong>De virtuele reactie is uitgevoerd!</strong><p>De kluis is open. Je ontvangt <b>30 LabCoins</b>.</p><small>De inventaris is bijgewerkt.</small>`,'success');
     log('De kluis werd geopend met de virtuele reactie. +30 LabCoins.');setStatus('De kluis is open! Je hebt 30 LabCoins verdiend.');
   }
 }catch(error){console.error(error);showSafeFeedback(`<strong>De reactie kon niet worden uitgevoerd.</strong><p>${String(error.message||'Controleer je verbinding en probeer opnieuw.').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>`,'error');setStatus(error.message||'De kluis kon niet worden geopend.');}
 finally{if(button)button.disabled=false;}
}
function finishGame(){
 if(appearanceTimer)clearTimeout(appearanceTimer);
 if(shadowTimer)clearTimeout(shadowTimer);
 shadowVisible=false;
 const screen=$("win-screen");
 screen.classList.remove("hidden");
 screen.classList.add("game-finished");
 // Pas de automatische herstart: het eindscherm blijft staan tot de speler zelf de pagina verlaat.
 const heading=screen.querySelector("h1,h2,h3");
 if(heading)heading.textContent="Gewonnen! De kluis is geopend!";
 const text=screen.querySelector("p");
 if(text)text.textContent="Je hebt de vier laboratoria onderzocht, de codes verzameld en de kluis geopend. Het avontuur is afgelopen.";
 const replay=$("play-again");
 if(replay){replay.classList.add("hidden");replay.disabled=true;}
 setStatus("Escape room voltooid. De kluis is geopend!");
}
let activeCodeTarget=null;
function askCode(target,isFinal=false){activeKind="code-entry";activeCodeTarget=target;$("modal-category").textContent="CODE-INVOER";$("modal-title").textContent=isFinal?"Laatste tijdslot":"Tijdpoort vergrendeld";$("question-text").textContent=isFinal?"Voer de vier cijfers in die je in het futuristische labo hebt verdiend om de uitgang te openen.":`Voer de vier cijfers in die je in het vorige labo hebt verdiend om ${LEVELS[target].name} te betreden.`;$("answer-area").innerHTML='<input class="numeric-input" id="code-answer" type="text" inputmode="numeric" maxlength="4" placeholder="Voer de 4-cijferige code in" autocomplete="off">';$("hint-button").classList.add("hidden");$("check-button").classList.remove("hidden");$("check-button").textContent="Code controleren";$("feedback").className="feedback hidden";$("modal-backdrop").classList.remove("hidden");}
document.querySelectorAll(".level-tab").forEach(b=>b.addEventListener("click",()=>{
 const target=b.dataset.level;
 if(target===currentLevel){setStatus("Je bevindt je al in dit labo.");return;}
 if(teacherMode){unlocked=Object.fromEntries(LEVEL_ORDER.map(level=>[level,true]));currentLevel=target;renderLevel();setStatus(`Leerkrachtweergave: ${LEVELS[target].name} is geopend.`);log(`Leerkracht opent ${LEVELS[target].name}.`);scheduleShadow();return;}
 if(target==="medieval") { currentLevel="medieval"; renderLevel(); setStatus("Je keert terug naar het middeleeuwse labo."); return; }
 const previous=LEVEL_ORDER[LEVEL_ORDER.indexOf(target)-1];
 if(!levelSolved[previous]){setStatus("Deze tijdpoort blijft gesloten. Los eerst alle vier puzzels in het vorige labo minstens één keer op.");return;}
 if(unlocked[target]) { currentLevel=target; renderLevel(); setStatus("Je betreedt: "+LEVELS[currentLevel].name+"."); log(LEVELS[currentLevel].intro); scheduleShadow(); return; }
 askCode(target);
}));
document.querySelectorAll(".hotspot").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.object==="door"){if(teacherMode){setStatus("Leerkrachtweergave: gebruik de levelknoppen bovenaan om tussen de labo’s te wisselen.");return;}if(levelSolved.future)askCode("exit",true);else setStatus("De uitgang blijft gesloten. Los eerst alle vier puzzels in het futuristische labo minstens één keer op.");return;}openObject(b.dataset.object)}));
$("answer-form").addEventListener("submit",submitAnswer);$("close-modal").addEventListener("click",closeModal);$("answer-area").addEventListener("click",e=>{const choice=e.target.closest("[data-puzzle-difficulty]");if(choice){e.preventDefault();startPuzzleRun(choice.dataset.puzzleDifficulty);}});
$("blow-safe-button")?.addEventListener("click",blowSafe);
if($("play-again")){$("play-again").classList.add("hidden");$("play-again").disabled=true;}


// LabCoins, de optionele Elementensprint en de winkel worden door game.js opgebouwd.
// Daardoor hoeft alleen dit bestand vervangen te worden.
function initEconomyUI(){
 const side=document.querySelector(".side-panel");
 if(!side||$("labcoins-panel"))return;
 const panel=document.createElement("section");
 panel.id="labcoins-panel";panel.className="labcoins-panel";
 panel.innerHTML=`
  <div class="labcoins-heading"><div><p class="economy-eyebrow">BONUS</p><h3>${LABCOIN_ICON} LabCoins</h3></div><div class="coin-count"><span id="labcoin-balance">0</span><small>coins</small></div></div>
  <p class="labcoins-copy">Ben jij snel genoeg om LabCoins te scoren in één van de extra levels?</p>
  <div class="skin-preview"><span class="skin-preview-icon" id="equipped-skin-icon">🧪</span><span><small>Huidige skin</small><strong id="equipped-skin-name">Beginnende alchemist</strong></span></div>
  <button type="button" class="primary full economy-action" id="element-sprint-open">⚡ Elementensprint · 60 sec</button>
  <button type="button" class="primary full economy-action" id="acid-sprint-open">🧪 Zurenkennis · 60 sec</button>
  <button type="button" class="primary full economy-action" id="og-sprint-open">⚗️ The OG of chemistry · 60 sec</button>
  <button type="button" class="secondary full economy-action" id="skin-shop-open">🛍️ Open de skinwinkel</button>`;
 const inventory=side.querySelector(".inventory");
 const safeBox=side.querySelector(".safe-box");
 // Houd de kluis boven het Bonusspel; alleen de visuele volgorde verandert.
 if(safeBox)safeBox.insertAdjacentElement("afterend",panel);
 else if(inventory)inventory.insertAdjacentElement("afterend",panel);
 else side.append(panel);
 const overlay=document.createElement("div");
 overlay.id="economy-overlay";overlay.className="economy-overlay hidden";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","economy-title");
 overlay.innerHTML=`<section class="economy-dialog"><button type="button" class="close-button" id="economy-close" aria-label="Sluiten">×</button><div id="economy-content"></div></section>`;
 document.body.append(overlay);
 const style=document.createElement("style");
 style.id="economy-inline-styles";
 style.textContent=`
 .labcoins-panel{grid-column:1/-1;margin-top:13px;padding:14px;background:linear-gradient(145deg,#132f45,#234a60);border:1px solid #476b7b;border-radius:13px;color:#fff;box-shadow:0 8px 22px #172c4018}
 .labcoins-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.labcoins-heading h3{font-size:1rem;margin:0}.economy-eyebrow{font-size:.62rem;letter-spacing:.13em;color:#85d8dc;font-weight:900;margin:0 0 3px}.coin-count{min-width:60px;text-align:center;padding:5px 9px;border-radius:10px;background:#f5c86d;color:#44300a;font-weight:900;font-size:1.25rem;line-height:1.05}.coin-count small{display:block;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}.labcoins-copy{font-size:.75rem;line-height:1.45;color:#d6e7ee;margin:9px 0}.skin-preview{display:flex;align-items:center;gap:10px;border:1px solid #557382;background:#ffffff0d;border-radius:10px;padding:8px 10px;margin:10px 0}.skin-preview-icon{display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;font-size:1.75rem;background:#ffffff12;border-radius:10px}.skin-preview small,.skin-preview strong{display:block}.skin-preview small{font-size:.65rem;color:#b8d1dc;margin-bottom:3px}.skin-preview strong{font-size:.78rem}.economy-action{margin-top:7px!important}.labcoins-panel .primary{background:#f5c86d;color:#42300c;box-shadow:0 3px 0 #b78d3d}.labcoins-panel .secondary{background:#e1eef3;color:#18394f}.economy-overlay{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:15px;background:#0c2236e8;overflow:auto}.economy-dialog{position:relative;width:min(680px,100%);max-height:92vh;overflow:auto;background:#fffdf8;border:1px solid #e3d8c6;border-radius:19px;padding:25px;box-shadow:0 24px 90px #0006;color:#203b4c}.economy-dialog .close-button{position:absolute;z-index:2;right:10px;top:7px}.economy-title{font-size:1.45rem;margin:2px 38px 7px 0}.economy-lead{font-size:.88rem;line-height:1.55;color:#526a76;margin:0 0 16px}.sprint-hud{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:14px 0}.sprint-timer{font-size:1.65rem;font-weight:1000;color:#fff;background:#17364c;border-radius:10px;padding:8px 14px;font-variant-numeric:tabular-nums}.sprint-timer.urgent{background:#9c3445;animation:sprintPulse .7s infinite alternate}@keyframes sprintPulse{to{transform:scale(1.04)}}.sprint-score{font-size:.78rem;color:#4f6672;font-weight:800}.sprint-question{padding:18px 14px;border-radius:13px;background:#edf5f7;text-align:center;margin:11px 0}.sprint-question small{display:block;color:#52707e;font-weight:800;text-transform:uppercase;letter-spacing:.1em;font-size:.66rem;margin-bottom:8px}.sprint-element-name{font-size:clamp(1.65rem,5vw,2.5rem);font-weight:1000;line-height:1.15;color:#16384c}.sprint-form{display:flex;gap:8px;margin-top:12px}.sprint-input{flex:1;min-width:0;padding:12px;border:1px solid #bdd0d8;border-radius:9px;font:inherit;font-size:1.05rem}.sprint-feedback{min-height:24px;margin:10px 0 0;font-size:.85rem;font-weight:800}.sprint-feedback.good{color:#14754e}.sprint-feedback.bad{color:#a84b2c}.sprint-rules{font-size:.8rem;line-height:1.6;color:#506874;background:#f3f5f3;padding:11px 13px;border-radius:10px;margin:12px 0}.acid-sprint-form{display:grid;gap:8px;margin-top:12px}.acid-answer-line{display:flex;gap:8px;align-items:stretch}.acid-answer-line .sprint-input{flex:1;min-width:0}.acid-answer-line button{flex-shrink:0}.acid-formula-tools{width:100%;min-width:0}.acid-formula-keypad{display:grid;gap:8px;margin:9px 0}.acid-key-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.acid-formula-keypad span{font-size:.72rem;color:#536c78;font-weight:800;margin-right:3px}.acid-formula-key{min-width:34px;padding:7px 9px!important;border:1px solid #b9ccd4!important;border-radius:7px!important;background:#eef5f6!important;color:#153e53!important;font-size:1rem!important;font-weight:900!important}.acid-format-hint{display:block;color:#526b78;font-size:.72rem;margin-top:5px}.acid-prompt{font-size:clamp(1.05rem,3.3vw,1.35rem);font-weight:900;line-height:1.45;color:#16384c;overflow-wrap:anywhere}.sprint-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:17px 0}.sprint-result{padding:13px 7px;text-align:center;border:1px solid #d8e4e8;background:#f0f7f8;border-radius:11px}.sprint-result strong{display:block;font-size:1.45rem;color:#153e53}.sprint-result small{font-size:.68rem;color:#526b78}.shop-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:15px}.shop-item{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid #dbe4e7;background:#f7faf9;border-radius:13px;padding:12px}.shop-item.equipped{border-color:#4aab8a;box-shadow:inset 0 0 0 1px #4aab8a;background:#eff9f4}.shop-item-top{display:flex;align-items:center;gap:10px}.shop-item-icon{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border-radius:12px;background:linear-gradient(145deg,#e0eff2,#f6e9cf);font-size:2rem}.shop-item h3{font-size:.92rem;line-height:1.2;margin:0 0 4px}.shop-price{font-size:.75rem;font-weight:900;color:#8a6516}.shop-detail{font-size:.76rem;line-height:1.4;color:#5a707b;flex:1}.shop-item button{width:100%;font-size:.76rem;padding:9px 8px}.shop-item .primary{background:#176f96}.shop-item .secondary{background:#e6eff2}.shop-tag{display:inline-block;align-self:flex-start;background:#e2f4eb;color:#166448;padding:3px 7px;border-radius:5px;font-size:.62rem;font-weight:900}.economy-dialog .primary{background:#176f96;color:white}.economy-dialog button:disabled{opacity:.48}@media(max-width:560px){.economy-dialog{padding:22px 15px 17px}.shop-grid{grid-template-columns:1fr}.sprint-form{flex-direction:column}.sprint-form button{width:100%}.acid-answer-line{flex-direction:column}.acid-answer-line button{width:100%}.sprint-results{gap:5px}.sprint-result strong{font-size:1.25rem}}
 `;
 document.head.append(style);
 $("economy-close").addEventListener("click",closeEconomyOverlay);
 overlay.addEventListener("click",e=>{if(e.target===overlay)closeEconomyOverlay()});
 $("element-sprint-open").addEventListener("click",openElementSprint);
 $("acid-sprint-open").addEventListener("click",openAcidSprint);
 $("og-sprint-open").addEventListener("click",openOgSprint);
 $("skin-shop-open").addEventListener("click",openSkinShop);
 $("economy-content").addEventListener("click",handleEconomyClick);
 $("economy-content").addEventListener("submit",e=>{if(e.target&&e.target.id==="sprint-answer-form")submitSprintAnswer(e);else if(e.target&&e.target.id==="acid-sprint-answer-form")submitAcidSprintAnswer(e);else if(e.target&&e.target.id==="og-sprint-answer-form")submitOgSprintAnswer(e)});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("economy-overlay").classList.contains("hidden")){if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("De bonusronde loopt nog; sluit de opdracht pas na afloop.");return;}closeEconomyOverlay();}});
 renderEconomyPanel();applyEquippedSkin();
}
function renderEconomyPanel(){
 const balance=$("labcoin-balance");if(balance)balance.textContent=String(labCoins);
 const icon=$("equipped-skin-icon"),name=$("equipped-skin-name"),skin=COSMETIC_SKINS.find(x=>x.id===equippedSkin)||COSMETIC_SKINS[0];
 if(icon)icon.textContent=skin.emoji;if(name)name.textContent=skin.name;
 const anySprintRunning=sprintState.running||acidSprintState.running||ogSprintState.running;
 const quest=$("element-sprint-open");if(quest){quest.disabled=currentLevel!=="medieval"||anySprintRunning;quest.textContent=currentLevel==="medieval"?"⚡ Elementensprint · 60 sec":"⚡ Beschikbaar in level 1";quest.title=currentLevel==="medieval"?"Start de optionele quiz over elementsymbolen":"Keer terug naar het middeleeuwse labo voor de sidequest";}
 const acidQuest=$("acid-sprint-open");if(acidQuest){acidQuest.disabled=currentLevel!=="lavoisier"||anySprintRunning;acidQuest.textContent=currentLevel==="lavoisier"?"🧪 Zurenkennis · 60 sec":"🧪 Beschikbaar in level 2";acidQuest.title=currentLevel==="lavoisier"?"Start de open vragenronde over zuren en zuurrestnamen":"Keer terug naar het labo van Lavoisier voor deze sidequest";}
 const ogQuest=$("og-sprint-open");if(ogQuest){ogQuest.disabled=currentLevel!=="modern"||anySprintRunning;ogQuest.textContent=currentLevel==="modern"?"⚗️ The OG of chemistry · 60 sec":"⚗️ Beschikbaar in level 3";ogQuest.title=currentLevel==="modern"?"Oefen oxidatiegetallen in één minuut":"Keer terug naar het moderne chemielabo voor deze sidequest";}
 applyEquippedSkin();
}
function applyEquippedSkin(){
 const skin=COSMETIC_SKINS.find(x=>x.id===equippedSkin)||COSMETIC_SKINS[0];
 const avatar=document.querySelector(".shadow-duel .hero");if(avatar){avatar.textContent=skin.emoji;avatar.title=skin.name;avatar.setAttribute("aria-label",skin.name);}
 const panelIcon=$("equipped-skin-icon"),panelName=$("equipped-skin-name");if(panelIcon)panelIcon.textContent=skin.emoji;if(panelName)panelName.textContent=skin.name;
}
function showEconomyOverlay(content){$("economy-content").innerHTML=content;$("economy-overlay").classList.remove("hidden");}
function closeEconomyOverlay(){if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("De bonusronde loopt nog. De timer blijft lopen tot de minuut voorbij is.");return;}$("economy-overlay").classList.add("hidden");}
function openSkinShop(){
 if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("Maak eerst de bonusronde af voor je naar de winkel gaat.");return;}
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
  else label=`Koop voor ${skin.price} ${LABCOIN_ICON}`;
  return `<article class="shop-item ${isEquipped?"equipped":""}"><div class="shop-item-top"><span class="shop-item-icon" aria-hidden="true">${skin.emoji}</span><div><h3>${skin.name}</h3><div class="shop-price">${skin.price===0?"Gratis startskin":`${skin.price} ${LABCOIN_ICON} LabCoins`}</div></div></div>${isEquipped?'<span class="shop-tag">Momenteel gedragen</span>':""}<p class="shop-detail">${skin.detail}</p><button type="button" class="${buttonClass}" data-skin-id="${skin.id}" ${disabled?"disabled":""}>${label}</button></article>`;
 }).join("");
 showEconomyOverlay(`<p class="economy-eyebrow">LABCOIN-WINKEL</p><h2 class="economy-title" id="economy-title">🛍️ De skinwinkel</h2><p class="economy-lead">Koop alleen uiterlijke aanpassingen voor je chemicus. Skins geven geen voordeel bij de vragen. Je saldo: <strong>${labCoins} LabCoins</strong>.</p><div class="shop-grid">${cards}</div>`);
}
function openElementSprint(){
 if(currentLevel!=="medieval"){setStatus("De Elementensprint is beschikbaar in het eerste, middeleeuwse labo.");return;}
 if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("Er loopt al een bonusronde.");return;}
 showEconomyOverlay(`<p class="economy-eyebrow">OPTIONELE SIDEQUEST · LEVEL 1</p><h2 class="economy-title" id="economy-title">⚡ De Elementensprint</h2><p class="economy-lead">Je krijgt <strong>60 seconden</strong>. De naam van een element verschijnt; typ het juiste elementsymbool en let goed op hoofdletters. Bijvoorbeeld: lood → <strong>Pb</strong>, niet PB of pb.</p><div class="sprint-rules"><strong>Beloningen:</strong> juiste antwoorden 1–5 leveren elk 1 coin op; antwoorden 6–10 elk 2 coins; antwoorden 11–15 elk 3 coins, enzovoort. Een gewoon antwoord in de escape-roomquiz levert geen coins op.</div><button type="button" class="primary full" id="element-sprint-start">Start de 60 seconden</button><p class="muted">De sidequest is vrijwillig en verandert niets aan je deurcodes.</p>`);
}
async function startElementSprint(){
 if(currentLevel!=="medieval"){closeEconomyOverlay();setStatus("De Elementensprint is beschikbaar in het eerste labo.");return;}
 if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("Er loopt al een bonusronde.");return;}
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

function openAcidSprint(){
 if(currentLevel!=="lavoisier"){setStatus("De Zurenkennis-sprint is beschikbaar in level 2, het labo van Lavoisier.");return;}
 if(acidSprintState.running||sprintState.running||ogSprintState.running){setStatus("Er loopt al een bonusronde.");return;}
 showEconomyOverlay(`<p class="economy-eyebrow">OPTIONELE SIDEQUEST · LEVEL 2</p><h2 class="economy-title" id="economy-title">🧪 Zurenkennis-sprint</h2><p class="economy-lead">Je krijgt <strong>60 seconden</strong>. Beantwoord open vragen over de brutoformule, systematische naam, gebruiksnaam en zuurrest. De vragen kunnen in alle richtingen voorkomen.</p><div class="sprint-rules"><strong>Formules invoeren:</strong> je mag gewone cijfers gebruiken, zoals <strong>H2SO4</strong> en <strong>SO42-</strong>, of de knoppen gebruiken om indices en ladingen in te voegen. Beide schrijfwijzen worden als hetzelfde antwoord herkend.<br><strong>Beloningen:</strong> juiste antwoorden 1–5 leveren elk 1 coin op; antwoorden 6–10 elk 2 coins; antwoorden 11–15 elk 3 coins, enzovoort.</div><button type="button" class="primary full" id="acid-sprint-start">Start de 60 seconden</button><p class="muted">De vragen zijn open invulvragen. De gewone puzzelcodes veranderen niet.</p>`);
}
function createLocalAcidSprintQueue(){return createAcidSprintQueue();}
async function startAcidSprint(){
 if(currentLevel!=="lavoisier"){closeEconomyOverlay();setStatus("De Zurenkennis-sprint is beschikbaar in level 2.");return;}
 if(acidSprintState.running||sprintState.running||ogSprintState.running){setStatus("Er loopt al een bonusronde.");return;}
 if(acidSprintTimer)clearInterval(acidSprintTimer);if(acidSprintTransitionTimer)clearTimeout(acidSprintTransitionTimer);
 let onlineSessionId=null,questionQueue=null;
 if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{
   const remote=await window.ChemieOnline.startAcidSprint();
   if(!remote||!remote.ok)throw new Error(remote?.error||"De online Zurenkennis-sprint kon niet starten.");
   onlineSessionId=remote.session_id||null;
   if(Array.isArray(remote.items))questionQueue=remote.items.map(item=>({...item,sequence_number:Number(item.sequence_number)}));
   if(remote.coins!==undefined)labCoins=Number(remote.coins)||0;
  }catch(error){setStatus(error.message||"De online Zurenkennis-sprint kon niet starten. Controleer de Supabase-migratie.");return;}
 }
 const queue=questionQueue?.length?questionQueue:createLocalAcidSprintQueue();
 if(!queue.length){setStatus("Er zijn geen zuurvragen beschikbaar.");return;}
 acidSprintState={running:true,startingCoins:labCoins,correct:0,answered:0,startedAt:Date.now(),queue,index:0,current:null,best:acidSprintState.best||0,onlineSessionId};
 renderEconomyPanel();renderAcidSprintQuestion();tickAcidSprintTimer();acidSprintTimer=setInterval(tickAcidSprintTimer,100);
}
function tickAcidSprintTimer(){
 if(!acidSprintState.running)return;
 const remaining=Math.max(0,60000-(Date.now()-acidSprintState.startedAt));
 const timer=$("acid-sprint-time-left");if(timer){timer.textContent=`0:${String(Math.ceil(remaining/1000)).padStart(2,"0")}`;timer.classList.toggle("urgent",remaining<=10000);}
 if(remaining<=0)finishAcidSprint();
}
function renderAcidSprintQuestion(){
 if(!acidSprintState.running)return;
 const item=acidSprintState.queue[acidSprintState.index%acidSprintState.queue.length];acidSprintState.current=item;acidSprintState.index++;
 const indexKeys=["₁","₂","₃","₄","₅","₆","₇","₈"];
 const chargeKeys=["⁺","⁻","²⁺","²⁻","³⁺","³⁻"];
 const formulaTools=item.answer_type==="formula"?`<div class="acid-formula-tools"><div class="acid-formula-keypad" aria-label="Formuletekens invoegen"><div class="acid-key-group"><span>Indices (subscript):</span>${indexKeys.map(ch=>`<button type="button" class="acid-formula-key" data-acid-char="${ch}" aria-label="Voeg index ${ch} in">${ch}</button>`).join("")}</div><div class="acid-key-group"><span>Ladingen (superscript):</span>${chargeKeys.map(ch=>`<button type="button" class="acid-formula-key" data-acid-char="${ch}" aria-label="Voeg lading ${ch} in">${ch}</button>`).join("")}</div></div><small class="acid-format-hint">Gebruik de subscriptknoppen voor indices 1 t/m 8 en de superscriptknoppen voor ionladingen. Je mag ook gewone cijfers typen, bijvoorbeeld H2SO4 of SO42-. Hoofdletters in elementsymbolen moeten kloppen.</small></div>`:"";
 showEconomyOverlay(`<p class="economy-eyebrow">ZURENKENNIS · LEVEL 2</p><h2 class="economy-title" id="economy-title">Geef het juiste antwoord</h2><div class="sprint-hud"><div class="sprint-timer" id="acid-sprint-time-left">1:00</div><div class="sprint-score"><span id="acid-sprint-correct-count">${acidSprintState.correct}</span> juist · <span id="acid-sprint-answered-count">${acidSprintState.answered}</span> beantwoord</div></div><div class="sprint-question"><small>Open vraag</small><div class="acid-prompt">${displayAcidPrompt(item.prompt_text)}</div></div><form class="acid-sprint-form" id="acid-sprint-answer-form"><div class="acid-answer-line"><input class="sprint-input" id="acid-sprint-answer" name="answer" type="text" maxlength="60" placeholder="Typ je antwoord" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Antwoord op de zuurvraag" required><button type="submit" class="primary">Controleer antwoord</button></div>${formulaTools}</form><p class="sprint-feedback" id="acid-sprint-feedback" aria-live="polite">Vul één antwoord in. Je krijgt meteen feedback.</p>`);
 tickAcidSprintTimer();const input=$("acid-sprint-answer");if(input)input.focus({preventScroll:true});
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function insertAcidCharacter(character){
 const input=$("acid-sprint-answer");if(!input||input.disabled)return;
 const start=Number.isInteger(input.selectionStart)?input.selectionStart:input.value.length;
 const end=Number.isInteger(input.selectionEnd)?input.selectionEnd:input.value.length;
 input.setRangeText(character,start,end,"end");input.focus();
}
async function submitAcidSprintAnswer(e){
 e.preventDefault();if(!acidSprintState.running||!acidSprintState.current)return;
 const input=$("acid-sprint-answer"),submit=$("acid-sprint-answer-form")?.querySelector('button[type="submit"]');
 const typed=(input?.value||"").trim();if(!typed){input?.focus();return;}
 const item=acidSprintState.current;let verified=null,message="",kind="bad";
 if(acidSprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{
   verified=await window.ChemieOnline.submitAcidSprintAnswer(acidSprintState.onlineSessionId,Number(item.sequence_number),typed);
   if(!verified||!verified.ok)throw new Error(verified?.error||"De online antwoordcontrole is mislukt.");
   acidSprintState.correct=Number(verified.correct_count)||0;
   acidSprintState.answered=Number(verified.answered_count)||acidSprintState.answered+1;
   labCoins=Number(verified.coins)||0;
   const expected=displayAcidAnswer(verified.expected_answer,item.answer_type);
   if(verified.correct){message=`Juist! ${expected}. +${verified.reward} ${Number(verified.reward)===1?"coin":"coins"}.`;kind="good";}
   else{message=`Niet helemaal. Het juiste antwoord is: ${expected}. Geen coins deze keer.`;}
   window.ChemieOnline.refreshDashboardSoon();
  }catch(error){const note=$("acid-sprint-feedback");if(note){note.textContent=error.message||"De controle is mislukt. Probeer opnieuw.";note.className="sprint-feedback bad";}if(input)input.focus();return;}
 }else{
  acidSprintState.answered++;
  const correct=normaliseAcidAnswer(typed,item.answer_type)===normaliseAcidAnswer(item.expected_answer,item.answer_type);
  const expected=displayAcidAnswer(item.expected_answer,item.answer_type);
  if(correct){const reward=Math.floor(acidSprintState.correct/5)+1;acidSprintState.correct++;labCoins+=reward;message=`Juist! ${expected}. +${reward} ${reward===1?"coin":"coins"}.`;kind="good";}
  else{message=`Niet helemaal. Het juiste antwoord is: ${expected}. Geen coins deze keer.`;}
 }
 const note=$("acid-sprint-feedback");if(note){note.textContent=message;note.className=`sprint-feedback ${kind}`;}
 if(input)input.disabled=true;if(submit)submit.disabled=true;
 const correctEl=$("acid-sprint-correct-count"),answeredEl=$("acid-sprint-answered-count");if(correctEl)correctEl.textContent=String(acidSprintState.correct);if(answeredEl)answeredEl.textContent=String(acidSprintState.answered);
 renderEconomyPanel();acidSprintTransitionTimer=setTimeout(()=>{if(acidSprintState.running)renderAcidSprintQuestion();},650);
}
async function finishAcidSprint(){
 if(!acidSprintState.running)return;
 acidSprintState.running=false;if(acidSprintTimer){clearInterval(acidSprintTimer);acidSprintTimer=null;}if(acidSprintTransitionTimer){clearTimeout(acidSprintTransitionTimer);acidSprintTransitionTimer=null;}
 if(acidSprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{const settled=await window.ChemieOnline.finishAcidSprint(acidSprintState.onlineSessionId);if(settled&&settled.ok){labCoins=Number(settled.coins)||0;acidSprintState.correct=Number(settled.correct_count)||acidSprintState.correct;acidSprintState.answered=Number(settled.answered_count)||acidSprintState.answered;}else if(settled?.error){setStatus(settled.error);}}catch(error){console.error("Zurenkennis-sprint afronden mislukt:",error);}
 }
 const earned=labCoins-acidSprintState.startingCoins;acidSprintState.best=Math.max(acidSprintState.best,acidSprintState.correct);renderEconomyPanel();
 showEconomyOverlay(`<p class="economy-eyebrow">SIDEQUEST VOLTOOID · LEVEL 2</p><h2 class="economy-title" id="economy-title">⏱️ Tijd is om!</h2><p class="economy-lead">Goed gewerkt aan je zurenkennis. Je LabCoins zijn bijgewerkt.</p><div class="sprint-results"><div class="sprint-result"><strong>${acidSprintState.correct}</strong><small>Juiste antwoorden</small></div><div class="sprint-result"><strong>${acidSprintState.answered}</strong><small>Beantwoord</small></div><div class="sprint-result"><strong>+${earned}</strong><small>Verdiende coins</small></div></div><div class="sprint-rules">Je beste score in deze speelsessie: <strong>${acidSprintState.best}</strong> juiste antwoorden. Je kunt de Zurenkennis-sprint opnieuw spelen.</div><button type="button" class="primary full" id="acid-sprint-retry">Nog een ronde</button><button type="button" class="secondary full" id="economy-done">Terug naar het labo</button>`);
 setStatus(`Zurenkennis-sprint klaar: ${acidSprintState.correct} juist, ${earned} coins verdiend.`);if(window.ChemieOnline)window.ChemieOnline.refreshDashboardSoon();
}

function openOgSprint(){
 if(currentLevel!=="modern"){setStatus("The OG of chemistry is beschikbaar in level 3, het moderne chemielabo.");return;}
 if(sprintState.running||acidSprintState.running||ogSprintState.running){setStatus("Er loopt al een bonusronde.");return;}
 showEconomyOverlay(`<p class="economy-eyebrow">OPTIONELE BONUS · LEVEL 3</p><h2 class="economy-title" id="economy-title">⚗️ The OG of chemistry</h2><p class="economy-lead">Je krijgt <strong>60 seconden</strong>. Bepaal zo snel mogelijk het oxidatiegetal van het aangeduide element. Antwoord met Romeinse cijfers, bijvoorbeeld <strong>+II</strong>, <strong>-I</strong> of <strong>0</strong>.</p><div class="sprint-rules"><strong>Beloningen:</strong> juiste antwoorden 1–5 leveren elk 1 LabCoin op; antwoorden 6–10 elk 2 LabCoins; antwoorden 11–15 elk 3 LabCoins, enzovoort. Elk juist antwoord levert daarnaast 2 XP op.</div><button type="button" class="primary full" id="og-sprint-start">Start de 60 seconden</button><p class="muted">De vragen zijn open invulvragen. De gewone puzzelcodes veranderen niet.</p>`);
}
async function startOgSprint(){
 if(currentLevel!=="modern"){closeEconomyOverlay();setStatus("The OG of chemistry is beschikbaar in level 3.");return;}
 if(ogSprintState.running||acidSprintState.running||sprintState.running){setStatus("Er loopt al een bonusronde.");return;}
 if(ogSprintTimer)clearInterval(ogSprintTimer);if(ogSprintTransitionTimer)clearTimeout(ogSprintTransitionTimer);
 let onlineSessionId=null,questionQueue=null,serverExpiresAt=null;
 if(window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{
   const remote=await window.ChemieOnline.startOgSprint();
   if(!remote||!remote.ok)throw new Error(remote?.error||"The OG of chemistry kon niet starten.");
   onlineSessionId=remote.session_id||null;
   if(Array.isArray(remote.items))questionQueue=remote.items.map(item=>({...item,sequence_number:Number(item.sequence_number)}));
   if(remote.expires_at)serverExpiresAt=Date.parse(remote.expires_at);
   if(remote.coins!==undefined)labCoins=Number(remote.coins)||0;
  }catch(error){setStatus(error.message||"De online sprint kon niet starten. Controleer de Supabase-migratie.");return;}
 }
 const startedAt=Date.now();
 ogSprintState={running:true,startingCoins:labCoins,correct:0,answered:0,startedAt,expiresAt:Number.isFinite(serverExpiresAt)?serverExpiresAt:startedAt+60000,queue:questionQueue?.length?questionQueue:Array.from({length:3},()=>shuffle(OXIDATION_ITEMS)).flat(),index:0,current:null,best:ogSprintState.best||0,onlineSessionId};
 renderEconomyPanel();renderOgSprintQuestion();tickOgSprintTimer();ogSprintTimer=setInterval(tickOgSprintTimer,100);
}
function tickOgSprintTimer(){
 if(!ogSprintState.running)return;
 const deadline=Number(ogSprintState.expiresAt)||ogSprintState.startedAt+60000;
 const remaining=Math.max(0,deadline-Date.now());
 const timer=$("og-sprint-time-left");if(timer){timer.textContent=`0:${String(Math.ceil(remaining/1000)).padStart(2,"0")}`;timer.classList.toggle("urgent",remaining<=10000);}
 if(remaining<=0)finishOgSprint();
}
function renderOgSprintQuestion(){
 if(!ogSprintState.running)return;
 const item=ogSprintState.queue[ogSprintState.index];if(!item){return;}ogSprintState.current=item;ogSprintState.index++;
 const formula=formatOxidationFormula(item.formula);
 showEconomyOverlay(`<p class="economy-eyebrow">THE OG OF CHEMISTRY · LEVEL 3</p><h2 class="economy-title" id="economy-title">Welk oxidatiegetal?</h2><div class="sprint-hud"><div class="sprint-timer" id="og-sprint-time-left">1:00</div><div class="sprint-score"><span id="og-sprint-correct-count">${ogSprintState.correct}</span> juist · <span id="og-sprint-answered-count">${ogSprintState.answered}</span> beantwoord</div></div><div class="sprint-question"><small>Welk oxidatiegetal heeft ${escapeHtml(item.element)} in deze stof?</small><div class="acid-prompt">${escapeHtml(item.element)} in ${escapeHtml(formula)}</div></div><form class="sprint-form" id="og-sprint-answer-form"><input class="sprint-input" id="og-sprint-answer" name="answer" type="text" maxlength="5" placeholder="Bijv. +II, -I of 0" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Oxidatiegetal in Romeinse cijfers" required><button type="submit" class="primary">Antwoord</button></form><p class="sprint-feedback" id="og-sprint-feedback" aria-live="polite">Gebruik Romeinse cijfers en vermeld het teken bij positieve of negatieve waarden.</p>`);
 tickOgSprintTimer();const input=$("og-sprint-answer");if(input)input.focus({preventScroll:true});
}
async function submitOgSprintAnswer(e){
 e.preventDefault();if(!ogSprintState.running||!ogSprintState.current)return;
 const input=$("og-sprint-answer"),submit=$("og-sprint-answer-form")?.querySelector('button[type="submit"]');
 const typed=(input?.value||"").trim();if(!typed){input?.focus();return;}
 if(submit)submit.disabled=true;if(input)input.disabled=true;
 const item=ogSprintState.current;let message="",kind="bad",verified=null;
 if(ogSprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{
   verified=await window.ChemieOnline.submitOgSprintAnswer(ogSprintState.onlineSessionId,Number(item.sequence_number),typed);
   if(!verified||!verified.ok)throw new Error(verified?.error||"De online antwoordcontrole is mislukt.");
   ogSprintState.correct=Number(verified.correct_count)||0;
   ogSprintState.answered=Number(verified.answered_count)||ogSprintState.answered+1;
   labCoins=Number(verified.coins)||0;
   if(verified.correct){message=`Juist! ${verified.expected_answer}. +${verified.reward} ${Number(verified.reward)===1?"LabCoin":"LabCoins"}.`;kind="good";}
   else{message=`Niet helemaal. Het juiste oxidatiegetal is ${verified.expected_answer}. Geen LabCoins deze keer.`;}
   window.ChemieOnline.refreshDashboardSoon();
  }catch(error){
   if(submit)submit.disabled=false;if(input){input.disabled=false;input.focus();}
   const note=$("og-sprint-feedback");if(note){note.textContent=error.message||"De controle is mislukt. Probeer opnieuw.";note.className="sprint-feedback bad";}return;
  }
 }else{
  ogSprintState.answered++;
  const correct=normaliseOxidationAnswer(typed)===normaliseOxidationAnswer(item.answer);
  if(correct){const reward=Math.floor(ogSprintState.correct/5)+1;ogSprintState.correct++;labCoins+=reward;message=`Juist! ${item.answer}. +${reward} ${reward===1?"LabCoin":"LabCoins"}.`;kind="good";}
  else{message=`Niet helemaal. Het juiste oxidatiegetal is ${item.answer}. Geen LabCoins deze keer.`;}
 }
 const note=$("og-sprint-feedback");if(note){note.textContent=message;note.className=`sprint-feedback ${kind}`;}
 const correctEl=$("og-sprint-correct-count"),answeredEl=$("og-sprint-answered-count");if(correctEl)correctEl.textContent=String(ogSprintState.correct);if(answeredEl)answeredEl.textContent=String(ogSprintState.answered);
 renderEconomyPanel();ogSprintTransitionTimer=setTimeout(()=>{if(ogSprintState.running)renderOgSprintQuestion();},650);
}
async function finishOgSprint(){
 if(!ogSprintState.running)return;
 ogSprintState.running=false;if(ogSprintTimer){clearInterval(ogSprintTimer);ogSprintTimer=null;}if(ogSprintTransitionTimer){clearTimeout(ogSprintTransitionTimer);ogSprintTransitionTimer=null;}
 if(ogSprintState.onlineSessionId&&window.ChemieOnline&&window.ChemieOnline.isAuthenticated()){
  try{const settled=await window.ChemieOnline.finishOgSprint(ogSprintState.onlineSessionId);if(settled&&settled.ok){labCoins=Number(settled.coins)||0;ogSprintState.correct=Number(settled.correct_count)||ogSprintState.correct;ogSprintState.answered=Number(settled.answered_count)||ogSprintState.answered;}else if(settled?.error){setStatus(settled.error);}}catch(error){console.error("The OG of chemistry afronden mislukt:",error);}
 }
 const earned=labCoins-ogSprintState.startingCoins;ogSprintState.best=Math.max(ogSprintState.best,ogSprintState.correct);renderEconomyPanel();
 showEconomyOverlay(`<p class="economy-eyebrow">BONUS VOLTOOID · LEVEL 3</p><h2 class="economy-title" id="economy-title">⏱️ Tijd is om!</h2><p class="economy-lead">Goed gewerkt aan je oxidatiegetallen. Je LabCoins zijn bijgewerkt.</p><div class="sprint-results"><div class="sprint-result"><strong>${ogSprintState.correct}</strong><small>Juiste antwoorden</small></div><div class="sprint-result"><strong>${ogSprintState.answered}</strong><small>Beantwoord</small></div><div class="sprint-result"><strong>+${earned}</strong><small>Verdiende LabCoins</small></div></div><div class="sprint-rules">Je beste score in deze speelsessie: <strong>${ogSprintState.best}</strong> juiste antwoorden. Je kunt The OG of chemistry opnieuw spelen.</div><button type="button" class="primary full" id="og-sprint-retry">Nog een ronde</button><button type="button" class="secondary full" id="economy-done">Terug naar het labo</button>`);
 setStatus(`The OG of chemistry klaar: ${ogSprintState.correct} juist, ${earned} LabCoins verdiend.`);if(window.ChemieOnline)window.ChemieOnline.refreshDashboardSoon();
}

async function handleEconomyClick(e){
 const formulaChar=e.target.closest("[data-acid-char]");if(formulaChar){e.preventDefault();insertAcidCharacter(formulaChar.dataset.acidChar);return;}
 const acidStart=e.target.closest("#acid-sprint-start");if(acidStart){startAcidSprint();return;}
 const acidRetry=e.target.closest("#acid-sprint-retry");if(acidRetry){startAcidSprint();return;}
 const ogStart=e.target.closest("#og-sprint-start");if(ogStart){startOgSprint();return;}
 const ogRetry=e.target.closest("#og-sprint-retry");if(ogRetry){startOgSprint();return;}
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
 setTeacherMode(value){teacherMode=Boolean(value);if(teacherMode){unlocked=Object.fromEntries(LEVEL_ORDER.map(level=>[level,true]));renderLevel();setStatus("Leerkrachtmodus actief: alle vier labo’s zijn vrij toegankelijk.");}else{unlocked=Object.fromEntries(LEVEL_ORDER.map((level,index)=>[level,index===0]));renderLevel();}},
 isTeacher(){return teacherMode;},
 onOnlineLogin(){onOnlineLogin();},
 onOnlineLogout(){onOnlineLogout();},
 getEconomyState(){return {coins:labCoins,ownedSkins:[...ownedSkins],equippedSkin};},
 applyOnlineEconomy(state){if(!state)return;if(Number.isFinite(Number(state.coins)))labCoins=Number(state.coins);if(Array.isArray(state.ownedSkins))ownedSkins=new Set(state.ownedSkins);if(state.equippedSkin&&COSMETIC_SKINS.some(x=>x.id===state.equippedSkin))equippedSkin=state.equippedSkin;renderEconomyPanel();applyEquippedSkin();},
 applyMaterials(state){applyMaterials(state);},
 clearMaterials(){inventory=EMPTY_MATERIALS();saveLocalMaterials();renderInventory();if(shadowVisible)hideShadow(false);},
 refresh(){renderEconomyPanel();applyEquippedSkin();},
 applyOnlinePuzzleProgress(rows){
   puzzleSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:false,object2:false,object3:false,object4:false}]));
   puzzleCompletions=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));
   objectProgress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));
   progress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,0]));codes={};
   (Array.isArray(rows)?rows:[]).forEach(row=>{
     const level=row.level_id,obj=row.object_id;if(!puzzleSolved[level]||!Object.hasOwn(puzzleSolved[level],obj))return;
     puzzleSolved[level][obj]=true;puzzleCompletions[level][obj]=Number(row.completion_count)||1;
     const idx=Number(obj.replace("object",""))-1;codes[level]=codes[level]||[];codes[level][idx]=LEVELS[level].code[idx];
     progress[level]+=Number(row.questions_required)||QUESTIONS_PER_PUZZLE;
   });
   levelSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,Object.values(puzzleSolved[l]).every(Boolean)]));
   unlocked=teacherMode?Object.fromEntries(LEVEL_ORDER.map(l=>[l,true])):Object.fromEntries(LEVEL_ORDER.map((l,i)=>[l,i===0]));
   currentLevel="medieval";
   renderLevel();updateProgress();
 },
 applyOnlineLevelUnlocks(rows){
   unlocked=teacherMode?Object.fromEntries(LEVEL_ORDER.map(l=>[l,true])):Object.fromEntries(LEVEL_ORDER.map(l=>[l,false]));
   if(!teacherMode)(Array.isArray(rows)?rows:[]).forEach(row=>{if(Object.hasOwn(unlocked,row.level_id))unlocked[row.level_id]=true;});
   unlocked.medieval=true;
   currentLevel=teacherMode?"medieval":(LEVEL_ORDER.filter(l=>unlocked[l]).slice(-1)[0]||"medieval");
   renderLevel();
 },
 clearOnlinePuzzleProgress(){
   teacherMode=false;
   puzzleSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:false,object2:false,object3:false,object4:false}]));
   puzzleCompletions=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));
   progress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,0]));objectProgress=Object.fromEntries(LEVEL_ORDER.map(l=>[l,{object1:0,object2:0,object3:0,object4:0}]));levelSolved=Object.fromEntries(LEVEL_ORDER.map(l=>[l,false]));codes={};unlocked=Object.fromEntries(LEVEL_ORDER.map((l,i)=>[l,i===0]));currentLevel="medieval";renderLevel();updateProgress();
 }
};

initEconomyUI();
init();
