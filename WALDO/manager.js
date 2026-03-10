const imageInput = document.getElementById("imageInput");
const targetNameInput = document.getElementById("targetName");
const radiusInput = document.getElementById("radiusInput");
const radiusLabel = document.getElementById("radiusLabel");
const armTargetBtn = document.getElementById("armTargetBtn");
const clearBtn = document.getElementById("clearBtn");
const saveLocalBtn = document.getElementById("saveLocalBtn");
const exportBtn = document.getElementById("exportBtn");
const targetList = document.getElementById("targetList");
const progress = document.getElementById("progress");
const statusEl = document.getElementById("status");
const canvas = document.getElementById("managerCanvas");
const ctx = canvas.getContext("2d");

const STORAGE_KEY = "waldoGamePackageV1";
const REQUIRED_IMAGE_WIDTH = 1080;
const REQUIRED_IMAGE_HEIGHT = 1800;

const state = {
  image: new Image(),
  imageDataUrl: "",
  hasImage: false,
  imageWidth: 0,
  imageHeight: 0,
  targets: [],
  armedName: "",
};

function setStatus(text, tone = "info") {
  statusEl.textContent = text;
  if (tone === "good") {
    statusEl.style.background = "#e6fcf2";
    statusEl.style.borderColor = "#a8e6c9";
  } else if (tone === "bad") {
    statusEl.style.background = "#ffe9ec";
    statusEl.style.borderColor = "#f4b5be";
  } else {
    statusEl.style.background = "#e9f2ff";
    statusEl.style.borderColor = "#c5dcff";
  }
}

function resetCanvasSize() {
  if (!state.hasImage) {
    canvas.width = canvas.clientWidth || 800;
    canvas.height = Math.max(420, canvas.clientHeight || 420);
    return;
  }

  const boardRect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min(
    boardRect.width / state.imageWidth,
    window.innerHeight * 0.72 / state.imageHeight
  );
  canvas.width = Math.max(300, Math.floor(state.imageWidth * scale));
  canvas.height = Math.max(240, Math.floor(state.imageHeight * scale));
}

function drawPlaceholder() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#44556a";
  ctx.font = "700 22px Assistant, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("העלה תמונה כדי להתחיל הגדרה", canvas.width / 2, canvas.height / 2);
}

function drawTargets() {
  state.targets.forEach((target) => {
    const x = target.x * canvas.width;
    const y = target.y * canvas.height;
    const radius = target.r * Math.min(canvas.width, canvas.height);

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,127,17,0.95)";
    ctx.fillStyle = "rgba(255,127,17,0.16)";
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = "700 14px Assistant, sans-serif";
    ctx.fillStyle = "#9b4f00";
    ctx.textAlign = "center";
    ctx.fillText(target.name, x, y - radius - 8);
  });
}

function draw() {
  resetCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.hasImage) {
    drawPlaceholder();
    return;
  }

  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  drawTargets();
}

function renderTargets() {
  targetList.innerHTML = "";
  progress.textContent = `${state.targets.length} / ${state.targets.length} יעדים`;

  state.targets.forEach((target) => {
    const li = document.createElement("li");
    const label = document.createElement("small");
    label.textContent = target.name;
    li.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.type = "button";
    removeBtn.textContent = "מחיקה";
    removeBtn.addEventListener("click", () => {
      state.targets = state.targets.filter((t) => t.id !== target.id);
      renderTargets();
      draw();
    });
    li.appendChild(removeBtn);
    targetList.appendChild(li);
  });
}

function normalizePoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

function addTarget(point) {
  const name = state.armedName.trim();
  if (!name) {
    setStatus("יש להזין שם דמות לפני הוספת יעד.", "bad");
    return;
  }

  const radiusNorm = Number(radiusInput.value) / 100;
  state.targets.push({
    id: crypto.randomUUID(),
    name,
    x: point.x,
    y: point.y,
    r: radiusNorm,
  });

  state.armedName = "";
  targetNameInput.value = "";
  armTargetBtn.textContent = "הוסף יעד בלחיצה";
  renderTargets();
  draw();
  setStatus(`היעד "${name}" נוסף.`, "good");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("קריאת התמונה נכשלה"));
    reader.readAsDataURL(file);
  });
}

function buildGamePackage() {
  if (!state.hasImage || !state.imageDataUrl) {
    throw new Error("אין תמונה בחבילה.");
  }
  if (state.targets.length === 0) {
    throw new Error("נדרש לפחות יעד אחד.");
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    image: {
      src: state.imageDataUrl,
      width: state.imageWidth,
      height: state.imageHeight,
    },
    targets: state.targets.map((target) => ({
      id: target.id,
      name: target.name,
      x: target.x,
      y: target.y,
      r: target.r,
    })),
  };
}

function clearAll() {
  state.imageDataUrl = "";
  state.hasImage = false;
  state.imageWidth = 0;
  state.imageHeight = 0;
  state.targets = [];
  state.armedName = "";
  targetNameInput.value = "";
  imageInput.value = "";
  armTargetBtn.textContent = "הוסף יעד בלחיצה";
  renderTargets();
  draw();
  setStatus("הפרויקט אופס.");
}

imageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.image.onload = () => {
      if (
        state.image.naturalWidth !== REQUIRED_IMAGE_WIDTH ||
        state.image.naturalHeight !== REQUIRED_IMAGE_HEIGHT
      ) {
        clearAll();
        setStatus(
          `גודל לא תקין. נדרש בדיוק ${REQUIRED_IMAGE_WIDTH}x${REQUIRED_IMAGE_HEIGHT} פיקסלים.`,
          "bad"
        );
        return;
      }

      state.hasImage = true;
      state.imageDataUrl = dataUrl;
      state.imageWidth = state.image.naturalWidth;
      state.imageHeight = state.image.naturalHeight;
      state.targets = [];
      state.armedName = "";
      armTargetBtn.textContent = "הוסף יעד בלחיצה";
      renderTargets();
      draw();
      setStatus(
        `התמונה נטענה (${REQUIRED_IMAGE_WIDTH}x${REQUIRED_IMAGE_HEIGHT}). אפשר להתחיל לסמן דמויות.`
      );
    };
    state.image.src = dataUrl;
  } catch (error) {
    setStatus(error.message, "bad");
  }
});

radiusInput.addEventListener("input", () => {
  radiusLabel.textContent = radiusInput.value;
});

armTargetBtn.addEventListener("click", () => {
  if (!state.hasImage) {
    setStatus("העלה תמונה לפני סימון יעדים.", "bad");
    return;
  }

  const typedName = targetNameInput.value.trim();
  if (!typedName) {
    setStatus("כתוב שם דמות ואז לחץ שוב.", "bad");
    return;
  }

  state.armedName = typedName;
  armTargetBtn.textContent = `מוכן: ${typedName} (לחיצה על התמונה)`;
  setStatus(`בחר מיקום לדמות "${typedName}".`);
});

clearBtn.addEventListener("click", clearAll);

saveLocalBtn.addEventListener("click", () => {
  try {
    const gamePackage = buildGamePackage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gamePackage));
    setStatus("החבילה נשמרה בדפדפן למסך המשחק.", "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
});

exportBtn.addEventListener("click", () => {
  try {
    const gamePackage = buildGamePackage();
    const blob = new Blob([JSON.stringify(gamePackage, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "waldo-game-package.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("קובץ JSON הורד בהצלחה.", "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
});

canvas.addEventListener("click", (event) => {
  if (!state.hasImage) {
    return;
  }
  if (!state.armedName) {
    setStatus('לחץ "הוסף יעד בלחיצה" אחרי הזנת שם דמות.', "bad");
    return;
  }
  addTarget(normalizePoint(event));
});

window.addEventListener("resize", draw);

renderTargets();
draw();
