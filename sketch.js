// =================================================================
// [전역 변수 및 시스템 설정]
// =================================================================
let video;
let cWidth, cHeight;

// ★ 전시 흐름 제어 변수
let currentState = 'IDLE'; 
let filterTimer = 0;
const FILTER_DURATION = 16000; // ★ 16초 유지로 수정

// ★ 스캔 및 트랜지션 연출용 변수
let isDetecting = false; 
let detectionTimer = 0;
let currentLabel = "";
let transitionAlpha = 0; 
let transitionColor = 255; 
let transitionMode = 'NONE'; 
let nextState = "";          

// ★ AI 모델들 (인식기)
let imageModelURL = 'https://teachablemachine.withgoogle.com/models/v5TU7kgIZ/';
let classifier, faceMesh, handPose, bodypix;
let faces = [], hands = [], segmentation;
let isModelReady = false;

// [브랜드별 변수]
let marlboroTotalImages = 16;
let imgs_Bg = [], imgs_Deco = [], imgs_Static3 = [], imgs_Rare = [], imgs_Text = [], imgs_Common = [], imgs_Hand = [];
let configs_Bg = [], configs_Deco = [], configs_Static3 = [], configs_Rare = [], configs_Text = [], configs_Common = [], configs_Hand = [];
let revealQueue = [], revealedCount = 0, REVEAL_SPEED = 3, placedItems = [];
let MOUTH_OPEN_THRESHOLD = 10;
let marlboroTexts = ["RED", "WILD", "WARNING", "가오", "19", "SMOKE", "쩐내", "Strong", "말레"];
let faceSafeZone = 0.45;

let bgImg, sparkles = [], dolphinImgs = [], dolphins = [];
const NUM_SPARKLES = 120, MAX_DOLPHINS = 12;
let esseEmojiShapes = ['🧚','🍈','👁️','🫧','🥄','🚿','🟢','🧷','🔫','🏖️'], esseParticles = [];
let historyFrames = [], floatingCircles = [];
const MAX_HISTORY = 40, NUM_CIRCLES = 7;

class FloatingCircle {
  constructor() {
    this.r = random(60, 160);
    this.x = random(this.r, windowHeight * 0.95 * (9/16) - this.r);
    this.y = random(this.r, windowHeight * 0.95 - this.r);
    this.vx = random(-1.5, 1.5); this.vy = random(-1.5, 1.5);
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.x < this.r || this.x > width - this.r) this.vx *= -1;
    if (this.y < this.r || this.y > height - this.r) this.vy *= -1;
  }
}

// =================================================================
// [초기 로딩 및 셋업]
// =================================================================
function preload() {
  classifier = ml5.imageClassifier(imageModelURL + 'model.json');
  for (let i = 1; i <= marlboroTotalImages; i++) {
    let filename = 'marlboro_red' + nf(i, 2) + '.png'; 
    let img = loadImage(filename);
    if (i === 9) imgs_Bg.push(img);
    else if (i === 3) imgs_Static3.push(img);
    else if (i <= 2) imgs_Deco.push(img);
    else if (i >= 4 && i <= 6) imgs_Rare.push(img);
    else if (i <= 8) imgs_Text.push(img);
    else if (i === 16) imgs_Hand.push(img);
    else imgs_Common.push(img);
  }
  bgImg = loadImage('bg.jpg');
  for (let i = 1; i <= 5; i++) dolphinImgs.push(loadImage('dolphin0' + i + '.png'));
}

function setup() {
  cHeight = windowHeight * 0.95; cWidth = cHeight * (9 / 16);
  createCanvas(cWidth, cHeight); pixelDensity(1);
  video = createCapture(VIDEO); video.size(640, 480); video.hide();
  classifier.classify(video, gotResult);
  faceMesh = ml5.facemesh(video, () => { console.log("✅ FaceMesh Ready!"); isModelReady = true; });
  faceMesh.on('predict', results => { faces = results; });
  handPose = ml5.handpose(video, () => { console.log("✅ HandPose Ready!"); });
  handPose.on('predict', results => { hands = results; });
  bodypix = ml5.bodyPix(video, { outputStride: 8, segmentationThreshold: 0.5 }, () => {
    bodypix.segment(video, gotBodyPixResults);
  });
  setupMarlboro(); initSparkles();
  for (let i = 0; i < NUM_CIRCLES; i++) floatingCircles.push(new FloatingCircle());
}

function gotBodyPixResults(err, result) {
  if (err) return; segmentation = result;
  if (bodypix) bodypix.segment(video, gotBodyPixResults); 
}

// =================================================================
// [메인 그리기 루프 (Draw)]
// =================================================================
function draw() {
  if (video.width === 0 || !isModelReady) { background(0); return; }

  historyFrames.push(video.get());
  if (historyFrames.length > MAX_HISTORY) historyFrames.shift();
  for (let c of floatingCircles) c.update();

  switch (currentState) {
    case 'IDLE': drawIdleScreen(); break;
    case 'marlboro': drawMarlboroFilter(); break;
    case 'mevius': drawMeviusFilter(); break; 
    case 'esse': drawEsseFilter(); break;
    case 'parliament': drawParliamentFilter(); break;
  }

  // ★ 전환 애니메이션 로직 (속도 상향: 12~15)
  if (transitionMode === 'IN') {
    transitionAlpha += 15; 
    if (transitionAlpha >= 255) {
      transitionAlpha = 255; transitionMode = 'OUT';
      currentState = nextState; filterTimer = millis();
      if (currentState === 'IDLE') { esseParticles = []; dolphins = []; revealedCount = 0; isDetecting = false; }
    }
  } else if (transitionMode === 'OUT') {
    transitionAlpha -= 12; 
    if (transitionAlpha <= 0) { transitionAlpha = 0; transitionMode = 'NONE'; }
  }

  if (transitionAlpha > 0) {
    push(); noStroke(); fill(transitionColor, transitionAlpha); rectMode(CORNER); rect(0, 0, width, height); pop();
  }

  if (currentState !== 'IDLE' && transitionMode === 'NONE') {
    if (millis() - filterTimer > FILTER_DURATION) {
      transitionMode = 'IN'; transitionColor = 0; nextState = 'IDLE';
    }
  }
}

function getScaleInfo() {
  let scaleF = max(width / video.width, height / video.height);
  let w = video.width * scaleF; let h = video.height * scaleF;
  let offsetX = (w - width) / 2; let offsetY = (h - height) / 2;
  return { scaleF, w, h, offsetX, offsetY };
}

function drawIdleScreen() {
  background(0);
  let s = getScaleInfo();
  push(); translate(width / 2, height / 2); scale(-1, 1); imageMode(CENTER); image(video, 0, 0, s.w, s.h); pop();

  if (!isDetecting) {
    push(); fill(255); textAlign(CENTER, CENTER); textSize(16); textStyle(BOLD); textFont('sans-serif');
    drawingContext.shadowBlur = 15; drawingContext.shadowColor = 'black';
    text("카메라에 담뱃갑을 비춰주세요", width / 2, height - 80); pop();
  } else {
    push();
    let boxW = width * 0.45, boxH = width * 0.55;
    let targetX = width / 2, targetY = height / 2;
    if (hands.length > 0) {
      let handKeypoints = hands[0].landmarks;
      targetX = width - (handKeypoints[9][0] * s.scaleF - s.offsetX); targetY = handKeypoints[9][1] * s.scaleF - s.offsetY;
    }
    noFill(); stroke(255, 0, 0); strokeWeight(2); rectMode(CENTER); rect(targetX, targetY, boxW, boxH);
    fill(255, 0, 0); noStroke(); textAlign(LEFT, BOTTOM); textSize(14); textStyle(BOLD); textFont('sans-serif'); 
    text(currentLabel.toUpperCase(), targetX - boxW / 2, targetY - boxH / 2 - 10); pop();

    if (millis() - detectionTimer > 1500 && transitionMode === 'NONE') {
      transitionMode = 'IN'; transitionColor = 255; nextState = currentLabel;
    }
  }
}

function gotResult(error, results) {
  if (error) return;
  if (currentState === 'IDLE') {
    let label = results[0].label.toLowerCase(); 
    if (['marlboro', 'mevius', 'esse', 'parliament'].includes(label) && results[0].confidence > 0.85) {
      if (!isDetecting) { isDetecting = true; currentLabel = label; detectionTimer = millis(); }
    } else { isDetecting = false; }
  }
  classifier.classify(video, gotResult); 
}

// =================================================================
// [1. 말보로 필터 그리기]
// =================================================================
function drawMarlboroFilter() {
  background(255);
  let s = getScaleInfo();
  push(); translate(width / 2, height / 2); scale(-1, 1); imageMode(CENTER); image(video, 0, 0, s.w, s.h); pop();

  // 그라디언트 (첨부 파일 기준: 4단계 컬러스탑)
  push();
  let gradient = drawingContext.createRadialGradient(width/2, height/2, width*0.05, width/2, height/2, height*0.8);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
  drawingContext.fillStyle = gradient; rectMode(CORNER); rect(0, 0, width, height); pop();

  // 입 벌림 감지 (MOUTH_OPEN_THRESHOLD 사용)
  if (faces.length > 0) {
    let kp = faces[0].scaledMesh;
    let mouthDist = dist(kp[13][0], kp[13][1], kp[14][0], kp[14][1]);
    if (mouthDist > MOUTH_OPEN_THRESHOLD) {
      if (revealedCount < revealQueue.length) revealedCount += REVEAL_SPEED;
      let limit = min(floor(revealedCount), revealQueue.length);
      for (let i = 0; i < limit; i++) revealQueue[i].visible = true;
    } else {
      revealedCount = 0;
      for (let i = 0; i < revealQueue.length; i++) revealQueue[i].visible = false;
    }
  }

  // 각 그룹 그리기
  for (let item of configs_Bg) {
    if (!item.visible) continue;
    push(); tint(255, item.alpha); imageMode(CENTER);
    image(item.img, item.x, item.y, item.size * (item.img.width / item.img.height), item.size); pop();
  }
  for (let item of configs_Deco) {
    if (!item.visible) continue;
    push();
    let dx = random(-item.jitterPower, item.jitterPower);
    let dy = random(-item.jitterPower, item.jitterPower);
    translate(item.x + dx, item.y + dy); imageMode(CENTER);
    image(item.img, 0, 0, item.size * (item.img.width / item.img.height), item.size); pop();
  }
  for (let item of configs_Static3) {
    if (!item.visible) continue;
    push(); translate(item.x, item.y); imageMode(CENTER);
    image(item.img, 0, 0, item.size * (item.img.width / item.img.height), item.size); pop();
  }

  marlboroDrawGroup(configs_Rare);
  marlboroDrawGroup(configs_Text);
  marlboroDrawGroup(configs_Common);
  marlboroDrawGroup(configs_Hand);

  // 얼굴 포인트 + 텍스트
  if (faces.length > 0) {
    let points = faces[0].scaledMesh;
    for (let i = 0; i < points.length; i += 12) {
      let fx = width - (points[i][0] * s.scaleF - s.offsetX); let fy = points[i][1] * s.scaleF - s.offsetY;
      fill(255, 0, 0); noStroke(); rectMode(CENTER); rect(fx, fy, 18, 18);
      if (i % 20 == 0) {
        fill(255, 0, 0); textAlign(CENTER, CENTER); textSize(14); textStyle(BOLD); textFont('Courier New');
        text(marlboroTexts[floor(i / 10) % marlboroTexts.length], fx, fy - 20);
      }
    }
  }

  if (revealedCount === 0) drawMarlboroInstruction();
}

// 말보로 안내 문구
function drawMarlboroInstruction() {
  push();
  textFont('Press Start 2P');
  textStyle(NORMAL);
  let blinkAlpha = map(sin(frameCount * 0.08), -1, 1, 50, 255);
  fill(255, 0, 0, blinkAlpha);
  noStroke();
  textSize(14);
  textAlign(CENTER, CENTER);
  text("가까이와서 입을 벌려보세요", width / 2, height * 0.85);
  pop();
}

// [나머지 필터 함수들 유지]
function drawMeviusFilter() {
  background(0); let s = getScaleInfo();
  if (bgImg) { let bgS = max(width / bgImg.width, height / bgImg.height); push(); translate(width/2, height/2); imageMode(CENTER); image(bgImg, 0, 0, bgImg.width*bgS, bgImg.height*bgS); pop(); }
  if (faces.length > 0) { let kp = faces[0].scaledMesh; if (dist(kp[13][0], kp[13][1], kp[14][0], kp[14][1]) > 20) { if (frameCount % 10 === 0 && dolphins.length < MAX_DOLPHINS) dolphins.push(new Dolphin()); } }
  for (let d of dolphins) { d.update(); d.show(); } dolphins = dolphins.filter(d => !d.isFinished());
  if (segmentation && segmentation.backgroundMask) { let img = video.get(); img.mask(segmentation.backgroundMask); push(); translate(width, 0); scale(-1, 1); image(img, -s.offsetX, -s.offsetY, s.w, s.h); pop(); } 
  for (let sp of sparkles) sp.show();
  if (dolphins.length === 0) drawInstruction("가까이와서 입을 벌려보세요", 'sans-serif', color(255));
}

function drawEsseFilter() {
  background(0); let s = getScaleInfo();
  push(); translate(width, 0); scale(-1, 1); image(video, -s.offsetX, -s.offsetY, s.w, s.h); pop();
  if (faces.length > 0) { let kp = faces[0].scaledMesh; if (dist(kp[13][0], kp[13][1], kp[14][0], kp[14][1]) > 22) { for(let i=0; i<2; i++) esseParticles.push(new EsseEmojiParticle(width - (kp[13][0] * s.scaleF - s.offsetX), kp[13][1] * s.scaleF - s.offsetY)); } }
  if (esseParticles.length > 200) esseParticles.splice(0, esseParticles.length - 200); 
  for (let p of esseParticles) { p.update(); p.show(); } esseParticles = esseParticles.filter(p => !p.isFinished());
  if (esseParticles.length < 5) drawInstruction("가까이 와서 입을 벌려보세요", 'sans-serif', color(255));
}

function drawParliamentFilter() {
  background(0); let s = getScaleInfo();
  push(); translate(width, 0); scale(-1, 1); image(video, -s.offsetX, -s.offsetY, s.w, s.h); pop();
  if (faces.length > 0 && dist(faces[0].scaledMesh[13][0], faces[0].scaledMesh[13][1], faces[0].scaledMesh[14][0], faces[0].scaledMesh[14][1]) > 20) {
    push(); drawingContext.beginPath();
    for (let c of floatingCircles) { drawingContext.moveTo(c.x + c.r, c.y); drawingContext.arc(c.x, c.y, c.r, 0, TWO_PI); }
    drawingContext.clip(); translate(width, 0); scale(-1, 1); 
    for (let i = 0; i < historyFrames.length; i++) {
      let sy = i * (height / historyFrames.length);
      let vSy = (sy + s.offsetY) / s.scaleF; let vSh = (height / historyFrames.length) / s.scaleF;
      image(historyFrames[historyFrames.length - 1 - i], -s.offsetX, sy, s.w, (height/historyFrames.length)+1, 0, vSy, video.width, vSh);
    }
    pop();
  } else { drawInstruction("가까이와서 입을 벌려보세요", 'sans-serif', color(255)); }
}

// =================================================================
// [말보로 셋업 및 유틸리티]
// =================================================================
function setupMarlboro() {
  revealQueue = []; placedItems = [];
  configs_Bg = []; configs_Deco = []; configs_Static3 = [];
  configs_Rare = []; configs_Text = []; configs_Common = []; configs_Hand = [];

  // [Step 0] 수동 배치 (Rare, Hand)
  addManualItem(configs_Rare, imgs_Rare[0], width * 0.18, height * 0.13, 80);
  addManualItem(configs_Rare, imgs_Rare[1], width * 0.1, height * 0.2, 70);
  if (imgs_Hand.length > 0) addManualItem(configs_Hand, imgs_Hand[0], width * 0.8, height * 0.85, 200);
  addManualItem(configs_Rare, imgs_Rare[2], width * 0.8, height * 0.8, 180);

  // [Step 1] 배경 (Bg)
  for (let i = 0; i < 30; i++) {
    let pos = getBalancedPosition(faceSafeZone * 0.6, 7);
    if (pos) {
      let item = { img: random(imgs_Bg), x: pos.x, y: pos.y, size: 20, alpha: 200, visible: false };
      configs_Bg.push(item); revealQueue.push(item);
    }
  }

  // [Step 2] 정적 장식 (Static3)
  for (let i = 0; i < 3; i++) {
    let pos = getBalancedPosition(faceSafeZone, 90);
    if (pos) {
      let item = { img: random(imgs_Static3), x: pos.x, y: pos.y, size: random(100, 120), visible: false };
      configs_Static3.push(item);
      placedItems.push({ x: pos.x, y: pos.y, radius: 15 });
      revealQueue.push(item);
    }
  }

  // [Step 3] 떨림 장식 (Deco)
  for (let i = 0; i < 20; i++) {
    let pos = getBalancedPosition(faceSafeZone, 10);
    if (pos) {
      let item = { img: random(imgs_Deco), x: pos.x, y: pos.y, size: random(20, 40), jitterPower: 1, visible: false };
      configs_Deco.push(item);
      placedItems.push({ x: pos.x, y: pos.y, radius: 10 });
      revealQueue.push(item);
    }
  }

  // [Step 4] 텍스트 (Text)
  for (let i = 0; i < 4; i++) {
    let pos = getBalancedPosition(faceSafeZone, 200);
    if (pos) {
      let item = { img: random(imgs_Text), x: pos.x, y: pos.y, size: random(25, 40), visible: false };
      configs_Text.push(item);
      placedItems.push({ x: pos.x, y: pos.y, radius: 15 });
      revealQueue.push(item);
    }
  }

  // [Step 5] 일반 (Common)
  for (let i = 0; i < 25; i++) {
    let pos = getBalancedPosition(faceSafeZone, 90);
    if (pos) {
      let item = { img: random(imgs_Common), x: pos.x, y: pos.y, size: random(80, 130), visible: false };
      configs_Common.push(item);
      placedItems.push({ x: pos.x, y: pos.y, radius: 35 });
      revealQueue.push(item);
    }
  }

  shuffle(revealQueue, true);
}

function addManualItem(list, img, x, y, size) {
  let item = { img: img, x: x, y: y, size: size, visible: false };
  list.push(item);
  placedItems.push({ x: x, y: y, radius: size * 0.4 });
  revealQueue.push(item);
}

function getBalancedPosition(safeZoneRatio, minDistance) {
  let centerSafeDist = width * safeZoneRatio;
  for (let i = 0; i < 200; i++) {
    let x = random(0, width);
    let y = random(0, height);
    if (dist(x, y, width / 2, height * 0.45) < centerSafeDist) continue;
    let tooClose = false;
    for (let item of placedItems) {
      if (dist(x, y, item.x, item.y) < (item.radius + minDistance * 0.5)) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x, y };
  }
  return null;
}

function marlboroDrawGroup(cl) {
  for (let it of cl) {
    if (!it.visible) continue;
    push(); imageMode(CENTER);
    image(it.img, it.x, it.y, it.size * (it.img.width / it.img.height), it.size); pop();
  }
}

function drawInstruction(msg, fontType, baseColor) {
  push(); let al = map(sin(frameCount * 0.08), -1, 1, 50, 255); baseColor.setAlpha(al);
  fill(baseColor); noStroke(); textAlign(CENTER, CENTER); textFont(fontType); textSize(14); textStyle(BOLD); text(msg, width/2, height*0.85); pop();
}

function initSparkles() { for (let i = 0; i < NUM_SPARKLES; i++) sparkles.push(new Sparkle()); }

class Sparkle {
  constructor() { this.x = random(width); this.y = random(height); this.bs = random(3, 8); this.ang = random(TWO_PI); this.ts = random(0.02, 0.08); }
  show() {
    let sz = map(sin(this.ang + frameCount * this.ts), -1, 1, this.bs * 0.2, this.bs); let al = map(sin(this.ang + frameCount * this.ts), -1, 1, 30, 255);
    push(); translate(this.x, this.y); noStroke(); fill(255, 255, 255, al); rectMode(CENTER); rect(0, 0, sz, sz * 0.15); rect(0, 0, sz * 0.15, sz); circle(0, 0, sz * 0.4); pop();
  }
}
class Dolphin {
  constructor() { this.img = random(dolphinImgs); this.x = -150; this.y = random(height * 0.2, height * 0.8); this.vx = random(4, 8); this.vy = random(-1, 1); this.sz = random(100, 200); this.al = 0; }
  update() { this.x += this.vx; this.y += this.vy; if (this.al < 255) this.al += 8; }
  show() { push(); translate(this.x, this.y); scale(-1, 1); tint(255, this.al); imageMode(CENTER); image(this.img, 0, 0, this.sz, this.sz * (this.img.height/this.img.width)); pop(); }
  isFinished() { return this.x > width + 200; }
}
class EsseEmojiParticle {
  constructor(x, y) { this.x = x; this.y = y; this.bx = x; this.vy = random(-2, -5); this.ang = random(TWO_PI); this.ss = random(0.02, 0.06); this.sw = random(40, 150); this.sh = random(esseEmojiShapes); this.sz = random(20, 55); this.rot = random(TWO_PI); this.rs = random(-0.02, 0.02); this.al = 255; }
  update() { this.y += this.vy; this.ang += this.ss; this.x = this.bx + sin(this.ang) * this.sw; this.rot += this.rs; this.al -= 2; }
  show() { push(); translate(this.x, this.y); rotate(this.rot); fill(255, this.al); textSize(this.sz); text(this.sh, 0, 0); pop(); }
  isFinished() { return (this.al < 0 || this.y < -50); }
}
function windowResized() { cHeight = windowHeight * 0.95; cWidth = cHeight * (9 / 16); resizeCanvas(cWidth, cHeight); initSparkles(); }