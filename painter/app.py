import json
import socket
import threading
from flask import Flask, send_from_directory, Response, g
from painter.db import db
import queue
import time
import os

app = Flask(__name__)
input_client_connected = False
input_client_lock = threading.Lock()

def get_db():
    if 'db' not in g:
        g.db = db
    return g.db

# 处理客户端连接
def handle_client_connection(client_socket):
    global input_client_connected
    with input_client_lock:
        if input_client_connected:
            print("Another input client is already connected. Closing connection.")
            client_socket.close()
            return
        input_client_connected = True

    peername = client_socket.getpeername()
    print(f"Received connection from {peername}")
    with app.app_context():
        get_db().clear_db()  # 清空数据库
        print(f"Database cleared {get_db().get_counter()}")
    def yield_client_input(client_socket):
        while True:
            data = client_socket.recv(1024)
            if not data:
                break
            yield data.decode('utf-8')
    try:
        tail = ''
        for data in yield_client_input(client_socket):
            combined_data = tail + data
            end_with_newline = combined_data.endswith('\n')
            tokens = combined_data.split('\n')
            tail = tokens[-1] if not end_with_newline else ''
            tokens = tokens[:-1] if not end_with_newline else tokens
            # remove empty strings
            tokens = list(filter(None, tokens))
            with app.app_context():
                get_db().insert_data(tokens)
    except Exception as e:
        print(f"Error handling client connection: {e}")
    finally:
        print(f"Connection from {peername} closed")
        client_socket.close()
        with input_client_lock:
            input_client_connected = False

# 启动服务器
def start_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 5001))
    server.listen(100)  # 增加监听队列的大小
    print("Server listening on port 5001")
    while True:
        client_sock, addr = server.accept()
        client_handler = threading.Thread(
            target=handle_client_connection,
            args=(client_sock,)
        )
        client_handler.start()

@app.route('/')
def index():
    return send_from_directory(os.path.join(app.root_path, 'templates'), 'index.html')

@app.route('/script.js')
def script():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'script.js')

@app.route('/events')
def events():
    def event_stream():
        with app.app_context():
            db_instance = get_db()
            while True:
                yield f'data: reset\n\n'
                for data in db_instance.data_iterator(0):
                    if data is None:
                        time.sleep(0.1)  # 添加短暂的睡眠以避免高 CPU 占用
                        continue
                    yield f'data: {json.dumps(data)}\n\n'
                print("Data iterator exhausted. Resetting.")
    return Response(event_stream(), content_type='text/event-stream')

def main():
    threading.Thread(target=start_server).start()
    app.run(debug=False, port=5000, threaded=False)

if __name__ == '__main__':
    main()
