import React, { useState } from 'react';
import { login, useStore } from '../api.js';
import { 
  Box, 
  Container, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  Alert, 
  AppBar, 
  Toolbar, 
  Chip,
  IconButton
} from '@mui/material';
import { Settings as SettingsIcon, Refresh as RefreshIcon } from '@mui/icons-material';

export function LoginScreen({ onSettings, onRetry }) {
  const store = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const conn = store.connection;
  const connStatusColor = conn.status === 'connected' ? 'success' : conn.status === 'connecting' ? 'warning' : 'error';
  const connLabel = conn.status === 'connected' ? 'API' : conn.status === 'connecting' ? 'connecting' : 'offline';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'white' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            Watchdogs<span style={{ color: '#aaa' }}>__</span>
          </Typography>
          <Chip 
            label={connLabel} 
            color={connStatusColor} 
            size="small" 
            onClick={onSettings}
            sx={{ cursor: 'pointer' }}
          />
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="sm" sx={{ mt: 8, mb: 4, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h4" fontWeight="bold" gutterBottom>
          Sign in
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Use your Watchdogs account to continue.
        </Typography>

        <Paper elevation={2} sx={{ p: 4, width: '100%', borderRadius: 2 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
              <Button
                type="submit"
                variant="contained"
                disabled={busy}
                size="large"
                sx={{ px: 4 }}
              >
                {busy ? 'Signing in...' : 'Sign In'}
              </Button>
              <Box>
                <IconButton onClick={onRetry} title="Retry API connection" size="small" sx={{ mr: 1 }}>
                  <RefreshIcon />
                </IconButton>
                <IconButton onClick={onSettings} title="Settings" size="small">
                  <SettingsIcon />
                </IconButton>
              </Box>
            </Box>
          </Box>
        </Paper>

        {conn.status === 'disconnected' && (
          <Alert severity="warning" sx={{ mt: 4, width: '100%' }}>
            <Typography variant="subtitle2" fontWeight="bold">Backend unreachable</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>{conn.error}</Typography>
            <Box sx={{ bgcolor: 'rgba(0,0,0,0.05)', p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
              # 1. Database + broker<br/>
              docker compose up -d<br/><br/>
              # 2. API<br/>
              cd backend && uvicorn api:app --reload
            </Box>
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 4, fontFamily: 'monospace' }}>
          target: {store.base}
        </Typography>
      </Container>
    </Box>
  );
}
