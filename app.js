import { Storage } from "./storage.js";
import { DEFAULT_HASHTAGS } from "./hashtag-seeds.js";

(() => {
  const EXPORT_WIDTH = 1080;
  const EXPORT_HEIGHT = 1920;
  const LEGACY_STORAGE_KEY = "instagram_caption_center";
  const LEGACY_MIGRATION_KEY = "instagram_caption_center_firestore_migrated";
  const GENERATOR_STATE_KEY = "instagram_generator_account_states";
  const LAST_GENERATOR_KEY = "instagram_generator_last_account";
  const CHARACTER_AVAILABILITY_KEY = "instagram_generator_character_availability";
  const MIN_CAPTION_FONT_SIZE = 30;
  const MAX_CAPTION_FONT_SIZE = 90;
  const ACCOUNT_LABELS = {
    pawsitive_husky: "Pawsitive.husky",
    corporate_donkey: "The.corporate.jungle",
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
      label: "The corporate jungle",
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
      defaultBackground: "assets/backgrounds/Husky.jpg",
      defaultHusky: "assets/huskies/Pose 1.png",
      poseSet: "huskies",
      allowBackgroundChoice: false,
      allowTextColorChoice: false,
      textColor: "#794D00",
      layout: {
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 72, minFontSize: 72, lineHeight: 90 },
        artBox: { x: 78, y: 798, width: 924, height: 822 },
        decorations: {
          shadowColor: "rgba(37, 37, 37, 0.24)"
        }
      }
    },
    donkey: {
      title: "The.corporate.jungle",
      accountKey: "corporate_donkey",
      defaultCaption: "",
      defaultBackground: "assets/backgrounds/Corporate.jpg",
      defaultHusky: "assets/donkey/Pose 1.png",
      poseSet: "donkeys",
      characters: ["donkey", "husky", "chicken", "gazelle", "cat"],
      characterPoseSet: "corporateCharacters",
      defaultCharacter: "donkey",
      allowBackgroundChoice: false,
      allowTextColorChoice: false,
      textColor: "#181818",
      layout: {
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 72, minFontSize: 72, lineHeight: 90 },
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
        caption: { x: 540, y: 298, leftX: 78, rightX: 1002, maxWidth: 924, fontSize: 72, minFontSize: 72, lineHeight: 90 },
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

    async seedDefaults(seedData) {
      return Storage.seedHashtags(seedData);
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
      this.drawCaption(state.caption, state.alignment, state.textColor, state.fontSize);
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

    drawCaption(caption, alignment, color, fontSize) {
      if (!caption.trim()) return;
      const { x, y, leftX, rightX, maxWidth, fontSize: defaultFontSize } = this.config.layout.caption;
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color;
      ctx.textAlign = alignment;
      ctx.textBaseline = "middle";
      const activeFontSize = fontSize || defaultFontSize;
      const lineHeight = activeFontSize * 1.2;
      let lines = this.explicitLines(caption);
      this.setCaptionFont(activeFontSize);
      if (this.widestLine(lines) > maxWidth) {
        lines = this.wrapLines(caption, maxWidth);
      }
      const alignX = alignment === "left" ? leftX : alignment === "right" ? rightX : x;
      lines.forEach((line, index) => {
        ctx.fillText(line, alignX, y + index * lineHeight);
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
      return Math.max(...lines.map((line) => this.ctx.measureText(line).width), 0);
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
          if (ctx.measureText(next).width <= maxWidth || !current) {
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
      this.characterAvailability = this.readCharacterAvailability();
      this.generatorKey = this.readLastGeneratorKey();
      this.config = GENERATORS[this.generatorKey];
      this.state = this.stateForGenerator(this.generatorKey);
      this.selectedSavedCaptionId = null;
      this.shouldPrefillInitialCaption = true;
      this.openHashtagAccounts = new Set();
      this.editingHashtagGroups = new Set();
      this.selectedHashtagGroups = {};
      this.captionView = {
        filter: "unused",
        sort: "default",
        searchOpen: false,
        query: "",
        management: false,
        order: [],
        history: [],
        redo: [],
        page: 1,
        pageSize: 50
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
        characterPoseRow: document.querySelector("#characterPoseRow"),
        characterControl: document.querySelector("#characterControl"),
        characterSelect: document.querySelector("#characterSelect"),
        huskyButton: document.querySelector("#huskyPickerButton"),
        huskyOptions: document.querySelector("#huskyOptions"),
        captionInput: document.querySelector("#captionInput"),
        hashtagsInput: document.querySelector("#hashtagsInput"),
        resetCaptionButton: document.querySelector("#resetCaptionButton"),
        savedCaptionSelect: document.querySelector("#savedCaptionSelect"),
        randomizeCaptionButton: document.querySelector("#randomizeCaptionButton"),
        alignmentButtons: document.querySelector("#alignmentButtons"),
        textColorButtons: document.querySelector("#textColorButtons"),
        textColorControl: document.querySelector("#textColorControl"),
        decreaseFontSizeButton: document.querySelector("#decreaseFontSizeButton"),
        increaseFontSizeButton: document.querySelector("#increaseFontSizeButton"),
        fontSizeValue: document.querySelector("#fontSizeValue"),
        downloadButton: document.querySelector("#downloadButton"),
        captionAccountSelect: document.querySelector("#captionAccountSelect"),
        captionCenterInput: document.querySelector("#captionCenterInput"),
        resetCaptionCenterButton: document.querySelector("#resetCaptionCenterButton"),
        saveCaptionButton: document.querySelector("#saveCaptionButton"),
        captionStorageStatus: document.querySelector("#captionStorageStatus"),
        captionTableBody: document.querySelector("#captionTableBody"),
        captionPagination: document.querySelector("#captionPagination")
        ,captionTableWrap: document.querySelector("#captionTableWrap")
        ,captionToolbar: document.querySelector("#captionToolbar")
        ,captionListSubtitle: document.querySelector("#captionListSubtitle")
        ,captionSearchInput: document.querySelector("#captionSearchInput")
        ,filterMenu: document.querySelector("#filterMenu")
        ,sortMenu: document.querySelector("#sortMenu")
        ,hashtagsPageContent: document.querySelector("#hashtagsPageContent")
        ,characterControlPageContent: document.querySelector("#characterControlPageContent")
      };
    }

    async init() {
      await this.assets.loadFonts();
      this.renderBackgroundChoices();
      this.renderCharacterControl();
      this.renderHuskyChoices();
      this.renderAlignmentButtons();
      this.bindNavigation();
      this.bindGeneratorControls();
      this.bindCaptionCenter();
      this.bindHashtagPage();
      this.bindCharacterControlPage();
      this.store.onChange(() => {
        this.renderSavedCaptionOptions();
        if (this.shouldPrefillInitialCaption) {
          this.prefillFirstSavedCaption();
          this.shouldPrefillInitialCaption = false;
        }
        this.renderCaptionTable();
      });
      this.hashtagStore.onChange(() => {
        this.renderHashtagPage();
        this.preloadGeneratorHashtags();
      });
      this.dom.captionInput.value = this.state.caption;
      this.renderGeneratorAccountOptions();
      this.renderSavedCaptionOptions();
      this.renderCaptionTable();
      this.syncGeneratorControls();
      this.renderHashtagPage();
      this.renderCharacterControlPage();
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
        await this.hashtagStore.seedDefaults(DEFAULT_HASHTAGS);
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
      if (!this.characterAvailability.accounts[generatorKey]) return;
      this.saveGeneratorState();
      this.generatorKey = generatorKey;
      this.config = GENERATORS[generatorKey];
      this.renderer.config = this.config;
      this.state = this.stateForGenerator(generatorKey);
      localStorage.setItem(LAST_GENERATOR_KEY, generatorKey);
      this.selectedSavedCaptionId = null;
      this.renderBackgroundChoices();
      this.renderCharacterControl();
      this.renderHuskyChoices();
      this.renderSavedCaptionOptions();
      this.prefillFirstSavedCaption();
      this.syncGeneratorControls();
      this.renderPreview();
      this.preloadGeneratorHashtags();
    }

    renderGeneratorAccountOptions() {
      const available = this.availableGeneratorKeys();
      if (!available.length) {
        this.dom.accountSelect.innerHTML = '<option value="">No character available</option>';
        this.dom.accountSelect.disabled = true;
        this.dom.downloadButton.disabled = true;
        return;
      }
      if (!available.includes(this.generatorKey)) this.selectGenerator(available[0]);
      this.dom.accountSelect.disabled = false;
      this.dom.accountSelect.innerHTML = available.map((key) => `<option value="${key}">${GENERATORS[key].title.toLowerCase()}</option>`).join("");
      this.dom.accountSelect.value = this.generatorKey;
      this.updateGeneratorAvailability();
    }

    updateGeneratorAvailability() {
      const corporateHasCharacters = this.generatorKey !== "donkey" || this.availableCorporateCharacters().length > 0;
      this.dom.downloadButton.disabled = !this.characterAvailability.accounts[this.generatorKey] || !corporateHasCharacters;
    }

    defaultGeneratorState(config) {
      return {
        background: config.defaultBackground,
        husky: config.defaultHusky,
        character: config.defaultCharacter || null,
        characterPoses: {},
        caption: config.defaultCaption,
        alignment: "center",
        textColor: config.textColor || "#FFFFFF",
        fontSize: config.layout.caption.fontSize
      };
    }

    readGeneratorStates() {
      try {
        return JSON.parse(localStorage.getItem(GENERATOR_STATE_KEY)) || {};
      } catch {
        return {};
      }
    }

    readCharacterAvailability() {
      const defaults = {
        accounts: { pawsitive: true, donkey: true, cow: true },
        corporateCharacters: { donkey: true, husky: true, chicken: true, gazelle: true, cat: true }
      };
      try {
        const saved = JSON.parse(localStorage.getItem(CHARACTER_AVAILABILITY_KEY)) || {};
        return {
          accounts: { ...defaults.accounts, ...saved.accounts },
          corporateCharacters: { ...defaults.corporateCharacters, ...saved.corporateCharacters }
        };
      } catch {
        return defaults;
      }
    }

    saveCharacterAvailability() {
      localStorage.setItem(CHARACTER_AVAILABILITY_KEY, JSON.stringify(this.characterAvailability));
    }

    availableGeneratorKeys() {
      return Object.keys(GENERATORS).filter((key) => this.characterAvailability.accounts[key]);
    }

    availableCorporateCharacters() {
      return GENERATORS.donkey.characters.filter((character) => this.characterAvailability.corporateCharacters[character]);
    }

    readLastGeneratorKey() {
      const storedKey = localStorage.getItem(LAST_GENERATOR_KEY);
      return GENERATORS[storedKey] ? storedKey : "pawsitive";
    }

    stateForGenerator(generatorKey) {
      const config = GENERATORS[generatorKey];
      const saved = this.generatorStates[generatorKey] || {};
      const character = config.characters?.includes(saved.character) ? saved.character : config.defaultCharacter;
      const poses = this.posePaths(config, character);
      const characterPoses = config.characters
        ? Object.fromEntries(config.characters.map((item) => {
          const characterPaths = this.posePaths(config, item);
          const savedPose = saved.characterPoses?.[item]
            || (item === config.defaultCharacter ? saved.husky : undefined);
          return [item, characterPaths.includes(savedPose) ? savedPose : characterPaths[0]];
        }))
        : {};
      const backgroundIsValid = config.allowBackgroundChoice
        ? this.assets.manifest.backgrounds.includes(saved.background)
        : saved.background === config.defaultBackground;
      return {
        ...this.defaultGeneratorState(config),
        ...saved,
        background: backgroundIsValid ? saved.background : config.defaultBackground,
        husky: config.characters
          ? characterPoses[character]
          : poses.includes(saved.husky) ? saved.husky : config.defaultHusky,
        character,
        characterPoses,
        caption: "",
        textColor: config.textColor || saved.textColor || "#FFFFFF",
        fontSize: Math.min(MAX_CAPTION_FONT_SIZE, Math.max(MIN_CAPTION_FONT_SIZE, Number(saved.fontSize) || config.layout.caption.fontSize))
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
      this.dom.characterSelect.addEventListener("change", (event) => this.selectCharacter(event.target.value));
      this.dom.captionInput.addEventListener("input", (event) => {
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
      this.dom.randomizeCaptionButton.addEventListener("click", () => this.randomizeSavedCaption());
      this.dom.resetCaptionButton.addEventListener("click", () => this.resetGeneratorCaption());
      this.dom.textColorButtons.addEventListener("click", (event) => {
        const button = event.target.closest("[data-color]");
        if (button) this.setState({ textColor: button.dataset.color });
      });
      this.dom.decreaseFontSizeButton.addEventListener("click", () => this.changeFontSize(-1));
      this.dom.increaseFontSizeButton.addEventListener("click", () => this.changeFontSize(1));
      this.dom.downloadButton.addEventListener("click", () => this.downloadPost());
      document.addEventListener("click", (event) => {
        if (!event.target.closest("#huskySelect")) this.dom.huskyOptions.classList.remove("open");
      });
    }

    bindCaptionCenter() {
      this.dom.captionAccountSelect.addEventListener("change", () => {
        this.captionView.page = 1;
        this.renderCaptionTable();
      });
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
        this.captionView.page = 1;
        this.renderCaptionTable();
      });
      this.dom.captionPagination.addEventListener("click", (event) => {
        const button = event.target.closest("[data-caption-page]");
        if (!button || button.disabled) return;
        this.captionView.page = Number(button.dataset.captionPage);
        this.renderCaptionTable();
      });
      this.bindCaptionTableInteractions();
    }

    bindHashtagPage() {
      this.dom.hashtagsPageContent.addEventListener("change", (event) => {
        const select = event.target.closest("[data-hashtag-group-select]");
        if (select) this.selectedHashtagGroups[select.dataset.hashtagGroupSelect] = select.value;
      });
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
          const input = this.dom.hashtagsPageContent.querySelector(`[data-hashtag-input="${account}"]`);
          const groupSelect = this.dom.hashtagsPageContent.querySelector(`[data-hashtag-group-select="${account}"]`);
          const selectedGroup = groupSelect?.value;
          const text = this.normalizeHashtag(input?.value || "");
          if (!text || !selectedGroup) return;
          try {
            await this.hashtagStore.add(account, selectedGroup, text);
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

    bindCharacterControlPage() {
      this.dom.characterControlPageContent.addEventListener("change", (event) => {
        const toggle = event.target.closest("[data-availability-group]");
        if (!toggle) return;
        this.characterAvailability[toggle.dataset.availabilityGroup][toggle.dataset.availabilityKey] = toggle.checked;
        this.saveCharacterAvailability();
        this.applyCharacterAvailability();
      });
    }

    applyCharacterAvailability() {
      const availableAccounts = this.availableGeneratorKeys();
      if (availableAccounts.length && !availableAccounts.includes(this.generatorKey)) {
        this.selectGenerator(availableAccounts[0]);
      } else if (this.generatorKey === "donkey") {
        const availableCharacters = this.availableCorporateCharacters();
        if (availableCharacters.length && !availableCharacters.includes(this.state.character)) {
          this.selectCharacter(availableCharacters[0]);
        }
      }
      this.renderGeneratorAccountOptions();
      this.renderCharacterControl();
      this.renderHuskyChoices();
      this.renderCharacterControlPage();
    }

    renderCharacterControlPage() {
      const accountItems = [
        ["pawsitive", "Pawsitive Husky"],
        ["donkey", "Corporate Jungle"],
        ["cow", "Mooing Aunty"]
      ];
      const corporateItems = [
        ["donkey", "Donkey"],
        ["husky", "Corporate Husky"],
        ["chicken", "Chicken"],
        ["gazelle", "Gazelle"],
        ["cat", "Cat"]
      ];
      const renderItems = (items, group) => items.map(([key, label]) => `
        <label class="availability-toggle">
          <span>${label}</span>
          <input type="checkbox" data-availability-group="${group}" data-availability-key="${key}" ${this.characterAvailability[group][key] ? "checked" : ""}>
          <span class="toggle-track" aria-hidden="true"></span>
        </label>
      `).join("");
      this.dom.characterControlPageContent.innerHTML = `
        <details class="character-control-section" open>
          <summary>Generator pages</summary>
          <div class="character-control-items">${renderItems(accountItems, "accounts")}</div>
        </details>
        <details class="character-control-section" open>
          <summary>Corporate Jungle characters</summary>
          <div class="character-control-items">${renderItems(corporateItems, "corporateCharacters")}</div>
        </details>
      `;
    }

    renderHashtagPage() {
      this.dom.hashtagsPageContent.innerHTML = Object.entries(HASHTAG_GROUPS).map(([account, config]) => {
        const isOpen = this.openHashtagAccounts.has(account);
        const arrow = isOpen ? this.assets.manifest.icons.dropdownUp : this.assets.manifest.icons.dropdownDown;
        const selectedGroup = this.selectedHashtagGroups[account] || config.groups[0][0];
        return `
          <section class="hashtag-account ${isOpen ? "open" : ""}">
            <button class="hashtag-account-toggle" type="button" data-action="toggle-account" data-account="${account}">
              <span>${config.label}</span><img src="${arrow}" alt="">
            </button>
            <div class="hashtag-account-content">
              <div class="hashtag-add-row">
                <select data-hashtag-group-select="${account}" aria-label="Choose hashtag subsection">
                  ${config.groups.map(([group, label]) => `<option value="${group}" ${group === selectedGroup ? "selected" : ""}>${label}</option>`).join("")}
                </select>
                <input type="text" data-hashtag-input="${account}" placeholder="Add hashtag" aria-label="Add hashtag">
                <button class="hashtag-save-button" type="button" data-action="save-hashtag" data-account="${account}">Save</button>
              </div>
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
            ${hashtags.map((hashtag) => `<span class="hashtag-chip">#${hashtag.text}${isEditing ? `<button type="button" data-action="delete-hashtag" data-hashtag-id="${hashtag.id}" aria-label="Delete #${hashtag.text}"><img src="assets/icons/Close small.svg" alt=""></button>` : ""}</span>`).join("")}
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

    posePaths(config = this.config, character = this.state?.character) {
      if (config.characterPoseSet) return this.assets.manifest[config.characterPoseSet]?.[character] || [];
      return this.assets.manifest[config.poseSet] || [];
    }

    renderCharacterControl() {
      const hasCharacters = Boolean(this.config.characters);
      this.dom.characterControl.classList.toggle("is-hidden", !hasCharacters);
      this.dom.characterPoseRow.classList.toggle("character-hidden", !hasCharacters);
      if (!hasCharacters) return;
      const characters = this.availableCorporateCharacters();
      this.dom.characterSelect.disabled = !characters.length;
      this.dom.characterSelect.innerHTML = characters.length
        ? characters.map((character) => `<option value="${character}">${character === "husky" ? "Corporate Husky" : character[0].toUpperCase() + character.slice(1)}</option>`).join("")
        : '<option value="">No character available</option>';
      if (characters.includes(this.state.character)) this.dom.characterSelect.value = this.state.character;
      this.updateGeneratorAvailability();
    }

    selectCharacter(character) {
      if (!this.config.characters?.includes(character) || !this.characterAvailability.corporateCharacters[character]) return;
      const poses = this.posePaths(this.config, character);
      this.setState({
        character,
        husky: this.state.characterPoses?.[character] || poses[0] || this.config.defaultHusky
      });
      this.renderHuskyChoices();
    }

    renderHuskyChoices() {
      this.dom.huskyOptions.innerHTML = "";
      const paths = this.config.characters && !this.characterAvailability.corporateCharacters[this.state.character]
        ? []
        : this.posePaths();
      this.dom.huskyButton.disabled = !paths.length;
      paths.forEach((path) => {
        const option = document.createElement("button");
        option.className = "image-option";
        option.type = "button";
        option.role = "option";
        option.dataset.path = path;
        option.innerHTML = `<img src="${path}" alt=""><span>${this.fileLabel(path)}</span>`;
        option.addEventListener("click", () => {
          const characterPoses = this.config.characters
            ? { ...this.state.characterPoses, [this.state.character]: path }
            : this.state.characterPoses;
          this.setState({ husky: path, characterPoses });
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
      const allCaptions = this.store.list(this.config.accountKey)
        .filter((caption) => (caption.status || "unused") === "unused")
        // The generator works through the oldest saved captions first.
        // Caption Center keeps its own manually managed display order.
        .sort((first, second) => this.captionTime(first) - this.captionTime(second));
      const captions = allCaptions.filter((caption) => !caption.restored)
        .concat(allCaptions.filter((caption) => caption.restored));
      this.dom.savedCaptionSelect.innerHTML = '<option value="">Choose a saved caption</option>';
      const addOptions = (items, container, startIndex) => items.forEach((caption, index) => {
        const option = document.createElement("option");
        option.value = caption.id;
        option.textContent = `${startIndex + index + 1}. ${caption.caption.replace(/\s+/g, " ").slice(0, 70)}`;
        container.append(option);
      });
      const standardCaptions = captions.filter((caption) => !caption.restored);
      const restoredCaptions = captions.filter((caption) => caption.restored);
      addOptions(standardCaptions, this.dom.savedCaptionSelect, 0);
      if (restoredCaptions.length) {
        const restoredGroup = document.createElement("optgroup");
        restoredGroup.label = "Restored";
        addOptions(restoredCaptions, restoredGroup, standardCaptions.length);
        this.dom.savedCaptionSelect.append(restoredGroup);
      }
      if (this.selectedSavedCaptionId && captions.some((caption) => caption.id === this.selectedSavedCaptionId)) {
        this.dom.savedCaptionSelect.value = this.selectedSavedCaptionId;
      } else {
        this.selectedSavedCaptionId = null;
      }
    }

    prefillFirstSavedCaption() {
      const firstCaption = this.store.list(this.config.accountKey)
        .filter((caption) => (caption.status || "unused") === "unused")
        .sort((first, second) => this.captionTime(first) - this.captionTime(second))[0];
      if (!firstCaption) return;
      this.selectedSavedCaptionId = firstCaption.id;
      this.dom.savedCaptionSelect.value = firstCaption.id;
      this.setState({ caption: firstCaption.caption });
    }

    randomizeSavedCaption() {
      const captions = this.store.list(this.config.accountKey)
        .filter((caption) => (caption.status || "unused") === "unused");
      if (!captions.length) return;
      const alternatives = captions.filter((caption) => caption.id !== this.selectedSavedCaptionId);
      const pool = alternatives.length ? alternatives : captions;
      const caption = pool[Math.floor(Math.random() * pool.length)];
      this.selectedSavedCaptionId = caption.id;
      this.dom.savedCaptionSelect.value = caption.id;
      this.setState({ caption: caption.caption });
    }

    changeFontSize(amount) {
      const fontSize = Math.min(MAX_CAPTION_FONT_SIZE, Math.max(MIN_CAPTION_FONT_SIZE, this.state.fontSize + amount));
      if (fontSize !== this.state.fontSize) this.setState({ fontSize });
    }

    renderCaptionTable() {
      const captions = this.visibleCaptions();
      const subtitle = this.captionView.filter === "used"
        ? `Showing <span class="caption-status-word used">Used</span> captions <span class="caption-count">(${captions.length})</span>`
        : this.captionView.filter === "unused"
          ? `Showing <span class="caption-status-word unused">Unused</span> captions <span class="caption-count">(${captions.length})</span>`
          : `Showing all captions <span class="caption-count">(${captions.length})</span>`;
      this.dom.captionListSubtitle.innerHTML = subtitle;
      this.dom.captionTableBody.innerHTML = "";
      const pageCount = Math.max(1, Math.ceil(captions.length / this.captionView.pageSize));
      this.captionView.page = Math.min(Math.max(1, this.captionView.page), pageCount);
      const start = (this.captionView.page - 1) * this.captionView.pageSize;
      const pageCaptions = captions.slice(start, start + this.captionView.pageSize);
      if (!captions.length) {
        this.dom.captionTableBody.innerHTML = '<tr><td class="empty-row">No captions match this view.</td></tr>';
        this.renderCaptionPagination(0, 0);
        return;
      }
      pageCaptions.forEach((caption, index) => {
        const previousCaption = captions[start + index - 1];
        if (this.captionView.filter === "unused" && caption.restored && !previousCaption?.restored) {
          const sectionRow = document.createElement("tr");
          sectionRow.className = "restored-section";
          sectionRow.innerHTML = '<td>Restored</td>';
          this.dom.captionTableBody.append(sectionRow);
        }
        const row = document.createElement("tr");
        row.dataset.captionId = caption.id;
        row.innerHTML = '<td class="caption-cell"></td>';
        const cell = row.querySelector(".caption-cell");
        if (this.captionView.management) {
          cell.innerHTML = `
            <span class="caption-text"></span>
            ${caption.status === "used" ? `<button class="row-restore-button" type="button" data-action="restore" aria-label="Restore caption to unused"><img src="${this.assets.manifest.icons.restore}" alt=""></button>` : ""}
            <button class="row-delete-button" type="button" data-action="delete-now" aria-label="Delete caption"><img src="${this.assets.manifest.icons.delete}" alt=""></button>
          `;
          cell.querySelector(".caption-text").textContent = caption.caption;
        } else {
          cell.innerHTML = '<span class="caption-text"></span>';
          cell.querySelector(".caption-text").textContent = caption.caption;
        }
        this.dom.captionTableBody.append(row);
      });
      this.renderCaptionPagination(captions.length, pageCount);
    }

    renderCaptionPagination(total, pageCount) {
      if (pageCount <= 1) {
        this.dom.captionPagination.innerHTML = "";
        return;
      }
      const first = (this.captionView.page - 1) * this.captionView.pageSize + 1;
      const last = Math.min(total, this.captionView.page * this.captionView.pageSize);
      this.dom.captionPagination.innerHTML = `
        <span class="caption-page-summary">${first}–${last} of ${total}</span>
        <button type="button" data-caption-page="${this.captionView.page - 1}" ${this.captionView.page === 1 ? "disabled" : ""}>Previous</button>
        <span class="caption-page-current">Page ${this.captionView.page} of ${pageCount}</span>
        <button type="button" data-caption-page="${this.captionView.page + 1}" ${this.captionView.page === pageCount ? "disabled" : ""}>Next</button>
      `;
    }

    visibleCaptions() {
      const accountKey = this.dom.captionAccountSelect.value;
      let captions = this.store.list(accountKey);
      if (this.captionView.filter !== "all") captions = captions.filter((caption) => (caption.status || "unused") === this.captionView.filter);
      const query = this.captionView.query.trim().toLowerCase();
      if (query) captions = captions.filter((caption) => caption.caption.toLowerCase().includes(query));
      if (this.captionView.management) {
        if (this.captionView.filter === "used") {
          captions.sort((first, second) => this.captionUsedTime(second) - this.captionUsedTime(first));
        } else {
          captions.sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0));
        }
      } else if (this.captionView.sort === "latest") {
        captions.sort((first, second) => this.captionTime(second) - this.captionTime(first));
      } else if (this.captionView.sort === "earliest") {
        captions.sort((first, second) => this.captionTime(first) - this.captionTime(second));
      } else {
        captions.sort((first, second) => this.captionOrder(first) - this.captionOrder(second));
      }
      if (this.captionView.filter === "unused") {
        captions = captions.filter((caption) => !caption.restored).concat(captions.filter((caption) => caption.restored));
      }
      return captions;
    }

    captionTime(caption) {
      return caption.updatedAt || caption.createdAt || 0;
    }

    captionUsedTime(caption) {
      return caption.usedAt || caption.updatedAt || caption.createdAt || 0;
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
        .filter((caption) => (caption.status || "unused") === "unused" && caption.id !== excludedId)
        // Match the saved-caption dropdown: use the oldest remaining caption first.
        .sort((first, second) => this.captionTime(first) - this.captionTime(second))[0] || null;
    }

    handleCaptionToolbar(event) {
      const button = event.target.closest("[data-action], [data-filter], [data-sort]");
      if (!button) return;
      const action = button.dataset.action;
      if (button.dataset.filter) {
        this.captionView.filter = button.dataset.filter;
        this.captionView.page = 1;
        this.closeToolbarMenus();
        this.renderCaptionTable();
        return;
      }
      if (button.dataset.sort) {
        this.captionView.sort = button.dataset.sort;
        this.captionView.page = 1;
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
        this.captionView.page = 1;
        this.dom.captionSearchInput.value = "";
        this.syncCaptionToolbar();
        this.renderCaptionTable();
      } else if (action === "toggle-filter") {
        this.toggleToolbarMenu(this.dom.filterMenu);
      } else if (action === "toggle-sort") {
        this.toggleToolbarMenu(this.dom.sortMenu);
      } else if (action === "download-csv") {
        this.downloadCaptionsCsv();
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
      this.captionView.searchOpen = false;
      this.captionView.query = "";
      this.dom.captionSearchInput.value = "";
      this.captionView.management = true;
      this.captionView.page = 1;
      this.captionView.order = [];
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
        } else if (action.type === "restore") {
          await this.store.update(action.id, action.before);
          this.renderCaptionTable();
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
        } else if (action.type === "restore") {
          await this.store.update(action.id, action.after);
          this.renderCaptionTable();
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
      this.captionView.page = 1;
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
          if (event.target.closest('[data-action="restore"]')) await this.restoreCaption(id);
          if (event.target.closest('[data-action="delete-now"]')) await this.deleteCaptionNow(id);
          return;
        }
        // Let textarea clicks keep their native caret position instead of reopening the editor.
        if (event.target.closest(".inline-caption-editor, .inline-caption-actions")) return;
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

    async restoreCaption(id) {
      const caption = this.store.list(this.dom.captionAccountSelect.value).find((item) => item.id === id);
      if (!caption || caption.status !== "used") return;
      const before = {
        status: caption.status,
        restored: Boolean(caption.restored),
        restoredAt: caption.restoredAt || null
      };
      const after = { status: "unused", restored: true, restoredAt: Date.now() };
      try {
        await this.store.update(id, after);
        this.addManagementHistory({ type: "restore", id, before, after });
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("Caption could not be restored. Check your Firebase setup.", true);
      }
    }

    downloadCaptionsCsv() {
      const captions = this.visibleCaptions();
      const account = this.dom.captionAccountSelect.value;
      const escapeCsv = (value) => {
        const text = String(value ?? "");
        const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
      };
      const rows = [
        ["Caption", "Status", "Created at", "Last updated", "Used at", "Restored"],
        ...captions.map((caption) => [
          caption.caption,
          caption.status || "unused",
          caption.createdAt ? new Date(caption.createdAt).toLocaleString("en-IN") : "",
          caption.updatedAt ? new Date(caption.updatedAt).toLocaleString("en-IN") : "",
          caption.usedAt ? new Date(caption.usedAt).toLocaleString("en-IN") : "",
          caption.restored ? "Yes" : "No"
        ])
      ];
      const blob = new Blob([rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${account}-${this.captionView.filter}-captions.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      this.setCaptionStorageStatus(`${captions.length} caption${captions.length === 1 ? "" : "s"} downloaded as CSV.`);
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
      const resultIndex = this.visibleCaptions().findIndex((caption) => caption.id === id);
      this.captionView.page = resultIndex < 0 ? 1 : Math.floor(resultIndex / this.captionView.pageSize) + 1;
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
          await this.store.update(usedCaptionId, { status: "used", usedAt: Date.now() });
        } else {
          await this.store.add(this.config.accountKey, captionText, {
            status: "used",
            usedAt: Date.now(),
            sortOrder: this.nextCaptionSortOrder(this.config.accountKey)
          });
        }
      } catch (error) {
        console.error(error);
        this.setCaptionStorageStatus("The download completed, but the caption status could not be saved.", true);
      }

      const nextCharacter = this.config.characters
        ? this.nextItem(this.config.characters, this.state.character)
        : this.state.character;
      const currentPoses = this.posePaths();
      const nextPoses = this.posePaths(this.config, nextCharacter);
      const advancedCurrentPose = this.nextItem(currentPoses, this.state.husky);
      const characterPoses = this.config.characters
        ? { ...this.state.characterPoses, [this.state.character]: advancedCurrentPose }
        : this.state.characterPoses;
      const nextPose = this.config.characters
        ? characterPoses[nextCharacter] || nextPoses[0] || this.config.defaultHusky
        : advancedCurrentPose;
      const nextCaption = usedCaptionId ? this.nextUnusedCaption(usedCaptionId) : null;
      this.selectedSavedCaptionId = nextCaption?.id || null;
      const patch = {
        caption: nextCaption?.caption || "",
        husky: nextPose,
        character: nextCharacter,
        characterPoses
      };

      this.setState(patch);
      this.renderCharacterControl();
      this.renderHuskyChoices();
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
      if (this.config.characters) this.dom.characterSelect.value = this.state.character;
      this.dom.fontSizeValue.value = `${this.state.fontSize}px`;
      this.dom.fontSizeValue.textContent = `${this.state.fontSize}px`;
      this.dom.decreaseFontSizeButton.disabled = this.state.fontSize <= MIN_CAPTION_FONT_SIZE;
      this.dom.increaseFontSizeButton.disabled = this.state.fontSize >= MAX_CAPTION_FONT_SIZE;
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
      if (this.dom.huskyButton.disabled || !this.state.husky) {
        this.dom.huskyButton.innerHTML = "<span>No character available</span>";
        return;
      }
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
