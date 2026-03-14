// ── Custom cursor ──────────────────────────────────────────────────────────
const cursorEl = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  cursorEl.style.left = e.clientX + 'px';
  cursorEl.style.top  = e.clientY + 'px';
});
document.addEventListener('mousedown', () => {
  cursorEl.classList.add('fired');
  setTimeout(() => cursorEl.classList.remove('fired'), 120);
});

// ── Animated gum pieces ────────────────────────────────────────────────────
(function(){
  const bg = document.getElementById('gum-bg');
  const colors = [
    ['#c2185b','#880e4f'],['#e91e8c','#ad1457'],['#f06292','#c2185b'],
    ['#d81b60','#880e4f'],['#f48fb1','#e91e8c'],['#ad1457','#6a0f3a'],
  ];
  for(let i=0;i<22;i++){
    const el=document.createElement('div'); el.className='gum-piece';
    const [c1,c2]=colors[i%colors.length];
    const w=28+Math.random()*42, h=w*(0.36+Math.random()*0.3);
    el.style.cssText=`
      width:${w}px;height:${h}px;left:${Math.random()*100}%;
      background:linear-gradient(135deg,${c1},${c2});
      box-shadow:inset -3px -3px 6px rgba(0,0,0,0.3),inset 2px 2px 5px rgba(255,255,255,0.1);
      animation-duration:${7+Math.random()*11}s;
      animation-delay:${-Math.random()*16}s;
      opacity:${0.5+Math.random()*0.4};
    `;
    bg.appendChild(el);
  }
})();

// ── Game state ─────────────────────────────────────────────────────────────
let score=0, timeLeft=30, level=1, running=false;
let timerInterval=null, hideTimeout=null, lastX=-999, lastY=-999;
let bounceRaf=null;

const target  = document.getElementById('target');
const chicImg = document.getElementById('chic-img');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const levelEl = document.getElementById('level');
const gameArea= document.getElementById('game-area');

// ── Chicletão idle bounce animation ───────────────────────────────────────
function startBounce(){
  cancelAnimationFrame(bounceRaf);
  let t=0;
  function frame(){
    t+=0.055;
    const sy = 1 + Math.sin(t)*0.045;
    const sx = 1 - Math.sin(t)*0.025;
    const r  = Math.sin(t*0.65)*6;
    // anchor transform at bottom (translate -100% already applied by CSS)
    chicImg.style.transform = `scaleX(${sx}) scaleY(${sy}) rotate(${r}deg)`;
    bounceRaf=requestAnimationFrame(frame);
  }
  frame();
}
function stopBounce(){
  cancelAnimationFrame(bounceRaf);
  chicImg.style.transform='';
}

// ── Spawn ──────────────────────────────────────────────────────────────────
function getLifetime(){ return Math.max(900,2400-(level-1)*250); }

function spawnTarget(){
  if(!running)return;
  const marginX=50, marginY=80; // extra Y because sprite anchors at feet
  const aW=gameArea.clientWidth, aH=gameArea.clientHeight;
  let x,y,tries=0;
  do{
    x=marginX+Math.random()*(aW-marginX*2);
    y=marginY+Math.random()*(aH-marginY);
    tries++;
  } while(Math.hypot(x-lastX,y-lastY)<140&&tries<20);
  lastX=x; lastY=y;

  target.style.left=x+'px';
  target.style.top =y+'px';
  target.style.display='block';
  target.classList.remove('popin');
  void target.offsetWidth;
  target.classList.add('popin');
  startBounce();

  clearTimeout(hideTimeout);
  hideTimeout=setTimeout(()=>{
    target.style.display='none';
    stopBounce();
    setTimeout(spawnTarget,280);
  }, getLifetime());
}

// ── Click target ──────────────────────────────────────────────────────────
target.addEventListener('click',e=>{
  if(!running)return;
  e.stopPropagation();
  clearTimeout(hideTimeout);
  target.style.display='none';
  stopBounce();

  const pts=15*level; score+=pts; scoreEl.textContent=score;

  const fl=document.createElement('div');
  fl.className='hit-flash'; fl.textContent='+'+pts;
  fl.style.left=lastX+'px'; fl.style.top=(lastY-60)+'px';
  gameArea.appendChild(fl); setTimeout(()=>fl.remove(),750);

  const newLevel=Math.min(6,1+Math.floor(score/60));
  if(newLevel>level){
    level=newLevel; levelEl.textContent=level;
    const lv=document.createElement('div'); lv.className='hit-flash';
    lv.textContent='NIVEL '+level+'!'; lv.style.left='50%'; lv.style.top='45%';
    lv.style.fontSize='30px'; gameArea.appendChild(lv); setTimeout(()=>lv.remove(),750);
  }
  setTimeout(spawnTarget,220);
});

// ── Timer ─────────────────────────────────────────────────────────────────
function startTimer(){
  timerInterval=setInterval(()=>{
    timeLeft--; timerEl.textContent=timeLeft;
    timerEl.classList.toggle('urgent',timeLeft<=6);
    if(timeLeft<=0)endGame();
  },1000);
}

// ── Start ─────────────────────────────────────────────────────────────────
function startGame(){
  score=0;timeLeft=30;level=1;
  scoreEl.textContent=0;timerEl.textContent=30;levelEl.textContent=1;
  timerEl.classList.remove('urgent');
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('over-screen').classList.add('hidden');
  document.getElementById('name-input').value='';
  document.getElementById('btn-save').textContent='Salvar pontuacao';
  document.getElementById('btn-save').disabled=false;
  running=true;
  spawnTarget();
  startTimer();
}

// ── End ───────────────────────────────────────────────────────────────────
function endGame(){
  running=false; clearInterval(timerInterval); clearTimeout(hideTimeout);
  stopBounce(); target.style.display='none';
  document.getElementById('final-score').textContent=score;
  let msg;
  if(score>=1000)      msg='Mestre do Chicletao!';
  else if(score>=700) msg='Atirador Expert!';
  else if(score>=200)  msg='Bom de Mira!';
  else                msg='Continue tentando!';
  document.getElementById('rank-msg').textContent=msg;
  document.getElementById('over-screen').classList.remove('hidden');
  setTimeout(()=>document.getElementById('name-input').focus(),120);
}

// ── Scoreboard ────────────────────────────────────────────────────────────
function loadScores(){ try{return JSON.parse(localStorage.getItem('chicletao_scores')||'[]');}catch{return[];} }
function saveScore(name,pts){
  if(!pts)return;
  const s=loadScores();
  s.push({name:name||'Anonimo',pts,date:new Date().toLocaleDateString('pt-BR')});
  s.sort((a,b)=>b.pts-a.pts);
  const t=s.slice(0,5);
  localStorage.setItem('chicletao_scores',JSON.stringify(t));
  renderScoreboard(t);
}
function renderScoreboard(scores){
  const list=document.getElementById('sb-list');
  if(!scores.length){list.innerHTML='<li class="sb-empty">Nenhuma pontuacao ainda</li>';return;}
  list.innerHTML=scores.map((s,i)=>`
    <li>
      <span class="sb-rank">${i+1}.</span>
      <span class="sb-name">${s.name}<span class="sb-date">${s.date}</span></span>
      <span class="sb-pts">${s.pts} pts</span>
    </li>`).join('');
}
renderScoreboard(loadScores());

document.getElementById('btn-start').addEventListener('click',startGame);
document.getElementById('btn-save').addEventListener('click',()=>{
  const name=document.getElementById('name-input').value.trim();
  saveScore(name,score);
  document.getElementById('btn-save').textContent='Salvo!';
  document.getElementById('btn-save').disabled=true;
});
document.getElementById('name-input').addEventListener('keydown',e=>{
  if(e.key==='Enter')document.getElementById('btn-save').click();
});
document.getElementById('btn-restart').addEventListener('click',startGame);
