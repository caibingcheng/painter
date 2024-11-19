import sqlite3
import os
import threading
from multiprocessing import Value

class Database:
    _instance = None
    _lock = threading.Lock()
    _creation_count = Value('i', 0)
    _db_path = "/tmp/data.db"

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super(Database, cls).__new__(cls, *args, **kwargs)
                    cls._instance._init_db()
        return cls._instance

    def _init_db(self):
        if os.path.exists(Database._db_path):
            os.remove(Database._db_path)
        self.conn = sqlite3.connect(Database._db_path, check_same_thread=False)
        self.c = self.conn.cursor()
        self.c.execute(
            """CREATE TABLE IF NOT EXISTS data (id INTEGER PRIMARY KEY, `values` TEXT)"""
        )
        self.c.execute(
            """CREATE TABLE IF NOT EXISTS version (id INTEGER PRIMARY KEY, version INTEGER)"""
        )
        self.c.execute("INSERT INTO version (version) VALUES (0)")
        self.conn.commit()
        with Database._creation_count.get_lock():
            Database._creation_count.value += 1

    def get_connection(self):
        return sqlite3.connect(Database._db_path, check_same_thread=False)

    def clear_db(self):
        with self.get_connection() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM data")
            c.execute("UPDATE version SET version = version + 1 WHERE id = 1")
            conn.commit()
        with Database._creation_count.get_lock():
            Database._creation_count.value += 1

    def insert_data(self, data):
        with self.get_connection() as conn:
            c = conn.cursor()
            if isinstance(data, list):
                for item in data:
                    c.execute("INSERT INTO data (`values`) VALUES (?)", (item,))
            else:
                c.execute("INSERT INTO data (`values`) VALUES (?)", (data,))
            conn.commit()

    def read_data(self):
        with self.get_connection() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM data")
            rows = c.fetchall()
            return rows

    def data_iterator(self, last_id=0):
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT version FROM version WHERE id = 1")
        initial_version = c.fetchone()[0]
        while True:
            c.execute("SELECT version FROM version WHERE id = 1")
            current_version = c.fetchone()[0]
            if current_version != initial_version:
                print(f"current_version: {current_version} initial_version: {initial_version}")
                break
            c.execute("SELECT * FROM data WHERE id > ?", (last_id,))
            rows = c.fetchall()
            if rows:
                last_id = rows[-1][0]
                yield [row[1] for row in rows]
            else:
                yield None

    def get_counter(self):
        with Database._creation_count.get_lock():
            return Database._creation_count.value

db = Database()
