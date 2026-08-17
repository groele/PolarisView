/**
 * background.js - Chrome/Edge Extension Service Worker (Manifest V3)
 * 点击图标全栏即开：点击工具栏图标一键全屏唤起/激活 1/2 波片偏振分析工作台
 */

// 1. 监听工具栏图标点击事件 (点击图标全栏直接打开)
chrome.action.onClicked.addListener(async (currentTab) => {
  try {
    const dashboardUrl = chrome.runtime.getURL('index.html');
    
    // 查询当前所有窗口中是否已有打开的工作台标签页
    const existingTabs = await chrome.tabs.query({ url: dashboardUrl });

    if (existingTabs && existingTabs.length > 0) {
      const targetTab = existingTabs[0];
      // 激活已有标签页并置顶所在窗口
      await chrome.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
    } else {
      // 若尚未打开，则直接新建全栏工作台标签页
      await chrome.tabs.create({
        url: dashboardUrl,
        active: true
      });
    }
  } catch (err) {
    console.error('打开全栏工作台失败:', err);
    // 降级保护
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  }
});

// 2. 插件安装/更新通知
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`1/2波片偏振分析工作台插件已就绪 [Reason: ${details.reason}]`);
});

// 3. 监听插件内部消息通信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'open_full_dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    sendResponse({ status: 'ok' });
  }
  return true;
});
