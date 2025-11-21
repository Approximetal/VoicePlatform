document.addEventListener("DOMContentLoaded", () => {
  const anchors = document.querySelectorAll('a[href^="#"]');

  anchors.forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (!targetElement) return;

      event.preventDefault();
      targetElement.scrollIntoView({ behavior: "smooth" });
    });
  });

  const tabPanels = document.querySelectorAll(".tab-panel");
  tabPanels.forEach((panel) => {
    const tabButtons = panel.querySelectorAll(".tab-button");
    const tabContents = panel.querySelectorAll(".tab-panel__content");

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.target;
        if (!targetId) return;

        tabButtons.forEach((btn) =>
          btn.classList.toggle("is-active", btn === button)
        );

        tabContents.forEach((content) => {
          content.classList.toggle("is-active", content.id === targetId);
        });

        scheduleWaveformRefresh();
      });
    });
  });

  window.addEventListener("resize", scheduleWaveformRefresh);

  initVideoTranslationSection();
  initSpeechEditingSection();
  initAudioProcessingSection();
  initSpeechSynthesisSection();
  initSpeechRecognitionSection();
  initVideoEditingSection();
});

let activeSpeechAudio = null;
let activeSpeechAudioButton = null;
let sharedAudioContext = null;
const waveformCanvases = new Set();
let waveformRefreshScheduled = false;

async function initVideoTranslationSection() {
  const manifestUrl = "assets/video_translation_demos.json";
  const thumbnailsContainer = document.getElementById("video-demos-list");
  const videoPlayer = document.getElementById("video-demo-player");
  const videoSource = document.getElementById("video-demo-source");
  const sourceLangEl = document.getElementById("video-source-language");
  const targetSelect = document.getElementById("video-target-select");
  const selectWrapper = document.querySelector(".meta-select-wrapper");

  if (
    !thumbnailsContainer ||
    !videoPlayer ||
    !videoSource ||
    !sourceLangEl ||
    !targetSelect
  ) {
    console.warn("Video translation section containers missing");
    return;
  }

  videoPlayer.addEventListener("loadedmetadata", () => {
    videoPlayer.controls = true;
  });

  let manifest;
  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load video translation manifest:", error);
    thumbnailsContainer.textContent = "无法加载视频翻译示例 · Failed to load demos.";
    return;
  }

  const demos = Array.isArray(manifest?.demos) ? manifest.demos : [];
  if (!demos.length) {
    thumbnailsContainer.textContent = "尚未添加视频示例 · No demos available.";
    return;
  }

  let activeDemoId = null;
  let activeTranslationCode = null;
  let currentDemo = null;
  const translationMap = new Map();

  targetSelect.addEventListener("change", handleTargetChange);

  function renderTargets(demo) {
    currentDemo = demo;
    translationMap.clear();

    targetSelect.innerHTML = "";
    targetSelect.disabled = true;
    activeTranslationCode = null;
    selectWrapper?.classList.add("is-disabled");

    videoSource.src = demo.originalVideo || "";
    videoPlayer.poster = demo.thumbnail || "";
    videoPlayer.load();
    videoPlayer.controls = true;

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = demo.translations?.length
      ? "原视频 / Original Video"
      : "暂无可选目标语言 / No translations";
    targetSelect.appendChild(defaultOption);

    if (demo.translations?.length) {
      targetSelect.disabled = false;
      selectWrapper?.classList.remove("is-disabled");

      demo.translations.forEach((translation) => {
        const option = document.createElement("option");
        option.value = translation.code;
        option.textContent = `${translation.labelNative} / ${translation.labelEnglish}`;
        option.dataset.videoSrc = translation.video;
        targetSelect.appendChild(option);
        translationMap.set(translation.code, translation);
      });
    }

    targetSelect.value = "";
    handleTargetChange();
  }

  function setActiveDemo(demoId) {
    const demo = demos.find((item) => item.id === demoId);
    if (!demo) return;

    activeDemoId = demoId;
    sourceLangEl.textContent = `${demo.sourceLanguage.labelNative} / ${demo.sourceLanguage.labelEnglish}`;

    renderTargets(demo);
    updateThumbnailState();
  }

  function updateThumbnailState() {
    const items = thumbnailsContainer.querySelectorAll(
      ".thumbnail-strip__item"
    );
    items.forEach((item) => {
      item.classList.toggle(
        "is-active",
        item.dataset.demoId === activeDemoId
      );
    });
  }

  thumbnailsContainer.innerHTML = "";
  demos.forEach((demo) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "thumbnail-strip__item";
    item.dataset.demoId = demo.id;
    item.title = `${demo.title} (${demo.sourceLanguage.labelNative} / ${demo.sourceLanguage.labelEnglish})`;
    item.setAttribute(
      "aria-label",
      `${demo.title} ${demo.sourceLanguage.labelNative} ${demo.sourceLanguage.labelEnglish}`
    );

    const thumb = document.createElement("img");
    thumb.src = demo.thumbnail || "";
    thumb.alt = `${demo.title} thumbnail`;
    thumb.className = "thumbnail-strip__thumb";

    item.appendChild(thumb);
    item.addEventListener("click", () => setActiveDemo(demo.id));
    thumbnailsContainer.appendChild(item);
  });

  setActiveDemo(demos[0].id);

  function handleTargetChange() {
    if (!currentDemo) return;
    const selectedCode = targetSelect.value;

    if (!selectedCode) {
      activeTranslationCode = null;
      videoSource.src = currentDemo.originalVideo || "";
      videoPlayer.poster = currentDemo.thumbnail || "";
      videoPlayer.load();
      videoPlayer.controls = true;
      return;
    }

    const translation = translationMap.get(selectedCode);
    if (!translation) return;

    activeTranslationCode = translation.code;
    videoSource.src = translation.video || currentDemo.originalVideo || "";
    videoPlayer.poster = currentDemo.thumbnail || "";
    videoPlayer.load();
    videoPlayer.controls = true;
  }
}

async function initVideoEditingSection() {
  const lipListEl = document.getElementById("lip-sync-case-list");
  const motionListEl = document.getElementById("motion-transfer-case-list");
  const lipVideo = document.getElementById("lip-sync-video");
  const motionVideo = document.getElementById("motion-transfer-video");
  const lipVideoToggle = document.getElementById("lip-sync-video-toggle");
  const lipVideoSource = lipVideo?.querySelector("source");
  const motionVideoSource = motionVideo?.querySelector("source");
  
  if (!lipListEl || !motionListEl || !lipVideo || !motionVideo) {
    return;
  }

  const manifestUrl = "assets/video_editing_demos.json";
  let manifest;
  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load video editing manifest:", error);
    lipListEl.innerHTML =
      "<p class='speech-editing__placeholder'>无法加载口型同步示例 · Failed to load data.</p>";
    motionListEl.innerHTML =
      "<p class='speech-editing__placeholder'>无法加载动作迁移示例 · Failed to load data.</p>";
    return;
  }

  const lipCases = (manifest?.lipSync || []).map((entry, index) => {
    return {
      id: entry.id || `lip-${index + 1}`,
      title: entry.title || `Case ${index + 1}`,
      subtitle: entry.subtitle || entry.id || `Lip ${index + 1}`,
      videos: entry.videos || {},
      duration: entry.duration || "",
      language: entry.language || deriveLangFromPath(entry.videos?.original) || "",
      targetLanguage:
        entry.targetLanguage ||
        deriveLangFromPath(entry.videos?.translated || entry.videos?.edited) ||
        "",
    };
  });

  const motionCases = (manifest?.motionTransfer || []).map((entry, index) => ({
    id: entry.id || `motion-${index + 1}`,
    title: entry.title || `Motion Transfer ${index + 1}`,
    subtitle: entry.subtitle || entry.id || `Motion ${index + 1}`,
    video: entry.video || "",
    duration: entry.duration || "",
    language: entry.language || "",
  }));

  let activeLipId = lipCases[0]?.id ?? null;
  let activeLipVariant = "original";
  let activeMotionId = motionCases[0]?.id ?? null;

  const lipOverlayButtons = lipVideoToggle
    ? Array.from(lipVideoToggle.querySelectorAll(".video-editing__variant-button"))
    : [];
  let lipCardVariantButtons = [];

  lipOverlayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setLipVariant(button.dataset.variant);
    });
  });

  function deriveLangFromPath(path) {
    if (!path) return "";
    const file = path.split("/").pop() || "";
    const match = file.match(/_([a-z]{2})\.mp4$/i);
    if (match) return match[1];
    const alt = file.match(/-([a-z]{2})\.mp4$/i);
    return alt ? alt[1] : "";
  }

  function renderList(container, items, activeId, onSelect, options = {}) {
    console.log("renderList items", options.type, items);
    const isLipList = options.type === "lip";
    if (isLipList) {
      lipCardVariantButtons = [];
    }
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML =
        "<p class='speech-editing__placeholder'>暂无示例 · No demos available.</p>";
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "recognition-list__item video-editing__case-card";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      if (item.id === activeId) card.classList.add("is-active");
      const activate = () => onSelect(item);
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });

      const title = document.createElement("span");
      title.textContent = item.title;
      const subtitle = document.createElement("small");
      subtitle.textContent = formatDurationLabel(item.duration);
      card.append(title, subtitle);
      if (isLipList) {
        card.appendChild(createInlineVariantButtons(item));
      }
      container.appendChild(card);
    });
  }

  function setVariantButton(btn, code, label = "", options = {}) {
    if (!btn) return;
    const { hideLabel = false } = options;
    const normalizedCode = (code || "--").toUpperCase();
    btn.innerHTML = "";
    const tag = document.createElement("span");
    tag.className = "video-editing__variant-code";
    tag.textContent = normalizedCode;
    btn.append(tag);
    if (!hideLabel && label) {
      const span = document.createElement("span");
      span.textContent = label;
      btn.append(span);
    }
    btn.setAttribute("aria-label", label || normalizedCode);
    btn.dataset.lang = normalizedCode;
  }

function createInlineVariantButtons(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "video-editing__variant video-editing__variant--inline";
    wrapper.setAttribute("role", "group");
    const originalLang =
      item.language || deriveLangFromPath(item.videos.original) || "OR";
    const targetLang =
      item.targetLanguage ||
      deriveLangFromPath(item.videos.translated || item.videos.edited) ||
      "ED";
    return wrapper;
  }

  function createVariantOptionButton(item, variant, langCode, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "video-editing__variant-button video-editing__variant-button--inline";
    button.dataset.variant = variant;
    button.dataset.caseId = item.id;
    setVariantButton(button, langCode, label);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (activeLipId !== item.id) {
        selectLipCase(item);
      }
      setLipVariant(variant);
    });
    lipCardVariantButtons.push(button);
    return button;
  }

  function setLipVariant(variant) {
    if (variant !== "original" && variant !== "edited") return;
    if (variant === activeLipVariant) {
      updateVariantButtonStates();
      return;
    }
    activeLipVariant = variant;
    updateLipVideo();
  }

  function updateVariantButtonStates() {
    lipOverlayButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.variant === activeLipVariant);
    });
    lipCardVariantButtons.forEach((btn) => {
      const matchesVariant = btn.dataset.variant === activeLipVariant;
      const matchesCase = btn.dataset.caseId === activeLipId;
      btn.classList.toggle("is-active", matchesVariant && matchesCase);
    });
  }

  function updateLipVideo() {
    const current = lipCases.find((item) => item.id === activeLipId);
    if (!current) return;
    const originalLang =
      current.language ||
      deriveLangFromPath(current.videos.original) ||
      "OR";
    const targetLang =
      current.targetLanguage ||
      deriveLangFromPath(current.videos.translated || current.videos.edited) ||
      "ED";

    setVariantButton(
      lipVideoToggle?.querySelector('[data-variant="original"]'),
      originalLang,
      "原视频",
      { hideLabel: true }
    );
    setVariantButton(
      lipVideoToggle?.querySelector('[data-variant="edited"]'),
      targetLang,
      "译制",
      { hideLabel: true }
    );

    const videoSrc =
      activeLipVariant === "edited"
        ? current.videos.translated || current.videos.edited || current.videos.original
        : current.videos.original || current.videos.translated;

    if (lipVideoSource) {
      lipVideoSource.src = videoSrc || "";
    } else if (videoSrc) {
      lipVideo.src = videoSrc;
    } else {
      lipVideo.removeAttribute("src");
    }
    lipVideo.pause();
    lipVideo.load();
    updateVariantButtonStates();
  }

  function selectLipCase(item) {
    activeLipId = item.id;
    activeLipVariant = "original";
    renderList(lipListEl, lipCases, activeLipId, selectLipCase, {
      type: "lip",
    });
    updateLipVideo();
  }

  function updateMotionVideo() {
    const current = motionCases.find((item) => item.id === activeMotionId);
    if (!current) return;
    if (motionVideoSource) {
      motionVideoSource.src = current.video || "";
    } else if (current.video) {
      motionVideo.src = current.video;
    } else {
      motionVideo.removeAttribute("src");
    }
    motionVideo.pause();
    motionVideo.load();
  }

  function selectMotionCase(item) {
    activeMotionId = item.id;
    renderList(motionListEl, motionCases, activeMotionId, selectMotionCase);
    updateMotionVideo();
  }

  if (lipCases.length) {
    selectLipCase(lipCases[0]);
  } else {
    lipListEl.innerHTML =
      "<p class='speech-editing__placeholder'>暂无口型同步示例 · No lip sync demos.</p>";
  }

  if (motionCases.length) {
    selectMotionCase(motionCases[0]);
  } else {
    motionListEl.innerHTML =
      "<p class='speech-editing__placeholder'>暂无动作迁移示例 · No motion demos.</p>";
  }
}

async function initSpeechEditingSection() {
  const listEl = document.getElementById("speech-editing-list");
  if (!listEl) return;

  const manifestUrl = "assets/speech_editing_demos.json";
  let manifest;

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load speech editing manifest:", error);
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>无法加载语音编辑示例 · Failed to load data.</p>";
    return;
  }

  const examples = Array.isArray(manifest?.examples)
    ? manifest.examples
    : [];

  if (!examples.length) {
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>尚无语音编辑示例 · No examples available.</p>";
    return;
  }

  listEl.innerHTML = "";
  examples.forEach((example) => {
    listEl.appendChild(renderSpeechEditingExample(example));
  });
}

async function initSpeechSynthesisSection() {
  const listEl = document.getElementById("synthesis-list");
  if (!listEl) return;

  const manifestUrl = "assets/speech_synthesis_demos.json";
  let manifest;

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load speech synthesis manifest:", error);
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>无法加载语音合成示例。</p>";
    return;
  }

  const demos = Array.isArray(manifest?.demos) ? manifest.demos : [];
  if (!demos.length) {
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>尚未添加语音合成示例。</p>";
    return;
  }

  listEl.innerHTML = "";
  demos.forEach((demo) => {
    listEl.appendChild(createSynthesisCard(demo));
  });
  scheduleWaveformRefresh();
}

function renderSpeechEditingExample(example) {
  const wrapper = document.createElement("div");
  wrapper.className = "edit-example";

  const langBlock = document.createElement("div");
  langBlock.className = "edit-example__lang";
  const langCode = (example.language?.code || "--").split("-")[0].toUpperCase();
  langBlock.textContent = langCode;

  const textParagraph = document.createElement("p");
  textParagraph.className = "edit-example__text";
  const segments = Array.isArray(example.segments) ? example.segments : [];

  if (!segments.length) {
    textParagraph.textContent = example.text?.edited ?? "";
  } else {
    segments.forEach((segment) => {
      if (segment.type === "diff") {
        textParagraph.appendChild(
          createDiffHighlight(segment.before, segment.after)
        );
      } else {
        textParagraph.append(document.createTextNode(segment.text ?? ""));
      }
    });
  }

  const audioControls = document.createElement("div");
  audioControls.className = "edit-audio-controls";
  audioControls.append(
    createAudioButton("编辑前", "Before", example.audio?.before),
    createAudioButton("编辑后", "After", example.audio?.after)
  );

  wrapper.append(langBlock, textParagraph, audioControls);
  return wrapper;
}

function createSynthesisCard(entry) {
  const card = document.createElement("article");
  card.className = "synthesis-card";
  card.append(
    createSynthesisBlock("source", entry.sourceLanguage, entry.sourceText, entry.sourceAudio),
    createSynthesisBlock("target", entry.targetLanguage, entry.targetText, entry.targetAudio)
  );
  return card;
}

function createSynthesisBlock(role, langCode, text, audioSrc) {
  const block = document.createElement("div");
  block.className = "synthesis-card__block";

  const textRow = document.createElement("div");
  textRow.className = "synthesis-card__text-row";

  const langLabel = (langCode || (role === "source" ? "SRC" : "TGT")).toUpperCase();
  const labelEl = document.createElement("span");
  labelEl.className = "synthesis-card__label";
  labelEl.textContent = `${langLabel}:`;

  const textEl = document.createElement("p");
  textEl.className = "synthesis-card__text";
  textEl.textContent = text || "--";

  textRow.append(labelEl, textEl);

  block.append(textRow, createSynthesisWaveTrack(audioSrc));
  return block;
}

function createSynthesisWaveTrack(audioSrc) {
  const wrapper = document.createElement("div");
  wrapper.className = "wave-track wave-track--synthesis";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "audio-button wave-track__button";
  button.textContent = "▶";

  const content = document.createElement("div");
  content.className = "wave-track__content";
  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "wave-track__canvas";
  const canvas = document.createElement("canvas");
  canvasWrapper.appendChild(canvas);
  content.appendChild(canvasWrapper);

  const audio = document.createElement("audio");
  audio.className = "audio-hidden";
  audio.src = audioSrc;
  audio.preload = "auto";

  wrapper.append(button, content, audio);

  button.addEventListener("click", () => {
    if (activeSpeechAudio && activeSpeechAudio !== audio) {
      activeSpeechAudio.pause();
      activeSpeechAudioButton?.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }

    if (audio.paused || audio.ended) {
      audio.play();
      activeSpeechAudio = audio;
      activeSpeechAudioButton = button;
      button.classList.add("is-playing");
    } else {
      audio.pause();
      audio.currentTime = 0;
      button.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
  });

  audio.addEventListener("ended", () => {
    button.classList.remove("is-playing");
    if (activeSpeechAudio === audio) {
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
    updateWaveformCanvas(canvas, canvas._peaks, 0);
    audio.currentTime = 0;
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const progress = audio.currentTime / audio.duration;
    updateWaveformCanvas(canvas, canvas._peaks, progress);
  });

  const seekHandler = createSeekHandler(audio, canvas);
  canvas.addEventListener("pointerdown", seekHandler.onPointerDown);

  requestAnimationFrame(() => {
    const waveformSrc = deriveWaveformUrl(audioSrc);
    prepareWaveform(canvas, audioSrc, {
      height: 56,
      waveformSrc,
      enableWaveform: true,
    });
    scheduleWaveformRefresh();
  });

  return wrapper;
}

function createDiffHighlight(before, after) {
  const wrapper = document.createElement("span");
  wrapper.className = "edit-highlight";
  const delEl = document.createElement("del");
  delEl.textContent = before ?? "";
  const afterEl = document.createElement("span");
  afterEl.className = "edit-new";
  afterEl.textContent = after ?? "";
  wrapper.append(delEl, afterEl);
  return wrapper;
}

function createAudioButton(labelNative, labelEnglish, src, options = {}) {
  const { hideLabel = false } = options;
  const container = document.createElement("div");
  container.className = "audio-control";

  const labelSpan = document.createElement("span");
  labelSpan.className = "edit-audio-label";
  labelSpan.textContent = `${labelNative} / ${labelEnglish}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "audio-button";
  button.textContent = "▶";
  button.disabled = !src;

  if (!hideLabel) {
    container.appendChild(labelSpan);
  }
  button.setAttribute("aria-label", `${labelNative} / ${labelEnglish}`);
  container.appendChild(button);

  if (!src) {
    return container;
  }

  const audio = document.createElement("audio");
  audio.className = "audio-hidden";
  audio.src = src;
  audio.preload = "none";
  container.append(audio);

  button.addEventListener("click", () => {
    if (!audio) return;
    if (activeSpeechAudio && activeSpeechAudio !== audio) {
      activeSpeechAudio.pause();
      activeSpeechAudio.currentTime = 0;
      activeSpeechAudioButton?.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }

    if (audio.paused || audio.ended) {
      audio.play();
      activeSpeechAudio = audio;
      activeSpeechAudioButton = button;
      button.classList.add("is-playing");
    } else {
      audio.pause();
      audio.currentTime = 0;
      button.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
  });

  audio.addEventListener("ended", () => {
    button.classList.remove("is-playing");
    if (activeSpeechAudio === audio) {
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
    audio.currentTime = 0;
  });

  return container;
}

async function initAudioProcessingSection() {
  const denoiseList = document.getElementById("denoise-list");
  const upsamplingList = document.getElementById("upsampling-list");
  const separationList = document.getElementById("separation-list");

  if (!denoiseList || !upsamplingList || !separationList) return;

  const manifestUrl = "assets/audio_processing_demos.json";
  let manifest;

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load audio processing manifest:", error);
    const message = "<p class='speech-editing__placeholder'>无法加载音频处理示例。</p>";
    denoiseList.innerHTML = upsamplingList.innerHTML = separationList.innerHTML = message;
    return;
  }

  renderComparisonList(denoiseList, manifest?.denoise ?? [], {
    beforeLabelNative: "降噪前",
    beforeLabelEnglish: "Before",
    afterLabelNative: "降噪后",
    afterLabelEnglish: "After",
  });

  renderComparisonList(upsamplingList, manifest?.upsampling ?? [], {
    beforeLabelNative: "原音频",
    beforeLabelEnglish: "Original",
    afterLabelNative: "上采样音频",
    afterLabelEnglish: "Upsampled",
  });

  renderSeparationTracks(separationList, manifest?.separation?.tracks ?? []);
  scheduleWaveformRefresh();
}



async function initSpeechRecognitionSection() {
  const listEl = document.getElementById("recognition-list");
  const viewerEl = document.getElementById("recognition-viewer");
  if (!listEl || !viewerEl) return;

  const manifestUrl = "assets/speech_recognition_demos.json";
  const langMap = {
    zh: "中文 / Chinese",
    en: "英语 / English",
    ja: "日语 / Japanese",
    ko: "韩语 / Korean",
    fr: "法语 / French",
    es: "西班牙语 / Spanish",
    de: "德语 / German",
    it: "意大利语 / Italian",
    ru: "俄语 / Russian",
    pt: "葡萄牙语 / Portuguese",
  };
  let manifest;

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.error("Failed to load speech recognition manifest:", error);
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>无法加载识别示例。</p>";
    viewerEl.innerHTML =
      "<p class='speech-editing__placeholder'>暂无播放内容。</p>";
    return;
  }

  const demos = Array.isArray(manifest?.demos) ? manifest.demos : [];
  if (!demos.length) {
    listEl.innerHTML =
      "<p class='speech-editing__placeholder'>尚未添加识别示例。</p>";
    viewerEl.innerHTML =
      "<p class='speech-editing__placeholder'>添加示例后可预览波形与字幕。</p>";
    return;
  }

  let activeDemoId = demos[0].id;

  function renderList() {
    listEl.innerHTML = "";
    demos.forEach((demo, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "recognition-list__item";
      if (demo.id === activeDemoId) item.classList.add("is-active");
      const title = document.createElement("span");
      const langKey = typeof demo.language === "string" ? demo.language.toLowerCase() : "";
      const langLabel = langMap[langKey] || demo.language || `Transcript ${index + 1}`;
      title.textContent = langLabel;
      item.appendChild(title);
      const duration = Number(demo.duration);
      if (Number.isFinite(duration)) {
        const hint = document.createElement("small");
        hint.textContent = `时长 ${formatTime(duration)}`;
        item.appendChild(hint);
      }
      item.addEventListener("click", () => {
        if (demo.id !== activeDemoId) {
          setActiveDemo(demo.id);
        }
      });
      listEl.appendChild(item);
    });
  }

  function setActiveDemo(demoId) {
    const demo = demos.find((entry) => entry.id === demoId);
    if (!demo) return;
    activeDemoId = demoId;
    renderList();
    renderViewer(demo);
  }

  function renderViewer(demo) {
    viewerEl.innerHTML = "";
    const player = document.createElement("div");
    player.className = "recognition-player";

    const header = document.createElement("div");
    header.className = "recognition-player__header";
    const label = document.createElement("span");
    label.className = "recognition-player__label";
    label.textContent = "Live Transcription";
    header.appendChild(label);
    player.appendChild(header);

    const waveWrapper = document.createElement("div");
    waveWrapper.className = "wave-track wave-track--diarization";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "audio-button wave-track__button";
    playButton.textContent = "▶";

    const content = document.createElement("div");
    content.className = "wave-track__content";

    const canvasWrapper = document.createElement("div");
    canvasWrapper.className = "wave-track__canvas";
    const canvas = document.createElement("canvas");
    canvasWrapper.appendChild(canvas);

    content.appendChild(canvasWrapper);

    const audio = document.createElement("audio");
    audio.className = "audio-hidden";
    audio.src = demo.audio;
    audio.preload = "auto";

    waveWrapper.append(playButton, content, audio);
    player.appendChild(waveWrapper);

    const sentenceBox = document.createElement("div");
    sentenceBox.className = "recognition-sentence";
    const sentenceMeta = document.createElement("div");
    sentenceMeta.className = "recognition-sentence__meta";
    const sentenceText = document.createElement("div");
    sentenceText.className = "recognition-sentence__text";
    sentenceBox.append(sentenceMeta, sentenceText);
    player.appendChild(sentenceBox);

    viewerEl.appendChild(player);

    const sentences = Array.isArray(demo.sentences)
      ? demo.sentences
          .map((sentence) => ({
            start: Number(sentence.start) || 0,
            end: Number(sentence.end) || 0,
            text: sentence.text || "",
            speaker: sentence.speaker || "",
            words: Array.isArray(sentence.words)
              ? sentence.words.map((word) => ({
                  text: word.text || "",
                  start: Number(word.start) || 0,
                  end: Number(word.end) || 0,
                  score: Number(word.score),
                }))
              : [],
          }))
          .filter((sentence) => sentence.text || sentence.words.length)
      : [];

    let sentenceIndex = -1;
    let wordIndex = -1;
    let sentenceWordSpans = [];

    const ensureSentenceDisplayed = (index, { showFallback } = { showFallback: false }) => {
      if (!sentences.length) {
        sentenceMeta.textContent = showFallback ? "暂无句子" : "";
        sentenceText.textContent = "--";
        sentenceWordSpans = [];
        sentenceIndex = -1;
        wordIndex = -1;
        return;
      }

      if (!showFallback && (index === -1 || index === undefined)) {
        const firstIdx = sentences.length ? 0 : -1;
        if (firstIdx === -1) {
          sentenceMeta.textContent = "";
          sentenceText.textContent = "暂无句子";
          sentenceWordSpans = [];
          sentenceIndex = -1;
          wordIndex = -1;
          return;
        }
        index = firstIdx;
      }

      const safeIndex = Math.max(0, Math.min(index, sentences.length - 1));
      if (safeIndex === sentenceIndex && sentenceWordSpans.length) return;
      sentenceIndex = safeIndex;
      wordIndex = -1;
      const sentence = sentences[sentenceIndex];
      const speakerLabel = sentence.speaker || `说话人 ${sentenceIndex + 1}`;
      const matchNum = speakerLabel.match(/(\d+)/);
      const speakerNum = matchNum ? matchNum[1] : `${sentenceIndex + 1}`;
      sentenceMeta.textContent = `${speakerLabel} / Speaker ${speakerNum}`;
      sentenceText.innerHTML = "";
      if (!sentence.words || !sentence.words.length) {
        sentenceText.textContent = sentence.text || "--";
        sentenceWordSpans = [];
        return;
      }
      sentenceWordSpans = sentence.words.map((word) => {
        const wrapper = document.createElement("span");
        wrapper.className = "recognition-word";
        const textSpan = document.createElement("span");
        textSpan.className = "recognition-word__text";
        textSpan.textContent = word.text;
        const scoreSpan = document.createElement("span");
        scoreSpan.className = "recognition-word__score";
        scoreSpan.textContent = formatScore(word.score);
        wrapper.append(textSpan, scoreSpan);
        sentenceText.appendChild(wrapper);
        return wrapper;
      });
    };
    const findSentenceIndex = (currentTime) => {
      if (!sentences.length) return -1;
      for (let i = 0; i < sentences.length; i += 1) {
        const start = sentences[i].start;
        const nextStart = sentences[i + 1]?.start ?? Infinity;
        if (currentTime >= start && currentTime < nextStart) {
          return i;
        }
      }
      return currentTime < sentences[0].start ? -1 : sentences.length - 1;
    };

    const highlightWord = (currentTime) => {
      if (sentenceIndex === -1 || !sentenceWordSpans.length) return;
      const words = sentences[sentenceIndex].words;
      let newIndex = -1;
      for (let i = 0; i < words.length; i += 1) {
        const start = words[i].start;
        const nextStart = words[i + 1]?.start ?? Infinity;
        if (currentTime >= start && currentTime < nextStart) {
          newIndex = i;
          break;
        }
      }
      if (currentTime < words[0].start) {
        newIndex = -1;
      }
      if (newIndex === wordIndex) return;
      if (wordIndex >= 0 && sentenceWordSpans[wordIndex]) {
        sentenceWordSpans[wordIndex].classList.remove("is-active");
      }
      wordIndex = newIndex;
      if (wordIndex >= 0 && sentenceWordSpans[wordIndex]) {
        sentenceWordSpans[wordIndex].classList.add("is-active");
      }
    };

    const syncTranscription = (currentTime) => {
      if (!sentences.length) return;
      const targetSentence = findSentenceIndex(currentTime);
      ensureSentenceDisplayed(targetSentence);
      highlightWord(currentTime);
    };

    playButton.addEventListener("click", () => {
      if (activeSpeechAudio && activeSpeechAudio !== audio) {
        activeSpeechAudio.pause();
        activeSpeechAudioButton?.classList.remove("is-playing");
        activeSpeechAudio = null;
        activeSpeechAudioButton = null;
      }

      if (audio.paused || audio.ended) {
        audio.play();
        activeSpeechAudio = audio;
        activeSpeechAudioButton = playButton;
        playButton.classList.add("is-playing");
      } else {
        audio.pause();
        playButton.classList.remove("is-playing");
        activeSpeechAudio = null;
        activeSpeechAudioButton = null;
      }
    });

    audio.addEventListener("ended", () => {
      playButton.classList.remove("is-playing");
      if (activeSpeechAudio === audio) {
        activeSpeechAudio = null;
        activeSpeechAudioButton = null;
      }
      sentenceIndex = -1;
      wordIndex = -1;
      ensureSentenceDisplayed(-1, { showFallback: true });
      highlightWord(0);
      updateWaveformCanvas(canvas, canvas._peaks, 0);
      audio.currentTime = 0;
    });

    audio.addEventListener("timeupdate", () => {
      if (!audio.duration) return;
      const progress = audio.currentTime / audio.duration;
      updateWaveformCanvas(canvas, canvas._peaks, progress);
      syncTranscription(audio.currentTime);
    });

    audio.addEventListener("seeked", () => {
      syncTranscription(audio.currentTime);
    });

    audio.addEventListener("loadedmetadata", () => {
      ensureSentenceDisplayed(-1);
      highlightWord(0);
    });

    const seekHandler = createSeekHandler(audio, canvas);
    canvas.addEventListener("pointerdown", seekHandler.onPointerDown);

    ensureSentenceDisplayed(-1, { showFallback: true });

    requestAnimationFrame(() => {
      const waveformSrc = deriveWaveformUrl(demo.audio);
      prepareWaveform(canvas, demo.audio, {
        waveformSrc,
        enableWaveform: true,
      });
      scheduleWaveformRefresh();
    });
  }

  setActiveDemo(activeDemoId);
}

function renderComparisonList(container, entries, labels) {
  if (!entries.length) {
    container.innerHTML = "<p class='speech-editing__placeholder'>暂无示例。</p>";
    return;
  }

  container.innerHTML = "";
  entries.forEach((entry) => {
    container.appendChild(createComparisonCard(entry, labels));
  });
}

function createComparisonCard(entry, labels) {
  const card = document.createElement("div");
  card.className = "compare-card";

  const mediaCol = document.createElement("div");
  mediaCol.className = "compare-card__media";

  
  const comparison = document.createElement("div");
  comparison.className = "image-compare";
  comparison.innerHTML = `
    <img src="${entry.spectrogram.after}" alt="after spectrogram" class="image-compare__image image-compare__image--after">
    <img src="${entry.spectrogram.before}" alt="before spectrogram" class="image-compare__image image-compare__image--before">
    <div class="image-compare__label image-compare__label--before">${labels.beforeLabelNative} / ${labels.beforeLabelEnglish}</div>
    <div class="image-compare__label image-compare__label--after">${labels.afterLabelNative} / ${labels.afterLabelEnglish}</div>
    <div class="image-compare__handle"></div>
  `;
  mediaCol.appendChild(comparison);
  const sliderWrapper = document.createElement("div");
  sliderWrapper.className = "image-compare__slider-wrapper";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "50";
  slider.className = "image-compare__slider";
  slider.setAttribute("aria-label", "Comparison slider");
  sliderWrapper.appendChild(slider);
  mediaCol.appendChild(sliderWrapper);
  card.appendChild(mediaCol);

  const audioCol = document.createElement("div");
  audioCol.className = "compare-card__audio";
  audioCol.append(
    createCompareAudioGroup(
      labels.beforeLabelNative,
      labels.beforeLabelEnglish,
      entry.audio?.before
    ),
    createCompareAudioGroup(
      labels.afterLabelNative,
      labels.afterLabelEnglish,
      entry.audio?.after
    )
  );
  card.appendChild(audioCol);

  setupComparisonSlider(comparison, slider);
  return card;
}

function createCompareAudioGroup(labelNative, labelEnglish, src) {
  const group = document.createElement("div");
  group.className = "compare-card__audio-group";

  const title = document.createElement("div");
  title.className = "compare-card__audio-label";
  title.textContent = `${labelNative} / ${labelEnglish}`;

  const control = createAudioButton(labelNative, labelEnglish, src, {
    hideLabel: true,
  });

  group.append(title, control);
  return group;
}

function setupComparisonSlider(container, slider) {
  const beforeImage = container.querySelector(".image-compare__image--before");
  const handle = container.querySelector(".image-compare__handle");

  const setValue = (value) => {
    const percent = Number(value);
    if (beforeImage) {
      beforeImage.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    }
    if (handle) {
      handle.style.left = `${percent}%`;
    }
  };

  slider.addEventListener("input", (event) => {
    setValue(event.target.value);
  });

  setValue(slider.value);
}

function renderSeparationTracks(container, tracks) {
  if (!tracks.length) {
    container.innerHTML = "<p class='speech-editing__placeholder'>暂无示例。</p>";
    return;
  }

  container.innerHTML = "";
  tracks.forEach((track) => {
    container.appendChild(createWaveTrack(track));
  });
  scheduleWaveformRefresh();
}

function createWaveTrack(track) {
  const wrapper = document.createElement("div");
  wrapper.className = "wave-track";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "audio-button wave-track__button";
  button.textContent = "▶";

  const content = document.createElement("div");
  content.className = "wave-track__content";

  const label = document.createElement("div");
  label.className = "wave-track__label";
  label.textContent = `${track.labelNative ?? ""} / ${track.labelEnglish ?? ""}`;
  content.appendChild(label);

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "wave-track__canvas";
  const canvas = document.createElement("canvas");
  canvasWrapper.appendChild(canvas);

  content.appendChild(canvasWrapper);

  const audio = document.createElement("audio");
  audio.className = "audio-hidden";
  audio.src = track.file;
  audio.preload = "auto";

  wrapper.append(button, content, audio);

  button.addEventListener("click", () => {
    if (activeSpeechAudio && activeSpeechAudio !== audio) {
      activeSpeechAudio.pause();
      activeSpeechAudioButton?.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }

    if (audio.paused || audio.ended) {
      audio.play();
      activeSpeechAudio = audio;
      activeSpeechAudioButton = button;
      button.classList.add("is-playing");
    } else {
      audio.pause();
      button.classList.remove("is-playing");
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
  });

  audio.addEventListener("ended", () => {
    button.classList.remove("is-playing");
    if (activeSpeechAudio === audio) {
      activeSpeechAudio = null;
      activeSpeechAudioButton = null;
    }
    updateWaveformCanvas(canvas, canvas._peaks, 0);
    audio.currentTime = 0;
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const progress = audio.currentTime / audio.duration;
    updateWaveformCanvas(canvas, canvas._peaks, progress);
  });

  const seekHandler = createSeekHandler(audio, canvas);
  canvas.addEventListener("pointerdown", seekHandler.onPointerDown);

  requestAnimationFrame(() => {
    const waveformSrc = deriveWaveformUrl(track.file);
    prepareWaveform(canvas, track.file, {
      waveformSrc,
      enableWaveform: true,
    });
  });

  return wrapper;
}

async function prepareWaveform(canvas, src, options = {}) {
  try {
    const parentWidth = Math.floor(canvas.parentElement?.clientWidth || 0);
    const width =
      parentWidth > 0
        ? parentWidth
        : Math.max(360, Math.floor(window.innerWidth || 600));
    const waveformSrc = options.waveformSrc ?? deriveWaveformUrl(src);
    let peaks = null;

    if (options.enableWaveform && waveformSrc) {
      try {
        peaks = await fetchPrecomputedPeaks(waveformSrc);
      } catch (error) {
        console.warn(`Failed to load precomputed waveform for ${src}`, error);
      }
    }

    if (options.enableWaveform && (!peaks || !peaks.length)) {
      // Only attempt raw-audio decoding when the source is same-origin, to
      // avoid additional CORS failures for remote OSS assets.
      try {
        const audioUrl = new URL(src, window.location.href);
        if (audioUrl.origin === window.location.origin) {
          peaks = await extractPeaksFromFile(src, width);
        }
      } catch {
        // ignore URL parse errors and fall through to placeholder rendering
      }
    }

    if (!peaks || !peaks.length) {
      throw new Error("Waveform extraction returned no peaks.");
    }
    canvas._peaks = peaks;
    if (typeof options.height === "number") {
      canvas._waveHeight = options.height;
    }
    waveformCanvases.add(canvas);
    updateWaveformCanvas(canvas, peaks, 0);
  } catch (error) {
    console.warn("Failed to render waveform:", error);
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.parentElement?.clientWidth || 600;
    canvas.height = 60;
    ctx.fillStyle = "#d8dfef";
    ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
  }
}

async function extractPeaksFromFile(src, peakCount) {
  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = getAudioContext();
  const audioBuffer = await new Promise((resolve, reject) => {
    audioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
  });
  return extractPeaks(audioBuffer, peakCount);
}

function deriveWaveformUrl(audioSrc) {
  if (!audioSrc) return null;
  if (/\.waveform\.json($|\?)/i.test(audioSrc)) {
    return audioSrc;
  }
  try {
    const url = new URL(audioSrc, window.location.href);
    const originalPath = url.pathname;
    const newPath = originalPath.replace(/\.(mp3|wav|m4a|ogg)$/i, ".waveform.json");
    if (newPath === originalPath) return null;

    // If audio is same-origin, keep origin; otherwise prefer a local JSON
    // path that mirrors the remote /demos/... structure to avoid CORS.
    if (url.origin === window.location.origin) {
      url.pathname = newPath;
      return url.toString();
    }
    // return new URL(newPath, window.location.origin).toString();
    return new URL(newPath, window.location.href).toString();
  } catch {
    if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(audioSrc)) {
      return audioSrc.replace(/\.(mp3|wav|m4a|ogg)(\?.*)?$/i, ".waveform.json$2");
    }
  }
  return null;
}

async function fetchPrecomputedPeaks(waveformUrl) {
  if (!waveformUrl) throw new Error("Missing waveform URL");
  const response = await fetch(waveformUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Waveform HTTP ${response.status}`);
  }
  const data = await response.json();
  let peaks = null;
  if (Array.isArray(data.peaks)) {
    peaks = data.peaks;
  } else if (Array.isArray(data.samples)) {
    peaks = data.samples;
  }
  if (!peaks) {
    throw new Error("Waveform JSON missing 'peaks' or 'samples' array");
  }
  return peaks.map((entry) => {
    if (typeof entry === "number") {
      const amplitude = Math.abs(entry);
      return { min: -amplitude, max: amplitude };
    }
    return {
      min: typeof entry.min === "number" ? entry.min : 0,
      max: typeof entry.max === "number" ? entry.max : 0,
    };
  });
}

function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

function extractPeaks(buffer, bucketCount) {
  const rawData = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(rawData.length / bucketCount));
  const peaks = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const start = i * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, rawData.length);
    let min = 1;
    let max = -1;
    for (let j = start; j < end; j += 1) {
      const sample = rawData[j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    peaks.push({ min, max });
  }
  return peaks;
}

function updateWaveformCanvas(canvas, peaks = [], progress = 0) {
  if (!peaks || !peaks.length) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.parentElement?.clientWidth || 600;
  const height = canvas._waveHeight || 80;
  const dpr = window.devicePixelRatio || 1;
  canvas._lastProgress = progress;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const midY = height / 2;
  const rootStyles = getComputedStyle(document.documentElement);
  const playedColor =
    rootStyles.getPropertyValue("--color-primary").trim() || "#1f6feb";
  const restColor = "#d7dff0";
  ctx.lineWidth = 2;

  peaks.forEach((peak, index) => {
    const x = (index / peaks.length) * width;
    const amplitude = Math.max(Math.abs(peak.max), Math.abs(peak.min));
    const y = Math.max(2, amplitude * (height / 2));
    ctx.strokeStyle = index / peaks.length <= progress ? playedColor : restColor;
    ctx.beginPath();
    ctx.moveTo(x, midY - y);
    ctx.lineTo(x, midY + y);
    ctx.stroke();
  });
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "--:--";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDurationLabel(duration) {
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return `时长 ${formatTime(duration)}`;
  }
  if (typeof duration === "string" && duration.trim()) {
    return `时长 ${duration.trim()}`;
  }
  return "时长 --";
}

function formatScore(value) {
  if (!Number.isFinite(value)) return "--";
  return Number(value).toFixed(3);
}

function createSeekHandler(audio, canvas) {
  let seeking = false;
  let pointerId = null;

  const seek = (clientX) => {
    if (!audio.duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    updateWaveformCanvas(canvas, canvas._peaks, ratio);
  };

  const onPointerDown = (event) => {
    seeking = true;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    seek(event.clientX);
  };

  const onPointerMove = (event) => {
    if (!seeking || event.pointerId !== pointerId) return;
    seek(event.clientX);
  };

  const stopSeeking = () => {
    if (!seeking) return;
    seeking = false;
    if (pointerId !== null) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", stopSeeking);
  canvas.addEventListener("pointercancel", stopSeeking);
  canvas.addEventListener("pointerleave", stopSeeking);

  return { onPointerDown };
}

function refreshWaveformCanvases() {
  waveformCanvases.forEach((canvas) => {
    if (!canvas.isConnected) {
      waveformCanvases.delete(canvas);
      return;
    }
    if (!canvas._peaks || !canvas._peaks.length) return;
    const progress =
      typeof canvas._lastProgress === "number" ? canvas._lastProgress : 0;
    updateWaveformCanvas(canvas, canvas._peaks, progress);
  });
}

function scheduleWaveformRefresh() {
  if (waveformRefreshScheduled) return;
  waveformRefreshScheduled = true;
  requestAnimationFrame(() => {
    refreshWaveformCanvases();
    waveformRefreshScheduled = false;
  });
}
