import { useState } from 'react';
import './App.css';
import axios from 'axios';

const App = () => {
  const [form, setForm] = useState({ firstName: '', surname: '', email: '', password: '', mobileNumber: '', niNumber: '', dob: '' });
  const [isLogin, setIsLogin] = useState(true);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = isLogin ? 'http://localhost:5000/login' : 'http://localhost:5000/register';
      const { data } = await axios.post(url, form);
      alert(data.message);
    } catch (error) {
      alert(error.response?.data?.message || 'Something went wrong.');
    }
  };

  return (
    <div className="container">
      <h1>{isLogin ? 'Login' : 'Register'}</h1>
      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <>
            <input type="text" name="firstName" placeholder="First Name" onChange={handleChange} required />
            <input type="text" name="surname" placeholder="Surname" onChange={handleChange} required />
            <input type="date" name="dob" onChange={handleChange} required />
            <input type="text" name="niNumber" placeholder="NI Number" onChange={handleChange} required />
            <input type="text" name="mobileNumber" placeholder="Mobile (Optional)" onChange={handleChange} />
          </>
        )}
        <input type="email" name="email" placeholder="Email" onChange={handleChange} required />
        <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
        <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
      </form>
      <p onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'No account? Register' : 'Have an account? Login'}</p>
    </div>
  );
};

export default App;