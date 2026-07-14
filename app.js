(() => {
  const EXPORT_WIDTH = 1080;
  const EXPORT_HEIGHT = 1920;
  const STORAGE_KEY = "instagram_caption_center";
  const HUSKY_BACKGROUND_CYCLE = [
    "assets/backgrounds/Yellow.jpg",
    "assets/backgrounds/Green.jpg",
    "assets/backgrounds/Blue.jpg",
    "assets/backgrounds/Red.jpg"
  ];
  const YELLOW_BACKGROUND = "assets/backgrounds/Yellow.jpg";
  const BLACK_TEXT = "#252525";
  const WHITE_TEXT = "#FFFFFF";
  const ACCOUNT_LABELS = {
    pawsitive_husky: "Pawsitive.husky",
    corporate_donkey: "The.corporate.donkey",
    mooing_aunty: "The.mooing.aunty"
  };

  const GENERATORS = {
    pawsitive: {
      title: "Pawsitive.husky",
      accountKey: "pawsitive_husky",
      defaultCaption: "",
      defaultBackground: "assets/backgrounds/Red.jpg",
      defaultHusky: "assets/huskies/Pose=14.png",
      poseSet: "huskies",
      allowBackgroundChoice: true,
      allowTextColorChoice: true,
      layout: {
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 60, minFontSize: 60, lineHeight: 90 },
        artBox: { x: 78, y: 798, width: 924, height: 822 },
        decorations: {
          shadowColor: "rgba(37, 37, 37, 0.24)"
        }
      }
    },
    donkey: {
      title: "The.corporate.donkey",
      accountKey: "corporate_donkey",
      defaultCaption: "",
      defaultBackground: "assets/backgrounds/Corporate.jpg",
      defaultHusky: "assets/donkey/Pose 1.png",
      poseSet: "donkeys",
      allowBackgroundChoice: false,
      allowTextColorChoice: false,
      textColor: "#181818",
      layout: {
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 60, minFontSize: 60, lineHeight: 90 },
        artBox: { x: 78, y: 798, width: 924, height: 822 },
        decorations: { shadowColor: "rgba(37, 37, 37, 0.24)" }
      }
    },
    cow: {
      title: "The.mooing.aunty",
      accountKey: "mooing_aunty",
      defaultCaption: "",
      defaultBackground: "assets/backgrounds/cowbg.jpg",
      defaultHusky: "assets/cow/Pose 1.png",
      poseSet: "cows",
      allowBackgroundChoice: false,
      allowTextColorChoice: false,
      textColor: "#3A2E28",
      layout: {
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 60, minFontSize: 60, lineHeight: 90 },
        artBox: { x: 78, y: 798, width: 924, height: 822 },
        decorations: { shadowColor: "rgba(37, 37, 37, 0.24)" }
      }
    }
  };

  class Emitter {
    constructor() {
      this.events = new Map();
    }

    on(event, callback) {
      const callbacks = this.events.get(event) || [];
      callbacks.push(callback);
      this.events.set(event, callbacks);
    }

    emit(event, payload) {
      (this.events.get(event) || []).forEach((callback) => callback(payload));
    }
  }

  class CaptionStore extends Emitter {
    constructor(key) {
      super();
      this.key = key;
      this.data = this.read();
    }

    read() {
      const fallback = { pawsitive_husky: [], corporate_donkey: [], mooing_aunty: [] };
      try {
        const parsed = JSON.parse(localStorage.getItem(this.key));
        return { ...fallback, ...parsed };
      } catch {
        return fallback;
      }
    }

    persist() {
      localStorage.setItem(this.key, JSON.stringify(this.data));
      this.emit("change", this.data);
    }

    list(accountKey) {
      return [...(this.data[accountKey] || [])];
    }

    add(accountKey, caption) {
      const text = caption.trim();
      if (!text) return;
      this.data[accountKey] = [...this.list(accountKey), text];
      this.persist();
    }

    remove(accountKey, index) {
      this.data[accountKey] = this.list(accountKey).filter((_, itemIndex) => itemIndex !== index);
      this.persist();
    }
  }

  class AssetRegistry {
    constructor(manifest) {
      this.manifest = manifest;
      this.cache = new Map();
    }

    static async load() {
      const response = await fetch("assets/manifest.json");
      if (!response.ok) throw new Error("Unable to load assets/manifest.json");
      return new AssetRegistry(await response.json());
    }

    async loadFonts() {
      if (!this.manifest.fonts?.patrickHandSc || !("FontFace" in window)) return;
      const patrickHand = new FontFace("Patrick Hand SC", `url("${this.manifest.fonts.patrickHandSc}")`, {
        style: "normal",
        weight: "400"
      });
      const loaded = await patrickHand.load();
      document.fonts.add(loaded);
      await document.fonts.load('75px "Patrick Hand SC"');
    }

    image(path) {
      if (!this.cache.has(path)) {
        const image = new Image();
        image.src = path;
        this.cache.set(path, new Promise((resolve, reject) => {
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Unable to load ${path}`));
        }));
      }
      return this.cache.get(path);
    }
  }

  class PostRenderer {
    constructor(canvas, assets, config) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.assets = assets;
      this.config = config;
    }

    async draw(state) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

      const [background, husky] = await Promise.all([
      this.assets.image(state.background),
      this.assets.image(state.husky)
      ]);

      ctx.drawImage(background, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      this.drawCaption(state.caption, state.alignment, state.textColor);
      this.drawArtwork(husky);
    }

    drawArtwork(husky) {
  const box = this.config.layout.artBox;

  const huskySize = this.containSize(husky, box.width, box.height);

  const huskyX = box.x + (box.width - huskySize.width) / 2;

  const huskyY = box.y + (box.height - huskySize.height) / 2;

  this.ctx.drawImage(
    husky,
    huskyX,
    huskyY,
    huskySize.width,
    huskySize.height
  );
}

    drawDecorationShadow(centerX, centerY, width, height) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = this.config.layout.decorations.shadowColor;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    containSize(image, maxWidth, maxHeight) {
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      return {
        width: image.naturalWidth * scale,
        height: image.naturalHeight * scale
      };
    }

    drawCaption(caption, alignment, color) {
      if (!caption.trim()) return;
      const { x, y, leftX, rightX, maxWidth, fontSize, minFontSize, lineHeight } = this.config.layout.caption;
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color;
      ctx.textAlign = alignment;
      ctx.textBaseline = "middle";
      let activeFontSize = fontSize;
      let lines = this.explicitLines(caption);
      this.setCaptionFont(activeFontSize);
      while (activeFontSize > minFontSize && this.widestLine(lines) > maxWidth) {
        activeFontSize -= 1;
        this.setCaptionFont(activeFontSize);
      }
      if (this.widestLine(lines) > maxWidth) {
        lines = this.wrapLines(caption, maxWidth);
      }
      const alignX = alignment === "left" ? leftX : alignment === "right" ? rightX : x;
      lines.forEach((line, index) => {
        ctx.fillText(line.toUpperCase(), alignX, y + index * lineHeight);
      });
      ctx.restore();
    }

    setCaptionFont(size) {
      this.ctx.font = `400 ${size}px "Patrick Hand SC", "Comic Sans MS", "Trebuchet MS", sans-serif`;
    }

    explicitLines(text) {
      return text.split(/\r?\n/).map((line) => line.trim());
    }

    widestLine(lines) {
      return Math.max(...lines.map((line) => this.ctx.measureText(line.toUpperCase()).width), 0);
    }

    wrapLines(text, maxWidth) {
      const ctx = this.ctx;
      return text.split(/\r?\n/).flatMap((rawLine) => {
        const words = rawLine.split(/\s+/).filter(Boolean);
        if (!words.length) return [""];
        const lines = [];
        let current = "";
        words.forEach((word) => {
          const next = current ? `${current} ${word}` : word;
          if (ctx.measureText(next.toUpperCase()).width <= maxWidth || !current) {
            current = next;
          } else {
            lines.push(current);
            current = word;
          }
        });
        lines.push(current);
        return lines;
      });
    }

    download(filename) {
      const link = document.createElement("a");
      link.download = filename;
      link.href = this.canvas.toDataURL("image/jpeg", 1);
      link.click();
    }
  }

  class App {
    constructor(assets) {
      this.assets = assets;
      this.store = new CaptionStore(STORAGE_KEY);
      this.config = GENERATORS.pawsitive;
      this.state = {
        background: this.config.defaultBackground,
        husky: this.config.defaultHusky,
        caption: this.config.defaultCaption,
        alignment: "center",
        textColor: "#FFFFFF",
      };
      this.dom = this.getDom();
      this.renderer = new PostRenderer(this.dom.previewCanvas, assets, this.config);
    }

    getDom() {
      return {
        menuButton: document.querySelector("#menuButton"),
        sideMenu: document.querySelector("#sideMenu"),
        menuScrim: document.querySelector("#menuScrim"),
        pageTitle: document.querySelector("#pageTitle"),
        navItems: [...document.querySelectorAll(".nav-item")],
        pages: [...document.querySelectorAll(".page")],
        previewCanvas: document.querySelector("#previewCanvas"),
        accountSelect: document.querySelector("#accountSelect"),
        backgroundControl: document.querySelector("#backgroundControl"),
        backgroundGrid: document.querySelector("#backgroundGrid"),
        huskyButton: document.querySelector("#huskyPickerButton"),
        huskyOptions: document.querySelector("#huskyOptions"),
        captionInput: document.querySelector("#captionInput"),
        savedCaptionSelect: document.querySelector("#savedCaptionSelect"),
        alignmentButtons: document.querySelector("#alignmentButtons"),
        textColorButtons: document.querySelector("#textColorButtons"),
        textColorControl: document.querySelector("#textColorControl"),
        downloadButton: document.querySelector("#downloadButton"),
        captionAccountSelect: document.querySelector("#captionAccountSelect"),
        captionCenterInput: document.querySelector("#captionCenterInput"),
        saveCaptionButton: document.querySelector("#saveCaptionButton"),
        captionTableBody: document.querySelector("#captionTableBody")
      };
    }

    async init() {
      await this.assets.loadFonts();
      this.renderBackgroundChoices();
      this.renderHuskyChoices();
      this.renderAlignmentButtons();
      this.bindNavigation();
      this.bindGeneratorControls();
      this.bindCaptionCenter();
      this.store.on("change", () => {
        this.renderSavedCaptionOptions();
        this.renderCaptionTable();
      });
      this.dom.captionInput.value = this.state.caption;
      this.dom.accountSelect.value = "pawsitive";
      this.renderSavedCaptionOptions();
      this.renderCaptionTable();
      this.syncGeneratorControls();
      this.renderPreview();
    }

    setState(patch) {
      this.state = {
        ...this.state,
        ...patch,
        ...(this.config.textColor ? { textColor: this.config.textColor } : {})
      };
      this.syncGeneratorControls();
      this.renderPreview();
    }

    selectGenerator(generatorKey) {
      this.config = GENERATORS[generatorKey];
      this.renderer.config = this.config;
      this.state = {
        background: this.config.defaultBackground,
        husky: this.config.defaultHusky,
        caption: this.config.defaultCaption,
        alignment: "center",
        textColor: this.config.textColor || "#FFFFFF"
      };
      this.renderBackgroundChoices();
      this.renderHuskyChoices();
      this.renderSavedCaptionOptions();
      this.syncGeneratorControls();
      this.renderPreview();
    }

    async renderPreview() {
      await this.renderer.draw(this.state);
    }

    bindNavigation() {
      const setOpen = (isOpen) => {
        this.dom.sideMenu.classList.toggle("open", isOpen);
        this.dom.menuScrim.classList.toggle("open", isOpen);
        this.dom.menuButton.setAttribute("aria-expanded", String(isOpen));
      };
      this.dom.menuButton.addEventListener("click", () => setOpen(!this.dom.sideMenu.classList.contains("open")));
      this.dom.menuScrim.addEventListener("click", () => setOpen(false));
      this.dom.navItems.forEach((item) => {
        item.addEventListener("click", () => {
          this.showPage(item.dataset.page);
          setOpen(false);
        });
      });
    }

    showPage(pageKey) {
      this.dom.navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === pageKey));
      const pageId = `${pageKey}Page`;
      this.dom.pages.forEach((page) => page.classList.toggle("active", page.id === pageId));
      const activePage = document.querySelector(`#${pageId}`);
      this.dom.pageTitle.textContent = activePage.dataset.title;
    }

    bindGeneratorControls() {
      this.dom.accountSelect.addEventListener("change", (event) => this.selectGenerator(event.target.value));
      this.dom.captionInput.addEventListener("input", (event) => this.setState({ caption: event.target.value }));
      this.dom.savedCaptionSelect.addEventListener("change", (event) => {
        if (!event.target.value) return;
        this.setState({ caption: event.target.value });
      });
      this.dom.textColorButtons.addEventListener("click", (event) => {
        const button = event.target.closest("[data-color]");
        if (button) this.setState({ textColor: button.dataset.color });
      });
      this.dom.downloadButton.addEventListener("click", () => this.downloadPost());
      document.addEventListener("click", (event) => {
        if (!event.target.closest("#huskySelect")) this.dom.huskyOptions.classList.remove("open");
      });
    }

    bindCaptionCenter() {
      this.dom.captionAccountSelect.addEventListener("change", () => this.renderCaptionTable());
      this.dom.saveCaptionButton.addEventListener("click", () => {
        this.store.add(this.dom.captionAccountSelect.value, this.dom.captionCenterInput.value);
        this.dom.captionCenterInput.value = "";
      });
      this.dom.captionTableBody.addEventListener("click", (event) => {
        const button = event.target.closest("[data-delete-index]");
        if (!button) return;
        this.store.remove(this.dom.captionAccountSelect.value, Number(button.dataset.deleteIndex));
      });
    }

    renderBackgroundChoices() {
      this.dom.backgroundControl.classList.toggle("is-hidden", !this.config.allowBackgroundChoice);
      this.dom.backgroundGrid.innerHTML = "";
      if (!this.config.allowBackgroundChoice) return;
      this.assets.manifest.backgrounds.forEach((path) => {
        const button = document.createElement("button");
        button.className = "background-option";
        button.type = "button";
        button.dataset.path = path;
        button.title = this.fileLabel(path);
        button.setAttribute("aria-label", `${this.fileLabel(path)} background`);
        button.innerHTML = `<img src="${path}" alt=""><span>${this.fileLabel(path)}</span>`;
        button.addEventListener("click", () => this.selectBackground(path));
        this.dom.backgroundGrid.append(button);
      });
    }

    renderHuskyChoices() {
      this.dom.huskyOptions.innerHTML = "";
      this.assets.manifest[this.config.poseSet].forEach((path) => {
        const option = document.createElement("button");
        option.className = "image-option";
        option.type = "button";
        option.role = "option";
        option.dataset.path = path;
        option.innerHTML = `<img src="${path}" alt=""><span>${this.fileLabel(path)}</span>`;
        option.addEventListener("click", () => {
          this.setState({ husky: path });
          this.dom.huskyOptions.classList.remove("open");
        });
        this.dom.huskyOptions.append(option);
      });
      if (!this.huskyPickerBound) {
        this.dom.huskyButton.addEventListener("click", () => {
          const open = !this.dom.huskyOptions.classList.contains("open");
          this.dom.huskyOptions.classList.toggle("open", open);
          this.dom.huskyButton.setAttribute("aria-expanded", String(open));
        });
        this.huskyPickerBound = true;
      }
      this.updateHuskyButton();
    }

    renderAlignmentButtons() {
      const items = [
        ["left", this.assets.manifest.icons.alignLeft, "Left alignment"],
        ["center", this.assets.manifest.icons.alignCenter, "Center alignment"],
        ["right", this.assets.manifest.icons.alignRight, "Right alignment"]
      ];
      this.dom.alignmentButtons.innerHTML = "";
      items.forEach(([alignment, icon, label]) => {
        const button = document.createElement("button");
        button.className = "icon-button";
        button.type = "button";
        button.dataset.alignment = alignment;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.innerHTML = `<img src="${icon}" alt="">`;
        button.addEventListener("click", () => this.setState({ alignment }));
        this.dom.alignmentButtons.append(button);
      });
    }

    renderSavedCaptionOptions() {
      const captions = this.store.list(this.config.accountKey);
      this.dom.savedCaptionSelect.innerHTML = '<option value="">Choose a saved caption</option>';
      captions.forEach((caption, index) => {
        const option = document.createElement("option");
        option.value = caption;
        option.textContent = `${index + 1}. ${caption.replace(/\s+/g, " ").slice(0, 70)}`;
        this.dom.savedCaptionSelect.append(option);
      });
    }

    renderCaptionTable() {
      const accountKey = this.dom.captionAccountSelect.value;
      const captions = this.store.list(accountKey);
      this.dom.captionTableBody.innerHTML = "";
      if (!captions.length) {
        this.dom.captionTableBody.innerHTML = `<tr><td class="empty-row" colspan="2">No captions saved for ${ACCOUNT_LABELS[accountKey]}.</td></tr>`;
        return;
      }
      captions.forEach((caption, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td class="caption-cell"></td>
          <td>
            <button class="delete-button" type="button" data-delete-index="${index}" aria-label="Delete caption">
              <img src="${this.assets.manifest.icons.delete}" alt="">
            </button>
          </td>
        `;
        row.querySelector(".caption-cell").textContent = caption;
        this.dom.captionTableBody.append(row);
      });
    }

    selectBackground(path) {
      const patch = { background: path };
      patch.textColor = path === YELLOW_BACKGROUND ? BLACK_TEXT : WHITE_TEXT;
      this.setState(patch);
    }

    nextItem(items, currentItem) {
      const currentIndex = items.indexOf(currentItem);
      return items[(currentIndex + 1 + items.length) % items.length];
    }

    downloadPost() {
      this.renderer.download(`${this.config.accountKey.replace(/_/g, "-")}-post.jpg`);
      if (!this.state.caption.trim()) return;

      const nextPose = this.nextItem(this.assets.manifest[this.config.poseSet], this.state.husky);
      const patch = { caption: "", husky: nextPose };

      if (this.config === GENERATORS.pawsitive) {
        const nextBackground = this.nextItem(HUSKY_BACKGROUND_CYCLE, this.state.background);
        patch.background = nextBackground;
        patch.textColor = nextBackground === YELLOW_BACKGROUND ? BLACK_TEXT : WHITE_TEXT;
      }

      this.setState(patch);
    }

    syncGeneratorControls() {
      this.dom.captionInput.value = this.state.caption;
      this.dom.accountSelect.value = Object.keys(GENERATORS).find((key) => GENERATORS[key] === this.config);
      this.dom.textColorControl.classList.toggle("is-hidden", !this.config.allowTextColorChoice);
      this.dom.backgroundGrid.querySelectorAll(".background-option").forEach((button) => {
        button.classList.toggle("active", button.dataset.path === this.state.background);
      });
      this.dom.huskyOptions.querySelectorAll(".image-option").forEach((button) => {
        button.classList.toggle("active", button.dataset.path === this.state.husky);
        button.setAttribute("aria-selected", String(button.dataset.path === this.state.husky));
      });
      this.dom.alignmentButtons.querySelectorAll("[data-alignment]").forEach((button) => {
        button.classList.toggle("active", button.dataset.alignment === this.state.alignment);
      });
      this.dom.textColorButtons.querySelectorAll("[data-color]").forEach((button) => {
        button.classList.toggle("active", button.dataset.color.toLowerCase() === this.state.textColor.toLowerCase());
      });
      this.updateHuskyButton();
    }

    updateHuskyButton() {
      if (!this.dom.huskyButton) return;
      this.dom.huskyButton.innerHTML = `<img src="${this.state.husky}" alt=""><span>${this.fileLabel(this.state.husky)}</span>`;
    }

    fileLabel(path) {
      return path.split("/").pop().replace(/\.[^.]+$/, "");
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const assets = await AssetRegistry.load();
      const app = new App(assets);
      await app.init();
    } catch (error) {
      document.body.innerHTML = `<main class="app-shell"><p>${error.message}</p></main>`;
      console.error(error);
    }
  });
})();
