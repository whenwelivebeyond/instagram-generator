import { Storage } from "./storage.js";

(() => {
  const EXPORT_WIDTH = 1080;
  const EXPORT_HEIGHT = 1920;
  const LEGACY_STORAGE_KEY = "instagram_caption_center";
  const LEGACY_MIGRATION_KEY = "instagram_caption_center_firestore_migrated";
  const GENERATOR_STATE_KEY = "instagram_generator_account_states";
  const LAST_GENERATOR_KEY = "instagram_generator_last_account";
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
  const HASHTAG_GROUPS = {
    pawsitive_husky: {
      label: "Pawsitive husky",
      groups: [
        ["husky", "Husky", 1], ["yoga", "Yoga", 1], ["therapy", "Therapy", 1],
        ["darkjokes", "Darkjokes", 1], ["generic", "Generic", 1]
      ]
    },
    corporate_donkey: {
      label: "The corporate donkey",
      groups: [["office", "Office", 2], ["corporate", "Corporate", 2], ["generic", "Generic", 1]]
    },
    mooing_aunty: {
      label: "The mooing aunty",
      groups: [["relationships", "Relationships", 1], ["funnyquotes", "Funnyquotes", 2], ["wisdom", "Wisdom", 1], ["generic", "Generic", 1]]
    }
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

  class CaptionStore {
    constructor() {
      this.data = this.emptyData();
      this.listeners = [];
      this.normalizedCaptionIds = new Set();
    }

    emptyData() {
      return { pawsitive_husky: [], corporate_donkey: [], mooing_aunty: [] };
    }

    onChange(callback) {
      this.listeners.push(callback);
    }

    emitChange() {
      this.listeners.forEach((callback) => callback(this.data));
    }

    async connect() {
      this.unsubscribe = await Storage.subscribe((captions) => {
        captions.forEach((caption) => {
          if ((caption.status && caption.sortOrder !== undefined) || this.normalizedCaptionIds.has(caption.id)) return;
          this.normalizedCaptionIds.add(caption.id);
          Storage.updateCaption(caption.id, {
            ...(caption.status ? {} : { status: "unused" }),
            ...(caption.sortOrder === undefined ? { sortOrder: -(caption.createdAt || Date.now()) } : {})
          }).catch((error) => console.warn("Caption metadata could not be updated.", error));
        });
        this.data = this.emptyData();
        captions.forEach((caption) => {
          if (this.data[caption.account]) this.data[caption.account].push(caption);
        });
        this.emitChange();
      });
      await this.migrateLegacyCaptions();
    }

    async migrateLegacyCaptions() {
      if (localStorage.getItem(LEGACY_MIGRATION_KEY)) return;
      try {
        const legacyData = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
        const captions = Object.entries(legacyData || {}).flatMap(([account, entries]) =>
          Array.isArray(entries) ? entries.map((caption) => ({ account, caption })) : []
        );
        await Promise.all(captions.filter((item) => item.caption?.trim()).map((item) =>
          Storage.saveCaption(item.account, item.caption.trim())
        ));
      } catch (error) {
        console.warn("Existing browser captions could not be migrated.", error);
      }
      localStorage.setItem(LEGACY_MIGRATION_KEY, "true");
    }

    list(accountKey) {
      return [...(this.data[accountKey] || [])];
    }

    async add(accountKey, caption, options) {
      const text = caption.trim();
      if (!text) return false;
      return Storage.saveCaption(accountKey, text, options);
    }

    async remove(accountKey, index) {
      const caption = this.list(accountKey)[index];
      if (caption) await Storage.deleteCaption(caption.id);
    }

    async update(id, patch) {
      await Storage.updateCaption(id, patch);
      Object.values(this.data).forEach((captions) => {
        const caption = captions.find((item) => item.id === id);
        if (caption) Object.assign(caption, patch, { updatedAt: Date.now() });
      });
      this.emitChange();
    }

    async removeMany(ids) {
      const before = this.data;
      this.data = Object.fromEntries(Object.entries(this.data).map(([account, captions]) => [
        account,
        captions.filter((caption) => !ids.includes(caption.id))
      ]));
      this.emitChange();
      try {
        await Storage.deleteCaptions(ids);
      } catch (error) {
        this.data = before;
        this.emitChange();
        throw error;
      }
    }

    async restore(caption) {
      await Storage.restoreCaption(caption);
      if (this.data[caption.account] && !this.data[caption.account].some((item) => item.id === caption.id)) {
        this.data[caption.account].push(caption);
        this.emitChange();
      }
    }
  }

  class HashtagStore {
    constructor() {
      this.data = [];
      this.listeners = [];
    }

    onChange(callback) {
      this.listeners.push(callback);
    }

    emitChange() {
      this.listeners.forEach((callback) => callback(this.data));
    }

    async connect() {
      this.unsubscribe = await Storage.subscribeHashtags((hashtags) => {
        this.data = hashtags;
        this.emitChange();
      });
    }

    list(account, group) {
      return this.data.filter((hashtag) => hashtag.account === account && hashtag.group === group);
    }

    async add(account, group, text) {
      return Storage.saveHashtag(account, group, text);
    }

    async remove(id) {
      return Storage.deleteHashtag(id);
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
      this.store = new CaptionStore();
      this.hashtagStore = new HashtagStore();
      this.generatorStates = this.readGeneratorStates();
      this.generatorKey = this.readLastGeneratorKey();
      this.config = GENERATORS[this.generatorKey];
      this.state = this.stateForGenerator(this.generatorKey);
      this.selectedSavedCaptionId = null;
      this.openHashtagAccounts = new Set();
      this.editingHashtagGroups = new Set();
      this.captionView = {
        filter: "all",
        sort: "default",
        searchOpen: false,
        query: "",
        management: false,
        order: [],
        history: [],
        redo: []
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
        hashtagsInput: document.querySelector("#hashtagsInput"),
        resetCaptionButton: document.querySelector("#resetCaptionButton"),
        savedCaptionSelect: document.querySelector("#savedCaptionSelect"),
        alignmentButtons: document.querySelector("#alignmentButtons"),
        textColorButtons: document.querySelector("#textColorButtons"),
        textColorControl: document.querySelector("#textColorControl"),
        downloadButton: document.querySelector("#downloadButton"),
        captionAccountSelect: document.querySelector("#captionAccountSelect"),
        captionCenterInput: document.querySelector("#captionCenterInput"),
        resetCaptionCenterButton: document.querySelector("#resetCaptionCenterButton"),
        saveCaptionButton: document.querySelector("#saveCaptionButton"),
        captionStorageStatus: document.querySelector("#captionStorageStatus"),
        captionTableBody: document.querySelector("#captionTableBody")
        ,captionTableWrap: document.querySelector("#captionTableWrap")
        ,captionToolbar: document.querySelector("#captionToolbar")
        ,captionListSubtitle: document.querySelector("#captionListSubtitle")
        ,captionSearchInput: document.querySelector("#captionSearchInput")
        ,filterMenu: document.querySelector("#filterMenu")
        ,sortMenu: document.querySelector("#sortMenu")
        ,hashtagsPageContent: document.querySelector("#hashtagsPageContent")
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
      this.bindHashtagPage();
      this.store.onChange(() => {
        this.renderSavedCaptionOptions();
        this.renderCaptionTable();
      });
      this.hashtagStore.onChange(() => {
        this.renderHashtagPage();
        this.preloadGeneratorHashtags();
      });
      this.dom.captionInput.value = this.state.caption;
      this.dom.accountSelect.value = this.generatorKey;
      this.renderSavedCaptionOptions();
      this.renderCaptionTable();
      this.syncGeneratorControls();
      this.renderHashtagPage();
      this.renderPreview();
      this.setCaptionStorageStatus("Loading saved captions…");
      try {
        await this.store.connect();
        this.setCaptionStorageStatus("Captions are synced to Firebase.");
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("Captions could not connect to Firebase. Complete the Firebase setup steps below.", true);
      }
      try {
        await this.hashtagStore.connect();
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("Hashtags could not connect to Firebase. Update the Firestore rules.", true);
      }
    }

    setState(patch) {
      this.state = {
        ...this.state,
        ...patch,
        ...(this.config.textColor ? { textColor: this.config.textColor } : {})
      };
      this.saveGeneratorState();
      this.syncGeneratorControls();
      this.renderPreview();
    }

    selectGenerator(generatorKey) {
      this.saveGeneratorState();
      this.generatorKey = generatorKey;
      this.config = GENERATORS[generatorKey];
      this.renderer.config = this.config;
      this.state = this.stateForGenerator(generatorKey);
      localStorage.setItem(LAST_GENERATOR_KEY, generatorKey);
      this.selectedSavedCaptionId = null;
      this.renderBackgroundChoices();
      this.renderHuskyChoices();
      this.renderSavedCaptionOptions();
      this.syncGeneratorControls();
      this.renderPreview();
      this.preloadGeneratorHashtags();
    }

    defaultGeneratorState(config) {
      return {
        background: config.defaultBackground,
        husky: config.defaultHusky,
        caption: config.defaultCaption,
        alignment: "center",
        textColor: config.textColor || "#FFFFFF"
      };
    }

    readGeneratorStates() {
      try {
        return JSON.parse(localStorage.getItem(GENERATOR_STATE_KEY)) || {};
      } catch {
        return {};
      }
    }

    readLastGeneratorKey() {
      const storedKey = localStorage.getItem(LAST_GENERATOR_KEY);
      return GENERATORS[storedKey] ? storedKey : "pawsitive";
    }

    stateForGenerator(generatorKey) {
      const config = GENERATORS[generatorKey];
      const saved = this.generatorStates[generatorKey] || {};
      const poses = this.assets.manifest[config.poseSet];
      const backgroundIsValid = config.allowBackgroundChoice
        ? this.assets.manifest.backgrounds.includes(saved.background)
        : saved.background === config.defaultBackground;
      return {
        ...this.defaultGeneratorState(config),
        ...saved,
        background: backgroundIsValid ? saved.background : config.defaultBackground,
        husky: poses.includes(saved.husky) ? saved.husky : config.defaultHusky,
        caption: "",
        textColor: config.textColor || saved.textColor || "#FFFFFF"
      };
    }

    saveGeneratorState() {
      this.generatorStates[this.generatorKey] = {
        ...this.state,
        caption: ""
      };
      localStorage.setItem(GENERATOR_STATE_KEY, JSON.stringify(this.generatorStates));
      localStorage.setItem(LAST_GENERATOR_KEY, this.generatorKey);
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
      this.dom.captionInput.addEventListener("input", (event) => {
        this.selectedSavedCaptionId = null;
        this.dom.savedCaptionSelect.value = "";
        this.setState({ caption: event.target.value });
      });
      this.dom.hashtagsInput.addEventListener("input", () => {
        this.dom.hashtagsInput.value = this.formatHashtagText(this.dom.hashtagsInput.value);
      });
      this.dom.savedCaptionSelect.addEventListener("change", (event) => {
        if (!event.target.value) return;
        const caption = this.store.list(this.config.accountKey).find((item) => item.id === event.target.value);
        if (!caption) return;
        this.selectedSavedCaptionId = caption.id;
        this.setState({ caption: caption.caption });
      });
      this.dom.resetCaptionButton.addEventListener("click", () => this.resetGeneratorCaption());
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
      this.dom.resetCaptionCenterButton.addEventListener("click", () => {
        this.dom.captionCenterInput.value = "";
      });
      this.dom.saveCaptionButton.addEventListener("click", async () => {
        try {
          const saved = await this.store.add(this.dom.captionAccountSelect.value, this.dom.captionCenterInput.value, {
            status: "unused",
            sortOrder: this.nextCaptionSortOrder(this.dom.captionAccountSelect.value)
          });
          if (saved) this.dom.captionCenterInput.value = "";
        } catch (error) {
          console.error(error);
          this.setCaptionStorageStatus("Caption could not be saved. Check your Firebase setup.", true);
        }
      });
      this.dom.captionToolbar.addEventListener("click", (event) => this.handleCaptionToolbar(event));
      this.dom.captionSearchInput.addEventListener("input", (event) => {
        this.captionView.query = event.target.value;
        this.renderCaptionTable();
      });
      this.bindCaptionTableInteractions();
    }

    bindHashtagPage() {
      this.dom.hashtagsPageContent.addEventListener("input", (event) => {
        const input = event.target.closest("[data-hashtag-input]");
        if (input) input.value = this.normalizeHashtag(input.value);
      });
      this.dom.hashtagsPageContent.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const account = button.dataset.account;
        const group = button.dataset.group;
        if (button.dataset.action === "toggle-account") {
          if (this.openHashtagAccounts.has(account)) this.openHashtagAccounts.delete(account);
          else this.openHashtagAccounts.add(account);
          this.renderHashtagPage();
        } else if (button.dataset.action === "toggle-edit") {
          const key = `${account}:${group}`;
          if (this.editingHashtagGroups.has(key)) this.editingHashtagGroups.delete(key);
          else this.editingHashtagGroups.add(key);
          this.renderHashtagPage();
        } else if (button.dataset.action === "save-hashtag") {
          const input = this.dom.hashtagsPageContent.querySelector(`[data-hashtag-input="${account}:${group}"]`);
          const text = this.normalizeHashtag(input?.value || "");
          if (!text) return;
          try {
            await this.hashtagStore.add(account, group, text);
            input.value = "";
          } catch (error) {
            console.error(error);
            this.setCaptionStorageStatus("Hashtag could not be saved. Check your Firebase setup.", true);
          }
        } else if (button.dataset.action === "delete-hashtag") {
          try {
            await this.hashtagStore.remove(button.dataset.hashtagId);
          } catch (error) {
            console.error(error);
            this.setCaptionStorageStatus("Hashtag could not be deleted. Check your Firebase setup.", true);
          }
        }
      });
    }

    renderHashtagPage() {
      this.dom.hashtagsPageContent.innerHTML = Object.entries(HASHTAG_GROUPS).map(([account, config]) => {
        const isOpen = this.openHashtagAccounts.has(account);
        const arrow = isOpen ? this.assets.manifest.icons.dropdownUp : this.assets.manifest.icons.dropdownDown;
        return `
          <section class="hashtag-account ${isOpen ? "open" : ""}">
            <button class="hashtag-account-toggle" type="button" data-action="toggle-account" data-account="${account}">
              <span>${config.label}</span><img src="${arrow}" alt="">
            </button>
            <div class="hashtag-account-content">
              ${config.groups.map(([group, label]) => this.renderHashtagGroup(account, group, label)).join("")}
            </div>
          </section>
        `;
      }).join("");
    }

    renderHashtagGroup(account, group, label) {
      const editKey = `${account}:${group}`;
      const isEditing = this.editingHashtagGroups.has(editKey);
      const hashtags = this.hashtagStore.list(account, group);
      return `
        <section class="hashtag-group">
          <div class="hashtag-group-heading">
            <h3>${label}</h3>
            <button class="group-edit-button" type="button" data-action="toggle-edit" data-account="${account}" data-group="${group}" aria-label="Edit ${label} hashtags">✎</button>
          </div>
          <div class="hashtag-chips ${isEditing ? "editing" : ""}">
            ${hashtags.map((hashtag) => `<span class="hashtag-chip">#${hashtag.text}${isEditing ? `<button type="button" data-action="delete-hashtag" data-hashtag-id="${hashtag.id}" aria-label="Delete #${hashtag.text}">×</button>` : ""}</span>`).join("")}
          </div>
          <div class="hashtag-add-row">
            <input type="text" data-hashtag-input="${editKey}" placeholder="Add hashtag" aria-label="Add ${label} hashtag">
            <button class="hashtag-save-button" type="button" data-action="save-hashtag" data-account="${account}" data-group="${group}">Save</button>
          </div>
        </section>
      `;
    }

    normalizeHashtag(value) {
      return value.replace(/[\s#]+/g, "");
    }

    formatHashtagText(value) {
      return value.split(/\s+/).map((item) => this.normalizeHashtag(item)).filter(Boolean).map((item) => `#${item}`).join(" ");
    }

    preloadGeneratorHashtags() {
      const config = HASHTAG_GROUPS[this.config.accountKey];
      if (!config) return;
      const selected = config.groups.flatMap(([group, , count]) => this.randomHashtags(this.hashtagStore.list(this.config.accountKey, group), count));
      this.dom.hashtagsInput.value = selected.map((hashtag) => `#${hashtag.text}`).join(" ");
    }

    randomHashtags(hashtags, count) {
      return [...hashtags].sort(() => Math.random() - 0.5).slice(0, count);
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
          this.updateHuskyButton();
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
      const captions = this.store.list(this.config.accountKey)
        .filter((caption) => caption.status !== "used")
        .sort((first, second) => this.captionOrder(first) - this.captionOrder(second));
      this.dom.savedCaptionSelect.innerHTML = '<option value="">Choose a saved caption</option>';
      captions.forEach((caption, index) => {
        const option = document.createElement("option");
        option.value = caption.id;
        option.textContent = `${index + 1}. ${caption.caption.replace(/\s+/g, " ").slice(0, 70)}`;
        this.dom.savedCaptionSelect.append(option);
      });
      if (this.selectedSavedCaptionId && captions.some((caption) => caption.id === this.selectedSavedCaptionId)) {
        this.dom.savedCaptionSelect.value = this.selectedSavedCaptionId;
      } else {
        this.selectedSavedCaptionId = null;
      }
    }

    renderCaptionTable() {
      const captions = this.visibleCaptions();
      const filterLabel = this.captionView.filter === "all" ? "all" : this.captionView.filter;
      this.dom.captionListSubtitle.textContent = `Showing ${filterLabel} captions`;
      this.dom.captionTableBody.innerHTML = "";
      if (!captions.length) {
        this.dom.captionTableBody.innerHTML = '<tr><td class="empty-row">No captions match this view.</td></tr>';
        return;
      }
      captions.forEach((caption) => {
        const row = document.createElement("tr");
        row.dataset.captionId = caption.id;
        row.innerHTML = '<td class="caption-cell"></td>';
        const cell = row.querySelector(".caption-cell");
        if (this.captionView.management) {
          cell.innerHTML = `
            <span class="caption-text"></span>
            <button class="row-move-button" type="button" data-action="move-top" aria-label="Move caption to top"><img src="${this.assets.manifest.icons.moveTop}" alt=""></button>
            <button class="row-delete-button" type="button" data-action="delete-now" aria-label="Delete caption"><img src="${this.assets.manifest.icons.delete}" alt=""></button>
          `;
          cell.querySelector(".caption-text").textContent = caption.caption;
        } else {
          cell.innerHTML = '<span class="caption-text"></span>';
          cell.querySelector(".caption-text").textContent = caption.caption;
        }
        this.dom.captionTableBody.append(row);
      });
    }

    visibleCaptions() {
      const accountKey = this.dom.captionAccountSelect.value;
      let captions = this.store.list(accountKey);
      if (this.captionView.management && this.captionView.order.length) {
        const position = new Map(this.captionView.order.map((id, index) => [id, index]));
        captions.sort((first, second) => (position.get(first.id) ?? Infinity) - (position.get(second.id) ?? Infinity));
      } else if (this.captionView.sort === "latest") {
        captions.sort((first, second) => this.captionTime(second) - this.captionTime(first));
      } else if (this.captionView.sort === "earliest") {
        captions.sort((first, second) => this.captionTime(first) - this.captionTime(second));
      } else {
        captions.sort((first, second) => this.captionOrder(first) - this.captionOrder(second));
      }
      if (this.captionView.filter !== "all") captions = captions.filter((caption) => (caption.status || "unused") === this.captionView.filter);
      const query = this.captionView.query.trim().toLowerCase();
      if (query) captions = captions.filter((caption) => caption.caption.toLowerCase().includes(query));
      return captions;
    }

    captionTime(caption) {
      return caption.updatedAt || caption.createdAt || 0;
    }

    captionOrder(caption) {
      return caption.sortOrder ?? -this.captionTime(caption);
    }

    nextCaptionSortOrder(accountKey) {
      const orders = this.store.list(accountKey).map((caption) => this.captionOrder(caption));
      return orders.length ? Math.min(...orders) - 1 : 0;
    }

    resetGeneratorCaption() {
      this.selectedSavedCaptionId = null;
      this.dom.savedCaptionSelect.value = "";
      this.setState({ caption: "" });
    }

    nextUnusedCaption(excludedId) {
      return this.store.list(this.config.accountKey)
        .filter((caption) => caption.status !== "used" && caption.id !== excludedId)
        .sort((first, second) => this.captionOrder(first) - this.captionOrder(second))[0] || null;
    }

    handleCaptionToolbar(event) {
      const button = event.target.closest("[data-action], [data-filter], [data-sort]");
      if (!button) return;
      const action = button.dataset.action;
      if (button.dataset.filter) {
        this.captionView.filter = button.dataset.filter;
        this.closeToolbarMenus();
        this.renderCaptionTable();
        return;
      }
      if (button.dataset.sort) {
        this.captionView.sort = button.dataset.sort;
        this.closeToolbarMenus();
        this.renderCaptionTable();
        return;
      }
      if (action === "open-search") {
        this.captionView.searchOpen = true;
        this.syncCaptionToolbar();
        this.dom.captionSearchInput.focus();
      } else if (action === "close-search") {
        this.captionView.searchOpen = false;
        this.captionView.query = "";
        this.dom.captionSearchInput.value = "";
        this.syncCaptionToolbar();
        this.renderCaptionTable();
      } else if (action === "toggle-filter") {
        this.toggleToolbarMenu(this.dom.filterMenu);
      } else if (action === "toggle-sort") {
        this.toggleToolbarMenu(this.dom.sortMenu);
      } else if (action === "undo") {
        this.undoManagementChange();
      } else if (action === "redo") {
        this.redoManagementChange();
      } else if (action === "exit-management") {
        this.exitManagementMode();
      }
    }

    closeToolbarMenus() {
      [this.dom.filterMenu, this.dom.sortMenu].forEach((menu) => menu.classList.remove("open"));
    }

    toggleToolbarMenu(menu) {
      const shouldOpen = !menu.classList.contains("open");
      this.closeToolbarMenus();
      menu.classList.toggle("open", shouldOpen);
    }

    syncCaptionToolbar() {
      this.dom.captionToolbar.classList.toggle("search-active", this.captionView.searchOpen);
      this.dom.captionToolbar.classList.toggle("management-active", this.captionView.management);
      this.dom.captionTableWrap.classList.toggle("management-active", this.captionView.management);
    }

    enterManagementMode() {
      if (this.captionView.management) return;
      this.captionView.filter = "all";
      this.captionView.sort = "default";
      this.captionView.searchOpen = false;
      this.captionView.query = "";
      this.dom.captionSearchInput.value = "";
      this.captionView.management = true;
      this.captionView.order = this.visibleCaptions().map((caption) => caption.id);
      this.captionView.history = [];
      this.captionView.redo = [];
      this.closeToolbarMenus();
      this.syncCaptionToolbar();
      this.renderCaptionTable();
    }

    applyManagementOrder(order) {
      this.captionView.order = [...order];
      this.renderCaptionTable();
    }

    addManagementHistory(action) {
      this.captionView.history.push(action);
      this.captionView.redo = [];
    }

    async undoManagementChange() {
      const action = this.captionView.history.pop();
      if (!action) return;
      try {
        if (action.type === "order") {
          await this.persistCaptionOrder(action.before);
          this.applyManagementOrder(action.before);
        } else if (action.type === "delete") {
          await this.store.restore(action.caption);
          this.applyManagementOrder(action.orderBefore);
        }
        this.captionView.redo.push(action);
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("The change could not be undone.", true);
      }
    }

    async redoManagementChange() {
      const action = this.captionView.redo.pop();
      if (!action) return;
      try {
        if (action.type === "order") {
          await this.persistCaptionOrder(action.after);
          this.applyManagementOrder(action.after);
        } else if (action.type === "delete") {
          await this.store.removeMany([action.caption.id]);
          this.applyManagementOrder(action.orderBefore.filter((id) => id !== action.caption.id));
        }
        this.captionView.history.push(action);
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("The change could not be redone.", true);
      }
    }

    async persistCaptionOrder(order) {
      await Promise.all(order.map((id, index) => this.store.update(id, { sortOrder: index })));
    }

    exitManagementMode() {
      this.captionView.management = false;
      this.captionView.order = [];
      this.captionView.history = [];
      this.captionView.redo = [];
      this.syncCaptionToolbar();
      this.renderCaptionTable();
    }

    bindCaptionTableInteractions() {
      let longPressTimer;
      let suppressClick = false;
      const cancelLongPress = () => clearTimeout(longPressTimer);
      this.dom.captionTableBody.addEventListener("pointerdown", (event) => {
        if (this.captionView.management || event.target.closest("button, textarea")) return;
        longPressTimer = setTimeout(() => {
          suppressClick = true;
          this.enterManagementMode();
        }, 650);
      });
      this.dom.captionTableBody.addEventListener("pointerup", cancelLongPress);
      this.dom.captionTableBody.addEventListener("pointerleave", cancelLongPress);
      this.dom.captionTableBody.addEventListener("pointercancel", cancelLongPress);
      this.dom.captionTableBody.addEventListener("click", async (event) => {
        const row = event.target.closest("tr[data-caption-id]");
        if (!row) return;
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (this.captionView.management) {
          const id = row.dataset.captionId;
          if (event.target.closest('[data-action="move-top"]')) await this.moveCaptionToTop(id);
          if (event.target.closest('[data-action="delete-now"]')) await this.deleteCaptionNow(id);
          return;
        }
        if (this.captionView.searchOpen && this.captionView.query.trim()) {
          this.revealSearchedCaption(row.dataset.captionId);
          return;
        }
        this.editCaptionRow(row.dataset.captionId);
      });
    }

    async moveCaptionToTop(id) {
      const before = [...this.captionView.order];
      const after = [id, ...before.filter((item) => item !== id)];
      if (before.join("|") === after.join("|")) return;
      try {
        await this.persistCaptionOrder(after);
        this.addManagementHistory({ type: "order", before, after });
        this.applyManagementOrder(after);
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("Caption could not be moved. Check your Firebase setup.", true);
      }
    }

    async deleteCaptionNow(id) {
      const caption = this.store.list(this.dom.captionAccountSelect.value).find((item) => item.id === id);
      if (!caption) return;
      const orderBefore = [...this.captionView.order];
      try {
        await this.store.removeMany([id]);
        this.addManagementHistory({ type: "delete", caption, orderBefore });
        this.applyManagementOrder(orderBefore.filter((item) => item !== id));
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("Caption could not be deleted. Check your Firebase setup.", true);
      }
    }

    editCaptionRow(id) {
      const caption = this.store.list(this.dom.captionAccountSelect.value).find((item) => item.id === id);
      const row = this.dom.captionTableBody.querySelector(`[data-caption-id="${id}"]`);
      if (!caption || !row) return;
      const cell = row.querySelector(".caption-cell");
      cell.innerHTML = `
        <textarea class="inline-caption-editor" rows="3"></textarea>
        <span class="inline-caption-actions">
          <button type="button" data-action="save-edit" aria-label="Save caption"><img src="${this.assets.manifest.icons.check}" alt=""></button>
        </span>
      `;
      const editor = cell.querySelector("textarea");
      editor.value = caption.caption;
      editor.focus();
      const handleEditAction = async (event) => {
        const action = event.target.closest("button")?.dataset.action;
        if (!action) return;
        cell.removeEventListener("click", handleEditAction);
        if (action === "save-edit") {
          const text = editor.value.trim();
          if (!text) return;
          try {
            await this.store.update(id, { caption: text });
          } catch (error) {
            console.error(error);
            this.setCaptionStorageStatus("Caption could not be updated. Check your Firebase setup.", true);
          }
        }
      };
      cell.addEventListener("click", handleEditAction);
    }

    revealSearchedCaption(id) {
      this.captionView.searchOpen = false;
      this.captionView.query = "";
      this.captionView.filter = "all";
      this.dom.captionSearchInput.value = "";
      this.syncCaptionToolbar();
      this.renderCaptionTable();
      requestAnimationFrame(() => this.dom.captionTableBody.querySelector(`[data-caption-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    setCaptionStorageStatus(message, isError = false) {
      this.dom.captionStorageStatus.textContent = message;
      this.dom.captionStorageStatus.classList.toggle("is-error", isError);
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

    async downloadPost() {
      this.renderer.download(`${this.config.accountKey.replace(/_/g, "-")}-post.jpg`);
      if (!this.state.caption.trim()) return;

      const captionText = this.state.caption.trim();
      await this.copyPostText(captionText, this.dom.hashtagsInput.value);
      const usedCaptionId = this.selectedSavedCaptionId;
      try {
        if (usedCaptionId) {
          await this.store.update(usedCaptionId, { status: "used" });
        } else {
          await this.store.add(this.config.accountKey, captionText, {
            status: "used",
            sortOrder: this.nextCaptionSortOrder(this.config.accountKey)
          });
        }
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("The download completed, but the caption status could not be saved.", true);
      }

      const nextPose = this.nextItem(this.assets.manifest[this.config.poseSet], this.state.husky);
      const nextCaption = usedCaptionId ? this.nextUnusedCaption(usedCaptionId) : null;
      this.selectedSavedCaptionId = nextCaption?.id || null;
      const patch = { caption: nextCaption?.caption || "", husky: nextPose };

      if (this.config === GENERATORS.pawsitive) {
        const nextBackground = this.nextItem(HUSKY_BACKGROUND_CYCLE, this.state.background);
        patch.background = nextBackground;
        patch.textColor = nextBackground === YELLOW_BACKGROUND ? BLACK_TEXT : WHITE_TEXT;
      }

      this.setState(patch);
      this.renderSavedCaptionOptions();
      this.preloadGeneratorHashtags();
    }

    async copyPostText(caption, hashtags) {
      const hashtagText = this.formatHashtagText(hashtags);
      const text = hashtagText ? `${caption}\n\n\n${hashtagText}` : caption;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const helper = document.createElement("textarea");
          helper.value = text;
          helper.style.position = "fixed";
          helper.style.opacity = "0";
          document.body.append(helper);
          helper.select();
          document.execCommand("copy");
          helper.remove();
        }
        this.setCaptionStorageStatus("Caption and hashtags copied to your clipboard.");
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("The image downloaded, but clipboard copy was blocked by the browser.", true);
      }
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
      const arrow = this.dom.huskyOptions.classList.contains("open")
        ? this.assets.manifest.icons.dropdownUp
        : this.assets.manifest.icons.dropdownDown;
      this.dom.huskyButton.innerHTML = `<img src="${this.state.husky}" alt=""><span>${this.fileLabel(this.state.husky)}</span><img class="picker-chevron" src="${arrow}" alt="">`;
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
