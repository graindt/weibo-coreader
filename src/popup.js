document.addEventListener('DOMContentLoaded', () => {
  const modelNameSelect = document.getElementById('modelName');
  const promptTemplateInput = document.getElementById('promptTemplate');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // 加载已保存的设置
  chrome.storage.local.get(['modelName', 'promptTemplate'], (result) => {
    if (result.modelName) {
      modelNameSelect.value = result.modelName;
    }
    if (result.promptTemplate) {
      promptTemplateInput.value = result.promptTemplate;
    }
  });

  // 保存设置
  saveBtn.addEventListener('click', async () => {
    const modelName = modelNameSelect.value;
    const promptTemplate = promptTemplateInput.value.trim();

    try {
      await chrome.storage.local.set({
        modelName,
        promptTemplate: promptTemplate || '请分析这条微博事实和观点，并给出3个关键点'
      });
      showStatus('success', '设置已保存');
    } catch (error) {
      showStatus('error', '保存失败: ' + error.message);
    }
  });

  // 显示状态信息
  function showStatus(type, message) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
});
