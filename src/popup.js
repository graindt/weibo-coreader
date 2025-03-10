// Initialize the popup with the logger
async function initializePopup() {
  try {
    const { logger } = await import(chrome.runtime.getURL('utils/logger.js'));
    const modelNameSelect = document.getElementById('modelName');
    const promptTemplateInput = document.getElementById('promptTemplate');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // 显示状态信息
    function showStatus(type, message) {
      statusDiv.textContent = message;
      statusDiv.className = `status ${type}`;
      statusDiv.style.display = 'block';

      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }

    // 从Ollama API获取可用模型
  async function fetchOllamaModels() {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('Error fetching models:', error);
      showStatus('error', 'Failed to fetch models: ' + error.message);
      return [];
    }
  }

  // 更新模型选择下拉框
  async function updateModelSelect() {
    modelNameSelect.disabled = true;
    const savedModelName = await new Promise(resolve => {
      chrome.storage.local.get(['modelName'], result => resolve(result.modelName));
    });

    try {
      const models = await fetchOllamaModels();
      modelNameSelect.innerHTML = ''; // 清空现有选项

      if (models.length === 0) {
        const option = new Option('No models found', '', true, true);
        modelNameSelect.add(option);
        showStatus('error', 'No models available in Ollama');
      } else {
        models.forEach(model => {
          const option = new Option(model.name, model.name, false, model.name === savedModelName);
          modelNameSelect.add(option);
        });
        if (!savedModelName && models.length > 0) {
          modelNameSelect.value = models[0].name;
        }
      }
    } catch (error) {
      logger.error('Error updating model select:', error);
      const option = new Option('Error loading models', '', true, true);
      modelNameSelect.add(option);
      showStatus('error', 'Failed to load models');
    } finally {
      modelNameSelect.disabled = false;
    }
  }

    // 初始化加载
    await updateModelSelect();
    await new Promise(resolve => {
      chrome.storage.local.get(['modelName', 'promptTemplate'], (result) => {
        if (result.modelName) {
          modelNameSelect.value = result.modelName;
        }
        if (result.promptTemplate) {
          promptTemplateInput.value = result.promptTemplate;
        }
        resolve();
      });
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

  } catch (error) {
    console.error('[Weibo Reader] Failed to initialize popup:', error);
  }
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);
