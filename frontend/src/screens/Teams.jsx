import React, { useState } from 'react';
import { useStore, startBridge, respondToBridgeInvite } from '../api.js';
import { 
  Box, 
  Typography, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  ListItemText,
  OutlinedInput,
  Snackbar,
  Alert,
  Chip
} from '@mui/material';
import { VideoCall as VideoCallIcon, Check as CheckIcon, Close as CloseIcon, Link as LinkIcon } from '@mui/icons-material';

export function TeamsScreen({ currentUser }) {
  const store = useStore();
  const isAdmin = currentUser.role === 'admin';
  const users = store.users || [];
  const engineers = users.filter(u => u.role === 'engineer');
  const criticalIncidents = (store.incidents || []).filter(i => 
    i.status !== 'CLOSED' && i.status !== 'RESOLVED' && (i.severity === 'CRITIC' || i.severity === 'HIGH')
  );

  const invites = store.bridgeInvites || [];

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  
  // Form State
  const [selectedIncident, setSelectedIncident] = useState('');
  const [selectedEngineers, setSelectedEngineers] = useState([]);

  const handleCreateBridge = async () => {
    if (!selectedIncident || selectedEngineers.length === 0) {
      setToast({ open: true, message: 'Please select an incident and at least one engineer.', severity: 'warning' });
      return;
    }
    try {
      await startBridge(selectedIncident, selectedEngineers);
      setToast({ open: true, message: 'Bridge call created and invites sent!', severity: 'success' });
      setSelectedIncident('');
      setSelectedEngineers([]);
    } catch (err) {
      setToast({ open: true, message: err.message || 'Failed to create bridge call', severity: 'error' });
    }
  };

  const handleRespond = async (id, status) => {
    try {
      await respondToBridgeInvite(id, status);
      setToast({ open: true, message: `Invite ${status}!`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message || 'Failed to respond', severity: 'error' });
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Teams &amp; On-Call
      </Typography>

      {isAdmin && (
        <Paper elevation={2} sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Create Bridge Call
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Select a critical incident and invite engineers to join an emergency bridge call.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Incident</InputLabel>
              <Select
                value={selectedIncident}
                onChange={(e) => setSelectedIncident(e.target.value)}
                label="Incident"
              >
                {criticalIncidents.map(inc => (
                  <MenuItem key={inc.id} value={inc.id}>
                    #{inc.id} - {inc.title}
                  </MenuItem>
                ))}
                {criticalIncidents.length === 0 && (
                  <MenuItem value="" disabled>No open critical incidents</MenuItem>
                )}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 250 }}>
              <InputLabel>Invite Engineers</InputLabel>
              <Select
                multiple
                value={selectedEngineers}
                onChange={(e) => setSelectedEngineers(e.target.value)}
                input={<OutlinedInput label="Invite Engineers" />}
                renderValue={(selected) => selected.map(id => {
                  const e = engineers.find(u => u.id === id);
                  return e ? (e.name || e.username) : id;
                }).join(', ')}
              >
                {engineers.map((e) => (
                  <MenuItem key={e.id} value={e.id}>
                    <Checkbox checked={selectedEngineers.indexOf(e.id) > -1} />
                    <ListItemText primary={e.name || e.username} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button 
              variant="contained" 
              color="error" 
              startIcon={<VideoCallIcon />}
              onClick={handleCreateBridge}
              sx={{ height: 56 }}
            >
              Dispatch Bridge Call
            </Button>
          </Box>
        </Paper>
      )}

      {!isAdmin && (
        <Paper elevation={2} sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Pending Bridge Calls
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Incident ID</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Link</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      No active bridge call invites.
                    </TableCell>
                  </TableRow>
                ) : (
                  invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>#{inv.incident_id}</TableCell>
                      <TableCell>
                        <Chip 
                          label={inv.invite_status.toUpperCase()} 
                          color={inv.invite_status === 'accepted' ? 'success' : inv.invite_status === 'pending' ? 'warning' : 'default'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell>
                        {inv.invite_status === 'accepted' ? (
                          <Button 
                            href={inv.link} 
                            target="_blank" 
                            startIcon={<LinkIcon />}
                            variant="outlined"
                            size="small"
                          >
                            Join Call
                          </Button>
                        ) : (
                          <Typography variant="body2" color="text.secondary">Accept to view link</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {inv.invite_status === 'pending' && (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button 
                              size="small" 
                              color="success" 
                              variant="contained"
                              onClick={() => handleRespond(inv.id, 'accepted')}
                              startIcon={<CheckIcon />}
                            >
                              Accept
                            </Button>
                            <Button 
                              size="small" 
                              color="error" 
                              variant="outlined"
                              onClick={() => handleRespond(inv.id, 'declined')}
                              startIcon={<CloseIcon />}
                            >
                              Decline
                            </Button>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Snackbar 
        open={toast.open} 
        autoHideDuration={6000} 
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
