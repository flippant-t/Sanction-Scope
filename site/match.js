// Name-matching engine shared by the home page checker and the bulk screener (screen.html).
// It runs entirely in the visitor's browser against api/v1/index.json. It must stay in step with
// functions/api/v1/_score.js, which the API uses: same weights, same floor.
const LEGAL=new Set("LLC LTD LIMITED INC CORP CORPORATION CO COMPANY GMBH AG SA SAS SARL BV NV PLC PJSC JSC OJSC CJSC OAO ZAO OOO AO PAO LLP LP SRL SPA PTE PTY PVT FZE FZCO THE OF AND PUBLIC JOINT STOCK OPEN CLOSED".split(" "));
const norm=s=>(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();
const tokens=s=>norm(s).split(" ").filter(t=>t&&!LEGAL.has(t));

function jw(a,b){if(a===b)return 1;const la=a.length,lb=b.length;if(!la||!lb)return 0;const range=Math.max(0,Math.floor(Math.max(la,lb)/2)-1);const ma=new Array(la).fill(false),mb=new Array(lb).fill(false);let m=0;
for(let i=0;i<la;i++){const lo=Math.max(0,i-range),hi=Math.min(lb-1,i+range);for(let j=lo;j<=hi;j++)if(!mb[j]&&a[i]===b[j]){ma[i]=mb[j]=true;m++;break;}}if(!m)return 0;let t=0,k=0;for(let i=0;i<la;i++)if(ma[i]){while(!mb[k])k++;if(a[i]!==b[k])t++;k++;}
const j=(m/la+m/lb+(m-t/2)/m)/3;let l=0;while(l<4&&a[l]===b[l])l++;return j+l*0.1*(1-j);}

let INDEX=null,TOK=null;

// Every token is weighted by how many parties carry it, which the token index already knows.
// Without this, "Maria Gonzalez" matches half a dozen unrelated people because GONZALEZ and MARIA
// count for as much as a distinctive surname does. Same scoring the API uses.
const IDF_MIN=0.5, IDF_MAX=8, COVERAGE_WEIGHT=0.35, TOKEN_FLOOR=0.86;
function idfOf(t){const l=TOK&&TOK.get(t);const df=l?l.length:0;
  if(!df)return IDF_MAX;
  return Math.max(IDF_MIN,Math.min(IDF_MAX,Math.log(INDEX.length/df)));}

function scoreParty(q,p){
  const qt=tokens(q); if(!qt.length)return 0;
  const qw=qt.map(idfOf), qTot=qw.reduce((a,b)=>a+b,0)||1;
  let best=0;
  for(const name of [p.n,...(p.alt||[]).slice(0,6)]){
    const nt=tokens(name); if(!nt.length)continue;
    const nw=nt.map(idfOf), nTot=nw.reduce((a,b)=>a+b,0)||1;
    const used=new Array(nt.length).fill(false);
    let mq=0,mn=0;
    for(let i=0;i<qt.length;i++){
      let bj=-1,bs=0;
      for(let j=0;j<nt.length;j++){ if(used[j])continue; const s=qt[i]===nt[j]?1:jw(qt[i],nt[j]); if(s>bs){bs=s;bj=j;} }
      if(bj>=0&&bs>=TOKEN_FLOOR){ used[bj]=true; mq+=qw[i]*bs; mn+=nw[bj]*bs; }
    }
    if(!mq)continue;
    const s=Math.pow(mq/qTot,1-COVERAGE_WEIGHT)*Math.pow(mn/nTot,COVERAGE_WEIGHT);
    if(s>best)best=s;
    if(best>=0.999)break;
  }
  return best;
}

// Candidate generation prefers the rarest tokens in the query: pulling the posting list for
// "BANK" or "MOHAMMED" first wastes the cap on parties that were never going to score.
function candidates(q,cap=400){
  const qt=[...new Set(tokens(q))];if(!qt.length)return [];
  const lists=qt.map(t=>TOK.get(t)||[]).filter(l=>l.length).sort((a,b)=>a.length-b.length).slice(0,4);
  const seen=new Map();
  for(const l of lists)for(const i of l)seen.set(i,(seen.get(i)||0)+1);
  return [...seen.entries()].sort((a,b)=>b[1]-a[1]).slice(0,cap).map(([i])=>INDEX[i]);
}


// Fetches the compact party index and builds the token map the scorer weights by.
async function loadIndex(){
  const r=await fetch('api/v1/index.json');if(!r.ok)throw new Error('HTTP '+r.status);INDEX=await r.json();
  TOK=new Map();
  INDEX.forEach((p,i)=>{const seen=new Set();for(const name of [p.n,...(p.alt||[])])for(const t of tokens(name))if(t.length>1&&!seen.has(t)){seen.add(t);if(!TOK.has(t))TOK.set(t,[]);TOK.get(t).push(i);}});
  return INDEX.length;
}
