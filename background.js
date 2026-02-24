let activeWorkspaceId = null;
let isSwitching = false;

const log = (...args) => console.log(`[WS-CORE]:`, ...args);

// --- INITIALIZATION ---
const initialize = async () => {
  const data = await browser.storage.local.get([
    "activeWorkspaceId",
    "workspaces",
  ]);
  activeWorkspaceId = data.activeWorkspaceId;
  if (!activeWorkspaceId && data.workspaces) {
    activeWorkspaceId = Object.keys(data.workspaces)[0];
    await browser.storage.local.set({ activeWorkspaceId });
  }
  await updateContextMenus();
};
browser.runtime.onStartup.addListener(initialize);
browser.runtime.onInstalled.addListener(initialize);

// --- SMART CONTEXT MENU ---
async function updateContextMenus() {
  try {
    await browser.menus.removeAll();
    const { workspaces = {} } = await browser.storage.local.get("workspaces");
    browser.menus.create({
      id: "move-root",
      title: "Move to Workspace",
      contexts: ["tab"],
    });
    Object.values(workspaces).forEach((ws) => {
      browser.menus.create({
        id: `move-to-${ws.id}`,
        parentId: "move-root",
        title: ws.name,
        contexts: ["tab"],
      });
    });
  } catch (e) {}
}

browser.menus.onShown.addListener(async (info, tab) => {
  const { workspaces = {} } = await browser.storage.local.get("workspaces");
  const tabWsId = await browser.sessions.getTabValue(tab.id, "workspaceId");
  if (tab.groupId !== -1) {
    try {
      const group = await browser.tabGroups.get(tab.groupId);
      await browser.menus.update("move-root", {
        title: `Move Group "${group.title || "Untitled"}" to Workspace`,
      });
    } catch (e) {}
  } else {
    await browser.menus.update("move-root", { title: "Move Tab to Workspace" });
  }
  for (const wsId of Object.keys(workspaces)) {
    await browser.menus.update(`move-to-${wsId}`, {
      visible: wsId !== tabWsId,
    });
  }
  browser.menus.refresh();
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId.startsWith("move-to-")) {
    const targetWsId = info.menuItemId.replace("move-to-", "");
    if (tab.groupId !== -1) await moveGroup(tab.groupId, targetWsId);
    else await moveSingle(tab.id, targetWsId);
    await browser.storage.local.set({ _uiTick: Date.now() });
  }
});

async function moveGroup(groupId, targetWsId) {
  const group = await browser.tabGroups.get(groupId);
  const tabs = await browser.tabs.query({ groupId });
  const tmpGid = `g_${groupId}_${Date.now()}`;
  for (const t of tabs) {
    await browser.sessions.setTabValue(t.id, "workspaceId", targetWsId);
    await browser.sessions.setTabValue(t.id, "tmpGroupTitle", group.title);
    await browser.sessions.setTabValue(t.id, "tmpGroupColor", group.color);
    await browser.sessions.setTabValue(t.id, "tmpGroupId", tmpGid);
  }
  if (targetWsId !== activeWorkspaceId) {
    const ids = tabs.map((t) => t.id);
    if (tabs.find((t) => t.active)) {
      const vis = await browser.tabs.query({
        currentWindow: true,
        hidden: false,
      });
      const next = vis.find((v) => !ids.includes(v.id));
      if (next) await browser.tabs.update(next.id, { active: true });
    }
    await browser.tabs.ungroup(ids);
    await browser.tabs.hide(ids);
  }
}

async function moveSingle(tabId, targetWsId) {
  await browser.sessions.setTabValue(tabId, "workspaceId", targetWsId);
  if (targetWsId !== activeWorkspaceId) {
    const t = await browser.tabs.get(tabId);
    if (t.active) {
      const vis = await browser.tabs.query({
        currentWindow: true,
        hidden: false,
      });
      const next = vis.find((v) => v.id !== tabId);
      if (next) await browser.tabs.update(next.id, { active: true });
    }
    await browser.tabs.hide(tabId);
  }
}

// --- ZERO-FLICKER SWITCH ENGINE ---
async function backupGroupsState() {
  const groups = await browser.tabGroups.query({
    windowId: browser.windows.WINDOW_ID_CURRENT,
  });
  const tabs = await browser.tabs.query({ currentWindow: true });
  for (const g of groups) {
    const gTabs = tabs.filter((t) => t.groupId === g.id);
    const tmpGid = `g_${g.id}_${Date.now()}`;
    for (const t of gTabs) {
      await browser.sessions.setTabValue(t.id, "tmpGroupTitle", g.title);
      await browser.sessions.setTabValue(t.id, "tmpGroupColor", g.color);
      await browser.sessions.setTabValue(t.id, "tmpGroupId", tmpGid);
    }
  }
}

async function restoreGroups(tabIds) {
  const clusters = {};
  for (const id of tabIds) {
    const gId = await browser.sessions.getTabValue(id, "tmpGroupId");
    if (gId) {
      if (!clusters[gId]) {
        const title = await browser.sessions.getTabValue(id, "tmpGroupTitle");
        const color = await browser.sessions.getTabValue(id, "tmpGroupColor");
        clusters[gId] = { title, color, tabs: [] };
      }
      clusters[gId].tabs.push(id);
    }
  }
  for (const key in clusters) {
    const c = clusters[key];
    try {
      const nid = await browser.tabs.group({ tabIds: c.tabs });
      await browser.tabGroups.update(nid, { title: c.title, color: c.color });
    } catch (e) {}
  }
}

async function switchWorkspace(targetId) {
  if (isSwitching || targetId === activeWorkspaceId) return { success: true };
  isSwitching = true;
  try {
    const { settings = { autoDiscard: false } } =
      await browser.storage.local.get("settings");
    await backupGroupsState();
    const allTabs = await browser.tabs.query({ currentWindow: true });
    const currentlyActive = allTabs.find((t) => t.active);
    const toShow = [],
      toHideImmediately = [],
      toUngroup = [];

    for (const tab of allTabs) {
      const wsId = await browser.sessions.getTabValue(tab.id, "workspaceId");
      if (wsId === targetId) toShow.push(tab.id);
      else {
        if (!tab.pinned) {
          if (tab.id !== currentlyActive?.id) toHideImmediately.push(tab.id);
          if (tab.groupId !== -1) toUngroup.push(tab.id);
        }
      }
    }
    if (toHideImmediately.length > 0)
      await browser.tabs.hide(toHideImmediately);
    if (toUngroup.length > 0) await browser.tabs.ungroup(toUngroup);
    if (toShow.length === 0) {
      const nt = await browser.tabs.create({ active: false });
      await browser.sessions.setTabValue(nt.id, "workspaceId", targetId);
      toShow.push(nt.id);
    }
    await browser.tabs.show(toShow);
    await browser.tabs.update(toShow[0], { active: true });
    if (
      currentlyActive &&
      !toShow.includes(currentlyActive.id) &&
      !currentlyActive.pinned
    ) {
      await browser.tabs.hide(currentlyActive.id);
      if (settings.autoDiscard) await browser.tabs.discard(currentlyActive.id);
    }
    if (settings.autoDiscard) {
      for (const id of toHideImmediately) await browser.tabs.discard(id);
    }
    await new Promise((r) => setTimeout(r, 25));
    await restoreGroups(toShow);
    activeWorkspaceId = targetId;
    await browser.storage.local.set({ activeWorkspaceId: targetId });
    await updateContextMenus();
    return { success: true };
  } finally {
    isSwitching = false;
  }
}

browser.tabs.onCreated.addListener(async (tab) => {
  if (activeWorkspaceId) {
    await browser.sessions.setTabValue(
      tab.id,
      "workspaceId",
      activeWorkspaceId,
    );
    await browser.storage.local.set({ _uiTick: Date.now() });
  }
});
browser.tabs.onRemoved.addListener(async () => {
  await browser.storage.local.set({ _uiTick: Date.now() });
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SWITCH") {
    switchWorkspace(msg.id).then((res) => sendResponse(res));
    return true;
  }
  if (msg.type === "CREATE") {
    const id = "ws_" + Date.now();
    browser.storage.local.get("workspaces").then((d) => {
      const ws = d.workspaces || {};
      ws[id] = { id, name: msg.name, timestamp: Date.now() };
      browser.storage.local.set({ workspaces: ws }).then(() => {
        updateContextMenus();
        sendResponse({ success: true });
      });
    });
    return true;
  }
});
initialize();
