import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SetupView from './views/SetupView';
import TheShowView from './views/TheShowView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SetupView />} />
        <Route path="/show" element={<TheShowView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
