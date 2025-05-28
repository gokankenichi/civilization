const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const turnDisplay = document.getElementById("turnDisplay");
const nextTurnBtn = document.getElementById("nextTurnBtn");
const buildMenu = document.getElementById("buildMenu");
const unitMenu = document.getElementById("unitMenu");

const cols = 60;
const rows = 36;
const tileSizeX = canvas.width / cols;
const tileSizeY = canvas.height / rows;

let currentTurn = 1;

let selectedUnit = null;
const unitHasMoved = new Set();

const enemy = {
  city: {
    x: 0,
    y: 0,
    population: 1,
    facilities: ["兵舎"]
  },
  units: []
};

const terrainTypes = [
  { name: "海", color: "#4060d0" },
  { name: "平原", color: "#88c070" },
  { name: "森", color: "#336633" },
  { name: "山", color: "#888888" }
];

const facilityDefinitions = [
  { name: "畑", requiredPopulation: 2, effect: "人口+1/ターン" },
  { name: "兵舎", requiredPopulation: 4, effect: "ユニット訓練可能" },
  { name: "市場", requiredPopulation: 6, effect: "収入増加" }
];

const player = {
  city: {
    x: 0,
    y: 0,
    population: 1,
    facilities: []
  },
  units: []
};

// ===== 地形生成 =====
function valueNoise2D(x, y, seed = 0) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(a, b, t) {
  t = t * t * (3 - 2 * t);
  return a * (1 - t) + b * t;
}

function smoothNoise(x, y, scale = 0.1, seed = 0) {
  const fx = x * scale;
  const fy = y * scale;
  const x0 = Math.floor(fx), x1 = x0 + 1;
  const y0 = Math.floor(fy), y1 = y0 + 1;
  const sx = fx - x0, sy = fy - y0;
  const n00 = valueNoise2D(x0, y0, seed);
  const n10 = valueNoise2D(x1, y0, seed);
  const n01 = valueNoise2D(x0, y1, seed);
  const n11 = valueNoise2D(x1, y1, seed);
  const ix0 = smoothstep(n00, n10, sx);
  const ix1 = smoothstep(n01, n11, sx);
  return smoothstep(ix0, ix1, sy);
}

function generateMap(seed = 0) {
  const map = [];
  const scale = 0.1;
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const noiseVal = smoothNoise(x, y, scale, seed);
      let terrainIndex = 0;
      if (noiseVal < 0.4) terrainIndex = 0;
      else if (noiseVal < 0.6) terrainIndex = 1;
      else if (noiseVal < 0.8) terrainIndex = 2;
      else terrainIndex = 3;
      row.push(terrainIndex);
    }
    map.push(row);
  }
  return map;
}

function placePlayer(map) {
  let found = false;
  let x = 0, y = 0;
  while (!found) {
    x = Math.floor(Math.random() * cols);
    y = Math.floor(Math.random() * rows);
    if (map[y][x] !== 0) found = true;
  }
  return { city: { x, y } };
}

function placeEnemy(map, playerCity) {
  let found = false;
  let x = 0, y = 0;
  while (!found) {
    x = Math.floor(Math.random() * cols);
    y = Math.floor(Math.random() * rows);
    const dist = Math.abs(x - playerCity.x) + Math.abs(y - playerCity.y);
    if (map[y][x] !== 0 && dist > 15) found = true;
  }
  return { city: { x, y } };
}


function drawMap(map, player) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const terrain = terrainTypes[map[y][x]];
      ctx.fillStyle = terrain.color;
      ctx.fillRect(x * tileSizeX, y * tileSizeY, tileSizeX, tileSizeY);
    }
  }

  // 都市
  ctx.font = `${tileSizeY * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";
  ctx.fillText("🏰", player.city.x * tileSizeX + tileSizeX / 2, player.city.y * tileSizeY + tileSizeY / 2);

  // ユニットたち
  ctx.fillStyle = "red";
  for (const unit of player.units) {
    ctx.fillText("⚔", unit.x * tileSizeX + tileSizeX / 2, unit.y * tileSizeY + tileSizeY / 2);
  }

  // 敵の都市
  ctx.fillStyle = "black";
  ctx.fillText("🏰", enemy.city.x * tileSizeX + tileSizeX / 2, enemy.city.y * tileSizeY + tileSizeY / 2);

  // 敵のユニット
  ctx.fillStyle = "orange";
  for (const unit of enemy.units) {
    ctx.fillText("⚔", unit.x * tileSizeX + tileSizeX / 2, unit.y * tileSizeY + tileSizeY / 2);
  }

  // 情報
  ctx.fillStyle = "yellow";
  ctx.font = "14px sans-serif";
  ctx.fillText(`人口: ${player.city.population}`, player.city.x * tileSizeX + tileSizeX / 2, player.city.y * tileSizeY - 5);

  if (player.city.facilities.length > 0) {
    ctx.fillStyle = "lightgreen";
    ctx.font = "12px sans-serif";
    ctx.fillText(`施設: ${player.city.facilities.join(", ")}`, player.city.x * tileSizeX + tileSizeX / 2, player.city.y * tileSizeY + tileSizeY - 5);
  }

  if (selectedUnit) {
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      selectedUnit.x * tileSizeX,
      selectedUnit.y * tileSizeY,
      tileSizeX,
      tileSizeY
    );
  }
}

// ===== UI 更新 =====
function updateBuildMenu() {
  buildMenu.innerHTML = "";

  facilityDefinitions.forEach(facility => {
    const owned = player.city.facilities.includes(facility.name);
    const canBuild = player.city.population >= facility.requiredPopulation;

    const btn = document.createElement("button");
    btn.className = "buildBtn";
    btn.disabled = !canBuild || owned;
    btn.textContent = `${facility.name}（人口${facility.requiredPopulation}）`;

    btn.addEventListener("click", () => {
      if (!owned && canBuild) {
        player.city.facilities.push(facility.name);
        console.log(`施設「${facility.name}」を建設しました！`);
        drawMap(worldMap, player);
        updateBuildMenu();
        updateUnitMenu();
      }
    });

    buildMenu.appendChild(btn);
  });
}

function updateUnitMenu() {
  unitMenu.innerHTML = "";

  if (player.city.facilities.includes("兵舎")) {
    const btn = document.createElement("button");
    btn.className = "unitBtn";
    btn.textContent = "戦士を生産";

    const existsUnit = player.units.some(u => u.x === player.city.x && u.y === player.city.y);
    btn.disabled = existsUnit;

    btn.addEventListener("click", () => {
      if (!existsUnit) {
        player.units.push({
          x: player.city.x,
          y: player.city.y,
          type: "戦士"
        });
        console.log("戦士を生産しました！");
        drawMap(worldMap, player);
        updateUnitMenu();
      }
    });

    unitMenu.appendChild(btn);
  }
}

// ===== ターン進行 =====
function nextTurn() {
  unitHasMoved.clear();
  selectedUnit = null;
  currentTurn++;
  turnDisplay.textContent = `ターン: ${currentTurn}`;

  // プレイヤー成長処理
  let growth = 1;
  if (player.city.facilities.includes("畑")) growth += 1;
  player.city.population += growth;

  // 敵ターン処理
  enemyTurn();

  drawMap(worldMap, player);
  updateBuildMenu();
  updateUnitMenu();
}


function enemyTurn() {
  // 毎ターン1人ユニット生産（条件：都市にユニットいない）
  const hasUnit = enemy.units.some(u => u.x === enemy.city.x && u.y === enemy.city.y);
  if (!hasUnit) {
    enemy.units.push({ x: enemy.city.x, y: enemy.city.y, type: "戦士" });
  }

  for (const unit of enemy.units) {
    const dx = player.city.x - unit.x;
    const dy = player.city.y - unit.y;

    const moveX = dx !== 0 ? Math.sign(dx) : 0;
    const moveY = dy !== 0 ? Math.sign(dy) : 0;

    const tryX = unit.x + moveX;
    const tryY = unit.y + moveY;

    // プレイヤーユニットと重ならない、海でない、マップ内
    if (
      tryX >= 0 && tryX < cols &&
      tryY >= 0 && tryY < rows &&
      worldMap[tryY][tryX] !== 0 &&
      !enemy.units.some(u => u.x === tryX && u.y === tryY) &&
      !player.units.some(u => u.x === tryX && u.y === tryY)
    ) {
      unit.x = tryX;
      unit.y = tryY;
    }
  }
}


// ===== 初期化 =====
const seed = Math.random() * 1000;
const worldMap = generateMap(seed);
const placement = placePlayer(worldMap);
player.city.x = placement.city.x;
player.city.y = placement.city.y;

const enemyPlacement = placeEnemy(worldMap, player.city);
enemy.city.x = enemyPlacement.city.x;
enemy.city.y = enemyPlacement.city.y;

drawMap(worldMap, player);
updateBuildMenu();
updateUnitMenu();

nextTurnBtn.addEventListener("click", nextTurn);


canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const tx = Math.floor(mouseX / tileSizeX);
  const ty = Math.floor(mouseY / tileSizeY);

  if (selectedUnit) {
    const dx = Math.abs(tx - selectedUnit.x);
    const dy = Math.abs(ty - selectedUnit.y);
    const inRange = (dx + dy === 1); // 上下左右1マス

    const terrain = worldMap[ty][tx];
    const destinationOccupied = player.units.some(u => u.x === tx && u.y === ty);
    const hasMoved = unitHasMoved.has(selectedUnit);

    if (inRange && terrain !== 0 && !destinationOccupied && !hasMoved) {
      selectedUnit.x = tx;
      selectedUnit.y = ty;
      unitHasMoved.add(selectedUnit);
      selectedUnit = null;
    } else {
      selectedUnit = null;
    }
  } else {
    // ユニット選択
    const clickedUnit = player.units.find(u => u.x === tx && u.y === ty);
    if (clickedUnit) {
      selectedUnit = clickedUnit;
    }
  }

  drawMap(worldMap, player);
});
