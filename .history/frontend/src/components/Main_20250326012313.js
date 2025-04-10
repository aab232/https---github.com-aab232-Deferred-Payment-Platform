import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Main = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch products when component mounts
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get('http://localhost:5000/api/products');
                if (response.data.success) {
                    setProducts(response.data.products); // Assuming the API returns products in a 'products' key
                } else {
                    console.log('No products found.');
                }
            } catch (error) {
                console.error('Error fetching products:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    return (
        <div style={styles.container}>
            <h1>Laptop Products</h1>
            {loading ? (
                <p>Loading products...</p>
            ) : (
                <div style={styles.productsContainer}>
                    {products.length === 0 ? (
                        <p>No products available.</p>
                    ) : (
                        <ul style={styles.productList}>
                            {products.map((product, index) => (
                                <li key={index} style={styles.productItem}>
                                    <a
                                        href={product.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={styles.productLink}
                                    >
                                        <h3>{product.title}</h3>
                                        <p>{product.price}</p>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

// Inline styles to center the products in the middle of the page
const styles = {
    container: {
        textAlign: 'center',
        marginTop: '50px',
    },
    productsContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    productList: {
        listStyleType: 'none',
        padding: '0',
    },
    productItem: {
        marginBottom: '20px',
        border: '1px solid #ddd',
        borderRadius: '5px',
        padding: '10px',
        width: '80%',
        maxWidth: '500px',
    },
    productLink: {
        textDecoration: 'none',
        color: '#333',
    },
};

export default Main;