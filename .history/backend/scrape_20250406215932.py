from flask import Flask, jsonify
import mysql.connector
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Connect to MySQL database
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="353txRQ8",
        database="dpp_db"
    )

@app.route('/api/products', methods=['GET'])
def get_currys_products():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Corrected query to match your table's column names
    cursor.execute("SELECT title, price, link FROM currys_laptops")
    currys_data = cursor.fetchall()

    cursor.close()
    conn.close()

    return jsonify({'products': currys_data})

if __name__ == '__main__':
    app.run(debug=True)