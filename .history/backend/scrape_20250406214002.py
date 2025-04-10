from flask import Flask, jsonify
import mysql.connector
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup

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

# Function to scrape data from Currys website and insert into MySQL
def scrape_laptops():
    url = 'https://www.currys.co.uk/gbuk/laptops-uk-501-c.html'  # Adjust URL if needed
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Example scraping (adjust based on actual HTML structure)
    laptops = soup.find_all('div', class_='product-list-item')  # Adjust this selector

    conn = get_db_connection()
    cursor = conn.cursor()

    for laptop in laptops:
        name = laptop.find('h3').get_text(strip=True)
        price = laptop.find('span', class_='price').get_text(strip=True)  # Adjust this
        image = laptop.find('img')['src']
        link = laptop.find('a')['href']

        # Insert data into the currys_laptops table
        cursor.execute('''INSERT INTO currys_laptops (name, price, img, link)
                          VALUES (%s, %s, %s, %s)''', (name, price, image, link))

    conn.commit()
    cursor.close()
    conn.close()

# API route to fetch products
@app.route('/api/products', methods=['GET'])
def get_currys_products():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT name, price, img, link FROM currys_laptops")
    currys_data = cursor.fetchall()

    cursor.close()
    conn.close()

    return jsonify({'products': currys_data})

if __name__ == '__main__':
    scrape_laptops()  # Scrape and insert data into the database before running the server
    app.run(debug=True)