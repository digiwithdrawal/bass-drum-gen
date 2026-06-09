const $=id=>document.getElementById(id);
const bpmSlider=$("bpmSlider"),complexitySlider=$("complexitySlider"),ghostSlider=$("ghostSlider"),digiSlider=$("digiSlider"),styleSelect=$("styleSelect");
const bpmReadout=$("bpmReadout"),statusText=$("statusText"),sequencerGrid=$("sequencerGrid");
const canvas=$("visualizer"),ctx=canvas.getContext("2d");

const STEPS=32;
let currentStep=0,loop=null,audioReady=false;
let drumSynths,bassSynth,padSynth,leadSynth,fxSynth;

const state={
  bpm:170,complexity:68,ghost:58,digi:60,style:"y2k",
  tracks:{
    drums:{muted:false,locked:false,volume:.95,pattern:[]},
    bass:{muted:false,locked:false,volume:.85,pattern:[]},
    pads:{muted:false,locked:false,volume:.6,pattern:[]},
    lead:{muted:false,locked:false,volume:.55,pattern:[]},
    fx:{muted:false,locked:false,volume:.5,pattern:[]}
  }
};

function chance(p){return Math.random()*100<p}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function rand(a,b){return Math.random()*(b-a)+a}

function styleSettings(){
  return {
    y2k:{drum:1,bass:1,lead:1.15,pad:.8,fx:1.1},
    atmospheric:{drum:.75,bass:.7,lead:.65,pad:1.35,fx:1},
    liquid:{drum:.8,bass:.85,lead:.75,pad:1.2,fx:.75},
    dark:{drum:1,bass:1.2,lead:.65,pad:.75,fx:1.25},
    breaky:{drum:1.35,bass:.85,lead:.8,pad:.55,fx:1}
  }[state.style];
}

function setupSequencerGrid(){
  sequencerGrid.innerHTML="";
  for(let r=0;r<5;r++)for(let i=0;i<STEPS;i++){
    const c=document.createElement("div");
    c.className="seq-cell";
    sequencerGrid.appendChild(c);
  }
}

function paintSequencer(){
  const names=["drums","bass","pads","lead","fx"];
  [...sequencerGrid.children].forEach((cell,index)=>{
    const row=Math.floor(index/STEPS),step=index%STEPS,track=names[row];
    cell.classList.toggle("active",!!state.tracks[track].pattern[step]);
    cell.style.outline=step===currentStep?"2px solid white":"none";
  });
}

function drawVisualizer(){
  requestAnimationFrame(drawVisualizer);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const playing=audioReady&&Tone.Transport.state==="started";
  const bars=64,w=canvas.width/bars;

  for(let i=0;i<bars;i++){
    const h=playing?(Math.random()*110+10):(Math.random()*8);
    ctx.fillStyle=i%3===0?"#39ff14":i%3===1?"#ff27d8":"#fff";
    ctx.fillRect(i*w,canvas.height-h,w-2,h);
  }
}

function setupAudio(){
  const master=new Tone.Volume(-8).toDestination();
  const reverb=new Tone.Reverb({decay:2.6,wet:.24}).connect(master);
  const delay=new Tone.FeedbackDelay("8n",.25).connect(master);
  const crusher=new Tone.BitCrusher(7).connect(master);

  drumSynths={
    kick:new Tone.MembraneSynth({pitchDecay:.035,octaves:5,envelope:{attack:.001,decay:.22,sustain:.01,release:.12}}).connect(master),
    snare:new Tone.NoiseSynth({noise:{type:"white"},envelope:{attack:.001,decay:.105,sustain:0}}).connect(master),
    hat:new Tone.MetalSynth({frequency:320,envelope:{attack:.001,decay:.04,release:.02},harmonicity:5.1,modulationIndex:18,resonance:3600,octaves:1.5}).connect(master),
    ghost:new Tone.NoiseSynth({noise:{type:"pink"},envelope:{attack:.001,decay:.04,sustain:0}}).connect(master)
  };

  bassSynth=new Tone.MonoSynth({
    oscillator:{type:"sawtooth"},
    filter:{Q:4,type:"lowpass",rolloff:-24},
    envelope:{attack:.006,decay:.13,sustain:.45,release:.1},
    filterEnvelope:{attack:.005,decay:.12,sustain:.25,release:.07,baseFrequency:55,octaves:3.2}
  }).connect(crusher);

  padSynth=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"fatsawtooth"},envelope:{attack:.35,decay:.5,sustain:.8,release:1.4}}).connect(reverb);
  leadSynth=new Tone.Synth({oscillator:{type:"square"},envelope:{attack:.004,decay:.12,sustain:.18,release:.14}}).connect(delay);
  fxSynth=new Tone.Synth({oscillator:{type:"triangle"},envelope:{attack:.02,decay:.2,sustain:.1,release:.35}}).connect(delay);
}

function generateDrums(){
  const s=styleSettings(),p=Array(STEPS).fill(null);
  const comp=state.complexity*s.drum,ghost=state.ghost*s.drum;

  for(let i=0;i<STEPS;i++){
    const e=[];
    if([0,8,16,24].includes(i))e.push("kick");
    if([4,12,20,28].includes(i))e.push("snare");
    if(i%2===0&&chance(58+comp*.28))e.push("hat");
    if([6,14,22,30].includes(i)&&chance(comp*.9))e.push("kick");
    if([3,7,11,15,19,23,27,31].includes(i)&&chance(ghost*.8))e.push("ghost");
    if(state.style==="breaky"&&chance(12))e.push(pick(["kick","snare","ghost"]));
    if(e.length>3)e.length=3;
    p[i]=e.length?e:null;
  }

  return p;
}

function generateBass(){
  const s=styleSettings(),p=Array(STEPS).fill(null);
  const notes=state.style==="dark"?["C2","Bb1","Db2","Eb2","F1"]:["C2","Eb2","F2","G2","Bb1","C3"];

  for(let i=0;i<STEPS;i++){
    if(i%4===0||chance(state.complexity*.14*s.bass))p[i]=pick(notes);
  }

  return p;
}

function generatePads(){
  const s=styleSettings(),p=Array(STEPS).fill(null);
  const chords=[
    ["C4","Eb4","G4","Bb4"],
    ["Ab3","C4","Eb4","G4"],
    ["F3","Ab3","C4","Eb4"],
    ["Bb3","D4","F4","Ab4"]
  ];

  p[0]=pick(chords);
  if(chance(80*s.pad))p[16]=pick(chords);
  if(state.style==="atmospheric"&&chance(60))p[24]=pick(chords);

  return p;
}

function generateLead(){
  const s=styleSettings(),p=Array(STEPS).fill(null);
  const notes=["C5","D5","Eb5","F5","G5","Bb5","C6"];
  let hits=0,maxHits=Math.floor(4+(state.digi/20)*s.lead);

  for(let i=1;i<STEPS;i+=2){
    if(hits<maxHits&&chance(state.digi*.16*s.lead)){
      p[i]=pick(notes);
      hits++;
    }
  }

  return p;
}

function generateFX(){
  const s=styleSettings(),p=Array(STEPS).fill(null);
  [0,15,16,31].forEach(step=>{
    if(chance(60*s.fx))p[step]=pick(["C6","G6","Bb5"]);
  });
  return p;
}

function generatePatterns(){
  const wasPlaying=audioReady&&Tone.Transport.state==="started";

  if(wasPlaying){
    Tone.Transport.stop();
    currentStep=0;
  }

  for(const t of Object.keys(state.tracks)){
    if(state.tracks[t].locked)continue;

    if(t==="drums")state.tracks[t].pattern=generateDrums();
    if(t==="bass")state.tracks[t].pattern=generateBass();
    if(t==="pads")state.tracks[t].pattern=generatePads();
    if(t==="lead")state.tracks[t].pattern=generateLead();
    if(t==="fx")state.tracks[t].pattern=generateFX();
  }

  paintSequencer();
  updateTrackDots();
  statusText.textContent=`${styleSelect.options[styleSelect.selectedIndex].text.toUpperCase()} GENERATED`;

  if(wasPlaying)Tone.Transport.start("+0.05");
}

function playStep(time){
  const tr=state.tracks;

  if(!tr.drums.muted){
    const events=tr.drums.pattern[currentStep];
    if(events)events.forEach(e=>{
      if(e==="kick")drumSynths.kick.triggerAttackRelease("C1","16n",time,tr.drums.volume);
      if(e==="snare")drumSynths.snare.triggerAttackRelease("16n",time,tr.drums.volume*.7);
      if(e==="hat")drumSynths.hat.triggerAttackRelease("C5","32n",time,tr.drums.volume*.28);
      if(e==="ghost")drumSynths.ghost.triggerAttackRelease("32n",time,tr.drums.volume*.18);
    });
  }

  if(!tr.bass.muted&&tr.bass.pattern[currentStep])bassSynth.triggerAttackRelease(tr.bass.pattern[currentStep],"8n",time,tr.bass.volume);
  if(!tr.pads.muted&&tr.pads.pattern[currentStep])padSynth.triggerAttackRelease(tr.pads.pattern[currentStep],"2n",time,tr.pads.volume*.38);
  if(!tr.lead.muted&&tr.lead.pattern[currentStep])leadSynth.triggerAttackRelease(tr.lead.pattern[currentStep],"16n",time,tr.lead.volume*.5);
  if(!tr.fx.muted&&tr.fx.pattern[currentStep])fxSynth.triggerAttackRelease(tr.fx.pattern[currentStep],"16n",time,tr.fx.volume*.3);

  paintSequencer();
  currentStep=(currentStep+1)%STEPS;
}

async function play(){
  if(!audioReady){
    await Tone.start();
    setupAudio();
    audioReady=true;
  }

  Tone.Transport.bpm.value=state.bpm;

  if(!loop){
    loop=new Tone.Loop(playStep,"16n");
    loop.start(0);
  }

  Tone.Transport.start();
  statusText.textContent="PLAYING";
}

function pause(){
  if(audioReady)Tone.Transport.pause();
  statusText.textContent="PAUSED";
}

function stop(){
  if(audioReady)Tone.Transport.stop();
  currentStep=0;
  paintSequencer();
  statusText.textContent="STOPPED";
}

function updateTrackDots(){
  document.querySelectorAll(".track-row").forEach(row=>{
    const t=row.dataset.track,dots=row.querySelector(".track-dots");
    const count=state.tracks[t].pattern.filter(Boolean).length;
    dots.style.opacity=state.tracks[t].muted?".2":".85";
    dots.style.backgroundSize=`${Math.max(8,90/Math.max(1,count))}px 10px`;
  });
}

function downloadMidi(){
  if(!state.tracks.drums.pattern.length)generatePatterns();

  const tracks=[];
  const ticks=120;
  const map={kick:"C2",snare:"D2",hat:"F#2",ghost:"D#2"};

  for(const [name,data] of Object.entries(state.tracks)){
    if(data.muted)continue;

    const mt=new MidiWriter.Track();
    mt.setTempo(state.bpm);
    mt.addTrackName(name.toUpperCase());

    data.pattern.forEach((event,step)=>{
      if(!event)return;

      const startTick=step*ticks;

      if(name==="drums"){
        event.forEach(d=>{
          mt.addEvent(new MidiWriter.NoteEvent({
            pitch:[map[d]],
            duration:"T60",
            startTick,
            velocity:90
          }));
        });
      }else if(name==="pads"){
        mt.addEvent(new MidiWriter.NoteEvent({
          pitch:event,
          duration:"T960",
          startTick,
          velocity:55
        }));
      }else{
        mt.addEvent(new MidiWriter.NoteEvent({
          pitch:[event],
          duration:"T240",
          startTick,
          velocity:75
        }));
      }
    });

    tracks.push(mt);
  }

  if(!tracks.length){
    statusText.textContent="UNMUTE AT LEAST ONE TRACK";
    return;
  }

  try{
    const writer=new MidiWriter.Writer(tracks);
    const midiData=writer.buildFile();

    const blob=new Blob([midiData],{type:"audio/midi"});
    const url=URL.createObjectURL(blob);
    const filename=`drum-and-gen-${state.style}-${state.bpm}bpm.mid`;

    const a=document.createElement("a");
    a.href=url;
    a.download=filename;
    a.style.display="none";

    document.body.appendChild(a);
    a.click();

    setTimeout(()=>{
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },1000);

    statusText.textContent="MIDI EXPORTED";
  }catch(err){
    console.error(err);
    statusText.textContent="MIDI EXPORT FAILED";
    alert("MIDI export failed. Check the browser console for details.");
  }
}

function hookControls(){
  bpmSlider.oninput=()=>{
    state.bpm=+bpmSlider.value;
    bpmReadout.textContent=`${state.bpm} BPM`;
    if(audioReady)Tone.Transport.bpm.value=state.bpm;
  };

  complexitySlider.oninput=()=>state.complexity=+complexitySlider.value;
  ghostSlider.oninput=()=>state.ghost=+ghostSlider.value;
  digiSlider.oninput=()=>state.digi=+digiSlider.value;

  styleSelect.onchange=()=>{
    state.style=styleSelect.value;
    generatePatterns();
  };

  $("playBtn").onclick=play;
  $("pauseBtn").onclick=pause;
  $("stopBtn").onclick=stop;
  $("generateBtn").onclick=generatePatterns;

  $("randomBtn").onclick=()=>{
    state.bpm=Math.floor(rand(154,179));
    state.complexity=Math.floor(rand(35,92));
    state.ghost=Math.floor(rand(25,85));
    state.digi=Math.floor(rand(20,90));

    bpmSlider.value=state.bpm;
    complexitySlider.value=state.complexity;
    ghostSlider.value=state.ghost;
    digiSlider.value=state.digi;
    bpmReadout.textContent=`${state.bpm} BPM`;

    generatePatterns();
  };

  $("downloadBtn").onclick=downloadMidi;

  document.querySelectorAll(".track-row").forEach(row=>{
    const t=row.dataset.track;
    const m=row.querySelector(".mute-btn");
    const l=row.querySelector(".lock-btn");
    const v=row.querySelector(".vol");

    m.onclick=()=>{
      state.tracks[t].muted=!state.tracks[t].muted;
      m.classList.toggle("muted",state.tracks[t].muted);
      updateTrackDots();
    };

    l.onclick=()=>{
      state.tracks[t].locked=!state.tracks[t].locked;
      l.classList.toggle("locked",state.tracks[t].locked);
    };

    v.oninput=()=>state.tracks[t].volume=+v.value;
  });
}

setupSequencerGrid();
hookControls();
generatePatterns();
drawVisualizer();
