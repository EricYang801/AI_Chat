// 常數和工具函數
const FADE_DURATION = 300;  // 動畫持續時間（毫秒）

// 全局狀態
const state = {
    currentChatId: null,
    chats: [],
    settings: {
        model: 'gpt-4o-mini',
        systemPrompt: ''
    }
};

// DOM 元素快取
const elements = {
    messages: document.getElementById('messages'),
    textInput: document.getElementById('text-input'),
    fileInput: document.getElementById('file-input'),
    sendButton: document.getElementById('send-button'),
    autoGrowContainer: document.getElementById('auto-grow-container'),
    chatList: document.getElementById('chat-list'),
    newChatButton: document.getElementById('new-chat'),
    chatTitle: document.getElementById('chat-title'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    systemPrompt: document.getElementById('system-prompt'),
    modelSelect: document.getElementById('model-select'),
    saveSettings: document.getElementById('save-settings'),
    cancelSettings: document.getElementById('cancel-settings'),
    clearHistory: document.getElementById('clear-history'),
    closeSettings: document.getElementById('close-settings')
};

// 載入動畫相關
function createLoadingMessage(text = '思考中') {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai-message loading-message';
    
    const loadingText = document.createElement('div');
    loadingText.className = 'loading-text';
    loadingText.textContent = text;
    
    const dots = document.createElement('div');
    dots.className = 'loading-dots';
    for (let i = 0; i < 3; i++) {
        dots.appendChild(document.createElement('span'));
    }
    
    loadingDiv.appendChild(loadingText);
    loadingDiv.appendChild(dots);
    return loadingDiv;
}

// 程式碼格式化
function formatMessageContent(content) {
    if (!content.includes('```')) {
        return content;
    }

    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map(part => {
        if (!part.startsWith('```')) {
            return part;
        }

        const codeContent = part.slice(3, -3).trim();
        const firstLine = codeContent.split('\n')[0].trim();
        const language = firstLine.includes(' ') ? '' : firstLine;
        const code = language ? codeContent.slice(language.length).trim() : codeContent;

        const escapedCode = code.replace(/[<>&"']/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));

        return `<pre data-language="${language}"><code>${escapedCode}</code></pre>`;
    }).join('');
}

// 聊天管理相關函數
async function loadChats() {
    try {
        const response = await fetch('/chats');
        const data = await response.json();
        state.chats = data.chats;
        renderChatList();
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

async function createNewChat() {
    try {
        const response = await fetch('/chats/new', {
            method: 'POST'
        });
        const chat = await response.json();
        state.chats.unshift(chat);
        state.currentChatId = chat.id;
        renderChatList();
        loadChat(chat.id);
    } catch (error) {
        console.error('Error creating new chat:', error);
    }
}

async function loadChat(chatId) {
    try {
        const response = await fetch(`/chats/${chatId}`);
        const chat = await response.json();
        
        if (!response.ok) {
            throw new Error('Failed to load chat');
        }
        
        state.currentChatId = chatId;
        elements.chatTitle.value = chat.title || '';
        elements.systemPrompt.value = chat.system_prompt || '';
        if (elements.modelSelect) {
            elements.modelSelect.value = chat.model || 'gpt-4o-mini';
        }
        
        renderMessages(chat.messages || []);
        updateActiveChatItem();
    } catch (error) {
        console.error('Error loading chat:', error);
        alert('載入聊天失敗');
    }
}

// 渲染相關函數
function renderChatList() {
    elements.chatList.innerHTML = '';
    state.chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${chat.id === state.currentChatId ? 'active' : ''}`;
        chatItem.dataset.id = chat.id;  // 添加 data-id 屬性
        
        // 分開創建標題和操作按鈕，避免點擊衝突
        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title || '新對話';
        titleSpan.onclick = (e) => {
            e.stopPropagation();  // 防止事件冒泡
            loadChat(chat.id);
        };
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();  // 防止事件冒泡
            deleteChat(chat.id);
        };
        
        actionsDiv.appendChild(deleteBtn);
        chatItem.appendChild(titleSpan);
        chatItem.appendChild(actionsDiv);
        
        // 整個項目的點擊事件
        chatItem.onclick = () => loadChat(chat.id);
        
        elements.chatList.appendChild(chatItem);
    });
}

function updateActiveChatItem() {
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === state.currentChatId) {
            item.classList.add('active');
        }
    });
}

// 設定相關函數
async function updateChatSettings() {
    if (!state.currentChatId) return;
    
    try {
        const response = await fetch(`/chats/${state.currentChatId}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                system_prompt: elements.systemPrompt.value,
                model: elements.modelSelect ? elements.modelSelect.value : 'gpt-4o-mini'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update settings');
        }
        
        elements.settingsModal.style.display = 'none';
        await loadChats();
    } catch (error) {
        console.error('Error updating settings:', error);
        alert('更新設定失敗');
    }
}

// 修改發送消息函數
async function sendMessage() {
    if (!state.currentChatId) {
        alert('請先選擇或創建一個聊天');
        return;
    }

    const userMessage = elements.textInput.value.trim();
    const files = elements.fileInput.files;

    if (!userMessage && files.length === 0) return;

    // 立即清空輸入框
    elements.textInput.value = '';
    elements.textInput.style.height = '24px';
    elements.fileInput.value = '';

    if (userMessage) {
        await sendTextMessage(userMessage);
    }

    if (files.length > 0) {
        await handleFileUpload(files);
    }
}

// 修改發送文本消息函數
async function sendTextMessage(message) {
    const userDiv = document.createElement('div');
    userDiv.className = 'message user-message';
    userDiv.innerHTML = formatMessageContent(message);
    elements.messages.appendChild(userDiv);

    const loadingDiv = createLoadingMessage();
    elements.messages.appendChild(loadingDiv);
    elements.messages.scrollTop = elements.messages.scrollHeight;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message,
                chatId: state.currentChatId
            })
        });
        const data = await response.json();

        loadingDiv.remove();

        const aiDiv = document.createElement('div');
        aiDiv.className = 'message ai-message';
        aiDiv.innerHTML = formatMessageContent(data.message);
        elements.messages.appendChild(aiDiv);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
        loadingDiv.remove();
        alert('AI 回應失敗，請重試');
    }
}

// 文件處理
async function handleFileUpload(files) {
    if (!state.currentChatId) {
        alert('請先選擇或創建一個聊天');
        return;
    }

    const formData = new FormData();
    Array.from(files).forEach(file => {
        console.log('準備上傳文件:', file.name, 'type:', file.type);  // 新增日誌
        formData.append('files', file);
    });
    formData.append('chatId', state.currentChatId);

    console.log('當前聊天ID:', state.currentChatId);  // 新增日誌
    
    try {
        const loadingDiv = createLoadingMessage('上傳檔案中');
        elements.messages.appendChild(loadingDiv);
        elements.messages.scrollTop = elements.messages.scrollHeight;

        console.log('開始發送上傳請求');  // 新增日誌
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        console.log('收到回應狀態:', response.status);  // 新增日誌

        if (!response.ok) {
            throw new Error(`上傳失敗，狀態碼: ${response.status}`);
        }

        const data = await response.json();
        console.log('上傳回應數據:', data);  // 新增日誌

        loadingDiv.remove();

        // 清除預覽
        elements.messages.querySelectorAll('.preview-container').forEach(preview => preview.remove());

        // 處理每個上傳的文件
        if (data.files && data.files.length > 0) {
            for (const file of data.files) {
                if (file.type.startsWith('image/')) {
                    // 創建圖片消息
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'message user-message';
                    imgContainer.innerHTML = `<img src="${file.url}" alt="${file.name}">`;
                    elements.messages.appendChild(imgContainer);

                    // 如果有分析結果，創建 AI 回應
                    if (file.analysis) {
                        const analysisDiv = document.createElement('div');
                        analysisDiv.className = 'message ai-message';
                        analysisDiv.textContent = file.analysis;
                        elements.messages.appendChild(analysisDiv);
                    }
                } else {
                    // 處理非圖片文件
                    const fileDiv = document.createElement('div');
                    fileDiv.className = 'message user-message';
                    fileDiv.innerHTML = `<a href="${file.url}" target="_blank">${file.name}</a>`;
                    elements.messages.appendChild(fileDiv);
                }
            }
        }

        elements.messages.scrollTop = elements.messages.scrollHeight;

    } catch (error) {
        console.error('上傳錯誤:', error);
        alert('檔案上傳失敗：' + error.message);
    }
}

// 事件監聽器設置
function setupEventListeners() {
    elements.newChatButton.addEventListener('click', createNewChat);
    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.style.display = 'block');
    elements.saveSettings.addEventListener('click', async () => {
        try {
            await updateChatSettings();
            elements.settingsModal.style.display = 'none';
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('儲存設定失敗');
        }
    });
    elements.cancelSettings.addEventListener('click', () => elements.settingsModal.style.display = 'none');
    elements.clearHistory.addEventListener('click', clearCurrentChat);
    elements.closeSettings.addEventListener('click', () => elements.settingsModal.style.display = 'none');
    
    // 保留原有的事件監聽器
    elements.textInput.addEventListener('input', () => autoGrow(elements.textInput));
    elements.textInput.addEventListener('keydown', handleEnterKey);
    elements.sendButton.addEventListener('click', sendMessage);
    elements.fileInput.addEventListener('change', async (event) => {
        console.log('檔案選擇事件觸發');  // 新增日誌
        const files = event.target.files;
        if (files.length > 0) {
            console.log('選擇了', files.length, '個檔案');  // 新增日誌
            await handleFileUpload(files);
        }
    });

    // 添加聊天標題變更的處理
    elements.chatTitle.addEventListener('change', async () => {
        if (!state.currentChatId) return;
        
        try {
            const response = await fetch(`/chats/${state.currentChatId}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: elements.chatTitle.value,
                    system_prompt: elements.systemPrompt.value,
                    model: elements.modelSelect ? elements.modelSelect.value : 'gpt-4o-mini'
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update chat title');
            }
            
            // 更新左側欄位
            await loadChats();
        } catch (error) {
            console.error('Error updating chat title:', error);
            alert('更新聊天標題失敗');
        }
    });
}

// 初始化
async function initialize() {
    setupEventListeners();
    await loadChats();
    if (state.chats.length === 0) {
        await createNewChat();
    } else {
        await loadChat(state.chats[0].id);
    }
}

// 啟動應用
initialize();

function autoGrow(element) {
    const container = document.getElementById('auto-grow-container');
    container.textContent = element.value + '\n';
    element.style.height = 'auto';
    element.style.height = Math.min(container.scrollHeight, 200) + 'px';
}

function handleEnterKey(e) {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            return;
        } else {
            e.preventDefault();
            sendMessage();
        }
    }
}

function handleFilePreview(e) {
    const files = e.target.files;
    const messages = document.getElementById('messages');
    
    // 移除舊的預覽
    const oldPreviews = messages.querySelectorAll('.preview-container');
    oldPreviews.forEach(preview => preview.remove());
    
    if (files.length > 0) {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        
        Array.from(files).forEach(file => {
            const preview = document.createElement('div');
            preview.className = 'file-preview';
            
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.onload = () => URL.revokeObjectURL(img.src);
                preview.appendChild(img);
            } else {
                const icon = document.createElement('div');
                icon.className = 'file-icon';
                icon.textContent = '📄';
                preview.appendChild(icon);
            }
            
            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = file.name;
            preview.appendChild(name);
            
            previewContainer.appendChild(preview);
        });
        
        messages.appendChild(previewContainer);
        messages.scrollTop = messages.scrollHeight;
    }
}

async function loadChatHistory() {
    try {
        const response = await fetch('/history');
        const data = await response.json();
        const messages = document.getElementById('messages');
        messages.innerHTML = '';
        
        data.history.forEach((msg, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`;
            messageDiv.dataset.id = index;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = formatMessageContent(msg.content);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            
            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.onclick = () => editMessage(index, msg.content);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.onclick = () => deleteMessage(index);
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(actionsDiv);
            messages.appendChild(messageDiv);
        });
        
        messages.scrollTop = messages.scrollHeight;
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function editMessage(id, content) {
    const newContent = prompt('編輯訊息:', content);
    if (newContent && newContent !== content) {
        try {
            const response = await fetch('/history/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id, content: newContent })
            });

            if (response.ok) {
                loadChatHistory();
            }
        } catch (error) {
            console.error('Error editing message:', error);
            alert('編輯訊息失敗，請重試');
        }
    }
}

async function deleteMessage(id) {
    if (confirm('確定要刪除這則訊息嗎？')) {
        try {
            const response = await fetch(`/history/delete/${id}`, {
                method: 'POST'
            });
            if (response.ok) {
                await loadChatHistory();  // 重新載入歷史
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            alert('刪除訊息失敗，請重試');
        }
    }
}

// 刪除歷史相關函數
async function clearHistory() {
    if (confirm('確定要清除所有聊天記錄嗎？')) {
        try {
            const response = await fetch('/history/delete', {
                method: 'POST'
            });
            if (response.ok) {
                elements.messages.innerHTML = '';
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            alert('清除歷史失敗，請重試');
        }
    }
}

// 刪除聊天相關函數
async function deleteChat(chatId) {
    if (!confirm('確定要刪除這個聊天嗎？')) return;
    
    try {
        const response = await fetch(`/chats/${chatId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Delete failed');
        }
        
        // 如果刪除的是當前聊天，清空當前聊天 ID
        if (chatId === state.currentChatId) {
            state.currentChatId = null;
            elements.messages.innerHTML = '';
            elements.chatTitle.value = '';
        }
        
        await loadChats();  // 重新載入聊天列表
        
        // 如果還有其他聊天，載入第一個
        if (state.chats.length > 0) {
            await loadChat(state.chats[0].id);
        }
    } catch (error) {
        console.error('Error deleting chat:', error);
        alert('刪除聊天失敗，請重試');
    }
}

// 清除當前聊天相關函數
async function clearCurrentChat() {
    if (confirm('確定要清除這個聊天的所有訊息嗎？')) {
        try {
            const response = await fetch(`/chats/${state.currentChatId}/clear`, {
                method: 'POST'
            });
            if (response.ok) {
                elements.messages.innerHTML = '';
            }
        } catch (error) {
            console.error('Error clearing current chat:', error);
            alert('清除當前聊天失敗，請重試');
        }
    }
}

function renderMessages(messages) {
    elements.messages.innerHTML = '';
    messages.forEach((msg, index) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`;
        messageDiv.dataset.id = index;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formatMessageContent(msg.content);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        if (msg.role === 'user') {
            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.onclick = () => editMessage(index, msg.content);
            actionsDiv.appendChild(editBtn);
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => deleteMessage(index);
        actionsDiv.appendChild(deleteBtn);
        
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(actionsDiv);
        elements.messages.appendChild(messageDiv);
    });
    
    elements.messages.scrollTop = elements.messages.scrollHeight;
} 