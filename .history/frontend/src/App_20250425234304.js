import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Register from './components/Register';
import Login from './components/Login';
import Main from './components/Main';
import Settings from './components/Settings';
import Privacy from './components/Privacy'; 
import Contact from './components/ContactUs';
import FAQ from './components/FAQ';
import Dashboard from './components/Dashboard';
import LinkAccount from './components/LinkAccount';
import CreditHistory from './components/CreditHistory';
import Repayment from './components/Repayment';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/main" element={<Main />} /> 
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/link-account" element={<LinkAccount />} />
        <Route path="/credit-history" element={<CreditHistory />} />
        <Route path="/repayment" element={<Repayment />} />
      </Routes>
    </Router>
  );
};

export default App;