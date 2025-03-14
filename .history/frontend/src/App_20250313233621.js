import React, { useState } from "react";
import Register from "./Register";
import Login from "./Login";

const App = () => {
    const [showLogin, setShowLogin] = useState(true);

    return (
        <div>
            <button onClick={() => setShowLogin(!showLogin)}>
                {showLogin ? "Go to Register" : "Go to Login"}
            </button>
            {showLogin ? <Login /> : <Register />}
        </div>
    );
};

export default App;