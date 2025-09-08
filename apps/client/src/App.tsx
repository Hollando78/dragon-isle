import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainMenu } from './components/MainMenu';
import { GameView } from './components/GameView';
import { useGameStore } from './state/gameStore';
import { registerServiceWorker } from './services/pwa';

export function App() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/game" element={<GameView />} />
      </Routes>
    </BrowserRouter>
  );
}