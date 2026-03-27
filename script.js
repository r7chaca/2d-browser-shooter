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

// ── Power-up state ─────────────────────────────────────────────────────────
let doublePoints=false, bigTarget=false;
let doubleTimeout=null, bigTimeout=null;
let powerupTimeout=null;
const POWERUP_DURATION = 5000; // 5 segundos
const POWERUP_INTERVAL_MIN = 8000;
const POWERUP_INTERVAL_MAX = 14000;

// ── Áudio (arquivos externos) ──────────────────────────────────────────────
// Coloque os arquivos na pasta audio/ do projeto:
//   audio/hit.mp3       — acerto no alvo
//   audio/powerup.mp3   — ativação de power-up
//   audio/levelup.mp3   — subida de nível
//   audio/miss.mp3      — erro/miss
//   audio/music.mp3     — música ambiente (loop)

function loadAudio(src, volume=1){ const a=new Audio(src); a.volume=volume; return a; }

const sfx = {
  hit    : loadAudio('audio/hit.mp3',     0.4),
  powerup: loadAudio('audio/powerup.mp3', 0.7),
  levelup: loadAudio('audio/levelup.mp3', 0.8),
};

function playSfx(name){
  const s=sfx[name]; if(!s) return;
  s.currentTime=0; s.play().catch(()=>{});
}

// ── Som de miss sintetizado ────────────────────────────────────────────────
function playMiss(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!playMiss._ctx) playMiss._ctx = new AudioCtx();
  const ctx = playMiss._ctx;
  if(ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;

  // Tom descendente grave — sensação de "errou"
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.18);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.start(t); osc.stop(t + 0.22);
}

// ── Música ambiente ────────────────────────────────────────────────────────
const bgMusic = loadAudio('audio/Background.mp3', 0.5);
bgMusic.loop = true;
let musicMuted = false;

function playMusic(){ if(!musicMuted) bgMusic.play().catch(()=>{}); }
function stopMusic(){ bgMusic.pause(); bgMusic.currentTime=0; }

function toggleMute(){
  musicMuted=!musicMuted;
  if(musicMuted) bgMusic.pause();
  else bgMusic.play().catch(()=>{});
  const btn=document.getElementById('btn-mute');
  if(btn) btn.textContent=musicMuted?'🔇':'🔊';
}

// ── Botão de mute ──────────────────────────────────────────────────────────
(function createMuteButton(){
  const btn=document.createElement('button');
  btn.id='btn-mute'; btn.className='btn secondary';
  btn.textContent='🔊'; btn.title='Música';
  btn.style.cssText=`
    position:fixed; bottom:18px; right:18px;
    z-index:999; font-size:20px;
    padding:6px 14px; min-width:unset;
  `;
  btn.addEventListener('click',toggleMute);
  document.body.appendChild(btn);
})();

const target  = document.getElementById('target');
const chicImg = document.getElementById('chic-img');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const levelEl = document.getElementById('level');
const gameArea= document.getElementById('game-area');

// ── Injetar estilos dos power-ups ──────────────────────────────────────────
(function injectPowerupStyles(){
  const style = document.createElement('style');
  style.textContent = `
    /* Power-up pill no HUD */
    #powerup-hud {
      display: flex;
      gap: 8px;
      min-height: 46px;
      align-items: center;
    }
    .powerup-badge {
      background: rgba(30,0,20,0.88);
      border: 2px solid #ffd600;
      border-radius: 8px;
      padding: 4px 14px;
      font-size: 15px;
      color: #ffd600;
      box-shadow: 0 0 12px rgba(255,214,0,0.5);
      display: flex;
      align-items: center;
      gap: 6px;
      animation: badgePop .25s cubic-bezier(.34,1.56,.64,1);
    }
    .powerup-badge.big-badge { border-color: #00e5ff; color: #00e5ff; box-shadow: 0 0 12px rgba(0,229,255,0.5); }
    @keyframes badgePop {
      from { transform: scale(0.6); opacity: 0; }
      to   { transform: scale(1);   opacity: 1; }
    }
    .powerup-timer-bar {
      width: 60px; height: 4px;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 2px;
    }
    .powerup-timer-fill {
      height: 100%;
      background: #ffd600;
      border-radius: 2px;
      transition: width 0.1s linear;
    }
    .big-badge .powerup-timer-fill { background: #00e5ff; }

    /* Ícone de power-up no game-area */
    .powerup-item {
      position: absolute;
      width: 46px; height: 46px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      cursor: none;
      z-index: 4;
      transform: translate(-50%, -50%);
      animation: pwFloat 1s ease-in-out infinite alternate, pwPopin .25s cubic-bezier(.34,1.56,.64,1);
      box-shadow: 0 0 18px rgba(255,214,0,0.8), 0 0 6px rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.3);
    }
    .powerup-item.type-double {
      background: radial-gradient(circle at 35% 35%, #ffe066, #ffd600, #e6a800);
      box-shadow: 0 0 18px rgba(255,214,0,0.9), 0 0 6px rgba(0,0,0,0.5);
    }
    .powerup-item.type-big {
      background: radial-gradient(circle at 35% 35%, #80f0ff, #00e5ff, #00a8cc);
      box-shadow: 0 0 18px rgba(0,229,255,0.9), 0 0 6px rgba(0,0,0,0.5);
    }
    @keyframes pwFloat {
      from { transform: translate(-50%, -50%) translateY(0px);  }
      to   { transform: translate(-50%, -50%) translateY(-8px); }
    }
    @keyframes pwPopin {
      from { transform: translate(-50%,-50%) scale(0) rotate(-15deg); }
      to   { transform: translate(-50%,-50%) scale(1) rotate(0deg);   }
    }

    /* Alvo grande */
    #target.big-mode {
      width: 108px !important;
      filter: drop-shadow(0 0 18px rgba(0,229,255,0.9)) drop-shadow(0 4px 10px rgba(0,0,0,0.7));
      transition: width .2s cubic-bezier(.34,1.56,.64,1);
    }

    /* Flash de ativação na tela */
    .powerup-activate-flash {
      position: absolute; inset: 0;
      border-radius: 16px;
      pointer-events: none;
      z-index: 6;
      animation: flashFade .4s ease-out forwards;
    }
    .flash-double { background: rgba(255,214,0,0.18); }
    .flash-big    { background: rgba(0,229,255,0.18); }
    @keyframes flashFade {
      from { opacity: 1; }
      to   { opacity: 0; }
    }

    /* Miss flash */
    .miss-flash {
      position: absolute; pointer-events: none;
      font-family: "Permanent Marker", cursive; font-size: 24px;
      color: #ff5252;
      text-shadow: 2px 2px 0 #7f0000, 0 0 12px rgba(255,82,82,0.9);
      animation: rise .7s ease-out forwards; z-index: 5;
      transform: translate(-50%, -50%); white-space: nowrap;
    }
    .miss-screen-flash {
      position: absolute; inset: 0; border-radius: 16px;
      pointer-events: none; z-index: 6;
      background: rgba(255,50,50,0.15);
      animation: flashFade .35s ease-out forwards;
    }
  `;
  document.head.appendChild(style);
})();

// ── Criar HUD de power-ups ─────────────────────────────────────────────────
(function createPowerupHUD(){
  const hud = document.getElementById('hud');
  if(!hud) return;
  const pw = document.createElement('div');
  pw.id = 'powerup-hud';
  hud.after(pw);
})();

// ── Chicletão idle bounce animation ───────────────────────────────────────
function startBounce(){
  cancelAnimationFrame(bounceRaf);
  let t=0;
  function frame(){
    t+=0.055;
    const sy = 1 + Math.sin(t)*0.045;
    const sx = 1 - Math.sin(t)*0.025;
    const r  = Math.sin(t*0.65)*6;
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
  const marginX=50, marginY=80;
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

// ── Power-up: exibir badge no HUD ─────────────────────────────────────────
function showPowerupBadge(type){
  const hudPw = document.getElementById('powerup-hud');
  if(!hudPw) return;

  const id = 'badge-' + type;
  let badge = document.getElementById(id);
  if(badge) badge.remove();

  badge = document.createElement('div');
  badge.id = id;
  badge.className = 'powerup-badge' + (type==='big' ? ' big-badge' : '');

  const icon = type==='double' ? '2✕' : '🔵';
  const label = type==='double' ? 'DUPLO' : 'GIGANTE';

  badge.innerHTML = `
    <span>${icon}</span>
    <div>
      <div style="font-size:13px;font-weight:bold;letter-spacing:1px">${label}</div>
      <div class="powerup-timer-bar"><div class="powerup-timer-fill" id="fill-${type}" style="width:100%"></div></div>
    </div>
  `;
  hudPw.appendChild(badge);

  // Animar a barra de progresso
  const fill = document.getElementById('fill-' + type);
  const start = Date.now();
  function tick(){
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 100 - (elapsed / POWERUP_DURATION)*100);
    if(fill) fill.style.width = pct + '%';
    if(pct > 0) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function removePowerupBadge(type){
  const badge = document.getElementById('badge-' + type);
  if(badge) badge.remove();
}

// ── Power-up: ativar efeitos ───────────────────────────────────────────────
function activateDouble(){
  doublePoints = true;
  clearTimeout(doubleTimeout);
  playSfx('powerup');
  showPowerupBadge('double');

  // Flash na tela
  const fl = document.createElement('div');
  fl.className = 'powerup-activate-flash flash-double';
  gameArea.appendChild(fl);
  setTimeout(() => fl.remove(), 400);

  // Hit flash de ativação
  const msg = document.createElement('div');
  msg.className = 'hit-flash';
  msg.textContent = '2X PONTOS!';
  msg.style.cssText = `left:50%;top:40%;font-size:26px;color:#ffd600;text-shadow:2px 2px 0 #b8860b,0 0 12px rgba(255,214,0,0.9);`;
  gameArea.appendChild(msg);
  setTimeout(() => msg.remove(), 800);

  doubleTimeout = setTimeout(() => {
    doublePoints = false;
    removePowerupBadge('double');
  }, POWERUP_DURATION);
}

function activateBig(){
  bigTarget = true;
  clearTimeout(bigTimeout);
  playSfx('powerup');
  target.classList.add('big-mode');
  showPowerupBadge('big');

  // Flash na tela
  const fl = document.createElement('div');
  fl.className = 'powerup-activate-flash flash-big';
  gameArea.appendChild(fl);
  setTimeout(() => fl.remove(), 400);

  // Hit flash de ativação
  const msg = document.createElement('div');
  msg.className = 'hit-flash';
  msg.textContent = 'ALVO GIGANTE!';
  msg.style.cssText = `left:50%;top:40%;font-size:26px;color:#00e5ff;text-shadow:2px 2px 0 #006080,0 0 12px rgba(0,229,255,0.9);`;
  gameArea.appendChild(msg);
  setTimeout(() => msg.remove(), 800);

  bigTimeout = setTimeout(() => {
    bigTarget = false;
    target.classList.remove('big-mode');
    removePowerupBadge('big');
  }, POWERUP_DURATION);
}

// ── Power-up: spawnar ícone no game-area ───────────────────────────────────
function spawnPowerup(){
  if(!running) return;

  // Escolhe aleatoriamente qual power-up spawnar (só um ativo por vez)
  const available = [];
  if(!doublePoints) available.push('double');
  if(!bigTarget)    available.push('big');
  if(!available.length) {
    schedulePowerup();
    return;
  }

  const type = available[Math.floor(Math.random() * available.length)];
  const marginX = 60, marginY = 60;
  const aW = gameArea.clientWidth, aH = gameArea.clientHeight;
  const x = marginX + Math.random() * (aW - marginX*2);
  const y = marginY + Math.random() * (aH - marginY*2);

  const pw = document.createElement('div');
  pw.className = `powerup-item type-${type}`;
  pw.style.left = x + 'px';
  pw.style.top  = y + 'px';
  pw.dataset.type = type;
  pw.innerHTML = type === 'double' ? '⚡' : '🎯';

  gameArea.appendChild(pw);

  // Remover automaticamente após 4s se não clicado
  const autoRemove = setTimeout(() => {
    if(pw.parentNode) pw.remove();
    schedulePowerup();
  }, 4000);

  pw.addEventListener('click', e => {
    if(!running) return;
    e.stopPropagation();
    clearTimeout(autoRemove);
    pw.remove();
    if(type === 'double') activateDouble();
    else                  activateBig();
    schedulePowerup();
  });

  schedulePowerup();
}

function schedulePowerup(){
  clearTimeout(powerupTimeout);
  if(!running) return;
  const delay = POWERUP_INTERVAL_MIN + Math.random() * (POWERUP_INTERVAL_MAX - POWERUP_INTERVAL_MIN);
  powerupTimeout = setTimeout(spawnPowerup, delay);
}

// ── Click target ──────────────────────────────────────────────────────────
target.addEventListener('click',e=>{
  if(!running)return;
  e.stopPropagation();
  clearTimeout(hideTimeout);
  target.style.display='none';
  stopBounce();

  const mult = doublePoints ? 2 : 1;
  const pts = 15 * level * mult;
  score += pts;
  scoreEl.textContent = score;

  playSfx('hit');

  const fl=document.createElement('div');
  fl.className='hit-flash';
  fl.textContent = (doublePoints ? '⚡' : '') + '+' + pts;
  fl.style.left=lastX+'px'; fl.style.top=(lastY-60)+'px';
  if(doublePoints) fl.style.cssText += ';color:#ffd600;text-shadow:2px 2px 0 #b8860b,0 0 12px rgba(255,214,0,0.9);';
  gameArea.appendChild(fl); setTimeout(()=>fl.remove(),750);

  const newLevel=Math.min(6,1+Math.floor(score/60));
  if(newLevel>level){
    level=newLevel; levelEl.textContent=level;
    playSfx('levelup');
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

// ── Limpar power-ups ───────────────────────────────────────────────────────
function clearPowerups(){
  doublePoints = false;
  bigTarget    = false;
  clearTimeout(doubleTimeout);
  clearTimeout(bigTimeout);
  clearTimeout(powerupTimeout);
  target.classList.remove('big-mode');

  // Remover badges do HUD
  const hudPw = document.getElementById('powerup-hud');
  if(hudPw) hudPw.innerHTML = '';

  // Remover ícones soltos no game-area
  document.querySelectorAll('.powerup-item').forEach(el => el.remove());
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
  clearPowerups();
  running=true;
  playMusic();
  spawnTarget();
  startTimer();
  schedulePowerup();
}

// ── End ───────────────────────────────────────────────────────────────────
function endGame(){
  running=false; clearInterval(timerInterval); clearTimeout(hideTimeout);
  stopBounce(); target.style.display='none';
  stopMusic();
  clearPowerups();
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

// ── Miss (clique fora do alvo) ─────────────────────────────────────────────
gameArea.addEventListener('click', e => {
  if(!running) return;
  // Ignora cliques que vieram do target ou de power-ups (já têm stopPropagation)
  if(e.target !== gameArea && !e.target.classList.contains('game-bg')) return;

  const MISS_PTS = 5;
  score = Math.max(0, score - MISS_PTS);
  scoreEl.textContent = score;
  playMiss();

  // Flash vermelho na tela
  const fl = document.createElement('div');
  fl.className = 'miss-screen-flash';
  gameArea.appendChild(fl);
  setTimeout(() => fl.remove(), 350);

  // Texto -5 na posição do clique
  const rect = gameArea.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const msg = document.createElement('div');
  msg.className = 'miss-flash';
  msg.textContent = '-' + MISS_PTS;
  msg.style.left = mx + 'px';
  msg.style.top  = my + 'px';
  gameArea.appendChild(msg);
  setTimeout(() => msg.remove(), 700);
});
