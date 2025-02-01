from flask import Flask, render_template, request, jsonify, send_from_directory, session
from werkzeug.utils import secure_filename
import os
import base64
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime
import uuid
import json
from pathlib import Path

# 初始化設定
load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', os.urandom(24))

# 常數設定
UPLOAD_FOLDER = Path(__file__).parent / 'uploads'
CHAT_HISTORY_DIR = Path(__file__).parent / 'chat_histories'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

# 確保目錄存在
UPLOAD_FOLDER.mkdir(exist_ok=True)
CHAT_HISTORY_DIR.mkdir(exist_ok=True)

# 設定 Flask
app.config.update(
    UPLOAD_FOLDER=str(UPLOAD_FOLDER),
    MAX_CONTENT_LENGTH=MAX_CONTENT_LENGTH
)

# 初始化 OpenAI 客戶端
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_filename(original_filename):
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    short_uuid = str(uuid.uuid4())[:8]
    ext = Path(original_filename).suffix.lower()
    return f"{timestamp}_{short_uuid}{ext}"

def format_response(text):
    """格式化 AI 回應，添加適當的換行和縮進"""
    # 分割成段落
    paragraphs = text.split('\n\n')
    formatted_paragraphs = []
    
    for paragraph in paragraphs:
        # 處理程式碼區塊
        if '```' in paragraph:
            formatted_paragraphs.append(paragraph)
            continue
            
        # 一般文字的處理
        lines = []
        current_line = []
        words = paragraph.split()
        line_length = 0
        
        for word in words:
            word_length = len(word)
            if line_length + word_length + 1 <= 40:  # 設定每行最大字元數
                current_line.append(word)
                line_length += word_length + 1
            else:
                lines.append(' '.join(current_line))
                current_line = [word]
                line_length = word_length
        
        if current_line:
            lines.append(' '.join(current_line))
        
        formatted_paragraphs.append('\n'.join(lines))
    
    return '\n\n'.join(formatted_paragraphs)

def load_chat_history(session_id):
    history_file = CHAT_HISTORY_DIR / f"{session_id}.json"
    if history_file.exists():
        return json.loads(history_file.read_text(encoding='utf-8'))
    return []

def save_chat_history(session_id, history):
    history_file = CHAT_HISTORY_DIR / f"{session_id}.json"
    history_file.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')

# 添加新的數據結構和路由
class Chat:
    def __init__(self, id, title="新對話", system_prompt=None, model="gpt-4o-mini"):
        self.id = id
        self.title = title
        self.system_prompt = system_prompt or """你是一個友善的 AI 幫手，請使用繁體中文回答。
            回答時請注意以下格式：
            1. 每段文字不超過 40 個字元
            2. 段落之間使用空行分隔
            3. 如果是列表，每個項目獨立一行
            4. 程式碼區塊使用 ``` 包圍
            5. 保持適當的縮排"""
        self.model = model
        self.messages = []

# 修改現有的路由和添加新的路由
@app.route('/chats', methods=['GET'])
def get_chats():
    """獲取所有聊天列表"""
    chat_files = list(CHAT_HISTORY_DIR.glob('*.json'))
    chats = []
    
    for file in chat_files:
        chat_id = file.stem
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            chats.append({
                'id': chat_id,
                'title': data.get('title', '新對話'),
                'lastMessage': data['messages'][-1]['content'] if data['messages'] else '',
                'timestamp': data['messages'][-1]['timestamp'] if data['messages'] else ''
            })
    
    return jsonify({"chats": chats})

@app.route('/chats/new', methods=['POST'])
def create_chat():
    """創建新的聊天"""
    chat_id = str(uuid.uuid4())
    chat = Chat(chat_id)
    save_chat(chat)
    return jsonify({
        "id": chat_id,
        "title": chat.title,
        "system_prompt": chat.system_prompt,
        "model": chat.model
    })

@app.route('/chats/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    """獲取特定聊天的內容"""
    chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
    if not chat_file.exists():
        return jsonify({"error": "聊天不存在"}), 404
    
    with open(chat_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)

@app.route('/chats/<chat_id>/settings', methods=['PUT'])
def update_chat_settings(chat_id):
    """更新聊天設定"""
    data = request.json
    chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
    
    if not chat_file.exists():
        return jsonify({"error": "聊天不存在"}), 404
    
    with open(chat_file, 'r', encoding='utf-8') as f:
        chat_data = json.load(f)
    
    chat_data['title'] = data.get('title', chat_data.get('title'))
    chat_data['system_prompt'] = data.get('system_prompt', chat_data.get('system_prompt'))
    chat_data['model'] = data.get('model', chat_data.get('model'))
    
    with open(chat_file, 'w', encoding='utf-8') as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)
    
    return jsonify({"status": "success"})

@app.route('/chat', methods=['POST'])
def chat():
    """發送消息到特定聊天"""
    try:
        data = request.json
        user_message = data.get('message')
        chat_id = data.get('chatId')
        
        if not chat_id:
            return jsonify({"error": "未指定聊天 ID"}), 400
        
        chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
        if not chat_file.exists():
            return jsonify({"error": "聊天不存在"}), 404
        
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        
        # 添加用戶消息
        chat_data['messages'].append({
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        })
        
        # 使用聊天特定的設定
        response = client.chat.completions.create(
            model=chat_data.get('model', 'gpt-4o-mini'),
            messages=[{
                "role": "system",
                "content": chat_data.get('system_prompt', '')
            }] + chat_data['messages']
        )
        
        ai_response = response.choices[0].message.content
        
        # 添加 AI 回應
        chat_data['messages'].append({
            "role": "assistant",
            "content": ai_response,
            "timestamp": datetime.now().isoformat()
        })
        
        # 保存更新後的聊天記錄
        with open(chat_file, 'w', encoding='utf-8') as f:
            json.dump(chat_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({"message": ai_response})
        
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return jsonify({"error": "無法取得 AI 回應"}), 500

def save_chat(chat):
    """保存聊天數據"""
    chat_file = CHAT_HISTORY_DIR / f"{chat.id}.json"
    chat_data = {
        "id": chat.id,
        "title": chat.title,
        "system_prompt": chat.system_prompt,
        "model": chat.model,
        "messages": []
    }
    
    with open(chat_file, 'w', encoding='utf-8') as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({"error": "文件不存在"}), 404

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'files' not in request.files:
            return jsonify({"error": "沒有檔案"}), 400
            
        chat_id = request.form.get('chatId')
        if not chat_id:
            return jsonify({"error": "未提供聊天 ID"}), 400

        chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
        if not chat_file.exists():
            return jsonify({"error": "聊天不存在"}), 404

        # 讀取聊天設定
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        
        # 獲取聊天的 system prompt
        system_prompt = chat_data.get('system_prompt', "你是一個專業的影像分析 AI，請以繁體中文詳細描述圖片內容。")
        model = chat_data.get('model', "gpt-4o-mini")

        files = request.files.getlist('files')
        responses = []

        for file in files:
            if file and allowed_file(file.filename):
                try:
                    filename = secure_filename(file.filename)
                    saved_filename = generate_filename(filename)
                    filepath = UPLOAD_FOLDER / saved_filename
                    
                    file.save(str(filepath))
                    
                    if file.content_type.startswith('image/'):
                        with open(filepath, "rb") as image_file:
                            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
                            
                        response = client.chat.completions.create(
                            model=model,  # 使用聊天設定的模型
                            messages=[
                                {
                                    "role": "system",
                                    "content": system_prompt  # 使用聊天設定的 system prompt
                                },
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "text", "text": "請描述這張圖片的內容："},
                                        {
                                            "type": "image_url",
                                            "image_url": {
                                                "url": f"data:{file.content_type};base64,{base64_image}"
                                            }
                                        }
                                    ]
                                }
                            ],
                            max_tokens=500
                        )
                        
                        analysis = response.choices[0].message.content

                        chat_data['messages'].append({
                            "role": "user",
                            "content": f'<img src="/uploads/{saved_filename}" alt="{filename}" style="max-width: 100%;">',
                            "timestamp": datetime.now().isoformat()
                        })
                        
                        chat_data['messages'].append({
                            "role": "assistant",
                            "content": analysis,
                            "timestamp": datetime.now().isoformat()
                        })
                        
                        with open(chat_file, 'w', encoding='utf-8') as f:
                            json.dump(chat_data, f, ensure_ascii=False, indent=2)
                        
                        responses.append({
                            "name": filename,
                            "url": f"/uploads/{saved_filename}",
                            "type": file.content_type,
                            "analysis": analysis
                        })
                    else:
                        responses.append({
                            "name": filename,
                            "url": f"/uploads/{saved_filename}",
                            "type": file.content_type,
                            "analysis": "文件已上傳"
                        })

                except Exception as e:
                    continue

        return jsonify({"files": responses})

    except Exception as e:
        return jsonify({"error": f"上傳失敗：{str(e)}"}), 500

@app.route('/history', methods=['GET'])
def get_history():
    session_id = session.get('session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
    
    history = load_chat_history(session_id)
    return jsonify({"history": history})

@app.route('/history/delete', methods=['POST'])
def delete_history():
    session_id = session.get('session_id')
    if session_id:
        history_file = CHAT_HISTORY_DIR / f"{session_id}.json"
        if history_file.exists():
            history_file.unlink()
        session['chat_history'] = []
    return jsonify({"status": "success"})

@app.route('/history/edit', methods=['POST'])
def edit_history():
    data = request.json
    message_id = data.get('id')
    new_content = data.get('content')
    session_id = session.get('session_id')
    
    if session_id and message_id is not None:
        history = load_chat_history(session_id)
        if 0 <= message_id < len(history):
            # 檢查是否是用戶訊息
            if history[message_id]['role'] == 'user':
                # 更新用戶訊息
                history[message_id]['content'] = new_content
                # 移除這條訊息之後的所有訊息（包括 AI 的回應）
                history = history[:message_id + 1]
                save_chat_history(session_id, history)
                session['chat_history'] = history
                return jsonify({"status": "success"})
            
    return jsonify({"error": "無法編輯訊息"}), 400

@app.route('/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """刪除特定聊天"""
    try:
        chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
        if chat_file.exists():
            chat_file.unlink()  # 刪除檔案
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Error deleting chat: {str(e)}")
        return jsonify({"error": "刪除聊天失敗"}), 500

@app.route('/chats/<chat_id>/clear', methods=['POST'])
def clear_chat(chat_id):
    """清除特定聊天的所有訊息"""
    try:
        chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
        if chat_file.exists():
            with open(chat_file, 'r', encoding='utf-8') as f:
                chat_data = json.load(f)
            
            # 保留設定但清除訊息
            chat_data['messages'] = []
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, ensure_ascii=False, indent=2)
                
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Error clearing chat: {str(e)}")
        return jsonify({"error": "清除聊天失敗"}), 500

@app.route('/chats/<chat_id>/upload', methods=['POST'])
def upload_to_chat(chat_id):
    try:
        if 'files' not in request.files:
            return jsonify({"error": "沒有檔案"}), 400

        chat_file = CHAT_HISTORY_DIR / f"{chat_id}.json"
        if not chat_file.exists():
            return jsonify({"error": "聊天不存在"}), 404

        files = request.files.getlist('files')
        
        responses = []
        for file in files:
            if file and allowed_file(file.filename):
                try:
                    filename = secure_filename(file.filename)
                    saved_filename = generate_filename(filename)
                    filepath = UPLOAD_FOLDER / saved_filename
                    
                    file.save(str(filepath))
                    
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        chat_data = json.load(f)
                    
                    if file.content_type.startswith('image/'):
                        responses.append({
                            "name": filename,
                            "url": f"/uploads/{saved_filename}",
                            "type": file.content_type,
                            "analysis": "圖片已上傳"
                        })
                        
                        chat_data['messages'].append({
                            "role": "user",
                            "content": f'<img src="/uploads/{saved_filename}" alt="{filename}">',
                            "timestamp": datetime.now().isoformat()
                        })
                    else:
                        responses.append({
                            "name": filename,
                            "url": f"/uploads/{saved_filename}",
                            "type": file.content_type,
                            "analysis": "文件已上傳"
                        })
                        
                        chat_data['messages'].append({
                            "role": "user",
                            "content": f'<a href="/uploads/{saved_filename}" target="_blank">{filename}</a>',
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    with open(chat_file, 'w', encoding='utf-8') as f:
                        json.dump(chat_data, f, ensure_ascii=False, indent=2)
                        
                except Exception as e:
                    continue

        return jsonify({"files": responses})

    except Exception as e:
        return jsonify({"error": f"上傳失敗：{str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=3000) 