import json
import socket
import threading
from flask import Flask, Response, request, render_template
import os
import argparse
import webbrowser  # 添加此行
import signal  # 添加此行

app = Flask(__name__)


class DataStore:
    data_store_ = []
    data_lock_ = threading.Lock()
    data_notifier_ = threading.Condition(data_lock_)
    data_version_ = 0

    @staticmethod
    def clear():
        with DataStore.data_lock_:
            DataStore.data_store_ = []
            DataStore.data_version_ += 1
            DataStore.data_notifier_.notify_all()

    @staticmethod
    def insert(tokens):
        with DataStore.data_lock_:
            DataStore.data_store_.extend(tokens)
            DataStore.data_notifier_.notify_all()

    @staticmethod
    def data():
        last_index = 0
        version = DataStore.data_version_
        while True:
            data_batch = []
            with DataStore.data_notifier_:
                DataStore.data_notifier_.wait_for(
                    lambda: last_index < len(DataStore.data_store_)
                    or version != DataStore.data_version_
                )
            with DataStore.data_lock_:
                if version != DataStore.data_version_:
                    break
                if last_index < len(DataStore.data_store_):
                    data_batch = DataStore.data_store_[last_index:].copy()
                    last_index = len(DataStore.data_store_)
            if data_batch:
                yield data_batch
        print("Data store modified. Resetting iterator.")


class DataServer:
    client_connected_ = False
    client_lock_ = threading.Lock()

    # 处理客户端连接
    @staticmethod
    def client_connection(client_socket):
        with DataServer.client_lock_:
            if DataServer.client_connected_:
                print("Another input client is already connected. Closing connection.")
                client_socket.close()
                return
            DataServer.client_connected_ = True

        peername = client_socket.getpeername()
        print(f"Received connection from {peername}")
        with app.app_context():
            DataStore.clear()  # 清空数据存储
            print(f"Data store cleared")

        def yield_client_input(client_socket):
            while True:
                data = client_socket.recv(1024)
                if not data:
                    break
                yield data.decode("utf-8")

        try:
            tail = ""
            for data in yield_client_input(client_socket):
                combined_data = tail + data
                end_with_newline = combined_data.endswith("\n")
                tokens = combined_data.split("\n")
                tail = tokens[-1] if not end_with_newline else ""
                tokens = tokens[:-1] if not end_with_newline else tokens
                # remove empty strings
                tokens = list(filter(None, tokens))
                with app.app_context():
                    DataStore.insert(tokens)
        except Exception as e:
            print(f"Error handling client connection: {e}")
        finally:
            print(f"Connection from {peername} closed")
            client_socket.close()
            with DataServer.client_lock_:
                DataServer.client_connected_ = False

    # 启动服务器
    @staticmethod
    def start(data_port):
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", data_port))
        server.listen(100)  # 增加监听队列的大小
        print(f"Server listening on port {data_port}")
        while True:
            client_sock, addr = server.accept()
            client_handler = threading.Thread(
                target=DataServer.client_connection, args=(client_sock,)
            )
            client_handler.start()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/events")
def events():
    def event_stream():
        while True:
            yield f"data: reset\n\n"
            for data in DataStore.data():
                assert data is not None
                yield f"data: {json.dumps(data)}\n\n"
            print("Data iterator exhausted. Resetting.")

    return Response(event_stream(), content_type="text/event-stream")


@app.route("/shutdown", methods=["POST"])
def shutdown():
    def shutdown_server():
        func = request.environ.get("werkzeug.server.shutdown")
        if func is None:
            raise RuntimeError("Not running with the Werkzeug Server")
        func()

    shutdown_server()
    return "Server shutting down..."


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-port", type=int, default=5000)
    parser.add_argument("--data-port", type=int, default=5001)
    args = parser.parse_args()

    threading.Thread(target=DataServer.start, args=(args.data_port,)).start()

    # 启动内置浏览器
    webbrowser.open(f"http://localhost:{args.web_port}/")

    # 添加对SIGINT信号的处理
    def signal_handler(sig, frame):
        print("Exiting...")
        os._exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    app.run(debug=False, port=args.web_port, threaded=False)


if __name__ == "__main__":
    main()
