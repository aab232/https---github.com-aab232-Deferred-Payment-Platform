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
                setProducts(response.data.products); // Assuming the API returns products in a 'products' key
            } catch (error) {
                console.error('Error fetching products: ', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    return (
        <div>
            <h1>Laptop Products</h1>
            {loading ? (
                <p>Loading products...</p>
            ) : (
                <div>
                    {products.length === 0 ? (
                        <p>No products available.</p>
                    ) : (
                        <ul>
                            {products.map((product, index) => (
                                <li key={index}>
                                    <a href={product.link} target="_blank" rel="noopener noreferrer">
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

export default Main;