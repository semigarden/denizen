import { filterLanguages, getSettings, languageLabel, saveSettings } from "../settings.js";

const enabledToggle = document.getElementById("enabledToggle");

function fitPopup() {
  const root = document.documentElement;
  root.style.height = "auto";
  document.body.style.height = "auto";
  const height = Math.ceil(document.body.getBoundingClientRect().height);
  root.style.height = `${height}px`;
  document.body.style.height = `${height}px`;
}

function createLanguagePicker({ search, list, combobox, settingKey, optionIdPrefix }) {
  let selectedCode = "en";
  let activeIndex = -1;
  let visibleOptions = [];
  let onCloseOthers = () => {};

  function setExpanded(open) {
    search.setAttribute("aria-expanded", open ? "true" : "false");
    combobox?.classList.toggle("is-open", open);
    requestAnimationFrame(fitPopup);
  }

  function closeList(restoreLabel = true) {
    setExpanded(false);
    activeIndex = -1;
    if (restoreLabel) search.value = languageLabel(selectedCode);
  }

  function highlightActive() {
    const items = [...list.querySelectorAll(".lang-combobox__option")];
    for (const [index, item] of items.entries()) {
      item.classList.toggle("is-active", index === activeIndex);
    }
    const active = items[activeIndex];
    if (active) {
      search.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      search.removeAttribute("aria-activedescendant");
    }
  }

  function renderOptions(query = "") {
    visibleOptions = filterLanguages(query);
    list.innerHTML = "";

    if (!visibleOptions.length) {
      const empty = document.createElement("li");
      empty.className = "lang-combobox__empty";
      empty.textContent = "No matches";
      list.appendChild(empty);
      activeIndex = -1;
      return;
    }

    for (const [code, label] of visibleOptions) {
      const item = document.createElement("li");
      item.className = "lang-combobox__option";
      item.setAttribute("role", "option");
      item.dataset.code = code;
      item.id = `${optionIdPrefix}-${code}`;
      item.textContent = label;
      if (code === selectedCode) item.setAttribute("aria-selected", "true");
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        void chooseLanguage(code);
      });
      list.appendChild(item);
    }
    activeIndex = Math.max(
      0,
      visibleOptions.findIndex(([code]) => code === selectedCode)
    );
    highlightActive();
  }

  async function chooseLanguage(code) {
    if (!code || code === selectedCode) {
      closeList(true);
      return;
    }
    selectedCode = code;
    search.value = languageLabel(code);
    closeList(true);
    try {
      await saveSettings({ [settingKey]: code });
    } catch (err) {
      console.warn(`[Discord Translate] could not save ${settingKey}:`, err);
    }
  }

  function openList(query) {
    onCloseOthers();
    renderOptions(query);
    setExpanded(true);
  }

  search.addEventListener("focus", () => {
    search.select();
    openList("");
  });

  search.addEventListener("input", () => {
    openList(search.value);
  });

  search.addEventListener("keydown", (event) => {
    const open = search.getAttribute("aria-expanded") === "true";

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList(search.value);
      if (!visibleOptions.length) return;
      activeIndex = (activeIndex + 1) % visibleOptions.length;
      highlightActive();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList(search.value);
      if (!visibleOptions.length) return;
      activeIndex = (activeIndex - 1 + visibleOptions.length) % visibleOptions.length;
      highlightActive();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!open || !visibleOptions.length) return;
      const pick = visibleOptions[Math.max(0, activeIndex)]?.[0];
      if (pick) void chooseLanguage(pick);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeList(true);
      search.blur();
    }
  });

  search.addEventListener("blur", () => {
    window.setTimeout(() => closeList(true), 100);
  });

  return {
    setCode(code) {
      selectedCode = code;
      search.value = languageLabel(code);
      renderOptions("");
    },
    closeList,
    setOnCloseOthers(fn) {
      onCloseOthers = fn;
    },
  };
}

const incomingPicker = createLanguagePicker({
  search: document.getElementById("incomingSearch"),
  list: document.getElementById("incomingList"),
  combobox: document.getElementById("incomingCombobox"),
  settingKey: "incoming",
  optionIdPrefix: "incoming-option",
});

const outgoingPicker = createLanguagePicker({
  search: document.getElementById("outgoingSearch"),
  list: document.getElementById("outgoingList"),
  combobox: document.getElementById("outgoingCombobox"),
  settingKey: "outgoing",
  optionIdPrefix: "outgoing-option",
});

incomingPicker.setOnCloseOthers(() => outgoingPicker.closeList());
outgoingPicker.setOnCloseOthers(() => incomingPicker.closeList());

enabledToggle.addEventListener("change", async () => {
  try {
    await saveSettings({ enabled: enabledToggle.checked });
  } catch {
    enabledToggle.checked = !enabledToggle.checked;
  }
});

getSettings()
  .then((settings) => {
    incomingPicker.setCode(settings.incoming);
    outgoingPicker.setCode(settings.outgoing);
    enabledToggle.checked = Boolean(settings.enabled);
    fitPopup();
  })
  .catch((err) => {
    console.warn("[Discord Translate] could not load settings:", err);
    fitPopup();
  });
