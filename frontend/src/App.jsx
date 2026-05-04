import { useState } from 'react';

export function App() {
  const [page, setPage] = useState('dash');

  return (
    <div className="app">
      <h1>Watchdogs</h1>
      <p>Dashboard în construcție...</p>
      <p>Pagina curentă: {page}</p>
    </div>
  );
}