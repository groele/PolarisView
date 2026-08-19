/**
 * background.js - Chrome/Edge Extension Service Worker (Manifest V3)
 * 点击图标全栏即开：点击工具栏图标一键全屏唤起/激活 1/2 波片偏振分析工作台
 */

let dashboardTabId = null;

// 1. 监听工具栏图标点击事件 (点击图标全栏直接打开)
chrome.action.onClicked.addListener(async (currentTab) => {
  try {
    const dashboardUrl = chrome.runtime.getURL('index.html');

    if (Number.isInteger(dashboardTabId)) {
      try {
        const targetTab = await chrome.tabs.get(dashboardTabId);
        await chrome.tabs.update(dashboardTabId, { active: true });
        if (Number.isInteger(targetTab.windowId)) await chrome.windows.update(targetTab.windowId, { focused: true });
        return;
      } catch (_) {
        dashboardTabId = null;
      }
    }

    const created = await chrome.tabs.create({ url: dashboardUrl, active: true });
    dashboardTabId = created.id ?? null;
  } catch (err) {
    console.error('打开全栏工作台失败:', err);
    // 降级保护
    const created = await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    dashboardTabId = created.id ?? null;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === dashboardTabId) dashboardTabId = null;
});

// 2. 插件安装/更新通知
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`1/2波片偏振分析工作台插件已就绪 [Reason: ${details.reason}]`);
});

// 3. 监听插件内部消息通信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'dashboard_ready' && Number.isInteger(sender.tab?.id)) {
    dashboardTabId = sender.tab.id;
    sendResponse({ status: 'registered' });
    return false;
  }
  if (message.action === 'open_full_dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }).then(tab => {
      dashboardTabId = tab.id ?? null;
      sendResponse({ status: 'ok' });
    });
    return true;
  }
  return false;
});
