const UI = {
  list: document.getElementById("ws-list"),
  input: document.getElementById("new-ws-name"),
  addBtn: document.getElementById("add-btn"),
  themeBtn: document.getElementById("theme-toggle"),
  uiSwitchBtn: document.getElementById("ui-switch-btn"),
  settingsToggleBtn: document.getElementById("settings-toggle-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  discardCheck: document.getElementById("discard-check"),
  langSelect: document.getElementById("lang-select"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
  status: document.getElementById("status-bar"),
};

const TRANSLATIONS = {
  en: {
    create: "Create",
    placeholder: "New workspace...",
    memSaver: "Memory Saver",
    langLabel: "Language",
    ready: "Ready",
    switching: "Switching...",
    creating: "Creating...",
    deleted: "Deleted",
    delConf: "Delete this workspace?",
    active: "Active",
    tabs: "tabs",
    groups: "groups",
    noWs: "No Workspaces.",
  },
  el: {
    create: "Δημιουργία",
    placeholder: "Όνομα workspace...",
    memSaver: "Εξοικονόμηση Μνήμης",
    langLabel: "Γλώσσα",
    ready: "Έτοιμο",
    switching: "Εναλλαγή...",
    creating: "Δημιουργία...",
    deleted: "Διαγράφηκε",
    delConf: "Διαγραφή workspace;",
    active: "Ενεργό",
    tabs: "καρτέλες",
    groups: "ομάδες",
    noWs: "Δεν βρέθηκαν Workspaces.",
  },
  de: {
    create: "Erstellen",
    placeholder: "Neuer Arbeitsbereich...",
    memSaver: "Speicherschonung",
    langLabel: "Sprache",
    ready: "Bereit",
    switching: "Wechseln...",
    creating: "Erstellen...",
    deleted: "Gelöscht",
    delConf: "Arbeitsbereich löschen?",
    active: "Aktiv",
    tabs: "Tabs",
    groups: "Gruppen",
    noWs: "Keine Arbeitsbereiche.",
  },
  fr: {
    create: "Créer",
    placeholder: "Nouvel espace...",
    memSaver: "Économiseur de mémoire",
    langLabel: "Langue",
    ready: "Prêt",
    switching: "Changement...",
    creating: "Création...",
    deleted: "Supprimé",
    delConf: "Supprimer cet espace?",
    active: "Actif",
    tabs: "onglets",
    groups: "groupes",
    noWs: "Aucun espace trouvé.",
  },
  es: {
    create: "Crear",
    placeholder: "Nuevo espacio...",
    memSaver: "Ahorro de memoria",
    langLabel: "Idioma",
    ready: "Listo",
    switching: "Cambiando...",
    creating: "Creando...",
    deleted: "Eliminado",
    delConf: "¿Eliminar este espacio?",
    active: "Activo",
    tabs: "pestañas",
    groups: "grupos",
    noWs: "No hay espacios.",
  },
  it: {
    create: "Crea",
    placeholder: "Nuovo spazio...",
    memSaver: "Risparmio memoria",
    langLabel: "Lingua",
    ready: "Pronto",
    switching: "Cambio...",
    creating: "Creazione...",
    deleted: "Eliminato",
    delConf: "Eliminare questo spazio?",
    active: "Attivo",
    tabs: "schede",
    groups: "gruppi",
    noWs: "Nessun spazio trovato.",
  },
};

let currentLang = "en",
  editingWsId = null;
const isPopup = window.location.pathname.includes("popup.html");

const ICONS = {
  rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
};

async function init() {
  const data = await browser.storage.local.get(["settings", "theme", "lang"]);
  UI.discardCheck.checked = data.settings?.autoDiscard || false;
  document.body.setAttribute("data-theme", data.theme || "dark");
  currentLang = data.lang || "en";
  UI.langSelect.value = currentLang;
  updateLanguageUI();
  await render();
}

function updateLanguageUI() {
  const t = TRANSLATIONS[currentLang];
  UI.addBtn.textContent = t.create;
  UI.input.placeholder = t.placeholder;
  document.getElementById("lang-label").textContent = t.langLabel;
  document.querySelector(".label-text").textContent = t.memSaver;
  UI.status.textContent = t.ready;
}

UI.langSelect.onchange = async () => {
  currentLang = UI.langSelect.value;
  await browser.storage.local.set({ lang: currentLang });
  updateLanguageUI();
  render();
};

UI.settingsToggleBtn.onclick = () => {
  const isOpen = UI.settingsPanel.classList.toggle("open");
  UI.settingsToggleBtn.classList.toggle("active", isOpen);
};

let renderTimeout;
function debouncedRender() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(render, 250);
}

async function getLiveMetadata() {
  const allTabs = await browser.tabs.query({ currentWindow: true });
  const stats = {};
  for (const tab of allTabs) {
    try {
      const wsId = await browser.sessions.getTabValue(tab.id, "workspaceId");
      if (wsId) {
        if (!stats[wsId]) stats[wsId] = { tabs: 0, groups: new Set() };
        stats[wsId].tabs++;
        if (tab.groupId !== -1) stats[wsId].groups.add(tab.groupId);
      }
    } catch (e) {}
  }
  return stats;
}

async function render() {
  const { workspaces = {}, activeWorkspaceId } =
    await browser.storage.local.get(["workspaces", "activeWorkspaceId"]);
  const liveStats = await getLiveMetadata();
  const t = TRANSLATIONS[currentLang];
  UI.list.innerHTML = "";
  Object.values(workspaces)
    .sort((a, b) => b.timestamp - a.timestamp)
    .forEach((ws) => {
      const isActive = ws.id === activeWorkspaceId,
        isEditing = ws.id === editingWsId;
      const stats = liveStats[ws.id] || { tabs: 0, groups: new Set() };
      const card = document.createElement("div");
      card.className = `ws-card ${isActive ? "active" : ""}`;
      card.dataset.id = ws.id;
      card.innerHTML = `
            <div class="ws-info">${isEditing ? `<input type="text" class="edit-input" value="${escapeHtml(ws.name)}" id="input-${ws.id}">` : `<div class="ws-name">${escapeHtml(ws.name)}</div><div class="ws-meta">${stats.tabs} ${t.tabs} ${stats.groups.size > 0 ? `| ${stats.groups.size} ${t.groups}` : ""}</div>`}</div>
            <div class="ws-actions">${isEditing ? `<button class="action-btn save" data-id="${ws.id}">${ICONS.save}</button>` : `<button class="action-btn rename" data-id="${ws.id}">${ICONS.rename}</button>`}<button class="action-btn delete" data-id="${ws.id}">${ICONS.delete}</button></div>`;
      UI.list.appendChild(card);
      if (isEditing) {
        const i = card.querySelector(".edit-input");
        i.focus();
        i.select();
        i.onkeydown = (e) => {
          if (e.key === "Enter") saveRename(ws.id, i.value);
          if (e.key === "Escape") {
            editingWsId = null;
            render();
          }
        };
      }
    });
}

UI.list.onclick = async (e) => {
  const btn = e.target.closest("button"),
    card = e.target.closest(".ws-card");
  if (!card || editingWsId) return;
  const id = card.dataset.id,
    t = TRANSLATIONS[currentLang];
  if (btn) {
    if (btn.classList.contains("rename")) {
      editingWsId = id;
      render();
    } else if (btn.classList.contains("delete")) {
      const { activeWorkspaceId } =
        await browser.storage.local.get("activeWorkspaceId");
      if (id === activeWorkspaceId) return;
      if (confirm(t.delConf)) {
        const { workspaces } = await browser.storage.local.get("workspaces");
        delete workspaces[id];
        await browser.storage.local.set({ workspaces });
      }
    } else if (btn.classList.contains("save"))
      saveRename(id, document.getElementById(`input-${id}`).value);
    return;
  }
  const { activeWorkspaceId } =
    await browser.storage.local.get("activeWorkspaceId");
  if (id !== activeWorkspaceId) {
    UI.status.textContent = t.switching;
    await browser.runtime.sendMessage({ type: "SWITCH", id });
  }
};

UI.uiSwitchBtn.onclick = () => {
  if (!isPopup) {
    browser.action.openPopup();
    browser.sidebarAction.close();
  } else {
    browser.sidebarAction.open();
    window.close();
  }
};
UI.addBtn.onclick = async () => {
  const name = UI.input.value.trim();
  if (name) {
    UI.status.textContent = TRANSLATIONS[currentLang].creating;
    await browser.runtime.sendMessage({ type: "CREATE", name });
    UI.input.value = "";
  }
};
async function saveRename(id, newName) {
  if (!newName.trim()) return;
  const { workspaces } = await browser.storage.local.get("workspaces");
  workspaces[id].name = newName.trim();
  await browser.storage.local.set({ workspaces });
  editingWsId = null;
}
UI.themeBtn.onclick = async () => {
  const curr = document.body.getAttribute("data-theme"),
    next = curr === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  await browser.storage.local.set({ theme: next });
};
UI.discardCheck.onchange = async () => {
  await browser.storage.local.set({
    settings: { autoDiscard: UI.discardCheck.checked },
  });
};
UI.exportBtn.onclick = async () => {
  const data = await browser.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  await browser.downloads.download({
    url: URL.createObjectURL(blob),
    filename: `ws-backup.json`,
    saveAs: true,
  });
};
UI.importBtn.onclick = () => UI.importFile.click();
UI.importFile.onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async (ev) => {
    const imp = JSON.parse(ev.target.result);
    const cur = await browser.storage.local.get("workspaces");
    await browser.storage.local.set({
      workspaces: { ...cur.workspaces, ...imp.workspaces },
    });
  };
  r.readAsText(f);
};
function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}
browser.storage.onChanged.addListener(debouncedRender);
browser.tabs.onCreated.addListener(debouncedRender);
browser.tabs.onRemoved.addListener(debouncedRender);
browser.tabs.onUpdated.addListener((id, ch) => {
  if (ch.status === "complete" || ch.hidden !== undefined) debouncedRender();
});
document.addEventListener("DOMContentLoaded", init);
